/**
 * Embedding Generation
 * Uses OpenAI text-embedding-3-small (1536 dimensions).
 * Batches requests for efficiency.
 */

import OpenAI from 'openai';
import { createLogger } from './logger';

const log = createLogger('embeddings');

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100; // OpenAI limit per request
const MAX_TOKENS_PER_INPUT = 8191; // Model limit

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

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

    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: safeBatch,
        dimensions: EMBEDDING_DIMENSIONS,
      });

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
