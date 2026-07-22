// QuickShop adapter (Argania v1). READ-ONLY: pull/list/webhook-ingest only.
// NEVER calls PATCH /orders, /edit-items, /fulfill, /cancel (spec D5).
import type { NormalizedLineItem, NormalizedOrder, OrderConnector, OrderConnectorCreds } from './types';
import { registerConnector } from './registry';

const QUICKSHOP_BASE = 'https://my-quickshop.com/api/v1';
const QUICKSHOP_TIMEOUT_MS = 8000;

// ---- Wire types (Appendix A) ----
export interface QuickShopPagination {
  page: number; limit: number; total: number; total_pages: number; has_next: boolean; has_prev: boolean;
}
export interface QuickShopListResponse<T> { data: T[]; meta: { pagination: QuickShopPagination }; }
export interface QuickShopOrderSummary {
  id: string; order_number: string;
  customer_name?: string | null; customer_email?: string | null; customer_phone?: string | null;
  financial_status?: string | null; fulfillment_status?: string | null; status?: string | null;
  total?: string | number | null; currency?: string | null; created_at?: string | null;
}
export interface QuickShopLineItem {
  id: string; name: string; sku?: string | null; quantity: number;
  price?: string | number | null; total?: string | number | null;
  image_url?: string | null; product_id?: string | null; variant_title?: string | null;
  properties?: { addons?: unknown; bundleComponents?: unknown; addonTotal?: unknown } | null;
}
export interface QuickShopOrderDetail extends QuickShopOrderSummary {
  customer_id?: string | null;
  line_items: QuickShopLineItem[];
  tracking_number?: string | null; tracking_url?: string | null;
  billing_address?: Record<string, unknown> & { phone?: string | null };
  shipping_address?: Record<string, unknown> & { phone?: string | null };
  updated_at?: string | null; note?: string | null;
}
export interface QuickShopWebhookBody { event: string; timestamp: string; data: QuickShopOrderDetail; }

// ---- helpers ----
const asString = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function qsHeaders(creds: OrderConnectorCreds): Record<string, string> {
  return { 'X-API-Key': creds.apiKey || '', 'Content-Type': 'application/json' };
}

async function qsFetch(creds: OrderConnectorCreds, path: string, init?: RequestInit): Promise<Response> {
  return Promise.race([
    fetch(`${QUICKSHOP_BASE}${path}`, { ...init, headers: { ...qsHeaders(creds), ...(init?.headers || {}) } }),
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('quickshop timeout')), QUICKSHOP_TIMEOUT_MS)),
  ]);
}

function mapLineItem(li: QuickShopLineItem): NormalizedLineItem {
  return {
    name: li.name,
    sku: li.sku ?? null,
    quantity: li.quantity,
    price: asString(li.price ?? null),
    total: asString(li.total ?? null),
    imageUrl: li.image_url ?? null,
  };
}

function mapSummary(o: QuickShopOrderSummary): NormalizedOrder {
  return {
    orderNumber: String(o.order_number).replace(/^#/, ''),
    externalId: String(o.id),
    status: o.status ?? null,
    financialStatus: o.financial_status ?? null,
    fulfillmentStatus: o.fulfillment_status ?? null,
    customerName: o.customer_name ?? null,
    customerPhone: o.customer_phone ?? null,
    customerEmail: o.customer_email ?? null,
    lineItems: [],
    trackingNumber: null,
    trackingUrl: null,
    total: asString(o.total ?? null),
    currency: o.currency ?? null,
    placedAt: o.created_at ?? null,
    raw: o,
  };
}

function mapDetail(d: QuickShopOrderDetail): NormalizedOrder {
  return {
    orderNumber: String(d.order_number).replace(/^#/, ''),
    externalId: String(d.id),
    status: d.status ?? null,
    financialStatus: d.financial_status ?? null,
    fulfillmentStatus: d.fulfillment_status ?? null,
    customerName: d.customer_name ?? null,
    customerPhone: d.customer_phone ?? d.shipping_address?.phone ?? d.billing_address?.phone ?? null,
    customerEmail: d.customer_email ?? null,
    lineItems: Array.isArray(d.line_items) ? d.line_items.map(mapLineItem) : [],
    trackingNumber: d.tracking_number ?? null,
    trackingUrl: d.tracking_url ?? null,
    total: asString(d.total ?? null),
    currency: d.currency ?? null,
    placedAt: d.created_at ?? null,
    raw: d,
  };
}

export const quickShopConnector: OrderConnector = {
  platform: 'quickshop',
  installMode: 'manual_token',
  supportsDirectLookup: false, // no working order_number filter → resolve via brand_orders

  async pull(creds, ref) {
    if (!ref.id) return null; // QuickShop detail lookup is by id only
    const res = await qsFetch(creds, `/orders/${encodeURIComponent(ref.id)}`);
    if (!res.ok) {
      if (res.status !== 404) console.warn('[quickshop.pull] non-OK', res.status);
      return null;
    }
    const detail = (await res.json().catch(() => null)) as QuickShopOrderDetail | null;
    if (!detail || !detail.id) return null;
    return mapDetail(detail);
  },

  async list(creds, cursor) {
    const page = cursor ? parseInt(cursor, 10) : 1;
    const res = await qsFetch(creds, `/orders?page=${page}&limit=100`);
    if (!res.ok) throw new Error(`quickshop list failed: ${res.status}`);
    // Honor the rate limit for the caller's next iteration.
    const remaining = Number(res.headers.get('X-RateLimit-Remaining') ?? '99');
    const resetSec = Number(res.headers.get('X-RateLimit-Reset') ?? '0');
    if (remaining <= 1 && resetSec > 0) {
      await new Promise((r) => setTimeout(r, Math.min(resetSec, 60) * 1000));
    }
    const body = (await res.json()) as QuickShopListResponse<QuickShopOrderSummary>;
    const orders = (body.data || []).map(mapSummary);
    const next = body.meta?.pagination?.has_next ? String(page + 1) : undefined;
    return { orders, next };
  },

  normalizeWebhook(payload) {
    const body = payload as QuickShopWebhookBody;
    return mapDetail(body.data);
  },

  async registerWebhooks(creds, url, secret) {
    // Webhook registration is not a store data write — permitted.
    const res = await qsFetch(creds, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url, events: ['order.created', 'order.updated', 'order.fulfilled'], secret }),
    });
    if (!res.ok) throw new Error(`quickshop webhook register failed: ${res.status}`);
  },
};

registerConnector(quickShopConnector);
