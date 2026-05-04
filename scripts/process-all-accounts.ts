/**
 * Process ALL accounts: transcription + persona + RAG (NO Instagram scraping)
 * Use when scrape data already exists but processing didn't run.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/process-all-accounts.ts
 * Skip already done: npx tsx --tsconfig tsconfig.json scripts/process-all-accounts.ts --skip eranswis,jewish.deli.tlv,...
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);
  const skipIndex = args.indexOf('--skip');
  const skipList = skipIndex !== -1 ? args[skipIndex + 1]?.split(',') : [];
  const onlyIndex = args.indexOf('--only');
  const onlyFilter = onlyIndex !== -1 ? args[onlyIndex + 1]?.split(',') : null;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 BULK PROCESSING — Transcription + Persona + RAG`);
  console.log(`   (No Instagram scraping — using existing data)`);
  console.log(`${'='.repeat(60)}\n`);

  const { createClient } = await import('../src/lib/supabase/server');
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('type', 'creator')
    .eq('status', 'active');

  if (!accounts) {
    console.error('No accounts found');
    process.exit(1);
  }

  const { data: personas } = await supabase
    .from('chatbot_persona')
    .select('account_id, instagram_username')
    .in('account_id', accounts.map(a => a.id));

  const personaMap = new Map((personas || []).map(p => [p.account_id, p.instagram_username]));

  let accountList = accounts
    .map(a => ({
      id: a.id,
      username: personaMap.get(a.id) || (a.config as any)?.username || '',
    }))
    .filter(a => a.username)
    .filter(a => !skipList.includes(a.username));

  if (onlyFilter) {
    accountList = accountList.filter(a => onlyFilter.includes(a.username));
  }

  console.log(`📋 ${accountList.length} accounts to process:\n   ${accountList.map(a => '@' + a.username).join(', ')}\n`);

  const results: { username: string; success: boolean; duration: number; transcribed: number; error?: string }[] = [];
  const totalStart = Date.now();

  for (let i = 0; i < accountList.length; i++) {
    const account = accountList[i];
    const start = Date.now();

    console.log(`\n📊 [${i + 1}/${accountList.length}] @${account.username}`);

    try {
      const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
      const result = await processAccountContent({
        accountId: account.id,
        transcribeVideos: true,
        maxVideosToTranscribe: 999,
        buildRagIndex: true,
        buildPersona: true,
        priority: 'high',
      });

      const duration = (Date.now() - start) / 1000;
      console.log(`   ✅ Done in ${(duration / 60).toFixed(1)}m — Transcribed: ${result.stats.videosTranscribed} | Persona: ${result.stats.personaBuilt ? 'Yes' : 'No'} | RAG: ${result.stats.ragDocumentsIngested}`);

      // Generate tab config
      try {
        const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
        await generateTabConfig(account.id);
        console.log(`   🏷️ Tab config updated`);
      } catch (err: any) {
        console.log(`   ⚠️ Tab config: ${err.message}`);
      }

      results.push({ username: account.username, success: true, duration, transcribed: result.stats.videosTranscribed });
    } catch (err: any) {
      const duration = (Date.now() - start) / 1000;
      console.error(`   ❌ Failed after ${(duration / 60).toFixed(1)}m: ${err.message}`);
      results.push({ username: account.username, success: false, duration, transcribed: 0, error: err.message });
    }
  }

  const totalMin = ((Date.now() - totalStart) / 1000 / 60).toFixed(1);
  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 DONE — ${totalMin} minutes`);
  console.log(`   ✅ ${ok.length}/${results.length} succeeded`);
  console.log(`   🎥 Total transcriptions: ${results.reduce((s, r) => s + r.transcribed, 0)}`);
  if (fail.length > 0) {
    console.log(`   ❌ Failed:`);
    for (const f of fail) console.log(`      - @${f.username}: ${f.error}`);
  }
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
