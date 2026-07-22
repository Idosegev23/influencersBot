import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/shopify/order-lookup', () => ({
  lookupShopifyOrder: vi.fn(),
}));

import { lookupShopifyOrder } from '@/lib/shopify/order-lookup';
import { shopifyConnector } from '@/lib/orders/connectors/shopify';
import type { OrderConnectorCreds } from '@/lib/orders/connectors/types';

const creds: OrderConnectorCreds = { platform: 'shopify', shopDomain: 'x.myshopify.com', adminApiToken: 'shpat_x' };

describe('shopifyConnector', () => {
  beforeEach(() => { (lookupShopifyOrder as any).mockReset(); });

  it('advertises direct lookup and has no list()', () => {
    expect(shopifyConnector.platform).toBe('shopify');
    expect(shopifyConnector.supportsDirectLookup).toBe(true);
    expect(shopifyConnector.list).toBeUndefined();
  });

  it('pull() maps an OrderLookupResult → NormalizedOrder', async () => {
    (lookupShopifyOrder as any).mockResolvedValue({
      found: true, orderNumber: '#1234', status: 'Shipped', placedAt: '2026-07-01T00:00:00Z',
      total: 'ILS199.00', itemSummary: '2× Argan Oil',
      trackingUrls: ['https://track/1'], trackingNumbers: ['TN1'], shippedAt: '2026-07-02T00:00:00Z', deliveredAt: null,
    });
    const order = await shopifyConnector.pull(creds, { orderNumber: '1234' });
    expect(order).not.toBeNull();
    expect(order!.orderNumber).toBe('1234');           // '#' stripped
    expect(order!.fulfillmentStatus).toBe('Shipped');
    expect(order!.trackingNumber).toBe('TN1');
    expect(order!.trackingUrl).toBe('https://track/1');
    expect(order!.total).toBe('ILS199.00');
  });

  it('pull() returns null when not found', async () => {
    (lookupShopifyOrder as any).mockResolvedValue({ found: false });
    expect(await shopifyConnector.pull(creds, { orderNumber: '9' })).toBeNull();
  });
});
