import { describe, it, expect, vi, beforeEach } from 'vitest';

const H: any = { config: {}, pages: [], upserted: 0 };

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: H.config }, error: null }) }) }) }) },
}));
vi.mock('@/lib/orders/connectors/quickshop', () => ({}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({
    list: async (_creds: any, cursor?: string) => H.pages[cursor ? parseInt(cursor, 10) - 1 : 0],
  }),
}));
vi.mock('@/lib/orders/brand-orders', () => ({
  upsertBrandOrders: vi.fn(async (_acc: string, orders: any[]) => { H.upserted += orders.length; return orders.length; }),
}));
const verifyQStash = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({ verifyQStashSignature: (...a: any[]) => verifyQStash(...a) }));

import { backfillAccountOrders } from '@/lib/orders/backfill';

function req(body: any) {
  return { text: async () => JSON.stringify(body), headers: { get: () => 'sig' } } as any;
}

describe('backfillAccountOrders', () => {
  beforeEach(() => { H.config = { integrations: { quickshop: { api_key: 'qs_live_x', enabled: true } } }; H.pages = []; H.upserted = 0; });

  it('paginates all pages and upserts every summary', async () => {
    H.pages = [
      { orders: [{ orderNumber: '1' }, { orderNumber: '2' }], next: '2' },
      { orders: [{ orderNumber: '3' }], next: undefined },
    ];
    const r = await backfillAccountOrders('acc-1');
    expect(r.pages).toBe(2);
    expect(r.imported).toBe(3);
    expect(H.upserted).toBe(3);
  });

  it('honors maxPages', async () => {
    H.pages = [
      { orders: [{ orderNumber: '1' }], next: '2' },
      { orders: [{ orderNumber: '2' }], next: '3' },
      { orders: [{ orderNumber: '3' }], next: undefined },
    ];
    const r = await backfillAccountOrders('acc-1', { maxPages: 1 });
    expect(r.pages).toBe(1);
    expect(r.imported).toBe(1);
  });

  it('throws when quickshop is not configured', async () => {
    H.config = { integrations: {} };
    await expect(backfillAccountOrders('acc-1')).rejects.toThrow(/quickshop/i);
  });
});

describe('POST /api/cs/orders-backfill', () => {
  beforeEach(() => {
    H.config = { integrations: { quickshop: { api_key: 'qs_live_x', enabled: true } } };
    H.pages = [{ orders: [{ orderNumber: '1' }], next: undefined }];
    H.upserted = 0;
    verifyQStash.mockResolvedValue(true);
  });

  it('401s on a bad QStash signature (no backfill)', async () => {
    verifyQStash.mockResolvedValue(false);
    const { POST } = await import('@/app/api/cs/orders-backfill/route');
    const res = await POST(req({ accountId: 'acc-1' }));
    expect(res.status).toBe(401);
    expect(H.upserted).toBe(0);
  });

  it('400s when accountId is missing', async () => {
    const { POST } = await import('@/app/api/cs/orders-backfill/route');
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('200s and runs the backfill when signed with an accountId', async () => {
    const { POST } = await import('@/app/api/cs/orders-backfill/route');
    const res = await POST(req({ accountId: 'acc-1' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.imported).toBe(1);
  });
});
