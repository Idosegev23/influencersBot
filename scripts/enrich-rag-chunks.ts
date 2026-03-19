#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * RAG Chunk Enrichment Script
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts <account_id> [--dry-run] [--skip-translation] [--skip-queries] [--skip-cleanup] [--skip-partnerships]
 *
 * Examples:
 *   # Full enrichment for ldrs_group
 *   npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts de38eac6-d2fb-46a7-ac09-5ec860147ca0
 *
 *   # Dry run (shows what would happen)
 *   npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts de38eac6-d2fb-46a7-ac09-5ec860147ca0 --dry-run
 *
 *   # Only synthetic queries (skip translation/cleanup)
 *   npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts de38eac6-d2fb-46a7-ac09-5ec860147ca0 --skip-translation --skip-cleanup --skip-partnerships
 *
 *   # Enrich ALL accounts
 *   npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts --all
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { enrichAccountChunks } from '@/lib/rag/enrich';
import { createClient } from '@/lib/supabase/server';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: npx tsx --tsconfig tsconfig.json scripts/enrich-rag-chunks.ts <account_id> [options]

Options:
  --dry-run            Show what would happen without making changes
  --skip-translation   Skip Hebrew summary generation
  --skip-queries       Skip synthetic query generation
  --skip-cleanup       Skip tiny chunk cleanup
  --skip-partnerships  Skip partnership enrichment
  --all                Enrich all accounts with RAG chunks
`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const skipTranslation = args.includes('--skip-translation');
  const skipSyntheticQueries = args.includes('--skip-queries');
  const skipCleanup = args.includes('--skip-cleanup');
  const skipPartnershipEnrich = args.includes('--skip-partnerships');
  const enrichAll = args.includes('--all');

  // Validate environment
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set');
    process.exit(1);
  }
  if (!skipTranslation && !process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not set (required for translation). Use --skip-translation to skip.');
    process.exit(1);
  }

  if (enrichAll) {
    await enrichAllAccounts({
      dryRun,
      skipTranslation,
      skipSyntheticQueries,
      skipCleanup,
      skipPartnershipEnrich,
    });
  } else {
    const accountId = args.find(a => !a.startsWith('--'));
    if (!accountId) {
      console.error('❌ Please provide an account_id or use --all');
      process.exit(1);
    }

    console.log(`\n🚀 Enriching RAG chunks for account: ${accountId}`);
    if (dryRun) console.log('📋 DRY RUN — no changes will be made\n');

    const result = await enrichAccountChunks(accountId, {
      dryRun,
      skipTranslation,
      skipSyntheticQueries,
      skipCleanup,
      skipPartnershipEnrich,
    });

    printResult(accountId, result);
  }
}

async function enrichAllAccounts(options: any) {
  const supabase = createClient();

  // Find all creator accounts that have RAG chunks
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('type', 'creator');

  if (!accounts || accounts.length === 0) {
    console.log('No creator accounts found');
    return;
  }

  // Filter to accounts that actually have chunks (check via count)
  const uniqueIds: string[] = [];
  for (const acc of accounts) {
    const { count } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', acc.id);
    if (count && count > 0) {
      uniqueIds.push(acc.id);
      const username = (acc.config as any)?.username || acc.id;
      console.log(`  Found ${count} chunks for ${username}`);
    }
  }
  console.log(`\n🚀 Enriching ${uniqueIds.length} accounts\n`);

  for (const accountId of uniqueIds) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing account: ${accountId}`);
      const result = await enrichAccountChunks(accountId, options);
      printResult(accountId, result);
    } catch (err: any) {
      console.error(`❌ Account ${accountId} failed: ${err.message}`);
    }
  }
}

function printResult(accountId: string, result: any) {
  console.log(`\n📊 Results for ${accountId}:`);
  console.log(`   ✅ Chunks enriched: ${result.chunksEnriched}`);
  console.log(`   🗑️  Tiny chunks deleted: ${result.chunksDeleted}`);
  console.log(`   🌐 Hebrew summaries added: ${result.translationsAdded}`);
  console.log(`   ❓ Synthetic queries added: ${result.syntheticQueriesAdded}`);
  console.log(`   🤝 Partnerships enriched: ${result.partnershipsEnriched}`);
  console.log(`   ⏱️  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  if (result.errors.length > 0) {
    console.log(`   ⚠️  Errors: ${result.errors.join(', ')}`);
  }
  console.log();
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
