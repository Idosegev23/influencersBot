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
