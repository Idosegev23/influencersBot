import { describe, it, expect, vi } from 'vitest';
import { toApifyPage, registrableDomain } from '@/lib/pipeline/apify-crawl';
import { persistPageHtml } from '@/lib/pipeline/crawl';

describe('toApifyPage', () => {
  // Shaped from a live website-content-crawler item for buses.org/membership/join/
  const item = {
    url: 'https://www.buses.org/membership/join/',
    html: '<html><head><title>Join</title></head><body><main>Membership tiers</main></body></html>',
    metadata: {
      canonicalUrl: 'https://www.buses.org/membership/join/',
      title: 'Join',
      description: 'As a nonprofit membership organization, we help member companies grow',
      languageCode: 'en',
      openGraph: [
        { property: 'og:locale', content: 'en_US' },
        { property: 'og:image', content: 'https://www.buses.org/og.jpg' },
      ],
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebPage' }],
    },
  };

  it('carries across the metadata the actor strips out of the HTML', () => {
    const page = toApifyPage(item)!;
    expect(page.url).toBe('https://www.buses.org/membership/join/');
    expect(page.title).toBe('Join');
    expect(page.description).toContain('nonprofit membership organization');
    expect(page.ogImage).toBe('https://www.buses.org/og.jpg');
    expect(page.structuredData).toHaveLength(1);
  });

  it('wraps a single jsonLd object into an array', () => {
    const page = toApifyPage({ ...item, metadata: { ...item.metadata, jsonLd: { '@type': 'Organization' } } })!;
    expect(Array.isArray(page.structuredData)).toBe(true);
    expect(page.structuredData).toHaveLength(1);
  });

  it('rejects an item with no html — an empty page must not be persisted as a real one', () => {
    expect(toApifyPage({ url: 'https://x.test/', html: '' })).toBeNull();
    expect(toApifyPage({ html: '<p>orphan</p>' })).toBeNull();
    expect(toApifyPage(null)).toBeNull();
  });

  it('survives an item with no metadata at all', () => {
    const page = toApifyPage({ url: 'https://x.test/', html: '<html><body>hi</body></html>' })!;
    expect(page.html).toContain('hi');
    expect(page.title).toBeUndefined();
    expect(page.structuredData).toBeUndefined();
  });
});

