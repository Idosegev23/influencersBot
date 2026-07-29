import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRecommendations = vi.fn();
vi.mock('@/lib/recommendations/engine', () => ({
  getRecommendations: (...a: any[]) => getRecommendations(...a),
  // Real-ish: reject category/listing URLs the way engine.ts does, so the tool's own re-check is
  // exercised rather than stubbed away.
  isValidProductUrl: (u: string | null | undefined) => !!u && /\/product\//.test(u),
}));
vi.mock('@/lib/whatsapp-cloud/client', () => ({ toWaId: (s: string) => s.replace(/\D/g, '') }));
vi.mock('@/lib/cs/brand-resolver', () => ({ resolveBrand: vi.fn(), listCsEnabledBrands: vi.fn() }));
vi.mock('@/lib/orders/lookup', () => ({ lookupOrder: vi.fn(), lookupOrdersByPhone: vi.fn() }));
vi.mock('@/lib/cs/cs-ticket', () => ({ openOrAttachCsTicket: vi.fn(), appendCsTicketHistory: vi.fn() }));
vi.mock('@/lib/handoff/bot-pause', () => ({ pauseBot: vi.fn(), isBotPaused: vi.fn(), resumeBot: vi.fn() }));
vi.mock('@/engines/escalation/dispatch', () => ({ runCsHandoffCheck: vi.fn() }));

const H: any = { account: null };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const c: any = {};
      c.select = () => c; c.eq = () => c; c.in = () => c; c.order = () => c; c.limit = () => c;
      c.single = async () => ({ data: table === 'accounts' ? H.account : null, error: null });
      c.then = (r: any) => r({ data: [], error: null });
      return c;
    },
  },
}));

const enabled = () => ({ config: { whatsapp_cs: { enabled: true, products_enabled: true } } });
const disabled = () => ({ config: { whatsapp_cs: { enabled: true } } });

const ctx = (over: any = {}) => ({
  waId: '972501112222', accountId: 'acc-1', chatSessionId: 'cs-1', ticketId: 't1',
  customerName: 'דנה', senderPhone: '972501112222', ...over,
} as any);

const product = (over: any = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Castor Conditioner', nameHe: 'מרכך קיק 450 מל',
  price: 45.9, originalPrice: null, isOnSale: false,
  productUrl: 'https://argania-oil.co.il/product/castor-conditioner',
  imageUrl: 'https://cdn.example.com/a.webp',
  recommendedFor: 'לשיער יבש', aiWhy: 'מרכך עשיר',
  ...over,
});

