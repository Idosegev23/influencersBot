#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Match widget_products to scraped product pages, download product images,
 * upload to Supabase Storage (products bucket), and update widget_products
 * with the persisted image URL + canonical product URL.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/persist-product-images.ts <account_id>
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'products';
const accountId = process.argv[2];

if (!accountId) {
  console.error('Usage: persist-product-images.ts <account_id>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Normalize Hebrew + English text: strip punctuation, lowercase, collapse whitespace
function normalize(s: string): string {
  return s
    .replace(/[״"'`׳״()\[\]{},.;:!?\-_/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Token-based Jaccard similarity, keeps tokens >= 2 chars
function jaccard(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter((t) => t.length >= 2));
  const tb = new Set(normalize(b).split(' ').filter((t) => t.length >= 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union;
}

interface ProductPage {
  url: string;
  name: string;
  image: string;
}

interface WidgetProduct {
  id: string;
  name: string;
  name_he: string;
}

function pickExt(contentType: string | null, urlExt: string | null): string {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  if (urlExt && ['png', 'webp', 'gif', 'jpg', 'jpeg'].includes(urlExt)) return urlExt === 'jpeg' ? 'jpg' : urlExt;
  return 'jpg';
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const httpsUrl = url.replace(/^http:\/\//, 'https://');
    const res = await fetch(httpsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.error(`   ⚠️ download ${res.status} for ${httpsUrl}`);
      return null;
    }
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType: ct };
  } catch (e: any) {
    console.error(`   ⚠️ download failed: ${e?.message || e}`);
    return null;
  }
}

async function main() {
  console.log(`🖼️  Persisting product images for account ${accountId}\n`);

  // Load product pages
  const { data: pagesRaw, error: pagesErr } = await supabase
    .from('instagram_bio_websites')
    .select('url, image_urls, extracted_data')
    .eq('account_id', accountId)
    .like('url', '%/products/%');

  if (pagesErr) {
    console.error(`Failed to load pages: ${pagesErr.message}`);
    process.exit(1);
  }

  const pages: ProductPage[] = (pagesRaw || [])
    .map((p: any) => ({
      url: p.url,
      name: p.extracted_data?.name || '',
      image: (p.image_urls || []).find((u: string) => u && !u.includes('butterfly-button')) || '',
    }))
    .filter((p) => p.name && p.image);

  console.log(`📄 Loaded ${pages.length} product pages with images`);

  // Load widget_products
  const { data: products, error: prodErr } = await supabase
    .from('widget_products')
    .select('id, name, name_he')
    .eq('account_id', accountId);

  if (prodErr) {
    console.error(`Failed to load products: ${prodErr.message}`);
    process.exit(1);
  }

  console.log(`📦 Loaded ${products?.length || 0} widget products\n`);

  let matched = 0;
  let downloaded = 0;
  let unmatched: string[] = [];

  for (const product of products as WidgetProduct[]) {
    const productLabel = product.name_he || product.name;

    // Find best matching page
    let bestPage: ProductPage | null = null;
    let bestScore = 0;
    for (const page of pages) {
      const score = Math.max(
        jaccard(productLabel, page.name),
        jaccard(product.name, page.name),
      );
      if (score > bestScore) {
        bestScore = score;
        bestPage = page;
      }
    }

    if (!bestPage || bestScore < 0.25) {
      console.log(`❌ no match: "${productLabel}" (best score ${bestScore.toFixed(2)})`);
      unmatched.push(productLabel);
      continue;
    }

    matched++;
    console.log(`✓ "${productLabel}" → "${bestPage.name}" (${bestScore.toFixed(2)})`);

    // Download
    const dl = await downloadImage(bestPage.image);
    if (!dl) continue;

    const urlExt = bestPage.image.match(/\.([a-z]+)(\?|$)/i)?.[1]?.toLowerCase() || null;
    const ext = pickExt(dl.contentType, urlExt);
    const path = `${accountId}/${product.id}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, dl.buffer, { contentType: dl.contentType, upsert: true });

    if (uploadErr) {
      console.error(`   ⚠️ upload failed: ${uploadErr.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;

    if (!publicUrl) {
      console.error(`   ⚠️ no public URL`);
      continue;
    }

    const { error: updateErr } = await supabase
      .from('widget_products')
      .update({ image_url: publicUrl, product_url: bestPage.url })
      .eq('id', product.id);

    if (updateErr) {
      console.error(`   ⚠️ DB update failed: ${updateErr.message}`);
      continue;
    }

    downloaded++;
    console.log(`   ✅ saved ${path}`);
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Matched: ${matched}/${products!.length}`);
  console.log(`Downloaded + saved: ${downloaded}`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (unmatched.length) {
    console.log(`\nUnmatched products:`);
    for (const u of unmatched) console.log(`  - ${u}`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
