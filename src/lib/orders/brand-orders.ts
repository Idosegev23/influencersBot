// brand_orders store helpers — the unified internal order cache (spec §7.1, §10.2).
// EVERY query is scoped by account_id. Service-role client (bypasses RLS).
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import type { NormalizedLineItem, NormalizedOrder, StorePlatform } from './connectors/types';

export interface BrandOrderRow {
  id: string;
  account_id: string;
  external_id: string | null;
  order_number: string;            // NOT NULL in brand_orders (migration 068) — always present
  customer_phone: string | null;
  customer_email: string | null;
  customer_name: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  total: string | null;
  currency: string | null;
  line_items: NormalizedLineItem[] | null;
  placed_at: string | null;
  source_platform: StorePlatform | null;
  raw: unknown;
  created_at: string;
  updated_at: string;
}

// Upsert conflict target. order_number is NOT NULL in brand_orders (migration 068): every connector
// (QuickShop/Shopify) always produces a NormalizedOrder.orderNumber, so a row without one is never
// ingested — a NULL here would be distinct in the unique index and silently duplicate instead of upsert.
const CONFLICT = 'account_id,order_number';

function baseRow(accountId: string, o: NormalizedOrder, platform: StorePlatform): Record<string, unknown> {
  return {
    account_id: accountId,
    external_id: o.externalId,
    order_number: o.orderNumber,
    customer_phone: o.customerPhone,
    customer_email: o.customerEmail,
    customer_name: o.customerName,
    financial_status: o.financialStatus,
    fulfillment_status: o.fulfillmentStatus,
    status: o.status,
    tracking_number: o.trackingNumber,
    tracking_url: o.trackingUrl,
    total: o.total,
    currency: o.currency,
    placed_at: o.placedAt,
    source_platform: platform,
    raw: o.raw,
    updated_at: new Date().toISOString(),
  };
}

/** Detail upsert (live pull + webhook) — writes line_items. */
export async function upsertBrandOrder(accountId: string, order: NormalizedOrder, platform: StorePlatform): Promise<void> {
  const row = { ...baseRow(accountId, order, platform), line_items: order.lineItems ?? null };
  const { error } = await supabaseAdmin.from('brand_orders').upsert(row, { onConflict: CONFLICT });
  if (error) throw new Error(`upsertBrandOrder failed: ${error.message}`);
}

/** Summary batch upsert (backfill) — OMITS line_items so any previously fetched detail is preserved. */
export async function upsertBrandOrders(accountId: string, orders: NormalizedOrder[], platform: StorePlatform): Promise<number> {
  if (!orders.length) return 0;
  const rows = orders.map((o) => baseRow(accountId, o, platform)); // no line_items key
  const { error } = await supabaseAdmin.from('brand_orders').upsert(rows, { onConflict: CONFLICT });
  if (error) throw new Error(`upsertBrandOrders failed: ${error.message}`);
  return rows.length;
}

export async function findBrandOrderByNumber(accountId: string, orderNumber: string): Promise<BrandOrderRow | null> {
  const clean = orderNumber.trim().replace(/^#/, '');
  const { data, error } = await supabaseAdmin
    .from('brand_orders')
    .select('*')
    .eq('account_id', accountId)
    .eq('order_number', clean)
    .maybeSingle();
  if (error) throw new Error(`findBrandOrderByNumber failed: ${error.message}`);
  return (data as BrandOrderRow) || null;
}

/** Best-effort phone lookup tolerant of 0↔+972 (matches stored raw + normalized forms). */
export async function findBrandOrdersByPhone(accountId: string, senderWaId: string): Promise<BrandOrderRow[]> {
  const e164 = toWaId(senderWaId);                       // e.g. 972501234567
  const local = e164.startsWith('972') ? '0' + e164.slice(3) : e164;  // 0501234567
  const variants = Array.from(new Set([senderWaId, e164, local, '+' + e164]));
  const { data, error } = await supabaseAdmin
    .from('brand_orders')
    .select('*')
    .eq('account_id', accountId)
    .in('customer_phone', variants);
  if (error) throw new Error(`findBrandOrdersByPhone failed: ${error.message}`);
  return (data as BrandOrderRow[]) || [];
}
