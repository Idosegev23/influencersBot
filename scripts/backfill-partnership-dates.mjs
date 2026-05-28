#!/usr/bin/env node --env-file=.env.local
/**
 * Backfill partnerships.start_date with the "עדכון אחרון" date from the
 * website chunk where the partnership's affiliate URL appears.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-partnership-dates.mjs --account-id <id> [--dry-run]
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

// "עדכון אחרון:\n01.12.2020 9:29 pm"  →  Date object
const DATE_RE = /עדכון\s*אחרון\s*:?\s*(\d{2})\.(\d{2})\.(\d{4})/;

function parseDate(text) {
  const m = text.match(DATE_RE);
  if (!m) return null;
  const [, d, mo, y] = m;
  // YYYY-MM-DD for postgres date type
  return `${y}-${mo}-${d}`;
}

async function main() {
  // 1. Pull all partnerships with a link
  const { data: parts, error: pErr } = await supabase
    .from('partnerships')
    .select('id, brand_name, link')
    .eq('account_id', ACCOUNT_ID)
    .not('link', 'is', null);
  if (pErr) throw new Error(pErr.message);
  console.log(`${parts.length} partnerships with a link`);

  // 2. Pull all website chunks (paginated) — we need chunk_text to find the link
  const chunks = [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, metadata')
      .eq('account_id', ACCOUNT_ID)
      .eq('entity_type', 'website')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    chunks.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${chunks.length} website chunks`);

  // 3. Build a lookup: for each chunk URL, the parsed date (most recent if multiple chunks)
  const dateByUrl = new Map();
  for (const c of chunks) {
    const url = c.metadata?.url;
    if (!url) continue;
    const d = parseDate(c.chunk_text || '');
    if (!d) continue;
    const prev = dateByUrl.get(url);
    if (!prev || d > prev) dateByUrl.set(url, d);
  }
  console.log(`${dateByUrl.size} unique source URLs with a parsed date`);

  // 4. For each partnership, find the chunk(s) where its link appears
  //    Pick the most recent date among those chunks.
  let matched = 0, updated = 0, skipped = 0;
  for (const p of parts) {
    if (!p.link) { skipped++; continue; }

    // Find chunks that mention this link
    const linkLower = p.link.toLowerCase();
    let bestDate = null;
    for (const c of chunks) {
      const text = (c.chunk_text || '').toLowerCase();
      if (!text.includes(linkLower)) continue;
      const d = parseDate(c.chunk_text);
      if (d && (!bestDate || d > bestDate)) bestDate = d;
    }
    if (!bestDate) { skipped++; continue; }
    matched++;

    if (DRY_RUN) {
      console.log(`  ${p.brand_name} → ${bestDate}  (${p.link.slice(0, 60)})`);
      continue;
    }
    const { error } = await supabase
      .from('partnerships')
      .update({ start_date: bestDate })
      .eq('id', p.id);
    if (error) console.warn(`  update failed for ${p.brand_name}: ${error.message}`);
    else updated++;
  }

  console.log(`\nDONE:`);
  console.log(`  matched:  ${matched}`);
  console.log(`  updated:  ${updated}`);
  console.log(`  skipped:  ${skipped} (no chunk match or no date)`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
