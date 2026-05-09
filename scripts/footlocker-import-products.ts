#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Bulk-import footlocker products from instagram_bio_websites → widget_products.
 * Skips LLM extraction (we already have name/price/image from scraper).
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a610c713-0a17-47aa-a926-0e96d3d49b5a';

const KNOWN_BRANDS = [
  'NIKE', 'ADIDAS', 'NEW BALANCE', 'PUMA', 'JORDAN', 'CONVERSE', 'VANS', 'REEBOK',
  'ASICS', 'SAUCONY', 'BIRKENSTOCK', 'CROCS', 'TIMBERLAND', 'DR. MARTENS',
  'UNDER ARMOUR', 'CHAMPION', 'TOMMY', 'CALVIN KLEIN', 'LEVIS', 'NEW ERA',
  'CARHARTT', 'STUSSY', 'OFF-WHITE', 'LACOSTE', 'FILA', 'KAPPA',
];

function detectBrand(name: string): string | null {
  if (!name) return null;
  const upper = name.toUpperCase();
  for (const brand of KNOWN_BRANDS) {
    if (upper.includes(brand)) return brand.charAt(0) + brand.slice(1).toLowerCase();
  }
  return null;
}

function parsePrice(priceStr: string): number | null {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isFinite(num) && num > 0 ? num : null;
}

function detectCategory(url: string, name: string): string {
  const u = url.toLowerCase();
  const n = (name || '').toLowerCase();
  if (u.includes('shoes') || u.includes('sneaker') || /נעל|סניקרס|sneaker|shoe/i.test(n)) return 'נעליים';
  if (u.includes('hoodie') || u.includes('hoodies') || /hoodie|קפוצ/i.test(n)) return 'בגדים';
  if (u.includes('shirt') || u.includes('tee') || /חולצה|טישרט|shirt|tee/i.test(n)) return 'בגדים';
  if (u.includes('pants') || u.includes('shorts') || /מכנסי|short|pant/i.test(n)) return 'בגדים';
  if (u.includes('jacket') || /ג׳קט|jacket|מעיל/i.test(n)) return 'בגדים';
  if (u.includes('sock') || /גרבי|sock/i.test(n)) return 'אקססוריז';
  if (u.includes('hat') || u.includes('cap') || /כובע|hat|cap/i.test(n)) return 'אקססוריז';
  if (u.includes('bag') || /תיק|bag/i.test(n)) return 'אקססוריז';
  if (u.includes('accessor')) return 'אקססוריז';
  return 'אופנה';
}

function detectAudience(url: string, name: string): string[] {
  const u = url.toLowerCase();
  const n = (name || '').toLowerCase();
  const result: string[] = [];
  if (u.includes('men') || u.includes('male') || /גברים|man/i.test(n)) result.push('גברים');
  if (u.includes('women') || u.includes('female') || /נשים|woman/i.test(n)) result.push('נשים');
  if (u.includes('kid') || u.includes('youth') || u.includes('teen') || /ילדים|נוער/i.test(n)) result.push('ילדים');
  return result.length ? result : ['unisex'];
}

function slugify(name: string, url: string): string {
  const base = name || url;
  return base
    .toLowerCase()
    .replace(/[^\w֐-׿\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  console.log('═══ Footlocker bulk product import ═══\n');

  console.log('📥 Loading product pages...');
  let allPages: any[] = [];
  let from = 0;
  const PAGE = 500;
  while (true) {
    const { data, error } = await supabase
      .from('instagram_bio_websites')
      .select('id, url, page_title, page_description, extracted_data, image_urls')
      .eq('account_id', ACCOUNT_ID)
      .like('url', '%/products/%')
      .not('extracted_data', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allPages = allPages.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`   Found ${allPages.length} product pages\n`);

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const slugsSeen = new Set<string>();

  for (let i = 0; i < allPages.length; i += 50) {
    const batch = allPages.slice(i, i + 50);
    const rows = batch.map((p) => {
      const ed = (p.extracted_data || {}) as any;
      const name = ed.name || p.page_title || '';
      if (!name) return null;
      let slug = slugify(name, p.url);
      if (slugsSeen.has(slug)) {
        slug = `${slug}-${p.id.substring(0, 8)}`;
      }
      slugsSeen.add(slug);
      const price = parsePrice(ed.price || '');
      const firstImage = Array.isArray(p.image_urls) && p.image_urls.length > 0 ? p.image_urls[0] : null;
      return {
        account_id: ACCOUNT_ID,
        source_page_id: p.id,
        name,
        name_he: name,
        description: ed.description || p.page_description || null,
        price,
        currency: price ? 'ILS' : null,
        category: detectCategory(p.url, name),
        brand: detectBrand(name),
        target_audience: detectAudience(p.url, name),
        image_url: firstImage,
        product_url: p.url,
        is_available: true,
        is_on_sale: false,
        is_featured: false,
        slug,
        priority: 0,
      };
    }).filter(Boolean);

    if (rows.length === 0) continue;

    const { error: insertError } = await supabase
      .from('widget_products')
      .upsert(rows as any, { onConflict: 'account_id,slug' });

    if (insertError) {
      errors.push(`Batch ${i}: ${insertError.message}`);
      console.log(`   ❌ Batch starting at ${i} failed: ${insertError.message}`);
      skipped += rows.length;
    } else {
      inserted += rows.length;
      if (i % 200 === 0) console.log(`   ✓ ${inserted}/${allPages.length} imported`);
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Total pages: ${allPages.length}`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped: ${skipped}`);
  if (errors.length) {
    console.log(`   Errors:`);
    errors.slice(0, 5).forEach(e => console.log(`     - ${e}`));
  }

  // Show category breakdown
  const { data: byCategory } = await supabase
    .from('widget_products')
    .select('category')
    .eq('account_id', ACCOUNT_ID);
  const counts: Record<string, number> = {};
  for (const r of byCategory || []) counts[r.category] = (counts[r.category] || 0) + 1;
  console.log(`\n📊 Categories:`);
  for (const [cat, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${n}`);
  }
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
