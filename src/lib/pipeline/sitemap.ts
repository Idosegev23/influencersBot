import * as cheerio from 'cheerio';

async function fetchXml(url: string, timeoutMs: number): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Use a realistic browser UA: many corporate sites (Akamai/Cloudflare bot
    // protection, e.g. lenovo.com) return 403 to bot-marker UAs, which silently
    // zeroes out sitemap discovery. Public, robots-allowed pages only.
    const r = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: ctrl.signal,
    });
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

  const parsedUrl = new URL(siteUrl);
  const origin = parsedUrl.origin;
  const host = parsedUrl.host;

  // Region/section awareness: a regional site URL like https://www.lenovo.com/il/en/
  // means the caller wants ISRAEL / English pages — NOT the whole global site. A
  // multi-country sitemap index (…-dz-fr.xml, …-il-en.xml, …-us-en.xml, processed in
  // file order) would otherwise fill the crawl budget with the FIRST country listed
  // and never reach the requested one. So restrict discovery to this path prefix.
  // Empty / "/" prefix ⇒ no restriction (whole-site behaviour, unchanged).
  const prefixSegs = parsedUrl.pathname.split('/').filter(Boolean);
  const prefixPath = prefixSegs.length ? '/' + prefixSegs.join('/') : '';
  // Joined forms (il-en / il_en / il/en) used to recognise the matching per-region
  // CHILD sitemap by name, so we fetch it before the wall-clock/URL budget runs out.
  const childTokens = prefixSegs.length >= 2
    ? [prefixSegs.join('-'), prefixSegs.join('_'), prefixSegs.join('/')]
    : [];

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
    const children: string[] = [];
    $('sitemap > loc').each((_, el) => {
      const u = $(el).text().trim();
      if (u) children.push(u);
    });
    if (children.length) {
      // When the region prefix names the child sitemaps (…-il-en.xml), queue ONLY the
      // matching ones. If none match (naming doesn't encode the region), fall back to
      // all children — the page-URL prefix filter below still keeps only in-region pages.
      const matched = childTokens.length
        ? children.filter(c => { const lc = c.toLowerCase(); return childTokens.some(t => lc.includes(t)); })
        : [];
      for (const c of (matched.length ? matched : children)) queue.push(c);
    }
    // page urls
    $('url > loc').each((_, el) => {
      if (out.size >= maxUrls) return false; // stop iterating this doc
      const u = $(el).text().trim();
      try {
        const pu = new URL(u);
        if (pu.host !== host) return;
        if (prefixPath && !pu.pathname.startsWith(prefixPath)) return; // wrong region — skip
        out.add(u);
      } catch {
        /* skip malformed */
      }
    });
  }
  return [...out];
}
