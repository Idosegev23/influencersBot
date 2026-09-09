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
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { demoAccessFromConfig } from '@/lib/demo/guard';
import { rewriteNavigation } from '@/lib/widget/preview-rewrite';
import { filterUpstreamHeaders } from '@/lib/widget/preview-headers';
import { resolveWidgetDomain } from '@/lib/widget/resolve-domain';

const FETCH_TIMEOUT_MS = 12000;

export async function GET(req: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await ctx.params;

  if (!accountId) {
    return framePage(req, { kind: 'incomplete' });
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from('accounts')
    .select('config, language')
    .eq('id', accountId)
    .single();
  if (!account) {
    return framePage(req, { kind: 'invalid' });
  }

  const cfg: any = account.config || {};
  // The stand-in pages used to be English on every account, including Hebrew
  // ones — a demo link a prospect opens should not switch language on them.
  const lang: 'he' | 'en' = (account as any).language === 'en' ? 'en' : 'he';

  // Expired demo — stop proxying the customer's site under our domain. This
  // matters more here than on the chat surfaces: the proxy strips the origin
  // site's X-Frame-Options and CSP to make framing work, so an expired demo
  // left running keeps re-serving somebody else's storefront from ours.
  const demoAccess = demoAccessFromConfig(cfg);
  if (demoAccess.state === 'locked') {
    // Deliberately no widget and no proxying here — an expired demo must stop
    // re-serving the customer's storefront from our origin. But it says so in
    // HTML: a 403 JSON body inside the frame just looks broken.
    return framePage(req, { kind: 'expired', lang });
  }

  // An account scanned from an Instagram handle alone never got a websiteUrl, so
  // finalize registered no domain and this route used to answer a raw 404 JSON
  // blob — inside the iframe of a demo link already sent to a prospect. Try to
  // recover the site from the Instagram bio before giving up.
  const domain = await resolveWidgetDomain(accountId, cfg);
  if (!domain) {
    // Nothing to proxy, but the widget itself is real and worth demonstrating.
    // Never answer a shared demo link with JSON.
    return framePage(req, { kind: 'no-site', lang, accountId });
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
    return framePage(req, {
      kind: 'unreachable', lang, accountId,
      domain: cleanDomain, reason: err?.message || 'network error',
    });
  }

  if (!upstreamRes.ok) {
    // The customer's own site refused us — most often a bot challenge, which is
    // exactly what buses.org does to every non-browser request including ours.
    //
    // Returning JSON here meant the demo link a salesperson had just sent showed
    // raw `{"error":"customer site returned 403"}`. The widget is the thing being
    // demonstrated, not the customer's homepage, so serve it on a plain backdrop
    // and say why the site itself is missing.
    return framePage(req, {
      kind: 'unreachable', lang, accountId,
      domain: cleanDomain, reason: String(upstreamRes.status),
    });
  }

  // Only HTML pages get the injection treatment; everything else passes through
  // raw (rare — typically we hit / or a product page which is HTML).
  const contentType = upstreamRes.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return new Response(await upstreamRes.arrayBuffer(), {
      status: upstreamRes.status,
      headers: filterUpstreamHeaders(upstreamRes.headers),
    });
  }

  const html = await upstreamRes.text();
  return renderProxiedHtml(html, {
    req, accountId, cleanDomain, safePath,
    upstreamHeaders: upstreamRes.headers,
  });
}

/**
 * Turn a customer page into the demo page: strip the site's own CSP, rebase its
 * relative assets, keep its links inside this proxy, and mount the real widget.
 *
 * Shared by the live fetch and by HTML recovered from a browser warm-up, so a
 * blocked site's demo behaves exactly like any other one.
 */
