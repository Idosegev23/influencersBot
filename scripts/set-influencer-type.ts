/**
 * Manually set an account's influencer_type (+ theme) and regenerate its tab
 * config. Use to correct the keyword-classifier when it mis-types an account
 * (ambiguous keywords make broad creators score as 'beauty', etc.).
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/set-influencer-type.ts <accountId> <type>
 *   type ∈ beauty|fashion|food|fitness|tech|lifestyle|parenting|travel|home|media_news|other
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const [accountId, type] = process.argv.slice(2);
  if (!accountId || !type) { console.error('Usage: set-influencer-type.ts <accountId> <type>'); process.exit(1); }

  const { createClient } = await import('../src/lib/supabase/server');
  const { themePresets } = await import('../src/lib/theme');
  const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
  const supabase = await createClient();

  const { data: acct, error } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  if (error || !acct) { console.error('Account not found'); process.exit(1); }
  const cfg: any = acct.config || {};

  const prev: string[] = Array.isArray(cfg.influencer_types) ? cfg.influencer_types : [];
  const influencer_types = [type, ...prev.filter((t) => t !== type)];
  const theme = (themePresets as any)[type] || (themePresets as any).other;

  const next = { ...cfg, influencer_type: type, influencer_types, theme };
  const { error: upErr } = await supabase.from('accounts').update({ config: next }).eq('id', accountId);
  if (upErr) { console.error(upErr.message); process.exit(1); }

  const r = await generateTabConfig(accountId);
  console.log(`✅ ${accountId} → ${type}`);
  console.log(`   header:   ${r.header_label}`);
  console.log(`   subtitle: ${r.chat_subtitle}`);
  console.log(`   tabs:     ${r.tabs.map((t: { label: string }) => t.label).join(' | ')}`);
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
