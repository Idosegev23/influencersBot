#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Full RAG Rebuild Script
 *
 * Re-ingests all content for accounts with:
 * - Delete existing documents + chunks per account
 * - text-embedding-3-large (2000d) embeddings
 * - Content budget enforcement per archetype
 * - Topic classification (auto via ingestAllForAccount)
 * - Enrichment: Hebrew summaries + synthetic queries + partnership enrichment
 * - Smoke test: retrieval validation on synthetic queries
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/rebuild-rag-full.ts --all
 *   npx tsx --tsconfig tsconfig.json scripts/rebuild-rag-full.ts --account <id>
 *   npx tsx --tsconfig tsconfig.json scripts/rebuild-rag-full.ts --all --dry-run
 *   npx tsx --tsconfig tsconfig.json scripts/rebuild-rag-full.ts --all --skip-enrich
 *   npx tsx --tsconfig tsconfig.json scripts/rebuild-rag-full.ts --account <id> --skip-smoke
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

// ============================================
// CLI args
// ============================================

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const runAll = args.includes('--all');
const singleAccount = getArg('account');
const dryRun = args.includes('--dry-run');
const skipEnrich = args.includes('--skip-enrich');
const skipSmoke = args.includes('--skip-smoke');

if (!runAll && !singleAccount) {
  console.error('Usage: npx tsx scripts/rebuild-rag-full.ts --all | --account <id>');
  process.exit(1);
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('RAG Full Rebuild');
  console.log('='.repeat(70));
  console.log(`  Mode:       ${runAll ? 'ALL accounts' : `Single: ${singleAccount}`}`);
  console.log(`  Dry run:    ${dryRun}`);
  console.log(`  Enrichment: ${!skipEnrich}`);
  console.log(`  Smoke test: ${!skipSmoke}`);
  console.log('-'.repeat(70));

  // Dynamic imports for @/ path aliases
  const { createClient } = await import('../src/lib/supabase/server');
  const { ingestAllForAccount } = await import('../src/lib/rag/ingest');
  const { enrichAccountChunks } = await import('../src/lib/rag/enrich');
  const { retrieveContext } = await import('../src/lib/rag/retrieve');

  const supabase = createClient();

  // ============================================
  // Phase A: Preparation
  // ============================================

  // Check env vars
  const requiredVars = ['OPENAI_API_KEY', 'GEMINI_API_KEY'];
  for (const v of requiredVars) {
    if (!process.env[v]) {
      console.error(`Missing env var: ${v}`);
      process.exit(1);
    }
  }
  console.log('  Env vars OK');

  // Load accounts
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, config')
    .order('id');

  if (accErr || !accounts) {
    console.error('Failed to load accounts:', accErr?.message);
    process.exit(1);
  }

  // Filter
  let targetAccounts = accounts;
  if (singleAccount) {
    targetAccounts = accounts.filter(a => a.id === singleAccount);
    if (targetAccounts.length === 0) {
      console.error(`Account ${singleAccount} not found`);
      process.exit(1);
    }
  }

  // Verify all accounts have archetypes
  const untyped = targetAccounts.filter(a => !(a.config as any)?.archetype);
  if (untyped.length > 0) {
    console.error(`${untyped.length} accounts missing archetype:`);
    for (const a of untyped) {
      console.error(`   ${a.id} -- ${(a.config as any)?.username || 'unknown'}`);
    }
    process.exit(1);
  }
  console.log(`  All ${targetAccounts.length} accounts have archetypes`);

  if (dryRun) {
    console.log('\n  DRY RUN -- would process:');
    for (const a of targetAccounts) {
      const cfg = a.config as any;
      console.log(`    ${cfg?.username || a.id} (${cfg?.archetype})`);
    }
    console.log('\n  No changes made.');
    process.exit(0);
  }

  // ============================================
  // Phase B: Delete + Ingest + Enrich + Smoke per account
  // ============================================

  console.log(`\nProcessing ${targetAccounts.length} accounts...\n`);

  const results: Array<{
    accountId: string;
    username: string;
    archetype: string;
    deletedChunks: number;
    deletedDocs: number;
    ingestTotal: number;
    ingestByType: Record<string, number>;
    enrichResult?: any;
    smokeTestResult?: { tested: number; passed: number; failed: number };
    durationMs: number;
    errors: string[];
  }> = [];

  for (let i = 0; i < targetAccounts.length; i++) {
    const account = targetAccounts[i];
    const cfg = account.config as any;
    const username = cfg?.username || account.id;
    const archetype = cfg?.archetype || 'default';
    const accountStart = Date.now();

    console.log(`\n[${i + 1}/${targetAccounts.length}] ${username} (${archetype})`);
    console.log('-'.repeat(50));

    const errors: string[] = [];
    let deletedChunks = 0;
    let deletedDocs = 0;

    // Step 1: Delete existing documents + chunks for this account
    console.log('  Deleting existing data...');
    try {
      // Delete chunks first (foreign key to documents)
      const { count: chunkCount } = await supabase
        .from('document_chunks')
        .delete()
        .eq('account_id', account.id)
        .select('*', { count: 'exact', head: true });
      deletedChunks = chunkCount || 0;

      const { count: docCount } = await supabase
        .from('documents')
        .delete()
        .eq('account_id', account.id)
        .select('*', { count: 'exact', head: true });
      deletedDocs = docCount || 0;

      console.log(`  Deleted: ${deletedChunks} chunks, ${deletedDocs} documents`);
    } catch (err) {
      const msg = `Delete failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  ${msg}`);
      errors.push(msg);
      results.push({
        accountId: account.id, username, archetype,
        deletedChunks: 0, deletedDocs: 0,
        ingestTotal: 0, ingestByType: {},
        durationMs: Date.now() - accountStart, errors,
      });
      continue;
    }

    // Step 2: Ingest (now includes topic classification)
    console.log('  Ingesting...');
    let ingestResult;
    try {
      ingestResult = await ingestAllForAccount(account.id, { archetype });
      console.log(`  Ingested: ${ingestResult.total} docs | ${JSON.stringify(ingestResult.byType)}`);
      if (ingestResult.errors.length) {
        console.log(`  ${ingestResult.errors.length} ingest warnings`);
        errors.push(...ingestResult.errors);
      }
    } catch (err) {
      const msg = `Ingest failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  ${msg}`);
      errors.push(msg);
      results.push({
        accountId: account.id, username, archetype,
        deletedChunks, deletedDocs,
        ingestTotal: 0, ingestByType: {},
        durationMs: Date.now() - accountStart, errors,
      });
      continue;
    }

    // Step 3: Enrich (skip topic classification since ingest already did it)
    let enrichResult;
    if (!skipEnrich && ingestResult.total > 0) {
      console.log('  Enriching...');
      try {
        enrichResult = await enrichAccountChunks(account.id, {
          skipTopicClassification: true, // Already done during ingest
        });
        console.log(`  Enriched: ${enrichResult.chunksEnriched} chunks | translations=${enrichResult.translationsAdded} | queries=${enrichResult.syntheticQueriesAdded}`);
        if (enrichResult.errors.length) {
          console.log(`  ${enrichResult.errors.length} enrich warnings`);
          errors.push(...enrichResult.errors);
        }
      } catch (err) {
        const msg = `Enrich failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`  ${msg}`);
        errors.push(msg);
      }
    }

    // Step 4: Smoke test — pick 3 random chunks with synthetic_queries,
    // run retrieveContext, check if the chunk appears in top-10 results
    let smokeTestResult: { tested: number; passed: number; failed: number } | undefined;
    if (!skipSmoke && ingestResult.total > 0) {
      console.log('  Running smoke test...');
      try {
        smokeTestResult = await runSmokeTest(supabase, retrieveContext, account.id, archetype);
        const icon = smokeTestResult.failed === 0 ? 'PASS' : 'WARN';
        console.log(`  Smoke test [${icon}]: ${smokeTestResult.passed}/${smokeTestResult.tested} passed`);
        if (smokeTestResult.failed > 0) {
          errors.push(`Smoke test: ${smokeTestResult.failed}/${smokeTestResult.tested} queries failed to retrieve source chunk in top-10`);
        }
      } catch (err) {
        const msg = `Smoke test error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`  ${msg}`);
        errors.push(msg);
      }
    }

    const duration = Date.now() - accountStart;
    console.log(`  Duration: ${Math.round(duration / 1000)}s`);

    results.push({
      accountId: account.id, username, archetype,
      deletedChunks, deletedDocs,
      ingestTotal: ingestResult.total,
      ingestByType: ingestResult.byType,
      enrichResult,
      smokeTestResult,
      durationMs: duration,
      errors,
    });
  }

  // ============================================
  // Phase C: Summary
  // ============================================

  console.log('\n' + '='.repeat(70));
  console.log('REBUILD SUMMARY');
  console.log('='.repeat(70));

  const totalDocs = results.reduce((s, r) => s + r.ingestTotal, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
  const totalSmokePassed = results.reduce((s, r) => s + (r.smokeTestResult?.passed || 0), 0);
  const totalSmokeTested = results.reduce((s, r) => s + (r.smokeTestResult?.tested || 0), 0);

  console.log(`\n  Accounts:    ${results.length}`);
  console.log(`  Total docs:  ${totalDocs}`);
  console.log(`  Errors:      ${totalErrors}`);
  console.log(`  Smoke tests: ${totalSmokePassed}/${totalSmokeTested} passed`);
  console.log(`  Duration:    ${Math.round(totalDuration / 1000)}s (${Math.round(totalDuration / 60000)}m)`);

  console.log('\n  Per account:');
  for (const r of results) {
    const icon = r.errors.length === 0 ? 'OK' : 'WARN';
    const smoke = r.smokeTestResult ? ` smoke=${r.smokeTestResult.passed}/${r.smokeTestResult.tested}` : '';
    console.log(`    [${icon}] ${r.username} (${r.archetype}): ${r.ingestTotal} docs, ${Math.round(r.durationMs / 1000)}s${smoke}`);
  }

  if (totalErrors > 0) {
    console.log('\n  Errors:');
    for (const r of results) {
      for (const e of r.errors) {
        console.log(`    ${r.username}: ${e}`);
      }
    }
  }

  // ANALYZE for query optimizer
  console.log('\n  Running ANALYZE...');
  try {
    const analyzeClient = createClient();
    await analyzeClient.rpc('exec_sql', { sql: 'ANALYZE document_chunks;' });
    console.log('  ANALYZE complete');
  } catch {
    console.log('  ANALYZE failed (non-critical)');
  }

  // Final chunk count
  const { count: finalChunks } = await supabase
    .from('document_chunks')
    .select('*', { count: 'exact', head: true });

  console.log(`\n  Final chunk count: ${finalChunks}`);
  console.log('\n' + '-'.repeat(70));

  process.exit(totalErrors > 0 ? 1 : 0);
}

