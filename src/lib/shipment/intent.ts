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
  // "track" / "tracking"
  /\bמעקב\b.*?(הזמנה|משלוח|חבילה)?/,
  /track(?:ing)?/i,
  // "the order/shipment is late / didn't arrive yet"
  /(הזמנה|משלוח|חבילה).*?(לא הגיע|לא הגיעה|מאחר|מאחרת)/,
  /(לא הגיע|לא הגיעה).*?(הזמנה|משלוח|חבילה)/,
];

const NUMBER_PATTERN = /\b(\d{6,12})\b/;

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
  const numberMatch = text.match(NUMBER_PATTERN);

  const isShortNumberOnly = wordCount <= 4 && !!numberMatch;

  if (!matchesIntent && !isShortNumberOnly) {
    return { isOrderStatus: false, shipmentNumber: null, reference: null };
  }

  return {
    isOrderStatus: true,
    shipmentNumber: numberMatch ? numberMatch[1] : null,
    reference: null,
  };
}
