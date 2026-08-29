/**
 * Crawl transport for sites behind a bot challenge.
 *
 * Some customer sites sit behind Cloudflare/Akamai bot management that answers a
 * plain `fetch` with a 403 challenge page no matter how realistic the headers are
 * — buses.org does this on every path including its sitemap, and gov.il does the
 * same. A real browser passes those challenges the way any visitor does, so this
 * routes the crawl through Apify's `website-content-crawler`, which drives one.
 *
 * Deliberately NOT here: CAPTCHA-solving services, stealth fingerprint plugins,
 * or residential-proxy rotation. If ordinary browser crawling stops working for a
 * site, the answer is to ask that customer to allowlist us.
 *
 * The run is started asynchronously and drained in batches, because a synchronous
 * run of any real site exceeds the 600-second step ceiling.
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = 'apify~website-content-crawler';
const API = 'https://api.apify.com/v2';

/** Signatures of a bot-challenge response, as opposed to an ordinary error. */
const CHALLENGE_MARKERS = [
  'attention required',
  'just a moment',
  'cf-browser-verification',
  'cf_chl_opt',
  'checking your browser',
  '_incapsula_resource',
];

/**
 * Public suffixes that take TWO labels, so the registrable domain needs three.
 *
 * This list is the whole safety story for the subdomain glob below. Taking the
 * last two labels of `www.argania.co.il` yields `co.il`, and a
 * `https://*.co.il/**` glob would send the crawler across the Israeli internet
 * on a customer's budget. Anything not listed here falls back to two labels,
 * which is correct for .com/.org/.net and every customer we have.
 */
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.il', 'org.il', 'ac.il', 'gov.il', 'net.il',
  'com.au', 'net.au', 'org.au', 'co.nz', 'co.za', 'com.br', 'com.mx', 'co.jp', 'com.tr',
]);

/**
 * The registrable domain of a host — `www.buses.org` → `buses.org`.
 * Returns null when the host is an IP or too short to generalise safely.
 */
export function registrableDomain(host: string): string | null {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length < 2) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null; // an IP address
  const lastTwo = labels.slice(-2).join('.');
  if (TWO_LABEL_SUFFIXES.has(lastTwo)) {
    return labels.length >= 3 ? labels.slice(-3).join('.') : null;
  }
  return lastTwo;
}

export interface ApifyRunHandle {
  runId: string;
  datasetId: string;
}

export interface ApifyPage {
  url: string;
  html: string;
  title?: string;
  description?: string;
  ogImage?: string;
  structuredData?: unknown[];
}

function requireToken(): string {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN is not configured');
  return APIFY_TOKEN;
}

/**
 * Is this site answering a browser-shaped request with a bot challenge?
 *
 * Returns false on a network error: an unreachable host is a different problem,
 * and routing it to Apify would trade a clear failure for an expensive one.
 */
export async function isSiteChallenged(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    // 401/404 are the site talking to us; 403/429/503 are the guard.
    const guarded = res.status === 403 || res.status === 429 || res.status === 503;
    if (!guarded) return false;

    const body = (await res.text().catch(() => '')).slice(0, 4000).toLowerCase();
    const server = (res.headers.get('server') || '').toLowerCase();
    if (CHALLENGE_MARKERS.some((m) => body.includes(m))) return true;
    // A bare 403 from a known bot-management edge counts even without a marker.
    return server.includes('cloudflare') || res.headers.has('cf-ray');
  } catch {
    return false;
  }
}

/**
 * Start an asynchronous crawl. Returns immediately with the run handle; nothing
 * is waited on here.
 */
