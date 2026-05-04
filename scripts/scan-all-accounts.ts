/**
 * Scan ALL active accounts locally (no Vercel timeout limits)
 * Run with: npx tsx --tsconfig tsconfig.json scripts/scan-all-accounts.ts
 *
 * Options:
 *   --skip-processing   Only scrape Instagram, skip transcription/persona/RAG
 *   --only <username>   Scan only specific accounts (comma-separated)
 *   --concurrency <n>   Run N scans in parallel (default: 1)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

interface AccountInfo {
  id: string;
  username: string;
}

async function scanSingleAccount(account: AccountInfo, skipProcessing: boolean): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 @${account.username} — Starting scan...`);
    console.log(`${'='.repeat(60)}`);

    // Step 1: Create scan job
    const { getScanJobsRepo } = await import('../src/lib/db/repositories/scanJobsRepo');
    const { DEFAULT_SCAN_CONFIG } = await import('../src/lib/scraping/newScanOrchestrator');

    const repo = getScanJobsRepo();
    const job = await repo.create({
      username: account.username,
      account_id: account.id,
      priority: 100,
      requested_by: 'script:scan-all',
      config: DEFAULT_SCAN_CONFIG,
    });

    // Step 2: Run scan
    console.log(`📡 Scraping Instagram...`);
    const { runScanJob } = await import('../src/lib/scraping/runScanJob');
    await runScanJob(job.id);
    const scanDuration = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`✅ Scrape done in ${scanDuration}s`);

    // Step 3: Process content (transcription + persona + RAG)
    if (!skipProcessing) {
      console.log(`🔧 Processing content (transcription + persona + RAG)...`);
      const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
      const result = await processAccountContent({
        accountId: account.id,
        scanJobId: job.id,
        transcribeVideos: true,
        maxVideosToTranscribe: 999,
        buildRagIndex: true,
        buildPersona: true,
        priority: 'high',
      });

      console.log(`   Transcribed: ${result.stats.videosTranscribed} | Persona: ${result.stats.personaBuilt ? 'Yes' : 'No'} | RAG: ${result.stats.ragDocumentsIngested}`);

      if (result.errors.length > 0) {
        console.log(`   ⚠️ ${result.errors.length} errors: ${result.errors.slice(0, 3).join(', ')}`);
      }

      // Step 4: Generate tab config
      try {
        const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
        await generateTabConfig(account.id);
        console.log(`   🏷️ Tab config updated`);
      } catch (err: any) {
        console.log(`   ⚠️ Tab config failed: ${err.message}`);
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`✅ @${account.username} completed in ${duration.toFixed(0)}s`);
    return { success: true, duration };

  } catch (error: any) {
    const duration = (Date.now() - startTime) / 1000;
    console.error(`❌ @${account.username} failed after ${duration.toFixed(0)}s: ${error.message}`);
    return { success: false, duration, error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const skipProcessing = args.includes('--skip-processing');
  const onlyIndex = args.indexOf('--only');
  const onlyFilter = onlyIndex !== -1 ? args[onlyIndex + 1]?.split(',') : null;

  console.log(`\n${'🔥'.repeat(30)}`);
  console.log(`  BULK SCAN — All Active Accounts (Local)`);
  console.log(`  Skip processing: ${skipProcessing}`);
  if (onlyFilter) console.log(`  Filter: ${onlyFilter.join(', ')}`);
  console.log(`${'🔥'.repeat(30)}\n`);

  // Load all active accounts from DB
  const { createClient } = await import('../src/lib/supabase/server');
  const supabase = await createClient();

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config, status')
    .eq('type', 'creator')
    .eq('status', 'active');

  if (error || !accounts) {
    console.error('Failed to load accounts:', error?.message);
    process.exit(1);
  }

  // Also get persona usernames
  const { data: personas } = await supabase
    .from('chatbot_persona')
    .select('account_id, instagram_username')
    .in('account_id', accounts.map(a => a.id));

  const personaMap = new Map((personas || []).map(p => [p.account_id, p.instagram_username]));

  let accountList: AccountInfo[] = accounts
    .map(a => ({
      id: a.id,
      username: personaMap.get(a.id) || (a.config as any)?.username || '',
    }))
    .filter(a => a.username);

  // Apply filter
  if (onlyFilter) {
    accountList = accountList.filter(a => onlyFilter.includes(a.username));
  }

  console.log(`📋 ${accountList.length} accounts to scan:\n   ${accountList.map(a => '@' + a.username).join(', ')}\n`);

  const results: { username: string; success: boolean; duration: number; error?: string }[] = [];
  const totalStart = Date.now();

  // Run sequentially (one at a time — safe for API rate limits)
  for (let i = 0; i < accountList.length; i++) {
    const account = accountList[i];
    console.log(`\n📊 Progress: ${i + 1}/${accountList.length}`);

    const result = await scanSingleAccount(account, skipProcessing);
    results.push({ username: account.username, ...result });
  }

  // Summary
  const totalDuration = ((Date.now() - totalStart) / 1000 / 60).toFixed(1);
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 BULK SCAN COMPLETE — ${totalDuration} minutes`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   ✅ Succeeded: ${succeeded.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`   ❌ Failed: ${failed.length}`);
    for (const f of failed) {
      console.log(`      - @${f.username}: ${f.error}`);
    }
  }
  console.log(`   ⏱️ Average: ${(results.reduce((s, r) => s + r.duration, 0) / results.length / 60).toFixed(1)} min/account`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
