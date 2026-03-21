/**
 * Enrich RAG chunks for all creator accounts (or a specific one).
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/enrich-all-accounts.ts              # All accounts
 *   npx tsx --tsconfig tsconfig.json scripts/enrich-all-accounts.ts --account danielamit
 *   npx tsx --tsconfig tsconfig.json scripts/enrich-all-accounts.ts --dry-run
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const accountFlag = args.indexOf('--account');
  const specificAccount = accountFlag !== -1 ? args[accountFlag + 1] : null;

  // Dynamic import to handle @/ path aliases (requires --tsconfig)
  const { enrichAccountChunks } = await import('../src/lib/rag/enrich');
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all creator accounts
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config, type')
    .eq('type', 'creator')
    .order('created_at');

  if (error) {
    console.error('Failed to fetch accounts:', error.message);
    process.exit(1);
  }

  if (!accounts || accounts.length === 0) {
    console.log('No creator accounts found.');
    process.exit(0);
  }

  // Filter to specific account if requested
  let toProcess = accounts;
  if (specificAccount) {
    toProcess = accounts.filter(
      a => (a.config as any)?.username === specificAccount || a.id === specificAccount
    );
    if (toProcess.length === 0) {
      console.error(`Account "${specificAccount}" not found`);
      process.exit(1);
    }
  }

  // Get chunk counts per account
  const countsMap = new Map<string, { total: number; enriched: number }>();
  for (const account of toProcess) {
    const { count: total } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id);

    const { count: enriched } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)
      .not('metadata->enriched_he', 'is', null);

    countsMap.set(account.id, {
      total: total || 0,
      enriched: enriched || 0,
    });
  }

  console.log(`\nEnrichment Pipeline — ${toProcess.length} account(s)${dryRun ? ' (DRY RUN)' : ''}\n`);

  const results: Array<{
    username: string;
    totalChunks: number;
    enriched: number;
    synthetic: number;
    deleted: number;
    partnerships: number;
    errors: string[];
    durationMs: number;
  }> = [];

  for (const account of toProcess) {
    const username = (account.config as any)?.username || account.id;
    const counts = countsMap.get(account.id) || { total: 0, enriched: 0 };

    if (counts.total === 0) {
      console.log(`[skip] ${username} — no chunks`);
      continue;
    }

    console.log(`\n[start] ${username} — ${counts.total} chunks (${counts.enriched} already enriched)`);
    const startTime = Date.now();

    try {
      const result = await enrichAccountChunks(account.id, { dryRun });

      const elapsed = Date.now() - startTime;
      results.push({
        username,
        totalChunks: counts.total,
        enriched: result.translationsAdded,
        synthetic: result.syntheticQueriesAdded,
        deleted: result.chunksDeleted,
        partnerships: result.partnershipsEnriched,
        errors: result.errors,
        durationMs: elapsed,
      });

      console.log(`[done] ${username} in ${(elapsed / 1000).toFixed(1)}s — translated: ${result.translationsAdded}, queries: ${result.syntheticQueriesAdded}, deleted: ${result.chunksDeleted}, partnerships: ${result.partnershipsEnriched}`);
      if (result.errors.length > 0) {
        console.log(`[warn] ${result.errors.join(', ')}`);
      }
    } catch (err: any) {
      console.error(`[error] ${username}: ${err.message}`);
      results.push({
        username,
        totalChunks: counts.total,
        enriched: 0,
        synthetic: 0,
        deleted: 0,
        partnerships: 0,
        errors: [err.message],
        durationMs: Date.now() - startTime,
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('ENRICHMENT SUMMARY');
  console.log('='.repeat(60));

  const totalTranslated = results.reduce((s, r) => s + r.enriched, 0);
  const totalSynthetic = results.reduce((s, r) => s + r.synthetic, 0);
  const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);
  const totalPartners = results.reduce((s, r) => s + r.partnerships, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
  const totalTime = results.reduce((s, r) => s + r.durationMs, 0);

  for (const r of results) {
    const status = r.errors.length > 0 ? '[!]' : '[ok]';
    console.log(`${status} ${r.username.padEnd(25)} — ${r.enriched} translated, ${r.synthetic} queries, ${r.deleted} cleaned, ${r.partnerships} partnerships (${(r.durationMs / 1000).toFixed(1)}s)`);
  }

  console.log(`\nTotal: ${totalTranslated} translations, ${totalSynthetic} queries, ${totalDeleted} cleaned, ${totalPartners} partnerships`);
  console.log(`Time: ${(totalTime / 1000 / 60).toFixed(1)} minutes`);
  if (totalErrors > 0) console.log(`Errors: ${totalErrors}`);
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
