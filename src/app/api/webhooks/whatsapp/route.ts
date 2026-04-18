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

export const runtime = 'nodejs';          // need crypto + Buffer
export const dynamic = 'force-dynamic';   // never cache

// ---------------------------------------------------------------------
// GET — verification handshake
// ---------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode      = url.searchParams.get('hub.mode');
  const token     = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

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

        // Insert message (wa_message_id UNIQUE guards against webhook retries)
        await supabase.from('whatsapp_messages').insert({
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
        });

        // bump unread
        await supabase
          .from('whatsapp_conversations')
          .update({ unread_count: (convo.unread_count ?? 0) + 1 })
          .eq('id', convo.id);
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
