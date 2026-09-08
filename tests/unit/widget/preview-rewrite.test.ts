import { describe, it, expect } from 'vitest';
import { rewriteNavigation } from '@/lib/widget/preview-rewrite';

const OPTS = {
  origin: 'https://bestie.ldrsgroup.com',
  accountId: 'acct-1',
  domain: 'bara.co.il',
};
const P = 'https://bestie.ldrsgroup.com/api/widget/preview/acct-1';

describe('rewriteNavigation', () => {
  // The incident: a prospect opens a shared /demo/<id> link and clicks anything.
  // <base href> resolves the link to the customer's real origin, the iframe
  // navigates off our proxy, and the widget we were demonstrating disappears.
  // Verified in a real browser against shkedia, bara and TERMINAL X — all three
  // escaped on the first click.
  it('routes a relative internal link back through the proxy', () => {
    const out = rewriteNavigation('<a href="/shop/tea">tea</a>', OPTS);
    expect(out).toContain(`href="${P}?path=%2Fshop%2Ftea"`);
  });

  it('routes an absolute same-host link back through the proxy', () => {
    const out = rewriteNavigation('<a href="https://bara.co.il/about">about</a>', OPTS);
    expect(out).toContain(`href="${P}?path=%2Fabout"`);
  });

  it('keeps the query string', () => {
    const out = rewriteNavigation('<a href="/search?q=mint&page=2">s</a>', OPTS);
    expect(out).toContain(`path=%2Fsearch%3Fq%3Dmint%26page%3D2`);
  });

  it('keeps a fragment outside the encoded path so the browser still jumps', () => {
    const out = rewriteNavigation('<a href="/policy#shipping">p</a>', OPTS);
    expect(out).toContain(`?path=%2Fpolicy#shipping`);
  });

  it('sends a link to another site to a new tab instead of killing the demo', () => {
    const out = rewriteNavigation('<a href="https://facebook.com/bara">fb</a>', OPTS);
    expect(out).toContain('href="https://facebook.com/bara"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('leaves in-page and non-navigating hrefs alone', () => {
    const html = '<a href="#top">t</a><a href="mailto:a@b.com">m</a><a href="tel:+972">c</a><a href="javascript:void(0)">j</a>';
    expect(rewriteNavigation(html, OPTS)).toBe(html);
  });

  it('does not touch stylesheet, image or script URLs', () => {
    const html = '<link rel="stylesheet" href="/style.css"><img src="/a.png"><script src="/app.js"></script>';
    expect(rewriteNavigation(html, OPTS)).toBe(html);
  });

  it('opens form submissions in a new tab so the demo survives a search box', () => {
    const out = rewriteNavigation('<form action="/search" method="get"><input name="q"></form>', OPTS);
    expect(out).toContain('target="_blank"');
  });

  describe('scoped domain (factory54.co.il/pages/lululemon)', () => {
    const scoped = { ...OPTS, domain: 'factory54.co.il/pages/lululemon' };

    it('makes the proxy path relative to the scope root', () => {
      // The proxy builds https://<domain><path>, so the path must NOT repeat the scope.
      const out = rewriteNavigation('<a href="/pages/lululemon/tops">tops</a>', scoped);
      expect(out).toContain(`?path=%2Ftops"`);
    });

    it('sends a link outside the scope to a new tab rather than breaking out of it', () => {
      const out = rewriteNavigation('<a href="/pages/nike">nike</a>', scoped);
      expect(out).toContain('target="_blank"');
      expect(out).not.toContain('?path=%2Fpages%2Fnike');
    });
  });

  it('leaves the rest of the document intact', () => {
    // Presence assertion beside the rewrite: a rewriter that ate the page would
    // otherwise satisfy every "does not contain" check above.
    const html = '<head><base href="https://bara.co.il/"></head><body><h1>שלום</h1>'
      + '<a href="/x">x</a><script src="https://bestie.ldrsgroup.com/widget.js" data-account-id="acct-1"></script></body>';
    const out = rewriteNavigation(html, OPTS);
    expect(out).toContain('<base href="https://bara.co.il/">');
    expect(out).toContain('<h1>שלום</h1>');
    expect(out).toContain('data-account-id="acct-1"');
    expect(out).toContain(`href="${P}?path=%2Fx"`);
  });
});
