/**
 * Order-status fast path — the cheap read of a turn, done before the model sees it.
 *
 * WHY THIS EXISTS. Measured against production 2026-09-08, an order-status turn cost 7,167ms:
 * ~1,310ms of reads, then 1,686ms for a model call whose ONLY output was "call lookup_order with
 * this number", then 237ms for the lookup itself, then 2,408ms to phrase the answer. That first
 * model call is a router, and 15/15 live samples routed identically. This module is that router.
 *
 * WHAT IT DOES NOT DO. It never decides what the shopper is told. A match only means "fetch the
 * order now, so the brain already has it" — the model still reads the whole message and writes the
 * reply. A false positive therefore costs one read-only lookup (237ms), not a wrong answer. That is
 * the entire safety argument, and it is why this is a prefetch and not a bypass.
 *
 * THE AXIS. None. Not per brand, not per vertical, not per provider. Measured: the order-capable
 * accounts are all `brand`, and whether the intent is even reachable is already decided by whether
 * `lookup_order` is in the toolset (registry.ts — hasOrdersProvider). The phrasings below are the
 * same in every market; what differs by market is vocabulary this module does not touch
 * (מידה/החלפה for fashion, תפוגה for beauty), and that is a later dictionary, keyed on capability.
 *
 * THE NUMBER WIDTH IS DELIBERATELY LOOSE. Our own brand_orders table says order numbers are 4-5
 * digits, 100% of 39,217 rows — but that table only contains the one provider we are wired to.
 * What shoppers actually typed tells a different story: on brands we are NOT connected to, the most
 * common shape is EIGHT digits (45%), and five digits appears exactly once. A confident narrow
 * pattern would break the day a new integration lands. So: extract candidates, let lookupOrder's
 * found/not_found be the judge.
 */

/** Hebrew attaches ב/ה/ו/ל/כ/מ/ש directly to the noun — "ולהזמנה", "שההזמנה". Matching the bare
 *  word is what let "ואין מענה" and "למנהל" slip past escalation matching before. */
const ORDER_WORD = /(?:[בהולכמש]{0,3}הזמנ[הות]|\border\b|\borders\b)/i;

const STATUS_CUE = /(?:איפה|היכן|מתי|מה\s*קורה|מה\s*המצב|מה\s*קרה|סטטוס|מעקב|לעקוב|נשלח|יצא|הגיע|תגיע|מגיע|בדר[ךכ]|משלוח|where|when|status|track|tracking|shipped|arriv)/i;

/**
 * Words that mean this is a problem, not a question. detectHandoff already returns before the model
 * on these (5/5 on the live control), so this is the second lock rather than the first — but the
 * one failure that would make the whole optimisation not worth having is answering "בדרך אליך 📦"
 * to someone reporting damage, so it is locked twice.
 */
// NOTE THE CHARACTER CLASSES ON THE FINAL LETTERS. Hebrew swaps a word's final form for its
// regular form the moment a suffix is added — פגום (ם, U+05DD) becomes פגומה (מ, U+05DE) — so the
// dictionary form of the word does NOT match its own inflections. Written without this, `פגום`
// silently never fired on "המוצר הגיע פגומה", which is how a shopper reporting damage would have
// been handed an order-status prefetch. Same family of bug as the ב/ה/ו/ל prefixes above.
const COMPLAINT_CUE = /(?:שבור|שבר|פגו[םמ]|פג[םמ]|נזק|הרוס|החזר|לבטל|ביטול|תלונה|לא\s*מקובל|מאוכזב|כועס|נמאס|אין\s*מענה|תקוע|רמאות|broken|damaged|defect|refund|cancel|complain|unacceptable)/i;

/** Israeli mobile/landline typed in the same breath as the order number — never an order number. */
const PHONE_SHAPE = /^(?:0(?:5|7)\d{8}|972\d{7,})$/;

const DIGIT_RUN = /(?<!\d)(\d{3,10})(?!\d)/g;
/** A number introduced by "מספר"/"הזמנה"/"order" is the one the shopper means — rank it first. */
const LABELLED = /(?:מספר|מס['׳]?\.?|הזמנ[הת]|order)\D{0,12}?(\d{3,10})(?!\d)/gi;

export interface OrderIntent {
  /** The turn is asking where an order is — enough to skip RAG. */
  isOrderStatus: boolean;
  /** Order-number candidates, best guess first. Empty is normal: "איפה ההזמנה שלי?" has none. */
  orderNumbers: string[];
}

const NONE: OrderIntent = { isOrderStatus: false, orderNumbers: [] };

export function detectOrderIntent(text: string | null | undefined): OrderIntent {
  const s = (text || '').trim();
  if (!s) return NONE;
  // A complaint is a hand-off, not a lookup — stand down and let the brain (or detectHandoff) own it.
  if (COMPLAINT_CUE.test(s)) return NONE;
  if (!ORDER_WORD.test(s)) return NONE;

  const labelled: string[] = [];
  for (const m of s.matchAll(LABELLED)) labelled.push(m[1]);
  // A number the shopper attached to the word itself — "מספר הזמנה: 10202920", "ההזמנה 12345" —
  // IS the question, even with no "איפה"/"מתי" anywhere in the sentence. Handing us an order
  // number is not small talk. Requiring a status verb on top of it rejected both shapes real
  // shoppers used (לירון's brand-identification message, and every "<order word> <number>," turn).
  if (!STATUS_CUE.test(s) && labelled.length === 0) return NONE;

  const loose: string[] = [];
  for (const m of s.matchAll(DIGIT_RUN)) loose.push(m[1]);

  const seen = new Set<string>();
  const orderNumbers: string[] = [];
  for (const n of [...labelled, ...loose]) {
    if (seen.has(n) || PHONE_SHAPE.test(n)) continue;
    seen.add(n);
    orderNumbers.push(n);
  }
  return { isOrderStatus: true, orderNumbers };
}
