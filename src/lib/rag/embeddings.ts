/**
 * Embedding Generation
 * Uses Google Gemini gemini-embedding-001 (1536 dimensions).
 * Batches requests for efficiency.
 */

import { getGeminiClient, MODELS, EMBEDDING_DIMENSIONS } from '@/lib/ai/google-client';
import { createLogger } from './logger';

const log = createLogger('embeddings');

const EMBEDDING_MODEL = MODELS.EMBEDDING;
const MAX_BATCH_SIZE = 100;
const MAX_CHARS_PER_INPUT = 8000 * 4; // ~8K tokens

/**
 * Generate embedding for a single text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const results = await generateEmbeddings([text]);
  return results[0];
}

/**
 * Generate embeddings for multiple texts (batched).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getGeminiClient();
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    // Truncate texts that are too long
    const safeBatch = batch.map(t =>
      t.length > MAX_CHARS_PER_INPUT ? t.substring(0, MAX_CHARS_PER_INPUT) : t,
    );

    try {
      // Gemini embedContent supports batch via contents array
      const response = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: safeBatch.map(t => ({ parts: [{ text: t }] })),
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      });

      // Extract embeddings from response
      const batchEmbeddings = (response as any).embeddings
        ? (response as any).embeddings.map((e: any) => e.values)
        : [(response as any).embedding?.values];

      allEmbeddings.push(...batchEmbeddings);

      log.debug('Batch embeddings generated', {
        batchIndex: i / MAX_BATCH_SIZE,
        batchSize: batch.length,
      });
    } catch (err) {
      log.error('Embedding generation failed', {
        batchIndex: i / MAX_BATCH_SIZE,
        batchSize: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  return allEmbeddings;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
