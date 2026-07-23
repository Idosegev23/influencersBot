// lookupOrder facade (spec §7.1): brand_orders → connector.pull (live) → phone-verify → Focus enrich.
// Side-effect imports register the adapters so getConnector() can resolve them.
import './connectors/quickshop';
import './connectors/shopify';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getConnector } from './connectors/registry';
import { findBrandOrderByNumber, findBrandOrdersByPhone, upsertBrandOrder, type BrandOrderRow } from './brand-orders';
import { phoneMatches } from './phone-verify';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import type { NormalizedLineItem, NormalizedOrder, OrderConnectorCreds, StorePlatform } from './connectors/types';
import type { OrderLookupResult } from '@/lib/shopify/order-lookup';
import { getFocusShipmentStatus, type FocusCustomerStatusView } from '@/lib/shipment/focus-client';

export type OrderLookupOutcome =
  // `kind` is the discriminator; the REAL order status remains on OrderLookupResult.status.
  | (OrderLookupResult & { kind: 'found'; lineItems?: NormalizedLineItem[]; shipment?: FocusCustomerStatusView | null })
  | { kind: 'not_found' }
  | { kind: 'ambiguous' }
  | { kind: 'unverified' };

async function loadConfig(accountId: string): Promise<any> {
  const { data, error } = await supabaseAdmin.from('accounts').select('config').eq('id', accountId).single();
  if (error || !data) return {};
  return (data as any).config || {};
}

function credsFor(platform: StorePlatform, config: any): OrderConnectorCreds {
  const integrations = config?.integrations || {};
  if (platform === 'shopify') {
    const s = integrations.shopify || {};
    return { platform, shopDomain: s.shop_domain, adminApiToken: s.admin_api_token };
  }
  const q = integrations.quickshop || {};
  return { platform, apiKey: q.api_key, webhookSecret: q.webhook_secret };
}

function itemSummary(items: NormalizedLineItem[]): string | undefined {
  if (!items.length) return undefined;
  return items.slice(0, 4).map((i) => `${i.quantity}× ${i.name}`).join(', ')
    + (items.length > 4 ? `, +${items.length - 4} more` : '');
}

// A terminal ORDER status (cancelled/refunded) must NOT be masked by the fulfillment status: a
// cancelled order is "unfulfilled" too, and reporting "unfulfilled" reads to the shopper as "not
// shipped yet / on its way" — the opposite of the truth. So surface the order status when terminal,
// otherwise fall back to fulfillment status (the useful signal for a live order). Live-observed
// 2026-07-23: cancelled orders were reported to a shopper as "not shipped yet".
const TERMINAL_ORDER_STATUS = new Set(['cancelled', 'canceled', 'refunded', 'voided']);
function displayStatus(orderStatus: string | null | undefined, fulfillmentStatus: string | null | undefined): string | undefined {
  if (orderStatus && TERMINAL_ORDER_STATUS.has(orderStatus.toLowerCase())) return orderStatus;
  return fulfillmentStatus || orderStatus || undefined;
}

function toResult(o: NormalizedOrder): OrderLookupResult & { lineItems: NormalizedLineItem[] } {
  return {
    found: true,
    orderNumber: o.orderNumber,
    status: displayStatus(o.status, o.fulfillmentStatus),
    placedAt: o.placedAt || undefined,
    total: o.total || undefined,
    itemSummary: itemSummary(o.lineItems),
    trackingUrls: o.trackingUrl ? [o.trackingUrl] : undefined,
    trackingNumbers: o.trackingNumber ? [o.trackingNumber] : undefined,
    lineItems: o.lineItems,
  };
}