// ============================================
// Smoke Test
// ============================================

/**
 * Pick up to 3 random chunks that have synthetic_queries in metadata,
 * run retrieveContext for those queries, and check if the source chunk
 * appears in the top-10 results.
 */
async function runSmokeTest(
  supabase: any,
  retrieveContext: (input: any) => Promise<any>,
  accountId: string,
  archetype: string
): Promise<{ tested: number; passed: number; failed: number }> {
  // Get chunks with synthetic_queries
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, metadata')
    .eq('account_id', accountId)
    .not('metadata->synthetic_queries', 'is', null)
    .limit(50);

  if (!chunks || chunks.length === 0) {
    console.log('    No chunks with synthetic_queries found, skipping smoke test');
    return { tested: 0, passed: 0, failed: 0 };
  }

  // Pick 3 random chunks
  const shuffled = chunks.sort(() => Math.random() - 0.5);
  const testChunks = shuffled.slice(0, 3);

  let passed = 0;
  let failed = 0;

  for (const chunk of testChunks) {
    const queries = (chunk.metadata as any)?.synthetic_queries;
    if (!Array.isArray(queries) || queries.length === 0) continue;

    // Pick first synthetic query
    const testQuery = queries[0];

    try {
      const result = await retrieveContext({
        accountId,
        query: testQuery,
        topK: 10,
        archetype,
      });

      const foundInResults = result.sources.some(
        (s: any) => s.sourceId === chunk.id
      );

      if (foundInResults) {
        passed++;
        console.log(`    PASS: "${testQuery.substring(0, 60)}..." -> found source chunk`);
      } else {
        failed++;
        console.log(`    FAIL: "${testQuery.substring(0, 60)}..." -> source chunk NOT in top-10`);
      }
    } catch (err) {
      failed++;
      console.log(`    ERROR: "${testQuery.substring(0, 60)}..." -> ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { tested: passed + failed, passed, failed };
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
