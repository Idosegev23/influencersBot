import { describe, it, expect, vi, beforeEach } from 'vitest';

// Two CS-enabled brands, one CS-disabled (must be excluded).
const ROWS = [
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

// Hand-rolled chainable Supabase fake. The resolver fetches CS-enabled rows
// via a JSONB filter; our fake returns only the two enabled rows.
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

describe('brand-resolver', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('exact English match → single, high score', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('argania');
    expect(r.kind).toBe('single');
    expect(r.candidates[0].accountId).toBe('acc-argania');
    expect(r.candidates[0].score).toBeGreaterThan(0.8);
  });

  it('Hebrew alias match resolves to the right brand', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('ארגניה');
    expect(r.kind).toBe('single');
    expect(r.candidates[0].accountId).toBe('acc-argania');
  });

  it('misspelling still matches above threshold', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    // A genuine typo (transposed letters), NOT the exact spelling — proves the trigram matcher's
    // fuzzy tolerance, its core value.
    const r = await resolveBrand('argnaia');
    expect(r.candidates[0].accountId).toBe('acc-argania');
    expect(r.candidates[0].score).toBeGreaterThan(0.34); // > MATCH_THRESHOLD
  });

  it('no similarity → none', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    const r = await resolveBrand('qwertyphone');
    expect(r.kind).toBe('none');
    expect(r.candidates).toEqual([]);
  });

  it('preferAccountIds pulls a returning brand to the front on a tie', async () => {
    const { resolveBrand } = await import('@/lib/cs/brand-resolver');
    // Ambiguous-ish query touching both; preference decides ordering.
    const r = await resolveBrand('la', { preferAccountIds: ['acc-labeaute'] });
    expect(r.candidates[0].accountId).toBe('acc-labeaute');
  });

  // Supplementary test (not from the brief): the query above only ever surfaces one
  // candidate above MATCH_THRESHOLD, so it doesn't actually exercise the near-tie
  // reordering branch. This one is engineered so BOTH brands clear the threshold with
  // scores within 0.05 of each other, and argania naturally scores higher — proving
  // preferAccountIds genuinely flips the ranking rather than just picking the sole hit.
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
});
