import * as cheerio from 'cheerio';

async function fetchXml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'BestieBot/1.0' } });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

export async function discoverSitemapUrls(siteUrl: string): Promise<string[]> {
  const origin = new URL(siteUrl).origin;
  const host = new URL(siteUrl).host;
  const seen = new Set<string>();
  const out = new Set<string>();
  const queue = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  while (queue.length) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    const xml = await fetchXml(sm);
    if (!xml) continue;
    const $ = cheerio.load(xml, { xmlMode: true });
    // nested sitemaps (including .gz children)
    $('sitemap > loc').each((_, el) => {
      const u = $(el).text().trim();
      if (u) queue.push(u);
    });
    // page urls
    $('url > loc').each((_, el) => {
      const u = $(el).text().trim();
      try {
        if (u && new URL(u).host === host) out.add(u);
      } catch {
        /* skip malformed */
      }
    });
  }
  return [...out];
}
