/**
 * Pure interpreters for the agent WhatsApp conversation (heuristics; the engine
 * layers an AI fallback on top for ambiguous replies). Dependency-free + tested.
 */

// Exact-token matching — \b word boundaries don't work around Hebrew (non-\w) chars.
const YES_WORDS = new Set([
  'כן', 'בטח', 'בסדר', 'סבבה', 'כמובן', 'אישור', 'מאשר', 'נכון', 'יאללה', 'בטוח', 'אוקיי', 'אוקי', 'נבנה',
  'ok', 'okay', 'yes', 'yep', 'yeah', 'בנה', 'תבנה', 'תבני', 'לבנות', 'שלח', 'שלחי', 'תשלח', 'תשלחי', 'לשלוח',
  'תעשה', 'תעשי', 'עשה', 'קדימה', 'אפשר', 'צור', 'תוציא', 'אשר', 'בוא', 'נמשיך', 'ליצור', 'תבצע', 'go', 'sure',
]);
const NO_WORDS = new Set(['לא', 'ביטול', 'בטל', 'עזוב', 'לאו', 'no', 'nope', 'not']);

function tokens(t: string): string[] {
  return (t || '').toLowerCase().split(/[\s,.!?;:()\-]+/).filter(Boolean);
}

export function interpretYesNo(text: string): 'yes' | 'no' | 'unclear' {
  const toks = tokens(text);
  if (!toks.length) return 'unclear';
  const hasYes = toks.some((w) => YES_WORDS.has(w));
  const hasNo = toks.some((w) => NO_WORDS.has(w));
  if (hasNo && !hasYes) return 'no';
  if (hasYes && !hasNo) return 'yes';
  return 'unclear';
}

/** Extract positive numbers, understanding 20,000 / 20000 / 20k / 20 אלף. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,.]*)\s*(k|K|אלף|אלפים)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (m[2]) n *= 1000;
    if (n > 0) out.push(Math.round(n));
  }
  return out;
}

export interface PricingResult {
  mode: 'total' | 'per_line' | 'unclear';
  total?: number;
  prices?: number[];
  needsConfirmation?: boolean; // any amount was bare-scaled / below-min → read back
}

/** Interpret a pricing reply against the number of deliverables. */
export function interpretPricing(text: string, deliverableCount: number): PricingResult {
  const nums = extractNumbers(text || '');
  if (nums.length === 0) return { mode: 'unclear' };

  if (deliverableCount > 1 && nums.length === deliverableCount) {
    const norm = nums.map((n) => normalizeAmount(n, { scaleBare: true }));
    return { mode: 'per_line', prices: norm.map((x) => x.amount), needsConfirmation: norm.some((x) => x.needsConfirmation) };
  }
  if (nums.length === 1) {
    const n = normalizeAmount(nums[0], { scaleBare: true });
    return { mode: 'total', total: n.amount, needsConfirmation: n.needsConfirmation };
  }
  return { mode: 'unclear' };
}

// ───────────────────────── canonical money normalization ─────────────────────────
export const AMOUNT_MIN_REASONABLE = 1000;
export const BARE_THOUSANDS_SCALE = 1000;
export const AMOUNT_ANOMALY_FACTOR = 6;

export interface NormalizeAmountOptions {
  thousands?: boolean; // an explicit k/אלף marker sat next to the number
  scaleBare?: boolean; // pricing context: a bare number < min means thousands
  history?: number[]; // prior amounts for this talent/brand (anomaly gate)
}
export interface NormalizedAmount {
  amount: number;
  needsConfirmation: boolean;
  reason: null | 'below_min' | 'bare_scaled' | 'anomalous';
}

