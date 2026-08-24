/**
 * Resolves a free-text mention onto a product LINE (סדרה).
 *
 * Argania's first retro showed why this exists: customers overwhelmingly name a
 * series, not a SKU — "סדרת קיק", "מי חומצה היאלורונית וקרטין", "סדרת קוקוס
 * וחומצות אומגה". Those mentions can never match a single product, so exact SKU
 * matching left 2.6% of complaints attributed. A line is a real, correct answer
 * to "which range is generating the complaints".
 *
 * Unlike the SKU resolver this deliberately allows a CONTAINS match: "מסכת קיק"
 * genuinely names the קיק line. The Panda/Pandora protection is kept in two
 * other ways — a line name must appear in full, and names shorter than three
 * characters are ignored so a stray token cannot sweep up unrelated sentences.
 */

export interface SeriesProduct {
  id: string;
  product_line?: string | null;
}

export interface SeriesIndex {
  /** normalized key → canonical display label */
  byKey: Map<string, string>;
  /** keys longest-first, so the most specific line wins an overlap */
  keysByLength: string[];
  labels: string[];
}

/** Shortest line name we will look for inside a sentence. */
const MIN_KEY_LENGTH = 3;

/**
 * "סדרת קיק" and "קיק" are the same line; so are
 * "חומצה היאלורונית וקרטין" and "סדרת חומצה היאלורונית קרטין".
 * Strip the series prefix, drop the conjunctive ו־, collapse whitespace.
 */
function normalize(s: string): string {
  return s
    .trim()
    .replace(/^סדרת\s+/u, '')
    .replace(/[\s ]+/g, ' ')
    .replace(/\s*[&]\s*/g, ' ')
    .replace(/\bו(?=[א-ת])/gu, '')
    .replace(/[A-Za-z]+/g, (m) => m.toLowerCase())
    .trim();
}

export function buildSeriesIndex(products: SeriesProduct[]): SeriesIndex {
  const byKey = new Map<string, string>();
  const counts = new Map<string, Map<string, number>>();

  for (const p of products) {
    if (!p.product_line) continue;
    const label = p.product_line.trim();
    if (!label) continue;
    const key = normalize(label);
    if (key.length < MIN_KEY_LENGTH) continue;

    // Remember how often each spelling appears so the canonical label is the
    // one the catalog actually uses most, not whichever row came first.
    const perLabel = counts.get(key) || new Map<string, number>();
    perLabel.set(label, (perLabel.get(label) || 0) + 1);
    counts.set(key, perLabel);
  }

  for (const [key, perLabel] of counts) {
    const best = [...perLabel.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0][0];
    byKey.set(key, best);
  }

  const keysByLength = [...byKey.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  return { byKey, keysByLength, labels: [...new Set(byKey.values())].sort() };
}

export function resolveSeries(index: SeriesIndex, mention: string | null | undefined): string | null {
  if (typeof mention !== 'string') return null;
  const hay = normalize(mention);
  if (!hay) return null;

  // Longest key first: "שמן ארגן וחומצה היאלורונית" must win over "ארגן".
  for (const key of index.keysByLength) {
    if (hay.includes(key)) return index.byKey.get(key)!;
  }
  return null;
}

/** Stable listing of the account's lines, for the model's cacheable prefix. */
export function seriesCatalogPrompt(index: SeriesIndex): string {
  return index.labels.map((l) => `- ${l}`).join('\n');
}
