import { describe, it, expect } from 'vitest';

// The renderer is JSX-internal, so assert the patterns it relies on. If these
// drift, replies silently degrade to unclickable paths — which is exactly the
// bug this was written for.
const MD_LINK = /\[([^\]]+)\]\((\/[^\s)]+)\)/g;
const BARE_PATH = /(?<![\w([])(\/influencer\/[\w[\]._-]+(?:\/[\w[\]._-]+)*)/g;

const mdMatches = (s: string) => [...s.matchAll(MD_LINK)].map(m => [m[1], m[2]]);
const bareMatches = (s: string) => [...s.matchAll(BARE_PATH)].map(m => m[1]);

describe('reply link patterns', () => {
  it('extracts a markdown link the model was told to emit', () => {
    expect(mdMatches('אפשר מכאן: [שיחות](/influencer/argania_group/conversations)'))
      .toEqual([['שיחות', '/influencer/argania_group/conversations']]);
  });

  it('still catches a bare path when the model ignores the format', () => {
    // The exact reply Ido got: a raw path, unclickable.
    expect(bareMatches('כנסי מכאן: /influencer/argania_group/conversations'))
      .toEqual(['/influencer/argania_group/conversations']);
  });

  it('handles a username with underscores and a nested route', () => {
    expect(bareMatches('/influencer/studiopasha_fashion/documents/upload'))
      .toEqual(['/influencer/studiopasha_fashion/documents/upload']);
  });

  it('does not linkify a path already inside a markdown link', () => {
    const text = '[שיחות](/influencer/argania_group/conversations)';
    // The markdown pass consumes it first; the bare pass only sees leftovers.
    const consumed = text.replace(MD_LINK, '');
    expect(bareMatches(consumed)).toEqual([]);
  });

  it('leaves ordinary text alone', () => {
    expect(bareMatches('אין כאן שום נתיב')).toEqual([]);
    expect(mdMatches('טקסט רגיל לגמרי')).toEqual([]);
  });

  it('picks up several links in one reply', () => {
    const text = 'קודם /influencer/a/coupons ואז /influencer/a/products';
    expect(bareMatches(text)).toHaveLength(2);
  });
});
