/**
 * Re-attach a misrouted history row to a different ticket.
 *
 * Used by the UI ambiguity banner: when the route-inbound heuristic
 * picks the wrong ticket (because two brands sent outbounds to the same
 * phone in the same 24h window), the agent can click an alternative
 * ticket and we move the customer_reply row over.
 *
 * Auth model:
 *   • Influencer admin (current account) can move within their account.
 *   • Cross-account moves require a platform admin session — a brand
 *     admin can't yank a reply out of another brand's ticket.
 *
 * Idempotent: re-running with the same args is safe (the row already
 * lives on the target ticket).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getAgentSession } from '@/lib/auth/agent-auth';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ username: string }> },
) {
  const { username } = await ctx.params;

  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  if (!isInfluencer && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const historyId = (body?.historyId || '').toString();
  const targetTicketId = (body?.targetTicketId || '').toString();
  if (!historyId || !targetTicketId) {
    return NextResponse.json({ error: 'historyId and targetTicketId required' }, { status: 400 });
  }

  // Load the history row + target ticket so we can authorise the move
  // and snapshot the original ticket for the audit note.
  const [{ data: histRow }, { data: targetTicket }] = await Promise.all([
    supabase
      .from('support_ticket_history')
      .select('id, ticket_id, account_id, action')
      .eq('id', historyId)
      .maybeSingle(),
    supabase
      .from('support_requests')
      .select('id, account_id, brand, customer_name')
      .eq('id', targetTicketId)
      .maybeSingle(),
  ]);

  if (!histRow) return NextResponse.json({ error: 'history_not_found' }, { status: 404 });
  if (!targetTicket) return NextResponse.json({ error: 'target_not_found' }, { status: 404 });

  // Only customer_reply rows can be re-attached today — moving a
  // template send (customer_notified) would split the audit trail
  // weirdly. Easy to relax later if we hit a real case.
  if (histRow.action !== 'customer_reply') {
    return NextResponse.json(
      { error: 'unsupported_action', message: 'אפשר להעביר רק תגובות לקוחה' },
      { status: 400 },
    );
  }

  // Authorisation: brand-admin can only move within their own account.
  // Platform admins can move across accounts.
  const sourceAccountId = histRow.account_id;
  const targetAccountId = targetTicket.account_id;
  const crossAccount = sourceAccountId !== targetAccountId;
  if (crossAccount && !isAdmin) {
    return NextResponse.json(
      {
        error: 'forbidden_cross_account',
        message: 'העברה בין מותגים שונים דורשת אדמין מערכת',
      },
      { status: 403 },
    );
  }
  // Same-account move: ensure both tickets belong to the authed influencer.
  if (!crossAccount && sourceAccountId !== influencer.id && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const fromTicketId = histRow.ticket_id;

  // Move the row. account_id flips too when cross-account so RLS / future
  // queries on `account_id = X` see it under the right brand.
  const { error: moveErr } = await supabase
    .from('support_ticket_history')
    .update({
      ticket_id: targetTicketId,
      account_id: targetAccountId,
    })
    .eq('id', historyId);

  if (moveErr) {
    console.error('[move-history] update failed:', moveErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Audit trail: leave a marker on BOTH tickets so the chronology
  // remains intelligible.
  const agent = await getAgentSession(username);
  const actor = agent?.display_name || (isAdmin ? 'platform_admin' : username);

  await supabase.from('support_ticket_history').insert([
    {
      ticket_id: fromTicketId,
      account_id: sourceAccountId,
      action: 'reply_moved_out',
      actor,
      actor_agent_id: agent?.agent_id || null,
      note: `הועברה לטיקט ${targetTicketId}`,
    },
    {
      ticket_id: targetTicketId,
      account_id: targetAccountId,
      action: 'reply_moved_in',
      actor,
      actor_agent_id: agent?.agent_id || null,
      note: `הועברה מטיקט ${fromTicketId}`,
    },
  ]);

  // Bump updated_at on both tickets.
  const nowIso = new Date().toISOString();
  await Promise.all([
    supabase.from('support_requests').update({ updated_at: nowIso }).eq('id', fromTicketId),
    supabase.from('support_requests').update({ updated_at: nowIso }).eq('id', targetTicketId),
  ]);

  return NextResponse.json({ ok: true, fromTicketId, targetTicketId });
}
