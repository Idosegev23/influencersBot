/**
 * Send a WhatsApp template to the customer about their ticket.
 *
 * POST /api/influencer/[username]/support-tickets/[id]/notify
 *   body: {
 *     template: 'in_progress' | 'awaiting_customer' | 'shipped' | 'resolved',
 *     // optional fields per template:
 *     requestedDetail?: string,    // awaiting_customer
 *     whatWasShipped?: string,     // shipped
 *     trackingNumber?: string,     // shipped (also persisted on the ticket)
 *     resolutionSummary?: string,  // resolved
 *   }
 *
 * Behaviour:
 *   - Only the brand-admin (or platform admin) can call this.
 *   - The ticket must have a customer_phone.
 *   - Resolves customer first name from customer_name (split on whitespace).
 *   - Generates a short ticket code from the UUID prefix for human reference.
 *   - Records the dispatch in support_ticket_history (action='customer_notified')
 *     so it shows up in the audit log even if the WhatsApp template is
 *     PENDING / disabled — the brand sees what they tried to send.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import {
  sendSupportStatusInProgress,
  sendSupportStatusAwaitingCustomer,
  sendSupportStatusShipped,
  sendSupportStatusResolved,
} from '@/lib/whatsapp-notify';

export const runtime = 'nodejs';

const TEMPLATE_KEYS = ['in_progress', 'awaiting_customer', 'shipped', 'resolved'] as const;
type TemplateKey = (typeof TEMPLATE_KEYS)[number];

function shortCode(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return 'לקוחה';
  return fullName.trim().split(/\s+/)[0] || 'לקוחה';
}

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
  if (!influencer) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const tpl = body.template as TemplateKey;
  if (!TEMPLATE_KEYS.includes(tpl)) {
    return NextResponse.json({ error: 'invalid template' }, { status: 400 });
  }

  const { data: ticket } = await supabase
    .from('support_requests')
    .select('id, customer_name, customer_phone, brand, tracking_number, account_id')
    .eq('id', id)
    .eq('account_id', influencer.id)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: 'ticket not found' }, { status: 404 });
  if (!ticket.customer_phone) {
    return NextResponse.json({ error: 'ticket has no customer phone' }, { status: 400 });
  }

  const fname = firstName(ticket.customer_name);
  const brand = ticket.brand || influencer.display_name || 'המותג';
  const code = shortCode(ticket.id);

  let result: Awaited<ReturnType<typeof sendSupportStatusInProgress>>;
  let templateName: string;

  switch (tpl) {
    case 'in_progress':
      templateName = 'support_status_in_progress';
      result = await sendSupportStatusInProgress({
        to: ticket.customer_phone,
        customerFirstName: fname,
        brand,
        ticketShortCode: code,
      });
      break;
    case 'awaiting_customer': {
      const detail = (body.requestedDetail || '').toString().trim();
      if (!detail) {
        return NextResponse.json(
          { error: 'requestedDetail is required for awaiting_customer' },
          { status: 400 },
        );
      }
      templateName = 'support_status_awaiting_customer';
      result = await sendSupportStatusAwaitingCustomer({
        to: ticket.customer_phone,
        customerFirstName: fname,
        brand,
        ticketShortCode: code,
        requestedDetail: detail,
      });
      break;
    }
    case 'shipped': {
      const what = (body.whatWasShipped || 'מוצר חלופי').toString().trim();
      const tracking = (body.trackingNumber || ticket.tracking_number || '').toString().trim();
      if (!tracking) {
        return NextResponse.json(
          { error: 'trackingNumber is required for shipped' },
          { status: 400 },
        );
      }
      templateName = 'support_status_shipped';
      result = await sendSupportStatusShipped({
        to: ticket.customer_phone,
        customerFirstName: fname,
        brand,
        ticketShortCode: code,
        whatWasShipped: what,
        trackingNumber: tracking,
      });
      // Persist tracking on the ticket so subsequent shipped notifications
      // can default to it without the brand having to retype.
      if (tracking !== (ticket.tracking_number || '')) {
        await supabase
          .from('support_requests')
          .update({ tracking_number: tracking, updated_at: new Date().toISOString() })
          .eq('id', ticket.id);
      }
      break;
    }
    case 'resolved': {
      const summary = (body.resolutionSummary || 'הטיפול הושלם.').toString().trim();
      templateName = 'support_status_resolved';
      result = await sendSupportStatusResolved({
        to: ticket.customer_phone,
        customerFirstName: fname,
        brand,
        ticketShortCode: code,
        resolutionSummary: summary,
      });
      break;
    }
    default:
      return NextResponse.json({ error: 'unhandled template' }, { status: 400 });
  }

  // Audit: log the attempt regardless of success — the brand should
  // be able to see "we tried to send X but Meta said Y".
  await supabase.from('support_ticket_history').insert({
    ticket_id: ticket.id,
    account_id: influencer.id,
    action: 'customer_notified',
    actor: username,
    whatsapp_template_name: templateName,
    whatsapp_message_id: result.wa_message_id || null,
    note: result.success
      ? null
      : `Send failed: ${result.error?.message || 'unknown'}`,
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
    template: tpl,
    error: result.success ? null : result.error?.message || 'send failed',
    wa_message_id: result.wa_message_id || null,
  });
}
