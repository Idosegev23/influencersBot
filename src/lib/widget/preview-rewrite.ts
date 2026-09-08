/**
 * Keep a proxied demo page navigable WITHOUT letting it escape the proxy.
 *
 * The widget preview injects `<base href="https://customer.com/">` so the page's
 * relative assets resolve back to the customer's origin. The side effect is that
 * every in-page link resolves there too: one click and the iframe leaves our
 * origin, the widget we were demonstrating vanishes, and a site with
 * X-Frame-Options goes blank. Verified in a real browser against shkedia, bara
 * and TERMINAL X — all three escaped on the first click.
 *
 * So links are rewritten to re-enter the proxy at `?path=`, which a browser
 * spike confirmed renders the next page correctly (real title, real content,
 * widget still mounted) on server-rendered sites.
 *
 * Assets are deliberately NOT rewritten: images and CSS load fine cross-origin
 * via <base href>, and routing them through us would mean proxying the whole
 * asset graph.
 */

export interface RewriteOptions {
  /** Our own origin, e.g. https://bestie.ldrsgroup.com */
  origin: string;
  accountId: string;
  /** `config.widget.domain` — a host, optionally scoped with a path. */
  domain: string;
}

/** Schemes that navigate nowhere, plus in-page fragments. */
const NON_NAVIGATING = /^(#|mailto:|tel:|sms:|javascript:|data:|blob:)/i;

/** Split `factory54.co.il/pages/lululemon` into host and scope path. */
function splitDomain(domain: string): { host: string; scope: string } {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const slash = clean.indexOf('/');
  if (slash === -1) return { host: clean, scope: '' };
  return { host: clean.slice(0, slash), scope: clean.slice(slash).replace(/\/$/, '') };
}

/** Add an attribute to a tag's attribute string only when it isn't already set. */
function withAttr(attrs: string, name: string, value: string): string {
  const has = new RegExp(`\\b${name}\\s*=`, 'i').test(attrs);
  return has ? attrs : `${attrs} ${name}="${value}"`;
}

function openInNewTab(attrs: string): string {
  return withAttr(withAttr(attrs, 'target', '_blank'), 'rel', 'noopener noreferrer');
}

export function rewriteNavigation(html: string, opts: RewriteOptions): string {
  const { host, scope } = splitDomain(opts.domain);
  const proxyBase = `${opts.origin}/api/widget/preview/${opts.accountId}`;
  // Any absolute URL in the document resolves against the customer's origin,
  // exactly as the browser would resolve it under our injected <base href>.
  const documentBase = `https://${host}${scope}/`;

  // Anchors: internal -> back through the proxy, external -> a new tab.
  html = html.replace(
    /<a\b([^>]*?)\bhref=("|')(.*?)\2/gi,
    (match, attrs: string, quote: string, href: string) => {
      const raw = href.trim();
      if (!raw || NON_NAVIGATING.test(raw)) return match;

      let url: URL;
      try {
        url = new URL(raw, documentBase);
      } catch {
        return match;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return match;

      // A different site: let it open outside rather than replacing the demo.
      if (url.host.toLowerCase() !== host.toLowerCase()) {
        return `<a${openInNewTab(attrs)} href=${quote}${href}${quote}`;
      }

      // A scoped demo (factory54.co.il/pages/lululemon) previews one section of
      // a larger retailer. The proxy builds `https://<domain><path>`, so the
      // path we hand it must be relative to the scope root — and a link outside
      // that section is not part of this demo at all.
      let path = url.pathname;
      if (scope) {
        if (path !== scope && !path.startsWith(scope + '/')) {
          return `<a${openInNewTab(attrs)} href=${quote}${href}${quote}`;
        }
        path = path.slice(scope.length) || '/';
      }

      const encoded = encodeURIComponent(path + url.search);
      // The fragment stays OUTSIDE the encoded value so the browser still jumps
      // to it after the proxied page loads.
      const proxied = `${proxyBase}?path=${encoded}${url.hash}`;
      return `<a${attrs} href=${quote}${proxied}${quote}`;
    },
  );

  // Forms (site search, newsletter) would submit straight to the customer's
  // origin and replace the demo. Send them to a new tab instead — the demo
  // survives, and the prospect still sees a real result.
  html = html.replace(
    /<form\b([^>]*)>/gi,
    (match, attrs: string) => `<form${openInNewTab(attrs)}>`,
  );

  return html;
}
