/**
 * Replies are markdown, rendered by react-markdown. The one thing it will not
 * do is linkify a bare path, so that is pre-processed — and that pre-processing
 * is what these pin. If it drifts, replies quietly degrade to unclickable paths.
 */
import { describe, it, expect } from 'vitest';
import { linkifyBarePaths } from '@/components/bestie/DashboardAssistant';

describe('linkifyBarePaths', () => {
  it('wraps a bare path so markdown renders it as a link', () => {
    // The exact reply Ido got: a raw path, unclickable.
    expect(linkifyBarePaths('כנסי מכאן: /influencer/argania_group/conversations'))
      .toBe('כנסי מכאן: [/influencer/argania_group/conversations](/influencer/argania_group/conversations)');
  });

  it('leaves an existing markdown link alone', () => {
    const already = '[שיחות](/influencer/argania_group/conversations)';
    expect(linkifyBarePaths(already)).toBe(already);
  });

  it('handles usernames with underscores and nested routes', () => {
    expect(linkifyBarePaths('/influencer/studiopasha_fashion/documents/upload'))
      .toBe('[/influencer/studiopasha_fashion/documents/upload](/influencer/studiopasha_fashion/documents/upload)');
  });

  it('wraps several paths in one reply', () => {
    const out = linkifyBarePaths('קודם /influencer/a/coupons ואז /influencer/a/products');
    expect(out.match(/\]\(/g)).toHaveLength(2);
  });

  it('leaves ordinary text untouched', () => {
    expect(linkifyBarePaths('אין כאן שום נתיב')).toBe('אין כאן שום נתיב');
  });

  it('does not touch markdown the renderer already handles', () => {
    const md = '**מודגש**\n\n1. פריט\n2. פריט\n\n- תבליט';
    expect(linkifyBarePaths(md)).toBe(md);
  });
});
