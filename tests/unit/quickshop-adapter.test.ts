import { describe, it, expect, beforeEach, vi } from 'vitest';
import { quickShopConnector, type QuickShopWebhookBody } from '@/lib/orders/connectors/quickshop';
import type { OrderConnectorCreds } from '@/lib/orders/connectors/types';

const creds: OrderConnectorCreds = { platform: 'quickshop', apiKey: 'qs_live_TEST' };

const detail = {
  id: 'ord_123',
  order_number: '#1042',
  customer_name: 'Dana Levi',
  customer_email: 'dana@example.com',
  customer_phone: '0501234567',
  financial_status: 'paid',
  fulfillment_status: 'fulfilled',
  status: 'open',
  tracking_number: 'FOCUS-77',
  tracking_url: 'https://track/77',
  total: '199.00',
  currency: 'ILS',
  created_at: '2026-07-01T10:00:00Z',
  line_items: [
    { id: 'li1', name: 'Argan Oil', sku: 'AO-1', quantity: 2, price: '49.50', total: '99.00', image_url: 'https://img/1' },
    { id: 'li2', name: 'Hair Mask', sku: null, quantity: 1, price: '100.00', total: '100.00', image_url: null },
  ],
};

describe('quickShopConnector', () => {
  beforeEach(() => { (global.fetch as any).mockReset?.(); });

  it('has the correct connector metadata', () => {
    expect(quickShopConnector.platform).toBe('quickshop');
    expect(quickShopConnector.supportsDirectLookup).toBe(false);
    expect(quickShopConnector.installMode).toBe('manual_token');
  });

  it('pull() maps GET /orders/{id} detail → NormalizedOrder', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => detail,
    });
    const order = await quickShopConnector.pull(creds, { id: 'ord_123' });
    expect(order).not.toBeNull();
    expect(order!.orderNumber).toBe('1042');        // '#' stripped
    expect(order!.externalId).toBe('ord_123');
    expect(order!.customerPhone).toBe('0501234567');
    expect(order!.trackingNumber).toBe('FOCUS-77');
    expect(order!.lineItems).toHaveLength(2);
    expect(order!.lineItems[0]).toEqual({
      name: 'Argan Oil', sku: 'AO-1', quantity: 2, price: '49.50', total: '99.00', imageUrl: 'https://img/1',
    });
    expect(order!.lineItems[1].sku).toBeNull();
    // read-only: never a mutating verb; verify URL + auth header
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(init?.method ?? 'GET').toBe('GET');
    expect(url).toContain('/api/v1/orders/ord_123');
    expect(init?.headers?.['X-API-Key']).toBe('qs_live_TEST');
  });

  it('pull() returns null on a genuine 404 WITHOUT retrying (single fetch)', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 404, headers: { get: () => null }, text: async () => '' });
    expect(await quickShopConnector.pull(creds, { id: 'missing' })).toBeNull();
    expect((global.fetch as any).mock.calls).toHaveLength(1); // 404 is definitive — no retry
  });

  // Regression lock (live-observed 2026-07-22, Argania #26841): a lone transient pull failure dropped
  // line_items to empty and the bot said it couldn't see the products. The detail read now retries once.
  it('pull() retries ONCE on a transient 5xx, then succeeds with line_items', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null }, json: async () => detail });
    const order = await quickShopConnector.pull(creds, { id: 'ord_123' });
    expect(order).not.toBeNull();
    expect(order!.lineItems).toHaveLength(2);              // items recovered on the retry
    expect((global.fetch as any).mock.calls).toHaveLength(2); // exactly one retry
  });

  it('pull() retries ONCE on a thrown network error, then returns null when both attempts fail', async () => {
    (global.fetch as any).mockRejectedValue(new Error('network down'));
    expect(await quickShopConnector.pull(creds, { id: 'ord_123' })).toBeNull();
    expect((global.fetch as any).mock.calls).toHaveLength(2); // attempt + one retry, then give up
  });

  it('list() maps a paginated summary page and exposes next cursor', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({
        data: [{ id: 'o1', order_number: '1000', customer_phone: '0500000000', total: 50, currency: 'ILS', created_at: '2026-06-01T00:00:00Z' }],
        meta: { pagination: { page: 1, limit: 100, total: 150, total_pages: 2, has_next: true, has_prev: false } },
      }),
    });
    const { orders, next } = await quickShopConnector.list!(creds);
    expect(orders).toHaveLength(1);
    expect(orders[0].orderNumber).toBe('1000');
    expect(orders[0].lineItems).toEqual([]);        // summary → no items
    expect(orders[0].total).toBe('50');             // number coerced to string
    expect(next).toBe('2');                          // next page number
    // verify paginated URL + auth header
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toContain('/api/v1/orders?page=');
    expect(init?.headers?.['X-API-Key']).toBe('qs_live_TEST');
  });

  it('normalizeWebhook() maps {event,data} detail body → NormalizedOrder', () => {
    const body: QuickShopWebhookBody = { event: 'order.updated', timestamp: '2026-07-02T00:00:00Z', data: detail as any };
    const order = quickShopConnector.normalizeWebhook!(body);
    expect(order.orderNumber).toBe('1042');
    expect(order.fulfillmentStatus).toBe('fulfilled');
    expect(order.lineItems).toHaveLength(2);
  });

  it('list() honors the X-RateLimit-* backoff branch when near-exhausted', async () => {
    // remaining<=1 && reset>0 → the adapter awaits the reset window before returning. A tiny
    // 0.01s reset keeps the test fast while still exercising the backoff branch.
    const headers = { get: (k: string) => (k === 'X-RateLimit-Remaining' ? '1' : k === 'X-RateLimit-Reset' ? '0.01' : null) };
    (global.fetch as any).mockResolvedValue({
      ok: true, status: 200, headers,
      json: async () => ({
        data: [{ id: 'o1', order_number: '2000', total: 10, currency: 'ILS', created_at: '2026-06-01T00:00:00Z' }],
        meta: { pagination: { page: 1, limit: 100, total: 100, total_pages: 1, has_next: false, has_prev: false } },
      }),
    });
    const { orders, next } = await quickShopConnector.list!(creds);
    expect(orders).toHaveLength(1); // still returns the page after honoring the reset window
    expect(next).toBeUndefined();
  });

  it('registerWebhooks() POSTs the order events + secret to /webhooks', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) });
    await quickShopConnector.registerWebhooks!(creds, 'https://cb/quickshop/tok', 'whsec');
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toContain('/webhooks');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body);
    expect(sent.url).toBe('https://cb/quickshop/tok');
    expect(sent.secret).toBe('whsec');
    expect(sent.events).toEqual(expect.arrayContaining(['order.created', 'order.updated', 'order.fulfilled']));
  });

  it('registerWebhooks() throws on a non-OK response', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 403, headers: { get: () => null }, text: async () => '' });
    await expect(quickShopConnector.registerWebhooks!(creds, 'https://cb', 's')).rejects.toThrow(/register failed/);
  });
});