function renderProxiedHtml(
  rawHtml: string,
  opts: {
    req: NextRequest;
    accountId: string;
    cleanDomain: string;
    safePath: string;
    upstreamHeaders?: Headers;
  },
): Response {
  const { req, accountId, cleanDomain, safePath } = opts;
  let html = rawHtml;

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

  const origin = req.nextUrl?.origin ?? new URL(req.url).origin;

  // Point in-page links back at this proxy so the demo stays navigable without
  // escaping to the customer's real origin (which drops the widget, and on a
  // site with X-Frame-Options leaves the frame blank).
  html = rewriteNavigation(html, { origin, accountId, domain: cleanDomain });

  // Inject our widget script. Absolute URL to our own origin so it works
  // regardless of the page path. accountId is the per-account ID the widget
  // uses to fetch its config from /api/widget/config.
  const widgetTag = `<script src="${origin}/widget.js" data-account-id="${accountId}" data-preview="true"></script>`;
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${widgetTag}</body>`);
  } else {
    // No closing body — append.
    html += widgetTag;
  }

  const headers = opts.upstreamHeaders ? filterUpstreamHeaders(opts.upstreamHeaders) : new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  // Allow our own admin to iframe this — explicitly relaxed since we just
  // stripped the upstream's restrictive headers.
  headers.delete('X-Frame-Options');
  // Override our own platform-level CSP (set in next.config.ts for /api/widget/*)
  // with a permissive policy. The customer site loads scripts/styles/fonts/images
  // from many third-party CDNs (Shopify, Cloudflare, fonts.google.com, etc.) —
  // 'self' would break visual rendering.
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

function escapeHtml(v: string): string {
  return String(v).replace(/[<>&"]/g, (c) => (
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;'
  ));
}

type FrameKind = 'incomplete' | 'invalid' | 'expired' | 'no-site' | 'unreachable';

/**
 * Copy for every page this route can render, in both languages.
 *
 * These used to be English strings inline at each call site, which meant a
 * Hebrew brand's prospect opened a demo link and got an English error. The
 * language comes from `accounts.language`.
 */
const FRAME_COPY: Record<FrameKind, Record<'he' | 'en', { headline: string; detail: (d: string, r: string) => string }>> = {
  incomplete: {
    he: { headline: 'הקישור לתצוגה אינו שלם', detail: () => 'חסר בו החשבון שאותו הוא אמור להציג.' },
    en: { headline: 'This preview link is incomplete', detail: () => 'It is missing the account it should show.' },
  },
  invalid: {
    he: { headline: 'הקישור לדמו אינו תקף יותר', detail: () => 'החשבון שאליו הוא הצביע אינו קיים עוד.' },
    en: { headline: 'This demo link is no longer valid', detail: () => 'The account it pointed to does not exist any more.' },
  },
  expired: {
    he: { headline: 'תקופת ההתנסות הסתיימה', detail: () => 'בקשו מאיש הקשר שלכם ב-LDRS לפתוח את הדמו מחדש והקישור יעבוד שוב.' },
    en: { headline: 'This demo has ended', detail: () => 'Ask your contact at LDRS to reopen it and the link will work again.' },
  },
  'no-site': {
    he: { headline: 'העוזר פעיל — תצוגת האתר לא', detail: () => 'לא רשום אתר לחשבון הזה, ולכן אין על מה להציג את העוזר.' },
    en: { headline: 'The assistant is live — the site preview is not', detail: () => 'No website is registered for this account, so there is no site to show the assistant on.' },
  },
  unreachable: {
    he: {
      headline: 'העוזר פעיל — תצוגת האתר לא',
      detail: (d, r) => `<code>${d}</code> החזיר ${r} כשביקשנו אותו, ולכן אי אפשר להציג כאן את העמודים שלו.`,
    },
    en: {
      headline: 'The assistant is live — the site preview is not',
      detail: (d, r) => `<code>${d}</code> returned ${r} when we asked for it, so its pages can't be shown here.`,
    },
  },
};

/**
 * Every non-success answer this route can give, as a rendered page.
 *
 * This route's entire output is consumed inside an iframe that a prospect is
 * looking at, often from a link a salesperson sent them. It therefore never
 * returns JSON and never returns a 4xx: a raw `{"error":...}` body — which is
 * what a missing widget domain used to produce — reads as a broken product.
 * Status is always 200 so the frame renders what we wrote.
 *
 * Passing `accountId` puts the real, live widget on the page, so a failure to
 * show the customer's SITE still demonstrates the thing being sold. It is
 * omitted deliberately for an expired or invalid demo, where showing the
 * assistant would be showing something the viewer is no longer entitled to.
 */
function framePage(
  req: NextRequest,
  opts: {
    kind: FrameKind;
    lang?: 'he' | 'en';
    accountId?: string;
    domain?: string;
    reason?: string;
  },
): Response {
  // This is the function that exists so the demo link never shows an error, so
  // it must not itself throw. `nextUrl` is always present on a real NextRequest;
  // the fallback keeps a last-resort renderer from becoming a 500.
  let origin: string;
  try {
    origin = req.nextUrl?.origin ?? new URL(req.url).origin;
  } catch {
    origin = '';
  }

  const lang = opts.lang === 'en' ? 'en' : 'he';
  const copy = FRAME_COPY[opts.kind][lang];
  const detail = copy.detail(escapeHtml(opts.domain || ''), escapeHtml(opts.reason || ''));

  const widget = opts.accountId
    ? `<script src="${origin}/widget.js" data-account-id="${escapeHtml(opts.accountId)}" data-preview="true"></script>`
    : '';
  const closer = opts.accountId
    ? (lang === 'he'
        ? ' העוזר שלמטה הוא האמיתי של החשבון הזה — פתחו אותו ושאלו אותו כל דבר.'
        : ' The assistant below is the real one for this account: open it and ask it anything.')
    : '';

  const html = `<!doctype html>
<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(copy.headline)}</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
         background:
           radial-gradient(1200px 600px at 50% -10%, #ede9fe 0%, transparent 60%),
           linear-gradient(#fafafa, #f4f4f5); }
  .card { text-align:center; max-width:34rem; padding:2rem; color:#3f3f46; }
  .card h1 { font-size:1.05rem; font-weight:600; margin:0 0 .5rem; color:#18181b; }
  .card p { font-size:.85rem; line-height:1.6; margin:0; color:#71717a; }
  code { background:#e4e4e7; padding:.1rem .35rem; border-radius:.25rem; font-size:.8rem;
         direction:ltr; unicode-bidi:embed; display:inline-block; }
</style></head>
<body>
  <div class="card">
    <h1>${escapeHtml(copy.headline)}</h1>
    <p>${detail}${closer}</p>
  </div>
  ${widget}
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors *",
    },
  });
}
