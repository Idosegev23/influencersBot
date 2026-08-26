import { describe, it, expect } from 'vitest';
import { median, rawEngagement, withRelativeEngagement } from '@/lib/insights/collect';
import { generateCadence, generateTopPerformers, generateTopicMap } from '@/lib/insights/deterministic';
import { enforceEvidence } from '@/lib/insights';
import { extractAudienceQuestions } from '@/lib/insights/gaps';
import type { InsightCorpus, InsightPost } from '@/lib/insights/types';

function post(over: Partial<InsightPost> & { id: string }): Omit<InsightPost, 'relativeEngagement' | 'engagement'> {
  return {
    platform: 'facebook',
    url: `https://facebook.com/${over.id}`,
    caption: 'A post about motorcoach safety',
    likes: 0,
    comments: 0,
    views: 0,
    postedAt: '2026-08-20T14:00:00.000Z',
    hasMedia: true,
    ...over,
  } as any;
}

function corpus(over: Partial<InsightCorpus> = {}): InsightCorpus {
  return {
    accountId: 'acct-1',
    displayName: 'American Bus Association',
    language: 'en',
    timezone: 'America/New_York',
    archetype: 'association',
    posts: [],
    comments: [],
    topicCounts: {},
    topicSamples: {},
    websitePageCount: 0,
    totalChunks: 0,
    ...over,
  };
}

describe('engagement is scored within a platform, not across platforms', () => {
  it('does not let a high-volume platform outrank a genuine outlier elsewhere', () => {
    const scored = withRelativeEngagement([
      // Instagram: busy, all typical.
      ...Array.from({ length: 5 }, (_, i) => post({ id: `ig${i}`, platform: 'instagram', likes: 100 })),
      // Facebook: quiet, but this one is 10× its platform's normal.
      ...Array.from({ length: 4 }, (_, i) => post({ id: `fb${i}`, platform: 'facebook', likes: 2 })),
      post({ id: 'fb-star', platform: 'facebook', likes: 20 }),
    ]);

    const best = [...scored].sort((a, b) => b.relativeEngagement - a.relativeEngagement)[0];
    expect(best.id).toBe('fb-star');
    // Raw counts would have put every Instagram post above it.
    expect(best.likes).toBeLessThan(100);
  });

  it('does not divide by zero when a platform has no engagement at all', () => {
    const scored = withRelativeEngagement([
      post({ id: 'a', likes: 0 }),
      post({ id: 'b', likes: 0 }),
    ]);
    for (const p of scored) expect(Number.isFinite(p.relativeEngagement)).toBe(true);
  });

  it('median and rawEngagement behave on empty and normal input', () => {
    expect(median([])).toBe(0);
    expect(median([1, 3, 2])).toBe(2);
    expect(rawEngagement({ likes: 4, comments: 3 })).toBe(7);
  });
});

describe('top performers refuses to invent a winner', () => {
  it('says nothing when every post scored zero', () => {
    const posts = withRelativeEngagement(Array.from({ length: 20 }, (_, i) => post({ id: `p${i}`, likes: 0 })));
    expect(generateTopPerformers(corpus({ posts }))).toEqual([]);
  });

  it('reports the real leader with its posts as evidence', () => {
    const posts = withRelativeEngagement([
      ...Array.from({ length: 9 }, (_, i) => post({ id: `p${i}`, likes: 1 })),
      post({ id: 'winner', likes: 40, caption: '#ABA100 Century on the Road' }),
    ]);
    const out = generateTopPerformers(corpus({ posts }));
    expect(out.length).toBeGreaterThan(0);
    const first = out[0];
    expect(first.evidence.length).toBeGreaterThan(0);
    expect(first.evidence[0].excerpt).toContain('ABA100');
    expect(first.evidence[0].value).toBe(40);
    expect(first.metrics.sampleSize).toBe(10);
  });
});

describe('cadence refuses to read patterns into a small sample', () => {
  it('says nothing at all below the minimum post count', () => {
    const posts = withRelativeEngagement(
      Array.from({ length: 6 }, (_, i) => post({ id: `p${i}`, postedAt: `2026-08-0${i + 1}T14:00:00.000Z` })),
    );
    expect(generateCadence(corpus({ posts }))).toEqual([]);
  });

  it('reports rhythm once there is enough history', () => {
    const posts = withRelativeEngagement(
      Array.from({ length: 30 }, (_, i) => {
        const day = String((i % 28) + 1).padStart(2, '0');
        return post({ id: `p${i}`, postedAt: `2026-07-${day}T14:00:00.000Z`, likes: i });
      }),
    );
    const out = generateCadence(corpus({ posts }));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].metrics.postsPerWeek).toBeGreaterThan(0);
    expect(out[0].evidence.length).toBeGreaterThan(0);
  });

  it('never claims a best day without enough posts in that day bucket', () => {
    // 14 posts, all on distinct dates spread thin — no day reaches the bucket
    // minimum, so a "strongest day" claim must not appear.
    const posts = withRelativeEngagement(
      Array.from({ length: 14 }, (_, i) => {
        const day = String(i + 1).padStart(2, '0');
        return post({ id: `p${i}`, postedAt: `2026-07-${day}T14:00:00.000Z`, likes: i * 3 });
      }),
    );
    const out = generateCadence(corpus({ posts }));
    expect(out.some((i) => /strongest day/i.test(i.title))).toBe(false);
  });
});

describe('topic map', () => {
  it('reports the distribution with counts as evidence', () => {
    const out = generateTopicMap(corpus({ topicCounts: { membership: 60, advocacy: 25, events: 15 } }));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].metrics.total).toBe(100);
    expect(out[0].evidence.map((e) => e.title)).toContain('Membership');
    expect(out[0].evidence.find((e) => e.title === 'Membership')?.value).toBe(60);
  });

  it('flags a lopsided corpus, because it predicts where the bot will hedge', () => {
    const out = generateTopicMap(corpus({ topicCounts: { membership: 90, events: 5 } }));
    expect(out.some((i) => /leans heavily/i.test(i.title))).toBe(true);
  });

  it('says nothing when nothing was classified', () => {
    expect(generateTopicMap(corpus({ topicCounts: {} }))).toEqual([]);
  });
});

describe('the evidence rule', () => {
  it('drops any insight that cannot be checked', () => {
    const kept = enforceEvidence([
      { type: 'topic_map', title: 'checkable', summary: 's', rank: 0, metrics: {}, evidence: [{ kind: 'page', value: 1 }] },
      { type: 'cadence', title: 'unfalsifiable prose', summary: 's', rank: 0, metrics: {}, evidence: [] },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe('checkable');
  });
});

describe('audience questions', () => {
  it('keeps questions and drops applause', () => {
    const found = extractAudienceQuestions([
      { text: 'See you there', postUrl: null, platform: 'facebook' },
      { text: 'Well deserved!', postUrl: null, platform: 'facebook' },
      { text: 'How much does membership cost for a small operator?', postUrl: null, platform: 'facebook' },
      { text: 'When is Marketplace 2027', postUrl: null, platform: 'instagram' },
    ]);
    // Presence first — a filter that drops everything would satisfy "no applause".
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.text).join(' ')).toContain('membership cost');
    expect(found.map((f) => f.text).join(' ')).toContain('Marketplace 2027');
  });

  it('deduplicates repeats of the same question', () => {
    const found = extractAudienceQuestions([
      { text: 'How do I join?', postUrl: null, platform: 'facebook' },
      { text: 'how do i join??', postUrl: null, platform: 'instagram' },
    ]);
    expect(found).toHaveLength(1);
  });
});
