/**
 * Instagram Graph API Webhook Handler
 * POST /api/webhooks/instagram — מקבל אירועים מ-Meta (הודעות, תגובות, סטוריז)
 * GET  /api/webhooks/instagram — אימות webhook (Meta verification challenge)
 *
 * Meta שולח:
 * 1. GET עם hub.verify_token + hub.challenge לאימות ראשוני
 * 2. POST עם payload חתום ב-HMAC-SHA256 לכל אירוע
 */

import { NextRequest, NextResponse } from 'next/server';
import { processInstagramGraphDM } from '@/lib/instagram-graph/dm-handler';
import { verifyWebhookSignature, type IGWebhookPayload, type IGMessagingEvent } from '@/lib/instagram-graph/client';

// ============================================
// Environment
// ============================================

const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || '';
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';

// ============================================
// GET — Webhook Verification (Meta Challenge)
// ============================================

/**
 * Meta sends a GET request with these query params to verify the webhook:
 * - hub.mode = 'subscribe'
 * - hub.verify_token = the token you set in the dashboard
 * - hub.challenge = a random string to echo back
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('[IG Webhook] Verification request:', { mode, token: token ? '***' : 'missing', challenge: challenge ? 'present' : 'missing' });

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[IG Webhook] Verification successful');
    // Must return the challenge as plain text (not JSON!)
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('[IG Webhook] Verification failed — token mismatch');
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ============================================
// POST — Handle Webhook Events
// ============================================

export async function POST(req: NextRequest) {
  try {
    // 1. Read raw body for signature verification
    const rawBody = await req.text();

    // 2. Verify webhook signature (HMAC-SHA256 with app secret)
    if (APP_SECRET) {
      const signature = req.headers.get('x-hub-signature-256') || '';
      if (!verifyWebhookSignature(rawBody, signature, APP_SECRET)) {
        console.warn('[IG Webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // 3. Parse payload
    const payload: IGWebhookPayload = JSON.parse(rawBody);

    // Verify this is an Instagram webhook
    if (payload.object !== 'instagram') {
      console.log(`[IG Webhook] Ignoring non-instagram object: ${payload.object}`);
      return NextResponse.json({ status: 'ok' });
    }

    console.log(`[IG Webhook] Received ${payload.entry?.length || 0} entries`);

    // 4. Process each entry
    for (const entry of payload.entry || []) {
      const igAccountId = entry.id;

      // ---- Messaging Events (DMs) ----
      if (entry.messaging?.length) {
        for (const event of entry.messaging) {
          await handleMessagingEvent(event, igAccountId);
        }
      }

      // ---- Change Events (comments, story_insights, etc.) ----
      if (entry.changes?.length) {
        for (const change of entry.changes) {
          await handleChangeEvent(change, igAccountId);
        }
      }
    }

    // Always return 200 quickly to avoid Meta retries
    return NextResponse.json({ status: 'ok' });

  } catch (error: any) {
    console.error('[IG Webhook] Error:', error.message);
    // Still return 200 to prevent retry storms
    return NextResponse.json({ status: 'error', message: error.message }, { status: 200 });
  }
}

// ============================================
// Event Handlers
// ============================================

async function handleMessagingEvent(event: IGMessagingEvent, igAccountId: string) {
  // Message received
  if (event.message && !event.message.is_echo) {
    console.log(`[IG Webhook] New message from ${event.sender.id}: "${event.message.text?.slice(0, 50) || '[media]'}"`);

    // Process DM asynchronously — return 200 immediately
    processInstagramGraphDM(event, igAccountId).catch(err => {
      console.error('[IG Webhook] Async DM processing error:', err);
    });
    return;
  }

  // Message echo (our own messages sent back to us)
  if (event.message?.is_echo) {
    console.log(`[IG Webhook] Echo message: ${event.message.mid}`);
    return;
  }

  // Read receipt
  if (event.read) {
    console.log(`[IG Webhook] Messages read by ${event.sender.id} up to ${event.read.watermark}`);
    return;
  }

  // Reaction
  if (event.reaction) {
    console.log(`[IG Webhook] Reaction from ${event.sender.id}: ${event.reaction.reaction} on ${event.reaction.mid}`);
    return;
  }

  // Postback (button click)
  if (event.postback) {
    console.log(`[IG Webhook] Postback from ${event.sender.id}: ${event.postback.payload}`);
    // Could route to specific handler based on payload
    return;
  }

  console.log('[IG Webhook] Unhandled messaging event:', JSON.stringify(event).slice(0, 200));
}

async function handleChangeEvent(change: any, igAccountId: string) {
  const { field, value } = change;

  switch (field) {
    case 'comments':
      console.log(`[IG Webhook] New comment on ${value.media?.id}: "${value.text?.slice(0, 50)}"`);
      // Could trigger auto-reply to comments
      break;

    case 'story_insights':
      console.log(`[IG Webhook] Story insights for ${igAccountId}:`, value);
      // Could store in instagram_stories table
      break;

    case 'live_comments':
      console.log(`[IG Webhook] Live comment on ${igAccountId}`);
      break;

    default:
      console.log(`[IG Webhook] Unhandled change field: ${field}`);
  }
}
