import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable fixture the fake Supabase client reads live — lets individual tests swap in a different
// roster (e.g. a large one for the top-K narrowing test, or one missing aliases) without re-mocking.
let ROWS: any[] = [];
function useSmallRoster() {
  ROWS = [
    { id: 'acc-argania', config: {
      username: 'argania', display_name: 'Argania',
      whatsapp_cs: { enabled: true, aliases: ['ארגניה', 'argan'] },
      widget: { domain: 'argania-oil.co.il' },
    } },
    { id: 'acc-labeaute', config: {
      username: 'labeaute', display_name: 'LA BEAUTÉ',
      whatsapp_cs: { enabled: true, aliases: ['לה בוטה'] },
      domain: 'labeaute.co.il',
    } },
    { id: 'acc-off', config: {
      username: 'studiopasha', display_name: 'Studio Pasha',
      whatsapp_cs: { enabled: false },
    } },
  ];
}
useSmallRoster();

// Hand-rolled chainable Supabase fake. The resolver fetches CS-enabled rows via a JSONB filter;
// our fake filters ROWS the same way the real `config->whatsapp_cs->>enabled = 'true'` query would.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const ctx: any = {};
      ctx.select = () => ctx;
      ctx.filter = () => ctx;
      ctx.eq = () => ctx;
      ctx.then = (resolve: any) =>
        resolve({ data: ROWS.filter((r) => r.config?.whatsapp_cs?.enabled === true), error: null });
      return ctx;
    },
  },
}));

describe('brand-resolver (brain-led)', () => {
  beforeEach(() => { vi.clearAllMocks(); useSmallRoster(); });

  it('trigramSimilarity is 1 for identical, 0 for disjoint', async () => {
    const { trigramSimilarity } = await import('@/lib/cs/brand-resolver');
    expect(trigramSimilarity('argania', 'argania')).toBe(1);
    expect(trigramSimilarity('argania', 'zzzzzz')).toBe(0);
  });

  it('listCsEnabledBrands returns only enabled brands', async () => {
    const { listCsEnabledBrands } = await import('@/lib/cs/brand-resolver');
    const brands = await listCsEnabledBrands();
    expect(brands.map((b) => b.accountId).sort()).toEqual(['acc-argania', 'acc-labeaute']);
  });

  // (a) Brain-led contract: a small CS-enabled roster (<= MAX_INLINE) is returned WHOLESALE — no
  // score gate, and aliases are entirely absent from this roster — proving they're never required.
  it('small roster with NO aliases configured still returns ALL enabled brands, regardless of query', async () => {
    delete ROWS[0].config.whatsapp_cs.aliases;
    delete ROWS[1].config.whatsapp_cs.aliases;
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('anything');
    expect(r.kind).toBe('multi');
    expect(r.candidates.map((c) => c.accountId).sort()).toEqual(['acc-argania', 'acc-labeaute']);
  });

  it('a query with no fuzzy similarity to any brand STILL returns the whole small roster (no threshold drop)', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('qwertyphone');
    expect(r.kind).toBe('multi');
    expect(r.candidates.map((c) => c.accountId).sort()).toEqual(['acc-argania', 'acc-labeaute']);
  });

  it('zero CS-enabled brands → none', async () => {
    ROWS = [];
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('argania');
    expect(r).toEqual({ kind: 'none', candidates: [] });
  });

  it('exact English match still ranks the intended brand first (score is informational, not a gate)', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('argania');
    expect(r.kind).toBe('multi'); // both CS-enabled brands come back — the brain picks
    expect(r.candidates[0].accountId).toBe('acc-argania');
    expect(r.candidates[0].score).toBeGreaterThan(0.8);
  });

  it('Hebrew alias, when configured, is used as an extra ranking signal (never required)', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('ארגניה');
    expect(r.kind).toBe('multi');
    expect(r.candidates[0].accountId).toBe('acc-argania');
  });

  it('a genuine typo still ranks the intended brand first', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    // Transposed letters, NOT the exact spelling — proves fuzzy tolerance still helps ranking even
    // though it no longer gates inclusion.
    const r = await resolveBrand('argnaia');
    expect(r.candidates[0].accountId).toBe('acc-argania');
    expect(r.candidates[0].score).toBeGreaterThan(0.3);
  });

  it('preferAccountIds pulls a returning brand to the front on a tie', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('la', { preferAccountIds: ['acc-labeaute'] });
    expect(r.candidates[0].accountId).toBe('acc-labeaute');
  });

  // Supplementary (not from the brief): the query above only ever surfaces the near-tie logic
  // incidentally, so this one is engineered so BOTH brands score within 0.05 of each other, with
  // argania naturally higher — proving preferAccountIds genuinely flips the ranking.
  it('preferAccountIds flips order on a genuine near-tie between two qualifying candidates', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const query = 'argani labeau';

    const noPref = await resolveBrand(query);
    expect(noPref.candidates.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(noPref.candidates[0].score - noPref.candidates[1].score)).toBeLessThan(0.05);
    expect(noPref.candidates[0].accountId).toBe('acc-argania'); // higher raw score, no preference

    const withPref = await resolveBrand(query, { preferAccountIds: ['acc-labeaute'] });
    expect(withPref.candidates[0].accountId).toBe('acc-labeaute'); // preference wins the near-tie
  });

  // (c) Brain-led contract: past MAX_INLINE, inlining the whole roster would blow up the
  // prompt/tool payload — narrow to a bounded shortlist by fuzzy score instead, but never so
  // aggressively that the shopper's actual brand falls out of the shortlist.
  it("large roster (> MAX_INLINE) narrows to top-K, keeping the query's best match", async () => {
    const { resolveBrand, MAX_INLINE, TOP_K } = await import('@/lib/cs/brand-resolver');
    ROWS = Array.from({ length: MAX_INLINE + 10 }, (_, i) => ({
      id: `acc-filler-${i}`,
      config: { username: `filler${i}`, display_name: `Filler Brand ${i}`, whatsapp_cs: { enabled: true } },
    }));
    ROWS.push({ id: 'acc-argania', config: {
      username: 'argania', display_name: 'Argania',
      whatsapp_cs: { enabled: true }, widget: { domain: 'argania-oil.co.il' },
    } });

    const r = await resolveBrand('argania');
    expect(r.candidates.length).toBeLessThanOrEqual(TOP_K);
    expect(r.candidates[0].accountId).toBe('acc-argania');
  });
});
