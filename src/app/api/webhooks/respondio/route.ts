/**
 * Respond.io Webhook Handler
 * POST /api/webhooks/respondio
 *
 * מקבל אירועים מ-Respond.io (הודעות נכנסות, שינויי שיחות, etc.)
 * ומפעיל את ה-AI bot לתשובות אוטומטיות ב-Instagram DMs
 */

import { NextRequest, NextResponse } from 'next/server';
import { processInstagramDM } from '@/lib/respondio/dm-chat-handler';
import type { WebhookPayload } from '@/lib/respondio/client';

// Webhook secret for verification
const WEBHOOK_SECRET = process.env.RESPONDIO_WEBHOOK_SECRET || '';

// ============================================
// POST — Handle Webhook Events
// ============================================

export async function POST(req: NextRequest) {
  try {
    // 1. Verify webhook authenticity
    if (WEBHOOK_SECRET) {
      const signature = req.headers.get('x-respondio-signature')
                     || req.headers.get('x-webhook-signature')
                     || '';

      if (!verifySignature(signature)) {
        console.warn('[Webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // 2. Parse payload
    const payload: WebhookPayload = await req.json();
    const { event } = payload;

    console.log(`[Webhook] Received event: ${event}`, {
      contactId: payload.data?.contact?.id,
      messageType: payload.data?.message?.type,
      direction: payload.data?.message?.direction,
    });

    // 3. Route by event type
    switch (event) {
      case 'message.created':
      case 'message:received':
      case 'inbound_message': {
        // Only process incoming text messages
        if (
          payload.data?.message?.direction === 'incoming' &&
          payload.data?.message?.type === 'text'
        ) {
          // Process asynchronously — return 200 immediately to Respond.io
          // This prevents webhook timeout issues
          processInstagramDM(payload).catch(err => {
            console.error('[Webhook] Async DM processing error:', err);
          });
        }
        break;
      }

      case 'conversation.assigned':
      case 'conversation:assigned': {
        console.log(`[Webhook] Conversation assigned for contact ${payload.data?.contact?.id}`);
        // Could pause bot when human agent takes over
        break;
      }

      case 'conversation.closed':
      case 'conversation:closed': {
        console.log(`[Webhook] Conversation closed for contact ${payload.data?.contact?.id}`);
        break;
      }

      case 'contact.created':
      case 'contact:created': {
        console.log(`[Webhook] New contact created: ${payload.data?.contact?.id}`);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    // Always return 200 quickly to avoid Respond.io retries
    return NextResponse.json({ status: 'ok', event });

  } catch (error: any) {
    console.error('[Webhook] Error:', error.message);
    // Still return 200 to prevent retry storms
    return NextResponse.json({ status: 'error', message: error.message }, { status: 200 });
  }
}

// ============================================
// GET — Health Check / Verification
// ============================================

export async function GET(req: NextRequest) {
  // Some webhook systems send a GET for verification
  const challenge = req.nextUrl.searchParams.get('challenge');

  if (challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({
    status: 'ok',
    service: 'respondio-webhook',
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// Helpers
// ============================================

function verifySignature(signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // Skip if no secret configured
  if (!signature) return false;

  // Basic verification — in production, use HMAC comparison
  // Respond.io sends the secret as a header or uses HMAC-SHA256
  return signature === WEBHOOK_SECRET;
}
