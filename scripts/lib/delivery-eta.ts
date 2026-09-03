/**
 * The scrub rule behind scripts/set-delivery-time-10-days.ts, kept separate so it
 * can be tested without a Supabase client or an OpenAI key.
 *
 * Our chunks count business days for four different facts:
 *   order → delivery          ← the only one a delivery-time change may touch
 *   courier SMS → doorstep    ("מרגע קבלת ה-SMS ... תוך כ-2 ימי עסקים")
 *   ticket handling           ("הטיפול בדרך כלל תוך 1-2 ימי עסקים")
 *   support response          ("הצוות חוזר תוך יום עסקים אחד")
 * So a line is rewritten only when it names the shipping leg and names none of the
 * others. Anything outside that is left alone rather than guessed at.
 */

/** A line may only be rewritten if it is talking about the order→delivery leg. */
export const SHIPPING_CONTEXT = /משלוח|שילוח|החבילה|ההזמנה|אספקה|Focus/;
/** …and not about one of the other things that are also measured in business days. */
export const OTHER_CLOCK = /SMS|מרגע קבלת|הטיפול|הצוות|נציג|מענה|החזר|החזרה|ביטול/;
/**
 * The carve-out named a longer time only because the main promise was shorter. Once
 * the promise reaches that number it reads "up to N, except up to N", so it goes.
 */
export const EDGE_SETTLEMENT_LINE = /^\s*\*?\s*למעט יישובי קצה[^\n]*ימי עסקים\.?\s*$/;

/** True when a text still promises some number of days. */
export const MENTIONS_DAYS = /\d+\s*ימי (?:עסקים|עבודה)/;

/** Matches the dated retraction written by the two earlier shipping-policy scripts. */
export const CORRECTION_RE = /\[עדכון מדיניות — נכון ל-[^\]]*\]/g;
export const HAS_CORRECTION = /\[עדכון מדיניות — נכון ל-/;

function numberPatterns(days: number): Array<[RegExp, string]> {
  return [
    [/עד \d+(?:-\d+)? ימי עסקים/g, `עד ${days} ימי עסקים`],
    [/תוך \d+(?:-\d+)? ימי עסקים/g, `תוך ${days} ימי עסקים`],
    [/יותר מ-\d+(?:-\d+)? ימי עסקים/g, `יותר מ-${days} ימי עסקים`],
    [/עד \d+(?:-\d+)? ימי עבודה/g, `עד ${days} ימי עבודה`],
    [/תוך \d+(?:-\d+)? ימי עבודה/g, `תוך ${days} ימי עבודה`],
  ];
}

/**
 * Rewrites the order→delivery promise, line by line. A line that does not clearly
 * name that leg comes back exactly as it went in — the SMS→doorstep and
 * ticket-handling sentences live in the same chunks and must survive untouched.
 */
export function rewriteDeliveryTime(text: string, days: number): string {
  const patterns = numberPatterns(days);
  return text
    .split('\n')
    .filter((line) => !EDGE_SETTLEMENT_LINE.test(line))
    .map((line) => {
      if (!SHIPPING_CONTEXT.test(line) || OTHER_CLOCK.test(line)) return line;
      let out = line;
      for (const [re, to] of patterns) out = out.replace(re, to);
      return out;
    })
    .join('\n');
}
