import { describe, it, expect, vi, beforeEach } from 'vitest';

// SPA sites (headless Magento/Shopify) often list ONLY category pages in the sitemap —
// product detail pages are reachable only as links inside the listing HTML. `seedUrls`
// is the escape hatch that lets a caller inject those URLs straight into the crawl frontier.
vi.mock('@/lib/pipeline/sitemap', () => ({
  discoverSitemapUrls: vi.fn().mockResolvedValue([
    'https://s.com/women/tops',
    'https://s.com/women/dresses',
    'https://s.com/brands/mango',
    'https://s.com/legal/terms',
  ]),
}));

const pushed: string[][] = [];
const counts: { key: string; value: unknown }[] = [];
vi.mock('@/lib/pipeline/state', () => ({
  pushFrontier: vi.fn(async (_j: string, urls: string[]) => {
    pushed.push(urls);
  }),
  setCount: vi.fn(async (_j: string, key: string, value: unknown) => {
    counts.push({ key, value });
  }),
  popFrontier: vi.fn(),
  frontierSize: vi.fn(),
}));

const SEEDS = [
  'https://s.com/women/tops/tank-tops/r340280005',
  'https://s.com/men/shirts/tshirts/k085040002',
];

beforeEach(() => {
  pushed.length = 0;
  counts.length = 0;
});

async function run(options: Record<string, unknown>) {
  const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');
  await siteDiscoverStep({
    jobId: 'j',
    accountId: 'a',
    username: 'u',
    step: 'site-discover',
    batch: 0,
    state: { websiteUrl: 'https://s.com', options },
  } as any);
  return pushed[0];
}

describe('siteDiscoverStep seedUrls', () => {
  it('adds seed urls on top of the capped category selection', async () => {
    const urls = await run({
      categories: [{ pathPattern: '/brands', cap: 1 }],
      seedUrls: SEEDS,
    });
    // category selection survives
    expect(urls).toContain('https://s.com/brands/mango');
    // seeds are crawled even though they are absent from the sitemap
    for (const s of SEEDS) expect(urls).toContain(s);
    // unselected sitemap categories stay excluded
    expect(urls.some(u => u.includes('/legal'))).toBe(false);
  });

  it('crawls seed urls even when no sitemap category is selected', async () => {
    const urls = await run({ categories: [{ pathPattern: '/legal', cap: 0 }], seedUrls: SEEDS });
    expect(urls).toEqual(SEEDS);
  });

  it('deduplicates seeds already present in the sitemap selection', async () => {
    const urls = await run({
      categories: [{ pathPattern: '/brands', cap: 1 }],
      seedUrls: ['https://s.com/brands/mango', ...SEEDS],
    });
    expect(urls.filter(u => u === 'https://s.com/brands/mango')).toHaveLength(1);
  });

  it('counts seeds in the crawl total so the progress board is accurate', async () => {
    const urls = await run({ categories: [{ pathPattern: '/brands', cap: 1 }], seedUrls: SEEDS });
    const crawl = counts.find(c => c.key === 'crawl');
    expect(crawl?.value).toEqual({ done: 0, total: urls.length });
  });

  it('is a no-op when seedUrls is absent (full-scan behaviour unchanged)', async () => {
    const urls = await run({ maxPages: 2 });
    expect(urls).toHaveLength(2);
  });

  it('seeds are not truncated by maxPages, which only bounds the sitemap', async () => {
    const urls = await run({ maxPages: 1, seedUrls: SEEDS });
    expect(urls).toHaveLength(3); // 1 sitemap page + 2 seeds
    for (const s of SEEDS) expect(urls).toContain(s);
  });
});
