/**
 * One-off controlled re-scan for 3 demo influencer accounts (2026-07-20).
 *
 * Why a custom driver instead of scan-account.ts:
 *   scan-account.ts lets the orchestrator fire background content-processing
 *   (DEFAULT_SCAN_CONFIG.processContentInBackground=true) AND then calls
 *   processAccountContent() itself → two concurrent runs race on accounts.config
 *   (the known config-wipe race). Here we scrape each handle with
 *   processContentInBackground:false and run processAccountContent() exactly ONCE
 *   per account.
 *
 * Multi-source accounts (Einav): several IG handles fold into ONE account. Posts /
 * highlights upsert by (account_id, shortcode|highlight_id) so they accumulate,
 * never wipe. The personal handle is scraped LAST so persistAccountAvatar(force)
 * restores her own photo to avatars/<accountId>/profile.jpg (brand logos would
 * otherwise win). Persona uses config.username, which stays the personal handle.
 *
 * Websites are handled separately by deep-scrape-website.mjs (saveWebsiteData in
 * the orchestrator is a stub) and must be crawled BEFORE this runs so the persona
 * rebuild sees their RAG chunks.
 *
 * isDemo is never touched — the daily cron skips demo accounts, so these stay
 * manual-scan-only.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/scan-influencers-2026-07.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

interface Handle {
  username: string;
  incremental: boolean; // true = existing re-scan (skip unchanged); false = first full scrape
}
interface Target {
  label: string;
  accountId: string;
  handles: Handle[]; // scraped in order; personal/identity handle LAST
}

const TARGETS: Target[] = [
  {
    label: 'Daniel Amit',
    accountId: '038fd490-906d-431f-b428-ff9203ce4968',
    handles: [{ username: 'danielamit', incremental: true }],
  },
  {
    label: 'Miran Buzaglo',
    accountId: '4e2a0ce8-8753-4876-973c-00c9e1426e51',
    handles: [{ username: 'miranbuzaglo', incremental: true }],
  },
  {
    label: 'Einav Booblil',
    accountId: 'e18b4860-a281-4c8b-bde0-2e15360cb16f',
    handles: [
      { username: 'reefjewelry_byeinav', incremental: false }, // brand — first scrape
      { username: 'ebcosmeticsbyeinav', incremental: false }, // brand — first scrape
      { username: 'einavbooblil_benisti', incremental: true }, // personal LAST (avatar/identity wins)
    ],
  },
];

async function scrapeHandle(accountId: string, h: Handle) {
  const { getScanJobsRepo } = await import('../src/lib/db/repositories/scanJobsRepo');
  const { NewScanOrchestrator, DEFAULT_SCAN_CONFIG } = await import('../src/lib/scraping/newScanOrchestrator');

  const repo = getScanJobsRepo();
  const job = await repo.create({
    username: h.username,
    account_id: accountId,
    priority: 100,
    requested_by: 'script:scan-influencers-2026-07',
    config: DEFAULT_SCAN_CONFIG,
  });

  const scanConfig = {
    ...DEFAULT_SCAN_CONFIG,
    processContentInBackground: false, // we run processAccountContent once, at the end
    incremental: h.incremental,
    maxWebsitePages: 0, // websites handled by deep-scrape-website.mjs
    postsLimit: 60,
  };

  try {
    await repo.markRunning(job.id, 'script');
  } catch {
    /* non-fatal */
  }

  console.log(`   📡 scraping @${h.username} (incremental=${h.incremental}) job=${job.id}`);
  const orchestrator = new NewScanOrchestrator();
  const res = await orchestrator.run(job.id, h.username, accountId, scanConfig);

  try {
    if (res.success) await repo.markSucceeded(job.id, res);
    else await repo.markFailed(job.id, res.error?.code || 'SCAN_FAILED', res.error?.message || 'unknown');
  } catch {
    /* non-fatal */
  }

  if (res.success) {
    console.log(
      `   ✅ @${h.username}: posts=${res.stats.postsCount} highlights=${res.stats.highlightsCount} (${res.stats.highlightItemsCount} items)`,
    );
  } else {
    console.log(`   ❌ @${h.username} FAILED: [${res.error?.code}] ${res.error?.message}`);
  }
  return res.success;
}

async function processAccount(accountId: string) {
  const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
  console.log(`   🔧 processing content (transcribe new + RAG + persona)...`);
  const result = await processAccountContent({
    accountId,
    transcribeVideos: true,
    maxVideosToTranscribe: 999, // skips already-completed transcriptions internally
    buildRagIndex: true,
    buildPersona: true,
    priority: 'high',
  });
  console.log(
    `   ✅ processed: transcribed=${result.stats.videosTranscribed} persona=${result.stats.personaBuilt} ragDocs=${result.stats.ragDocumentsIngested}`,
  );
  if (result.errors?.length) {
    for (const e of result.errors) console.log(`      ⚠️ ${e}`);
  }

  try {
    const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
    const tabs = await generateTabConfig(accountId);
    console.log(`   🏷️  tabs: ${tabs.tabs.map((t: { label: string }) => t.label).join(' | ')}`);
  } catch (err: any) {
    console.log(`   ⚠️ tab config failed: ${err.message}`);
  }
}

async function main() {
  const t0 = Date.now();
  console.log(`\n${'#'.repeat(72)}\n# Influencer re-scan 2026-07-20 — ${TARGETS.length} demo accounts\n${'#'.repeat(72)}`);

  const summary: string[] = [];
  for (const target of TARGETS) {
    const ts = Date.now();
    console.log(`\n${'='.repeat(72)}\n▶ ${target.label} (${target.accountId})\n${'='.repeat(72)}`);
    let ok = 0;
    for (const h of target.handles) {
      try {
        if (await scrapeHandle(target.accountId, h)) ok++;
      } catch (err: any) {
        console.log(`   ❌ @${h.username} threw: ${err.message}`);
      }
    }
    try {
      await processAccount(target.accountId);
    } catch (err: any) {
      console.log(`   ❌ processing threw: ${err.message}`);
    }
    const mins = ((Date.now() - ts) / 60000).toFixed(1);
    summary.push(`${target.label}: ${ok}/${target.handles.length} handles scraped, processed (${mins}m)`);
    console.log(`\n✔ ${target.label} done in ${mins}m`);
  }

  console.log(`\n${'#'.repeat(72)}\n# SUMMARY (${((Date.now() - t0) / 60000).toFixed(1)}m total)`);
  for (const s of summary) console.log(`#   ${s}`);
  console.log(`${'#'.repeat(72)}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
