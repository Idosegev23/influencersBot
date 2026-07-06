import { describe, it, expect, vi } from 'vitest';
const popFrontier = vi.fn().mockResolvedValueOnce(['https://s.com/a']).mockResolvedValue([]);
const frontierSize = vi.fn().mockResolvedValueOnce(0);
vi.mock('@/lib/pipeline/state', () => ({ popFrontier, frontierSize, pushFrontier: vi.fn(), setCount: vi.fn() }));
vi.mock('@/lib/pipeline/crawl', () => ({ crawlPageBatch: vi.fn().mockResolvedValue({ savedPages: 1, discoveredLinks: [] }) }));
describe('siteCrawlStep', () => {
  it('advances when frontier drains', async () => {
    const { siteCrawlStep } = await import('@/lib/pipeline/steps/site-crawl');
    const res = await siteCrawlStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-crawl', batch: 0, state: { counts: { crawl: { done: 0, total: 1 } }, options: {} } as any });
    expect(res.status).toBe('advance');
  });
});
