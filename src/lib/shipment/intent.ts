/**
 * Detect "where is my order / shipment" intent in a Hebrew chat message
 * + extract the shipment number if present.
 *
 * Conservative regex — false positives here = the bot answers a non-
 * shipment question with "no order found", which is annoying. So we only
 * trip on combinations of (status / where / when) + (order / shipment /
 * package).
 */

const INTENT_PATTERNS: RegExp[] = [
  // explicit "status of order/shipment"
  /סטטוס[\s].*?(הזמנה|משלוח|חבילה|הזמנת|המשלוח)/,
  /מצב[\s].*?(הזמנה|משלוח|חבילה|המשלוח)/,
  // "where is my order/package" — common Hebrew framing
  /איפה[\s].*?(הזמנה|משלוח|חבילה|ה?הזמנה|ה?משלוח)/,
  /היכן[\s].*?(הזמנה|משלוח|חבילה)/,
  // "when will it arrive" — covers future ("תגיע / יגיע") and present
  // tense ("מגיע / מגיעה") which Hebrew speakers use interchangeably.
  /מתי[\s].*?(תגיע|יגיע|מגיע|מגיעה|אקבל|הגעה|מסירה|נמסר)/,
  // "track" / "tracking" — noun form (מעקב), infinitive (לעקוב), and
  // present-tense (עוקב/ת) verbal forms; Hebrew \b word-boundaries are
  // unreliable so we don't use them.
  /(מעקב|לעקוב|עוקב(ת|ים)?)\s.*?(הזמנה|משלוח|חבילה|אחרי\s+ה?(הזמנה|משלוח|חבילה))/,
  /track(?:ing)?/i,
  // "the order/shipment is late / didn't arrive yet"
  /(הזמנה|משלוח|חבילה).*?(לא הגיע|לא הגיעה|מאחר|מאחרת)/,
  /(לא הגיע|לא הגיעה).*?(הזמנה|משלוח|חבילה)/,
];

// Order/shipment numbers run 4-12 digits. The lower bound matters: store order
// numbers are commonly 4-5 digits (Argania: ALL 26,177 orders are 4- or 5-digit),
// while Focus shipment numbers are longer. A 6-digit floor here silently made the
// order-status flow unreachable for those stores — the bot asked for a number,
// the customer sent it, and the same question came back. Live-observed 2026-07-26/27.
const NUMBER_PATTERN = /\b(\d{4,12})\b/g;

// Israeli phone shapes, so a customer pasting a callback number isn't sent through
// an order lookup that can only answer "no such order" (live-observed: "0512018226").
//   0XXXXXXXX / 0XXXXXXXXX  → landline (03-5515559) and mobile (050-1234567)
//   972XXXXXXXX(X)          → the same numbers in +972 form
const PHONE_SHAPES: RegExp[] = [/^0\d{8,9}$/, /^972\d{8,9}$/];

function looksLikePhone(digits: string): boolean {
  return PHONE_SHAPES.some((re) => re.test(digits));
}

/**
 * First number in the message that could plausibly be an order/shipment number.
 * Skips phone-shaped runs so "0503222225 תחזרו אליי" doesn't become a lookup.
 * Exported so callers never re-declare the pattern — the duplicated copy in the
 * chat stream route is exactly how the 6-digit floor survived a fix in one place.
 */
export function extractOrderNumber(message: string): string | null {
  const text = (message || '').trim();
  for (const m of text.matchAll(NUMBER_PATTERN)) {
    if (!looksLikePhone(m[1])) return m[1];
  }
  return null;
}

export interface ShipmentIntentResult {
  isOrderStatus: boolean;
  shipmentNumber: string | null;
  reference: string | null;
}

export function detectShipmentIntent(message: string): ShipmentIntentResult {
  const text = (message || '').trim();
  const matchesIntent = INTENT_PATTERNS.some((re) => re.test(text));

  // Even without obvious intent words, a bare number on a short message
  // (≤ 4 words) is almost certainly a shipment number reply.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const orderNumber = extractOrderNumber(text);

  const isShortNumberOnly = wordCount <= 4 && !!orderNumber;

  if (!matchesIntent && !isShortNumberOnly) {
    return { isOrderStatus: false, shipmentNumber: null, reference: null };
  }

  return {
    isOrderStatus: true,
    shipmentNumber: orderNumber,
    reference: null,
  };
}
