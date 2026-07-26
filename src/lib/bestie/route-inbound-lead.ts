/**
 * The fifth webhook branch: an inbound from someone who filled a Meta lead form.
 *
 * Sits BEFORE customer service. Both branches see an unknown sender, so the
 * discriminator has to be explicit — does this wa_id have a lead session? A lead
 * asking about Bestie is not a shopper asking about a brand, and must not reach
 * the CS brain, which would try to bind them to some client's store.
 *
 * The three "never claims" guards mirror the CS branch. They protect flows that
 * already run in production, which is why they are asserted in tests rather than
 * left to the caller passing the right arguments.
 */
import { sendReaction, sendTyping } from '@/lib/whatsapp-cloud/client';
import { createClient } from '@/lib/supabase/server';
import { enqueueLeadMessage } from '@/lib/bestie/wa-lead-queue';
import { publishLeadDrain } from '@/lib/bestie/wa-lead-publish';

export async function routeInboundToBestieLead(input: {
  waId: string;
  contactId: string | null;
  msg: any;
  textBody: string | null;
  leadId?: string | null;
}): Promise<{ claimed: boolean }> {
  // Instant feedback — fire-and-forget so it adds no latency. 👀 lands first;
  // the worker swaps it once the reply is out. Typing also marks as read.
  if (input.msg?.id) {
    void sendReaction({ to: input.waId, messageId: input.msg.id, emoji: '👀' }).catch(() => {});
    void sendTyping(input.msg.id).catch(() => {});
  }

  try {
    await enqueueLeadMessage({
      waId: input.waId,
      msg: input.msg,
      textBody: input.textBody,
      leadId: input.leadId ?? null,
    });
  } catch (e) {
    // Redis unreachable → we cannot even queue it. Do NOT claim: the message is
    // already in whatsapp_messages, and leaving it unclaimed keeps it visible
    // for manual triage instead of silently swallowing it.
    console.error('[bestie-lead] failed to enqueue', e);
    return { claimed: false };
  }

  // Safely queued. If the wake fails the message is still picked up by the next
  // inbound's drain or the sweep — so never fail the branch on this.
  try { await publishLeadDrain(input.waId); }
  catch (e) { console.error('[bestie-lead] publishLeadDrain failed (queued; next trigger drains)', e); }

  return { claimed: true };
}

export async function maybeRouteBestieLead(args: {
  isItamar: boolean;
  handledAsAgent: boolean;
  ticketId: string | null;
  waId: string;
  contactId: string | null;
  msg: any;
  textBody: string | null;
}): Promise<{ claimed: boolean }> {
  if (args.isItamar || args.handledAsAgent || args.ticketId) return { claimed: false };

  const supabase = createClient();
  const { data: session } = await supabase
    .from('bestie_lead_sessions')
    .select('wa_id, lead_id, bot_paused')
    .eq('wa_id', args.waId)
    .maybeSingle();

  if (!session) return { claimed: false };

  // Handed off: a salesperson owns this thread now. Claim it so customer
  // service does not adopt the conversation, but say nothing — the worst
  // outcome here is a bot talking over the person who took the lead.
  if (session.bot_paused) return { claimed: true };

  return routeInboundToBestieLead({
    waId: args.waId,
    contactId: args.contactId,
    msg: args.msg,
    textBody: args.textBody,
    leadId: session.lead_id,
  });
}
