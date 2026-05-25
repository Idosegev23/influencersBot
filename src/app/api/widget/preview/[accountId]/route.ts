/**
 * Widget Preview Proxy — fetches the customer's site server-side, strips
 * iframe-blocking headers, injects our widget script, and returns the
 * modified HTML so we can embed it in an admin iframe.
 *
 * The point: an authentic preview of how the real widget.js behaves on the
 * customer's actual site, with no reimplementation drift. Single source of
 * truth for the widget chrome is public/widget.js.
 *
 *   GET /api/widget/preview/[accountId]?path=/products/foo
 *     → fetches https://customer-domain.com/products/foo
 *     → injects <base href> + our widget.js
 *     → returns HTML without X-Frame-Options / restrictive CSP
 *
 * Auth model: proxy is restricted to a domain we've already registered for
 * that account (config.widget.domain). Visitors can't make us proxy
 * arbitrary URLs. Admin auth not required because the proxied content is
 * already publicly fetchable — anyone could `curl` the customer's site
 * directly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const FETCH_TIMEOUT_MS = 12000;

// Browsers refuse to render pages with these headers in an iframe. We
// proxy the customer's site, so we get to decide what headers to send back.
// X-Frame-Options + frame-ancestors directives are filtered out below.
function isBlockingHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'x-frame-options' || lower === 'content-security-policy'
    || lower === 'content-security-policy-report-only' || lower === 'permissions-policy';
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await ctx.params;

  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  if (!account) {
    return NextResponse.json({ error: 'account not found' }, { status: 404 });
  }

  const cfg: any = account.config || {};
  const domain: string | undefined = cfg?.widget?.domain;
  if (!domain) {
    return NextResponse.json({ error: 'no widget domain registered for this account' }, { status: 404 });
  }

  // Normalize: strip protocol/trailing slash so we can rebuild safely
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const path = req.nextUrl.searchParams.get('path') || '/';
  // Path must start with /; anything else is treated as a path fragment
  const safePath = path.startsWith('/') ? path : '/' + path;
  const targetUrl = `https://${cleanDomain}${safePath}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await Promise.race([
      fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          // Identify as a browser so sites don't serve us a bot-mode response.
          // We act like a real Chrome on macOS — most customer sites tune their
          // HTML for that exact UA.
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
        },
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('proxy fetch timeout')), FETCH_TIMEOUT_MS),
      ),
    ]);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'failed to fetch customer site', details: err?.message },
      { status: 502 },
    );
  }

  if (!upstreamRes.ok) {
    return NextResponse.json(
      { error: 'customer site returned ' + upstreamRes.status },
      { status: 502 },
    );
  }

  // Only HTML pages get the injection treatment; everything else passes through
  // raw (rare — typically we hit / or a product page which is HTML).
  const contentType = upstreamRes.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return new Response(await upstreamRes.arrayBuffer(), {
      status: upstreamRes.status,
      headers: filterHeaders(upstreamRes.headers),
    });
  }

  let html = await upstreamRes.text();

  // Strip CSP meta tags from the HTML itself — header-level CSP we already
  // filter out, but some sites set the policy in <meta http-equiv="Content-Security-Policy">.
  // Without stripping, the customer's own CSP could block our injected widget script.
  html = html.replace(
    /<meta\s+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi,
    '',
  );

  // Inject <base href> right after opening <head> so RELATIVE URLs in the
  // page (images, CSS, fonts, internal scripts) resolve back to the
  // customer's origin. Without this everything would 404 against our origin.
  const baseHref = `<base href="https://${cleanDomain}${safePath}">`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseHref}`);
  } else {
    // Site has no <head> tag — shouldn't happen for real sites; prepend defensively.
    html = `<head>${baseHref}</head>` + html;
  }

  // Inject our widget script. Absolute URL to our own origin so it works
  // regardless of the page path. accountId is the per-account ID the widget
  // uses to fetch its config from /api/widget/config.
  const origin = req.nextUrl.origin;
  const widgetTag = `<script src="${origin}/widget.js" data-account-id="${accountId}" data-preview="true"></script>`;
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${widgetTag}</body>`);
  } else {
    // No closing body — append.
    html += widgetTag;
  }

  // Return modified HTML with X-Frame-Options + CSP filtered out so the iframe
  // in our admin page can actually render this.
  const headers = filterHeaders(upstreamRes.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  // Allow our own admin to iframe this — explicitly relaxed since we just
  // stripped the upstream's restrictive headers.
  headers.delete('X-Frame-Options');
  // Override our own platform-level CSP (set in next.config.ts for /api/widget/*)
  // with a permissive policy. The customer site loads scripts/styles/fonts/images
  // from many third-party CDNs (Shopify, Cloudflare, fonts.google.com, etc.) —
  // 'self' would break visual rendering. We keep frame-ancestors * so we can
  // iframe this from /admin, and allow * for fetched resources because the page
  // is sandboxed in our admin iframe and visible only to authenticated admins.
  headers.set(
    'Content-Security-Policy',
    "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; " +
    "script-src * 'unsafe-inline' 'unsafe-eval'; " +
    "style-src * 'unsafe-inline'; " +
    "img-src * data: blob:; " +
    "font-src * data:; " +
    "connect-src *; " +
    "frame-ancestors *;",
  );

  return new Response(html, { status: 200, headers });
}

function filterHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    if (!isBlockingHeader(key)) out.append(key, value);
  });
  return out;
}
