#!/usr/bin/env node
/**
 * Scrape thedekel.co.il full product catalog.
 *
 * Stage 1: Render /products-company/ once and extract all product cards
 *          (slug, name, brand, base64 thumb).
 * Stage 2: For each product, render /product-verified/?slug=... and extract
 *          full data (description, ingredients, INCI, claims, usage, etc.).
 *
 * Output: scripts/.dekel-cache/products.jsonl  (one product per line)
 *
 * Usage:
 *   node scripts/scrape-dekel-catalog.mjs                # full run
 *   node scripts/scrape-dekel-catalog.mjs --limit 10     # smoke-test 10
 *   node scripts/scrape-dekel-catalog.mjs --resume       # skip already-fetched
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));
const CACHE_DIR = join(ROOT, 'scripts', '.dekel-cache');
mkdirSync(CACHE_DIR, { recursive: true });
const OUT_PATH = join(CACHE_DIR, 'products.jsonl');
const CATALOG_PATH = join(CACHE_DIR, 'catalog.json');

const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();
const RESUME = args.includes('--resume');
const CONCURRENCY = (() => {
  const i = args.indexOf('--concurrency');
  return i >= 0 ? parseInt(args[i + 1], 10) : 4;
})();
const FRESH_CATALOG = args.includes('--fresh-catalog');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchCatalog(browser) {
  if (!FRESH_CATALOG && existsSync(CATALOG_PATH)) {
    const cached = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
    console.log(`[catalog] using cache: ${cached.length} products`);
    return cached;
  }
  console.log('[catalog] rendering /products-company/ ...');
  const ctx = await browser.newContext({ userAgent: UA, locale: 'he-IL' });
  const page = await ctx.newPage();
  // Block heavy resources to speed up the catalog render
  await page.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'media' || t === 'font') return route.abort();
    return route.continue();
  });
  await page.goto('https://thedekel.co.il/products-company/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  // Wait until cards are present
  await page.waitForSelector('.product-card', { timeout: 60_000 });
  // Some products lazy-render — give the SPA a few seconds + scroll bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  const cards = await page.$$eval('.product-card', (els) =>
    els.map((el) => {
      const slug = el.getAttribute('data-slug');
      const link = el.querySelector('a.product-card-link')?.href || null;
      const name = el.querySelector('.primary-product-name')?.textContent?.trim() || null;
      const brand = el.querySelector('.company-name')?.textContent?.trim() || null;
      const img = el.querySelector('img.product-image-for-card');
      const imgSrc = img?.getAttribute('src') || null;
      const imgAlt = img?.getAttribute('alt')?.trim() || null;
      const hasPromo = !!el.querySelector('.promotion-badge-for-card');
      const verified = !!el.querySelector('.verification-sticker');
      return { slug, link, name, brand, imgSrc, imgAlt, hasPromo, verified };
    })
  );

  await page.close();
  await ctx.close();
  const dedup = [];
  const seen = new Set();
  for (const c of cards) {
    if (!c.slug || seen.has(c.slug)) continue;
    seen.add(c.slug);
    dedup.push(c);
  }
  writeFileSync(CATALOG_PATH, JSON.stringify(dedup, null, 2));
  console.log(`[catalog] saved ${dedup.length} unique products`);
  return dedup;
}

const DETAIL_EVAL = () => {
  const text = (s) => document.querySelector(s)?.innerText?.trim() || null;
  const allText = (s) =>
    [...document.querySelectorAll(s)].map((e) => e.innerText.trim()).filter(Boolean);

  // 1) Header / title block
  const productName = text('h1');
  // 2) Find the main product detail container
  const main = document.querySelector('main') || document.body;
  const fullText = main.innerText || '';
  // 3) Crop text to the product card region by stripping nav/footer noise
  // The page body contains a deterministic header/footer; we capture from h1 onwards
  let body = fullText;
  const idxH1 = body.indexOf(productName || '');
  if (idxH1 >= 0) body = body.slice(idxH1);

  // Brand: appears just before the product name
  let brand = null;
  const lines = fullText.split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === productName && i > 0) {
      // walk backwards to first non-empty pipe-separated brand line
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        if (lines[j] && /\|/.test(lines[j])) {
          brand = lines[j];
          break;
        }
      }
      break;
    }
  }

  // Category: short line right after the product-name line that precedes the promo/description.
  // We look at the body lines (post-h1) for the first short non-empty line.
  let category = null;
  const bodyLines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  // bodyLines[0] is productName itself when h1 was matched; skip it
  const startIdx = bodyLines[0] === productName ? 1 : 0;
  for (let k = startIdx; k < Math.min(startIdx + 6, bodyLines.length); k++) {
    const ln = bodyLines[k];
    if (!ln) continue;
    if (/^\d+%/.test(ln)) continue; // promo line
    if (/^לפרטים נוספים/.test(ln)) continue;
    if (/^(אייקוניקס|\w+) \|/.test(ln)) continue; // brand line
    if (ln.length < 30 && /^[֐-׿\s]+$/.test(ln)) {
      category = ln;
      break;
    }
  }

  // Description: everything from h1 onwards UP TO "רשימת רכיבים:" (the INCI block).
  // This is guaranteed to capture: name + category + promo + product story + key ingredients + usage + claims.
  // We then strip the very top (brand line + name line + promo lines) so the description reads cleanly.
  let description = null;
  const inciIdx = body.search(/רשימת רכיבים\s*:/);
  let raw = inciIdx >= 0 ? body.slice(0, inciIdx) : body.slice(0, 4000);
  // Drop the first lines that match brand/name/promo/coupon meta
  raw = raw
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      if (!t) return true;
      if (t === productName) return false;
      if (/^[A-Za-zא-ת\s]+ \| [A-Z]/.test(t) && t.length < 50) return false; // brand line
      if (/^\d+%\s*הנחה/.test(t)) return false;
      if (/^לפרטים נוספים/.test(t)) return false;
      if (/^קראי עוד$/.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  description = raw.slice(0, 4000);

  // Key ingredients (with explanations) — from the bullet list section
  const keyIngredientsBlock = body.match(/ברשימת הרכיבים נוכל לראות:?([\s\S]*?)(?=ייחודיות המוצר|אופן השימוש|רשימת רכיבים|מאושר בהיריון|לשימוש ב|קראי עוד)/);
  const keyIngredients = keyIngredientsBlock
    ? keyIngredientsBlock[1]
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 5 && !l.startsWith('##'))
    : [];

  // Usage instructions
  const usageMatch = body.match(/אופן השימוש:?\s*([\s\S]*?)(?=קראי עוד|רשימת רכיבים|לשימוש ב|מאושר בהיריון|ללא)/);
  const usage = usageMatch ? usageMatch[1].trim().split('\n')[0].slice(0, 800) : null;

  // Claims / tags — short Hebrew labels in the product card
  const tagPatterns = [
    'מאושר בהיריון / הנקה',
    'מאושר בהיריון',
    'מאושר בהנקה',
    'לשימוש בערב',
    'לשימוש בבוקר',
    'לשימוש בבוקר ובערב',
    'ללא שמנים אתריים',
    'ללא פרבנים',
    'ללא בישום',
    'ללא אלכוהול מייבש',
    'ללא אלכוהול',
    'נבדק לעור רגיש',
    'מיוצר בישראל',
    'לא מעלה את רגישות העור לשמש',
    'מעלה את רגישות העור לשמש',
    'ללא סולפטים',
    'ללא צבעי מאכל',
    'טבעוני',
    'אורגני',
    'נוטל אלרגיה',
    'נבדק דרמטולוגית',
  ];
  const claims = tagPatterns.filter((t) => body.includes(t));

  // Discount
  const promoMatch = body.match(/(\d{1,3})%\s*הנחה/);
  const promoPercent = promoMatch ? parseInt(promoMatch[1], 10) : null;

  // INCI list — all comma-separated chemicals after "רשימת רכיבים:"
  const inciMatch = body.match(/רשימת רכיבים:?\s*([\s\S]+?)(?=\n\n|מקרא דירוגים|רכיבי מפתח|דקל וריפייד|דקלרציה|דירוג|הצטרפי|פרטי ההטבה|קוד הקופון|$)/);
  const inci = inciMatch
    ? inciMatch[1]
        .split(/[,\n]/)
        .map((s) => s.replace(/[\s,;]+$/g, '').trim())
        .filter((s) => s.length > 0 && s.length < 80)
    : [];

  // Per-ingredient ratings (from the ingredient-item DOM elements)
  const ingredientItems = [...document.querySelectorAll('.ingredient-item')].map((el) => {
    const name = el.querySelector('.ingredient-name')?.innerText?.trim() || null;
    const num = el.querySelector('.score-number')?.innerText?.trim() || null;
    const den = el.querySelector('.score-denominator')?.innerText?.trim() || null;
    const note = el.querySelector('.ingredient-description, .ingredient-note')?.innerText?.trim() || null;
    return { name, score: num && den ? `${num}${den}` : num, note };
  });

  // Main product image: the largest non-icon img near the top of the page
  let imageUrl = null;
  const imgs = [...document.querySelectorAll('img')];
  for (const img of imgs) {
    const src = img.currentSrc || img.src || '';
    if (!src || src.startsWith('data:')) continue;
    if (/logo|sticker|userway|google|emoji|active_promotion|verified_sticker/.test(src)) continue;
    if (/\/wp-content\/uploads\//.test(src)) {
      imageUrl = src;
      break;
    }
  }

  return {
    productName,
    brand,
    category,
    description,
    keyIngredients,
    usage,
    claims,
    promoPercent,
    inci,
    ingredientItems,
    imageUrl,
  };
};

async function fetchDetail(ctx, slug) {
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const t = route.request().resourceType();
    // Keep stylesheets — some product pages need CSS-driven JS to render content
    if (t === 'media' || t === 'font') return route.abort();
    return route.continue();
  });
  try {
    const url = `https://thedekel.co.il/product-verified/?slug=${encodeURIComponent(slug)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    // Wait for the product details to render
    try {
      await page.waitForSelector('h1', { timeout: 30_000 });
      await page.waitForFunction(() => {
        const t = document.body.innerText || '';
        return t.includes('רשימת רכיבים') || t.includes('אופן השימוש');
      }, null, { timeout: 30_000 });
    } catch {}
    const data = await page.evaluate(DETAIL_EVAL);
    return { slug, url, ok: true, ...data };
  } catch (e) {
    return { slug, ok: false, error: String(e?.message || e) };
  } finally {
    await page.close();
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const catalog = await fetchCatalog(browser);
    let toFetch = catalog;
    if (LIMIT !== Infinity) toFetch = toFetch.slice(0, LIMIT);

    let done = new Set();
    if (RESUME && existsSync(OUT_PATH)) {
      for (const line of readFileSync(OUT_PATH, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (r.ok) done.add(r.slug);
        } catch {}
      }
      console.log(`[resume] ${done.size} already saved, skipping`);
      toFetch = toFetch.filter((c) => !done.has(c.slug));
    } else if (!RESUME) {
      // start fresh
      writeFileSync(OUT_PATH, '');
    }

    console.log(`[fetch] ${toFetch.length} products with concurrency ${CONCURRENCY}`);
    const ctx = await browser.newContext({ userAgent: UA, locale: 'he-IL' });

    let i = 0;
    let success = 0;
    let fail = 0;
    const startedAt = Date.now();
    async function worker(workerId) {
      while (true) {
        const idx = i++;
        if (idx >= toFetch.length) return;
        const c = toFetch[idx];
        const t0 = Date.now();
        const detail = await fetchDetail(ctx, c.slug);
        const merged = { ...c, ...detail };
        appendFileSync(OUT_PATH, JSON.stringify(merged) + '\n');
        if (detail.ok) success++;
        else fail++;
        if ((idx + 1) % 10 === 0 || idx + 1 === toFetch.length) {
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
          const rate = (idx + 1) / (Date.now() - startedAt) * 1000;
          const eta = ((toFetch.length - (idx + 1)) / rate).toFixed(0);
          console.log(
            `[${workerId}] ${idx + 1}/${toFetch.length} (${success} ok, ${fail} err) elapsed=${elapsed}s eta=${eta}s — ${c.slug} (${(Date.now() - t0) / 1000}s)`
          );
        }
      }
    }
    await Promise.all([...Array(CONCURRENCY)].map((_, w) => worker(w)));
    await ctx.close();
    console.log(`\n[done] success=${success} fail=${fail} total=${toFetch.length}`);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
