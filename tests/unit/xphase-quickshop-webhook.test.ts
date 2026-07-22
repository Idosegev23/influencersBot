import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

const upsertBrandOrder = vi.fn();
vi.mock('@/lib/orders/brand-orders', () => ({ upsertBrandOrder, upsertBrandOrders: vi.fn() }));
// route.ts side-effect-imports the real adapter to self-register with the (here mocked) registry;
// stub it out so real self-registration never runs against our mock (matches quickshop-webhook.test.ts).
vi.mock('@/lib/orders/connectors/quickshop', () => ({}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({
    platform: 'quickshop',
    normalizeWebhook: (p: any) => ({ orderNumber: p.data.order_number, externalId: p.data.id, lineItems: [] }),
  }),
}));

// resolve account by config token; carry the webhook_secret for HMAC
const SECRET = 'whsec_test';
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () =>
            val === 'good-token'
              ? { data: { id: 'a1', config: { integrations: { quickshop: { webhook_secret: SECRET } } } } }
              : { data: null },
        }),
      }),
    }),
  },
}));

const BODY = JSON.stringify({ event: 'order.updated', timestamp: 't', data: { id: 'qs1', order_number: '1042' } });
function sign(body: string) {
  return 'sha256=' + createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}
function makeReq(sig?: string) {
  return new Request('http://x/api/webhooks/quickshop/good-token', {
    method: 'POST',
    body: BODY,
    headers: { 'content-type': 'application/json', ...(sig ? { 'x-webhook-signature': sig } : {}) },
  }) as any;
}
const ctx = (token: string) => ({ params: Promise.resolve({ accountToken: token }) });

describe('POST /api/webhooks/quickshop/[accountToken]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404 on an unknown account token', async () => {
    const { POST } = await import('@/app/api/webhooks/quickshop/[accountToken]/route');
    const res = await POST(makeReq(sign(BODY)), ctx('bad-token') as any);
    expect(res.status).toBe(404);
    expect(upsertBrandOrder).not.toHaveBeenCalled();
  });

  it('401 on an invalid signature', async () => {
    const { POST } = await import('@/app/api/webhooks/quickshop/[accountToken]/route');
    const res = await POST(makeReq('sha256=deadbeef'), ctx('good-token') as any);
    expect(res.status).toBe(401);
    expect(upsertBrandOrder).not.toHaveBeenCalled();
  });

  it('200 + upsert on a valid signature', async () => {
    const { POST } = await import('@/app/api/webhooks/quickshop/[accountToken]/route');
    const res = await POST(makeReq(sign(BODY)), ctx('good-token') as any);
    expect(res.status).toBe(200);
    expect(upsertBrandOrder).toHaveBeenCalledWith('a1', expect.objectContaining({ orderNumber: '1042' }), 'quickshop');
  });
});
