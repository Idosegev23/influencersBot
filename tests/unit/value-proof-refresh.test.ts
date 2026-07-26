import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: any = { touches: [], orders: [], carts: [], beacons: [], upserts: [], lastConflict: null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const ctx: any = { _table: table };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.order = () => ctx;
      ctx.range = () => ctx;
      ctx.upsert = (r: any[], opts: any) => {
        rows.upserts.push(...r);
        rows.lastConflict = opts?.onConflict;
        return Promise.resolve({ error: null });
      };
      ctx.then = (resolve: any) => {
        const map: Record<string, any[]> = {
          bestie_conversation_touches: rows.touches,
          brand_orders: rows.orders,
          brand_abandoned_carts: rows.carts,
          widget_events: rows.beacons,
        };
        return resolve({ data: map[table] ?? [], error: null });
      };
      return ctx;
    },
  },
}));

import { refreshAccountAttribution } from '@/lib/analytics/value-proof/refresh';

describe('refreshAccountAttribution', () => {
  beforeEach(() => {
    rows.touches = []; rows.orders = []; rows.carts = []; rows.beacons = [];
    rows.upserts = []; rows.lastConflict = null;
  });

  it('writes one attribution row per order with the resolved tier', async () => {
    rows.touches = [{ touch_at: '2026-07-01T10:00:00Z', surface: 'support', anon_id: null, phone: '972501234567', email: null }];
    rows.orders = [
      { id: 'o1', placed_at: '2026-07-01T12:00:00Z', total: '200', customer_phone: '0501234567', customer_email: null, raw: {} },
      { id: 'o2', placed_at: '2026-07-01T12:00:00Z', total: '150', customer_phone: null, customer_email: null, raw: { utm_source: 'bestie' } },
      { id: 'o3', placed_at: '2026-07-01T12:00:00Z', total: '0', customer_phone: '0501234567', customer_email: null, raw: { utm_source: 'pos' } },
    ];

    const out = await refreshAccountAttribution('acc-1');
    expect(out.orders).toBe(3);
    expect(rows.lastConflict).toBe('account_id,subject_kind,subject_id');

    const byId = Object.fromEntries(rows.upserts.map((r: any) => [r.subject_id, r]));
    expect(byId.o1.tier).toBe('influenced');
    expect(byId.o1.match_key).toBe('phone');
    expect(byId.o2.tier).toBe('direct');
    expect(byId.o3.tier).toBe('none');
    expect(out.tiers.direct).toBe(1);
    expect(out.tiers.influenced).toBe(1);
    expect(out.tiers.none).toBe(1);
  });

  it('uses the thank-you beacon anon_id to reach the assisted tier', async () => {
    rows.touches = [{ touch_at: '2026-07-01T10:00:00Z', surface: 'chat', anon_id: 'anon-9', phone: null, email: null }];
    rows.beacons = [{ anon_id: 'anon-9', payload: { order_number: '1042' } }];
    rows.orders = [{ id: 'o1', order_number: '1042', placed_at: '2026-07-01T12:00:00Z', total: '200', customer_phone: null, customer_email: null, raw: {} }];

    await refreshAccountAttribution('acc-1');
    expect(rows.upserts[0].tier).toBe('assisted');
    expect(rows.upserts[0].match_key).toBe('anon_id');
  });

  it('derives cart recovery from a later order by the same email', async () => {
    rows.carts = [{ id: 'c1', abandoned_at: '2026-07-01T10:00:00Z', subtotal: '300', email_norm: 'dana@example.com' }];
    rows.orders = [{ id: 'o1', placed_at: '2026-07-03T10:00:00Z', total: '310', customer_phone: null, customer_email: 'Dana@Example.com', raw: {} }];

    const out = await refreshAccountAttribution('acc-1');
    expect(out.carts).toBe(1);
    const cart = rows.upserts.find((r: any) => r.subject_kind === 'cart');
    expect(cart.recovered_at).toBe('2026-07-03T10:00:00.000Z');
  });

  it('does not treat an order BEFORE the cart as a recovery', async () => {
    rows.carts = [{ id: 'c1', abandoned_at: '2026-07-05T10:00:00Z', subtotal: '300', email_norm: 'dana@example.com' }];
    rows.orders = [{ id: 'o1', placed_at: '2026-07-01T10:00:00Z', total: '310', customer_phone: null, customer_email: 'dana@example.com', raw: {} }];

    await refreshAccountAttribution('acc-1');
    const cart = rows.upserts.find((r: any) => r.subject_kind === 'cart');
    expect(cart.recovered_at).toBeNull();
  });

  it('a ₪0 or POS order can never count as a cart recovery', async () => {
    rows.carts = [{ id: 'c1', abandoned_at: '2026-07-01T10:00:00Z', subtotal: '300', email_norm: 'dana@example.com' }];
    rows.orders = [
      { id: 'o1', placed_at: '2026-07-02T10:00:00Z', total: '0', customer_phone: null, customer_email: 'dana@example.com', raw: {} },
      { id: 'o2', placed_at: '2026-07-02T11:00:00Z', total: '90', customer_phone: null, customer_email: 'dana@example.com', raw: { utm_source: 'pos' } },
    ];

    await refreshAccountAttribution('acc-1');
    const cart = rows.upserts.find((r: any) => r.subject_kind === 'cart');
    expect(cart.recovered_at).toBeNull();
  });
});
