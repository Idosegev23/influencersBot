import * as cheerio from 'cheerio';

async function fetchXml(url: string, timeoutMs: number): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'BestieBot/1.0' }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null; // network error, abort/timeout, etc.
  } finally {
    clearTimeout(t);
  }
}

export interface SitemapBounds {
  /** stop after collecting this many page URLs (default 50000) */
  maxUrls?: number;
  /** stop after processing this many sitemap documents (default 200) */
  maxSitemaps?: number;
  /** overall wall-clock budget in ms (default 50000 — under Vercel's 60s) */
  deadlineMs?: number;
  /** per-sitemap fetch timeout in ms (default 8000) so one slow/blocked child can't eat the budget */
  perFetchMs?: number;
}

/**
 * Collect page URLs from a site's sitemap(s). BOUNDED: huge sites (e.g. H&M) have
 * deeply-nested sitemap indexes that would otherwise fetch for minutes and blow
 * the serverless timeout. The bounds cap URLs, sitemap docs, wall-clock, and each
 * fetch — so this always returns a (possibly sampled) list well before the deadline.
 * A sample is sufficient for category discovery and for a capped quote crawl.
 */
export async function discoverSitemapUrls(siteUrl: string, bounds?: SitemapBounds): Promise<string[]> {
  const maxUrls = bounds?.maxUrls ?? 50000;
  const maxSitemaps = bounds?.maxSitemaps ?? 200;
  const deadlineMs = bounds?.deadlineMs ?? 50000;
  const perFetchMs = bounds?.perFetchMs ?? 8000;
  const start = Date.now();

  const origin = new URL(siteUrl).origin;
  const host = new URL(siteUrl).host;
  const seen = new Set<string>();
  const out = new Set<string>();
  const queue = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  let processed = 0;

  while (queue.length) {
    if (out.size >= maxUrls || processed >= maxSitemaps || Date.now() - start >= deadlineMs) break;
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    const xml = await fetchXml(sm, perFetchMs);
    if (!xml) continue;
    processed++;
    const $ = cheerio.load(xml, { xmlMode: true });
    // nested sitemaps (including .gz children)
    $('sitemap > loc').each((_, el) => {
      const u = $(el).text().trim();
      if (u) queue.push(u);
    });
    // page urls
    $('url > loc').each((_, el) => {
      if (out.size >= maxUrls) return false; // stop iterating this doc
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