function median(nums: number[]): number {
  const a = nums.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * The single source of truth for a money amount. Domain rule: in this
 * influencer-agency pricing context a bare small number means thousands of ₪.
 * Explicit markers (k/אלף) are trusted; a bare-scaled / below-min / anomalous
 * amount is flagged needsConfirmation so the engine reads it back before issuing.
 */
export function normalizeAmount(value: number, opts: NormalizeAmountOptions = {}): NormalizedAmount {
  let amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount: 0, needsConfirmation: true, reason: 'below_min' };
  }
  let reason: NormalizedAmount['reason'] = null;
  let needsConfirmation = false;

  if (opts.thousands) {
    amount = amount * 1000; // explicit marker → trust it
  } else if (opts.scaleBare && amount < AMOUNT_MIN_REASONABLE) {
    amount = amount * BARE_THOUSANDS_SCALE; // "80" → 80,000
    reason = 'bare_scaled';
    needsConfirmation = true; // guessed a magnitude → read back
  }

  if (amount < AMOUNT_MIN_REASONABLE) {
    reason = 'below_min';
    needsConfirmation = true;
  }

  if (!needsConfirmation && opts.history && opts.history.length) {
    const med = median(opts.history);
    if (med > 0 && (amount > med * AMOUNT_ANOMALY_FACTOR || amount < med / AMOUNT_ANOMALY_FACTOR)) {
      reason = 'anomalous';
      needsConfirmation = true;
    }
  }
  return { amount: Math.round(amount), needsConfirmation, reason };
}

// Hebrew round-amount vocabulary used in pricing (units, tens, hundreds, scales).
const HE_ONES: Record<string, number> = {
  אחד: 1, אחת: 1, שתיים: 2, שניים: 2, שתי: 2, שני: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4,
  חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9,
};
const HE_TENS: Record<string, number> = {
  עשר: 10, עשרה: 10, עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90,
};
const HE_HUNDREDS: Record<string, number> = { מאה: 100, מאתיים: 200 };

/** Turn a leading run of Hebrew number-words into a value, or 0 if none. */
function hebrewWordValue(words: string[]): number {
  let total = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (HE_HUNDREDS[w] != null) { total += HE_HUNDREDS[w]; continue; }
    if (w === 'מאות' && HE_ONES[words[i - 1]]) { total += (HE_ONES[words[i - 1]] - 1) * 100; continue; }
    if (HE_TENS[w] != null) { total += HE_TENS[w]; continue; }
    if (HE_ONES[w] != null) { total += HE_ONES[w]; continue; }
    if (w === 'ו' || w === '') continue;
    break;
  }
  return total;
}

/**
 * Parse ONE amount phrase → { value, thousands }. Handles 80 / 80k / "80 אלף" /
 * "80,000" and the common Hebrew round forms ("מאתיים אלף", "מאה אלף", "מיליון",
 * "חצי מיליון"). Arbitrary compound Hebrew is left to the LLM fallback path.
 */
export function parseAmountText(text: string): { value: number; thousands: boolean } | null {
  const t = (text || '').trim();
  if (!t) return null;

  if (/חצי\s+(מיליון|מליון)/.test(t)) return { value: 500000, thousands: false };
  const milMatch = t.match(/(\d[\d,.]*)?\s*(מיליון|מליון)/);
  if (milMatch) {
    const lead = milMatch[1] ? Number(milMatch[1].replace(/,/g, '')) : (hebrewWordValue(t.split(/\s+/)) || 1);
    return { value: Math.round((lead || 1) * 1000000), thousands: false };
  }

  const thousands = /(k|K|אלף|אלפים)/.test(t);

  const dig = t.match(/(\d[\d,.]*)/);
  if (dig) {
    const v = Number(dig[1].replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0) return { value: v, thousands };
  }

  const words = t.split(/\s+/).filter(Boolean);
  const v = hebrewWordValue(words);
  if (v > 0) return { value: v, thousands };

  return null;
}

// ───────────────────────── P1: reliability + input helpers ─────────────────────────

