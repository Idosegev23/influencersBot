/**
 * Recomputes bestie_attribution for one account.
 *
 * Tier logic is NOT duplicated here — it comes from ./attribute, which is pure
 * and unit-tested. This module only loads inputs, applies it, and writes rows.
 *
 * Cart recovery is DERIVED (QuickShop never populates recovered_at): a cart is
 * recovered when the same email places a later paid, non-POS order. The 30-day
 * horizon is the reported outer bound; 24h and 7d are computed downstream from
 * the same recovered_at + occurred_at pair.
 */
import { supabase } from '@/lib/supabase';
import { normalizeEmail, normalizePhone } from './identity';
import { attributeCart, attributeOrder, buildTouchIndex, isAttributableOrder } from './attribute';
import type { AttributableCart, AttributableOrder, Tier, TouchRecord } from './types';

const RECOVERY_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE = 1000; // PostgREST caps a fetch at 1000 rows — page explicitly

async function fetchAll<T>(
  table: string,
  columns: string,
  accountId: string,
  orderColumn: string | null,
  filters: Array<[string, string]> = []
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table).select(columns).eq('account_id', accountId);
    for (const [col, val] of filters) q = q.eq(col, val);
    // ORDER BY is not optional. Without a deterministic sort, PostgREST's range
    // paging can repeat rows on one page and skip others: measured 2026-07-26,
    // Pasha loaded 6,023 orders but only 4,701 distinct rows survived the upsert.
    if (orderColumn) q = q.order(orderColumn, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} load failed: ${error.message}`);
    const batch = (data || []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

export async function refreshAccountAttribution(
  accountId: string
): Promise<{ orders: number; carts: number; tiers: Record<Tier, number> }> {
  const [touchRows, orderRows, cartRows, beaconRows] = await Promise.all([
    // The touch view has no stable key of its own, so it is ordered by time.
    fetchAll<any>('bestie_conversation_touches', 'touch_at,surface,anon_id,phone,email', accountId, 'touch_at'),
    fetchAll<any>('brand_orders', 'id,order_number,placed_at,total,customer_phone,customer_email,raw', accountId, 'id'),
    fetchAll<any>('brand_abandoned_carts', 'id,abandoned_at,subtotal,email_norm', accountId, 'id'),
    fetchAll<any>('widget_events', 'anon_id,payload', accountId, 'id', [['type', 'widget_conversion_detected']]),
  ]);

  const touches: TouchRecord[] = touchRows
    .filter((t) => !!t.touch_at)
    .map((t) => ({
      touchAt: Date.parse(t.touch_at),
      surface: t.surface,
      anonId: t.anon_id || null,
      phone: t.phone || null,   // the view already normalizes via bestie_wa_id
      email: t.email || null,
    }));
  const index = buildTouchIndex(touches);

  // Thank-you beacons: order_number → anon_id. The beacon rides the existing
  // widget_events pipeline as `widget_conversion_detected`, so there is no
  // separate table to join.
  const anonByOrderNumber = new Map<string, string>();
  for (const b of beaconRows) {
    const num = String(b?.payload?.order_number || '').replace(/^#/, '').trim();
    if (num && b.anon_id) anonByOrderNumber.set(num, b.anon_id);
  }

  // Paid, non-POS orders keyed by email — the basis for derived cart recovery.
  const paidOrdersByEmail = new Map<string, number[]>();
  const orders: AttributableOrder[] = [];
  for (const o of orderRows) {
    if (!o.placed_at) continue;
    const amount = Number(o.total) || 0;
    const utmSource = (o.raw?.utm_source ?? null) as string | null;
    const email = normalizeEmail(o.customer_email);
    const occurredAt = Date.parse(o.placed_at);
    orders.push({
      id: o.id,
      occurredAt,
      amount,
      utmSource,
      anonId: anonByOrderNumber.get(String(o.order_number || '').replace(/^#/, '').trim()) || null,
      phone: normalizePhone(o.customer_phone),
      email,
    });
    if (email && isAttributableOrder({ amount, utmSource })) {
      const list = paidOrdersByEmail.get(email);
      if (list) list.push(occurredAt);
      else paidOrdersByEmail.set(email, [occurredAt]);
    }
  }

  const carts: AttributableCart[] = cartRows
    .filter((c) => !!c.abandoned_at)
    .map((c) => ({
      id: c.id,
      occurredAt: Date.parse(c.abandoned_at),
      amount: Number(c.subtotal) || 0,
      email: c.email_norm || null,
    }));

  const tiers: Record<Tier, number> = { direct: 0, assisted: 0, influenced: 0, none: 0 };
  const computedAt = new Date().toISOString();
  const rows: any[] = [];

  for (const o of orders) {
    const a = attributeOrder(o, index);
    tiers[a.tier] += 1;
    rows.push({
      account_id: accountId,
      subject_kind: 'order',
      subject_id: o.id,
      tier: a.tier,
      // Stored so the AOV baseline can exclude the same rows attribution does.
      // Without it the baseline includes ₪0 records and in-store POS sales
      // (Argania POS AOV ₪29), which drags the comparison and flatters Bestie.
      attributable: isAttributableOrder({ amount: o.amount, utmSource: o.utmSource }),
      match_key: a.matchKey,
      touch_at: a.touchAt === null ? null : new Date(a.touchAt).toISOString(),
      lag_sec: a.lagSec,
      amount: o.amount,
      occurred_at: new Date(o.occurredAt).toISOString(),
      recovered_at: null,
      computed_at: computedAt,
    });
  }

  for (const c of carts) {
    // Recovery first: cart attribution needs it, because a Bestie touch only
    // counts if it landed between the abandonment and the recovering order.
    const candidates = (c.email ? paidOrdersByEmail.get(c.email) : undefined) || [];
    const recovery = candidates
      .filter((t) => t > c.occurredAt && t - c.occurredAt <= RECOVERY_HORIZON_MS)
      .sort((x, y) => x - y)[0];
    const a = attributeCart(c, index, recovery === undefined ? null : recovery);
    rows.push({
      account_id: accountId,
      subject_kind: 'cart',
      subject_id: c.id,
      tier: a.tier,
      attributable: true,
      match_key: a.matchKey,
      touch_at: a.touchAt === null ? null : new Date(a.touchAt).toISOString(),
      lag_sec: a.lagSec,
      amount: c.amount,
      occurred_at: new Date(c.occurredAt).toISOString(),
      recovered_at: recovery === undefined ? null : new Date(recovery).toISOString(),
      computed_at: computedAt,
    });
  }

  for (let i = 0; i < rows.length; i += PAGE) {
    const { error } = await supabase
      .from('bestie_attribution')
      .upsert(rows.slice(i, i + PAGE), { onConflict: 'account_id,subject_kind,subject_id' });
    if (error) throw new Error(`attribution upsert failed: ${error.message}`);
  }

  return { orders: orders.length, carts: carts.length, tiers };
}
