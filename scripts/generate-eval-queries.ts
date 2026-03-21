#!/usr/bin/env npx tsx
/**
 * Auto-generate RAG evaluation queries from synthetic_queries in document_chunks.
 *
 * Usage:
 *   npx tsx scripts/generate-eval-queries.ts
 *   npx tsx scripts/generate-eval-queries.ts --account <account_id>   # single account
 *   npx tsx scripts/generate-eval-queries.ts --dry-run                # print without saving
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// CLI args
// ============================================

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}
const filterAccountId = getArg('account');
const dryRun = args.includes('--dry-run');

// ============================================
// Hebrew stop words for keyword extraction
// ============================================

const HEBREW_STOP_WORDS = new Set([
  'יש', 'לך', 'את', 'מה', 'על', 'עם', 'של', 'זה', 'לא', 'גם', 'כל', 'אם', 'כי', 'או', 'אל',
  'הם', 'היא', 'הוא', 'אני', 'שיתוף', 'פעולה', 'אינסטגרם', 'באינסטגרם', 'מקדמת', 'מקדם',
  'קמפיין', 'מותג', 'סיכום', 'שאלות', 'קשורות',
  // Common English stop words that may appear
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has', 'are', 'was', 'were',
]);

// ============================================
// Topic-based negative expectations
// ============================================

function getNegativesForTopic(topic: string): string[] {
  const t = topic.toLowerCase();

  if (t.includes('food') || t.includes('אוכל') || t.includes('מתכון') || t.includes('recipe') || t.includes('cook') || t.includes('בישול')) {
    return ['שמפו', 'מחטב'];
  }
  if (t.includes('beauty') || t.includes('יופי') || t.includes('טיפוח') || t.includes('skincare') || t.includes('hair') || t.includes('שיער')) {
    return ['מתכון', 'פסטה'];
  }
  if (t.includes('fashion') || t.includes('אופנה') || t.includes('בגד') || t.includes('clothing')) {
    return ['מתכון', 'בישול'];
  }
  if (t.includes('tech') || t.includes('טכנולוגיה') || t.includes('gadget')) {
    return ['מתכון', 'שמפו'];
  }
  if (t.includes('fitness') || t.includes('כושר') || t.includes('sport') || t.includes('ספורט')) {
    return ['מתכון', 'שמפו'];
  }
  if (t.includes('travel') || t.includes('טיול') || t.includes('נסיעה')) {
    return ['מתכון', 'מחטב'];
  }
  if (t.includes('home') || t.includes('בית') || t.includes('decor') || t.includes('עיצוב')) {
    return ['מתכון', 'גרביונים'];
  }
  if (t.includes('coupon') || t.includes('קופון') || t.includes('הנחה')) {
    return [];
  }
  // Default
  return [];
}

// ============================================
// Keyword extraction from chunk text
// ============================================

function extractKeywords(text: string, count: number = 3): string[] {
  // Split on whitespace and punctuation
  const words = text
    .replace(/[^\u0590-\u05FFa-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4)
    .filter(w => !HEBREW_STOP_WORDS.has(w))
    .filter(w => !/^\d+$/.test(w));

  // Count word frequencies
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  // Sort by frequency desc, take top unique ones
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  // Return up to `count` unique keywords
  return sorted.slice(0, count);
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('\n--- Generate Eval Queries from Synthetic Queries ---\n');

  // 1. Fetch accounts
  let accountQuery = supabase.from('accounts').select('id, config');
  if (filterAccountId) {
    accountQuery = accountQuery.eq('id', filterAccountId);
  }
  const { data: accounts, error: accErr } = await accountQuery;
  if (accErr) {
    console.error('Error fetching accounts:', accErr.message);
    process.exit(1);
  }
  if (!accounts || accounts.length === 0) {
    console.error('No accounts found');
    process.exit(1);
  }

  console.log(`Found ${accounts.length} account(s)\n`);

  const allQueries: any[] = [];

  for (const account of accounts) {
    const accountConfig = account.config as any;
    const accountName = accountConfig?.username || account.id.slice(0, 8);
    const shortName = accountName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16);

    console.log(`  Account: ${accountName} (${account.id})`);

    // 2. Pull random chunks with synthetic_queries (in metadata JSONB) and topic (top-level column)
    // Supabase doesn't support ORDER BY random() directly, so we fetch more and shuffle
    const { data: chunks, error: chunkErr } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, metadata, entity_type, topic')
      .eq('account_id', account.id)
      .not('metadata->synthetic_queries', 'is', null)
      .not('topic', 'is', null)
      .limit(50);

    if (chunkErr) {
      console.error(`    Error fetching chunks: ${chunkErr.message}`);
      continue;
    }

    if (!chunks || chunks.length === 0) {
      console.log('    No eligible chunks (need synthetic_queries + topic). Skipping.');
      continue;
    }

    // Shuffle and pick 8
    const shuffled = chunks.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 8);

    console.log(`    Found ${chunks.length} eligible chunks, selected ${selected.length}`);

    for (let i = 0; i < selected.length; i++) {
      const chunk = selected[i];

      // Parse synthetic_queries from metadata JSONB
      const meta = (chunk.metadata || {}) as any;
      let syntheticQueries: string[] = [];
      try {
        const sq = meta.synthetic_queries;
        if (typeof sq === 'string') {
          syntheticQueries = JSON.parse(sq);
        } else if (Array.isArray(sq)) {
          syntheticQueries = sq;
        }
      } catch {
        continue;
      }

      if (!syntheticQueries || syntheticQueries.length === 0) continue;

      const queryText = syntheticQueries[0];

      // Filter out generic/too-short queries that can't be meaningfully evaluated
      if (queryText.length < 10 || queryText.match(/^מ(ה|י|הו|הן).{0,5}(מותג|שם|זה)\??$/)) continue;

      const topic = (chunk as any).topic || 'general';
      const keywords = extractKeywords(chunk.chunk_text || '', 3);
      const negatives = getNegativesForTopic(topic);

      // Take 2-3 keywords (minimum 2 if available)
      const expectedContains = keywords.slice(0, Math.min(3, Math.max(2, keywords.length)));

      const queryObj = {
        id: `auto-${shortName}-${i + 1}`,
        account_id: account.id,
        account_name: accountName,
        domain: topic,
        query: queryText,
        expected_contains: expectedContains,
        should_not_contain: negatives,
        ground_truth_chunk_id: chunk.id,
        notes: 'Auto-generated from synthetic query',
      };

      allQueries.push(queryObj);
    }
  }

  console.log(`\nTotal queries generated: ${allQueries.length}`);

  if (allQueries.length === 0) {
    console.log('No queries generated. Ensure accounts have chunks with synthetic_queries and topic.');
    process.exit(0);
  }

  const output = {
    _meta: {
      version: '1.0',
      description: 'Auto-generated RAG evaluation queries from synthetic_queries in document_chunks',
      created: new Date().toISOString().slice(0, 10),
      total_queries: allQueries.length,
    },
    queries: allQueries,
  };

  if (dryRun) {
    console.log('\n--- DRY RUN — would write: ---');
    console.log(JSON.stringify(output, null, 2).slice(0, 2000) + '\n...');
  } else {
    const outPath = path.join(__dirname, '..', 'eval', 'auto-generated-queries.json');
    // Ensure eval directory exists
    const evalDir = path.dirname(outPath);
    if (!fs.existsSync(evalDir)) fs.mkdirSync(evalDir, { recursive: true });

    fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`\nSaved to ${outPath}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
