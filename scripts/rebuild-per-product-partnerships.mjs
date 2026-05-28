#!/usr/bin/env node --env-file=.env.local
/**
 * Rebuild partnerships as PER-PRODUCT entries.
 *
 * The previous brand-grouped extraction collapsed 800+ product pages into
 * ~250 "brand" partnerships (אליאקספרס once for 100+ products). For an
 * influencer who curates individual products, that's wrong — each blog
 * post = one product = one card with name + image + URL + (optional) code.
 *
 * This script:
 *   1) Wipes the existing brand-grouped reutlev partnerships (coupons cascade)
 *   2) For each /index/ page in instagram_bio_websites with an affiliate URL,
 *      creates one partnership with: brand (store), brief (product name),
 *      link (affiliate URL), category (first tag), image_url, start_date.
 *   3) Detects explicit coupon codes in the chunk text and inserts them
 *      into coupons linked to the new partnership.
 *
 * Pure-regex / no LLM. Idempotent: keyed by (account_id, source_url).
 *
 * Usage:
 *   node --env-file=.env.local scripts/rebuild-per-product-partnerships.mjs --account-id <id> [--dry-run] [--no-wipe]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const argv = process.argv.slice(2);
const getArg = (n, d = null) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const ACCOUNT_ID = getArg('--account-id');
const DRY_RUN = argv.includes('--dry-run');
const NO_WIPE = argv.includes('--no-wipe');
if (!ACCOUNT_ID) { console.error('--account-id required'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ────── Regex patterns ──────
const AFFILIATE_RE = /(https?:\/\/(?:amzn\.to|s\.click\.aliexpress\.com|aliexpress\.com\/item|bit\.ly|reutbuy\.me|wallashops\.co\.il|tidd\.ly|click\.linksynergy\.com|prf\.hn|addict)[^\s\)\]\,\"\'<>]+)/i;
const DATE_RE = /עדכון\s*אחרון[:\s\n]*(\d{2})\.(\d{2})\.(\d{4})/;
const STORE_RE = /אתר\s*[-–]\s*([^\n,()]+?)(?=[\n,()]|$)/;
const TAG_RE = /תגיות[:\s\n]*([^\n,()]+)/;
const CODE_PATTERNS = [
  /(?:קופון|הקוד|\sקוד)\s+([A-Z][A-Za-z0-9]{2,20})/g,
  /(\d+)\s*(?:אחוז|%)\s*הנחה.{0,50}?(?:עם\s+)?(?:ה)?קוד\s+([A-Z][A-Za-z0-9]{2,20})/g,
  /code\s*:?\s*([A-Z][A-Za-z0-9]{2,20})/gi,
];
const PCT_RE = /(\d+)\s*(?:אחוז|%)\s*הנחה/;

// Common brand normalization
const URL_TO_BRAND = (url) => {
  const u = (url || '').toLowerCase();
  if (u.includes('amzn.to') || u.includes('amazon.')) return 'אמזון';
  if (u.includes('aliexpress')) return 'אליאקספרס';
  if (u.includes('wallashops.co.il')) return 'וואלה שופס';
  if (u.includes('tidd.ly')) return 'GearBest';
  if (u.includes('addict')) return 'אדיקט';
  return null;
};

const NOISE_IMG = /(loading-icon|bottom-|spacer|placeholder|\.gif$)/i;
const SIZE_IMG = /(\d{2,4})x(\d{2,4})\.(jpg|jpeg|png|webp)/i;

function pickProductImage(images) {
  if (!images?.length) return null;
  // Prefer "NNNxNNN.ext" naming (the WP product thumbnails).
  const sized = images.find((u) => SIZE_IMG.test(u) && !NOISE_IMG.test(u));
  if (sized) return sized;
  // Otherwise first non-noise image
  return images.find((u) => !NOISE_IMG.test(u)) || null;
}

function parseDate(text) {
  const m = text.match(DATE_RE);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

function extractCodes(text) {
  const out = new Set();
  for (const re of CODE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      // CODE is in last capture group
      const code = m[m.length - 1];
      if (code && code.length >= 3 && code.length <= 20) out.add(code);
    }
  }
  // Filter common false positives
  const BLOCK = new Set(['REUT','HTTP','HTTPS','HTML','ASIN','SKU','UPC','USD','EUR','ILS','GIF','JPG','PNG','URL']);
  return [...out].filter((c) => !BLOCK.has(c.toUpperCase()));
}

function cleanProductName(title) {
  return (title || '')
    .replace(/\s*[-–]\s*רעות\s*תקני\s*לי\s*$/u, '')
    .replace(/\s*\|\s*רעות\s*תקני\s*לי\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalize common brand name variations so the UI doesn't see "אמזון בריטניה"
// AND "אמאזון בריטניה" as two distinct stores.
function normalizeBrand(raw) {
  if (!raw) return raw;
  let v = raw.trim();
  // Fix the common Hebrew typo "אמאזון" → "אמזון"
  v = v.replace(/אמאזון/g, 'אמזון');
  // "אליאקספרס" / "עליאקספרס" / "AliExpress" → "אליאקספרס"
  if (/(^|\b)(עליאקספרס|aliexpress)/i.test(v)) v = 'אליאקספרס';
  // Walla Shops variants
  if (/וואלה[!\s]*שופס|wallashops/i.test(v)) v = 'וואלה שופס';
  // GearBest variants
  if (/גירבסט|gearbest/i.test(v)) v = 'GearBest';
  // LastPrice variants
  if (/last\s*price/i.test(v)) v = 'LastPrice';
  // Amazon country normalization
  v = v.replace(/אמזון\s+(אר[״"]?\.?ה[״"]?\.?ב|ארה"ב|ארהב|us|usa|america)/i, 'אמזון US');
  v = v.replace(/אמזון\s+(בריטניה|uk|britain|england)/i, 'אמזון UK');
  v = v.replace(/אמזון\s+(גרמניה|de|germany)/i, 'אמזון DE');
  v = v.replace(/אמזון\s+(צרפת|fr|france)/i, 'אמזון FR');
  v = v.replace(/אמזון\s+(איטליה|it|italy)/i, 'אמזון IT');
  v = v.replace(/אמזון\s+(ספרד|es|spain)/i, 'אמזון ES');
  v = v.replace(/אמזון\s+(אוסטרליה|au|australia)/i, 'אמזון AU');
  v = v.replace(/אמזון\s+(יפן|jp|japan)/i, 'אמזון JP');
  v = v.trim();
  return v;
}

function detectBrand(chunkText, affiliateUrl) {
  // Store hint in body: "אתר - X" — split on first comma/newline
  const m = (chunkText || '').match(STORE_RE);
  if (m) {
    let v = m[1].trim().replace(/[\.\,;:]+$/, '').trim();
    if (v && v.length >= 2 && v.length < 60) return normalizeBrand(v);
  }
  return URL_TO_BRAND(affiliateUrl) || 'כללי';
}

function detectCategory(chunkText) {
  const m = (chunkText || '').match(TAG_RE);
  if (!m) return null;
  let v = m[1].trim();
  v = v.replace(/[\(\)\.\,\;:]+$/, '').trim();
  // Drop very long matches that bled into following text
  if (!v || v.length > 30) return null;
  return v;
}

async function fetchAllPages() {
  const pages = [];
  let from = 0;
  const PAGE = 500;
  for (;;) {
    const { data, error } = await supabase
      .from('instagram_bio_websites')
      .select('url, page_title, page_content, image_urls, scraped_at')
      .eq('account_id', ACCOUNT_ID)
      .ilike('url', '%/index/%')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    pages.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return pages;
}

async function fetchChunkTextByUrl() {
  // We need chunk_text for each source URL (for date/brand/code extraction).
  // Paginate all website chunks for the account and group by URL.
  const byUrl = new Map();
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('chunk_text, metadata')
      .eq('account_id', ACCOUNT_ID)
      .eq('entity_type', 'website')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const c of data) {
      const url = c.metadata?.url;
      if (!url) continue;
      const prev = byUrl.get(url) || '';
      byUrl.set(url, prev + '\n' + (c.chunk_text || ''));
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return byUrl;
}

async function wipeExisting() {
  if (NO_WIPE) { console.log('Skipping wipe (--no-wipe)'); return; }
  console.log('Wiping existing partnerships (coupons cascade)...');
  const { error: cErr } = await supabase.from('coupons').delete().eq('account_id', ACCOUNT_ID);
  if (cErr) console.warn('  coupons delete:', cErr.message);
  const { error: pErr } = await supabase.from('partnerships').delete().eq('account_id', ACCOUNT_ID);
  if (pErr) throw new Error('partnerships delete: ' + pErr.message);
  console.log('  ✓ wiped');
}

async function main() {
  console.log(`Fetching pages & chunk text for ${ACCOUNT_ID}...`);
  const pages = await fetchAllPages();
  const chunkTextByUrl = await fetchChunkTextByUrl();
  console.log(`${pages.length} pages, ${chunkTextByUrl.size} URLs with chunks`);

  // Build per-page entries
  const entries = [];
  let skippedNoAffiliate = 0, skippedNoText = 0;

  for (const page of pages) {
    const combinedText = (chunkTextByUrl.get(page.url) || '') + '\n' + (page.page_content || '');
    if (!combinedText.trim()) { skippedNoText++; continue; }

    const affMatch = combinedText.match(AFFILIATE_RE);
    if (!affMatch) { skippedNoAffiliate++; continue; }

    const rawUrl = affMatch[1].replace(/[\.,;:\)\]\}\"\']+$/, '');
    const productName = cleanProductName(page.page_title) || 'מוצר';
    const productImage = pickProductImage(page.image_urls);
    const date = parseDate(combinedText);
    const brand = detectBrand(combinedText, rawUrl);
    const category = detectCategory(combinedText);
    const codes = extractCodes(combinedText);
    const pctMatch = combinedText.match(PCT_RE);
    const discountValue = pctMatch ? parseInt(pctMatch[1], 10) : null;

    entries.push({
      source_url: page.url,
      brand_name: brand,
      brief: productName,
      link: rawUrl,
      category,
      image_url: productImage,
      start_date: date,
      codes,
      discountValue,
    });
  }

  console.log(`\nExtraction summary:`);
  console.log(`  with affiliate URL:    ${entries.length}`);
  console.log(`  skipped (no affiliate):${skippedNoAffiliate}`);
  console.log(`  skipped (no text):     ${skippedNoText}`);
  console.log(`  with image:            ${entries.filter((e) => e.image_url).length}`);
  console.log(`  with date:             ${entries.filter((e) => e.start_date).length}`);
  console.log(`  with at least 1 code:  ${entries.filter((e) => e.codes.length > 0).length}`);
  console.log(`  total codes:           ${entries.reduce((s, e) => s + e.codes.length, 0)}`);

  // Brand distribution
  const brandCounts = new Map();
  for (const e of entries) brandCounts.set(e.brand_name, (brandCounts.get(e.brand_name) || 0) + 1);
  console.log(`  brands (top 10):`);
  for (const [b, c] of [...brandCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${b}: ${c}`);
  }

  if (DRY_RUN) {
    console.log('\n=== DRY RUN: First 3 entries ===');
    console.log(JSON.stringify(entries.slice(0, 3), null, 2));
    return;
  }

  // ── Wipe and rebuild ──
  await wipeExisting();

  console.log(`\nInserting ${entries.length} partnerships...`);
  let inserted = 0, couponsInserted = 0, failed = 0;
  const seenCodes = new Set(); // dedup codes per account

  for (const e of entries) {
    const { data: p, error } = await supabase
      .from('partnerships')
      .insert({
        account_id: ACCOUNT_ID,
        brand_name: e.brand_name,
        brief: e.brief,
        link: e.link,
        category: e.category,
        image_url: e.image_url,
        source_url: e.source_url,
        start_date: e.start_date,
        status: 'active',
        is_active: true,
        notes: 'Auto-extracted product recommendation (per-product)',
      })
      .select('id')
      .single();
    if (error) { failed++; console.warn(`  partnership failed (${e.source_url.slice(-40)}): ${error.message?.slice(0, 100)}`); continue; }
    inserted++;

    // Insert coupons
    for (const code of e.codes) {
      const key = code.toLowerCase();
      if (seenCodes.has(key)) continue;
      seenCodes.add(key);
      const isPct = e.discountValue !== null;
      const { error: cErr } = await supabase.from('coupons').insert({
        account_id: ACCOUNT_ID,
        partnership_id: p.id,
        code,
        discount_type: isPct ? 'percentage' : 'fixed',
        discount_value: e.discountValue || 0,
        description: `${e.brief} — ${e.brand_name}`,
        brand_name: e.brand_name,
        brand_category: e.category,
        brand_link: e.link,
        tracking_url: e.link,
        is_active: true,
      });
      if (!cErr) couponsInserted++;
      else console.warn(`  coupon ${code} failed: ${cErr.message?.slice(0, 100)}`);
    }

    if (inserted % 100 === 0) console.log(`  ${inserted}/${entries.length} inserted...`);
  }

  console.log(`\nDONE:`);
  console.log(`  partnerships inserted: ${inserted}`);
  console.log(`  coupons inserted:      ${couponsInserted}`);
  console.log(`  failed:                ${failed}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
