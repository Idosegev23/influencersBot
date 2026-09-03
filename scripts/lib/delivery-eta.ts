/**
 * The scrub rule behind scripts/set-delivery-time-10-days.ts, kept separate so it
 * can be tested without a Supabase client or an OpenAI key.
 *
 * Our chunks count business days for five different facts:
 *   order → delivery          ← the only one a delivery-time change may touch
 *   courier SMS → doorstep    ("מרגע קבלת ה SMS ... בתוך 2 ימי עסקים")
 *   ticket handling           ("הטיפול בדרך כלל תוך 1-2 ימי עסקים")
 *   refund processing         ("בתוך עד 21 ימי עסקים ממועד קליטת ההחזרה במרלו״ג")
 *   the liability cutoff      ("שחלפו למעלה מ21 ימי עסקים ... לא יהיה זכאי לסעד")
 *
 * A guard that works line by line is not enough: the scraped policy pages arrive as
 * one unsegmented blob where the delivery promise, the SMS leg and the refund clause
 * share a single "line" — ARGANIA's shipping-policy chunk is exactly that. So nothing
 * is rewritten by proximity. Every replacement names the delivery phrase itself, and
 * the four other facts are safe because no pattern here describes them.
 */

/** Phrases that promise order→delivery time, anchored on their own wording. */
function deliveryPatterns(days: number): Array<[RegExp, string]> {
  return [
    // The carve-out named a longer time only because the main promise was shorter.
    // Once the promise reaches it, it reads "up to N, except up to N" — so it goes.
    // Runs first, or the rule below would renumber it into place instead.
    [/\s*\*?\s*למעט יישובי קצה, שבהם זמן המשלוח עומד על עד \d+ ימי עסקים\.?/g, ''],

    [/(החבילה תישלח אליך באמצעות חברת ה?שילוח )עד \d+ ימי עסקים/g, `$1עד ${days} ימי עסקים`],
    [/(משלוחים מתבצעים דרך חברת Focus )תוך \d+(?:-\d+)? ימי עסקים/g, `$1תוך ${days} ימי עסקים`],
    [/המשלוח מגיע (?:עד|תוך) \d+(?:-\d+)? ימי עסקים/g, `המשלוח מגיע עד ${days} ימי עסקים`],
    [/משלוח עד \d+ ימי עסקים/g, `משלוח עד ${days} ימי עסקים`],
    [/משלוח תוך \d+(?:-\d+)? ימי עסקים/g, `משלוח עד ${days} ימי עסקים`],
    [/שילוח עד \d+ ימי עסקים/g, `שילוח עד ${days} ימי עסקים`],
    [/זמן האספקה הוא עד \d+ ימי עסקים/g, `זמן האספקה הוא עד ${days} ימי עסקים`],
    [/זמן המשלוח עומד על עד \d+ ימי עסקים/g, `זמן המשלוח עומד על עד ${days} ימי עסקים`],
    [/\(בדרך כלל תוך \d+(?:-\d+)? ימי עסקים\)/g, `(בדרך כלל תוך ${days} ימי עסקים)`],
    [/אם עברו יותר מ-\d+ ימי עסקים/g, `אם עברו יותר מ-${days} ימי עסקים`],
  ];
}

/**
 * The other four clocks, named so that a chunk which only counts days for one of them
 * is not reported as a delivery promise the rule failed to handle.
 */
const OTHER_CLOCKS: RegExp[] = [
  /מרגע קבלת ה[- ]?SMS[^]{0,80}?\d+ ימי עסקים/g,   // courier hand-off → doorstep
  /הטיפול בדרך כלל תוך \d+(?:-\d+)? ימי עסקים/g,     // ticket handling
  /בתוך עד \d+ ימי עסקים ממועד קליטת ההחזרה/g,       // refund processing
  /למעלה מ\s*\d+ ימי עסקים/g,                         // liability cutoff
  /תוך כמה ימי עסקים/g,                               // an enriched question, not a promise
];

/** True when a text still counts days for something. */
export const MENTIONS_DAYS = /\d+\s*ימי (?:עסקים|עבודה)/;

/** Matches the dated retraction written by the two earlier shipping-policy scripts. */
export const CORRECTION_RE = /\[עדכון מדיניות — נכון ל-[^\]]*\]/g;
export const HAS_CORRECTION = /\[עדכון מדיניות — נכון ל-/;

/**
 * Rewrites every order→delivery promise to `days`, and nothing else. Text that makes
 * no delivery promise comes back identical.
 */
export function rewriteDeliveryTime(text: string, days: number): string {
  let out = text;
  for (const [re, to] of deliveryPatterns(days)) out = out.replace(re, to);
  return out;
}

/**
 * A day count this rule does not recognise — neither a delivery promise it rewrote nor
 * one of the other clocks. The script prints these for a human instead of guessing.
 */
export function unrecognisedDayCount(text: string, days: number): boolean {
  let residue = text;
  for (const re of OTHER_CLOCKS) residue = residue.replace(re, '');
  residue = residue.replace(new RegExp(`${days} ימי עסקים`, 'g'), '');
  return MENTIONS_DAYS.test(residue);
}
