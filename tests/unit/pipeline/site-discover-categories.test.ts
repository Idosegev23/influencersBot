import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/sitemap', () => ({ discoverSitemapUrls: vi.fn().mockResolvedValue([
  'https://s.com/cl1','https://s.com/cl2','https://s.com/cl3','https://s.com/magazine/a','https://s.com/legal/x',
]) }));
const pushed: string[][] = [];
vi.mock('@/lib/pipeline/state', () => ({ pushFrontier: vi.fn(async (_j: string, urls: string[]) => { pushed.push(urls); }), setCount: vi.fn(), popFrontier: vi.fn(), frontierSize: vi.fn() }));
describe('siteDiscoverStep with categories', () => {
  it('keeps only selected patterns and applies caps', async () => {
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');
    await siteDiscoverStep({ jobId: 'j', accountId: 'a', username: 'u', step: 'site-discover', batch: 0, state: { websiteUrl: 'https://s.com', options: { categories: [{ pathPattern: '/', cap: 2 }, { pathPattern: '/legal', cap: 0 }] } } as any });
    const urls = pushed[0];
    expect(urls.filter(u => u.includes('/cl')).length).toBe(2); // capped
    expect(urls.some(u => u.includes('/magazine'))).toBe(false); // not selected
    expect(urls.some(u => u.includes('/legal'))).toBe(false);    // cap 0
  });
});
