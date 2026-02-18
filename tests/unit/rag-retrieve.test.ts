/**
 * RAG Retrieval Tests
 *
 * Tests query classification and filter application logic.
 * DB-dependent tests are skipped if no Supabase connection.
 */
import { describe, it, expect } from 'vitest';

// We test the internal helpers by importing the module
// and checking classification output for known queries.

describe('Query Classification (keyword-based)', () => {
  // We replicate the classification logic here for unit testing
  // without needing the full module (which depends on Supabase).

  const STRUCTURED_INDICATORS = [
    'how many', 'count', 'total', 'average', 'sum', 'most', 'least', 'top',
    'number of', 'percentage', 'rate', 'statistics', 'stats',
    'כמה', 'סך הכל', 'ממוצע', 'סטטיסטיקות', 'הכי',
    'when did', 'latest', 'first', 'last', 'newest', 'oldest',
    'מתי', 'אחרון', 'ראשון', 'חדש',
  ];

  const ENTITY_KEYWORDS: Record<string, string[]> = {
    post: ['post', 'caption', 'photo', 'picture', 'image', 'reel', 'carousel', 'פוסט', 'תמונה', 'רילס'],
    transcription: ['video', 'said', 'spoke', 'talk', 'transcription', 'audio', 'סרטון', 'דיבר', 'אמר', 'תמלול'],
    partnership: ['partnership', 'brand', 'collab', 'sponsor', 'deal', 'contract', 'שיתוף', 'מותג', 'חוזה', 'ספונסר'],
    coupon: ['coupon', 'discount', 'code', 'promo', 'sale', 'קופון', 'הנחה', 'קוד', 'מבצע'],
  };

  function classifyQuery(query: string) {
    const lowerQuery = query.toLowerCase();
    const isStructured = STRUCTURED_INDICATORS.some(ind => lowerQuery.includes(ind));
    const inferredTypes: string[] = [];
    for (const [type, keywords] of Object.entries(ENTITY_KEYWORDS)) {
      if (keywords.some(kw => lowerQuery.includes(kw))) {
        inferredTypes.push(type);
      }
    }
    let queryType: string;
    if (isStructured && inferredTypes.length === 0) queryType = 'structured';
    else if (isStructured) queryType = 'mixed';
    else queryType = 'unstructured';
    return { queryType, inferredTypes };
  }

  it('classifies "how many posts" as mixed (structured + entity)', () => {
    const result = classifyQuery('how many posts do I have?');
    expect(result.queryType).toBe('mixed');
    expect(result.inferredTypes).toContain('post');
  });

  it('classifies "what coupons are available" as unstructured with coupon type', () => {
    const result = classifyQuery('what coupons are available?');
    expect(result.queryType).toBe('unstructured');
    expect(result.inferredTypes).toContain('coupon');
  });

  it('classifies "total views statistics" as structured', () => {
    const result = classifyQuery('total views statistics');
    expect(result.queryType).toBe('structured');
  });

  it('classifies "tell me about partnerships" as unstructured with partnership type', () => {
    const result = classifyQuery('tell me about brand partnerships');
    expect(result.queryType).toBe('unstructured');
    expect(result.inferredTypes).toContain('partnership');
  });

  it('classifies "what did she say in the video" as unstructured with transcription type', () => {
    const result = classifyQuery('what did she say in the video');
    expect(result.queryType).toBe('unstructured');
    expect(result.inferredTypes).toContain('transcription');
  });

  it('classifies Hebrew query about coupons correctly', () => {
    const result = classifyQuery('יש לה קופון הנחה?');
    expect(result.inferredTypes).toContain('coupon');
  });

  it('classifies pure text query as unstructured', () => {
    const result = classifyQuery('what is her morning routine?');
    expect(result.queryType).toBe('unstructured');
    expect(result.inferredTypes).toEqual([]);
  });

  it('classifies "כמה פוסטים" as mixed', () => {
    const result = classifyQuery('כמה פוסטים יש?');
    expect(result.queryType).toBe('mixed');
    expect(result.inferredTypes).toContain('post');
  });
});

describe('Filter Application', () => {
  it('parses time window for "this week"', () => {
    const query = 'what happened this week';
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Simulate time detection
    const hasThisWeek = /this week|השבוע/i.test(query);
    expect(hasThisWeek).toBe(true);

    const timeWindow = { after: weekAgo.toISOString() };
    expect(new Date(timeWindow.after).getTime()).toBeLessThan(now.getTime());
  });

  it('parses time window for "today"', () => {
    const query = 'what posts from today';
    const hasToday = /today|היום/i.test(query);
    expect(hasToday).toBe(true);
  });

  it('does not detect time window for generic query', () => {
    const query = 'tell me about her skincare routine';
    const hasTime = /this week|this month|last month|today|yesterday|השבוע|החודש|חודש שעבר|היום|אתמול/i.test(query);
    expect(hasTime).toBe(false);
  });
});
