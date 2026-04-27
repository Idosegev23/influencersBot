/**
 * Match an inbound WhatsApp message from Itamar back to the Bestie
 * chat session it belongs to, and inject the reply into the visitor's
 * chat with proper "personal" attribution.
 *
 * Matching priority:
 *   1. Quote-reply (msg.context.id === last_outbound_wa_message_id)
 *   2. Leading "[#REFCODE]" or "#REFCODE" tag in the body
 *   3. Most recent `forwarded` handoff for this phone within 24h
 *
 * Returns whether we routed the message (true = handled as Itamar reply).
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface InboundContext {
  fromWaId: string;          // Itamar's number, no '+'
  text: string;              // body text
  contextWaMessageId?: string; // msg.context.id if quote-reply
  waMessageId: string;       // inbound message id
  sentAt?: string;           // ISO timestamp from webhook
}

const TAG_RE = /^\s*\[?#([A-Z0-9]{4})\]?[\s:.,-]*/i;

function digitsOnly(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

function getItamarPhones(): Set<string> {
  const phones: string[] = [];
  if (process.env.ITAMAR_WHATSAPP_NUMBER) phones.push(process.env.ITAMAR_WHATSAPP_NUMBER);
  if (process.env.HANDOFF_ALLOWED_NUMBERS) {
    phones.push(
      ...process.env.HANDOFF_ALLOWED_NUMBERS.split(',').map((s) => s.trim()).filter(Boolean),
    );
  }
  return new Set(phones.map(digitsOnly).filter(Boolean));
}

export function isItamarSender(fromWaId: string): boolean {
  const allowed = getItamarPhones();
  return allowed.has(digitsOnly(fromWaId));
}

export async function processItamarReply(ctx: InboundContext): Promise<boolean> {
  const supabase = getSupabase();

  // Try matchers in order
  let handoff:
    | {
        id: string;
        session_id: string;
        ref_code: string;
        account_id: string;
        target_name: string | null;
      }
    | null = null;

  // 1. Quote-reply
  if (ctx.contextWaMessageId) {
    const { data } = await supabase
      .from('chat_handoffs')
      .select('id, session_id, ref_code, account_id, target_name')
      .eq('last_outbound_wa_message_id', ctx.contextWaMessageId)
      .maybeSingle();
    if (data) handoff = data;
  }

  // 2. Tag in body
  let cleanedText = ctx.text;
  if (!handoff && ctx.text) {
    const m = ctx.text.match(TAG_RE);
    if (m) {
      const code = m[1].toUpperCase();
      const { data } = await supabase
        .from('chat_handoffs')
        .select('id, session_id, ref_code, account_id, target_name')
        .eq('ref_code', code)
        .maybeSingle();
      if (data) {
        handoff = data;
        cleanedText = ctx.text.replace(TAG_RE, '').trim();
      }
    }
  }

  // 3. Latest forwarded handoff for this phone, within 24h
  if (!handoff) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fromDigits = digitsOnly(ctx.fromWaId);
    const { data } = await supabase
      .from('chat_handoffs')
      .select('id, session_id, ref_code, account_id, target_name, target_phone')
      .in('status', ['forwarded', 'replied'])
      .gte('forwarded_at', since)
      .order('forwarded_at', { ascending: false })
      .limit(20);
    if (data?.length) {
      const match = data.find((h) => digitsOnly(h.target_phone || '') === fromDigits);
      if (match) {
        handoff = {
          id: match.id,
          session_id: match.session_id,
          ref_code: match.ref_code,
          account_id: match.account_id,
          target_name: match.target_name,
        };
      }
    }
  }

  if (!handoff) {
    console.log(`[handoff] inbound from ${ctx.fromWaId} did not match any pending handoff`);
    return false;
  }

  // Insert reply as an assistant message in the chat session, marked as
  // a personal Itamar reply so the UI can render it differently.
  const replyText = (cleanedText || ctx.text || '').trim();
  if (!replyText) {
    console.log('[handoff] inbound matched but no text body — ignoring');
    return false;
  }

  const author = handoff.target_name || 'Itamar';

  const { error: msgErr } = await supabase
    .from('chat_messages')
    .insert({
      session_id: handoff.session_id,
      role: 'assistant',
      content: replyText,
      metadata: {
        source: 'whatsapp_personal',
        author_label: author,
        ref_code: handoff.ref_code,
        wa_message_id: ctx.waMessageId,
        sent_at: ctx.sentAt || new Date().toISOString(),
      },
    });
  if (msgErr) {
    console.error('[handoff] failed to insert reply chat_message:', msgErr);
    return false;
  }

  await supabase
    .from('chat_handoffs')
    .update({
      status: 'replied',
      replied_at: new Date().toISOString(),
      reply_text: replyText,
      reply_wa_message_id: ctx.waMessageId,
    })
    .eq('id', handoff.id);

  console.log(
    `[handoff] routed reply from ${author} to session ${handoff.session_id} (ref ${handoff.ref_code})`,
  );
  return true;
}
