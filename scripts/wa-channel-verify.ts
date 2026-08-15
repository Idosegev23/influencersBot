/**
 * Live verification that the channel abstraction resolves to a working number.
 * Runs against the real Graph API — deliberately NOT a vitest (tests/setup.ts mocks fetch,
 * so a green vitest against Meta is an illusion; spec §10).
 *
 * Usage: npx tsx scripts/wa-channel-verify.ts [--send <e164-digits>]
 * Requires Node 22 (Supabase Realtime needs native WebSocket).
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const checks: Array<[string, boolean, string]> = [];
function check(name: string, ok: boolean, detail = '') { checks.push([name, ok, detail]); }

async function main() {
  // Dynamic: src/lib/supabase.ts throws at module scope, and imports are hoisted above loadEnv().
  const { getBestieChannel, resolveChannelByPhoneNumberId } = await import('../src/lib/whatsapp-cloud/channels');
  const { sendText } = await import('../src/lib/whatsapp-cloud/client');

  const ch = await getBestieChannel();
  check('getBestieChannel resolves', Boolean(ch.id), ch.id);
  check('token decrypted from Vault', ch.token.length > 50, `len=${ch.token.length}`);
  check('status active', ch.status === 'active', ch.status);

  const byPnid = await resolveChannelByPhoneNumberId(ch.phoneNumberId);
  check('pnid resolves to the same channel', byPnid?.id === ch.id, String(byPnid?.id));

  const unknown = await resolveChannelByPhoneNumberId('000000000000000');
  check('unknown pnid returns null (webhook must still 200)', unknown === null, String(unknown));

  const res = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}/${ch.phoneNumberId}` +
    `?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${ch.token}` } },
  );
  const meta: any = await res.json();
  check('channel token authenticates against Graph', res.ok, JSON.stringify(meta).slice(0, 160));
  check('number matches the stored one',
        meta.display_phone_number === ch.displayPhoneNumber,
        `graph=${meta.display_phone_number} db=${ch.displayPhoneNumber}`);

  const i = process.argv.indexOf('--send');
  const sendTo = i >= 0 ? process.argv[i + 1] : null;
  if (sendTo) {
    const out = await sendText({ to: sendTo, body: 'channel-verify ✅', channel: ch });
    check('live send through the channel', out.success, out.error?.message ?? out.wa_message_id ?? '');
  }

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `  — ${detail}` : ''}`);
    if (!ok) failed++;
  }
  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nAll channel checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