// NOTE: Focus P2 reference is the ORDER NUMBER, not tracking_number. Live-verified
// 2026-07-22 (Argania master 10004, Studio Pasha 10681): QuickShop tracking_number is
// empty; Focus resolves the shipment by order_number as the scoped P2 reference.
async function focusEnrich(config: any, orderNumber: string | null): Promise<FocusCustomerStatusView | null> {
  const sp = config?.shipment_provider;
  if (!sp?.enabled || sp.type !== 'focus' || !sp.host || !orderNumber) return null;
  try {
    return await getFocusShipmentStatus({
      host: sp.host,
      reference: orderNumber,
      customerCode: sp.expected_master_customer_id,
      expectedMasterCustomerId: sp.expected_master_customer_id,
    });
  } catch (e) {
    console.warn('[lookupOrder] focus enrichment failed', (e as Error).message);
    return null;
  }
}

// Master/test WhatsApp numbers (config.whatsapp_cs.test_numbers[]) bypass the best-effort
// phone-verify so QA can inspect ANY order. NOT a customer-facing path — an explicit allowlist.
function isTestNumber(config: any, senderPhone: string): boolean {
  const list = config?.whatsapp_cs?.test_numbers;
  if (!Array.isArray(list) || list.length === 0) return false;
  const s = toWaId(senderPhone);
  return list.some((n: any) => toWaId(String(n)) === s);
}

export async function lookupOrder(accountId: string, orderNumber: string, senderPhone: string): Promise<OrderLookupOutcome> {
  const row = await findBrandOrderByNumber(accountId, orderNumber);
  if (!row || !row.source_platform) return { kind: 'not_found' };

  const config = await loadConfig(accountId);
  const platform = row.source_platform as StorePlatform;
  const connector = getConnector(platform);
  const creds = credsFor(platform, config);

  // Refresh live: one call, always current. Fall back to the cached row if the pull fails.
  let fresh: NormalizedOrder | null = null;
  try {
    fresh = await connector.pull(creds, { id: row.external_id || undefined, orderNumber: row.order_number || undefined });
  } catch (e) {
    console.warn('[lookupOrder] pull failed, using cached row', (e as Error).message);
  }
  if (fresh) {
    try { await upsertBrandOrder(accountId, fresh, platform); } catch { /* cache write best-effort */ }
  }

  const orderPhone = fresh?.customerPhone ?? row.customer_phone;
  if (!isTestNumber(config, senderPhone) && !phoneMatches(orderPhone, senderPhone)) return { kind: 'unverified' };

  const normalized: NormalizedOrder = fresh ?? {
    orderNumber: row.order_number || orderNumber,
    externalId: row.external_id || '',
    status: row.status, financialStatus: row.financial_status, fulfillmentStatus: row.fulfillment_status,
    customerName: row.customer_name, customerPhone: row.customer_phone, customerEmail: row.customer_email,
    lineItems: row.line_items || [],
    trackingNumber: row.tracking_number, trackingUrl: row.tracking_url,
    total: row.total, currency: row.currency, placedAt: row.placed_at, raw: row.raw,
  };

  const result = toResult(normalized);
  // Focus P2 reference = order_number (NOT trackingNumber — see focusEnrich note above).
  const shipment = await focusEnrich(config, normalized.orderNumber);
  // `kind:'found'` is the discriminator; `result.status` carries the REAL order status (from toResult).
  return { ...result, shipment, kind: 'found' };
}

export async function lookupOrdersByPhone(accountId: string, senderPhone: string): Promise<OrderLookupResult[]> {
  const rows = await findBrandOrdersByPhone(accountId, senderPhone);
  return rows.map((r: BrandOrderRow) => ({
    found: true,
    orderNumber: r.order_number || undefined,
    status: displayStatus(r.status, r.fulfillment_status),
    placedAt: r.placed_at || undefined,
    total: r.total || undefined,
    itemSummary: r.line_items ? itemSummary(r.line_items) : undefined,
    trackingNumbers: r.tracking_number ? [r.tracking_number] : undefined,
    trackingUrls: r.tracking_url ? [r.tracking_url] : undefined,
  }));
}
