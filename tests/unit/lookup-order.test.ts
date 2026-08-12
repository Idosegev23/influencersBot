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
import { findBrandOrdersByPhone, findBrandOrderByNumber } from '@/lib/orders/brand-orders';
import { whatsappIdentity, type CsIdentity } from '@/lib/cs/identity';

const widgetClaim = (phone?: string): CsIdentity =>
  phone
    ? { channel: 'widget', visitorId: 'v-1', phone, trust: 'phone_claimed' }
    : { channel: 'widget', visitorId: 'v-1', trust: 'unverified' };

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
    expect(await lookupOrder('acc-1', '9999', whatsappIdentity('972501234567'))).toEqual({ kind: 'not_found' });
  });

  it('returns found with line items and the REAL order status when phone matches', async () => {
    H.row = row(); H.pull = pull();
    const out = await lookupOrder('acc-1', '1042', whatsappIdentity('972501234567'));
    expect(out.kind).toBe('found');
    expect((out as any).found).toBe(true);
    expect((out as any).lineItems).toHaveLength(1);
    expect((out as any).orderNumber).toBe('1042');
    // The real fulfillment status survives — it is NOT overwritten by the 'found' discriminator.
    expect((out as any).status).toBe('fulfilled');
  });

  it('single lookup surfaces a cancelled order status over the (masking) fulfillment status', async () => {
    H.row = row(); H.pull = pull({ status: 'cancelled', fulfillmentStatus: 'unfulfilled' });
    const out = await lookupOrder('acc-1', '1042', whatsappIdentity('972501234567'));
    expect(out.kind).toBe('found');
    expect((out as any).status).toBe('cancelled');
  });

  it('returns unverified when the order phone does not match the sender', async () => {
    H.row = row(); H.pull = pull({ customerPhone: '0509999999' });
    expect(await lookupOrder('acc-1', '1042', whatsappIdentity('972501234567'))).toEqual({ kind: 'unverified' });
  });

  it('a config whatsapp_cs.test_numbers master bypasses phone-verify (reveals despite mismatch)', async () => {
    H.row = row(); H.pull = pull({ customerPhone: '0509999999' });
    H.config = { whatsapp_cs: { test_numbers: ['0559749242'] } };
    const out = await lookupOrder('acc-1', '1042', whatsappIdentity('972559749242'));
    expect(out.kind).toBe('found');
  });

  it('reveals when the order has no phone (guest checkout)', async () => {
    H.row = row({ customer_phone: null }); H.pull = pull({ customerPhone: null });
    const out = await lookupOrder('acc-1', '1042', whatsappIdentity('972501234567'));
    expect(out.kind).toBe('found');
  });

  it('adds Focus shipment enrichment when configured', async () => {
    H.row = row(); H.pull = pull();
    H.config = { shipment_provider: { type: 'focus', host: 'focus.example', enabled: true, expected_master_customer_id: 10004 } };
    const out = await lookupOrder('acc-1', '1042', whatsappIdentity('972501234567'));
    expect((out as any).shipment).toEqual({ found: true, statusText: 'delivered' });
  });

  // Regression lock: the plan doc originally had focusEnrich pass tracking_number as the Focus
  // reference — a real bug, since QuickShop tracking_number is EMPTY for Argania/Studio Pasha and
  // Focus only resolves shipments via order_number (P2, live-verified: Argania master 10004,
  // Studio Pasha 10681). This test fails loudly if that regresses.
  it('calls getFocusShipmentStatus with the order_number as reference — NOT tracking_number', async () => {
    H.row = row(); H.pull = pull(); // order_number '1042', trackingNumber 'TN1' — must not be confused
    H.config = { shipment_provider: { type: 'focus', host: 'focus.example', enabled: true, expected_master_customer_id: 10004 } };
    await lookupOrder('acc-1', '1042', whatsappIdentity('972501234567'));
    expect(getFocusShipmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reference: '1042', customerCode: 10004, expectedMasterCustomerId: 10004 }),
    );
  });

  it('does not call Focus when shipment_provider is not configured', async () => {
    H.row = row(); H.pull = pull();
    H.config = {};
    await lookupOrder('acc-1', '1042', whatsappIdentity('972501234567'));
    expect(getFocusShipmentStatus).not.toHaveBeenCalled();
  });
});

