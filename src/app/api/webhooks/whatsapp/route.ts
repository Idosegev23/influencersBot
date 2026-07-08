/**
 * WhatsApp Cloud API — webhook endpoint.
 *
 * Meta hits this URL for two reasons:
 *   1. GET  — one-time verification when you register the webhook.
 *            Must echo `hub.challenge` iff `hub.verify_token` matches ours.
 *   2. POST — every inbound message / status update / media notification.
 *            Body signed with HMAC-SHA256 (header X-Hub-Signature-256).
 *
 * Design choices:
 *   • We ALWAYS return 200 as fast as possible for POST. Meta retries
 *     aggressively on non-2xx responses, and we don't want retry storms
 *     if our processing has a bug. The raw payload is persisted to
 *     `whatsapp_webhook_events` first; real processing is best-effort.
 *   • Signature verification must happen against the RAW body bytes —
 *     hence `req.text()` before JSON.parse.
 *   • Service-role Supabase client is used (bypasses RLS).
 *
 * Docs:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWhatsAppSignature } from '@/lib/whatsapp-cloud/signature';
import { createClient } from '@/lib/supabase';
import { isItamarSender, processItamarReply } from '@/lib/handoff/process-itamar-reply';
import { routeInboundToTicket } from '@/lib/support/route-inbound';
import { toWaId, sendReaction, sendTyping } from '@/lib/whatsapp-cloud/client';
import { publishAgentJob } from '@/lib/crm/wa-queue';

export const runtime = 'nodejs';          // need crypto + Buffer
export const dynamic = 'force-dynamic';   // never cache
export const maxDuration = 300;           // AI parse + audio transcription are slow; don't let Vercel kill the fn

// ---------------------------------------------------------------------
// GET — verification handshake
// ---------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode      = url.searchParams.get('hub.mode');
  const token     = (url.searchParams.get('hub.verify_token') || '').trim();
  const challenge = url.searchParams.get('hub.challenge');

  // Trim defensively — Vercel env values occasionally pick up trailing
  // whitespace (CR/LF) from the CLI, which would otherwise break a
  // strict equality check against Meta's clean token.
  const expected = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();

  if (mode === 'subscribe' && token && expected && token === expected) {
    // Meta expects the raw challenge back as plain text
    return new NextResponse(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// ---------------------------------------------------------------------
// POST — incoming messages & status updates
// ---------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // 1. Read raw body (needed for signature check — must not be re-serialised)
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');

  // 2. Verify signature — but don't error out to Meta if invalid; log and 200
  //    (Meta documentation: "You should verify that the payload was sent by
  //    WhatsApp by validating the X-Hub-Signature-256 signature.")
  const sig = verifyWhatsAppSignature(rawBody, signature);

  // 3. Parse JSON (after signature check, not before)
  let payload: any = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch (err) {
    console.error('[whatsapp webhook] invalid JSON body', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // 4. Persist raw event BEFORE processing (audit + replay)
  const supabase = createClient();
  const entry    = payload?.entry?.[0];
  const change   = entry?.changes?.[0];
  const value    = change?.value;

  const { data: eventRow, error: insertErr } = await supabase
    .from('whatsapp_webhook_events')
    .insert({
      waba_id:         entry?.id ?? null,
      phone_number_id: value?.metadata?.phone_number_id ?? null,
      event_type:      change?.field ?? null,
      signature_valid: sig.valid,
      payload,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[whatsapp webhook] failed to persist raw event', insertErr);
  }

  if (!sig.valid) {
    console.warn('[whatsapp webhook] invalid signature, skipping processing:', sig.reason);
    // Still 200 — Meta would retry forever otherwise.
    return NextResponse.json({ received: true, warn: 'invalid signature' }, { status: 200 });
  }

  // 5. Best-effort processing (don't let errors bubble up to Meta)
  try {
    await processWebhook(payload);
    if (eventRow?.id) {
      await supabase
        .from('whatsapp_webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', eventRow.id);
    }
  } catch (err) {
    console.error('[whatsapp webhook] processing error', err);
    if (eventRow?.id) {
      await supabase
        .from('whatsapp_webhook_events')
        .update({
          processed_at: new Date().toISOString(),
          processing_error: err instanceof Error ? err.message : String(err),
        })
        .eq('id', eventRow.id);
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// ---------------------------------------------------------------------
// Processing — persist inbound messages & status updates
// ---------------------------------------------------------------------
async function processWebhook(payload: any): Promise<void> {
  const supabase = createClient();

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change.field !== 'messages') continue;

      const value = change.value ?? {};
      const phoneNumberId: string = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // -----------------------------------------------------------------
      // Inbound messages
      // -----------------------------------------------------------------
      for (const msg of value.messages ?? []) {
        const waId: string = msg.from;                 // remote user
        const profileName: string | undefined =
          value.contacts?.find((c: any) => c.wa_id === waId)?.profile?.name;

        // Personal handoff (Itamar via WhatsApp): if the sender is on the
        // allow-list, attempt to route this reply back into a Bestie chat
        // session. We still proceed with the standard whatsapp_messages
        // upsert below for audit, but skip incrementing unread_count for
        // this conversation since it's not a customer-facing thread.
        const inboundText: string | null =
          msg.text?.body ??
          msg.button?.text ??
          msg.interactive?.button_reply?.title ??
          msg.interactive?.list_reply?.title ??
          null;
        if (isItamarSender(waId) && inboundText) {
          try {
            await processItamarReply({
              fromWaId: waId,
              text: inboundText,
              contextWaMessageId: msg.context?.id,
              waMessageId: msg.id,
              sentAt: msg.timestamp
                ? new Date(Number(msg.timestamp) * 1000).toISOString()
                : undefined,
            });
          } catch (err) {
            console.error('[whatsapp webhook] handoff routing failed', err);
          }
        }

        // upsert contact
        const { data: contact } = await supabase
          .from('whatsapp_contacts')
          .upsert(
            { wa_id: waId, phone_e164: `+${waId}`, profile_name: profileName ?? null },
            { onConflict: 'wa_id' }
          )
          .select('id')
          .single();

        if (!contact) continue;

        // upsert conversation
        const { data: convo } = await supabase
          .from('whatsapp_conversations')
          .upsert(
            {
              phone_number_id: phoneNumberId,
              contact_id: contact.id,
              status: 'active',
              last_inbound_at: new Date().toISOString(),
              service_window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            },
            { onConflict: 'phone_number_id,contact_id' }
          )
          .select('id, unread_count')
          .single();

        if (!convo) continue;

        // Detect message type
        const type: string = msg.type || 'unknown';
        const textBody =
          msg.text?.body ??
          msg.button?.text ??
          msg.interactive?.button_reply?.title ??
          msg.interactive?.list_reply?.title ??
          null;

        // Insert message. wa_message_id is UNIQUE; ignoreDuplicates makes Meta's
        // at-least-once retries a NO-OP for everything below — otherwise the same
        // brief gets processed twice (2nd pass lands in awaiting_build_confirm →
        // spurious "לא הבנתי") and voice notes get double-handled.
        const { data: insertedRows } = await supabase
          .from('whatsapp_messages')
          .upsert(
            {
              conversation_id:   convo.id,
              direction:         'inbound',
              wa_message_id:     msg.id,
              reply_to_wa_id:    msg.context?.id ?? null,
              message_type:      normaliseType(type),
              text_body:         textBody,
              media_id:          msg[type]?.id ?? null,
              media_mime_type:   msg[type]?.mime_type ?? null,
              media_sha256:      msg[type]?.sha256 ?? null,
              payload:           msg,
              status:            'delivered',          // inbound == delivered to us
            },
            { onConflict: 'wa_message_id', ignoreDuplicates: true }
          )
          .select('id');
        if (!insertedRows || insertedRows.length === 0) continue; // duplicate delivery — already handled

        // bump unread
        await supabase
          .from('whatsapp_conversations')
          .update({ unread_count: (convo.unread_count ?? 0) + 1 })
          .eq('id', convo.id);

        // Agency-CRM: if the sender is a registered agent, treat the inbound as
        // a forwarded price-quote (AI parse → quote → tailored reply) and SKIP
        // support routing — an agent's WhatsApp is not a customer thread.
        let handledAsAgent = false;
        if (!isItamarSender(waId)) {
          try {
            handledAsAgent = await maybeEnqueueAgentJob({ waId, msg, textBody });
          } catch (err) {
            console.error('[whatsapp webhook] agent enqueue failed', err);
          }
        }

        // Route this inbound to a support ticket if we can identify
        // one. Skips the Itamar handoff sender and agent senders — those
        // flows have their own handling above. Best-effort: errors are
        // swallowed because the raw message is already persisted.
        if (!isItamarSender(waId) && !handledAsAgent) {
          try {
            await routeInboundToTicket({
              waId,
              textBody,
              contextId: msg.context?.id ?? null,
              waMessageId: msg.id,
              contactId: contact.id,
            });
          } catch (err) {
            console.error('[whatsapp webhook] support routing failed', err);
          }
        }
      }

      // -----------------------------------------------------------------
      // Outbound message status updates (sent / delivered / read / failed)
      // -----------------------------------------------------------------
      for (const status of value.statuses ?? []) {
        const update: any = { status: status.status };
        const ts = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : null;

        if (status.status === 'sent')       update.sent_at      = ts;
        if (status.status === 'delivered')  update.delivered_at = ts;
        if (status.status === 'read')       update.read_at      = ts;
        if (status.status === 'failed') {
          update.failed_at     = ts;
          update.error_code    = status.errors?.[0]?.code ?? null;
          update.error_message = status.errors?.[0]?.title || status.errors?.[0]?.message || null;
        }

        // Pricing — Meta attaches it to status events (typically the
        // 'sent' event, occasionally on 'delivered' too). Persist all
        // fields so the admin cost dashboard can join straight from
        // whatsapp_messages without re-parsing the raw payload.
        if (status.pricing) {
          update.pricing = status.pricing;
          if (typeof status.pricing.billable === 'boolean') update.pricing_billable = status.pricing.billable;
          if (typeof status.pricing.category === 'string') update.pricing_category = status.pricing.category;
          if (typeof status.pricing.pricing_model === 'string') update.pricing_model = status.pricing.pricing_model;
          if (typeof status.pricing.type === 'string') update.pricing_type = status.pricing.type;
        }

        await supabase
          .from('whatsapp_messages')
          .update(update)
          .eq('wa_message_id', status.id);
      }
    }
  }
}

function normaliseType(t: string): string {
  const allowed = new Set([
    'text','image','audio','video','document','sticker',
    'location','contacts','interactive','button','reaction',
    'template','system',
  ]);
  return allowed.has(t) ? t : 'unknown';
}

/**
 * Agency-CRM: if the WhatsApp sender is a registered agent, ingest the message
 * as a forwarded quote (download any PDF/image, AI-parse, create the quote) and
 * reply with a tailored ack. Returns true if the sender was an agent (so the
 * caller skips support routing).
 */
