import { describe, it, expect } from 'vitest';
import { normalizeFacebookUrl, normalizeFacebookPost } from '@/lib/scraping/facebookScraper';

describe('normalizeFacebookUrl', () => {
  it('accepts the three shapes a human actually pastes', () => {
    const canonical = 'https://www.facebook.com/AmericanBusAssociation';
    expect(normalizeFacebookUrl('https://www.facebook.com/AmericanBusAssociation')).toBe(canonical);
    expect(normalizeFacebookUrl('AmericanBusAssociation')).toBe(canonical);
    expect(normalizeFacebookUrl('@AmericanBusAssociation')).toBe(canonical);
  });

  it('strips a trailing slash and query noise', () => {
    expect(normalizeFacebookUrl('https://www.facebook.com/AmericanBusAssociation/?ref=page_internal'))
      .toBe('https://www.facebook.com/AmericanBusAssociation');
  });

  it('keeps the id on a profile.php url, which has no slug form', () => {
    // Dropping the query here would resolve every numeric profile to facebook.com.
    expect(normalizeFacebookUrl('https://www.facebook.com/profile.php?id=100064701666955'))
      .toBe('https://www.facebook.com/profile.php?id=100064701666955');
  });

  it('returns empty for empty input rather than a bare facebook.com', () => {
    expect(normalizeFacebookUrl('')).toBe('');
    expect(normalizeFacebookUrl('   ')).toBe('');
  });
});

describe('normalizeFacebookPost', () => {
  // Captured verbatim from a live /v1/facebook/profile/posts response.
  const raw = {
    id: '1536541121845929',
    text: 'Congratulations to Prevost on being named the 2026 International Motorcoach of the Year.',
    url: 'https://www.facebook.com/AmericanBusAssociation/posts/pfbid02VQ',
    image: 'https://scontent.xx.fbcdn.net/v/t39.jpg',
    reactionCount: 11,
    commentCount: 2,
    videoViewCount: null,
    publishTime: 1787722470,
    creation_time: '2026-08-20T05:34:30.000Z',
    topComments: [
      { text: 'Well deserved!', author: { name: 'A Member' } },
      { text: '   ', author: { name: 'Blank' } },
    ],
  };

  it('maps the fields the pipeline stores', () => {
    const post = normalizeFacebookPost(raw)!;
    expect(post.id).toBe('1536541121845929');
    expect(post.text).toContain('Prevost');
    expect(post.reactions).toBe(11);
    expect(post.comments).toBe(2);
    expect(post.createdAt).toBe('2026-08-20T05:34:30.000Z');
    expect(post.publishTime).toBe(1787722470);
  });

  it('keeps real comments and drops blank ones', () => {
    const post = normalizeFacebookPost(raw)!;
    // Presence first: the comments are the only source of real audience questions
    // this account has, and content_gaps is built on them. An empty array here
    // would make that insight impossible while every "no junk" assertion passed.
    expect(post.topComments).toHaveLength(1);
    expect(post.topComments[0].text).toBe('Well deserved!');
    expect(post.topComments[0].author).toBe('A Member');
  });

  it('survives a post with no comments, no image and no video views', () => {
    const post = normalizeFacebookPost({ id: '7', text: 'Plain text post' })!;
    expect(post.id).toBe('7');
    expect(post.text).toBe('Plain text post');
    expect(post.topComments).toEqual([]);
    expect(post.reactions).toBe(0);
    expect(post.comments).toBe(0);
    expect(post.videoViews).toBeUndefined();
  });

  it('rejects a post with no id, which cannot be deduped or stored', () => {
    expect(normalizeFacebookPost({ text: 'orphan' })).toBeNull();
    expect(normalizeFacebookPost(null)).toBeNull();
  });
});
