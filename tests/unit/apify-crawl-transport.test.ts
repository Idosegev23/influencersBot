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

describe('adjacent elements do not fuse into one word', () => {
  function fakeSupabase() {
    const rows: any[] = [];
    return {
      rows,
      from: () => ({ upsert: (row: any) => { rows.push(row); return Promise.resolve({ error: null }); } }),
    } as any;
  }

  // The shape of an events card on buses.org: the date and the title are
  // siblings with no text between them. Cheerio's .text() joins them with
  // nothing, producing "Aug 26BISC-South in New Orleans" — which the assistant
  // then read as one string and reported the wrong day for.
  const CARDS = `<html><body><main>
    <div class="card"><span class="date">Aug 26</span><h3>BISC-South in New Orleans</h3>
      <p>Co-located with the Alabama Motorcoach Association.</p></div>
    <div class="card"><span class="date">Aug 31</span><h3>WIB Webinar Wednesday</h3>
      <p>Why should I care about political advocacy?</p></div>
  </main></body></html>`;

  it('separates a date from the heading that follows it', async () => {
    const db = fakeSupabase();
    await persistPageHtml('https://www.buses.org/events', CARDS, 'acct-1', db);
    const content = db.rows[0].page_content as string;

    // Presence first — the content must still all be there...
    expect(content).toContain('BISC-South in New Orleans');
    expect(content).toContain('Aug 26');
    // ...and the date must not have been glued onto the title.
    expect(content).not.toMatch(/Aug 26BISC/);
    expect(content).toMatch(/Aug 26\s+BISC-South/);
  });

  it('keeps each card date with its own title', async () => {
    const db = fakeSupabase();
    await persistPageHtml('https://www.buses.org/events', CARDS, 'acct-1', db);
    const flat = (db.rows[0].page_content as string).replace(/\s+/g, ' ');

    expect(flat).toMatch(/Aug 26 BISC-South in New Orleans/);
    expect(flat).toMatch(/Aug 31 WIB Webinar Wednesday/);
  });
});

describe('a content header is not site chrome', () => {
  function fakeSupabase() {
    const rows: any[] = [];
    return {
      rows,
      from: () => ({ upsert: (row: any) => { rows.push(row); return Promise.resolve({ error: null }); } }),
    } as any;
  }

  // The shape of every event page on buses.org: the site banner is a <header>
  // outside the content root, and the event's own facts are a <header> inside
  // <main><article>. Removing both left six of fifteen stored event pages with
  // no date on them.
  const EVENT = `<html><body>
    <header class="site-banner"><nav><a href="/">Home</a><a href="/events">Events</a></nav></header>
    <main><article><div><div><header class="article__header">
      <span>In-Person</span><h1>BISC-South in New Orleans</h1>
      <ul><li>Varies</li><li>Aug 31, 2026</li><li>8:00 am EDT</li><li>New Orleans, LA</li></ul>
    </header>
    <p>${'Co-located with the Alabama Motorcoach Association. '.repeat(4)}</p></div></div></article></main>
  </body></html>`;

  it('keeps the date, time and place the event page exists to state', async () => {
    const db = fakeSupabase();
    await persistPageHtml('https://www.buses.org/events/bisc-south/', EVENT, 'acct-1', db);
    const content = String(db.rows[0].page_content).replace(/\s+/g, ' ');

    expect(content).toContain('BISC-South in New Orleans');
    expect(content).toContain('Aug 31, 2026');
    expect(content).toContain('8:00 am EDT');
    expect(content).toContain('New Orleans, LA');
  });

  it('still drops the site banner and its navigation', async () => {
    const db = fakeSupabase();
    await persistPageHtml('https://www.buses.org/events/bisc-south/', EVENT, 'acct-1', db);
    const content = String(db.rows[0].page_content);

    // Without a presence assertion this passes on an empty page, so the test
    // above is its pair: chrome gone, content kept.
    expect(content).not.toContain('Home');
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
