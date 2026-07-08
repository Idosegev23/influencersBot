// tests/unit/pipeline/discover-group.test.ts
import { describe, it, expect } from 'vitest';
import { groupUrlsByPath } from '@/lib/pipeline/discover';

describe('groupUrlsByPath', () => {
  it('groups by first path segment; root slugs collapse to "/"', () => {
    const urls = [
      'https://s.com/cl3606-01', 'https://s.com/cl9414-02', 'https://s.com/841313198035',
      'https://s.com/magazine/a', 'https://s.com/magazine/b', 'https://s.com/optic/x',
    ];
    const groups = groupUrlsByPath(urls);
    const byPattern = Object.fromEntries(groups.map(g => [g.pathPattern, g.count]));
    expect(byPattern['/']).toBe(3);          // root SKU slugs
    expect(byPattern['/magazine']).toBe(2);
    expect(byPattern['/optic']).toBe(1);
    expect(groups[0].count).toBeGreaterThanOrEqual(groups[1].count); // sorted desc
    expect(groups.find(g => g.pathPattern === '/')!.sampleUrls.length).toBeLessThanOrEqual(5);
  });
});