/**
 * Agency-CRM async ingress. If the WhatsApp sender is a registered active agent:
 * give instant feedback (👀 + typing) and ENQUEUE the heavy work (media download,
 * transcription, brain, quote, reply) to the QStash worker so the webhook returns
 * 200 in <300ms — Vercel freezes the fn after the response, so it can't process inline.
 * Returns true if the sender was an agent (so the caller skips support routing).
 */
async function maybeEnqueueAgentJob(args: { waId: string; msg: any; textBody: string | null }): Promise<boolean> {
  const supabase = createClient();
  const { data: agent } = await supabase
    .from('users')
    .select('id, role, status')
    .eq('whatsapp', toWaId(args.waId))
    .maybeSingle();
  if (!agent || (agent as any).role !== 'agent' || (agent as any).status !== 'active') return false;

  // Instant feedback — fire-and-forget so they add no latency. 👀 lands first; the
  // worker swaps it to ✅/⚠️ when the reply is ready. Typing also marks-as-read.
  void sendReaction({ to: args.waId, messageId: args.msg.id, emoji: '👀' }).catch(() => {});
  void sendTyping(args.msg.id).catch(() => {});

  try {
    await publishAgentJob({ waId: args.waId, agentId: (agent as any).id, msg: args.msg, textBody: args.textBody });
  } catch (e) {
    console.error('[whatsapp webhook] failed to enqueue agent job', e);
    // fall through: still return true so support routing is skipped for an agent
  }
  return true;
}
