import { describe, it, expect } from 'vitest';
import {
  buildHebrewTermPattern,
  normalizeWatchTerms,
  splitWatchCounts,
  MAX_WATCH_TERMS,
} from '@/lib/conversation-analytics/keyword-watch';

/**
 * The pattern is handed to Postgres (`content ~ pattern`), but POSIX ERE and
 * JavaScript agree on every construct used here — anchors, alternation,
 * character classes and bounded repetition — so exercising it with a JS RegExp
 * is a faithful check of what the database will do.
 */
const matches = (term: string, text: string) =>
  new RegExp(buildHebrewTermPattern(term)).test(text);

describe('buildHebrewTermPattern', () => {
  it('matches the bare word', () => {
    expect(matches('פגום', 'המוצר פגום')).toBe(true);
    expect(matches('שבור', 'שבור')).toBe(true);
  });

  // Real inflections counted from Argania's corpus: חסרים 37, חסרה 9,
  // שבורים 15, שבורה 10.
  it('matches Hebrew inflection suffixes', () => {
    expect(matches('חסר', 'שני מוצרים חסרים בהזמנה')).toBe(true);
    expect(matches('חסר', 'יחידה חסרה')).toBe(true);
    expect(matches('שבור', 'הגיעו מוצרים שבורים')).toBe(true);
    expect(matches('שבור', 'המשאבה שבורה')).toBe(true);
  });

  // Without prefix tolerance the corpus loses 25% of real hits — every sampled
  // example was genuine: "משלוח שלא הגיע", "חבילה שלא הגיעה".
  it('matches attached Hebrew prefixes', () => {
    expect(matches('לא הגיע', 'אני מברר לגבי משלוח שלא הגיע')).toBe(true);
    expect(matches('לא הגיע', 'חבילה שלא הגיעה')).toBe(true);
    expect(matches('לא הגיע', 'עשיתי הזמנה ולא הגיעו לי כל המוצרים')).toBe(true);
  });

  it('matches a multi-word phrase', () => {
    expect(matches('לא הגיע', 'ההזמנה לא הגיעה עדיין')).toBe(true);
    expect(matches('לא הגיע', 'לא יודעת מתי זה הגיע')).toBe(false);
  });

  // The whole point of word boundaries: חסרון is a drawback, not a missing item.
  it('does not match a longer unrelated word', () => {
    expect(matches('חסר', 'החיסרון היחיד הוא המחיר')).toBe(false);
    expect(matches('חסר', 'חסרונות')).toBe(false);
  });

  // Hebrew final forms: ם ן ץ ף ך become מ נ צ פ כ the moment a suffix follows,
  // so a term ending in one can never match its own inflections without help.
  // Both of the terms Einav asked for are affected — פגום and מפוצץ.
  it('matches inflections of a term ending in a final form', () => {
    expect(matches('פגום', 'המוצרים הגיעו פגומים')).toBe(true);
    expect(matches('פגום', 'המסכה הגיעה פגומה')).toBe(true);
    expect(matches('מפוצץ', 'החבילה הגיעה מפוצצת')).toBe(true);
    expect(matches('מפוצץ', 'כל המוצרים מפוצצים')).toBe(true);
  });

  it('still matches the final form itself', () => {
    expect(matches('פגום', 'הגיע פגום')).toBe(true);
    expect(matches('מפוצץ', 'הגיע מפוצץ')).toBe(true);
  });

  it('accepts a term typed with the non-final letter too', () => {
    expect(matches('פגומ', 'הגיע פגום')).toBe(true);
    expect(matches('פגומ', 'הגיעו פגומים')).toBe(true);
  });

  // The relaxation must not turn the last letter into a wildcard.
  it('does not let the final-form relaxation match an unrelated word', () => {
    expect(matches('פגום', 'פגושים')).toBe(false);
    expect(matches('מפוצץ', 'מפוצל')).toBe(false);
  });

  it('is bounded at the start and end of the text', () => {
    expect(matches('פגום', 'פגום')).toBe(true);
    expect(matches('פגום', 'הגיע פגום.')).toBe(true);
    expect(matches('פגום', 'פגומים')).toBe(true);
  });

  it('does not match across a word that merely contains the letters', () => {
    expect(matches('נזק', 'הנזקקים לסיוע')).toBe(false);
  });

  // Terms come from account config, but a stray metacharacter must not become
  // a wildcard that sweeps in every conversation.
  it('escapes regex metacharacters in the term', () => {
    expect(() => buildHebrewTermPattern('מה?')).not.toThrow();
    expect(matches('מה?', 'מה שלומך')).toBe(false);
    expect(matches('מה?', 'מה? לא הבנתי')).toBe(true);
    expect(matches('.', 'שום דבר')).toBe(false);
  });
});

describe('normalizeWatchTerms', () => {
  it('trims, drops empties and dedupes', () => {
    expect(normalizeWatchTerms([' פגום ', 'פגום', '', '   ', 'שבור']))
      .toEqual(['פגום', 'שבור']);
  });

  it('caps the list so the report stays readable', () => {
    const many = Array.from({ length: MAX_WATCH_TERMS + 10 }, (_, i) => `מילה${i}`);
    expect(normalizeWatchTerms(many)).toHaveLength(MAX_WATCH_TERMS);
  });

  it('returns an empty list for anything that is not an array of strings', () => {
    expect(normalizeWatchTerms(null)).toEqual([]);
    expect(normalizeWatchTerms('פגום')).toEqual([]);
    expect(normalizeWatchTerms([1, 2, 3])).toEqual([]);
  });

  // A one-character term would match a letter inside half the corpus.
  it('rejects terms shorter than two characters', () => {
    expect(normalizeWatchTerms(['א', 'פגום'])).toEqual(['פגום']);
  });
});

describe('watch keyword shape', () => {
  // LA BEAUTÉ surfaced this before launch: with no classifications yet, every
  // session fell into "not a complaint" and the page would have reported
  // "פגום: 110 conversations, 0 complaints" — which reads as good news when the
  // truth is that nothing had been classified. Unknown must not look like zero.
  it('keeps unclassified conversations separate from non-complaints', () => {
    expect(splitWatchCounts({ sessions: 110, complaintSessions: 0, otherSessions: 0, unclassifiedSessions: 110 }))
      .toEqual({ known: false, complaintSessions: 0, otherSessions: 0, unclassifiedSessions: 110 });

    expect(splitWatchCounts({ sessions: 110, complaintSessions: 49, otherSessions: 61, unclassifiedSessions: 0 }))
      .toEqual({ known: true, complaintSessions: 49, otherSessions: 61, unclassifiedSessions: 0 });
  });

  it('treats a mostly-classified term as known', () => {
    expect(splitWatchCounts({ sessions: 100, complaintSessions: 90, otherSessions: 5, unclassifiedSessions: 5 }).known)
      .toBe(true);
  });
});
