/**
 * Brand logo resolution by NAME.
 *
 * `brand_logos` is a global registry (normalized name + display name + aliases),
 * but the only thing that ever pointed at it was `partnerships.brand_logo_id` —
 * an FK someone has to set by hand. Standalone coupons had no path to it at all.
 * So a brand whose logo we already host showed up logo-less everywhere unless a
 * human had linked that one partnership row.
 *
 * These helpers close that gap at read time: given the brand name we already
 * have, find the registry row. Deterministic exact-key matching only — a wrong
 * logo is worse than no logo, so nothing here guesses by similarity.
 */

export interface BrandLogoRow {
  brand_name_normalized: string | null;
  display_name: string | null;
  logo_url: string | null;
  aliases: string[] | null;
}

export type BrandLogoIndex = Map<string, string>;

/**
 * One key shape for every spelling of a brand: case-folded, punctuation-collapsed,
 * latin diacritics stripped (LA BEAUTÉ → la beaute), Hebrew left alone.
 */
export function normalizeBrandKey(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // latin combining marks
    .replace(/[\u0591-\u05C7]/g, '') // hebrew niqqud / cantillation
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Registry rows → lookup keys. Rows without a logo are skipped entirely. */
export function buildBrandLogoIndex(rows: BrandLogoRow[]): BrandLogoIndex {
  const index: BrandLogoIndex = new Map();
  for (const row of rows || []) {
    const url = (row?.logo_url || '').trim();
    if (!url) continue;
    const names = [row.brand_name_normalized, row.display_name, ...(row.aliases || [])];
    for (const name of names) {
      const key = normalizeBrandKey(name || '');
      // First row wins — later duplicates never silently steal an existing key.
      if (key && !index.has(key)) index.set(key, url);
    }
  }
  return index;
}

/**
 * Candidate keys for one stored brand name, most specific first. Brand names in
 * the wild carry bilingual suffixes and slash-joined pairs — "Magnus (מגנוס)",
 * "Opticana / Cattleya" — that the registry doesn't list verbatim.
 */
function candidateKeys(brandName: string): string[] {
  const raw = (brandName || '').trim();
  if (!raw) return [];

  const variants: string[] = [raw];

  // "Magnus (מגנוס)" → "Magnus" + "מגנוס"
  const paren = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) variants.push(paren[1], paren[2]);

  // "Opticana / Cattleya" → each half, in written order
  for (const v of [...variants]) {
    if (v.includes('/')) variants.push(...v.split('/'));
  }

  const keys: string[] = [];
  const push = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  for (const v of variants) push(normalizeBrandKey(v));

  // Last resort: a sub-brand under a parent we do know — "Philips Sonicare" → "philips".
  // Only ever drops trailing words, so it can't wander to an unrelated brand.
  const words = keys[0]?.split(' ') || [];
  for (let i = words.length - 1; i >= 1; i--) push(words.slice(0, i).join(' '));

  return keys;
}

/** The registry logo for a brand name, or null when we genuinely don't have one. */
export function lookupBrandLogo(index: BrandLogoIndex, brandName: string): string | null {
  for (const key of candidateKeys(brandName)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}
