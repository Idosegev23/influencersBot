/**
 * Deep scan a single account with higher limits
 * Run with: npx tsx --tsconfig tsconfig.json scripts/deep-scan-account.ts danielamit 038fd490-906d-431f-b428-ff9203ce4968
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const [username, accountId] = process.argv.slice(2);
  const postsLimit = parseInt(process.argv[4] || '200', 10);

  if (!username || !accountId) {
    console.error('Usage: npx tsx --tsconfig tsconfig.json scripts/deep-scan-account.ts <username> <accountId> [postsLimit=200]');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔬 Starting DEEP scan for @${username} (${accountId})`);
  console.log(`   Posts limit: ${postsLimit}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  // Deep scan config — much higher limits
  const DEEP_SCAN_CONFIG = {
    postsLimit,
    commentsPerPost: 5,
    maxWebsitePages: 20,
    samplesPerHighlight: 999,
    transcribeReels: true,
  };

  // Step 1: Create scan job
  console.log('📋 Step 1: Creating scan job...');
  const { getScanJobsRepo } = await import('../src/lib/db/repositories/scanJobsRepo');
  const repo = getScanJobsRepo();
  const job = await repo.create({
    username,
    account_id: accountId,
    priority: 100,
    requested_by: 'script:deep-scan-account',
    config: DEEP_SCAN_CONFIG,
  });
  console.log(`   Job created: ${job.id}`);

  // Step 2: Run scan
  console.log('\n📡 Step 2: Running Instagram scan (deep)...');
  const { runScanJob } = await import('../src/lib/scraping/runScanJob');
  await runScanJob(job.id);
  const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   Scan completed in ${scanTime}s`);

  // Step 3: Process content — transcribe ALL videos, build RAG + persona
  console.log('\n🔧 Step 3: Processing content (transcription + persona + RAG)...');
  const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
  const result = await processAccountContent({
    accountId,
    scanJobId: job.id,
    transcribeVideos: true,
    maxVideosToTranscribe: 9999,
    buildRagIndex: true,
    buildPersona: true,
    priority: 'high',
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ @${username} deep scan completed in ${totalTime}s`);
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
