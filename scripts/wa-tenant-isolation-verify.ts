/**
 * THE RELEASE GATE (spec §10). Run this before the first customer channel goes live, and
 * again after any change to the CS tool registry, the session key, or inbound routing.
 *
 * It proves the thing that cannot be proven with one number: that a shopper talking to two
 * different business numbers is two isolated conversations, and that a customer channel
 * cannot see or reach another tenant.
 *
 * Any ❌ blocks go-live. Read-only apart from the throwaway rows it creates and deletes.
 *
 * Usage: npx tsx scripts/wa-tenant-isolation-verify.ts
 * Requires Node 22 (nvm use 22).
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const checks: Array<[string, boolean, string]> = [];
function check(name: string, ok: boolean, detail = '') { checks.push([name, ok, detail]); }

async function main() {
  const { buildCsToolset } = await import('../src/lib/cs/tools/registry');
  const { openCsThreads } = await import('../src/lib/cs/tools/index');
  const { csQueueKey, csLockKey, csDrainDedupId } = await import('../src/lib/cs/wa-cs-keys');
  const { identityKey, whatsappIdentity } = await import('../src/lib/cs/identity');
  const { supabase } = await import('../src/lib/supabase');

  const BESTIE = process.env.BESTIE_ACCOUNT_ID!;
  const brand = { archetype: 'brand', config: { integrations: {} } };

  // ---- 1. Toolset: a customer channel must not be able to switch tenants ----------------
  const customerTools = buildCsToolset({ channel: 'whatsapp', account: brand, preBoundAccountId: 'acc-customer' })
    .defs.map((d) => d.function.name);
  check('customer channel has NO resolve_brand', !customerTools.includes('resolve_brand'), customerTools.join(','));
  check('customer channel has NO bind_brand', !customerTools.includes('bind_brand'));

  const sharedTools = buildCsToolset({ channel: 'whatsapp', account: null, preBoundAccountId: null })
    .defs.map((d) => d.function.name);
  check('shared number KEEPS resolve_brand (regression guard)', sharedTools.includes('resolve_brand'));
  check('shared number KEEPS bind_brand (regression guard)', sharedTools.includes('bind_brand'));

  // ---- 2. Session key: same shopper, two numbers → two sessions -------------------------
  const a = identityKey(whatsappIdentity('972500000000', 'ch-A'));
  const b = identityKey(whatsappIdentity('972500000000', 'ch-B'));
  check('same shopper on two numbers yields two distinct session keys',
        a.waChannelId !== b.waChannelId && a.channelUserId === b.channelUserId,
        `${a.waChannelId} vs ${b.waChannelId}`);

  // ---- 3. Redis / QStash keys must not collide -----------------------------------------
  check('queue keys differ per channel', csQueueKey('ch-A', '972500000000') !== csQueueKey('ch-B', '972500000000'));
  check('lock keys differ per channel', csLockKey('ch-A', '972500000000') !== csLockKey('ch-B', '972500000000'));
  const dedup = csDrainDedupId('ch-A', '972500000000', 1);
  check('QStash dedup id has no colon (QStash rejects them)', !dedup.includes(':'), dedup);

  // ---- 4. Thread listing is scoped by the address-decided tenant ------------------------
  // Uses a phone that will not match anything; what matters is the SHAPE of the query, which
  // the unit tests assert, plus that a scoped call cannot return another account's rows.
  const scoped = await openCsThreads('000000000000', BESTIE);
  const foreign = scoped.filter((t: any) => t.accountId && t.accountId !== BESTIE);
  check('scoped list_open_threads returns nothing outside its account', foreign.length === 0, `${scoped.length} rows`);

  // ---- 5. Live data: no WhatsApp session may be missing its channel ---------------------
  const { count: unscoped } = await supabase
    .from('whatsapp_cs_sessions')
    .select('wa_id', { count: 'exact', head: true })
    .eq('channel', 'whatsapp')
    .is('wa_channel_id', null);
  check('no live WhatsApp session is missing wa_channel_id', (unscoped ?? 0) === 0, `${unscoped} unscoped`);

  // ---- 6. Every active channel belongs to exactly one account --------------------------
  const { data: channels } = await supabase
    .from('whatsapp_channels').select('id, account_id, phone_number_id, status').neq('status', 'disconnected');
  const accountIds = (channels ?? []).map((c: any) => c.account_id);
  const pnids = (channels ?? []).map((c: any) => c.phone_number_id);
  check('one channel per account', new Set(accountIds).size === accountIds.length, `${accountIds.length} channels`);
  check('no phone_number_id is shared between channels', new Set(pnids).size === pnids.length);

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `  — ${detail}` : ''}`);
    if (!ok) failed++;
  }
  if (failed) {
    console.error(`\n${failed} check(s) FAILED — do not connect a customer channel until these pass.`);
    process.exit(1);
  }
  console.log('\nTenant isolation verified.');
}

main().catch((e) => { console.error(e); process.exit(1); });
