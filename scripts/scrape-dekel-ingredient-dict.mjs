#!/usr/bin/env node
/**
 * Build Dekel's master ingredient dictionary.
 *
 * Each product detail page on thedekel.co.il renders ingredients as
 *   <span class="ingredient-name" data-ingredient-name="Niacinamide"
 *         data-function="מבהיר, מחולל תהליכים, רכיב טבעי בעור, מרגיע"
 *         data-rating="מעולה">
 *
 * Those `data-function` + `data-rating` strings are the hover-tooltip on her
 * site. We aggregate them across the whole catalog into a single dictionary
 * keyed by ingredient name and persist on accounts.config.ingredient_dictionary.
 *
 * Usage:
 *   node --env-file=.env scripts/scrape-dekel-ingredient-dict.mjs
 *   node --env-file=.env scripts/scrape-dekel-ingredient-dict.mjs --limit 20
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));
const CACHE_DIR = join(ROOT, 'scripts', '.dekel-cache');
mkdirSync(CACHE_DIR, { recursive: true });
const CATALOG_PATH = join(CACHE_DIR, 'catalog.json');
const DICT_PATH = join(CACHE_DIR, 'ingredient-dictionary.json');

const ACCOUNT_ID = 'e5a5076a-faaf-4e67-8bdd-61c15153fb20';
const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();
const CONCURRENCY = (() => {
  const i = args.indexOf('--concurrency');
  return i >= 0 ? parseInt(args[i + 1], 10) : 5;
})();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

if (!existsSync(CATALOG_PATH)) {
  console.error(`Missing catalog cache at ${CATALOG_PATH}. Run scrape-dekel-catalog.mjs first.`);
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
const slugs = catalog.map((c) => c.slug).filter(Boolean);
const todo = LIMIT === Infinity ? slugs : slugs.slice(0, LIMIT);
console.log(`[dict] processing ${todo.length} product pages…`);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

const dictionary = new Map(); // name -> { function, rating, count }

async function fetchOne(ctx, slug) {
  const url = `https://thedekel.co.il/product-verified/?slug=${encodeURIComponent(slug)}`;
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'media' || t === 'font') return route.abort();
    return route.continue();
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    try {
      await page.waitForSelector('.ingredient-name[data-ingredient-name]', { timeout: 30_000 });
    } catch {}
    const items = await page.$$eval('.ingredient-name[data-ingredient-name]', (els) =>
      els.map((el) => ({
        name: el.getAttribute('data-ingredient-name')?.trim() || '',
        function: el.getAttribute('data-function')?.trim() || '',
        rating: el.getAttribute('data-rating')?.trim() || '',
      }))
    );
    return { slug, ok: true, items };
  } catch (e) {
    return { slug, ok: false, error: String(e?.message || e) };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: UA, locale: 'he-IL' });

let done = 0;
let i = 0;
async function worker(id) {
  while (true) {
    const idx = i++;
    if (idx >= todo.length) return;
    const slug = todo[idx];
    const r = await fetchOne(ctx, slug);
    done++;
    if (r.ok) {
      for (const it of r.items) {
        if (!it.name) continue;
        const cur = dictionary.get(it.name) || { name: it.name, function: '', rating: '', count: 0 };
        cur.count += 1;
        // Prefer the longest (most descriptive) function note seen for this name
        if (it.function && it.function.length > cur.function.length) cur.function = it.function;
        // Rating: keep the first non-empty value (they should be consistent across products)
        if (!cur.rating && it.rating) cur.rating = it.rating;
        dictionary.set(it.name, cur);
      }
    }
    if (done % 20 === 0 || done === todo.length) {
      console.log(`[dict] ${done}/${todo.length} (worker ${id} just finished ${slug}) — ${dictionary.size} ingredients seen`);
    }
  }
}

await Promise.all([...Array(CONCURRENCY)].map((_, w) => worker(w)));

await ctx.close();
await browser.close();

const arr = [...dictionary.values()].sort((a, b) => b.count - a.count);
writeFileSync(DICT_PATH, JSON.stringify(arr, null, 2));
console.log(`[dict] saved ${arr.length} unique ingredients to ${DICT_PATH}`);
console.log('[dict] top 5:');
for (const x of arr.slice(0, 5)) {
  console.log(`  ${x.count}× ${x.name} — function: ${x.function?.slice(0, 80) || '(none)'} | rating: ${x.rating || '(none)'}`);
}

// Persist to accounts.config.ingredient_dictionary
const dictObj = Object.fromEntries(
  arr.map((x) => [x.name, { function: x.function || null, rating: x.rating || null, count: x.count }])
);

const { data: account } = await supabase
  .from('accounts')
  .select('config')
  .eq('id', ACCOUNT_ID)
  .single();
const newConfig = { ...(account?.config || {}), ingredient_dictionary: dictObj };
const { error } = await supabase
  .from('accounts')
  .update({ config: newConfig })
  .eq('id', ACCOUNT_ID);
if (error) {
  console.error('[dict] supabase update error:', error.message);
  process.exit(1);
}
console.log(`[dict] persisted to accounts.config.ingredient_dictionary (${Object.keys(dictObj).length} entries)`);
