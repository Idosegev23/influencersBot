import { describe, it, expect, vi, beforeEach } from 'vitest';

// Query-shape-agnostic accounts fake: returns two CS-enabled brands for any select/rpc chain.
const BRANDS = [
  { id: 'acc-argania', config: { username: 'argania', display_name: 'Argania',
    whatsapp_cs: { enabled: true, aliases: ['ארגניה', 'argan'] }, widget: { domain: 'argania-oil.co.il' } } },
  { id: 'acc-labeaute', config: { username: 'labeaute', display_name: 'LA BEAUTÉ',
    whatsapp_cs: { enabled: true, aliases: ['לה בוטה'] }, widget: { domain: 'labeaute.co.il' } } },
];
function makeSupabase() {
  const api: any = {
    from() {
      const ctx: any = {};
      ctx.select = () => ctx; ctx.eq = () => ctx; ctx.filter = () => ctx; ctx.limit = () => ctx;
      ctx.then = (resolve: any) => resolve({ data: BRANDS, error: null });
      return ctx;
    },
    rpc: async () => ({ data: BRANDS, error: null }),
  };
  return api;
}
vi.mock('@/lib/supabase', () => ({ supabase: makeSupabase() }));

describe('brand-resolver', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listCsEnabledBrands returns only CS-enabled brands', async () => {
    const { listCsEnabledBrands } = await import('@/lib/cs/brand-resolver');
    const brands = await listCsEnabledBrands();
    expect(brands.map((b) => b.accountId).sort()).toEqual(['acc-argania', 'acc-labeaute']);
  });

  it('exact alias → single', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('ארגניה');
    expect(r.kind).toBe('single');
    expect(r.candidates[0].accountId).toBe('acc-argania');
  });

  it('English name + a small misspelling still resolves argania', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('argani');
    expect(['single', 'multi']).toContain(r.kind);
    expect(r.candidates.map((c) => c.accountId)).toContain('acc-argania');
  });

  it('gibberish → none', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('zzzzqqq-not-a-brand');
    expect(r.kind).toBe('none');
    expect(r.candidates).toEqual([]);
  });
});
