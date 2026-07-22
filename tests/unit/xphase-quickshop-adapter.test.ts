import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConnector } from '@/lib/orders/connectors/registry';
import '@/lib/orders/connectors/quickshop';

const DETAIL = {
  id: 'qs_9001', order_number: '1042',
  customer_name: 'דנה', customer_email: 'dana@x.co', customer_phone: '0501234567',
  financial_status: 'paid', fulfillment_status: 'fulfilled', status: 'open',
  line_items: [{ id: 'li1', name: 'שמן ארגן', sku: 'ARG-01', quantity: 2, price: '99.00', total: '198.00', image_url: 'https://img/x.jpg' }],
  tracking_number: 'RR123', tracking_url: 'https://track/RR123',
  total: '198.00', currency: 'ILS', created_at: '2026-07-01T10:00:00Z',
};

describe('quickshop connector', () => {
  beforeEach(() => (global.fetch as any).mockReset?.());

  it('normalizeWebhook maps { event, data } → NormalizedOrder', () => {
    const c = getConnector('quickshop');
    const n = c.normalizeWebhook!({ event: 'order.updated', timestamp: 't', data: DETAIL });
    expect(n.orderNumber).toBe('1042');
    expect(n.externalId).toBe('qs_9001');
    expect(n.customerPhone).toBe('0501234567');
    expect(n.lineItems).toHaveLength(1);
    expect(n.lineItems[0]).toMatchObject({ name: 'שמן ארגן', sku: 'ARG-01', quantity: 2 });
    expect(n.trackingNumber).toBe('RR123');
  });

  it('pull fetches GET /orders/{id} and maps to NormalizedOrder', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      text: async () => JSON.stringify(DETAIL),
      json: async () => DETAIL,
    });
    const c = getConnector('quickshop');
    const n = await c.pull({ platform: 'quickshop', apiKey: 'qs_live_x' }, { id: 'qs_9001' });
    expect(n?.orderNumber).toBe('1042');
    expect(n?.fulfillmentStatus).toBe('fulfilled');
    const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/orders/qs_9001');
  });
});
