import { describe, it, expect, vi, beforeEach } from 'vitest';

const findBrandOrderByNumber = vi.fn();
const pull = vi.fn();
vi.mock('@/lib/orders/brand-orders', () => ({
  findBrandOrderByNumber,
  findBrandOrdersByPhone: vi.fn(),
  upsertBrandOrder: vi.fn(),
  upsertBrandOrders: vi.fn(),
}));
// lookup.ts side-effect-imports these adapters to self-register with the (here mocked) registry;
// stub them out so that real self-registration never runs against our mock (matches lookup-order.test.ts).
vi.mock('@/lib/orders/connectors/quickshop', () => ({}));
vi.mock('@/lib/orders/connectors/shopify', () => ({}));
vi.mock('@/lib/orders/connectors/registry', () => ({
  getConnector: () => ({ platform: 'quickshop', supportsDirectLookup: false, pull }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: {} } }) }) }) }) },
}));

describe('lookupOrder phone-verify', () => {
  beforeEach(() => { vi.clearAllMocks(); findBrandOrderByNumber.mockResolvedValue({ id: 'b1', external_id: 'qs1', source_platform: 'quickshop' }); });

  it('returns not_found when brand_orders has no row', async () => {
    findBrandOrderByNumber.mockResolvedValueOnce(null);
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const r = await lookupOrder('a1', '1042', '972501234567');
    expect(r.kind).toBe('not_found');
  });

  it('found when order phone matches the sender', async () => {
    pull.mockResolvedValue({ orderNumber: '1042', customerPhone: '0501234567', lineItems: [], status: 'open' });
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const r = await lookupOrder('a1', '1042', '972501234567');
    expect(r.kind).toBe('found');
  });

  it('unverified when order phone does NOT match the sender', async () => {
    pull.mockResolvedValue({ orderNumber: '1042', customerPhone: '0509999999', lineItems: [], status: 'open' });
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const r = await lookupOrder('a1', '1042', '972501234567');
    expect(r.kind).toBe('unverified');
  });

  it('found (revealed) when the order carries no phone', async () => {
    pull.mockResolvedValue({ orderNumber: '1042', customerPhone: null, lineItems: [], status: 'open' });
    const { lookupOrder } = await import('@/lib/orders/lookup');
    const r = await lookupOrder('a1', '1042', '972501234567');
    expect(r.kind).toBe('found');
  });
});
