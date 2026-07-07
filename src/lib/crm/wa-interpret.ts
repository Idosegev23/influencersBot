/**
 * Pure interpreters for the agent WhatsApp conversation (heuristics; the engine
 * layers an AI fallback on top for ambiguous replies). Dependency-free + tested.
 */

// Exact-token matching — \b word boundaries don't work around Hebrew (non-\w) chars.
const YES_WORDS = new Set([
  'כן', 'בטח', 'בסדר', 'סבבה', 'כמובן', 'אישור', 'מאשר', 'נכון', 'יאללה', 'בטוח', 'אוקיי', 'אוקי', 'נבנה',
  'ok', 'okay', 'yes', 'yep', 'yeah', 'בנה', 'תבנה', 'תבני', 'לבנות', 'שלח', 'שלחי', 'תשלח', 'תשלחי', 'לשלוח',
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
}

/** Interpret a pricing reply against the number of deliverables. */
export function interpretPricing(text: string, deliverableCount: number): PricingResult {
  const nums = extractNumbers(text || '');
  if (nums.length === 0) return { mode: 'unclear' };
  if (deliverableCount > 1 && nums.length === deliverableCount) return { mode: 'per_line', prices: nums };
  if (nums.length === 1) return { mode: 'total', total: nums[0] };
  return { mode: 'unclear' };
}
