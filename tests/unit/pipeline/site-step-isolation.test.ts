import { describe, it, expect, vi, beforeEach } from 'vitest';

// The incident: site-discover threw "Invalid URL" and killed the WHOLE job at step 6
// of 11 — after Instagram had already been scanned — so rag-ingest, product-extract,
// persona-build and finalize never ran. One broken source must not cost the rest.
const discoverSitemapUrls = vi.fn();
vi.mock('@/lib/pipeline/sitemap', () => ({ discoverSitemapUrls: (...a: any[]) => discoverSitemapUrls(...a) }));

const pushFrontier = vi.fn();
const setCount = vi.fn();
const popFrontier = vi.fn();
const frontierSize = vi.fn();
vi.mock('@/lib/pipeline/state', () => ({ pushFrontier, setCount, popFrontier, frontierSize }));

const crawlPageBatch = vi.fn();
vi.mock('@/lib/pipeline/crawl', () => ({ crawlPageBatch: (...a: any[]) => crawlPageBatch(...a) }));
vi.mock('@/lib/redis', () => ({ redisSetNx: vi.fn(async () => true), redisExists: vi.fn(async () => false) }));

const addStepLog = vi.fn();
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({
  getScanJobsRepo: () => ({ addStepLog }),
}));

const ctx = (state: any) => ({
  jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-discover' as const, batch: 0, state,
});

beforeEach(() => {
  discoverSitemapUrls.mockReset();
  pushFrontier.mockReset();
  setCount.mockReset();
  addStepLog.mockReset();
  popFrontier.mockReset();
  frontierSize.mockReset();
  crawlPageBatch.mockReset();
});

describe('siteDiscoverStep failure isolation', () => {
  it('advances instead of failing when sitemap discovery throws', async () => {
    discoverSitemapUrls.mockRejectedValue(new TypeError('Invalid URL'));
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');

    const res = await siteDiscoverStep(ctx({ websiteUrl: 'triroars.co.il', options: { maxPages: null } }) as any);

    expect(res.status).toBe('advance');
    expect(pushFrontier).not.toHaveBeenCalled();
  });

  it('records the failure in the step log so it is visible on the scan board', async () => {
    discoverSitemapUrls.mockRejectedValue(new TypeError('Invalid URL'));
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');

    await siteDiscoverStep(ctx({ websiteUrl: 'triroars.co.il', options: { maxPages: null } }) as any);

    expect(addStepLog).toHaveBeenCalled();
    const [jobId, step, status, , message] = addStepLog.mock.calls[0];
    expect(jobId).toBe('j1');
    expect(step).toBe('site-discover');
    expect(status).toBe('failed');
    expect(String(message)).toContain('Invalid URL');
  });

  it('leaves the crawl frontier empty so site-crawl has nothing to do', async () => {
    discoverSitemapUrls.mockRejectedValue(new Error('boom'));
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');

    await siteDiscoverStep(ctx({ websiteUrl: 'https://x.com', options: { maxPages: null } }) as any);

    expect(pushFrontier).not.toHaveBeenCalled();
    expect(setCount).toHaveBeenCalledWith('j1', 'crawl', { done: 0, total: 0 });
  });

  it('still works normally when discovery succeeds', async () => {
    discoverSitemapUrls.mockResolvedValue(['https://x.com/a', 'https://x.com/b']);
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');

    const res = await siteDiscoverStep(ctx({ websiteUrl: 'https://x.com', options: { maxPages: null } }) as any);

    expect(res.status).toBe('advance');
    expect(pushFrontier).toHaveBeenCalledWith('j1', ['https://x.com/a', 'https://x.com/b']);
    expect(addStepLog).not.toHaveBeenCalled();
  });
});

describe('siteCrawlStep failure isolation', () => {
  it('counts a throwing batch as done and keeps going instead of failing the job', async () => {
    crawlPageBatch.mockRejectedValue(new Error('fetch failed'));
    popFrontier.mockResolvedValue(['https://x.com/a', 'https://x.com/b']);
    frontierSize.mockResolvedValue(3); // more URLs still queued

    const { siteCrawlStep } = await import('@/lib/pipeline/steps/site-crawl');
    const res = await siteCrawlStep({
      jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-crawl', batch: 0,
      state: { counts: { crawl: { done: 0, total: 5 } }, options: {} },
    } as any);

    // The batch is lost, but the remaining frontier must still be worked.
    expect(res.status).toBe('re-enqueue');
    expect(setCount).toHaveBeenCalledWith('j1', 'crawl', { done: 2, total: 5 });
    expect(addStepLog).toHaveBeenCalled();
    expect(addStepLog.mock.calls[0][2]).toBe('failed');
  });

  it('advances when a throwing batch drains the frontier', async () => {
    crawlPageBatch.mockRejectedValue(new Error('fetch failed'));
    popFrontier.mockResolvedValue(['https://x.com/a']);
    frontierSize.mockResolvedValue(0);

    const { siteCrawlStep } = await import('@/lib/pipeline/steps/site-crawl');
    const res = await siteCrawlStep({
      jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-crawl', batch: 0,
      state: { counts: { crawl: { done: 0, total: 1 } }, options: {} },
    } as any);

    expect(res.status).toBe('advance');
  });
});
