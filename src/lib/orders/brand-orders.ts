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

// Upsert conflict target. order_number is NOT NULL in brand_orders (migration 068), but the NOT NULL
// constraint is only a backstop: it rejects a true SQL NULL, not an empty string or the literal text
// "undefined"/"null" that a connector can emit (e.g. QuickShop's String(undefined) when the source field
// is absent). Those garbage-but-non-null values still satisfy the constraint and would collide with a
// real row under the (account_id, order_number) conflict key, silently overwriting it. hasValidOrderNumber()
// below is the real guard — it runs before every upsert and skips rows that would corrupt the cache.
const CONFLICT = 'account_id,order_number';

/** True only for a usable order_number: a non-empty string that isn't the literal "undefined"/"null"
 *  a connector can produce via String(missingField). Rows that fail this are skipped, not upserted —
 *  see the CONFLICT comment above for why the NOT NULL constraint alone isn't enough. */
function hasValidOrderNumber(order: Pick<NormalizedOrder, 'orderNumber'> | null | undefined): boolean {
  const n = order?.orderNumber;
  if (typeof n !== 'string') return false;
  const trimmed = n.trim();
  if (trimmed === '') return false;
  const lower = trimmed.toLowerCase();
  return lower !== 'undefined' && lower !== 'null';
}

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

/** Detail upsert (live pull + webhook) — writes line_items.
 *  Returns false (and skips the DB call entirely) when order.orderNumber is missing/empty/garbage —
 *  never throws for this case, so a drain loop can log-and-continue instead of crashing. */
export async function upsertBrandOrder(accountId: string, order: NormalizedOrder, platform: StorePlatform): Promise<boolean> {
  if (!hasValidOrderNumber(order)) {
    console.warn('[upsertBrandOrder] skipped: invalid orderNumber', { accountId, externalId: order?.externalId, orderNumber: order?.orderNumber });
    return false;
  }
  const row = { ...baseRow(accountId, order, platform), line_items: order.lineItems ?? null };
  const { error } = await supabaseAdmin.from('brand_orders').upsert(row, { onConflict: CONFLICT });
  if (error) throw new Error(`upsertBrandOrder failed: ${error.message}`);
  return true;
}

/** Summary batch upsert (backfill) — OMITS line_items so any previously fetched detail is preserved.
 *  Rows with an invalid orderNumber are filtered out BEFORE the DB call, so one bad row never aborts
 *  the whole batch; the returned count reflects only the rows actually upserted. */
export async function upsertBrandOrders(accountId: string, orders: NormalizedOrder[], platform: StorePlatform): Promise<number> {
  if (!orders.length) return 0;
  const valid = orders.filter((o) => {
    const ok = hasValidOrderNumber(o);
    if (!ok) console.warn('[upsertBrandOrders] skipped: invalid orderNumber', { accountId, externalId: o?.externalId, orderNumber: o?.orderNumber });
    return ok;
  });
  if (!valid.length) return 0;
  const rows = valid.map((o) => baseRow(accountId, o, platform)); // no line_items key
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
