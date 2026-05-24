/**
 * Internal A/B chat stream — compares OpenAI vs Gemini retrieval side-by-side
 * for the LDRS account. NOT used by any production code path.
 *
 * Auth: a shared static token is sent in the body and matched against
 * `AB_TEST_TOKEN` env (or the fallback constant below if unset). Returns 404
 * for missing/wrong token so the endpoint is invisible to crawlers.
 *
 * POST body: { token, engine: 'openai'|'gemini', message, history? }
 * Response: text/event-stream
 *   - event: meta    data: { engine, embeddingMs, searchMs, chunkCount, model, llmStartedAt }
 *   - event: token   data: { text }
 *   - event: done    data: { totalMs, llmMs }
 *   - event: error   data: { message }
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { abRetrieve, formatChunksForContext, type Engine } from '@/lib/chatbot/ab-test/retrieve';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';
const CHAT_MODEL = 'gpt-5.4';
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

  const engine: Engine = body?.engine === 'gemini' ? 'gemini' : 'openai';
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
      try {
        // 1. Retrieve
        const retrieval = await abRetrieve({
          engine,
          accountId: LDRS_ACCOUNT_ID,
          query: message,
          topK: 8,
        });

        // 2. Load persona (best-effort, same for both engines)
        const supabase = await createClient();
        const { data: persona } = await supabase
          .from('chatbot_persona')
          .select('name, tone, bio, description, greeting_message')
          .eq('account_id', LDRS_ACCOUNT_ID)
          .maybeSingle();
        const { data: account } = await supabase
          .from('accounts')
          .select('config')
          .eq('id', LDRS_ACCOUNT_ID)
          .maybeSingle();
        const displayName = (account?.config as any)?.display_name || 'LDRS GROUP';

        // 3. Build prompt — identical structure for both engines
        const contextBlock = formatChunksForContext(retrieval.chunks);
        const systemPrompt = [
          `You are the chatbot for ${displayName}.`,
          persona?.name ? `Identity: ${persona.name}` : '',
          persona?.tone ? `Tone: ${persona.tone}` : '',
          persona?.bio ? `Bio: ${persona.bio}` : '',
          '',
          'Use ONLY the retrieved context below. If the context does not contain the answer, say honestly that you do not know rather than guessing.',
          'Respond in the language of the user. Keep replies concise and conversational.',
          '',
          'RETRIEVED CONTEXT:',
          contextBlock || '(no context returned for this query)',
        ].filter(Boolean).join('\n');

        const llmStartedAt = Date.now();

        controller.enqueue(sse('meta', {
          engine,
          embeddingMs: retrieval.embeddingMs,
          searchMs: retrieval.searchMs,
          chunkCount: retrieval.chunks.length,
          topSimilarity: retrieval.chunks[0]?.similarity ?? null,
          model: CHAT_MODEL,
          contextChars: contextBlock.length,
          retrievalMs: llmStartedAt - startTotal,
        }));

        // 4. Stream LLM response
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: CHAT_MODEL,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message },
          ],
        });

        for await (const chunk of completion) {
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) controller.enqueue(sse('token', { text }));
        }

        const totalMs = Date.now() - startTotal;
        const llmMs = Date.now() - llmStartedAt;
        controller.enqueue(sse('done', { totalMs, llmMs }));
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
