/**
 * Match an inbound WhatsApp message to a support ticket and append it
 * to the ticket history.
 *
 * Strategy (in order — first hit wins):
 *   1. context.id — customer tapped "reply" on a previous outbound. We
 *      look up the originating outbound in support_ticket_history and
 *      get the exact ticket. Multi-tenant safe.
 *   2. recent-outbound — find the most recent outbound message we sent
 *      to this phone in the last 24h, regardless of ticket status.
 *      Most replies arrive within minutes of the outbound; this catches
 *      them even when the ticket is already resolved (a late "thanks"
 *      or follow-up question).
 *   3. open-ticket — fall back to the most recently updated non-terminal
 *      ticket for this phone. Catches cold-start replies when the
 *      customer types out of nowhere.
 *
 * Side effects on a successful match:
 *   • inserts a `customer_reply` row in support_ticket_history
 *   • bumps the ticket's updated_at, flips awaiting_customer/new back
 *     to in_progress so the brand sees a fresh ticket. Resolved/closed
 *     stays put — a late reply shouldn't silently revive a closed
 *     ticket; the customer_reply row is enough signal.
 *   • upserts the wa_contact's account_id so getServiceWindow() can
 *     find the conversation per-account
 *
 * Returns the matched ticket id (or null when nothing matched — the
 * inbound is still in whatsapp_messages for manual triage).
 */

import { supabase } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

interface RouteInput {
  waId: string;            // sender's WhatsApp id (digits, e.g. "972501234567")
  textBody: string | null; // text payload
  contextId?: string | null; // wa_message_id of the message being replied to
  waMessageId: string;       // inbound message id (for traceability)
  contactId?: string;        // whatsapp_contacts.id (so we can stamp account_id)
}

const TERMINAL_STATUSES = new Set(['resolved', 'closed', 'cancelled']);
const RECENT_OUTBOUND_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function routeInboundToTicket(
  input: RouteInput,
): Promise<{ ticketId: string | null; matchedBy: 'context' | 'recent_outbound' | 'phone' | null }> {
  // ── Strategy 1: thread by context.id ─────────────────────────────────
  if (input.contextId) {
    const { data: histRow } = await supabase
      .from('support_ticket_history')
      .select('ticket_id, account_id')
      .eq('whatsapp_message_id', input.contextId)
      .maybeSingle();

    if (histRow?.ticket_id) {
      await applyReply(histRow.ticket_id, histRow.account_id, input);
      return { ticketId: histRow.ticket_id, matchedBy: 'context' };
    }
  }

  // ── Strategy 2: most recent outbound from us to this phone ──────────
  // Look up our own outbound history rows for this phone (any ticket,
  // any status) within the last 24h. Whatsapp_message_id on the row
  // proves it was a real send. The most recent one is overwhelmingly
  // likely to be what the customer is replying to.
  const sinceIso = new Date(Date.now() - RECENT_OUTBOUND_WINDOW_MS).toISOString();
  const { data: recentOutbounds } = await supabase
    .from('support_ticket_history')
    .select('ticket_id, account_id, created_at, support_requests!inner(customer_phone)')
    .in('action', ['customer_notified', 'agent_message', 'agent_image'])
    .not('whatsapp_message_id', 'is', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(50);

  if (recentOutbounds) {
    const match = recentOutbounds.find((r: any) => {
      const phone = r.support_requests?.customer_phone;
      return phone && toWaId(phone) === input.waId;
    });
    if (match) {
      await applyReply(match.ticket_id, match.account_id, input);
      return { ticketId: match.ticket_id, matchedBy: 'recent_outbound' };
    }
  }

  // ── Strategy 3: most recent non-terminal ticket for this phone ──────
  // Cold-start reply with no recent outbound from us. Phones are stored
  // in inconsistent formats (with/without country code) so we normalise
  // both sides via toWaId() and compare in JS.
  const { data: candidates } = await supabase
    .from('support_requests')
    .select('id, account_id, customer_phone, status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (candidates) {
    const ticket = candidates.find(
      (t) =>
        t.customer_phone &&
        toWaId(t.customer_phone) === input.waId &&
        !TERMINAL_STATUSES.has(t.status),
    );
    if (ticket) {
      await applyReply(ticket.id, ticket.account_id, input);
      return { ticketId: ticket.id, matchedBy: 'phone' };
    }
  }

  return { ticketId: null, matchedBy: null };
}

async function applyReply(
  ticketId: string,
  accountId: string,
  input: RouteInput,
): Promise<void> {
  await supabase.from('support_ticket_history').insert({
    ticket_id: ticketId,
    account_id: accountId,
    action: 'customer_reply',
    actor: 'customer',
    note: input.textBody,
    body_text: input.textBody,
    whatsapp_message_id: input.waMessageId,
  });

  // Reopen if awaiting/new — terminal statuses are left alone so a late
  // reply doesn't silently revive a closed ticket.
  const { data: ticket } = await supabase
    .from('support_requests')
    .select('status')
    .eq('id', ticketId)
    .maybeSingle();

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (ticket && (ticket.status === 'awaiting_customer' || ticket.status === 'new')) {
    updates.status = 'in_progress';
  }
  await supabase.from('support_requests').update(updates).eq('id', ticketId);

  // Stamp account_id on the wa_contact so getServiceWindow finds the
  // conversation. The contacts table has a unique on wa_id, so we never
  // create rows here — only update the existing one.
  if (input.contactId) {
    await supabase
      .from('whatsapp_contacts')
      .update({ account_id: accountId })
      .eq('id', input.contactId)
      .is('account_id', null);
  }
}
