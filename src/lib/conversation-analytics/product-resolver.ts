/**
 * Maps a free-text product mention onto a catalog row.
 *
 * Exact-key only: the normalised mention must equal a normalised name, Hebrew
 * name or slug. No fuzzy matching, no embeddings, and the model never picks the
 * SKU itself — it only reports what the customer wrote. This is the brand_logos
 * lesson: fuzzy matching happily mapped Panda onto Pandora, and a silently wrong
 * product attribution is worse for the brand than an honest "unidentified".
 */

export interface CatalogProduct {
  id: string;
  name: string | null;
  name_he: string | null;
  slug: string | null;
  category: string | null;
}

export interface ProductIndex {
  byKey: Map<string, CatalogProduct>;
  products: CatalogProduct[];
}

/** Collapse whitespace, lowercase latin, strip surrounding punctuation. */
function key(s: string): string {
  return s
    .trim()
    .replace(/[\s ]+/g, ' ')
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '')
    .replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
}

export function buildProductIndex(products: CatalogProduct[]): ProductIndex {
  const byKey = new Map<string, CatalogProduct>();
  for (const p of products) {
    for (const candidate of [p.name, p.name_he, p.slug]) {
      if (!candidate) continue;
      const k = key(candidate);
      if (!k) continue;
      // First writer wins: a duplicate key across two SKUs is ambiguous, and
      // guessing between them is exactly what this module refuses to do.
      if (!byKey.has(k)) byKey.set(k, p);
    }
  }
  return { byKey, products };
}

export function resolveProduct(
  index: ProductIndex,
  mention: string | null | undefined
): { productId: string | null; category: string | null } {
  if (typeof mention !== 'string') return { productId: null, category: null };
  const k = key(mention);
  if (!k) return { productId: null, category: null };
  const hit = index.byKey.get(k);
  return hit ? { productId: hit.id, category: hit.category } : { productId: null, category: null };
}

/**
 * The catalog block for the model's system prefix. Sorted so the string is
 * byte-identical between runs — otherwise the prompt cache never hits and the
 * catalog costs 10x more per call.
 */
export function productCatalogPrompt(index: ProductIndex): string {
  const names = new Set<string>();
  for (const p of index.products) {
    const label = p.name_he || p.name || p.slug;
    if (label) names.add(label.trim());
  }
  return [...names].sort().map((n) => `- ${n}`).join('\n');
}
