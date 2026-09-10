/**
 * Watch keywords — terms a brand asks us to count by name.
 *
 * These are counted from the conversation text, NOT from the keywords the
 * classifier extracts. The model's free extraction fragments a concept across
 * variants: Argania's "חסר" arrives as "מוצר חסר" (82), "מוצרים חסרים" (40),
 * "פריט חסר" (39), "יחידה חסרה" (6) and the bare word only 15 times, so a brand
 * looking for the word it named would see a number an order of magnitude too
 * small. Scanning the text gives one exact, reproducible count instead.
 *
 * Hebrew matching needs both ends of the word. A term is preceded by attached
 * prefixes (ש/ה/ו/ב/ל/כ/מ — "משלוח **ש**לא הגיע") and followed by inflection
 * ("חסר" → חסרים, חסרה). Measured on Argania's real corpus, ignoring prefixes
 * loses 25% of genuine hits, and every sampled example those extra matches
 * added was real.
 */

/** Hebrew letters. Deliberately excludes final forms' Latin lookalikes. */
const HEB = 'א-ת';

/** Letters that attach to the front of a Hebrew word. */
const PREFIXES = 'שהובלכמ';

/** Inflection suffixes are short: ים, ות, ה, ת. Two letters covers them. */
const MAX_SUFFIX = 2;

/** Two prefix letters is the realistic maximum ("ומה", "שבה"). */
const MAX_PREFIX = 2;

/** Terms per account. More than this and the section stops being scannable. */
export const MAX_WATCH_TERMS = 20;

/** A single character would match inside a large share of all messages. */
const MIN_TERM_LENGTH = 2;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Hebrew final forms and their regular counterparts. A letter switches to the
 * regular form the moment a suffix follows, so "פגום" inflects to "פגומים" —
 * a term ending in a final form can never match its own plural without this.
 * Both terms Einav asked for are affected (פגום, מפוצץ), and this is the same
 * ם≠מ trap that previously broke the complaint guard.
 */
const FINAL_FORM_PAIRS: Array<[string, string]> = [
  ['ם', 'מ'], ['ן', 'נ'], ['ץ', 'צ'], ['ף', 'פ'], ['ך', 'כ'],
];

/**
 * Replaces a trailing final-form letter (or its regular twin, in case the term
 * was typed that way) with a two-letter class accepting either. Only the LAST
 * character is relaxed: Hebrew final forms occur word-finally and nowhere else,
 * so this cannot loosen the middle of a word.
 */
function relaxTrailingFinalForm(escaped: string): string {
  const last = escaped.slice(-1);
  for (const [final, regular] of FINAL_FORM_PAIRS) {
    if (last === final || last === regular) {
      return `${escaped.slice(0, -1)}[${final}${regular}]`;
    }
  }
  return escaped;
}

/**
 * POSIX ERE pattern for `content ~ pattern` in Postgres. Every construct used
 * here means the same thing in JavaScript, so the unit tests exercising it with
 * RegExp are a faithful check of the database's behaviour.
 */
export function buildHebrewTermPattern(term: string): string {
  const escaped = relaxTrailingFinalForm(escapeRegex(term.trim()));
  return `(^|[^${HEB}])[${PREFIXES}]{0,${MAX_PREFIX}}${escaped}[${HEB}]{0,${MAX_SUFFIX}}([^${HEB}]|$)`;
}

export function normalizeWatchTerms(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim();
    if (t.length < MIN_TERM_LENGTH || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_WATCH_TERMS) break;
  }
  return out;
}

/** One watched term's counts for a period. */
export interface WatchKeywordCount {
  term: string;
  sessions: number;
  complaintSessions: number;
  otherSessions: number;
}

/**
 * Reads the watchlist off an account's config.
 * Empty list = the section is simply absent, not an error.
 */
export function watchTermsFromConfig(config: unknown): string[] {
  const analytics = (config as { conversation_analytics?: { watch_keywords?: unknown } } | null)
    ?.conversation_analytics;
  return normalizeWatchTerms(analytics?.watch_keywords);
}
