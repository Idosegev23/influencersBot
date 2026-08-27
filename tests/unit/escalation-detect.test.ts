import { describe, it, expect } from 'vitest';
import { detectEscalation } from '@/engines/escalation/detect';

describe('detectEscalation', () => {
  it('escalates on a legal threat', () => {
    const v = detectEscalation('אם זה לא יסתדר אני אתבע אתכם בבית משפט');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('legal');
    expect(v.severity).toBe('critical');
  });

  it('escalates on abuse / cursing', () => {
    const v = detectEscalation('אתם חרא של חברה, רמאים');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('abuse');
    expect(v.severity).toBe('critical');
  });

  it('escalates on explicit human demand', () => {
    const v = detectEscalation('תפסיקו עם הבוט, אני רוצה לדבר עם נציג אנושי עכשיו');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('human_demand');
    expect(v.severity).toBe('high');
  });

  it('escalates on sustained anger across turns', () => {
    const v = detectEscalation('זה פשוט נורא, עד מתי', ['אני ממש מאוכזבת מהשירות']);
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('sustained_anger');
  });

  it('does NOT escalate a single mildly-negative message', () => {
    const v = detectEscalation('קצת מאוכזבת מהמשלוח', []);
    expect(v.escalate).toBe(false);
    expect(v.severity).toBeNull();
  });

  it('does NOT escalate a benign question', () => {
    const v = detectEscalation('היי, יש לכם שמן לשיער יבש?');
    expect(v.escalate).toBe(false);
  });

  it('matches English legal threats too', () => {
    const v = detectEscalation('I will sue you and call my lawyer');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('legal');
  });
});

// Regression: word-boundary matching + removal of the bare 'עוד' keyword.
// These all false-fired under the old substring includes().
describe('detectEscalation — substring false positives are gone', () => {
  it('"ספרו לי עוד" is not a legal threat (bare עוד removed)', () => {
    const v = detectEscalation('מדהים! ספרו לי עוד!');
    expect(v.triggers).not.toContain('legal');
    expect(v.escalate).toBe(false);
  });

  it('"issue" no longer matches the legal keyword "sue"', () => {
    expect(detectEscalation('I have an issue with my order').triggers).not.toContain('legal');
  });

  it('"מנהלת" (verb) no longer matches the human-demand keyword "מנהל"', () => {
    expect(detectEscalation('מי מנהלת הלקוח של סודה?').triggers).not.toContain('human_demand');
  });

  it('"courtesy" no longer matches the legal keyword "court"', () => {
    expect(detectEscalation('thanks for your courtesy').triggers).not.toContain('legal');
  });

  it('still fires on a standalone request for a manager', () => {
    expect(detectEscalation('אני רוצה לדבר עם מנהל').triggers).toContain('human_demand');
  });
});

/**
 * The "you keep stringing me along" family. On 2026-04-15 a former LDRS
 * influencer opened with "יש תשלום שלא עבר לי על חודש דצמבר (!!!!) וכל הזמן
 * מורחים אותי במיילים ... זה לא הגיוני בשום צורה" and followed with "זה ממש
 * חוצפה". Only 'חוצפה' was a known negative, and sustained_anger needs a negative
 * on BOTH the current and a prior turn — so nothing fired until she finally typed
 * "יש בן אדם לדבר איתו?" five turns later.
 *
 * Checked against real traffic before widening: 'אין מענה' appears 87 times and
 * every sample is a genuine complaint; 'לא הגיוני' appears 16 times, 7 of 8
 * sampled are complaints and the one product question cannot escalate alone,
 * because it takes two negative turns.
 */
describe('detectEscalation — the no-answer / stalling complaints', () => {
  const negatives = [
    'וכל הזמן מורחים אותי במיילים',
    'זה לא הגיוני בשום צורה',
    'אני כל יום מתקשרת ואין מענה',
    'למה אף נציג לא חוזר אליי?',
    'ניסיתי כמה פעמים ולא חזרו אליי',
    'אני לא מקבלת מענה כבר שבוע',
  ];

  it('each one counts as negative — proven by pairing it with a known negative', () => {
    for (const msg of negatives) {
      const v = detectEscalation(msg, ['השירות שלכם גרוע']);
      expect(v.escalate, msg).toBe(true);
      expect(v.triggers, msg).toContain('sustained_anger');
    }
  });

  it('replays the real 2026-04-15 thread and fires before she has to ask for a human', () => {
    const opener = 'יש תשלום שלא עבר לי על חודש דצמבר (!!!!) וכל הזמן מורחים אותי במיילים\nאני מבקשת לטפל בזה. זה לא הגיוני בשום צורה';
    // Turn 1 alone still must not escalate — one angry message is not an escalation.
    expect(detectEscalation(opener, []).escalate).toBe(false);
    // Turn 4 ("זה ממש חוצפה") now has an angry predecessor and fires.
    const v = detectEscalation('זה ממש חוצפה', [opener, 'אני מבקשת היום לטפל בזה']);
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('sustained_anger');
  });

  it('does not fire on the ordinary uses of the same words', () => {
    // Presence guard first — the list is live.
    expect(detectEscalation('אין מענה', ['אין מענה']).escalate).toBe(true);
    // …and these stay quiet:
    expect(detectEscalation('מורחים את הקרם על הפנים?', ['מורחים את הקרם על הפנים?']).escalate).toBe(false);
    expect(detectEscalation('כמה פעמים ביום מורחים?', ['כמה פעמים ביום מורחים?']).escalate).toBe(false);
    expect(detectEscalation('יש לכם מענה בעברית?', ['יש לכם מענה בעברית?']).escalate).toBe(false);
  });
});

describe('detectEscalation — Hebrew one-letter prefixes', () => {
  it('reads a phrase through an attached prefix (ו/ש/ל/ב/כ/מ/ה)', () => {
    const prior = ['השירות שלכם גרוע'];
    expect(detectEscalation('אני כל יום מתקשרת ואין מענה', prior).escalate).toBe(true);
    expect(detectEscalation('נמאס לי שלא חזרו אליי', prior).escalate).toBe(true);
    expect(detectEscalation('הבעיה היא שאין מענה', prior).escalate).toBe(true);
  });

  it('but single-word keywords keep the strict boundary — the בעוד/מנהלת regressions stay fixed', () => {
    // Presence: the bare keywords still fire on their own.
    expect(detectEscalation('אני אתבע אתכם').escalate).toBe(true);
    expect(detectEscalation('תעבירו אותי למנהל').escalate).toBe(true);
    // Absence: and their prefixed/inflected lookalikes still do not.
    expect(detectEscalation('ספרו לי עוד על השירות').escalate).toBe(false);
    expect(detectEscalation('בעוד שבוע אני צריכה את זה').escalate).toBe(false);
    expect(detectEscalation('מי מנהלת הלקוח של סודהסטרים?').escalate).toBe(false);
  });
});
