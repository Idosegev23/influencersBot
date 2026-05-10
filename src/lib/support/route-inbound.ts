/**
 * Match an inbound WhatsApp message to a support ticket and append it
 * to the ticket history.
 *
 * Strategy:
 *   1. If the inbound carries `context.id` (i.e. the customer tapped
 *      "reply" on a previous outbound), look up the originating outbound
 *      in `support_ticket_history.whatsapp_message_id`. That gives us
 *      the exact ticket — multi-tenant safe even if the customer has
 *      open tickets with multiple brands.
 *   2. Otherwise fall back to the most recently updated, non-terminal
 *      ticket whose customer_phone normalises to the same wa_id. Works
 *      well when only one brand is actively messaging this customer.
 *
 * Side effects on a successful match:
 *   • inserts a `customer_reply` row in support_ticket_history
 *   • bumps the ticket's updated_at, flips awaiting_customer/new back
 *     to in_progress so the brand sees a fresh ticket
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

export async function routeInboundToTicket(
  input: RouteInput,
): Promise<{ ticketId: string | null; matchedBy: 'context' | 'phone' | null }> {
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

  // ── Strategy 2: most recent non-terminal ticket for this phone ───────
  // Pull a small window of recent tickets and filter in JS — phones in
  // the DB are stored in inconsistent formats (with/without country
  // code, with/without leading +) so we normalise both sides via
  // toWaId() and compare. Fast enough: we cap at the 20 most recent.
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
