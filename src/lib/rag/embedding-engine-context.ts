/**
 * Embedding engine context (AsyncLocalStorage).
 *
 * Lets a caller opt into a non-default embedding engine for a request without
 * threading the choice through every function signature. Production code does
 * not set this context, so every existing call resolves to 'openai' — the
 * historical behaviour and the only engine production data is embedded in.
 *
 * Used today by /api/internal/ab-chat/stream to run the LDRS account through
 * the full SandwichBot pipeline with Gemini Embedding 2 in place of OpenAI's
 * text-embedding-3-large, so the A/B page reflects authentic end-to-end latency.
 */

import { AsyncLocalStorage } from 'async_hooks';

export type EmbeddingEngine = 'openai' | 'gemini';

const store = new AsyncLocalStorage<{ engine: EmbeddingEngine }>();

/** Run `fn` with the given embedding engine in scope. */
export async function withEmbeddingEngine<T>(engine: EmbeddingEngine, fn: () => Promise<T>): Promise<T> {
  return store.run({ engine }, fn);
}

/** Returns the engine in scope, defaulting to 'openai'. */
export function getEmbeddingEngine(): EmbeddingEngine {
  return store.getStore()?.engine ?? 'openai';
}
