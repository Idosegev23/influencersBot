/**
 * Normalize whatever someone types into a "website" field into an absolute URL.
 *
 * People type bare domains — `triroars.co.il`, `www.example.com` — because that is
 * how a website is written everywhere except in code. `new URL()` rejects those,
 * and the pipeline calls `new URL()` deep inside sitemap discovery (step 6 of 11),
 * so an unnormalized value did not fail fast: it scanned Instagram, transcribed
 * reels, and only then killed the job with "Invalid URL", losing every later step.
 *
 * Mirrors normalizeIgUsername: normalize at the boundary, never mid-pipeline.
 *
 *   normalizeWebsiteUrl('triroars.co.il')        -> 'https://triroars.co.il'
 *   normalizeWebsiteUrl('https://a.com/shop')    -> 'https://a.com/shop'
 *   normalizeWebsiteUrl('http://old.com')        -> 'http://old.com'   (not upgraded)
 *   normalizeWebsiteUrl('not a domain at all')   -> ''                 (dropped)
 *
 * Anything still unparseable returns '' so the caller treats it as "no website"
 * rather than handing a landmine to the pipeline.
 */
export function normalizeWebsiteUrl(input: string | null | undefined): string {
  const s = (input ?? '').trim();
  if (!s) return '';

  // Only prepend when there is no scheme at all. An explicit http:// is left as-is:
  // silently upgrading to https breaks sites that genuinely do not serve TLS.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;

  try {
    const url = new URL(withScheme);
    // A scheme alone ("http://") parses but has no host — useless to the crawler.
    if (!url.hostname || !url.hostname.includes('.')) return '';
    // Reject a hostname that survived parsing but cannot be a real one. `new URL`
    // accepts spaces by percent-encoding them, so "not a domain at all" would
    // otherwise sail through as the host "not%20a%20domain%20at%20all".
    if (/[^a-z0-9.-]/i.test(url.hostname)) return '';
    return withScheme;
  } catch {
    return '';
  }
}
