/**
 * Rebuild ONLY the persona (+ chat/tab config) for an account from its existing
 * RAG/content — no re-scrape, no re-transcribe, no re-embed. Use when a scan's
 * persona step failed and left the "לא הצלחנו לזהות" fallback stub.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/rebuild-persona.ts <accountId>
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const accountId = process.argv[2];
  if (!accountId) { console.error('Usage: rebuild-persona.ts <accountId>'); process.exit(1); }

  const { processAccountContent } = await import('../src/lib/processing/content-processor-orchestrator');
  console.log(`🧠 Rebuilding persona for ${accountId} (no re-scrape/transcribe/embed)...`);
  const result = await processAccountContent({
    accountId,
    transcribeVideos: false,
    buildRagIndex: false,
    buildPersona: true,
    priority: 'high',
  });
  console.log(`   personaBuilt=${result.stats.personaBuilt} errors=${result.errors?.length || 0}`);
  if (result.errors?.length) for (const e of result.errors) console.log(`   ⚠️ ${e}`);

  try {
    const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
    const t = await generateTabConfig(accountId);
    console.log(`   🏷️  header: ${t.header_label} | tabs: ${t.tabs.map((x: { label: string }) => x.label).join(' | ')}`);
  } catch (e: any) { console.log(`   ⚠️ tab config: ${e.message}`); }
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
