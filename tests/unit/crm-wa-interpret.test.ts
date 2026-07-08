import { describe, it, expect } from 'vitest';
import { interpretYesNo, extractNumbers, interpretPricing, isRetrievalRequest, normalizeAmount, parseAmountText } from '@/lib/crm/wa-interpret';

describe('interpretYesNo', () => {
  it('yes variants', () => {
    for (const t of ['כן', 'בטח שלח', 'כן בבקשה', 'אוקיי', 'yes', 'תבנה']) expect(interpretYesNo(t)).toBe('yes');
  });
  it('no variants', () => {
    for (const t of ['לא', 'לא צריך', 'ביטול', 'no', 'עזוב']) expect(interpretYesNo(t)).toBe('no');
  });
  it('unclear', () => {
    expect(interpretYesNo('אולי מחר')).toBe('unclear');
    expect(interpretYesNo('')).toBe('unclear');
  });
  it('natural imperative affirmations (create-confirm)', () => {
    for (const t of ['תעשה', 'תעשי', 'קדימה', 'אפשר', 'צור', 'תוציא', 'אשר']) expect(interpretYesNo(t)).toBe('yes');
  });
});

describe('isRetrievalRequest', () => {
  it('matches a real retrieval ask', () => {
    for (const t of ['תן לי את ההצעה של אנה', 'שלח לי את הקישור של דני', 'איפה ההצעה של אנה?']) {
      expect(isRetrievalRequest(t)).toBe(true);
    }
  });
  it('does NOT match a forwarded brief that says "תשלחו הצעה" (the blocker)', () => {
    expect(isRetrievalRequest('היי, אנה מוזמנת לקמפיין אופנה. נשמח שתשלחו הצעת מחיר.')).toBe(false);
  });
  it('does NOT match a pricing command carrying a sum', () => {
    expect(isRetrievalRequest('תשלח הצעה לאנה 200000')).toBe(false);
    expect(isRetrievalRequest('על הבריף של אנה תעדכן 200000')).toBe(false);
  });
  it('does NOT match plain chatter', () => {
    expect(isRetrievalRequest('מה שלומך')).toBe(false);
    expect(isRetrievalRequest('')).toBe(false);
  });
});

describe('extractNumbers', () => {
  it('handles separators + k + אלף', () => {
    expect(extractNumbers('20,000')).toEqual([20000]);
    expect(extractNumbers('20k')).toEqual([20000]);
    expect(extractNumbers('20 אלף')).toEqual([20000]);
    expect(extractNumbers('1: 20000, 2: 5000, 3: 15000')).toEqual([1, 20000, 2, 5000, 3, 15000]);
  });
});

describe('interpretPricing', () => {
  it('single large number → total, no confirmation', () => {
    expect(interpretPricing('80000', 3)).toEqual({ mode: 'total', total: 80000, needsConfirmation: false });
    expect(interpretPricing('80,000 בסך הכל', 3)).toEqual({ mode: 'total', total: 80000, needsConfirmation: false });
  });
  it('bare small total → scaled + confirmation', () => {
    expect(interpretPricing('80', 3)).toEqual({ mode: 'total', total: 80000, needsConfirmation: true });
  });
  it('count-matching numbers → per line (all large, no confirmation)', () => {
    expect(interpretPricing('20000 5000 15000', 3)).toEqual({ mode: 'per_line', prices: [20000, 5000, 15000], needsConfirmation: false });
  });
  it('count-matching bare numbers → per line scaled + confirmation', () => {
    expect(interpretPricing('80 50 30', 3)).toEqual({ mode: 'per_line', prices: [80000, 50000, 30000], needsConfirmation: true });
  });
  it('no number → unclear', () => {
    expect(interpretPricing('לא יודע', 3)).toEqual({ mode: 'unclear' });
  });
});

describe('normalizeAmount — domain thousands rule + sanity gate', () => {
  it('explicit thousands marker → ×1000, no confirmation', () => {
    expect(normalizeAmount(80, { thousands: true })).toEqual({ amount: 80000, needsConfirmation: false, reason: null });
    expect(normalizeAmount(200, { thousands: true })).toEqual({ amount: 200000, needsConfirmation: false, reason: null });
  });
  it('already-large numbers pass through untouched', () => {
    expect(normalizeAmount(80000, { scaleBare: true })).toEqual({ amount: 80000, needsConfirmation: false, reason: null });
    expect(normalizeAmount(94400)).toEqual({ amount: 94400, needsConfirmation: false, reason: null });
  });
  it('bare small number in pricing context → scaled ×1000 AND flagged for read-back', () => {
    expect(normalizeAmount(80, { scaleBare: true })).toEqual({ amount: 80000, needsConfirmation: true, reason: 'bare_scaled' });
  });
  it('final amount still < min → below_min confirmation', () => {
    expect(normalizeAmount(500)).toEqual({ amount: 500, needsConfirmation: true, reason: 'below_min' });
    expect(normalizeAmount(0, { scaleBare: true })).toEqual({ amount: 0, needsConfirmation: true, reason: 'below_min' });
  });
  it('anomaly vs history → flagged', () => {
    expect(normalizeAmount(500000, { history: [8000, 10000, 9000] }).reason).toBe('anomalous');
    expect(normalizeAmount(9000, { history: [8000, 10000, 9000] }).needsConfirmation).toBe(false);
  });
});

describe('parseAmountText', () => {
  it('digit forms', () => {
    expect(parseAmountText('80')).toEqual({ value: 80, thousands: false });
    expect(parseAmountText('80k')).toEqual({ value: 80, thousands: true });
    expect(parseAmountText('80 אלף')).toEqual({ value: 80, thousands: true });
    expect(parseAmountText('80,000')).toEqual({ value: 80000, thousands: false });
  });
  it('hebrew word amounts', () => {
    expect(parseAmountText('מאתיים אלף')).toEqual({ value: 200, thousands: true });
    expect(parseAmountText('מאה אלף')).toEqual({ value: 100, thousands: true });
    expect(parseAmountText('מיליון')).toEqual({ value: 1000000, thousands: false });
    expect(parseAmountText('חצי מיליון')).toEqual({ value: 500000, thousands: false });
  });
  it('no amount → null', () => {
    expect(parseAmountText('שלום מה קורה')).toBeNull();
  });
});
