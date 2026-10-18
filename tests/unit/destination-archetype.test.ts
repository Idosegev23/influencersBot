import { describe, it, expect } from 'vitest';
import {
  RETAIL_TOPICS,
  ASSOCIATION_TOPICS,
  DESTINATION_TOPICS,
  VALID_TOPICS,
  topicsForArchetype,
} from '@/lib/rag/enrich';
import { ARCHETYPE_CONFIGS } from '@/lib/rag/archetypes';
import { __test } from '@/lib/processing/generate-chat-config';
import { commerceSurfacesEnabled } from '@/lib/instagram-graph/dm-menu-defaults';
import { verticalForArchetype } from '@/lib/catalog/verticals';
import {
  normalizeTwitterHandle,
  parseTweet,
  cleanTweetText,
  tweetDateToIso,
} from '@/lib/scraping/twitterScraper';
import { pickJpegCover } from '@/lib/scraping/tiktokScraper';

const { generateSuggestedQuestionsEn } = __test;

describe('destination topic vocabulary', () => {
  it('gives a tourism board its own vocabulary, not the retail one', () => {
    const { topics, fallback } = topicsForArchetype('destination');
    // Presence: the three tab filters exist.
    for (const t of ['destinations', 'experiences', 'stay']) expect(topics).toContain(t);
    // The retail categories that swallowed every page of a travel site are gone.
    expect(topics).not.toContain('lifestyle');
    expect(topics).not.toContain('beauty');
    expect(topics).toContain(fallback);
  });

  it('leaves the other vocabularies exactly as they were', () => {
    expect(topicsForArchetype('association').topics).toEqual(ASSOCIATION_TOPICS);
    expect(topicsForArchetype('brand').topics).toEqual(RETAIL_TOPICS);
    expect(topicsForArchetype(undefined).topics).toEqual(RETAIL_TOPICS);
  });

  it('exposes every destination topic through VALID_TOPICS without duplicates', () => {
    for (const t of DESTINATION_TOPICS) expect(VALID_TOPICS).toContain(t);
    expect(new Set(VALID_TOPICS).size).toBe(VALID_TOPICS.length);
  });
});

describe('destination RAG weighting', () => {
  const cfg = ARCHETYPE_CONFIGS.destination!;

  it('is a first-class archetype that ranks the site first and keeps social in play', () => {
    expect(cfg).toBeDefined();
    expect(cfg.typeWeights.website!).toBeGreaterThan(cfg.typeWeights.post!);
    expect(cfg.typeWeights.post!).toBeGreaterThan(0);
    expect(cfg.typeCaps.post!).toBeGreaterThan(0);
  });

  it('cannot surface a coupon, a partnership or a product', () => {
    for (const t of ['coupon', 'partnership', 'product'] as const) {
      expect(cfg.typeWeights[t]!).toBeLessThan(0);
      expect(cfg.typeCaps[t]).toBe(0);
    }
  });
});

describe('destination surfaces', () => {
  it('asks travel questions, never retail ones, and no Hebrew', () => {
    const qs = generateSuggestedQuestionsEn([], 'other', 'destination');
    expect(qs).toHaveLength(3);
    expect(qs.join(' ')).toMatch(/go|stay|do/i);
    expect(qs.join(' ')).not.toMatch(/deal|discount|offer|member/i);
    expect(qs.join(' ')).not.toMatch(/[֐-׿]/);
  });

  it('has no shop: no commerce DM menu, a services catalog vertical', () => {
    expect(commerceSurfacesEnabled('destination')).toBe(false);
    expect(verticalForArchetype('destination')).toBe('services');
    // Absence needs a presence: a retail archetype still has commerce.
    expect(commerceSurfacesEnabled('brand')).toBe(true);
  });
});

describe('X scraper', () => {
  it('normalizes every way an admin pastes a handle', () => {
    for (const input of ['GoDomRep', '@GoDomRep', 'https://x.com/GoDomRep', 'twitter.com/GoDomRep/status/123', ' x.com/@GoDomRep?lang=en ']) {
      expect(normalizeTwitterHandle(input)).toBe('GoDomRep');
    }
  });

  it('strips t.co links and decodes entities, keeps the words', () => {
    expect(cleanTweetText('Beach day &amp; sun http://t.co/HqmjHKJQkV')).toBe('Beach day & sun');
    expect(cleanTweetText('Which beach? http://t.co/abc https://t.co/def')).toBe('Which beach?');
  });

  it('reads the non-ISO created_at', () => {
    expect(tweetDateToIso('Thu Jun 04 21:30:38 +0000 2015')).toBe('2015-06-04T21:30:38.000Z');
    expect(tweetDateToIso('garbage')).toBeUndefined();
    expect(tweetDateToIso(undefined)).toBeUndefined();
  });

  const raw = (over: any = {}) => ({
    rest_id: '606573801606938624',
    url: 'https://x.com/GoDomRep/status/606573801606938624',
    legacy: {
      full_text: 'Ideal beach? http://t.co/x',
      created_at: 'Thu Jun 04 21:30:38 +0000 2015',
      favorite_count: 442, reply_count: 59, retweet_count: 576, quote_count: 3,
      extended_entities: { media: [{ type: 'photo', media_url_https: 'https://pbs.twimg.com/media/a.jpg' }] },
      ...over,
    },
  });

  it('parses a tweet into engagement, text and images', () => {
    const t = parseTweet(raw())!;
    expect(t.id).toBe('606573801606938624');
    expect(t.text).toBe('Ideal beach?');
    expect(t.likes).toBe(442);
    expect(t.replies).toBe(59);
    expect(t.images).toEqual(['https://pbs.twimg.com/media/a.jpg']);
    expect(t.hasVideo).toBe(false);
  });

  it('drops retweets and malformed rows, flags video', () => {
    expect(parseTweet(raw({ retweeted_status_result: { result: {} } }))).toBeNull();
    expect(parseTweet({ legacy: {} })).toBeNull();
    expect(parseTweet(null)).toBeNull();
    expect(parseTweet(raw({ extended_entities: { media: [{ type: 'video' }] } }))!.hasVideo).toBe(true);
  });
});

describe('TikTok cover', () => {
  it('prefers a jpeg over the heic variants that come first', () => {
    const video = { cover: { url_list: ['https://x/a.heic?s=1', 'https://x/a.heic?s=2', 'https://x/a.jpeg?s=3'] } };
    expect(pickJpegCover(video)).toBe('https://x/a.jpeg?s=3');
  });

  it('returns nothing rather than a heic the browser cannot show', () => {
    expect(pickJpegCover({ cover: { url_list: ['https://x/a.heic'] } })).toBeUndefined();
    expect(pickJpegCover(undefined)).toBeUndefined();
  });
});
