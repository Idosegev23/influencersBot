import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = { row: null as any, pull: null as any, config: {} as any };

vi.mock('@/lib/orders/brand-orders', () => ({
  findBrandOrderByNumber: vi.fn(async () => H.row),
  findBrandOrdersByPhone: vi.fn(async () => (H.row ? [H.row] : [])),
  upsertBrandOrder: vi.fn(async () => {}),
}));
vi.mock('@/lib/orders/connectors/quickshop', () => ({}));
vi.mock('@/lib/orders/connectors/shopify', () => ({}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({ platform: 'quickshop', supportsDirectLookup: false, pull: async () => H.pull }),
}));
vi.mock('@/lib/shipment/focus-client', () => ({ getFocusShipmentStatus: vi.fn(async () => ({ found: true, statusText: 'delivered' })) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: H.config }, error: null }) }) }) }) },
}));

import { lookupOrder, lookupOrdersByPhone } from '@/lib/orders/lookup';
import { getFocusShipmentStatus } from '@/lib/shipment/focus-client';
import { findBrandOrdersByPhone } from '@/lib/orders/brand-orders';

const row = (over: any = {}) => ({
  id: 'r1', account_id: 'acc-1', external_id: 'ord_123', order_number: '1042',
  customer_phone: '0501234567', customer_name: 'Dana', total: '199.00', status: 'open',
  fulfillment_status: 'fulfilled', tracking_number: 'TN1', tracking_url: 'https://t/1',
  placed_at: '2026-07-01T00:00:00Z', source_platform: 'quickshop', line_items: null, ...over,
});
const pull = (over: any = {}) => ({
  orderNumber: '1042', externalId: 'ord_123', status: 'open', financialStatus: 'paid', fulfillmentStatus: 'fulfilled',
  customerName: 'Dana', customerPhone: '0501234567', customerEmail: null,
  lineItems: [{ name: 'Argan Oil', sku: 'AO-1', quantity: 2, price: '49.50', total: '99.00', imageUrl: null }],
  trackingNumber: 'TN1', trackingUrl: 'https://t/1', total: '199.00', currency: 'ILS', placedAt: '2026-07-01T00:00:00Z', raw: {}, ...over,
});

describe('lookupOrder', () => {
  beforeEach(() => {
    H.row = null; H.pull = null; H.config = {};
    vi.mocked(getFocusShipmentStatus).mockClear();
  });

  it('returns not_found when no brand_orders row', async () => {
    H.row = null;
    expect(await lookupOrder('acc-1', '9999', '972501234567')).toEqual({ kind: 'not_found' });
  });

  it('returns found with line items and the REAL order status when phone matches', async () => {
    H.row = row(); H.pull = pull();
    const out = await lookupOrder('acc-1', '1042', '972501234567');
    expect(out.kind).toBe('found');
    expect((out as any).found).toBe(true);
    expect((out as any).lineItems).toHaveLength(1);
    expect((out as any).orderNumber).toBe('1042');
    // The real fulfillment status survives — it is NOT overwritten by the 'found' discriminator.
    expect((out as any).status).toBe('fulfilled');
  });

  it('returns unverified when the order phone does not match the sender', async () => {
    H.row = row(); H.pull = pull({ customerPhone: '0509999999' });
    expect(await lookupOrder('acc-1', '1042', '972501234567')).toEqual({ kind: 'unverified' });
  });

  it('a config whatsapp_cs.test_numbers master bypasses phone-verify (reveals despite mismatch)', async () => {
    H.row = row(); H.pull = pull({ customerPhone: '0509999999' });
    H.config = { whatsapp_cs: { test_numbers: ['0559749242'] } };
    const out = await lookupOrder('acc-1', '1042', '972559749242');
    expect(out.kind).toBe('found');
  });

  it('reveals when the order has no phone (guest checkout)', async () => {
    H.row = row({ customer_phone: null }); H.pull = pull({ customerPhone: null });
    const out = await lookupOrder('acc-1', '1042', '972501234567');
    expect(out.kind).toBe('found');
  });

  it('adds Focus shipment enrichment when configured', async () => {
    H.row = row(); H.pull = pull();
    H.config = { shipment_provider: { type: 'focus', host: 'focus.example', enabled: true, expected_master_customer_id: 10004 } };
    const out = await lookupOrder('acc-1', '1042', '972501234567');
    expect((out as any).shipment).toEqual({ found: true, statusText: 'delivered' });
  });

  // Regression lock: the plan doc originally had focusEnrich pass tracking_number as the Focus
  // reference — a real bug, since QuickShop tracking_number is EMPTY for Argania/Studio Pasha and
  // Focus only resolves shipments via order_number (P2, live-verified: Argania master 10004,
  // Studio Pasha 10681). This test fails loudly if that regresses.
  it('calls getFocusShipmentStatus with the order_number as reference — NOT tracking_number', async () => {
    H.row = row(); H.pull = pull(); // order_number '1042', trackingNumber 'TN1' — must not be confused
    H.config = { shipment_provider: { type: 'focus', host: 'focus.example', enabled: true, expected_master_customer_id: 10004 } };
    await lookupOrder('acc-1', '1042', '972501234567');
    expect(getFocusShipmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reference: '1042', customerCode: 10004, expectedMasterCustomerId: 10004 }),
    );
  });

  it('does not call Focus when shipment_provider is not configured', async () => {
    H.row = row(); H.pull = pull();
    H.config = {};
    await lookupOrder('acc-1', '1042', '972501234567');
    expect(getFocusShipmentStatus).not.toHaveBeenCalled();
  });
});

describe('lookupOrdersByPhone', () => {
  beforeEach(() => { H.row = null; vi.mocked(findBrandOrdersByPhone).mockClear(); });

  it('returns [] when no orders match the phone', async () => {
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([]);
    expect(await lookupOrdersByPhone('acc-1', '972501234567')).toEqual([]);
  });

  it('returns a single mapped order', async () => {
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([row()] as any);
    const out = await lookupOrdersByPhone('acc-1', '972501234567');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ found: true, orderNumber: '1042', status: 'fulfilled' });
  });

  it('returns N mapped orders, each account-scoped by the store lookup', async () => {
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([
      row({ order_number: '1042' }),
      row({ order_number: '1043', fulfillment_status: null, status: 'open' }),
    ] as any);
    const out = await lookupOrdersByPhone('acc-1', '972501234567');
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.orderNumber)).toEqual(['1042', '1043']);
    expect(out[1].status).toBe('open'); // falls back to row.status when fulfillment_status is null
    expect(findBrandOrdersByPhone).toHaveBeenCalledWith('acc-1', '972501234567');
  });
});
