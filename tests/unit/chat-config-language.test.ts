import { describe, it, expect } from 'vitest';
import { __test } from '@/lib/processing/generate-chat-config';

const { detectInfluencerTypes, generateSuggestedQuestionsEn } = __test;

describe('influencer-type detection on English content', () => {
  it('does not read "moments" as a parenting account', () => {
    // Real ABA copy. With the old unanchored /mom/gi this scored parenting, which
    // is exactly how Inter Miami CF ended up parenting-classified and purple.
    const text = 'Big numbers start with small moments. A handshake. A conversation. Momentum builds.';
    const { primary, all } = detectInfluencerTypes(text);
    expect(primary).not.toBe('parenting');
    expect(all).not.toContain('parenting');
  });

  it('still detects a real parenting account', () => {
    // Presence beside absence: if detection were simply broken, the test above
    // would pass for the wrong reason.
    const { primary } = detectInfluencerTypes('A mom of three sharing parenting tips for every baby stage');
    expect(primary).toBe('parenting');
  });

  it('still matches Hebrew keywords, which have no word boundaries to apply', () => {
    const { primary } = detectInfluencerTypes('טיפוח עור, איפור וסקינקייר — קרם וסרום');
    expect(primary).toBe('beauty');
  });

  it('scores a whole-word Latin match', () => {
    const { primary } = detectInfluencerTypes('travel and vacation planning, the best travel destinations');
    expect(primary).toBe('travel');
  });
});

describe('English starter questions', () => {
  it('gives an association its own questions, not retail ones', () => {
    const qs = generateSuggestedQuestionsEn([], 'other', 'association');
    expect(qs).toHaveLength(3);
    expect(qs.join(' ')).toMatch(/member/i);
    expect(qs.join(' ')).toMatch(/event/i);
    // "Any deals right now?" in front of a trade association is the retail leak.
    expect(qs.join(' ')).not.toMatch(/deal|discount|offer/i);
  });

  it('emits no Hebrew for any archetype or type', () => {
    const hebrew = /[֐-׿]/;
    const cases: [any, string | undefined][] = [
      ['other', 'association'],
      ['other', 'b2b_saas'],
      ['beauty', undefined],
      ['travel', undefined],
      ['other', undefined],
    ];
    for (const [type, archetype] of cases) {
      const qs = generateSuggestedQuestionsEn([{ name: 'Group Travel' }], type, archetype);
      expect(qs.length).toBeGreaterThan(0); // presence, so "no Hebrew" cannot pass vacuously
      for (const q of qs) expect(q).not.toMatch(hebrew);
    }
  });

  it('builds questions from real topics when the archetype has no vocabulary', () => {
    const qs = generateSuggestedQuestionsEn([{ name: 'Skincare routines' }], 'beauty', undefined);
    expect(qs[0]).toContain('Skincare routines');
  });
});
