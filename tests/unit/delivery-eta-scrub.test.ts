/**
 * The delivery-time scrub (scripts/lib/delivery-eta.ts) rewrites the order→delivery
 * promise inside RAG chunks and widget copy. Those same texts count business days for
 * four other facts, and the scraped policy pages arrive as one unsegmented blob where
 * all of them share a "line".
 *
 * Every string below is the real production text, copied out of document_chunks and
 * accounts.config for the three brands.
 */

import { describe, it, expect } from 'vitest';
import { rewriteDeliveryTime, unrecognisedDayCount } from '../../scripts/lib/delivery-eta';

const DAYS = 10;
const scrub = (t: string) => rewriteDeliveryTime(t, DAYS);

describe('the delivery promise moves', () => {
  it("Studio Pasha's widget FAQ — the promise and the SMS share one line", () => {
    expect(scrub('המשלוח מגיע עד 7 ימי עסקים ממועד ההזמנה. תקבלי SMS עם מעקב כשהחבילה יוצאת.'))
      .toBe('המשלוח מגיע עד 10 ימי עסקים ממועד ההזמנה. תקבלי SMS עם מעקב כשהחבילה יוצאת.');
  });

  it("LA BEAUTÉ's widget FAQ keeps its carrier", () => {
    expect(scrub('המשלוח מגיע תוך 3-5 ימי עסקים דרך פוקוס. תקבלי הודעת SMS עם מספר משלוח לעקיבה.'))
      .toBe('המשלוח מגיע עד 10 ימי עסקים דרך פוקוס. תקבלי הודעת SMS עם מספר משלוח לעקיבה.');
  });

  it("ARGANIA's widget FAQ", () => {
    expect(scrub('משלוח תוך 3-5 ימי עסקים. דמי משלוח 25 ₪ לכל הזמנה.'))
      .toBe('משלוח עד 10 ימי עסקים. דמי משלוח 25 ₪ לכל הזמנה.');
  });

  it("LA BEAUTÉ's seeded shipping_time chunk, shipped via Focus", () => {
    expect(scrub('משלוחים מתבצעים דרך חברת Focus תוך 3-5 ימי עסקים מרגע אישור ההזמנה.'))
      .toBe('משלוחים מתבצעים דרך חברת Focus תוך 10 ימי עסקים מרגע אישור ההזמנה.');
  });

  it("LA BEAUTÉ's where_is_my_order — the estimate and the ticket threshold", () => {
    const after = scrub(
      'כשההזמנה יוצאת למשלוח (בדרך כלל תוך 3-5 ימי עסקים), מקבלים מייל נפרד מ-Focus עם מספר משלוח של 7 ספרות.\n' +
      'אם עברו יותר מ-5 ימי עסקים ועדיין לא הגיע מייל מ-Focus — לפתוח פנייה דרך טאב "תמיכה".',
    );
    expect(after).toContain('(בדרך כלל תוך 10 ימי עסקים)');
    expect(after).toContain('אם עברו יותר מ-10 ימי עסקים');
    expect(after).toContain('מספר משלוח של 7 ספרות'); // a digit that is not a day count
  });

  it("Studio Pasha's product-page banner", () => {
    expect(scrub('Resort Collection70% הנחה על כל האתרמשלוח עד 7 ימי עסקיםסל הקניות'))
      .toBe('Resort Collection70% הנחה על כל האתרמשלוח עד 10 ימי עסקיםסל הקניות');
  });

  it("Studio Pasha's shipping-policy page — and its edge-settlement carve-out goes", () => {
    const after = scrub(
      'מדיניות משלוחיםזמני משלוח:\n' +
      'החבילה תישלח אליך באמצעות חברת שילוח עד 5 ימי עסקים ממועד ביצוע ההזמנה באתר.\n' +
      '*למעט יישובי קצה, שבהם זמן המשלוח עומד על עד 7 ימי עסקים.\n' +
      'עלות המשלוח:',
    );
    expect(after).toContain('חברת שילוח עד 10 ימי עסקים');
    expect(after).not.toContain('יישובי קצה');
    expect(after).toContain('עלות המשלוח:'); // the carve-out went, its neighbours stayed
  });

  it("ARGANIA's shipping-policy page — one unsegmented blob, promise + carve-out + SMS", () => {
    const after = scrub(
      'מדיניות משלוחיםזמני משלוח:החבילה תישלח אליך באמצעות חברת שילוח עד 7 ימי עסקים ממועד ביצוע ההזמנה באתר.' +
      '*למעט יישובי קצה, שבהם זמן המשלוח עומד על עד 10 ימי עסקים.עלות המשלוח:דמי המשלוח באתר הינם 25 ₪ לכל הזמנה, ללא תלות בסכום הקנייה.' +
      'ברגע שהחבילה תצא לכיוונך עם חברת השליחויות, תקבלי מאיתנו עדכון בטלפון או ב־SMS על מנת לתאם זמן מועדף להגעת השליח.',
    );
    expect(after).toContain('חברת שילוח עד 10 ימי עסקים');
    expect(after).not.toContain('יישובי קצה');
    expect(after).toContain('עדכון בטלפון או ב־SMS');
    expect(after).toContain('דמי המשלוח באתר הינם 25 ₪');
  });

  it('is idempotent, and leaves a site that already says 10 alone', () => {
    const live = 'האתר פתוח וזמין להזמנות, עם משלוחים עד לפתח הבית | שילוח עד 10 ימי עסקים !';
    expect(scrub(live)).toBe(live);
    const once = scrub('החבילה תישלח אליך באמצעות חברת שילוח עד 5 ימי עסקים ממועד ביצוע ההזמנה.');
    expect(scrub(once)).toBe(once);
  });
});

