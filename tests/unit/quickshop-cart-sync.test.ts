import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { upserts: [], lastConflict: null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(_table: string) {
      const ctx: any = {};
      ctx.upsert = (rows: any, opts: any) => {
        state.upserts.push(...(Array.isArray(rows) ? rows : [rows]));
        state.lastConflict = opts?.onConflict ?? null;
        return Promise.resolve({ data: null, error: null });
      };
      return ctx;
    },
  },
}));

import { upsertBrandCarts } from '@/lib/carts/brand-carts';
import { listAbandonedCarts } from '@/lib/orders/connectors/quickshop';
import type { NormalizedCart } from '@/lib/orders/connectors/quickshop';

const wire = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  email: 'Dana@Example.COM',
  items: [{ name: 'Argan Oil', quantity: 1, price: 45.9 }],
  subtotal: 142.7,
  checkout_step: 'payment',
  reminder_count: 1,
  reminder_sent_at: '2026-07-26T15:26:48.054Z',
  recovered_at: null,
  created_at: '2026-07-26T14:01:02.746Z',
  updated_at: '2026-07-26T15:26:48.054Z',
  ...over,
});

describe('quickshop abandoned-cart sync', () => {
  beforeEach(() => { state.upserts = []; state.lastConflict = null; vi.restoreAllMocks(); });

  it('maps the wire payload and follows pagination via has_next', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      headers: new Headers({ 'X-RateLimit-Remaining': '50' }),
      json: async () => ({
        data: [wire(String(url).includes('page=2') ? 'c2' : 'c1')],
        meta: { pagination: { page: String(url).includes('page=2') ? 2 : 1, limit: 100, total: 2, total_pages: 2, has_next: !String(url).includes('page=2'), has_prev: false } },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const first = await listAbandonedCarts({ platform: 'quickshop', apiKey: 'qs_live_x' } as any);
    expect(first.carts).toHaveLength(1);
    expect(first.carts[0].externalId).toBe('c1');
    expect(first.carts[0].subtotal).toBe('142.7');
    expect(first.carts[0].reminderCount).toBe(1);
    expect(first.carts[0].abandonedAt).toBe('2026-07-26T14:01:02.746Z');
    expect(first.next).toBe('2');

    const second = await listAbandonedCarts({ platform: 'quickshop', apiKey: 'qs_live_x' } as any, '2');
    expect(second.carts[0].externalId).toBe('c2');
    expect(second.next).toBeUndefined();
  });

  it('waits for the rate-limit reset when the budget is exhausted', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '2' }),
      json: async () => ({ data: [wire('c1')], meta: { pagination: { has_next: false } } }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    const sleep = vi.spyOn(global, 'setTimeout');
    await listAbandonedCarts({ platform: 'quickshop', apiKey: 'qs_live_x' } as any);
    expect(sleep).toHaveBeenCalled();
  });

  it('upsert is idempotent on (account_id, external_id) and normalizes the email', async () => {
    const cart: NormalizedCart = {
      externalId: 'c1', email: '  Dana@Example.COM ', items: [], subtotal: '142.7',
      checkoutStep: 'payment', reminderCount: 1, reminderSentAt: null, recoveredAt: null,
      abandonedAt: '2026-07-26T14:01:02.746Z', raw: {},
    };
    const written = await upsertBrandCarts('acc-1', [cart, cart]);
    expect(written).toBe(2);
    expect(state.lastConflict).toBe('account_id,external_id');
    expect(state.upserts[0].email_norm).toBe('dana@example.com');
    expect(state.upserts[0].abandoned_at).toBe('2026-07-26T14:01:02.746Z');
  });

  it('skips carts with no created_at rather than writing a null abandoned_at', async () => {
    const bad: NormalizedCart = {
      externalId: 'c9', email: null, items: [], subtotal: null, checkoutStep: null,
      reminderCount: 0, reminderSentAt: null, recoveredAt: null, abandonedAt: null, raw: {},
    };
    const written = await upsertBrandCarts('acc-1', [bad]);
    expect(written).toBe(0);
    expect(state.upserts).toHaveLength(0);
  });
});
