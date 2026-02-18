/**
 * Reranker Module
 *
 * Takes vector search candidates and reranks them using a lightweight
 * LLM scoring step. Returns top N results sorted by relevance.
 *
 * Strategy:
 * 1. If candidates <= finalK, return as-is (no reranking needed)
 * 2. Otherwise, use GPT-5 Nano to score each candidate against the query
 * 3. Combine similarity score + rerank score with configurable weights
 */

import OpenAI from 'openai';
import { createLogger } from './logger';
import type { RerankCandidate, RerankResult } from './types';

const log = createLogger('rerank');

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export interface RerankOptions {
  /** Number of final results to return (default: 5) */
  finalK?: number;
  /** Weight for vector similarity [0-1] (default: 0.4) */
  similarityWeight?: number;
  /** Weight for rerank score [0-1] (default: 0.6) */
  rerankWeight?: number;
}

const DEFAULTS: Required<RerankOptions> = {
  finalK: 5,
  similarityWeight: 0.4,
  rerankWeight: 0.6,
};

/**
 * Rerank candidates using LLM scoring.
 */
export async function rerankCandidates(
  query: string,
  candidates: RerankCandidate[],
  options?: RerankOptions
): Promise<RerankResult[]> {
  const opts = { ...DEFAULTS, ...options };

  if (candidates.length === 0) return [];

  // If we have fewer candidates than desired, just pass through
  if (candidates.length <= opts.finalK) {
    return candidates.map(c => ({
      id: c.id,
      score: c.similarity,
      originalSimilarity: c.similarity,
    }));
  }

  const client = getClient();

  // Build the scoring prompt
  const candidateList = candidates
    .map((c, i) => `[${i}] ${c.text.substring(0, 300)}`)
    .join('\n\n');

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        {
          role: 'system',
          content: `You are a relevance scorer. Given a user query and a list of text passages, rate each passage's relevance to the query on a scale of 0-10 (10 = perfectly relevant, 0 = completely irrelevant).

Respond ONLY with a JSON array of scores in order, like: [8, 3, 9, 1, 5, ...]
No explanations, just the array.`,
        },
        {
          role: 'user',
          content: `Query: "${query}"

Passages:
${candidateList}

Rate each passage (0-10):`,
        },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    const content = response.choices[0].message.content || '[]';

    // Parse scores - handle various formats
    let scores: number[];
    try {
      const match = content.match(/\[[\s\S]*?\]/);
      scores = match ? JSON.parse(match[0]) : [];
    } catch {
      log.warn('Failed to parse rerank scores, using similarity only', { content });
      scores = [];
    }

    // Build combined scores
    const results: RerankResult[] = candidates.map((c, i) => {
      const rerankScore = (scores[i] ?? 5) / 10; // Normalize to 0-1
      const combinedScore =
        opts.similarityWeight * c.similarity +
        opts.rerankWeight * rerankScore;

      return {
        id: c.id,
        score: combinedScore,
        originalSimilarity: c.similarity,
      };
    });

    // Sort by combined score descending and take top K
    results.sort((a, b) => b.score - a.score);

    log.info('Reranking complete', {
      candidateCount: candidates.length,
      finalCount: Math.min(opts.finalK, results.length),
      topScore: results[0]?.score,
      bottomScore: results[Math.min(opts.finalK, results.length) - 1]?.score,
    });

    return results.slice(0, opts.finalK);
  } catch (err) {
    log.error('Reranking failed, falling back to similarity', {
      error: err instanceof Error ? err.message : String(err),
    });

    // Fallback: just sort by similarity
    return candidates
      .map(c => ({
        id: c.id,
        score: c.similarity,
        originalSimilarity: c.similarity,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.finalK);
  }
}
