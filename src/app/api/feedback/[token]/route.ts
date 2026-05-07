/**
 * Feedback page context — public endpoint, token-authenticated.
 *
 * GET /api/feedback/[token] → minimal info the page needs to render:
 *   { brand, order_number, fname, status }
 *
 * Status reflects whether the customer has already responded — UI
 * shows a "כבר ענית, תודה" state instead of the buttons.
 */

import { NextRequest, NextResponse } from 'next/server';
import { findTicketByFeedbackToken } from '@/lib/shipment/feedback-token';

export const runtime = 'nodejs';

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0] || '';
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ticket = await findTicketByFeedbackToken(token);
  if (!ticket) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 404 });
  }
  return NextResponse.json({
    brand: ticket.brand || 'המותג',
    order_number: ticket.order_number || null,
    fname: firstName(ticket.customer_name),
    feedback_status: ticket.feedback_status,
    feedback_responded_at: ticket.feedback_responded_at,
  });
}
