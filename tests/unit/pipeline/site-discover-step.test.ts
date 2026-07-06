import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/sitemap', () => ({ discoverSitemapUrls: vi.fn().mockResolvedValue(['https://s.com/a','https://s.com/b']) }));
const pushFrontier = vi.fn(); const setCount = vi.fn();
vi.mock('@/lib/pipeline/state', () => ({ pushFrontier, setCount }));
describe('siteDiscoverStep', () => {
  it('skips when no website', async () => {
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');
    const res = await siteDiscoverStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-discover', batch: 0, state: { options: {}, } as any });
    expect(res.status).toBe('advance');
    expect(pushFrontier).not.toHaveBeenCalled();
  });
  it('pushes frontier when website present', async () => {
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');
    const res = await siteDiscoverStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-discover', batch: 0, state: { websiteUrl: 'https://s.com', options: { maxPages: null } } as any });
    expect(pushFrontier).toHaveBeenCalledWith('j1', ['https://s.com/a','https://s.com/b']);
    expect(res.status).toBe('advance');
  });
});
