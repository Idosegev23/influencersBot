/**
 * Widget Chat API — Public CORS-enabled streaming endpoint
 * POST /api/widget/chat
 */

import { NextRequest } from 'next/server';
import { processWidgetMessage } from '@/lib/chatbot/widget-chat-handler';
import { createClient } from '@/lib/supabase/server';
import type { ProductRecommendation } from '@/lib/recommendations/engine';

// ============================================
// CORS Headers
// ============================================

function getCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Validate that the request origin matches the account's registered domain.
 * Allows: localhost (dev), vercel preview deploys, and the account's own domain.
 */
function isOriginAllowed(origin: string, accountDomain?: string): boolean {
  if (!origin || origin === 'null') return true; // server-side or file:// requests
  try {
    const url = new URL(origin);
    // Always allow localhost / dev
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    // Allow our own domain
    if (url.hostname.endsWith('.vercel.app') || url.hostname.endsWith('bestieai.co.il')) return true;
    // Allow the account's registered domain
    if (accountDomain && url.hostname.endsWith(accountDomain.replace(/^www\./, ''))) return true;
  } catch { /* invalid URL */ }
  return false;
}

// ============================================
// OPTIONS — CORS Preflight
// ============================================

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

// ============================================
// NDJSON Encoder
// ============================================

const _encoder = new TextEncoder();
function encodeEvent(event: Record<string, any>): Uint8Array {
  return _encoder.encode(JSON.stringify(event) + '\n');
}

// ============================================
// Card DTO — versioned wire contract for widget v4
// ============================================
// Keep this stable. New optional fields OK; renames/removals require widget bump.
function toCardDTO(p: ProductRecommendation) {
  return {
    id: p.id,
    name: p.name,
    image: p.imageUrl,
    price: p.price,
    originalPrice: p.originalPrice,
    isOnSale: p.isOnSale,
    productUrl: p.productUrl,
    ctaLabel: p.isOnSale ? 'קני במבצע' : 'לפרטים נוספים',
    recommendedFor: p.recommendedFor || null,
    badge: p.badge || null,
    socialProof: p.socialProof || null,
    keyClaims: p.keyClaims || [],
    reason: p.aiWhy || null,
  };
}

// ============================================
// POST — Chat Message
// ============================================

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const corsHeaders = getCorsHeaders(origin);

  try {
    const body = await req.json();
    const { message, accountId, sessionId } = body;

    if (!message || !accountId) {
      return new Response(
        JSON.stringify({ error: 'message and accountId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // CORS origin validation: check if origin matches the account's domain.
    // For accounts where the widget runs on a different domain than the
    // chat-page username (e.g. LA BEAUTÉ — username='labeaute.israel'
    // but widget on 'labeauteisrael.co.il'), prefer widget.domain.
    if (origin && origin !== '*') {
      const supabase = await createClient();
      const { data: account } = await supabase
        .from('accounts')
        .select('config')
        .eq('id', accountId)
        .single();
      const cfg = (account?.config as any) || {};
      const accountDomain = cfg?.widget?.domain || cfg?.username;
      if (!isOriginAllowed(origin, accountDomain)) {
        return new Response(
          JSON.stringify({ error: 'Origin not allowed for this account' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Stream the response as NDJSON
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send meta event
          controller.enqueue(
            encodeEvent({ type: 'meta', sessionId: sessionId || 'pending' }),
          );

          // Send thinking indicator (immediate — reduces perceived latency)
          const thinkingTexts = [
            'רגע, בודק... 🔍',
            'שנייה, בודק...',
            'אחלה, תן לי רגע...',
            'בודק את זה...',
          ];
          controller.enqueue(
            encodeEvent({
              type: 'thinking',
              text: thinkingTexts[Math.floor(Math.random() * thinkingTexts.length)],
            }),
          );

          // Process message with streaming
          const result = await processWidgetMessage({
            accountId,
            message,
            sessionId,
            onToken: (token) => {
              controller.enqueue(encodeEvent({ type: 'delta', text: token }));
            },
          });

          // Phase 2: emit parsed intent envelope ahead of cards so the client
          // can pick the layout (compare vs stack) and persist lastTopic for
          // the next page-load's smart chips.
          if (result.intent) {
            controller.enqueue(
              encodeEvent({
                type: 'intent',
                stage: result.intent.stage,
                objection: result.intent.objection,
                topic: result.intent.topic,
                confidence: result.intent.confidence,
              }),
            );
          }

          // Send structured product cards (widget v4) before done.
          // Empty products array → still emit, so client can clear stale cards.
          const cards = (result.products || []).map(toCardDTO);
          const layout = result.intent?.stage === 'comparing' ? 'compare' : 'stack';
          controller.enqueue(
            encodeEvent({
              type: 'cards',
              products: cards,
              layout,
            }),
          );

          // Send done event
          controller.enqueue(
            encodeEvent({
              type: 'done',
              sessionId: result.sessionId,
              fullText: result.response,
              productCount: cards.length,
              intent: result.intent || null,
            }),
          );
        } catch (error: any) {
          console.error('[Widget Chat] Error:', error);
          controller.enqueue(
            encodeEvent({ type: 'error', message: 'שגיאה בעיבוד הבקשה' }),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('[Widget Chat] Parse error:', error);
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}
