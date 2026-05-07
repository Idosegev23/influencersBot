/**
 * Shipping carrier webhook — generic.
 *
 * Carriers POST delivery events to:
 *   /api/webhooks/shipping/<accountToken>
 *
 * The `accountToken` is the per-account secret stored on
 * `accounts.config.shipping_webhook.token`. It identifies which brand
 * the events belong to. Carriers can also be configured to sign
 * payloads with HMAC-SHA256 — the secret is stored on
 * `accounts.config.shipping_webhook.hmac_secret`. If set, we require
 * an `X-Shipping-Signature: sha256=<hex>` header.
 *
 * Payload shape (what we expect after the brand's middleware):
 *   {
 *     "tracking_number": "TEST-12345",
 *     "status":          "delivered" | "in_transit" | "..." (free text — mapped),
 *     "occurred_at":     "2026-05-07T10:00:00Z",  // optional
 *     "carrier":         "focus" | "yu-pi-es" | ...,  // optional, free text
 *     ...                // any other fields are preserved in raw_payload
 *   }
 *
 * Behaviour:
 *  • Always persist to `shipment_events` first (replay-friendly).
 *  • Resolve account by token. Bad token → 404.
 *  • Verify HMAC if hmac_secret is configured. Bad signature → 401.
 *  • Match ticket by (account_id, tracking_number). No match → orphan
 *    row, return 200.
 *  • Append support_ticket_history row. Update last_shipment_status.
 *  • On `delivered`: stamp delivered_at, ensure feedback_token, send
 *    `support_delivered_feedback_v1` template (idempotent — only if
 *    feedback_status was NULL).
 *  • Always return 200 to avoid carrier retry storms (errors land in
 *    shipment_events.processing_error).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabase } from '@/lib/supabase';
import { mapShipmentStatus, normalizeTracking, STATUS_HE, type MappedStatus } from '@/lib/shipment/webhook-mapper';
import { ensureFeedbackToken } from '@/lib/shipment/feedback-token';
import { sendSupportDeliveredFeedback } from '@/lib/whatsapp-notify';

export const runtime = 'nodejs';
export const maxDuration = 30;

function publicHost(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://bestie.ldrsgroup.com'
  ).replace(/\/$/, '');
}

function verifySignature(rawBody: string, header: string | null, secret: string | null): boolean | null {
  if (!secret) return null; // not configured → skip
  if (!header) return false;
  const [algo, provided] = header.split('=');
  if (algo !== 'sha256' || !provided) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return 'לקוחה';
  return fullName.trim().split(/\s+/)[0] || 'לקוחה';
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ accountToken: string }> },
) {
  const { accountToken } = await ctx.params;

  const rawBody = await req.text();
  let payload: any;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // Resolve account by token. Use the JSONB ->> path for direct equality.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('config->shipping_webhook->>token', accountToken)
    .maybeSingle();

  if (!account) {
    // Don't 200 here — wrong token shouldn't be silently absorbed; tells
    // the brand they have a wiring bug.
    return NextResponse.json({ error: 'unknown_token' }, { status: 404 });
  }

  const hmacSecret = (account as any).config?.shipping_webhook?.hmac_secret || null;
  const sigHeader = req.headers.get('x-shipping-signature') || req.headers.get('x-hub-signature-256');
  const sigResult = verifySignature(rawBody, sigHeader, hmacSecret);
  const signatureValid = sigResult === null ? null : sigResult;

  if (sigResult === false) {
    // Configured to verify but failed → reject. Still log to the audit.
    await supabase.from('shipment_events').insert({
      account_id: account.id,
      tracking_number: normalizeTracking(payload?.tracking_number) || '(missing)',
      raw_status: payload?.status ?? null,
      mapped_status: null,
      occurred_at: payload?.occurred_at || null,
      signature_valid: false,
      processing_error: 'invalid signature',
      raw_payload: payload,
    });
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const tracking = normalizeTracking(payload?.tracking_number);
  const rawStatus = (payload?.status || '').toString();
  const mapped = mapShipmentStatus(rawStatus);
  const occurredAt = payload?.occurred_at ? new Date(payload.occurred_at).toISOString() : null;
  const carrier = payload?.carrier ? String(payload.carrier).slice(0, 40) : null;

  if (!tracking) {
    await supabase.from('shipment_events').insert({
      account_id: account.id,
      tracking_number: '(missing)',
      raw_status: rawStatus,
      mapped_status: mapped,
      carrier,
      occurred_at: occurredAt,
      signature_valid: signatureValid,
      processing_error: 'missing tracking_number',
      raw_payload: payload,
    });
    return NextResponse.json({ ok: true, error: 'missing_tracking' });
  }

  // Match ticket by tracking_number (account-scoped).
  const { data: ticket } = await supabase
    .from('support_requests')
    .select(
      'id, account_id, customer_name, customer_phone, brand, status, feedback_status, feedback_token',
    )
    .eq('account_id', account.id)
    .eq('tracking_number', tracking)
    .maybeSingle();

  let processingError: string | null = null;

  // Insert the audit row first (with ticket_id if matched).
  const { data: eventRow } = await supabase
    .from('shipment_events')
    .insert({
      account_id: account.id,
      ticket_id: ticket?.id || null,
      tracking_number: tracking,
      carrier,
      raw_status: rawStatus,
      mapped_status: mapped,
      occurred_at: occurredAt,
      signature_valid: signatureValid,
      raw_payload: payload,
    })
    .select('id')
    .maybeSingle();

  if (!ticket) {
    // Per spec: ignore deliveries with no matching ticket — silent audit.
    return NextResponse.json({ ok: true, matched: false, event_id: eventRow?.id || null });
  }

  // Append history row + update ticket
  try {
    await supabase.from('support_ticket_history').insert({
      ticket_id: ticket.id,
      account_id: account.id,
      action: 'shipment_event',
      actor: carrier ? `carrier:${carrier}` : 'carrier',
      body_text: STATUS_HE[mapped] || rawStatus,
      note: mapped,
    });

    const update: Record<string, any> = {
      last_shipment_status: mapped,
      updated_at: new Date().toISOString(),
    };
    if (mapped === 'delivered' && !((ticket as any).delivered_at)) {
      update.delivered_at = occurredAt || new Date().toISOString();
    }

    await supabase.from('support_requests').update(update).eq('id', ticket.id);
  } catch (e: any) {
    processingError = e?.message || 'history insert / ticket update failed';
    console.error('[shipping webhook] mutation error:', e);
  }

  // Idempotent: send the feedback template only on `delivered` and only
  // if we haven't already sent it (feedback_status IS NULL).
  if (mapped === 'delivered' && ticket.customer_phone && !ticket.feedback_status) {
    try {
      const token = ticket.feedback_token || (await ensureFeedbackToken(ticket.id));
      if (!token) {
        processingError = (processingError || '') + ' | feedback_token generation failed';
      } else {
        const feedbackUrl = `${publicHost()}/feedback/${token}`;
        const result = await sendSupportDeliveredFeedback({
          to: ticket.customer_phone,
          customerFirstName: firstName(ticket.customer_name),
          brand: ticket.brand || 'המותג',
          feedbackToken: token,
        });

        // Audit the template send (success or fail) on the ticket history
        await supabase.from('support_ticket_history').insert({
          ticket_id: ticket.id,
          account_id: account.id,
          action: 'customer_notified',
          actor: 'system',
          whatsapp_template_name: 'support_delivered_feedback_v1',
          whatsapp_message_id: result.wa_message_id || null,
          body_text:
            `היי ${firstName(ticket.customer_name)} 🤍\n` +
            `שמחים שהמשלוח שלך מ-${ticket.brand || 'המותג'} הגיע בשלום.\n` +
            `מקווים שאת מרוצה — אם משהו לא בסדר או רוצה להגיד תודה, אנחנו כאן 👇\n${feedbackUrl}`,
          note: result.success ? null : `Send failed: ${result.error?.message || 'unknown'}`,
        });

        await supabase
          .from('support_requests')
          .update({
            feedback_status: 'pending',
            feedback_sent_at: new Date().toISOString(),
            feedback_token: token,
          })
          .eq('id', ticket.id);
      }
    } catch (e: any) {
      processingError = (processingError ? processingError + ' | ' : '') + (e?.message || 'feedback send failed');
      console.error('[shipping webhook] feedback send error:', e);
    }
  }

  if (processingError && eventRow?.id) {
    await supabase
      .from('shipment_events')
      .update({ processing_error: processingError })
      .eq('id', eventRow.id);
  }

  return NextResponse.json({
    ok: true,
    matched: true,
    ticket_id: ticket.id,
    mapped_status: mapped,
    event_id: eventRow?.id || null,
  });
}

// GET handler for sanity/health check (carriers sometimes ping URLs to
// verify before configuring).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ accountToken: string }> },
) {
  const { accountToken } = await ctx.params;
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('config->shipping_webhook->>token', accountToken)
    .maybeSingle();

  if (!account) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, account_id: account.id });
}
