#!/usr/bin/env node
/**
 * Harvest product-detail URLs from category listing pages.
 *
 * Why this exists: many storefronts (headless Magento, some Shopify themes) publish ONLY
 * category pages in their sitemap. Product detail pages are reachable exclusively as links
 * inside the listing HTML, so the sitemap-driven pipeline crawl never sees a single product
 * and the catalog comes out empty. This script collects those links so they can be handed
 * to the pipeline as `seedUrls`.
 *
 * The product-link heuristic is deliberately site-agnostic: a product URL is a same-host
 * link that extends one of the listing paths by exactly one more segment, and whose last
 * segment contains a digit (SKU-ish). That matches /women/tops/tank-tops/r340280005 without
 * hardcoding anything about the site.
 *
 * Usage:
 *   node scripts/harvest-product-urls.mjs \
 *     --site https://www.terminalx.com \
 *     --paths /women,/men,/kids,/beauty \
 *     --per-path 25 \
 *     --out /tmp/seeds.json
 *
 * Options:
 *   --site        Origin of the storefront (required)
 *   --paths       Comma-separated listing paths to harvest (required)
 *   --per-path    Max product urls to keep per path (default 25)
 *   --out         Write the JSON array here (default: stdout only)
 *   --concurrency Parallel fetches (default 4)
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) return fallback;
  return process.argv[i + 1];
}

const SITE = arg('site');
const PATHS = (arg('paths') || '').split(',').map(s => s.trim()).filter(Boolean);
const PER_PATH = Number(arg('per-path', '25'));
const OUT = arg('out');
const CONCURRENCY = Number(arg('concurrency', '4'));

if (!SITE || PATHS.length === 0) {
  console.error('usage: --site <origin> --paths /a,/b [--per-path 25] [--out file.json]');
  process.exit(1);
}

const ORIGIN = new URL(SITE).origin;
const HOST = new URL(SITE).host;

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * A product link = same host, path starts with the listing path, has exactly one more
 * segment than the listing path, and that final segment contains a digit.
 * Query strings (?color=10) are dropped so colour variants collapse to one product.
 */
function productLinks(html, listingPath) {
  const baseSegs = listingPath.split('/').filter(Boolean);
  const found = new Set();

  for (const m of html.matchAll(/href="(\/[^"'\s]{3,200})"/g)) {
    let u;
    try {
      u = new URL(m[1], ORIGIN);
    } catch {
      continue;
    }
    if (u.host !== HOST) continue;

    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length !== baseSegs.length + 1) continue;
    if (!baseSegs.every((s, i) => segs[i] === s)) continue;

    const leaf = segs[segs.length - 1];
    if (!/\d/.test(leaf)) continue; // category slugs are word-only; SKUs carry digits
    if (/\.(css|js|png|jpe?g|webp|svg|ico)$/i.test(leaf)) continue;

    found.add(`${u.origin}${u.pathname}`);
  }
  return [...found];
}

// Catch-all buckets ("all", "view-all", "shop-all").
//
// Two competing facts, learned the hard way on terminalx.com:
//  - Named subcategories give a richer breadcrumb trail, the best category signal we have.
//  - But on SPA storefronts many named categories render their product grid client-side and
//    serve zero product links, while the catch-all bucket happens to server-render its grid.
// So: prefer named subcategories, but ALWAYS keep the catch-alls in the candidate list —
// ranking them last is fine, dropping them is what produced an empty harvest.
const GENERIC_BUCKET = /^(all|view-all|shop-all|see-all|everything|new|newin|just-?landed)$/i;
const MAX_NAMED_CHILDREN = 10;

/**
 * Listing pages often paginate their own subcategories. Collect the immediate child
 * category paths too, so a top-level path like /women reaches /women/tops/tank-tops
 * where the actual products live.
 *
 * Returned deepest-and-most-specific first: a named subcategory beats a catch-all bucket,
 * and a deeper path beats a shallower one, because both correlate with a richer breadcrumb.
 */
function childCategories(html, listingPath) {
  const baseSegs = listingPath.split('/').filter(Boolean);
  const found = new Set();
  for (const m of html.matchAll(/href="(\/[^"'\s]{3,200})"/g)) {
    let u;
    try {
      u = new URL(m[1], ORIGIN);
    } catch {
      continue;
    }
    if (u.host !== HOST) continue;
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length <= baseSegs.length || segs.length > baseSegs.length + 2) continue;
    if (!baseSegs.every((s, i) => segs[i] === s)) continue;
    if (/\d/.test(segs[segs.length - 1])) continue; // that's a product, not a category
    found.add(`${u.origin}${u.pathname}`);
  }

  const leafOf = url => {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    return { segs, leaf: segs[segs.length - 1] };
  };
  const all = [...found];
  const generic = all.filter(u => GENERIC_BUCKET.test(leafOf(u).leaf));
  const named = all
    .filter(u => !GENERIC_BUCKET.test(leafOf(u).leaf))
    // Deeper named paths sit closer to real products and carry a longer breadcrumb.
    .sort((a, b) => leafOf(b).segs.length - leafOf(a).segs.length)
    .slice(0, MAX_NAMED_CHILDREN);

  return [...named, ...generic];
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        out.push(await fn(items[i]));
      } catch (err) {
        console.error(`  ! ${items[i]}: ${err.message}`);
      }
    }
  });
  await Promise.all(workers);
  return out.flat();
}

async function harvestPath(listingPath) {
  const listingUrl = `${ORIGIN}${listingPath}`;
  console.error(`\n== ${listingPath}`);

  let html;
  try {
    html = await fetchHtml(listingUrl);
  } catch (err) {
    console.error(`  ! listing fetch failed: ${err.message}`);
    return { path: listingPath, urls: [] };
  }

  const direct = productLinks(html, listingPath);
  console.error(`  ${direct.length} product links on the listing page itself`);

  const collected = new Set(direct);

  // Not enough on the top page — walk into child categories until the quota is met.
  if (collected.size < PER_PATH) {
    const children = childCategories(html, listingPath);
    console.error(`  descending into ${children.length} child categories`);

    // Keep each child's haul separate, then round-robin. Draining one subcategory before
    // touching the next would give 25 near-identical items (25 t-shirts) instead of a
    // catalog that actually looks like the department it came from.
    const perChild = [];
    await mapLimit(children, CONCURRENCY, async childUrl => {
      const childHtml = await fetchHtml(childUrl);
      perChild.push(productLinks(childHtml, new URL(childUrl).pathname));
      return [];
    });

    const depth = Math.max(0, ...perChild.map(list => list.length));
    outer: for (let i = 0; i < depth; i++) {
      for (const list of perChild) {
        if (collected.size >= PER_PATH) break outer;
        if (list[i]) collected.add(list[i]);
      }
    }
  }

  const urls = [...collected].slice(0, PER_PATH);
  console.error(`  → kept ${urls.length}`);
  return { path: listingPath, urls };
}

const results = [];
for (const p of PATHS) results.push(await harvestPath(p));

const all = [...new Set(results.flatMap(r => r.urls))];

console.error(`\n${'='.repeat(50)}`);
for (const r of results) console.error(`${String(r.urls.length).padStart(4)}  ${r.path}`);
console.error(`${String(all.length).padStart(4)}  TOTAL (deduped)`);

if (OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT, JSON.stringify(all, null, 2));
  console.error(`\nwrote ${OUT}`);
} else {
  console.log(JSON.stringify(all, null, 2));
}