describe('the four other clocks stay put', () => {
  it('courier SMS → doorstep, inside the same scraped blob as the promise', () => {
    const before =
      'ביצעתי הזמנה! מתי החבילה תגיע אלי?החבילה תישלח אליך באמצעות חברת השילוח עד 3 ימי עסקים ממועד אישור העסקה בחברת האשראי.' +
      'ביצעתי הזמנה וקיבלתי SMS בו כתוב שהמשלוח בדרך אלי. איך אוכל לדעת מתי תגיע החבילה?מרגע קבלת ה SMS החבילה צפויה להגיע אליך בתוך 2 ימי עסקים, בין השעות 8:00 ל- 22:00.';
    const after = scrub(before);
    expect(after).toContain('חברת השילוח עד 10 ימי עסקים');
    expect(after).toContain('צפויה להגיע אליך בתוך 2 ימי עסקים');
  });

  it('ticket handling', () => {
    const line = 'אם המשלוח הגיע אבל חסרים פריטים שהזמנת — פותחים פנייה.\nהטיפול בדרך כלל תוך 1-2 ימי עסקים.';
    expect(scrub(line)).toBe(line);
  });

  it('refund processing — 21 days, in a policy that also carries the delivery clause', () => {
    const line = 'זיכוי כספי: הטיפול בזיכוי יחל לאחר קליטת הפריט במרלו״ג, ויבוצע בתוך עד 21 ימי עסקים ממועד קליטת ההחזרה במרלו״ג.';
    expect(scrub(line)).toBe(line);
  });

  it("LA BEAUTÉ's liability cutoff", () => {
    const line = 'החברה לא תשא באחריות כלשהי במקרה שבו ההזמנה תסופק לאחר שחלפו למעלה מ21 ימי עסקים לאחר יום ביצוע ההזמנה.';
    expect(scrub(line)).toBe(line);
  });

  it('a creator\'s own words are never rewritten by the scrub — they get a retraction instead', () => {
    const quote = 'milana_belinsky | 15% הנחה על כל הדרופ החדש | 📦 המשלוחים מגיעים תוך 3 ימי עסקים !!!!!';
    expect(scrub(quote)).toBe(quote);
  });
});

describe('unrecognisedDayCount reports only what the rule could not place', () => {
  it('is quiet about a chunk whose only day count is the liability cutoff', () => {
    expect(unrecognisedDayCount(
      'במקרה שבו ההזמנה תסופק לאחר שחלפו למעלה מ21 ימי עסקים לאחר יום ביצוע ההזמנה.', DAYS,
    )).toBe(false);
  });

  it('is quiet once the promise has been rewritten', () => {
    expect(unrecognisedDayCount(scrub('משלוח עד 7 ימי עסקים'), DAYS)).toBe(false);
  });

  it('flags a delivery promise in wording the rule does not know', () => {
    expect(unrecognisedDayCount('זמן אספקה משוער: 4 ימי עסקים לכל הארץ.', DAYS)).toBe(true);
  });
});
