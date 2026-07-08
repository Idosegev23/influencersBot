import { describe, it, expect } from 'vitest';
import { interpretYesNo, extractNumbers, interpretPricing, isRetrievalRequest, normalizeAmount, parseAmountText, isStateStale, normalizeHebrew, levenshtein, resolveTalent, classifyConfirm } from '@/lib/crm/wa-interpret';

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

describe('isStateStale', () => {
  const T0 = Date.parse('2026-07-08T12:00:00Z');
  it('fresh state (2 min old) is not stale', () => {
    expect(isStateStale(new Date(T0 - 2 * 60_000).toISOString(), T0)).toBe(false);
  });
  it('state older than 30 min is stale', () => {
    expect(isStateStale(new Date(T0 - 31 * 60_000).toISOString(), T0)).toBe(true);
  });
  it('missing/invalid timestamp is treated as stale', () => {
    expect(isStateStale(null, T0)).toBe(true);
    expect(isStateStale('not-a-date', T0)).toBe(true);
  });
  it('honours a custom ttl', () => {
    expect(isStateStale(new Date(T0 - 90_000).toISOString(), T0, 60_000)).toBe(true);
  });
});

describe('normalizeHebrew', () => {
  it('strips niqqud/geresh, unifies final forms, trims', () => {
    expect(normalizeHebrew('שָׁלוֹם')).toBe('שלומ'); // final mem → mem
    expect(normalizeHebrew('מאורָ')).toBe('מאור');
    expect(normalizeHebrew(' מָיָא ')).toBe('מיא');
    expect(normalizeHebrew('דן')).toBe('דנ'); // final nun → nun
    expect(normalizeHebrew('דן')).toBe(normalizeHebrew('דנ'));
  });
});

describe('levenshtein', () => {
  it('basic distances', () => {
    expect(levenshtein('אנה', 'אנה')).toBe(0);
    expect(levenshtein('אנה', 'אנא')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('resolveTalent', () => {
  const roster = [
    { id: 'a', name: 'אנה' },
    { id: 'b', name: 'מאור' },
    { id: 'c', name: 'דניאל כהן' },
  ];
  it('resolves an exact name embedded in a sentence', () => {
    expect(resolveTalent('תעשה לאנה 80 אלף', roster)?.id).toBe('a');
  });
  it('resolves a misspelling via edit distance', () => {
    expect(resolveTalent('תמחר לאנא', roster)?.id).toBe('a');
  });
  it('resolves by first name only', () => {
    expect(resolveTalent('הקישור של דניאל', roster)?.id).toBe('c');
  });
  it('returns null when nothing is close', () => {
    expect(resolveTalent('שלח לרון', roster)).toBeNull();
  });
  it('flags ambiguity between two near matches', () => {
    const r2 = [{ id: 'x', name: 'דנה' }, { id: 'y', name: 'דני' }];
    const m = resolveTalent('העסקה של דנ', r2);
    expect(m?.ambiguous?.length).toBe(2);
  });
});

describe('classifyConfirm', () => {
  it('clear yes / no', () => {
    expect(classifyConfirm('כן שלח')).toBe('yes');
    expect(classifyConfirm('לא צריך')).toBe('no');
  });
  it('a new instruction is "other" (goes to the model / re-plan)', () => {
    expect(classifyConfirm('רגע תשנה לאנה ל-90')).toBe('other');
    expect(classifyConfirm('בעצם תמחר את דני 50')).toBe('other');
  });
  it('empty / vague is "other"', () => {
    expect(classifyConfirm('')).toBe('other');
    expect(classifyConfirm('אולי מחר')).toBe('other');
  });
});