describe('lookupOrdersByPhone', () => {
  beforeEach(() => { H.row = null; H.pull = null; H.config = {}; vi.mocked(findBrandOrdersByPhone).mockClear(); });

  it('enriches recent by-phone orders with line items via a lazy pull (so the bot can show contents)', async () => {
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([row({ order_number: '1042', line_items: null })] as any);
    H.pull = pull(); // the /orders/{id} detail pull returns line items (1× Argan Oil)
    const res = await lookupOrdersByPhone('acc-1', whatsappIdentity('972501234567'));
    if (res.kind !== 'found') throw new Error('expected found');
    expect(res.orders[0].itemSummary).toContain('Argan Oil');
  });

  it('returns no orders when none match the phone', async () => {
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([]);
    expect(await lookupOrdersByPhone('acc-1', whatsappIdentity('972501234567'))).toEqual({ kind: 'found', orders: [] });
  });

  it('returns a single mapped order', async () => {
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([row()] as any);
    const res = await lookupOrdersByPhone('acc-1', whatsappIdentity('972501234567'));
    if (res.kind !== 'found') throw new Error('expected found');
    expect(res.orders).toHaveLength(1);
    expect(res.orders[0]).toMatchObject({ found: true, orderNumber: '1042', status: 'fulfilled' });
  });

  it('returns N mapped orders, each account-scoped by the store lookup', async () => {
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([
      row({ order_number: '1042' }),
      row({ order_number: '1043', fulfillment_status: null, status: 'open' }),
    ] as any);
    const res = await lookupOrdersByPhone('acc-1', whatsappIdentity('972501234567'));
    if (res.kind !== 'found') throw new Error('expected found');
    expect(res.orders).toHaveLength(2);
    expect(res.orders.map((o) => o.orderNumber)).toEqual(['1042', '1043']);
    expect(res.orders[1].status).toBe('open'); // falls back to row.status when fulfillment_status is null
    expect(findBrandOrdersByPhone).toHaveBeenCalledWith('acc-1', '972501234567');
  });

  // Regression (live 2026-07-23): a CANCELLED order was reported as "not shipped yet" because
  // fulfillment_status='unfulfilled' masked status='cancelled'. Terminal order status must win.
  it('surfaces a CANCELLED order status instead of masking it with fulfillment', async () => {
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([
      row({ order_number: '16689', status: 'cancelled', fulfillment_status: 'unfulfilled' }),
    ] as any);
    const res = await lookupOrdersByPhone('acc-1', whatsappIdentity('972501234567'));
    if (res.kind !== 'found') throw new Error('expected found');
    expect(res.orders[0].status).toBe('cancelled');
  });
});

describe('lookupOrder trust gating (spec §2 — CS engine)', () => {
  beforeEach(() => {
    H.row = null; H.pull = null; H.config = {};
    vi.mocked(findBrandOrderByNumber).mockClear();
    vi.mocked(findBrandOrdersByPhone).mockClear();
  });

  it('unverified identity → identity_required BEFORE any data is touched', async () => {
    H.row = row();
    const out = await lookupOrder('acc-1', '1042', widgetClaim(undefined));
    expect(out.kind).toBe('identity_required');
    expect(findBrandOrderByNumber).not.toHaveBeenCalled();
  });

  it('GUEST-CHECKOUT-ON-WIDGET: no-phone order + claimed phone → escalate, never found', async () => {
    // The leak this whole design exists to prevent: a widget visitor who guesses an order
    // number must NOT see a guest-checkout order (reveal-when-absent is WhatsApp-only).
    H.row = row({ customer_phone: null }); H.pull = pull({ customerPhone: null });
    const out = await lookupOrder('acc-1', '1042', widgetClaim('0501234567'));
    expect(out.kind).toBe('escalate');
  });

  it('claimed phone matching the order phone → found', async () => {
    H.row = row(); H.pull = pull(); // order phone 0501234567
    const out = await lookupOrder('acc-1', '1042', widgetClaim('+972501234567'));
    expect(out.kind).toBe('found');
  });

  it('claimed phone that does NOT match → unverified', async () => {
    H.row = row(); H.pull = pull({ customerPhone: '0509999999' });
    const out = await lookupOrder('acc-1', '1042', widgetClaim('0501234567'));
    expect(out.kind).toBe('unverified');
  });

  it('test_numbers QA bypass does NOT apply to claimed identities (WhatsApp-only affordance)', async () => {
    H.row = row(); H.pull = pull({ customerPhone: '0509999999' });
    H.config = { whatsapp_cs: { test_numbers: ['0501234567'] } };
    const out = await lookupOrder('acc-1', '1042', widgetClaim('0501234567'));
    expect(out.kind).toBe('unverified');
  });

  it('lookupOrdersByPhone: unverified → identity_required; claimed → searches by the CLAIMED phone', async () => {
    expect((await lookupOrdersByPhone('acc-1', widgetClaim(undefined))).kind).toBe('identity_required');
    vi.mocked(findBrandOrdersByPhone).mockResolvedValueOnce([row()] as any);
    const res = await lookupOrdersByPhone('acc-1', widgetClaim('0501234567'));
    expect(res.kind).toBe('found');
    expect(findBrandOrdersByPhone).toHaveBeenCalledWith('acc-1', '0501234567');
  });
});
