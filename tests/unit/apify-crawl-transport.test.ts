import { describe, it, expect, vi } from 'vitest';
import { toApifyPage } from '@/lib/pipeline/apify-crawl';
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
