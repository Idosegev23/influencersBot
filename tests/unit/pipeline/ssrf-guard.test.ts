// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const DNS: Record<string, string> = { 'public.example': '93.184.216.34', 'inside.example': '10.0.0.7', 'meta.example': '169.254.169.254' };
vi.mock('node:dns/promises', () => ({
  default: { lookup: async (h: string) => { if (!DNS[h]) throw new Error('ENOTFOUND'); return [{ address: DNS[h], family: 4 }]; } },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));

import { discoverSitemapUrls } from '@/lib/pipeline/sitemap';
import { isSiteChallenged } from '@/lib/pipeline/apify-crawl';
import { crawlPageBatch } from '@/lib/pipeline/crawl';

const xml = '<urlset><url><loc>https://public.example/p1</loc></url></urlset>';
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(xml, { status: 200 }));
  global.fetch = fetchMock as any;
});

describe('pipeline fetchers refuse private targets', () => {
  it('sitemap discovery fetches a public site', async () => {
    const urls = await discoverSitemapUrls('https://public.example', { maxUrls: 5, maxSitemaps: 2, deadlineMs: 3000, perFetchMs: 1000 });
    expect(fetchMock).toHaveBeenCalled();
    expect(urls).toContain('https://public.example/p1');
  });

  it.each(['https://inside.example', 'https://meta.example', 'http://127.0.0.1'])('sitemap discovery never fetches %s', async (site) => {
    await discoverSitemapUrls(site, { maxUrls: 5, maxSitemaps: 2, deadlineMs: 3000, perFetchMs: 1000 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a public site redirecting into the network is not followed', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }));
    await discoverSitemapUrls('https://public.example', { maxUrls: 5, maxSitemaps: 2, deadlineMs: 3000, perFetchMs: 1000 });
    expect(fetchMock.mock.calls.every((c: any[]) => !String(c[0]).includes('169.254'))).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('the challenge probe and the page crawl skip a private host', async () => {
    expect(await isSiteChallenged('https://inside.example/')).toBe(false);
    expect((await crawlPageBatch(['https://inside.example/a'], 'acc')).savedPages).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    await isSiteChallenged('https://public.example/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
