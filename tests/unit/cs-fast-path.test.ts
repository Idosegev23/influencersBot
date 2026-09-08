/**
 * The order-status matcher, written against what shoppers ACTUALLY typed.
 *
 * Every expectation with a number in it comes from production (2026-09-08): 1,039 digit-runs typed
 * beside the word "הזמנה" on brands we are wired to, and 135 on brands we are not. The two
 * distributions differ — 79% five digits where we are connected (QuickShop), 45% EIGHT digits where
 * we are not — so a pattern tuned on our own brand_orders table would have missed nearly half of
 * the real ones. That is why the width here is deliberately loose and the LOOKUP decides.
 */
import { describe, it, expect } from 'vitest';
import { detectOrderIntent } from '@/lib/cs/fast-path';

describe('detectOrderIntent', () => {
  it('catches the three phrasings the live model answered with lookup_order 15/15', () => {
    for (const text of [
      'היי, מה קורה עם ההזמנה שלי? מספר 12345',
      'איפה ההזמנה שלי 12345',
      'מתי מגיעה ההזמנה 12345?',
    ]) {
      const r = detectOrderIntent(text);
      expect(r.isOrderStatus, text).toBe(true);
      expect(r.orderNumbers, text).toContain('12345');
    }
  });

  it('accepts the 8-digit shape, which is the most common one off our own integrations', () => {
    // לירון's real LA BEAUTÉ number — a brand with orders we are simply not connected to.
    const r = detectOrderIntent('לירון, מותג: לה בוטה, מספר הזמנה: 10202920');
    expect(r.isOrderStatus).toBe(true);
    expect(r.orderNumbers).toContain('10202920');
  });

  it('reads Hebrew prefix letters, which have broken matching here before', () => {
    // "ואין מענה" / "למנהל" once slipped past escalation matching for exactly this reason.
    for (const text of ['בהזמנה שלי 12345 מה קורה?', 'ולהזמנה 12345 יש מעקב?', 'שההזמנה 12345 תגיע מתי?']) {
      expect(detectOrderIntent(text).isOrderStatus, text).toBe(true);
    }
  });

  it('separates an order number from a phone typed in the same breath', () => {
    const r = detectOrderIntent('ההזמנה 12345, הטלפון שלי 0507106050');
    // Presence AND absence — an empty result must not be able to pass this.
    expect(r.orderNumbers).toContain('12345');
    expect(r.orderNumbers).not.toContain('0507106050');
  });

  it('rejects every phone shape seen in the data', () => {
    for (const phone of ['0507106050', '0721234567', '972528982123', '+972528982123']) {
      const r = detectOrderIntent(`ההזמנה שלי, הטלפון ${phone}`);
      expect(r.orderNumbers, phone).not.toContain(phone.replace('+', ''));
    }
  });

  it('does not fire on a question that is not about an order', () => {
    for (const text of ['יש לכם שמפו יבש?', 'היי', 'מה שעות הפעילות שלכם?']) {
      expect(detectOrderIntent(text).isOrderStatus, text).toBe(false);
    }
  });

  it('stands down on a complaint even though the words match', () => {
    // detectHandoff already returns before the model on these, so this is the second lock, not the
    // first — but answering "בדרך אליך 📦" to someone reporting damage is the one failure that
    // would make this whole optimisation not worth having.
    for (const text of [
      'ההזמנה 12345 הגיעה שבורה, זה לא מקובל',
      'איפה ההזמנה 12345?? כבר שבועיים ואין מענה, אני רוצה החזר',
      'ההזמנה 12345 הגיעה פגומה',
    ]) {
      expect(detectOrderIntent(text).isOrderStatus, text).toBe(false);
    }
  });

  it('recognises the intent with no number at all (enough to skip RAG, not to prefetch)', () => {
    const r = detectOrderIntent('איפה ההזמנה שלי?');
    expect(r.isOrderStatus).toBe(true);
    expect(r.orderNumbers).toHaveLength(0);
  });

  it('handles English, which the widget and the EN accounts send', () => {
    const r = detectOrderIntent('where is my order 10188900?');
    expect(r.isOrderStatus).toBe(true);
    expect(r.orderNumbers).toContain('10188900');
  });

  it('ignores digit runs too short or too long to be an order number', () => {
    const r = detectOrderIntent('איפה ההזמנה שלי 12 ו-123456789012345');
    expect(r.orderNumbers).not.toContain('12');
    expect(r.orderNumbers).not.toContain('123456789012345');
  });
});
