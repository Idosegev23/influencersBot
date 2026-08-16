/**
 * Seed Bestie's own WhatsApp number as an ordinary whatsapp_channels row.
 * After this, env vars are seed-only — the running code reads the table.
 *
 * The owning account is the dedicated infrastructure account (BESTIE_ACCOUNT_ID),
 * which is deliberately status='suspended' + config.isDemo=true so no scan cron
 * ever picks it up. It is not a tenant; it exists to own this number.
 *
 * Usage: npx tsx scripts/seed-bestie-channel.ts [account-id]
 *        (falls back to BESTIE_ACCOUNT_ID from the environment)
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

// Imports are hoisted above the loadEnv() call, and src/lib/supabase.ts throws at module
// scope when NEXT_PUBLIC_SUPABASE_URL is unset — so these have to be dynamic.
async function main() {
  const { supabase } = await import('../src/lib/supabase');
  const { storeToken } = await import('../src/lib/whatsapp-cloud/channel-tokens');

  const accountId = process.argv[2] || process.env.BESTIE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('usage: seed-bestie-channel.ts <account-id>  (or set BESTIE_ACCOUNT_ID)');
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !phoneNumberId || !wabaId) {
    throw new Error('WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_BUSINESS_ACCOUNT_ID required');
  }

  const { data: existing } = await supabase
    .from('whatsapp_channels')
    .select('id, display_phone_number')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  if (existing) {
    console.log(`[seed] channel already exists: ${existing.id} (${existing.display_phone_number}) — nothing to do`);
    return;
  }

  // Read live metadata so display_phone_number / verified_name are real, not guessed.
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const meta = await res.json();
  if (!res.ok) throw new Error(`Graph lookup failed: ${JSON.stringify(meta)}`);

  const secretId = await storeToken(token);

  const { data, error } = await supabase
    .from('whatsapp_channels')
    .insert({
      account_id: accountId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: meta.display_phone_number ?? null,
      verified_name: meta.verified_name ?? null,
      token_secret_id: secretId,
      onboarding_mode: 'full_api',   // Bestie owns this WABA outright
      status: 'active',
      payment_ready: true,           // billed on our own card already
      connected_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`insert failed: ${error.message}`);

  console.log(`[seed] Bestie channel created: ${data.id} (${meta.display_phone_number} / ${meta.verified_name})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
