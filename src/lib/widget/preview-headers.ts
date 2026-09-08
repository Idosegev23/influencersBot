/**
 * Which upstream headers must never be echoed when we proxy a customer's site.
 *
 * Three separate reasons live here, and each one has bitten:
 *
 * 1. FRAMING — X-Frame-Options / CSP would stop our own iframe rendering the
 *    page, which is the entire point of the preview.
 * 2. TRANSPORT — Node's fetch transparently decompresses, so echoing the
 *    upstream's `Content-Encoding: gzip` tells the browser to decompress plain
 *    text (ERR_CONTENT_DECODING_FAILED → blank iframe). Content-Length is stale
 *    once we mutate the body, and Transfer-Encoding is not ours to repeat.
 * 3. FRAMEWORK CONTROL — this is the subtle one. A customer site built on
 *    Next.js answers with `x-middleware-rewrite: /he`. Echoing it put that
 *    header on OUR response, where OUR Next.js runtime read it as a routing
 *    directive and threw "NextResponse.rewrite() was used in a app route
 *    handler" — a 500 on the demo link, for every Next.js customer site.
 *    rebar.co.il was the first to reach this code path.
 *
 * Set-Cookie is dropped too: the customer's cookies have no business being set
 * on our origin under a shared demo link.
 */

const BLOCKED_EXACT = new Set([
  // framing
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'permissions-policy',
  // transport
  'content-encoding',
  'content-length',
  'transfer-encoding',
  // we already followed redirects; a leftover Location only confuses the browser
  'location',
  // not ours to set on our own origin
  'set-cookie',
]);

/**
 * Header namespaces a framework uses to drive ITS OWN routing. Echoing any of
 * them hands the customer's framework the steering wheel of our response.
 */
const BLOCKED_PREFIXES = ['x-middleware-', 'x-nextjs-'];

export function isBlockingHeader(name: string): boolean {
  const lower = name.toLowerCase();
  if (BLOCKED_EXACT.has(lower)) return true;
  return BLOCKED_PREFIXES.some((p) => lower.startsWith(p));
}

/** Copy an upstream response's headers, minus everything unsafe to echo. */
export function filterUpstreamHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    if (!isBlockingHeader(key)) out.append(key, value);
  });
  return out;
}