const tool = async (name: string) => {
  const { getCsTools } = await import('@/lib/cs/tools');
  const t = getCsTools().find((x) => x.def.function.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

describe('CS product tools', () => {
  beforeEach(() => { vi.clearAllMocks(); H.account = enabled(); });

  it('exposes search_products + show_products', async () => {
    const { CS_TOOL_DEFS } = await import('@/lib/cs/tools');
    const names = CS_TOOL_DEFS.map((d) => d.function.name);
    expect(names).toContain('search_products');
    expect(names).toContain('show_products');
  });

  describe('search_products', () => {
    it('refuses before a brand is bound — an unbound search has no catalog to scope to', async () => {
      const t = await tool('search_products');
      const res = await t.handler({ query: 'שיער יבש' }, ctx({ accountId: null }));
      expect(res.ok).toBe(false);
      expect((res.data as any).reason).toBe('no_brand_bound');
      expect(getRecommendations).not.toHaveBeenCalled();
    });

    it('refuses when the brand has not opted in', async () => {
      H.account = disabled();
      const t = await tool('search_products');
      const res = await t.handler({ query: 'שיער יבש' }, ctx());
      expect(res.ok).toBe(false);
      expect((res.data as any).reason).toBe('products_disabled');
      expect(getRecommendations).not.toHaveBeenCalled();
    });

    it('returns refs WITHOUT urls or image urls, so the brain cannot paste a raw link', async () => {
      getRecommendations.mockResolvedValue({ products: [product(), product({ id: '22222222-2222-2222-2222-222222222222', nameHe: 'שמן ארגן' })] });
      const t = await tool('search_products');
      const c = ctx();
      const res = await t.handler({ query: 'שיער יבש' }, c);
      expect(res.ok).toBe(true);
      const data: any = res.data;
      expect(data.products.map((p: any) => p.ref)).toEqual(['p1', 'p2']);
      expect(JSON.stringify(data)).not.toContain('argania-oil.co.il');
      expect(JSON.stringify(data)).not.toContain('.webp');
      // The full records (with urls) live on the per-turn ctx for show_products to resolve.
      expect(c.productCandidates).toHaveLength(2);
      expect(c.productCandidates[0].productUrl).toContain('/product/');
    });

    it('drops products with no image or a category-only url — an unsendable card must never be offerable', async () => {
      getRecommendations.mockResolvedValue({ products: [
        product(),
        product({ id: '22222222-2222-2222-2222-222222222222', imageUrl: null }),
        product({ id: '33333333-3333-3333-3333-333333333333', productUrl: 'https://argania-oil.co.il/category/hair' }),
      ] });
      const t = await tool('search_products');
      const c = ctx();
      const res = await t.handler({ query: 'שיער' }, c);
      expect((res.data as any).products).toHaveLength(1);
      expect(c.productCandidates).toHaveLength(1);
    });

    it('keeps each "why" pinned to its own product after filtering', async () => {
      getRecommendations.mockResolvedValue({ products: [
        product({ id: '22222222-2222-2222-2222-222222222222', imageUrl: null, recommendedFor: 'לשיער שמן' }),   // dropped
        product({ nameHe: 'מרכך קיק 450 מל', recommendedFor: 'לשיער יבש' }),
      ] });
      const t = await tool('search_products');
      const res = await t.handler({ query: 'שיער' }, ctx());
      expect((res.data as any).products).toEqual([
        expect.objectContaining({ ref: 'p1', name: 'מרכך קיק 450 מל', why: 'לשיער יבש' }),
      ]);
    });

    it('clamps limit to 1..8 and passes the bound account through', async () => {
      getRecommendations.mockResolvedValue({ products: [] });
      const t = await tool('search_products');
      await t.handler({ query: 'שיער', limit: 99 }, ctx());
      expect(getRecommendations).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1', maxResults: 8 }));
    });

    it('an engine failure is reported, not thrown', async () => {
      getRecommendations.mockRejectedValue(new Error('boom'));
      const t = await tool('search_products');
      const res = await t.handler({ query: 'שיער' }, ctx());
      expect(res.ok).toBe(false);
      expect((res.data as any).reason).toBe('search_failed');
    });
  });

  describe('show_products', () => {
    const withCandidates = async () => {
      getRecommendations.mockResolvedValue({ products: [
        product(),
        product({ id: '22222222-2222-2222-2222-222222222222', nameHe: 'שמן ארגן' }),
        product({ id: '33333333-3333-3333-3333-333333333333', nameHe: 'מסיכה' }),
        product({ id: '44444444-4444-4444-4444-444444444444', nameHe: 'סרום' }),
      ] });
      const c = ctx();
      const search = await tool('search_products');
      await search.handler({ query: 'שיער' }, c);
      return c;
    };

    it('resolves refs to cards in the order the brain asked for', async () => {
      const c = await withCandidates();
      const t = await tool('show_products');
      const res = await t.handler({ refs: ['p3', 'p1'] }, c);
      expect(res.ok).toBe(true);
      expect(res.cards!.map((x) => x.name)).toEqual(['מסיכה', 'מרכך קיק 450 מל']);
    });

    it('caps at 3 cards and drops duplicate or unknown refs', async () => {
      const c = await withCandidates();
      const t = await tool('show_products');
      const res = await t.handler({ refs: ['p1', 'p1', 'p9', 'p2', 'p3', 'p4'] }, c);
      expect(res.cards).toHaveLength(3);
      expect(res.cards!.map((x) => x.productId)).toEqual([
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
      ]);
    });

    it('refuses when search_products has not run this turn — refs can never address an earlier turn', async () => {
      const t = await tool('show_products');
      const res = await t.handler({ refs: ['p1'] }, ctx());
      expect(res.ok).toBe(false);
      expect((res.data as any).reason).toBe('call_search_products_first');
      expect(res.cards).toBeUndefined();
    });

    it('refuses when no ref resolves', async () => {
      const c = await withCandidates();
      const t = await tool('show_products');
      const res = await t.handler({ refs: ['p42', 'nope'] }, c);
      expect(res.ok).toBe(false);
      expect((res.data as any).reason).toBe('no_matching_refs');
    });

    it('honors the per-brand gate even after a successful search', async () => {
      const c = await withCandidates();
      H.account = disabled();
      const t = await tool('show_products');
      const res = await t.handler({ refs: ['p1'] }, c);
      expect(res.ok).toBe(false);
      expect((res.data as any).reason).toBe('products_disabled');
    });
  });
});
