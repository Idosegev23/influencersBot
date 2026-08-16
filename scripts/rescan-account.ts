/**
 * Generic controlled re-scan for one account (reuses the safe pattern from
 * scan-influencers-2026-07.ts): scrape each handle data-only
 * (processContentInBackground:false — avoids the double-process config-wipe race),
 * identity/primary handle LAST (avatar wins), then processAccountContent ONCE +
 * regenerate tabs. Never touches isDemo.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/rescan-account.ts <accountId> <handle> [handle2 ... handleLast]
 *   handles are scraped in order; put the identity/personal handle LAST.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function scrapeHandle(accountId: string, username: string, incremental: boolean) {
  const { getScanJobsRepo } = await import('../src/lib/db/repositories/scanJobsRepo');
  const { NewScanOrchestrator, DEFAULT_SCAN_CONFIG } = await import('../src/lib/scraping/newScanOrchestrator');
  const repo = getScanJobsRepo();
  const job = await repo.create({ username, account_id: accountId, priority: 100, requested_by: 'script:rescan-account', config: DEFAULT_SCAN_CONFIG });
  const scanConfig = { ...DEFAULT_SCAN_CONFIG, processContentInBackground: false, incremental, maxWebsitePages: 0, postsLimit: 60 };
  try { await repo.markRunning(job.id, 'script'); } catch {}
  console.log(`   📡 scraping @${username} (incremental=${incremental}) job=${job.id}`);
  const res = await new NewScanOrchestrator().run(job.id, username, accountId, scanConfig);
  try { res.success ? await repo.markSucceeded(job.id, res) : await repo.markFailed(job.id, res.error?.code || 'SCAN_FAILED', res.error?.message || 'unknown'); } catch {}
  console.log(res.success
    ? `   ✅ @${username}: posts=${res.stats.postsCount} highlights=${res.stats.highlightsCount} (${res.stats.highlightItemsCount} items)`
    : `   ❌ @${username} FAILED: [${res.error?.code}] ${res.error?.message}`);
  return res.success;
}

async function main() {
  const [accountId, ...handles] = process.argv.slice(2);
  if (!accountId || handles.length === 0) { console.error('Usage: rescan-account.ts <accountId> <handle> [handle2 ...]'); process.exit(1); }

  console.log(`\n▶ re-scan ${accountId} — handles: ${handles.join(', ')} (last = identity)`);
  let ok = 0;
  for (let i = 0; i < handles.length; i++) {
    // existing account → incremental for the identity handle (last); brand/new handles → full
    const isLast = i === handles.length - 1;
    try { if (await scrapeHandle(accountId, handles[i], isLast)) ok++; } catch (e: any) { console.log(`   ❌ @${handles[i]} threw: ${e.message}`); }
  }

  const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
  console.log(`   🔧 processing content (transcribe new + RAG + persona)...`);
  const result = await processAccountContent({ accountId, transcribeVideos: true, maxVideosToTranscribe: 999, buildRagIndex: true, buildPersona: true, priority: 'high' });
  console.log(`   ✅ processed: transcribed=${result.stats.videosTranscribed} persona=${result.stats.personaBuilt} ragDocs=${result.stats.ragDocumentsIngested}`);
  if (result.errors?.length) for (const e of result.errors) console.log(`      ⚠️ ${e}`);

  try {
    const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
    const t = await generateTabConfig(accountId);
    console.log(`   🏷️  tabs: ${t.tabs.map((x: { label: string }) => x.label).join(' | ')}`);
  } catch (e: any) { console.log(`   ⚠️ tab config failed: ${e.message}`); }

  console.log(`\n✔ done — ${ok}/${handles.length} handles scraped`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
