import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { upserts: [], lastConflict: null, byNumber: null, byPhoneRows: [], lastIn: null, eqCalls: [] as [string, unknown][] };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(_table: string) {
      const ctx: any = {};
      ctx.upsert = (rows: any, opts: any) => {
        state.upserts.push(...(Array.isArray(rows) ? rows : [rows]));
        state.lastConflict = opts?.onConflict ?? null;
        return Promise.resolve({ data: null, error: null });
      };
      ctx.select = () => ctx;
      ctx.eq = (col: string, val: unknown) => { state.eqCalls.push([col, val]); return ctx; };
      ctx.in = (_col: string, vals: any[]) => { state.lastIn = vals; ctx._isPhone = true; return ctx; };
      ctx.maybeSingle = async () => ({ data: state.byNumber, error: null });
      ctx.then = (resolve: any) => resolve({ data: state.byPhoneRows, error: null });
      return ctx;
    },
  },
}));

import { upsertBrandOrder, upsertBrandOrders, findBrandOrderByNumber, findBrandOrdersByPhone } from '@/lib/orders/brand-orders';
import type { NormalizedOrder } from '@/lib/orders/connectors/types';

const base: NormalizedOrder = {
  orderNumber: '1042', externalId: 'ord_123', status: 'open', financialStatus: 'paid', fulfillmentStatus: 'fulfilled',
  customerName: 'Dana', customerPhone: '0501234567', customerEmail: 'd@x.com',
  lineItems: [{ name: 'Argan Oil', sku: 'AO-1', quantity: 2, price: '49.50', total: '99.00', imageUrl: null }],
  trackingNumber: 'TN1', trackingUrl: 'https://t/1', total: '199.00', currency: 'ILS', placedAt: '2026-07-01T00:00:00Z', raw: {},
};

describe('brand-orders helpers', () => {
  beforeEach(() => { state.upserts = []; state.lastConflict = null; state.byNumber = null; state.byPhoneRows = []; state.lastIn = null; state.eqCalls = []; });

  it('upsertBrandOrder writes line_items and uses (account_id, order_number) conflict target', async () => {
    const ok = await upsertBrandOrder('acc-1', base, 'quickshop');
    expect(ok).toBe(true);
    expect(state.lastConflict).toBe('account_id,order_number');
    const row = state.upserts[0];
    expect(row.account_id).toBe('acc-1');
    expect(row.order_number).toBe('1042');
    expect(row.source_platform).toBe('quickshop');
    expect(row.line_items).toHaveLength(1);
  });

  it('upsertBrandOrders omits line_items (summary preserve) and returns count', async () => {
    const n = await upsertBrandOrders('acc-1', [base, { ...base, orderNumber: '1043' }], 'quickshop');
    expect(n).toBe(2);
    expect(state.upserts[0]).not.toHaveProperty('line_items');
    expect(state.lastConflict).toBe('account_id,order_number');
  });

  it('findBrandOrderByNumber returns the row', async () => {
    state.byNumber = { id: 'r1', account_id: 'acc-1', order_number: '1042' };
    const row = await findBrandOrderByNumber('acc-1', '1042');
    expect(row?.order_number).toBe('1042');
  });

  it('findBrandOrdersByPhone queries 0↔+972 variants', async () => {
    state.byPhoneRows = [{ id: 'r1', account_id: 'acc-1', customer_phone: '0501234567' }];
    const rows = await findBrandOrdersByPhone('acc-1', '972501234567');
    expect(rows).toHaveLength(1);
    expect(state.lastIn).toEqual(expect.arrayContaining(['972501234567', '0501234567']));
  });

  it('findBrandOrderByNumber scopes the query by account_id', async () => {
    state.byNumber = { id: 'r1', account_id: 'acc-1', order_number: '1042' };
    await findBrandOrderByNumber('acc-1', '1042');
    expect(state.eqCalls).toContainEqual(['account_id', 'acc-1']);
    expect(state.eqCalls).toContainEqual(['order_number', '1042']);
  });

  it('findBrandOrdersByPhone scopes the query by account_id', async () => {
    state.byPhoneRows = [];
    await findBrandOrdersByPhone('acc-1', '972501234567');
    expect(state.eqCalls).toContainEqual(['account_id', 'acc-1']);
  });

  it('upsertBrandOrder skips an order with an empty orderNumber (no DB call)', async () => {
    const ok = await upsertBrandOrder('acc-1', { ...base, orderNumber: '' }, 'quickshop');
    expect(ok).toBe(false);
    expect(state.upserts).toHaveLength(0);
  });

  it('upsertBrandOrder skips an order with orderNumber "undefined" (QuickShop String(undefined) case)', async () => {
    const ok = await upsertBrandOrder('acc-1', { ...base, orderNumber: 'undefined' }, 'quickshop');
    expect(ok).toBe(false);
    expect(state.upserts).toHaveLength(0);
  });

  it('upsertBrandOrders filters out invalid-orderNumber rows and reflects the filtered count', async () => {
    const orders = [
      base,
      { ...base, orderNumber: '' },
      { ...base, orderNumber: 'undefined' },
      { ...base, orderNumber: '1099' },
    ];
    const n = await upsertBrandOrders('acc-1', orders, 'quickshop');
    expect(n).toBe(2);
    expect(state.upserts).toHaveLength(2);
    expect(state.upserts.map((r: any) => r.order_number)).toEqual(['1042', '1099']);
  });

  it('upsertBrandOrders returns 0 and never calls upsert when every row is invalid', async () => {
    const n = await upsertBrandOrders('acc-1', [{ ...base, orderNumber: '' }, { ...base, orderNumber: 'null' }], 'quickshop');
    expect(n).toBe(0);
    expect(state.upserts).toHaveLength(0);
  });
});