export async function startApifyCrawl(
  startUrl: string,
  maxPages: number,
  seedUrls: string[] = [],
): Promise<ApifyRunHandle> {
  const token = requireToken();

  // Seeds are entry points, not hints. On the plain-fetch path they are merged
  // into the frontier; here they were being dropped, so a page a human explicitly
  // named could only be found if the BFS happened to reach it. ABA named
  // /membership/join/ and /events/ — exactly the two pages that must not be left
  // to luck.
  const starts = [...new Set([startUrl, ...seedUrls])].filter(Boolean);

  // Follow SIBLING SUBDOMAINS, not just the starting hostname.
  //
  // ABA's biggest event lives on marketplace.buses.org, and the crawl —
  // hostname-scoped by default — never saw it, so the assistant told them it had
  // no event calendar. A customer's site is their domain, not one host of it.
  // maxCrawlPages still bounds the whole thing.
  let includeUrlGlobs: { glob: string }[] | undefined;
  try {
    const domain = registrableDomain(new URL(startUrl).hostname);
    if (domain) includeUrlGlobs = [{ glob: `https://*.${domain}/**` }, { glob: `https://${domain}/**` }];
  } catch { /* malformed url — stay hostname-scoped */ }

  const res = await fetch(`${API}/acts/${ACTOR_ID}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startUrls: starts.map((url) => ({ url })),
      maxCrawlPages: maxPages,
      // Firefox passes challenges that the Chromium build does not.
      crawlerType: 'playwright:firefox',
      // 'none' keeps the original DOM, so the shared cheerio extraction sees the
      // real page. The actor's default transform strips <title>, og tags and
      // ld+json, which would silently degrade every protected site's pages.
      htmlTransformer: 'none',
      saveHtml: true,
      saveMarkdown: false,
      proxyConfiguration: { useApifyProxy: true },
      ...(includeUrlGlobs ? { includeUrlGlobs } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Apify run start failed: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
  }
  const json = await res.json();
  const runId = json?.data?.id;
  const datasetId = json?.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new Error('Apify run start returned no run/dataset id');
  return { runId, datasetId };
}

export type ApifyRunState = 'running' | 'succeeded' | 'failed';

export async function getApifyRunState(runId: string): Promise<ApifyRunState> {
  const token = requireToken();
  const res = await fetch(`${API}/actor-runs/${runId}?token=${token}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Apify run status failed: ${res.status}`);
  const status = (await res.json())?.data?.status;
  if (status === 'SUCCEEDED') return 'succeeded';
  if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') return 'failed';
  return 'running';
}

/** Shape one dataset item into the page + fallbacks the shared extractor wants. */
export function toApifyPage(item: any): ApifyPage | null {
  const url = item?.url;
  const html = item?.html;
  if (!url || typeof html !== 'string' || html.length === 0) return null;

  const meta = item?.metadata || {};
  // openGraph arrives as [{property, content}, ...].
  const og: any[] = Array.isArray(meta.openGraph) ? meta.openGraph : [];
  const ogImage = og.find((t) => t?.property === 'og:image')?.content;
  const jsonLd = meta.jsonLd;

  return {
    url,
    html,
    title: meta.title || undefined,
    description: meta.description || undefined,
    ogImage: ogImage || undefined,
    structuredData: Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : undefined,
  };
}

/**
 * Read a slice of the run's dataset. `offset` makes this resumable across step
 * invocations, so a long crawl drains over several bounded calls.
 */
export async function fetchApifyPages(
  datasetId: string,
  offset: number,
  limit: number,
): Promise<ApifyPage[]> {
  const token = requireToken();
  const res = await fetch(
    `${API}/datasets/${datasetId}/items?token=${token}&offset=${offset}&limit=${limit}&clean=true`,
    { signal: AbortSignal.timeout(60000) },
  );
  if (!res.ok) throw new Error(`Apify dataset read failed: ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  return items.map(toApifyPage).filter((p): p is ApifyPage => p !== null);
}

/** How many items the run has produced so far. Used to know when a batch is ready. */
export async function apifyDatasetCount(datasetId: string): Promise<number> {
  const token = requireToken();
  const res = await fetch(`${API}/datasets/${datasetId}?token=${token}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return 0;
  return Number((await res.json())?.data?.itemCount ?? 0) || 0;
}
