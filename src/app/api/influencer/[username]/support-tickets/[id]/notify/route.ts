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
import { getAgentSession } from '@/lib/auth/agent-auth';
import {
  sendSupportStatusInProgress,
  sendSupportStatusAwaitingCustomer,
  sendSupportStatusShipped,
  sendSupportStatusResolved,
} from '@/lib/whatsapp-notify';
import { ensureReplyToken } from '@/lib/support/reply-token';

// Meta template BODY hard cap is 1024; the resolved template wraps the
// summary with ~120 chars of fixed text + variables, so we leave the
// agent 900 chars of summary headroom and reject earlier with a clear
// message. Source: WHATSAPP_TEMPLATES_SPEC.md.
const RESOLUTION_SUMMARY_MAX = 900;

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

  // Identify the acting agent (if logged in via agent session) so the
  // history row carries the real name rather than the account username.
  const agent = await getAgentSession(username);

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
    .select('id, customer_name, customer_phone, brand, order_number, tracking_number, account_id')
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

  // Mint a reply token for this ticket if it doesn't have one yet.
  // The token gets passed to the template URL button so the customer
  // can hit /reply/<token> from WhatsApp.
  const replyToken = (await ensureReplyToken(ticket.id)) || '';

  let result: Awaited<ReturnType<typeof sendSupportStatusInProgress>>;
  let templateName: string;
  // The same body text we render server-side for the WhatsApp message.
  // We persist it on the history row so the customer-facing reply page
  // can show "the brand sent you: <message>" — the customer should
  // never have to switch between WhatsApp and the reply page to see
  // what was asked.
  let bodyText: string;

  switch (tpl) {
    case 'in_progress':
      templateName = 'support_status_in_progress';
      bodyText =
        `היי ${fname} 👋\n` +
        `הפנייה שלך ל-${brand} (#${code}) התקבלה ואנחנו מטפלים בה כעת ✨\n` +
        `נחזור אליך בהקדם עם עדכון. תודה על הסבלנות 🤍`;
      result = await sendSupportStatusInProgress({
        to: ticket.customer_phone,
        customerFirstName: fname,
        brand,
        ticketShortCode: code,
        replyToken,
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
      bodyText =
        `היי ${fname} 👋\n` +
        `בנוגע לפנייה שלך ל-${brand} (#${code}) — אנחנו צריכים ממך פרט נוסף כדי להמשיך:\n` +
        `${detail}\n\n` +
        `אפשר להגיב כאן בעמוד עם תמונה / טקסט. תודה 🤍`;
      result = await sendSupportStatusAwaitingCustomer({
        to: ticket.customer_phone,
        customerFirstName: fname,
        brand,
        ticketShortCode: code,
        requestedDetail: detail,
        replyToken,
      });
      break;
    }
    case 'shipped': {
      const tracking = (body.trackingNumber || ticket.tracking_number || '').toString().trim();
      const replacementProduct = (body.replacementProduct || '').toString().trim();
      const estimatedDelivery = ((body.estimatedDelivery || '').toString().trim()) || 'תוך 3-5 ימי עסקים';
      if (!tracking) {
        return NextResponse.json(
          { error: 'trackingNumber is required for shipped' },
          { status: 400 },
        );
      }
      if (!replacementProduct) {
        return NextResponse.json(
          { error: 'replacementProduct is required for shipped' },
          { status: 400 },
        );
      }
      // Use the customer-facing Shopify order number (cleaned of '#'
      // prefix) for {{3}} so the customer sees something they
      // recognise. Fall back to the internal ticket short code only if
      // somehow the order_number is missing — better than no value.
      const orderRef = (ticket.order_number || '').replace(/^#+/, '').trim() || code;
      templateName = 'support_status_shipped_v4';
      // Mirrors the body of support_status_shipped_v4 in Meta — keep
      // these in sync.
      bodyText =
        `היי ${fname} 👋\n` +
        `בנוגע להזמנה ${orderRef} ב-${brand} — נשלח אלייך ${replacementProduct} אשר יסופק ${estimatedDelivery}.\n` +
        `מספר משלוח Focus למעקב: ${tracking}\n` +
        `תודה שפנית ל-${brand} 🤍`;
      result = await sendSupportStatusShipped({
        to: ticket.customer_phone,
        customerFirstName: fname,
        brand,
        orderNumber: orderRef,
        replacementProduct,
        estimatedDelivery,
        trackingNumber: tracking,
        replyToken,
      });
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
      if (summary.length > RESOLUTION_SUMMARY_MAX) {
        return NextResponse.json(
          {
            error: 'resolution_summary_too_long',
            limit: RESOLUTION_SUMMARY_MAX,
            length: summary.length,
            message: `סיכום הטיפול ארוך מדי — מקסימום ${RESOLUTION_SUMMARY_MAX} תווים, נשלחו ${summary.length}.`,
          },
          { status: 400 },
        );
      }
      templateName = 'support_status_resolved';
      bodyText =
        `היי ${fname} 👋\n` +
        `הפנייה שלך ל-${brand} (#${code}) טופלה ✅\n` +
        `${summary}\n\n` +
        `אם יש משהו נוסף, אנחנו כאן 🤍`;
      result = await sendSupportStatusResolved({
        to: ticket.customer_phone,
        customerFirstName: fname,
        brand,
        ticketShortCode: code,
        resolutionSummary: summary,
        replyToken,
      });
      break;
    }
    default:
      return NextResponse.json({ error: 'unhandled template' }, { status: 400 });
  }

  // Audit: log the attempt regardless of success — the brand should
  // be able to see "we tried to send X but Meta said Y". Also persist
  // the rendered message body so the reply page can show it to the
  // customer with full context.
  await supabase.from('support_ticket_history').insert({
    ticket_id: ticket.id,
    account_id: influencer.id,
    action: 'customer_notified',
    actor: agent?.display_name || username,
    actor_agent_id: agent?.agent_id || null,
    whatsapp_template_name: templateName,
    whatsapp_message_id: result.wa_message_id || null,
    body_text: bodyText,
    note: result.success
      ? null
      : `Send failed: ${result.error?.message || 'unknown'}`,
  });

  if (result.success) {
    // Auto-transition status when sending a notification — the act of
    // sending the message implies the new state.
    const STATUS_BY_TEMPLATE: Record<TemplateKey, string | null> = {
      in_progress: 'in_progress',
      awaiting_customer: 'awaiting_customer',
      shipped: 'shipped',
      resolved: 'resolved',
    };
    const newStatus = STATUS_BY_TEMPLATE[tpl];
    const update: Record<string, any> = {
      last_customer_notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (newStatus) {
      update.status = newStatus;
      if (newStatus === 'resolved') {
        update.resolved_at = new Date().toISOString();
      }
    }
    await supabase.from('support_requests').update(update).eq('id', ticket.id);

    // Mirror the status change in the audit log too.
    if (newStatus) {
      await supabase.from('support_ticket_history').insert({
        ticket_id: ticket.id,
        account_id: influencer.id,
        action: 'status_change',
        actor: agent?.display_name || username,
    actor_agent_id: agent?.agent_id || null,
        to_status: newStatus,
        note: `auto-transition (sent ${templateName})`,
      });
    }
  }

  return NextResponse.json({
    ok: result.success,
    template: tpl,
    error: result.success ? null : result.error?.message || 'send failed',
    wa_message_id: result.wa_message_id || null,
  });
}
