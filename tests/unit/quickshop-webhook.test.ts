import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

const H: any = { account: null, upserts: [] };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: H.account, error: null }) }) }) }),
  },
}));
vi.mock('@/lib/orders/connectors/quickshop', () => ({}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({ normalizeWebhook: (b: any) => ({ orderNumber: String(b.data.order_number), externalId: String(b.data.id), lineItems: [] }) }),
}));
vi.mock('@/lib/orders/brand-orders', () => ({
  upsertBrandOrder: vi.fn(async (accId: string, o: any) => { H.upserts.push({ accId, o }); }),
}));

import { handleQuickShopWebhook } from '@/app/api/webhooks/quickshop/[accountToken]/route';

const body = JSON.stringify({ event: 'order.updated', timestamp: 't', data: { id: 'ord_9', order_number: '1042' } });
const sign = (b: string, secret: string) => 'sha256=' + createHmac('sha256', secret).update(b, 'utf8').digest('hex');

describe('handleQuickShopWebhook', () => {
  beforeEach(() => { H.account = null; H.upserts = []; });

  it('404s on an unknown token', async () => {
    H.account = null;
    const r = await handleQuickShopWebhook(body, null, 'nope');
    expect(r.status).toBe(404);
  });

  it('401s on an invalid signature when a secret is configured', async () => {
    H.account = { id: 'acc-1', config: { integrations: { quickshop: { webhook_token: 'tok', webhook_secret: 's3cret' } } } };
    const r = await handleQuickShopWebhook(body, 'sha256=deadbeef', 'tok');
    expect(r.status).toBe(401);
    expect(H.upserts).toHaveLength(0);
  });

  it('upserts and 200s on a valid signature', async () => {
    H.account = { id: 'acc-1', config: { integrations: { quickshop: { webhook_token: 'tok', webhook_secret: 's3cret' } } } };
    const r = await handleQuickShopWebhook(body, sign(body, 's3cret'), 'tok');
    expect(r.status).toBe(200);
    expect(H.upserts[0].accId).toBe('acc-1');
    expect(H.upserts[0].o.orderNumber).toBe('1042');
  });

  it('skips verification and 200s when no secret configured', async () => {
    H.account = { id: 'acc-1', config: { integrations: { quickshop: { webhook_token: 'tok' } } } };
    const r = await handleQuickShopWebhook(body, null, 'tok');
    expect(r.status).toBe(200);
    expect(H.upserts).toHaveLength(1);
  });
});
