#!/usr/bin/env npx tsx
/**
 * RAG Evaluation Script
 * Runs test queries against the retrieval pipeline and scores results.
 *
 * Usage:
 *   npx tsx eval/run-eval.ts                    # Run all queries
 *   npx tsx eval/run-eval.ts --account danielamit  # Filter by account
 *   npx tsx eval/run-eval.ts --domain coupon       # Filter by domain
 *   npx tsx eval/run-eval.ts --id da-cross-hair-1  # Run single query
 *   npx tsx eval/run-eval.ts --verbose             # Show chunk details
 *   npx tsx eval/run-eval.ts --save                # Save results to eval/results/
 *   npx tsx eval/run-eval.ts --include-auto        # Also load auto-generated-queries.json
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { retrieveContext } from '../src/lib/rag/retrieve';
import { createClient } from '../src/lib/supabase/server';

// ============================================
// Types
// ============================================

interface TestQuery {
  id: string;
  account_id: string;
  account_name: string;
  domain: string;
  query: string;
  expected_contains: string[];
  should_not_contain: string[];
  notes: string;
  expected_to_fail?: boolean;
  limitation_reason?: string;
  ground_truth_chunk_id?: string;
}

interface QueryResult {
  id: string;
  account_name: string;
  domain: string;
  query: string;
  passed: boolean;
  positive_hits: string[];
  positive_misses: string[];
  negative_violations: string[];
  top_similarity: number;
  avg_similarity: number;
  chunk_count: number;
  entity_types: string[];
  duration_ms: number;
  top_chunks_preview?: string[];
}

interface EvalSummary {
  timestamp: string;
  total_queries: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_top_similarity: number;
  avg_duration_ms: number;
  by_account: Record<string, { total: number; passed: number; rate: number }>;
  by_domain: Record<string, { total: number; passed: number; rate: number }>;
  failed_queries: Array<{ id: string; query: string; reason: string }>;
}

// ============================================
// CLI args
// ============================================

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const filterAccount = getArg('account');
const filterDomain = getArg('domain');
const filterId = getArg('id');
const verbose = args.includes('--verbose');
const saveResults = args.includes('--save');
const includeAuto = args.includes('--include-auto');

// ============================================
// Load queries
// ============================================

const queriesPath = path.join(__dirname, 'test-queries.json');
const queriesData = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
let queries: TestQuery[] = queriesData.queries;

// Load auto-generated queries if --include-auto
if (includeAuto) {
  const autoPath = path.join(__dirname, 'auto-generated-queries.json');
  if (fs.existsSync(autoPath)) {
    const autoData = JSON.parse(fs.readFileSync(autoPath, 'utf-8'));
    const autoQueries: TestQuery[] = autoData.queries || [];
    queries = queries.concat(autoQueries);
    console.log(`  Loaded ${autoQueries.length} auto-generated queries`);
  } else {
    console.warn('  ⚠️  --include-auto specified but eval/auto-generated-queries.json not found. Run scripts/generate-eval-queries.ts first.');
  }
}

// Apply filters
if (filterId) {
  queries = queries.filter(q => q.id === filterId);
} else {
  if (filterAccount) {
    queries = queries.filter(q => q.account_name === filterAccount);
  }
  if (filterDomain) {
    queries = queries.filter(q => q.domain === filterDomain);
  }
}

if (queries.length === 0) {
  console.error('❌ No queries match the filters');
  process.exit(1);
}

console.log(`\n🧪 RAG Evaluation — ${queries.length} queries\n`);
console.log('─'.repeat(70));

// ============================================
// Account archetype cache
// ============================================

const archetypeCache = new Map<string, string | undefined>();

async function getAccountArchetype(accountId: string): Promise<string | undefined> {
  if (archetypeCache.has(accountId)) return archetypeCache.get(accountId);
  const supabase = createClient();
  const { data } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  const archetype = (data?.config as any)?.archetype as string | undefined;
  archetypeCache.set(accountId, archetype);
  return archetype;
}

// ============================================
// Run evaluation
// ============================================

async function evaluateQuery(q: TestQuery): Promise<QueryResult> {
  const start = Date.now();

  let sources: any[] = [];
  let duration_ms = 0;

  try {
    const archetype = await getAccountArchetype(q.account_id);
    const result = await retrieveContext({
      accountId: q.account_id,
      query: q.query,
      topK: 8,
      archetype,
    });
    sources = result.sources || [];
    duration_ms = Date.now() - start;
  } catch (err: any) {
    duration_ms = Date.now() - start;
    console.error(`  ❌ Error for ${q.id}: ${err.message}`);
    return {
      id: q.id,
      account_name: q.account_name,
      domain: q.domain,
      query: q.query,
      passed: false,
      positive_hits: [],
      positive_misses: q.expected_contains,
      negative_violations: [],
      top_similarity: 0,
      avg_similarity: 0,
      chunk_count: 0,
      entity_types: [],
      duration_ms,
    };
  }

  // Normalize Hebrew final-form (sofit) letters to regular forms for matching
  // ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ
  function normalizeHebrew(text: string): string {
    return text
      .replace(/ך/g, 'כ')
      .replace(/ם/g, 'מ')
      .replace(/ן/g, 'נ')
      .replace(/ף/g, 'פ')
      .replace(/ץ/g, 'צ');
  }

  // Combine all chunk text for matching
  const allText = sources.map(s => s.excerpt || s.chunk_text || '').join('\n');
  const allTextNorm = normalizeHebrew(allText.toLowerCase());

  // Check positive expectations
  const positive_hits: string[] = [];
  const positive_misses: string[] = [];
  for (const term of q.expected_contains) {
    if (allTextNorm.includes(normalizeHebrew(term.toLowerCase()))) {
      positive_hits.push(term);
    } else {
      positive_misses.push(term);
    }
  }

  // Check ground truth chunk retrieval
  if (q.ground_truth_chunk_id) {
    const chunkFound = sources.some(s => s.sourceId === q.ground_truth_chunk_id);
    if (chunkFound) {
      positive_hits.push('chunk_retrieved');
    }
  }

  // Check negative expectations
  const negative_violations: string[] = [];
  for (const term of q.should_not_contain) {
    if (allTextNorm.includes(normalizeHebrew(term.toLowerCase()))) {
      negative_violations.push(term);
    }
  }

  // Calculate scores
  const similarities = sources.map(s => s.confidence || s.similarity || 0);
  const top_similarity = similarities.length > 0 ? Math.max(...similarities) : 0;
  const avg_similarity = similarities.length > 0
    ? similarities.reduce((a, b) => a + b, 0) / similarities.length
    : 0;

  const entity_types = [...new Set(sources.map(s => s.entityType || s.entity_type || 'unknown'))];

  // Pass/fail logic
  const positivePass = q.expected_contains.length === 0 || positive_misses.length === 0;
  const negativePass = negative_violations.length === 0;
  const passed = positivePass && negativePass;

  return {
    id: q.id,
    account_name: q.account_name,
    domain: q.domain,
    query: q.query,
    passed,
    positive_hits,
    positive_misses,
    negative_violations,
    top_similarity: Math.round(top_similarity * 1000) / 1000,
    avg_similarity: Math.round(avg_similarity * 1000) / 1000,
    chunk_count: sources.length,
    entity_types,
    duration_ms,
    top_chunks_preview: verbose
      ? sources.slice(0, 3).map(s => {
          const text = (s.excerpt || s.chunk_text || '').substring(0, 120);
          return `[${s.entityType || s.entity_type}|${(s.confidence || s.similarity || 0).toFixed(3)}] ${text}...`;
        })
      : undefined,
  };
}

async function main() {
  const results: QueryResult[] = [];
  // Track which queries are known limitations (expected_to_fail)
  const knownLimitationIds = new Set(queries.filter(q => q.expected_to_fail).map(q => q.id));

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    process.stdout.write(`  [${i + 1}/${queries.length}] ${q.id}... `);

    const result = await evaluateQuery(q);
    results.push(result);

    // Print inline result
    const isKnownLimitation = knownLimitationIds.has(result.id);
    const icon = result.passed ? '✅' : isKnownLimitation ? '⚠️' : '❌';
    const simStr = result.top_similarity > 0 ? ` sim=${result.top_similarity}` : ' (no results)';
    const timeStr = ` ${result.duration_ms}ms`;
    let failReason = '';
    if (!result.passed) {
      const parts: string[] = [];
      if (result.positive_misses.length) parts.push(`missing: ${result.positive_misses.join(', ')}`);
      if (result.negative_violations.length) parts.push(`noise: ${result.negative_violations.join(', ')}`);
      failReason = ` — ${parts.join(' | ')}`;
    }
    console.log(`${icon}${simStr}${timeStr}${failReason}`);

    if (verbose && result.top_chunks_preview?.length) {
      for (const preview of result.top_chunks_preview) {
        console.log(`      ${preview}`);
      }
    }
  }

  // ============================================
  // Summary
  // ============================================

  console.log('\n' + '═'.repeat(70));
  console.log('📊 EVALUATION SUMMARY');
  console.log('═'.repeat(70));

  // Separate known limitations from actionable results
  const actionableResults = results.filter(r => !knownLimitationIds.has(r.id));
  const knownLimitations = results.filter(r => knownLimitationIds.has(r.id));
  const passed = actionableResults.filter(r => r.passed).length;
  const failed = actionableResults.length - passed;
  const passRate = (passed / actionableResults.length * 100).toFixed(1);
  const avgTopSim = results.reduce((s, r) => s + r.top_similarity, 0) / results.length;
  const avgDuration = results.reduce((s, r) => s + r.duration_ms, 0) / results.length;

  console.log(`\n  Actionable: ${actionableResults.length} (${knownLimitations.length} known limitations excluded)`);
  console.log(`  Passed:     ${passed} ✅`);
  console.log(`  Failed:     ${failed} ❌`);
  console.log(`  Pass Rate:  ${passRate}%`);
  console.log(`  Avg Top Sim: ${avgTopSim.toFixed(3)}`);
  console.log(`  Avg Latency: ${Math.round(avgDuration)}ms`);

  // By account
  console.log('\n  By Account:');
  const byAccount: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    if (!byAccount[r.account_name]) byAccount[r.account_name] = { total: 0, passed: 0 };
    byAccount[r.account_name].total++;
    if (r.passed) byAccount[r.account_name].passed++;
  }
  for (const [name, stats] of Object.entries(byAccount)) {
    const rate = (stats.passed / stats.total * 100).toFixed(0);
    console.log(`    ${name}: ${stats.passed}/${stats.total} (${rate}%)`);
  }

  // By domain
  console.log('\n  By Domain:');
  const byDomain: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    if (!byDomain[r.domain]) byDomain[r.domain] = { total: 0, passed: 0 };
    byDomain[r.domain].total++;
    if (r.passed) byDomain[r.domain].passed++;
  }
  for (const [name, stats] of Object.entries(byDomain)) {
    const rate = (stats.passed / stats.total * 100).toFixed(0);
    console.log(`    ${name}: ${stats.passed}/${stats.total} (${rate}%)`);
  }

  // Failed queries detail
  const actionableFails = results.filter(r => !r.passed && !knownLimitationIds.has(r.id));
  const limitationFails = results.filter(r => !r.passed && knownLimitationIds.has(r.id));

  if (actionableFails.length > 0) {
    console.log('\n  ❌ Failed Queries:');
    for (const r of actionableFails) {
      const parts: string[] = [];
      if (r.positive_misses.length) parts.push(`missing=[${r.positive_misses.join(', ')}]`);
      if (r.negative_violations.length) parts.push(`noise=[${r.negative_violations.join(', ')}]`);
      console.log(`    ${r.id}: "${r.query}" — ${parts.join(' | ')}`);
    }
  }

  if (limitationFails.length > 0) {
    console.log(`\n  ⚠️  Known Limitations (${limitationFails.length}):`);
    for (const r of limitationFails) {
      const q = queries.find(q => q.id === r.id);
      const reason = q?.limitation_reason || 'content gap';
      console.log(`    ${r.id}: ${reason}`);
    }
  }

  console.log('\n' + '─'.repeat(70));

  // ============================================
  // Save results
  // ============================================

  if (saveResults) {
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `eval-${timestamp}.json`;
    const filepath = path.join(resultsDir, filename);

    const summary: EvalSummary = {
      timestamp: new Date().toISOString(),
      total_queries: results.length,
      passed,
      failed,
      pass_rate: parseFloat(passRate),
      avg_top_similarity: Math.round(avgTopSim * 1000) / 1000,
      avg_duration_ms: Math.round(avgDuration),
      by_account: Object.fromEntries(
        Object.entries(byAccount).map(([k, v]) => [k, { ...v, rate: Math.round(v.passed / v.total * 100) }])
      ),
      by_domain: Object.fromEntries(
        Object.entries(byDomain).map(([k, v]) => [k, { ...v, rate: Math.round(v.passed / v.total * 100) }])
      ),
      failed_queries: results.filter(r => !r.passed).map(r => ({
        id: r.id,
        query: r.query,
        reason: [
          r.positive_misses.length ? `missing: ${r.positive_misses.join(', ')}` : '',
          r.negative_violations.length ? `noise: ${r.negative_violations.join(', ')}` : '',
        ].filter(Boolean).join(' | '),
      })),
    };

    fs.writeFileSync(filepath, JSON.stringify({ summary, results }, null, 2));
    console.log(`\n  💾 Results saved to ${filepath}`);
  }

  // Exit with code reflecting pass/fail
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
