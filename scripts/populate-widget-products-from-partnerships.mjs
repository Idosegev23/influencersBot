#!/usr/bin/env node --env-file=.env.local
/**
 * Mirror partnerships → widget_products so the widget's recommendations
 * engine (reads widget_products) can surface Reut's product picks.
 *
 * Also re-parses prices out of website chunks (we have "189 דולר > ~624שח"
 * patterns) and stores both the original-currency price and the ILS
 * estimate for Israeli display.
 *
 * Usage:
 *   node --env-file=.env.local scripts/populate-widget-products-from-partnerships.mjs --account-id <id> [--dry-run]
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
if (!ACCOUNT_ID) { console.error('--account-id required'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Price patterns ──
// Prefer ILS (the influencer's audience reads in NIS). Pick the FIRST plain
// ILS number that appears in the chunk text (not the conversion suffix), with
// the cross-currency conversion as fallback.
const ILS_RE = /(?:~\s*|כ-?\s*)?(\d{1,4}(?:[\.,]\d{1,2})?)\s*(?:שח|ש"ח|ש״ח|₪)/g;
const USD_RE = /(\d{1,4}(?:[\.,]\d{1,2})?)\s*דולר/;
const GBP_RE = /(\d{1,4}(?:[\.,]\d{1,2})?)\s*פאונד/;
const EUR_RE = /(\d{1,4}(?:[\.,]\d{1,2})?)\s*יורו/;

function parsePrices(text) {
  if (!text) return { price_ils: null, price_orig: null, currency: null };
  const t = text.replace(/[   ]/g, ' '); // normalize narrow spaces

  // ILS — capture all matches, return the FIRST plausible (10..50000) value
  const ilsMatches = [...t.matchAll(ILS_RE)]
    .map(m => parseFloat(m[1].replace(',', '.')))
    .filter(n => n >= 10 && n <= 50000);
  const price_ils = ilsMatches.length ? ilsMatches[0] : null;

  // Original currency price (first match)
  let price_orig = null, currency = null;
  const usd = t.match(USD_RE);
  const gbp = t.match(GBP_RE);
  const eur = t.match(EUR_RE);
  if (usd) { price_orig = parseFloat(usd[1].replace(',', '.')); currency = 'USD'; }
  else if (gbp) { price_orig = parseFloat(gbp[1].replace(',', '.')); currency = 'GBP'; }
  else if (eur) { price_orig = parseFloat(eur[1].replace(',', '.')); currency = 'EUR'; }
  else if (price_ils) { price_orig = price_ils; currency = 'ILS'; }

  return { price_ils, price_orig, currency };
}

async function fetchChunkTextByUrl() {
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
      byUrl.set(url, (byUrl.get(url) || '') + '\n' + (c.chunk_text || ''));
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return byUrl;
}

async function main() {
  console.log(`Loading partnerships + chunks for ${ACCOUNT_ID}...`);
  const { data: partnerships, error } = await supabase
    .from('partnerships')
    .select('id, brand_name, brief, link, category, image_url, source_url, start_date')
    .eq('account_id', ACCOUNT_ID)
    .not('source_url', 'is', null);
  if (error) throw new Error(error.message);
  console.log(`${partnerships.length} partnerships`);

  const chunkTextByUrl = await fetchChunkTextByUrl();
  console.log(`${chunkTextByUrl.size} URLs with chunk text`);

  // Build widget_products rows
  const rows = partnerships.map(p => {
    const text = chunkTextByUrl.get(p.source_url) || '';
    const { price_ils, price_orig, currency } = parsePrices(text);
    return {
      account_id: ACCOUNT_ID,
      name: p.brief || p.brand_name || 'מוצר',
      name_he: p.brief || null,
      description: null,
      price: price_ils ?? price_orig ?? null,
      original_price: null,
      currency: price_ils ? 'ILS' : currency,
      category: p.category,
      subcategory: null,
      brand: p.brand_name,
      image_url: p.image_url,
      product_url: p.link,
      is_available: true,
      is_on_sale: false,
      is_featured: false,
      priority: p.start_date
        ? Math.max(0, 10000 - Math.floor((Date.now() - new Date(p.start_date).getTime()) / 86400000))
        : 0,
    };
  });

  const withPrice = rows.filter(r => r.price !== null).length;
  console.log(`\nExtraction summary:`);
  console.log(`  total products:   ${rows.length}`);
  console.log(`  with price:       ${withPrice} (${(100 * withPrice / rows.length).toFixed(0)}%)`);
  console.log(`  by currency:      USD ${rows.filter(r => r.currency === 'USD').length} · GBP ${rows.filter(r => r.currency === 'GBP').length} · ILS ${rows.filter(r => r.currency === 'ILS').length} · EUR ${rows.filter(r => r.currency === 'EUR').length}`);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN: First 3 ===');
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  // Wipe widget_products for this account
  console.log('\nWiping existing widget_products...');
  const { error: delErr } = await supabase.from('widget_products').delete().eq('account_id', ACCOUNT_ID);
  if (delErr) throw new Error('delete: ' + delErr.message);

  // Insert in batches of 100
  console.log('Inserting...');
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error: insErr } = await supabase.from('widget_products').insert(batch);
    if (insErr) {
      console.warn(`Batch ${i / 100 + 1} failed: ${insErr.message?.slice(0, 200)}`);
      // Try one-by-one
      for (const r of batch) {
        const { error: e2 } = await supabase.from('widget_products').insert(r);
        if (!e2) inserted++;
        else console.warn(`  row failed (${r.name?.slice(0, 40)}): ${e2.message?.slice(0, 100)}`);
      }
    } else {
      inserted += batch.length;
    }
    if ((i + 100) % 200 === 0) console.log(`  ${Math.min(i + 100, rows.length)}/${rows.length} inserted...`);
  }

  console.log(`\nDONE:`);
  console.log(`  widget_products inserted: ${inserted}/${rows.length}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
