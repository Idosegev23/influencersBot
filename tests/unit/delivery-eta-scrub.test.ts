/**
 * The delivery-time scrub (scripts/lib/delivery-eta.ts) rewrites the order→delivery
 * promise inside RAG chunks. Those same chunks count business days for three other
 * facts, and a blind "N ימי עסקים" rewrite would quietly turn each of them into the
 * delivery promise. The texts below are the real ones from the LA BEAUTÉ seed
 * (scripts/seed-labeaute-policy-chunks.ts) and the Studio Pasha delivery-time script.
 */

import { describe, it, expect } from 'vitest';
import { rewriteDeliveryTime, MENTIONS_DAYS } from '../../scripts/lib/delivery-eta';

const DAYS = 10;
const scrub = (t: string) => rewriteDeliveryTime(t, DAYS);

describe('rewriteDeliveryTime — the delivery promise', () => {
  it('moves "עד N ימי עסקים" to the new promise', () => {
    expect(scrub('המשלוח מגיע עד 7 ימי עסקים ממועד ביצוע ההזמנה.'))
      .toBe('המשלוח מגיע עד 10 ימי עסקים ממועד ביצוע ההזמנה.');
  });

  it('moves a range — LA BEAUTÉ shipped via Focus', () => {
    expect(scrub('משלוחים מתבצעים דרך חברת Focus תוך 3-5 ימי עסקים מרגע אישור ההזמנה.'))
      .toBe('משלוחים מתבצעים דרך חברת Focus תוך 10 ימי עסקים מרגע אישור ההזמנה.');
  });

  it('moves the parenthetical estimate and the "worth opening a ticket" threshold', () => {
    const before = `איפה ההזמנה שלי / מתי היא תגיע ב-LA BEAUTÉ:
אחרי ביצוע ההזמנה מקבלים מייל אישור עם הפרטים. כשההזמנה יוצאת למשלוח (בדרך כלל תוך 3-5 ימי עסקים), מקבלים מייל נפרד מ-Focus עם מספר משלוח של 7 ספרות.
אם עברו יותר מ-5 ימי עסקים ועדיין לא הגיע מייל מ-Focus — לפתוח פנייה דרך טאב "תמיכה".`;
    const after = scrub(before);
    expect(after).toContain('(בדרך כלל תוך 10 ימי עסקים)');
    expect(after).toContain('אם עברו יותר מ-10 ימי עסקים');
    expect(MENTIONS_DAYS.test(after.replace(/10 ימי עסקים/g, ''))).toBe(false);
  });

  it('rewrites the scraped site promise', () => {
    expect(scrub('החבילה תישלח אליך באמצעות חברת שילוח עד 5 ימי עסקים'))
      .toBe('החבילה תישלח אליך באמצעות חברת שילוח עד 10 ימי עסקים');
  });

  it('drops the edge-settlement carve-out, which now equals the promise', () => {
    const before = `משלוח עד 5 ימי עסקים
*למעט יישובי קצה, שבהם זמן המשלוח עומד על עד 7 ימי עסקים.`;
    expect(scrub(before)).toBe('משלוח עד 10 ימי עסקים');
  });

  it('is idempotent', () => {
    const once = scrub('המשלוח מגיע עד 7 ימי עסקים ממועד ההזמנה.');
    expect(scrub(once)).toBe(once);
  });
});

describe('rewriteDeliveryTime — the days it must not touch', () => {
  it('leaves the courier SMS → doorstep leg alone', () => {
    const line = 'לאחר שהחבילה יוצאת מהמחסן נשלחת הודעת SMS מחברת השילוח עם מעקב, ומרגע קבלת ה-SMS החבילה מגיעה תוך כ-2 ימי עסקים, בין השעות 8:00 ל-22:00.';
    expect(scrub(line)).toBe(line);
  });

  it('leaves ticket-handling time alone', () => {
    const line = `חסרים פריטים במשלוח LA BEAUTÉ:
אם המשלוח הגיע אבל חסרים פריטים שהזמנת — פותחים פנייה דרך טאב "תמיכה".
הטיפול בדרך כלל תוך 1-2 ימי עסקים.`;
    expect(scrub(line)).toBe(line);
  });

  it('leaves the support response time alone', () => {
    const line = 'שלבים: בוחרים את המוצר הרלוונטי → סוג הבעיה. הצוות חוזר תוך יום עסקים אחד.';
    expect(scrub(line)).toBe(line);
  });

  it('leaves the returns window alone', () => {
    const line = 'ניתן להחזיר מוצר תוך 14 יום מקבלת המשלוח, כל עוד המוצר לא נפתח.';
    expect(scrub(line)).toBe(line);
  });

  it('leaves a day count with no shipping context alone', () => {
    const line = 'הקורס נפתח תוך 3 ימי עסקים מרגע ההרשמה.';
    expect(scrub(line)).toBe(line);
  });

  it('rewrites only the delivery line when both live in one chunk', () => {
    const before = `זמני משלוח STUDIO PASHA:
המשלוח מגיע עד 7 ימי עסקים ממועד ביצוע ההזמנה באתר.
לאחר שהחבילה יוצאת מהמחסן נשלחת הודעת SMS מחברת השילוח עם מעקב, ומרגע קבלת ה-SMS החבילה מגיעה תוך כ-2 ימי עסקים.`;
    const after = scrub(before);
    expect(after).toContain('המשלוח מגיע עד 10 ימי עסקים');
    expect(after).toContain('החבילה מגיעה תוך כ-2 ימי עסקים');
  });
});
