/**
 * Internal A/B chat stream — runs LDRS through the FULL production SandwichBot
 * pipeline twice, once with OpenAI embeddings (production default) and once
 * with Gemini Embedding 2, so the latency comparison is authentic end-to-end
 * (understanding → retrieval → reranking → personality wrap → GPT-5.4 stream).
 *
 * Engine selection is injected via the embedding-engine AsyncLocalStorage
 * context — zero changes to any production call signatures.
 *
 * Auth: shared static token in the body matched against `AB_TEST_TOKEN`
 * (fallback hardcoded). Wrong token → 404 so the endpoint is invisible.
 *
 * POST body: { token, engine: 'openai'|'gemini', message, history? }
 * Response: text/event-stream
 *   - event: meta    data: { engine, model, retrievalEngineNote }
 *   - event: token   data: { text }
 *   - event: done    data: { totalMs, archetype, confidence }
 *   - event: error   data: { message }
 */

import { NextRequest } from 'next/server';
import { processSandwichMessageWithMetadata } from '@/lib/chatbot/sandwichBot';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { withEmbeddingEngine, type EmbeddingEngine } from '@/lib/rag/embedding-engine-context';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';
const LDRS_USERNAME = 'ldrs_group';
const LDRS_DISPLAY = 'LDRS GROUP';
const FALLBACK_TOKEN = '7pxsOdI8QSNl80TIx5sVVf-NUS_INnZk';

function getToken(): string {
  return process.env.AB_TEST_TOKEN?.trim() || FALLBACK_TOKEN;
}

function notFound() {
  return new Response('Not found', { status: 404 });
}

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return notFound();
  }

  if (body?.token !== getToken()) return notFound();

  const engine: EmbeddingEngine = body?.engine === 'gemini' ? 'gemini' : 'openai';
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) return new Response('Bad request', { status: 400 });

  const history: Array<{ role: 'user' | 'assistant'; content: string }> =
    Array.isArray(body?.history)
      ? body.history
          .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-10)
      : [];

  const startTotal = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let firstTokenAt: number | null = null;
      try {
        // Pre-load personality (same as production stream/route.ts does in parallel)
        const personalityConfig = await buildPersonalityFromDB(LDRS_ACCOUNT_ID).catch(() => null);

        controller.enqueue(sse('meta', {
          engine,
          model: 'gpt-5.4',
          note: engine === 'gemini'
            ? 'Full SandwichBot pipeline with Gemini Embedding 2 (3072d) retrieval'
            : 'Full SandwichBot pipeline with OpenAI text-embedding-3-large (2000d) retrieval',
        }));

        // Run the entire SandwichBot pipeline under the chosen embedding engine.
        // AsyncLocalStorage propagates the choice into retrieve.ts without any
        // signature changes to production code.
        const sandwichResult = await withEmbeddingEngine(engine, () =>
          processSandwichMessageWithMetadata({
            userMessage: message,
            accountId: LDRS_ACCOUNT_ID,
            username: LDRS_USERNAME,
            influencerName: LDRS_DISPLAY,
            conversationHistory: history,
            personalityConfig: personalityConfig || undefined,
            previousResponseId: null,
            onToken: (token: string) => {
              if (firstTokenAt === null) firstTokenAt = Date.now();
              controller.enqueue(sse('token', { text: token }));
            },
          })
        );

        // Fallback: if streaming didn't fire (some paths return the full string),
        // emit it as a single token chunk so the UI still renders something.
        if (firstTokenAt === null && sandwichResult.response) {
          firstTokenAt = Date.now();
          controller.enqueue(sse('token', { text: sandwichResult.response }));
        }

        const doneAt = Date.now();
        controller.enqueue(sse('done', {
          totalMs: doneAt - startTotal,
          ttftMs: firstTokenAt ? firstTokenAt - startTotal : null,
          streamMs: firstTokenAt ? doneAt - firstTokenAt : null,
          archetype: sandwichResult.metadata?.archetype || null,
          confidence: sandwichResult.metadata?.confidence ?? null,
        }));
        controller.close();
      } catch (err: any) {
        console.error('[ab-chat] stream error', err);
        controller.enqueue(sse('error', { message: err?.message || 'stream failed' }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