describe('persistPageHtml is one extraction path for both transports', () => {
  /** Minimal supabase double capturing the row that would be written. */
  function fakeSupabase() {
    const rows: any[] = [];
    return {
      rows,
      from: () => ({
        upsert: (row: any) => {
          rows.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    } as any;
  }

  const FETCH_HTML = `<html><head>
      <title>Join</title>
      <meta name="description" content="Become a member">
      <meta property="og:image" content="https://www.buses.org/og.jpg">
      <script type="application/ld+json">{"@type":"WebPage"}</script>
    </head><body><main>Membership tiers and dues for operators.</main>
    <a href="/membership/renew/">Renew</a><a href="https://elsewhere.test/x">Off-site</a>
    </body></html>`;

  // What Apify actually returns: the same page with its <head> rewritten away —
  // no title, no meta description, no og tags, no ld+json. That is the whole
  // reason fallbacks exist, so the fixture must not smuggle a <title> back in or
  // the parity assertions below pass without ever exercising them.
  const APIFY_HTML = `<html><head></head><body><main>Membership tiers and dues for operators.</main>
    <a href="/membership/renew/">Renew</a><a href="https://elsewhere.test/x">Off-site</a>
    </body></html>`;

  const URL_ = 'https://www.buses.org/membership/join/';

  it('produces the same title, description, structured data and og image either way', async () => {
    const a = fakeSupabase();
    const b = fakeSupabase();

    const viaFetch = await persistPageHtml(URL_, FETCH_HTML, 'acct-1', a);
    const viaApify = await persistPageHtml(URL_, APIFY_HTML, 'acct-1', b, {
      title: 'Join',
      description: 'Become a member',
      ogImage: 'https://www.buses.org/og.jpg',
      structuredData: [{ '@type': 'WebPage' }],
    });

    expect(viaFetch.saved).toBe(true);
    expect(viaApify.saved).toBe(true);

    const rowA = a.rows[0];
    const rowB = b.rows[0];

    // Presence before parity: an all-empty row would satisfy "they match".
    expect(rowA.page_title).toBe('Join');
    expect(rowA.page_content).toContain('Membership tiers');
    expect(rowA.structured_data).toHaveLength(1);

    expect(rowB.page_title).toBe(rowA.page_title);
    expect(rowB.page_description).toBe(rowA.page_description);
    expect(rowB.structured_data).toEqual(rowA.structured_data);
    expect(rowB.image_urls).toEqual(rowA.image_urls);
    expect(rowB.meta_tags.pageType).toBe(rowA.meta_tags.pageType);
  });

  it('finds same-host links and drops off-site ones, on both paths', async () => {
    const viaFetch = await persistPageHtml(URL_, FETCH_HTML, 'acct-1', fakeSupabase());
    const viaApify = await persistPageHtml(URL_, APIFY_HTML, 'acct-1', fakeSupabase(), { title: 'Join' });

    for (const res of [viaFetch, viaApify]) {
      expect(res.discoveredLinks).toContain('https://www.buses.org/membership/renew/');
      expect(res.discoveredLinks.some((l) => l.includes('elsewhere.test'))).toBe(false);
    }
  });

  it('reports saved:false rather than throwing when the row cannot be written', async () => {
    const failing = {
      from: () => ({ upsert: () => Promise.resolve({ error: { message: 'nope' } }) }),
    } as any;
    const res = await persistPageHtml(URL_, FETCH_HTML, 'acct-1', failing);
    expect(res.saved).toBe(false);
  });
});

describe('content extraction takes the richest region, not the first', () => {
  function fakeSupabase() {
    const rows: any[] = [];
    return {
      rows,
      from: () => ({ upsert: (row: any) => { rows.push(row); return Promise.resolve({ error: null }); } }),
    } as any;
  }

  // The shape of buses.org/membership/join/: an <article> teaser that clears any
  // reasonable length threshold, and a <main> further down holding what the
  // customer actually asked for. The old loop stopped at <article> and ABA were
  // told their own dues were "not available".
  const PAGE = `<html><head><title>Join</title></head><body>
    <article>${'Membership is open to private companies that own motorcoaches. '.repeat(6)}</article>
    <main>${'Full membership detail. '.repeat(20)} Annual dues range from $1,060 to $21,050 depending on fleet size.</main>
  </body></html>`;

  it('keeps the dues that live outside the first matching selector', async () => {
    const db = fakeSupabase();
    const res = await persistPageHtml('https://www.buses.org/membership/join/', PAGE, 'acct-1', db);

    expect(res.saved).toBe(true);
    const content = db.rows[0].page_content as string;

    // Presence first: the teaser is still captured...
    expect(content).toContain('open to private companies');
    // ...and so is the part that was being thrown away.
    expect(content).toContain('$1,060');
    expect(content).toContain('$21,050');
  });

  it('prefers the body when no content selector covers the page', async () => {
    const db = fakeSupabase();
    const bare = '<html><body><div class="wrapper">Dues start at $500 per year for allied members.</div></body></html>';
    await persistPageHtml('https://www.buses.org/x/', bare, 'acct-1', db);
    expect(db.rows[0].page_content).toContain('$500');
  });
});

describe('registrableDomain — what the subdomain glob is allowed to cover', () => {
  it('generalises a hostname to its domain, so sibling subdomains are in scope', () => {
    // The whole point: ABA's Marketplace lives on a different host of the same site.
    expect(registrableDomain('www.buses.org')).toBe('buses.org');
    expect(registrableDomain('marketplace.buses.org')).toBe('buses.org');
    expect(registrableDomain('buses.org')).toBe('buses.org');
  });

  it('does NOT collapse an Israeli customer to co.il', () => {
    // A `https://*.co.il/**` glob would send the crawler across the Israeli
    // internet on one customer's budget. Every account we have is .co.il or .com,
    // so this is the case that must not regress.
    expect(registrableDomain('www.argania.co.il')).toBe('argania.co.il');
    expect(registrableDomain('shop.studiopasha.co.il')).toBe('studiopasha.co.il');
    expect(registrableDomain('www.gov.uk')).toBe('www.gov.uk');
  });

  it('refuses to generalise when there is nothing safe to generalise to', () => {
    expect(registrableDomain('co.il')).toBeNull();   // the suffix itself
    expect(registrableDomain('localhost')).toBeNull();
    expect(registrableDomain('93.184.216.34')).toBeNull();
  });
});
