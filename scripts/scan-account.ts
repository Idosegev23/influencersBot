/**
 * Scan a single account: Instagram scrape → Transcription → Persona → RAG
 * Run with: npx tsx --tsconfig tsconfig.json scripts/scan-account.ts argania_group c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

// Dynamic imports to handle path aliases
async function main() {
  const [username, accountId] = process.argv.slice(2);
  if (!username || !accountId) {
    console.error('Usage: npx tsx --tsconfig tsconfig.json scripts/scan-account.ts <username> <accountId>');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Starting full scan for @${username} (${accountId})`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  // Step 1: Create scan job
  console.log('📋 Step 1: Creating scan job...');
  const { getScanJobsRepo } = await import('../src/lib/db/repositories/scanJobsRepo');
  const { DEFAULT_SCAN_CONFIG } = await import('../src/lib/scraping/newScanOrchestrator');

  const repo = getScanJobsRepo();
  const job = await repo.create({
    username,
    account_id: accountId,
    priority: 100,
    requested_by: 'script:scan-account',
    config: DEFAULT_SCAN_CONFIG,
  });
  console.log(`   Job created: ${job.id}`);

  // Step 2: Run scan
  console.log('\n📡 Step 2: Running Instagram scan...');
  const { runScanJob } = await import('../src/lib/scraping/runScanJob');
  await runScanJob(job.id);
  const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   Scan completed in ${scanTime}s`);

  // Step 3: Process content
  console.log('\n🔧 Step 3: Processing content (transcription + persona + RAG)...');
  const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
  const result = await processAccountContent({
    accountId,
    scanJobId: job.id,
    transcribeVideos: true,
    maxVideosToTranscribe: 999,
    buildRagIndex: true,
    buildPersona: true,
    priority: 'high',
  });

  // Step 4: Generate tab config from RAG data
  console.log('\n🏷️  Step 4: Generating tab config from RAG data...');
  try {
    const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
    const tabResult = await generateTabConfig(accountId);
    console.log(`   Tabs: ${tabResult.tabs.map((t: { label: string }) => t.label).join(' | ')}`);
    console.log(`   Subtitle: ${tabResult.chat_subtitle}`);
    console.log(`   Greeting: ${tabResult.greeting_message}`);
  } catch (err: any) {
    console.error(`   ⚠️ Tab config generation failed: ${err.message}`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ @${username} completed in ${totalTime}s`);
  console.log(`   Videos transcribed: ${result.stats.videosTranscribed}`);
  console.log(`   Persona built: ${result.stats.personaBuilt}`);
  console.log(`   RAG documents: ${result.stats.ragDocumentsIngested}`);
  if (result.errors.length > 0) {
    console.log(`   ⚠️ Errors: ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(`      - ${err}`);
    }
  }
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
