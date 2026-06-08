#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Biopeptix product images.
 *
 * The cheerio deep-scrape never captured biopeptix.com product cards (custom
 * IIS/Vue storefront — no /products/<slug> pages, image_urls empty). But the
 * /he/products listing page renders every product card statically:
 *   <a href="/he/portfolio-item/<slug>" class="produt_item">
 *     <div class="image"><img src="/uploads/images/<file>" alt="<English name>"/></div>
 *     <div class="content"><h2><English name></h2><p><Hebrew tagline></p></div>
 *   </a>
 *
 * This script scrapes that listing, fuzzy-matches each card to widget_products
 * (English `name` aligns ~1:1), downloads the image, uploads it to the Supabase
 * Storage `products` bucket (direct biopeptix.com URLs are CSP-blocked on the
 * chat surface), and writes image_url + product_url back.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/scrape-product-images-biopeptix.ts <account_id> [--listing <url>]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'products';
const SITE_ORIGIN = 'https://biopeptix.com';

const accountId = process.argv[2];
const listingArgIdx = process.argv.indexOf('--listing');
const LISTING_URL = listingArgIdx >= 0 ? process.argv[listingArgIdx + 1] : `${SITE_ORIGIN}/he/products`;

if (!accountId || !/^[0-9a-f]{8}-/.test(accountId)) {
  console.error('Usage: scrape-product-images-biopeptix.ts <account_id> [--listing <url>]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ─── Matching helpers (same approach as persist-product-images.ts) ───
function normalize(s: string): string {
  return s
    .replace(/[״"'`׳״()\[\]{},.;:!?\-_/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function jaccard(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter((t) => t.length >= 2));
  const tb = new Set(normalize(b).split(' ').filter((t) => t.length >= 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function pickExt(contentType: string | null, urlExt: string | null): string {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  if (urlExt && ['png', 'webp', 'gif', 'jpg', 'jpeg'].includes(urlExt)) return urlExt === 'jpeg' ? 'jpg' : urlExt;
  return 'jpg';
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

interface Card {
  name: string;
  url: string;
  image: string; // absolute, URL-encoded
}

async function scrapeCards(): Promise<Card[]> {
  const res = await fetch(LISTING_URL, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`listing fetch failed: ${res.status}`);
  const html = await res.text();

  const cards: Card[] = [];
  const re = /<a\b([^>]*)class="produt_item"([^>]*)>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] + m[2];
    const body = m[3];
    const href = /href="([^"]+)"/.exec(attrs)?.[1] || '';
    const img = /\/uploads\/images\/[^"')]+/.exec(body)?.[0] || '';
    const alt = /alt="([^"]*)"/.exec(body)?.[1] || '';
    const h2 = /<h2>([\s\S]*?)<\/h2>/.exec(body)?.[1] || '';
    const name = (alt || h2).replace(/\s+/g, ' ').trim();
    if (!name || !img) continue;
    cards.push({
      name,
      url: href ? new URL(href, SITE_ORIGIN).toString() : LISTING_URL,
      // new URL() already percent-encodes spaces in filenames
      // ("/uploads/images/AHA fruits7.jpg" → %20). Do NOT encodeURI on top —
      // that re-encodes the % and yields %2520 → 404.
      image: new URL(img, SITE_ORIGIN).toString(),
    });
  }
  return cards;
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.error(`   ⚠️ download ${res.status} for ${url}`);
      return null;
    }
    const ct = res.headers.get('content-type') || 'image/jpeg';
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType: ct };
  } catch (e: any) {
    console.error(`   ⚠️ download failed: ${e?.message || e}`);
    return null;
  }
}

async function main() {
  console.log(`🖼️  Biopeptix product images — ${accountId}\n   listing: ${LISTING_URL}\n`);

  const cards = await scrapeCards();
  console.log(`📄 Parsed ${cards.length} product cards from listing\n`);
  if (!cards.length) {
    console.error('No cards parsed — listing structure may have changed.');
    process.exit(1);
  }

  const { data: products, error } = await supabase
    .from('widget_products')
    .select('id, name, name_he')
    .eq('account_id', accountId);
  if (error) {
    console.error(`Failed to load products: ${error.message}`);
    process.exit(1);
  }
  console.log(`📦 ${products?.length || 0} widget products\n`);

  // Cache downloads per card image so duplicate products reuse one upload
  const cardUpload = new Map<string, string>(); // card.image -> publicUrl

  let matched = 0;
  let saved = 0;
  const unmatched: string[] = [];

  for (const product of products as Array<{ id: string; name: string; name_he: string }>) {
    const label = product.name || product.name_he;

    let best: Card | null = null;
    let bestScore = 0;
    for (const card of cards) {
      const score = Math.max(jaccard(product.name || '', card.name), jaccard(product.name_he || '', card.name));
      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }

    if (!best || bestScore < 0.5) {
      console.log(`❌ no match: "${label}" (best ${bestScore.toFixed(2)}${best ? ` → "${best.name}"` : ''})`);
      unmatched.push(label);
      continue;
    }

    matched++;
    console.log(`✓ "${label}" → "${best.name}" (${bestScore.toFixed(2)})`);

    let publicUrl = cardUpload.get(best.image);
    if (!publicUrl) {
      const dl = await downloadImage(best.image);
      if (!dl) continue;
      const urlExt = best.image.match(/\.([a-z]+)(\?|$)/i)?.[1]?.toLowerCase() || null;
      const ext = pickExt(dl.contentType, urlExt);
      const path = `${accountId}/${product.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, dl.buffer, { contentType: dl.contentType, upsert: true });
      if (upErr) {
        console.error(`   ⚠️ upload failed: ${upErr.message}`);
        continue;
      }
      publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl;
      if (!publicUrl) {
        console.error('   ⚠️ no public URL');
        continue;
      }
      cardUpload.set(best.image, publicUrl);
    } else {
      // Re-upload under this product's id path so each row owns its object
      const dl = await downloadImage(best.image);
      if (dl) {
        const ext = pickExt(dl.contentType, best.image.match(/\.([a-z]+)(\?|$)/i)?.[1]?.toLowerCase() || null);
        await supabase.storage
          .from(BUCKET)
          .upload(`${accountId}/${product.id}.${ext}`, dl.buffer, { contentType: dl.contentType, upsert: true });
        publicUrl = supabase.storage.from(BUCKET).getPublicUrl(`${accountId}/${product.id}.${ext}`).data?.publicUrl || publicUrl;
      }
    }

    const { error: updErr } = await supabase
      .from('widget_products')
      .update({ image_url: publicUrl, product_url: best.url })
      .eq('id', product.id);
    if (updErr) {
      console.error(`   ⚠️ DB update failed: ${updErr.message}`);
      continue;
    }
    saved++;
    console.log(`   ✅ ${publicUrl}`);
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Cards: ${cards.length} · Products: ${products!.length}`);
  console.log(`Matched: ${matched} · Saved image+url: ${saved} · Unmatched: ${unmatched.length}`);
  if (unmatched.length) {
    console.log(`\nUnmatched:`);
    for (const u of unmatched) console.log(`  - ${u}`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
