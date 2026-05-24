/**
 * Gemini Embedding 2 helper — used ONLY by the internal A/B test page.
 *
 * Production retrieval uses OpenAI text-embedding-3-large (2000-dim). This
 * helper exists so the AB harness can embed queries with Google's newest
 * embedding model and search the shadow `embedding_gemini` column (3072-dim)
 * for an apples-to-apples comparison.
 *
 * Not imported by any production code path.
 */

import { GoogleGenAI } from '@google/genai';
import { createLogger } from './logger';
import crypto from 'crypto';

const log = createLogger('gemini-embeddings');

export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';
export const GEMINI_EMBEDDING_DIMENSIONS = 3072;

const EMBED_TIMEOUT_MS = 20_000;
const MAX_BATCH_SIZE = 100;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return client;
}

// In-memory FIFO cache for query embeddings (same shape as openai embedding cache)
const cache = new Map<string, { embedding: number[]; ts: number }>();
const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;

function cacheKey(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

function getCached(text: string): number[] | null {
  const k = cacheKey(text);
  const entry = cache.get(k);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.embedding;
  if (entry) cache.delete(k);
  return null;
}

function setCached(text: string, embedding: number[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey(text), { embedding, ts: Date.now() });
}

/**
 * Embed a single text. Returns null on timeout (caller can fall back).
 */
export async function generateGeminiEmbedding(text: string): Promise<number[] | null> {
  const cached = getCached(text);
  if (cached) {
    log.debug('Gemini embedding cache hit', { textLen: text.length });
    return cached;
  }

  try {
    const [embedding] = await generateGeminiEmbeddings([text]);
    setCached(text, embedding);
    return embedding;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      log.warn('Gemini embedding timeout — caller should fall back');
      return null;
    }
    throw err;
  }
}

/**
 * Embed multiple texts. gemini-embedding-2 supports batch via repeated contents.
 * We loop sequentially per batch to keep error handling simple.
 */
export async function generateGeminiEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const c = getClient();
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

    try {
      const response = await c.models.embedContent({
        model: GEMINI_EMBEDDING_MODEL,
        contents: batch,
        config: { outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS },
      } as any);
      clearTimeout(timeoutId);

      // SDK returns response.embeddings[] in input order.
      const batchEmbeddings = (response.embeddings || []).map((e: any) => e.values as number[]);
      if (batchEmbeddings.length !== batch.length) {
        throw new Error(`Gemini returned ${batchEmbeddings.length} embeddings for ${batch.length} inputs`);
      }
      all.push(...batchEmbeddings);

      log.debug('Gemini batch embedded', {
        batchIndex: i / MAX_BATCH_SIZE,
        batchSize: batch.length,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      log.error('Gemini embedding generation failed', {
        batchIndex: i / MAX_BATCH_SIZE,
        batchSize: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  return all;
}
