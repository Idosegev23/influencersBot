/**
 * Free-form WhatsApp text from the agent to the customer.
 *
 * Only allowed within Meta's 24-hour customer service window. Outside
 * the window we return 409 with a clear message telling the agent to
 * send a status template instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getAgentSession } from '@/lib/auth/agent-auth';
import { sendText } from '@/lib/whatsapp-cloud/client';
import { getServiceWindow } from '@/lib/support/service-window';

export const runtime = 'nodejs';

const MAX_BODY = 4000; // WhatsApp text body cap is 4096

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await ctx.params;

  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  if (!isInfluencer && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const messageBody = (body?.body || '').toString().trim();
  if (!messageBody) {
    return NextResponse.json({ error: 'empty_body', message: 'הודעה ריקה' }, { status: 400 });
  }
  if (messageBody.length > MAX_BODY) {
    return NextResponse.json(
      { error: 'too_long', limit: MAX_BODY, message: `הודעה ארוכה מדי — מקסימום ${MAX_BODY} תווים` },
      { status: 400 },
    );
  }

  const { data: ticket } = await supabase
    .from('support_requests')
    .select('id, customer_phone')
    .eq('id', id)
    .eq('account_id', influencer.id)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!ticket.customer_phone) {
    return NextResponse.json({ error: 'no_phone', message: 'אין טלפון לפנייה הזו' }, { status: 400 });
  }

  const window = await getServiceWindow(influencer.id, ticket.customer_phone);
  if (!window.withinWindow) {
    return NextResponse.json(
      {
        error: 'window_closed',
        message:
          'חלון 24 שעות סגור — הלקוחה לא הגיבה ב-24 שעות האחרונות. שלחי תבנית סטטוס במקום.',
        window,
      },
      { status: 409 },
    );
  }

  const agent = await getAgentSession(username);

  const result = await sendText({ to: ticket.customer_phone, body: messageBody });

  await supabase.from('support_ticket_history').insert({
    ticket_id: ticket.id,
    account_id: influencer.id,
    action: 'agent_message',
    actor: agent?.display_name || username,
    actor_agent_id: agent?.agent_id || null,
    body_text: messageBody,
    whatsapp_message_id: result.wa_message_id || null,
    note: result.success ? null : `Send failed: ${result.error?.message || 'unknown'}`,
  });

  if (result.success) {
    await supabase
      .from('support_requests')
      .update({
        last_customer_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id);
  }

  return NextResponse.json({
    ok: result.success,
    error: result.success ? null : result.error?.message || 'send_failed',
    wa_message_id: result.wa_message_id || null,
  });
}
