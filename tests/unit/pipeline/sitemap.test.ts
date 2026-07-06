import { describe, it, expect, vi } from 'vitest';
describe('discoverSitemapUrls', () => {
  it('parses a urlset and returns same-host locs', async () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://site.com/a</loc></url><url><loc>https://site.com/b</loc></url></urlset>`;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xml, headers: new Map() }) as any;
    const { discoverSitemapUrls } = await import('@/lib/pipeline/sitemap');
    const urls = await discoverSitemapUrls('https://site.com');
    expect(urls).toContain('https://site.com/a');
    expect(urls).toContain('https://site.com/b');
  });
});
