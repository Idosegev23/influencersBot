/**
 * Test incremental scan on a few accounts to measure time savings
 * Run: npx tsx --tsconfig tsconfig.json scripts/test-incremental-scan.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { createClient } = await import('../src/lib/supabase/server');
  const { NewScanOrchestrator } = await import('../src/lib/scraping/newScanOrchestrator');
  const { getScanJobsRepo } = await import('../src/lib/db/repositories/scanJobsRepo');

  const supabase = await createClient();
  const repo = getScanJobsRepo();

  // Pick 3 accounts to test
  const testUsernames = ['jewish.deli.tlv', 'erevtov', 'the_dekel'];

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('type', 'creator')
    .eq('status', 'active');

  const { data: personas } = await supabase
    .from('chatbot_persona')
    .select('account_id, instagram_username')
    .in('account_id', (accounts || []).map(a => a.id));

  const personaMap = new Map((personas || []).map(p => [p.account_id, p.instagram_username]));

  const testAccounts = (accounts || [])
    .map(a => ({ id: a.id, username: personaMap.get(a.id) || (a.config as any)?.username }))
    .filter(a => testUsernames.includes(a.username));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 INCREMENTAL SCAN TEST — ${testAccounts.length} accounts`);
  console.log(`${'='.repeat(60)}\n`);

  for (const account of testAccounts) {
    const job = await repo.create({
      username: account.username,
      account_id: account.id,
      priority: 100,
      requested_by: 'script:test-incremental',
      config: {
        postsLimit: 20,
        commentsPerPost: 3,
        maxWebsitePages: 0,
        samplesPerHighlight: 999,
        transcribeReels: false,
        incremental: true,
        websiteCacheDays: 7,
      },
    });

    await repo.markRunning(job.id, 'test');

    const orchestrator = new NewScanOrchestrator();
    const start = Date.now();

    console.log(`\n🚀 @${account.username} — incremental scan...`);
    try {
      const result = await orchestrator.run(job.id, account.username, account.id, {
        postsLimit: 20,
        commentsPerPost: 3,
        maxWebsitePages: 0,
        samplesPerHighlight: 999,
        transcribeReels: false,
        incremental: true,
        websiteCacheDays: 7,
      });

      const duration = ((Date.now() - start) / 1000).toFixed(1);
      await repo.markSucceeded(job.id, result);

      console.log(`✅ @${account.username} — ${duration}s`);
      console.log(`   Posts: ${result.stats.postsCount} (${(result.stats as any).newPostsCount || 0} new)`);
      console.log(`   Highlights: ${result.stats.highlightsCount} (${(result.stats as any).highlightsSkipped || 0} skipped)`);
      console.log(`   Comments: ${result.stats.commentsCount}`);
      console.log(`   Items fetched: ${result.stats.highlightItemsCount}`);
    } catch (err: any) {
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.error(`❌ @${account.username} — failed after ${duration}s: ${err.message}`);
      await repo.markFailed(job.id, 'TEST_ERROR', err.message);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 TEST COMPLETE`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
