/**
 * One-off: correct the keyword-classifier mis-typing after the 2026-07-20 re-scan.
 * The keyword classifier (generate-chat-config.ts) counts ambiguous keywords
 * ('עור'=skin/leather, 'רכיבים'=ingredients) so recipe/parenting creators scored
 * as "beauty". We set the correct influencer_type + theme, then regenerate the
 * tab config (header/subtitle/tabs/greeting) off the corrected type.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/fix-influencer-types.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const FIXES: { id: string; label: string; type: string }[] = [
  { id: '038fd490-906d-431f-b428-ff9203ce4968', label: 'Daniel Amit', type: 'food' },
  { id: '4e2a0ce8-8753-4876-973c-00c9e1426e51', label: 'Miran Buzaglo', type: 'parenting' },
  { id: 'e18b4860-a281-4c8b-bde0-2e15360cb16f', label: 'Einav Booblil', type: 'beauty' },
];

async function main() {
  const { createClient } = await import('../src/lib/supabase/server');
  const { themePresets } = await import('../src/lib/theme');
  const { generateTabConfig } = await import('../src/lib/chat-ui/generate-tab-config');
  const supabase = await createClient();

  for (const f of FIXES) {
    const { data: acct, error } = await supabase.from('accounts').select('config').eq('id', f.id).single();
    if (error || !acct) { console.log(`❌ ${f.label}: account not found`); continue; }
    const cfg: any = acct.config || {};

    const prevTypes: string[] = Array.isArray(cfg.influencer_types) ? cfg.influencer_types : [];
    const influencer_types = [f.type, ...prevTypes.filter((t) => t !== f.type)];
    const theme = (themePresets as any)[f.type] || (themePresets as any).other;

    const next = { ...cfg, influencer_type: f.type, influencer_types, theme };
    const { error: upErr } = await supabase.from('accounts').update({ config: next }).eq('id', f.id);
    if (upErr) { console.log(`❌ ${f.label}: ${upErr.message}`); continue; }

    // Regenerate tabs/header/subtitle/greeting from the corrected type
    const res = await generateTabConfig(f.id);
    console.log(`✅ ${f.label} → ${f.type}`);
    console.log(`   header:   ${res.header_label}`);
    console.log(`   subtitle: ${res.chat_subtitle}`);
    console.log(`   tabs:     ${res.tabs.map((t: { label: string }) => t.label).join(' | ')}`);
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
