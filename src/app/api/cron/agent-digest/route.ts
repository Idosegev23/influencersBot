/**
 * Agent morning/weekly digest (spec §4.5E).
 *   - Composes a per-agent digest from the READ-ONLY advisory fact tools.
 *   - Sends it to each active agent's WhatsApp (no buttons — free-form reply).
 *   - Detects stuck signatures + un-priced briefs and queues deduped nudges.
 * `?mode=weekly` switches the digest window/heading; otherwise a morning digest.
 *
 * Auth: CRON_SECRET bearer (mirrors crm-reminders).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { sendText, toWaId } from '@/lib/whatsapp-cloud/client';
import { dispatchDigest, detectStuckSignatures, detectUnpricedBriefs, persistNudge } from '@/lib/crm/agent-nudges';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function verifyCronSecret(req: NextRequest): boolean {
  const h = req.headers.get('authorization');
  return !!h && h === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mode = new URL(req.url).searchParams.get('mode') === 'weekly' ? ('weekly' as const) : ('morning' as const);

  const { data: agents } = await supabaseAdmin
    .from('users')
    .select('id, whatsapp')
    .eq('role', 'agent')
    .eq('status', 'active');

  let sent = 0;
  let nudges = 0;

  for (const a of agents || []) {
    if (!a.whatsapp) continue;
    try {
      const text = await dispatchDigest(supabaseAdmin, a.id, mode);
      await sendText({ to: toWaId(a.whatsapp), body: text });
      sent++;

      for (const s of await detectStuckSignatures(supabaseAdmin, a.id)) {
        await persistNudge(supabaseAdmin, {
          agentId: a.id,
          kind: 'stuck_signature',
          subjectType: 'signature',
          subjectId: s.id,
          payload: { title: s.title, partnershipId: s.partnership_id },
          dedupKey: `stuck:${s.id}`,
        });
        nudges++;
      }

      for (const b of await detectUnpricedBriefs(supabaseAdmin, a.id)) {
        await persistNudge(supabaseAdmin, {
          agentId: a.id,
          kind: 'unpriced_brief',
          subjectType: 'brief',
          subjectId: b.id,
          payload: { subject: b.subject },
          dedupKey: `unpriced:${b.id}`,
        });
        nudges++;
      }
    } catch (e) {
      console.warn('[agent-digest] failed for', a.id, e);
    }
  }

  return NextResponse.json({ ok: true, mode, sent, nudges });
}
