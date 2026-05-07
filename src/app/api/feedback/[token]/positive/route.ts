import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findTicketByFeedbackToken } from '@/lib/shipment/feedback-token';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ticket = await findTicketByFeedbackToken(token);
  if (!ticket) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });

  // Idempotent: if already responded, return ok with the existing status.
  if (ticket.feedback_status === 'positive' || ticket.feedback_status === 'issue') {
    return NextResponse.json({ ok: true, already_responded: true, feedback_status: ticket.feedback_status });
  }

  const now = new Date().toISOString();
  await supabase
    .from('support_requests')
    .update({
      feedback_status: 'positive',
      feedback_responded_at: now,
      status: 'resolved',
      resolved_at: now,
      updated_at: now,
    })
    .eq('id', ticket.id);

  await supabase.from('support_ticket_history').insert({
    ticket_id: ticket.id,
    account_id: ticket.account_id,
    action: 'customer_feedback',
    actor: ticket.customer_name || 'הלקוחה',
    body_text: 'הלקוחה סימנה: הכל מצוין ✓',
    note: 'positive',
  });

  return NextResponse.json({ ok: true, feedback_status: 'positive' });
}