/** True when a state row is older than the TTL (default 30 min) or has no valid timestamp. */
export function isStateStale(
  updatedAt: string | Date | null | undefined,
  now: number = Date.now(),
  ttlMs: number = 30 * 60 * 1000,
): boolean {
  if (!updatedAt) return true;
  const t = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt));
  if (!Number.isFinite(t)) return true;
  return now - t > ttlMs;
}

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Normalize Hebrew for fuzzy matching: strip niqqud, unify final forms, drop punctuation, lowercase latin. */
export function normalizeHebrew(s: string): string {
  return String(s || '')
    .replace(/[֑-ׇ]/g, '') // niqqud + cantillation
    .replace(/['"`׳״]/g, '') // geresh/gershayim/quotes
    .split('')
    .map((ch) => FINALS[ch] || ch)
    .join('')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export interface RosterEntry { id: string; name: string }
export interface TalentMatch { id: string; name: string; score: number; ambiguous?: RosterEntry[] }

function tokenSimilarity(qTok: string, nameTok: string): number {
  if (!qTok || !nameTok) return 0;
  if (qTok === nameTok) return 1;
  if (nameTok.includes(qTok) || qTok.includes(nameTok)) return 0.9;
  const dist = levenshtein(qTok, nameTok);
  const maxLen = Math.max(qTok.length, nameTok.length);
  return maxLen ? 1 - dist / maxLen : 0;
}

// Single-letter Hebrew prefixes (to/in/the/from/and/that/as) — "לאנה" → also try "אנה".
const HE_PREFIX = /^[לבהמושכ]/;
function tokenVariants(t: string): string[] {
  return t.length >= 3 && HE_PREFIX.test(t) ? [t, t.slice(1)] : [t];
}

/**
 * Fuzzy-resolve a talent from free-form Hebrew against the roster. Replaces the old
 * `q.includes(name)`. Returns the best match (>=0.66) or null, flagging ambiguity
 * when the runner-up is within 0.08 and also strong.
 */
export function resolveTalent(query: string, roster: RosterEntry[]): TalentMatch | null {
  const qTokens = normalizeHebrew(query).split(' ').filter((t) => t.length >= 2);
  if (!qTokens.length || !roster?.length) return null;
  const scored = roster
    .map((r) => {
      const nameTokens = normalizeHebrew(r.name).split(' ').filter(Boolean);
      let best = 0;
      for (const nt of nameTokens) for (const qt of qTokens) for (const qv of tokenVariants(qt)) best = Math.max(best, tokenSimilarity(qv, nt));
      return { id: r.id, name: r.name, score: best };
    })
    .sort((x, y) => y.score - x.score);
  const top = scored[0];
  if (!top || top.score < 0.66) return null;
  const runner = scored[1];
  if (runner && runner.score >= 0.66 && top.score - runner.score <= 0.08) {
    return { ...top, ambiguous: [{ id: top.id, name: top.name }, { id: runner.id, name: runner.name }] };
  }
  return top;
}

/**
 * Free-form confirm classifier for the read-back step. Only a CLEAN yes/no is
 * decided here; anything else ('other') is handed to the model-in-context /
 * re-planner so "תשנה לאנה ל-90" is understood as an amendment, not a "no".
 */
export function classifyConfirm(text: string): 'yes' | 'no' | 'other' {
  const yn = interpretYesNo(text);
  return yn === 'unclear' ? 'other' : yn;
}

/**
 * Is the agent asking to RETRIEVE an existing quote's link ("תן לי את ההצעה של X")?
 * Must NOT match a forwarded brief (which says "תשלחו הצעה" to the agency, is long,
 * and often names a sum) — a false positive would hijack the brief away from being
 * documented. So: short, addressed to the bot ("...לי"), and carrying NO price.
 */
export function isRetrievalRequest(text: string): boolean {
  const t = (text || '').trim();
  if (t.length > 90) return false;
  if (extractNumbers(t).some((n) => n >= 1000)) return false;
  const verb = /תן לי|שלח לי|שלחי לי|תשלח לי|תביא לי|הבא לי|איפה ה|מה עם ה/.test(t);
  const obj = /הצעה|הצעת מחיר|קישור|חתימה/.test(t);
  return verb && obj;
}
