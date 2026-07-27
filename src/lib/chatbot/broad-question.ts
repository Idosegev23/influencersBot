/**
 * Detects a broad, information-free opening question — the kind the starter
 * chips produce ("מה מתאים לשיער יבש?").
 *
 * Why it matters (Argania, 2026-07-21 → 07-27): 366 of 500 conversations opened
 * with one of four such chips. 63.7% of those ended after a single exchange,
 * versus 49.3% for free-typed openers, because the bot answered a generic
 * question generically and there was nothing left to say. Conversations where
 * the bot asked one diagnostic question back ran ~5 turns.
 */

/** "what suits / what's recommended / what's good for <category>" */
const BROAD_PATTERNS: RegExp[] = [
  /^מה\s+(?:מתאים|מומלץ|טוב|כדאי|הכי טוב)\s+ל/,
  /^מה\s+(?:מתאים|מומלץ|טוב)\b/,
  /^איזה\s+(?:מוצר|מוצרים|סדרה|מארז)\s+(?:מתאים|מומלץ|כדאי)/,
  /^what(?:'s| is)?\s+(?:good|recommended|suitable)\s+for/i,
];

/** Signals the customer already gave enough to recommend against — asking a
 *  diagnostic question back would be redundant and annoying. */
const SPECIFIC_SIGNALS: RegExp[] = [
  /נשירה|דלילות|יובש|פריז|פריד|קשקשים|מפוצל|שבירה|שומני|קרקפת/,
  /החלקה|גוונים|צבוע|קרטין|בלונד|סילבר/,
  /ההבדל בין|מה ההבדל/,
  /טבעוני|מלחים|רכיבים|sls/i,
  /משלוח|הזמנה|מחיר|כמה עולה|החזר/,
];

/**
 * @param message      the visitor's message
 * @param priorTurns   number of messages already in the session (0 = opener)
 */
export function isBroadOpeningQuestion(message: string, priorTurns: number): boolean {
  const text = (message || '').trim();
  if (!text) return false;
  // Only the opener: mid-conversation the bot already has context.
  if (priorTurns > 0) return false;

  const isBroad = BROAD_PATTERNS.some((re) => re.test(text));
  if (!isBroad) return false;

  // "מה מתאים לשיער יבש?" is broad; "מה מתאים לשיער יבש שעבר החלקה וגם נושר"
  // already names the problem — recommend, don't interrogate. The opener's own
  // category word is part of the pattern match, so count signals beyond it.
  const specificHits = SPECIFIC_SIGNALS.filter((re) => re.test(text)).length;
  return specificHits <= 1;
}
