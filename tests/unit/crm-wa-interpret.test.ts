import { describe, it, expect } from 'vitest';
import { interpretYesNo, extractNumbers, interpretPricing, isRetrievalRequest } from '@/lib/crm/wa-interpret';

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
  it('single number → total', () => {
    expect(interpretPricing('80000', 3)).toEqual({ mode: 'total', total: 80000 });
    expect(interpretPricing('80,000 בסך הכל', 3)).toEqual({ mode: 'total', total: 80000 });
  });
  it('count-matching numbers → per line', () => {
    expect(interpretPricing('20000 5000 15000', 3)).toEqual({ mode: 'per_line', prices: [20000, 5000, 15000] });
  });
  it('no number → unclear', () => {
    expect(interpretPricing('לא יודע', 3)).toEqual({ mode: 'unclear' });
  });
});
