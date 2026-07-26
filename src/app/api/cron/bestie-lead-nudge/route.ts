/**
 * Hourly follow-up pass over greeted leads.
 *
 * Nudges are templates, not free text — by the time we nudge, the 24h window
 * has long closed.
 *
 * Every branch stamps its timestamp only after a confirmed send. A failed send
 * that stamped anyway would silently skip that lead's entire remaining funnel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { selectNudge } from '@/lib/bestie/nudges';
import { sendLeadNudge } from '@/lib/bestie/lead-greeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function firstNameOf(fullName: string | null): string | null {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0] || null;
}

export async function GET(req: NextRequest) {
  // Vercel cron sends this header; anything else must not be able to fire sends.
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron');
  const secret = process.env.CRON_SECRET;
  const authorized =
    isVercelCron || (secret && req.headers.get('authorization') === `Bearer ${secret}`);
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createClient();
  const now = new Date();

  const { data: leads, error } = await supabase
    .from('bestie_leads')
    .select('id, wa_id, full_name, status, greeted_at, nudge_24h_at, nudge_72h_at, last_inbound_at')
    .eq('status', 'greeted')
    .not('wa_id', 'is', null)
    .limit(200);

  if (error) {
    console.error('[bestie-nudge] query failed', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const counts = { nudged24: 0, nudged72: 0, gaveUp: 0, failed: 0 };

  for (const lead of leads ?? []) {
    const action = selectNudge(lead as any, now);
    if (!action) continue;

    const nowIso = new Date().toISOString();

    if (action === 'give_up') {
      await supabase
        .from('bestie_leads')
        .update({ status: 'unresponsive', updated_at: nowIso })
        .eq('id', lead.id);
      counts.gaveUp++;
      continue;
    }

    const sent = await sendLeadNudge({
      waId: lead.wa_id!,
      firstName: firstNameOf(lead.full_name),
      kind: action,
    });

    if (!sent.success) {
      // Leave the timestamp unset so the next run retries rather than skipping
      // this lead's remaining funnel entirely.
      console.error('[bestie-nudge] send failed', { leadId: lead.id, action });
      counts.failed++;
      continue;
    }

    await supabase
      .from('bestie_leads')
      .update({
        [action === 'nudge_24h' ? 'nudge_24h_at' : 'nudge_72h_at']: nowIso,
        updated_at: nowIso,
      })
      .eq('id', lead.id);

    if (action === 'nudge_24h') counts.nudged24++;
    else counts.nudged72++;
  }

  return NextResponse.json({ ok: true, considered: leads?.length ?? 0, ...counts });
}
