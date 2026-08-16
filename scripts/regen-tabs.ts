/**
 * Regenerate an account's tab config (header/subtitle/tabs/greeting) from its
 * current archetype + influencer_type. Fixes stale tabs — e.g. a brand left with
 * an influencer 'content_feed' tab instead of the 'topics' products catalog.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/regen-tabs.ts <accountId> [accountId...]
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.error('Usage: regen-tabs.ts <accountId> [accountId...]'); process.exit(1); }
  const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
  for (const id of ids) {
    try {
      const r = await generateTabConfig(id);
      console.log(`✅ ${id}`);
      console.log(`   header:   ${r.header_label}`);
      console.log(`   subtitle: ${r.chat_subtitle}`);
      console.log(`   tabs:     ${r.tabs.map((t: { label: string }) => t.label).join(' | ')}`);
    } catch (e: any) {
      console.log(`❌ ${id}: ${e.message}`);
    }
  }
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
