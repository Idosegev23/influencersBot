/**
 * Embedding Generation
 * Uses OpenAI text-embedding-3-small (1536 dimensions).
 * Batches requests for efficiency.
 * Includes timeout protection and Redis caching.
 */

import OpenAI from 'openai';
import { createLogger } from './logger';
import crypto from 'crypto';

const log = createLogger('embeddings');

const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 2000; // Matryoshka truncation — max for pgvector HNSW index
const MAX_BATCH_SIZE = 100; // OpenAI limit per request
const MAX_TOKENS_PER_INPUT = 8191; // Model limit
const EMBEDDING_TIMEOUT_MS = 15000; // 15s timeout — 3072d embeddings are larger

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// Simple in-memory cache for single-query embeddings (chat queries)
// NOTE: Map insertion-order eviction ≈ FIFO, not true LRU. Fine for current scale.
const embeddingCache = new Map<string, { embedding: number[]; ts: number }>();
const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCacheKey(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

function getCachedEmbedding(text: string): number[] | null {
  const key = getCacheKey(text);
  const entry = embeddingCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.embedding;
  if (entry) embeddingCache.delete(key);
  return null;
}

function setCachedEmbedding(text: string, embedding: number[]): void {
  if (embeddingCache.size >= CACHE_MAX_SIZE) {
    // Evict oldest
    const oldest = embeddingCache.keys().next().value;
    if (oldest) embeddingCache.delete(oldest);
  }
  embeddingCache.set(getCacheKey(text), { embedding, ts: Date.now() });
}

/**
 * Generate embedding for a single text (with cache).
 * Returns null on timeout so callers can fall back to keyword-only search.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  // Check cache first
  const cached = getCachedEmbedding(text);
  if (cached) {
    log.debug('Embedding cache hit', { textLen: text.length });
    return cached;
  }

  try {
    const results = await generateEmbeddings([text]);
    const embedding = results[0];

    // Cache single-query embeddings (chat queries, not batch ingestion)
    setCachedEmbedding(text, embedding);

    return embedding;
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    if (isTimeout) {
      log.warn('Embedding timeout — caller should fall back to keyword-only search');
      return null;
    }
    throw err;
  }
}

/**
 * Generate embeddings for multiple texts (batched, with timeout).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  const allEmbeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    // Truncate texts that are too long
    const safeBatch = batch.map(t => {
      if (t.length > MAX_TOKENS_PER_INPUT * 4) {
        return t.substring(0, MAX_TOKENS_PER_INPUT * 4);
      }
      return t;
    });

    // Timeout protection — prevents 141s hangs on OpenAI API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

    try {
      const response = await client.embeddings.create(
        {
          model: EMBEDDING_MODEL,
          input: safeBatch,
          dimensions: EMBEDDING_DIMENSIONS,
        },
        { signal: controller.signal as any }
      );

      clearTimeout(timeoutId);

      const batchEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);

      allEmbeddings.push(...batchEmbeddings);

      log.debug('Batch embeddings generated', {
        batchIndex: i / MAX_BATCH_SIZE,
        batchSize: batch.length,
        tokensUsed: response.usage?.total_tokens,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      log.error(isTimeout ? 'Embedding timeout' : 'Embedding generation failed', {
        batchIndex: i / MAX_BATCH_SIZE,
        batchSize: batch.length,
        timeoutMs: isTimeout ? EMBEDDING_TIMEOUT_MS : undefined,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  return allEmbeddings;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
