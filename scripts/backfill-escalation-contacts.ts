/**
 * One-time backfill: recover the contact route from escalation tickets that say
 * "אין שום דרך ליצור קשר עם הלקוח/ה" while the customer's phone or email is
 * sitting right there in the conversation the ticket carries.
 *
 * Why they exist: the CS code backstop (cs-agent.ts step 3) handed off BEFORE
 * the tool loop and called the dispatch with no contact fields at all, so every
 * "אני רוצה נציג" filed a ticket with customer_phone = null — even when the
 * shopper had typed her number three messages earlier. Fixed forward by
 * harvestContact + the mirrored gate; this recovers the tickets already filed.
 *
 * Sources, in order of confidence:
 *   1. whatsapp_cs_sessions.context.claimedPhone / .contactEmail — the value the
 *      details form or remember_contact already validated for that same visitor.
 *   2. The USER messages in metadata.escalation.transcript, read through
 *      harvestContact — the same token-based guard the live path now uses, so a
 *      backfilled number is dialable by exactly the same rule.
 *
 * Only NULL columns are ever written; nothing already on a ticket is touched.
 *
 * Run: npx tsx scripts/backfill-escalation-contacts.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { harvestContact, realPhoneOrNull, realEmailOrNull } from '../src/lib/support/contact';

const APPLY = process.argv.includes('--apply');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!);

type Row = { id: string; account_id: string; metadata: any };

async function main() {
  const { data: rows, error } = await supabase
    .from('support_requests')
    .select('id, account_id, metadata')
    .is('customer_phone', null)
    .is('customer_email', null)
    .not('metadata->escalation', 'is', null);
  if (error) throw error;

  // The session store is the higher-confidence source — index it by visitor id once.
  const { data: sessions } = await supabase
    .from('whatsapp_cs_sessions')
    .select('channel_user_id, context');
  const byVisitor = new Map<string, any>((sessions || []).map((s: any) => [s.channel_user_id, s.context || {}]));

  let fromSession = 0, fromTranscript = 0, unrecoverable = 0;
  const patches: Array<{ id: string; patch: Record<string, string>; via: string }> = [];

  for (const r of (rows || []) as Row[]) {
    const esc = r.metadata?.escalation || {};
    const patch: Record<string, string> = {};

    const ctx = byVisitor.get(esc.channel_user_id) || {};
    const sessionPhone = realPhoneOrNull(ctx.claimedPhone);
    const sessionEmail = realEmailOrNull(ctx.contactEmail);
    if (sessionPhone) patch.customer_phone = sessionPhone;
    if (sessionEmail) patch.customer_email = sessionEmail;

    if (!patch.customer_phone || !patch.customer_email) {
      // Only what the CUSTOMER wrote — an assistant line may quote a number the bot read out
      // of an order, which is the brand's own data, not a contact route the shopper offered.
      const said = (Array.isArray(esc.transcript) ? esc.transcript : [])
        .filter((m: any) => m?.role === 'user')
        .map((m: any) => String(m?.content || ''))
        .join('\n');
      const found = harvestContact(said);
      if (!patch.customer_phone && found.phone) patch.customer_phone = found.phone;
      if (!patch.customer_email && found.email) patch.customer_email = found.email;
    }

    if (!Object.keys(patch).length) { unrecoverable++; continue; }
    const via = (sessionPhone || sessionEmail) ? 'session' : 'transcript';
    via === 'session' ? fromSession++ : fromTranscript++;
    patches.push({ id: r.id, patch, via });
  }

  console.log(`scanned ${rows?.length ?? 0} contactless escalation tickets`);
  console.log(`  recoverable from session:    ${fromSession}`);
  console.log(`  recoverable from transcript: ${fromTranscript}`);
  console.log(`  still unreachable:           ${unrecoverable}`);
  for (const p of patches.slice(0, 10)) console.log(`  e.g. ${p.id} ${p.via} ${JSON.stringify(p.patch)}`);

  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply to write.'); return; }

  let written = 0;
  for (const p of patches) {
    const { error: e } = await supabase.from('support_requests').update(p.patch).eq('id', p.id);
    if (e) console.error(`  FAILED ${p.id}`, e.message); else written++;
  }
  console.log(`wrote ${written}/${patches.length} tickets`);
}

main().catch((e) => { console.error(e); process.exit(1); });
