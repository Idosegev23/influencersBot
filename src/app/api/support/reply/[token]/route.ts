/**
 * Public reply API for customers responding to a brand's WhatsApp
 * notification. The token comes from the URL button on the template.
 *
 * GET   — fetches a customer-safe view of the ticket so the page can
 *         show "Hi <name>, your ticket #<code> with <brand>".
 * POST  — accepts a reply (text + optional attachment URL) and stores
 *         it as a support_ticket_history row with action='customer_reply'.
 *         No auth — the token IS the auth.
 *
 * Rate limit: 5 replies / 5 minutes / token (cheap, prevents spam from
 * a leaked link).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sanitizeHtml } from '@/lib/sanitize';
import { findTicketByReplyToken } from '@/lib/support/reply-token';

export const runtime = 'nodejs';

function shortCode(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 6).toUpperCase();
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ticket = await findTicketByReplyToken(token);
  if (!ticket) {
    return NextResponse.json({ error: 'invalid token' }, { status: 404 });
  }

  // Pull the latest brand→customer notification so the page can show
  // exactly what was asked of the customer (e.g. "send a photo of the
  // damaged product"). Without this the reply page is generic and the
  // customer has to dig through WhatsApp to remember what was asked.
  const { data: latestNotif } = await supabase
    .from('support_ticket_history')
    .select('action, body_text, whatsapp_template_name, created_at')
    .eq('ticket_id', ticket.id)
    .eq('action', 'customer_notified')
    .not('body_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Public view — strip internal fields
  return NextResponse.json({
    ticket: {
      id: ticket.id,
      shortCode: shortCode(ticket.id),
      customer_name: ticket.customer_name,
      brand: ticket.brand,
      order_number: ticket.order_number,
      original_message: ticket.message,
      status: ticket.status,
      created_at: ticket.created_at,
      last_customer_notified_at: ticket.last_customer_notified_at,
      tracking_number: ticket.tracking_number,
    },
    latestMessage: latestNotif
      ? {
          body: latestNotif.body_text,
          template: latestNotif.whatsapp_template_name,
          sent_at: latestNotif.created_at,
        }
      : null,
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ticket = await findTicketByReplyToken(token);
  if (!ticket) {
    return NextResponse.json({ error: 'invalid token' }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const text = sanitizeHtml(String(body?.text || '')).trim().slice(0, 4000);
  if (!text) {
    return NextResponse.json({ error: 'empty reply' }, { status: 400 });
  }

  const attachmentUrl =
    typeof body?.attachmentUrl === 'string' && /^https?:\/\//.test(body.attachmentUrl)
      ? body.attachmentUrl.slice(0, 1024)
      : null;
  const attachmentFilename =
    typeof body?.attachmentFilename === 'string'
      ? body.attachmentFilename.replace(/[<>"\\]/g, '').slice(0, 200)
      : null;

  const { error: histErr } = await supabase.from('support_ticket_history').insert({
    ticket_id: ticket.id,
    account_id: ticket.account_id,
    action: 'customer_reply',
    actor: 'customer',
    note: text,
    attachment_url: attachmentUrl,
    attachment_filename: attachmentFilename,
  });

  if (histErr) {
    console.error('[reply POST] history insert failed:', histErr);
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }

  // Bump updated_at + flip status from awaiting_customer back to in_progress
  // so the brand sees a new "live" ticket. If the ticket is in a
  // terminal status (resolved/closed/cancelled) we leave it alone — a
  // late reply shouldn't reopen a closed ticket silently.
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (ticket.status === 'awaiting_customer' || ticket.status === 'new') {
    updates.status = 'in_progress';
  }
  await supabase.from('support_requests').update(updates).eq('id', ticket.id);

  return NextResponse.json({ ok: true });
}
