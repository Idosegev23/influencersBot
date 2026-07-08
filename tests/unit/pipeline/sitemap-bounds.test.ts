import { describe, it, expect, vi } from 'vitest';

describe('discoverSitemapUrls bounds', () => {
  it('caps output at maxUrls (prevents huge-site timeouts)', async () => {
    const xml = `<urlset>${Array.from({ length: 20 }, (_, i) => `<url><loc>https://s.com/p${i}</loc></url>`).join('')}</urlset>`;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xml }) as any;
    const { discoverSitemapUrls } = await import('@/lib/pipeline/sitemap');
    const urls = await discoverSitemapUrls('https://s.com', { maxUrls: 5, maxSitemaps: 5, deadlineMs: 5000, perFetchMs: 2000 });
    expect(urls.length).toBeLessThanOrEqual(5);
    expect(urls.length).toBeGreaterThan(0);
  });
});
