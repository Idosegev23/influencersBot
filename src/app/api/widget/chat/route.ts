/**
 * Widget Chat API — Public CORS-enabled streaming endpoint
 * POST /api/widget/chat
 */

import { NextRequest } from 'next/server';
import { processWidgetMessage } from '@/lib/chatbot/widget-chat-handler';

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

          // Send done event
          controller.enqueue(
            encodeEvent({
              type: 'done',
              sessionId: result.sessionId,
              fullText: result.response,
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
