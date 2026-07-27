/**
 * Buyable-link catalog for the chat prompt.
 *
 * The bot's product answers were accurate — right names, right prices — and then
 * dead-ended, because nothing in its context carried a URL. Measured on Argania
 * 2026-07-21 → 07-27: 35 of 1,024 assistant messages contained any link at all,
 * and customers said so out loud ("אבקש קישור לגלייז", "אני לא מצליחה לחזור לקניה").
 *
 * widget_products already holds every product with product_url + image_url (128/128
 * for Argania), it was just never wired into the chat knowledge base. This module
 * turns it into a compact prompt block.
 */

// NOTE: '@/lib/supabase' is imported lazily inside loadProductLinkCatalog. It
// throws at module load when env vars are absent, which would drag the pure
// selection/rendering helpers below into needing a live environment to test.

export interface ProductLink {
  name: string;
  url: string;
  price: string | null;
  currency: string | null;
  isAvailable: boolean;
}

/** Prompt cost guard — the full catalog on every turn is wasteful. */
export const DEFAULT_CATALOG_LIMIT = 12;

const STOPWORDS = new Set([
  'מה', 'של', 'עם', 'על', 'לי', 'זה', 'יש', 'את', 'אני', 'הכי', 'לא', 'כן',
  'מתאים', 'מומלץ', 'רוצה', 'אפשר', 'איזה', 'האם', 'צריך', 'שלי', 'טוב',
]);

function tokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Overlap score between the question and a product name. Substring-aware so
 *  Hebrew prefixes ("לשיער" vs "שיער") still match without a stemmer. */
function score(product: ProductLink, queryTokens: string[]): number {
  const nameTokens = tokens(product.name);
  let s = 0;
  for (const q of queryTokens) {
    for (const n of nameTokens) {
      if (n === q) s += 2;
      else if (n.includes(q) || q.includes(n)) s += 1;
    }
  }
  return s;
}

export function selectRelevantProducts(
  catalog: ProductLink[],
  userMessage: string,
  limit: number = DEFAULT_CATALOG_LIMIT,
): ProductLink[] {
  // Never surface something the customer can't actually buy.
  const buyable = catalog.filter((p) => p.isAvailable && p.url);
  const q = tokens(userMessage);
  const ranked = buyable
    .map((p) => ({ p, s: score(p, q) }))
    .sort((a, b) => b.s - a.s);
  // Even with zero overlap we return a slice: a generic answer with a real link
  // still beats an answer the customer has to go hunting from.
  return ranked.slice(0, limit).map((r) => r.p);
}

export function renderProductCatalogBlock(products: ProductLink[]): string {
  if (!products.length) return '';
  const lines = products
    .map((p) => {
      const price = p.price ? ` — ₪${p.price}` : '';
      return `• ${p.name}${price} → ${p.url}`;
    })
    .join('\n');

  return `\n🛒 מוצרים עם קישור לרכישה (הרשימה הזו היא המקור היחיד לקישורים — אסור להמציא כתובת URL):
${lines}

• כשאת/ה ממליץ/ה על מוצר מהרשימה — הפוך/י את שם המוצר לקישור בפורמט מרקדאון: [שם המוצר](הכתובת).
• מוצר שלא ברשימה — אפשר להזכיר בשם, אבל בלי קישור.
• אל תדחוף/י קישורים לתשובה שאינה המלצה על מוצר.`;
}

/** Loads the account's buyable catalog. Returns [] on any failure — a missing
 *  catalog must degrade to today's behaviour (no links), never break the turn. */
export async function loadProductLinkCatalog(accountId: string): Promise<ProductLink[]> {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase
      .from('widget_products')
      .select('name, name_he, price, currency, product_url, is_available, priority')
      .eq('account_id', accountId)
      .not('product_url', 'is', null)
      .order('priority', { ascending: false })
      .limit(400);
    if (error) {
      console.warn('[product-links] load failed:', error.message);
      return [];
    }
    return (data || []).map((r: any) => ({
      name: r.name_he || r.name,
      url: r.product_url,
      price: r.price != null ? String(r.price) : null,
      currency: r.currency || null,
      isAvailable: r.is_available !== false,
    })).filter((p: ProductLink) => p.name && p.url);
  } catch (e) {
    console.warn('[product-links] load threw:', (e as Error).message);
    return [];
  }
}
