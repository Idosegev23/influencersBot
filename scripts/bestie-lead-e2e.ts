/**
 * End-to-end check of the lead funnel, against production.
 *
 * THIS SENDS A REAL WHATSAPP MESSAGE. Pass your own number, never a stranger's.
 *
 * A script rather than a test, for the same reason as bestie-kb-verify:
 * tests/setup.ts stubs global.fetch for the whole suite, so nothing under vitest
 * can exercise the real path this is here to exercise.
 *
 * Run: npx tsx scripts/bestie-lead-e2e.ts 05XXXXXXXX
 * Needs Node >= 22 (`nvm use 22`).
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com';
const SECRET = process.env.META_LEADS_WEBHOOK_SECRET;

const phone = process.argv[2];
if (!phone) {
  console.error('usage: npx tsx scripts/bestie-lead-e2e.ts <your-phone>');
  process.exit(1);
}
if (!SECRET) {
  console.error('META_LEADS_WEBHOOK_SECRET is not set locally — the post would be stored but inert.');
  process.exit(1);
}

async function main() {
  const { createClient } = await import('../src/lib/supabase/server');
  const { normalizeIsraeliPhone } = await import('../src/lib/bestie/phone');
  const supabase = createClient();

  const waId = normalizeIsraeliPhone(phone);
  if (!waId) {
    console.error(`"${phone}" does not normalise to a WhatsApp number.`);
    process.exit(1);
  }

  const leadgenId = `e2e-${waId}-${process.pid}`;
  console.log(`posting lead ${leadgenId} → ${BASE}/api/leads/meta-ads`);

  const res = await fetch(`${BASE}/api/leads/meta-ads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bestie-Secret': SECRET! },
    body: JSON.stringify({
      full_name: 'בדיקת מערכת',
      phone_number: phone,
      email: 'e2e@example.com',
      leadgen_id: leadgenId,
      form_id: '1816400769736719',
    }),
  });
  console.log('response:', JSON.stringify(await res.json()));

  console.log('\nwatching the lead — reply on WhatsApp and watch the status move.');
  console.log('  greeted → engaged → handed_off\n');

  let last = '';
  for (let i = 0; i < 60; i++) {
    const { data: lead } = await supabase
      .from('bestie_leads')
      .select('status, greeted_at, last_inbound_at, handed_off_at, qualification')
      .eq('leadgen_id', leadgenId)
      .maybeSingle();

    const line = lead
      ? `${lead.status.padEnd(14)} qualification=${JSON.stringify(lead.qualification ?? {})}`
      : '(no lead row yet)';

    if (line !== last) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`); last = line; }
    if (lead?.status === 'handed_off') { console.log('\nhanded off — check the five inboxes.'); return; }

    await new Promise(r => setTimeout(r, 5000));
  }
  console.log('\nstopped watching after 5 minutes.');
}

main().catch(err => { console.error(err); process.exit(1); });
