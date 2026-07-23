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

// Ticket sources OWNED by the Bestie CS bot / handoff engine (not the legacy support flow):
//   • whatsapp_cs     — the per-conversation ticket the CS bot opens (transcript lives in chat_messages)
//   • auto_escalation — the handoff catch-net the escalation engine inserts (status stays 'new'; resumeBot
//                       never resolves it)
// Strategy 3 (bare phone match) must NEVER claim either: while the bot owns the thread it would starve
// runCsTurn (the "stuck" bug), and a lingering auto_escalation ticket would keep sinking messages long
// after the bot is resumed. Strategies 1/2 still route replies to these AFTER a human takes over — they
// key off OUR outbound support_ticket_history rows, which only exist post-takeover (intended).
const BOT_OWNED_SOURCES = new Set(['whatsapp_cs', 'auto_escalation']);

// A bot-owned ticket only leaves the CS bot's hands when a HUMAN genuinely replies on it. These are
// the human-takeover history actions; an automated `customer_notified` status ping is NOT one of them.
// (Live-observed 2026-07-23: an awaiting_customer status template on a CS ticket created a
// customer_notified outbound row, and Strategy 2 then routed the shopper's next message to the ticket
// instead of the bot — silent no-response. So bot-owned tickets match Strategies 1/2 ONLY on a human action.)
const HUMAN_TAKEOVER = new Set(['agent_message', 'agent_image']);

type MatchedBy = 'context' | 'recent_outbound' | 'phone';
type Alternative = {
  ticket_id: string;
  account_id: string;
  brand: string | null;
  customer_name: string | null;
  last_outbound_at: string;
};
type RoutingMeta = {
  matched_by: MatchedBy;
  ambiguous: boolean;
  alternatives: Alternative[];
};

export async function routeInboundToTicket(
  input: RouteInput,
): Promise<{ ticketId: string | null; matchedBy: MatchedBy | null; ambiguous?: boolean }> {
  // Pull recent outbound activity to this phone up front — used both
  // for Strategy 2 routing AND to detect cross-account ambiguity for
  // strategies 1/3. Joining support_requests gives us customer_phone
  // (so we can filter by toWaId match) and brand/customer_name for the
  // alternatives list shown in the UI banner.
  const sinceIso = new Date(Date.now() - RECENT_OUTBOUND_WINDOW_MS).toISOString();
  const { data: rawOutbounds } = await supabase
    .from('support_ticket_history')
    .select(
      'ticket_id, account_id, created_at, action, support_requests!inner(customer_phone, brand, customer_name, source)',
    )
    .in('action', ['customer_notified', 'agent_message', 'agent_image'])
    .not('whatsapp_message_id', 'is', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(80);

  // Filter to outbounds that match this phone, dedup per ticket (keep
  // the most recent outbound per ticket_id since the array is already
  // ordered by created_at desc). Bot-owned tickets are excluded unless a HUMAN
  // took over (see HUMAN_TAKEOVER) — an automated customer_notified must not steal the thread.
  const recentByTicket = new Map<string, Alternative>();
  for (const r of (rawOutbounds || []) as any[]) {
    const phone = r.support_requests?.customer_phone;
    if (!phone || toWaId(phone) !== input.waId) continue;
    if (BOT_OWNED_SOURCES.has(r.support_requests?.source) && !HUMAN_TAKEOVER.has(r.action)) continue;
    if (!recentByTicket.has(r.ticket_id)) {
      recentByTicket.set(r.ticket_id, {
        ticket_id: r.ticket_id,
        account_id: r.account_id,
        brand: r.support_requests?.brand ?? null,
        customer_name: r.support_requests?.customer_name ?? null,
        last_outbound_at: r.created_at,
      });
    }
  }
  const recentList = [...recentByTicket.values()];
  const distinctAccounts = new Set(recentList.map((r) => r.account_id));

  function buildMeta(matchedBy: MatchedBy, chosenTicketId: string): RoutingMeta {
    const ambiguous = distinctAccounts.size > 1;
    const alternatives = recentList.filter((r) => r.ticket_id !== chosenTicketId);
    return { matched_by: matchedBy, ambiguous, alternatives };
  }

  // ── Strategy 1: thread by context.id ─────────────────────────────────
  if (input.contextId) {
    const { data: histRow } = await supabase
      .from('support_ticket_history')
      .select('ticket_id, account_id, action, support_requests!inner(source)')
      .eq('whatsapp_message_id', input.contextId)
      .maybeSingle();

    // Skip a bot-owned ticket the shopper replied to UNLESS a human took it over — else the CS bot owns it.
    const botOwnedNoTakeover = histRow
      && BOT_OWNED_SOURCES.has((histRow as any).support_requests?.source)
      && !HUMAN_TAKEOVER.has((histRow as any).action);
    if (histRow?.ticket_id && !botOwnedNoTakeover) {
      // context.id is deterministic — even when other brands have
      // outbounds in the window, ambiguous=false here.
      const meta: RoutingMeta = {
        matched_by: 'context',
        ambiguous: false,
        alternatives: recentList.filter((r) => r.ticket_id !== histRow.ticket_id),
      };
      await applyReply(histRow.ticket_id, histRow.account_id, input, meta);
      return { ticketId: histRow.ticket_id, matchedBy: 'context', ambiguous: false };
    }
  }

  // ── Strategy 2: most recent outbound from us to this phone ──────────
  // Most replies arrive within minutes of the outbound. Pick the most
  // recent (recentList is sorted desc) — flag as ambiguous when there's
  // outbound activity from a different account in the same window.
  if (recentList.length > 0) {
    const top = recentList[0];
    const meta = buildMeta('recent_outbound', top.ticket_id);
    await applyReply(top.ticket_id, top.account_id, input, meta);
    return { ticketId: top.ticket_id, matchedBy: 'recent_outbound', ambiguous: meta.ambiguous };
  }

  // ── Strategy 3: most recent non-terminal ticket for this phone ──────
  // EXCLUDE bot-owned ticket sources (BOT_OWNED_SOURCES: whatsapp_cs + auto_escalation) — see that
  // constant's comment. A bare phone match on either would starve the CS bot (the "stuck" bug) or
  // sink messages into a stale escalation ticket. Skipping them lets the webhook fall through to the
  // CS 4th branch (maybeRouteCs). Strategies 1/2 above are unaffected: they key off our OUTBOUND
  // rows in support_ticket_history, which a CS/handoff thread only gains once a human takes it over.
  const { data: candidates } = await supabase
    .from('support_requests')
    .select('id, account_id, customer_phone, status, updated_at, source')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (candidates) {
    const ticket = candidates.find(
      (t) =>
        t.customer_phone &&
        toWaId(t.customer_phone) === input.waId &&
        !BOT_OWNED_SOURCES.has(t.source) &&
        !TERMINAL_STATUSES.has(t.status),
    );
    if (ticket) {
      const meta = buildMeta('phone', ticket.id);
      await applyReply(ticket.id, ticket.account_id, input, meta);
      return { ticketId: ticket.id, matchedBy: 'phone', ambiguous: meta.ambiguous };
    }
  }

  return { ticketId: null, matchedBy: null };
}

async function applyReply(
  ticketId: string,
  accountId: string,
  input: RouteInput,
  routingMeta: RoutingMeta,
): Promise<void> {
  await supabase.from('support_ticket_history').insert({
    ticket_id: ticketId,
    account_id: accountId,
    action: 'customer_reply',
    actor: 'customer',
    note: input.textBody,
    body_text: input.textBody,
    whatsapp_message_id: input.waMessageId,
    routing_meta: routingMeta,
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
