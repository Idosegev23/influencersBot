/**
 * Reranker Module
 *
 * Takes vector search candidates and reranks them using a lightweight
 * LLM scoring step. Returns top N results sorted by relevance.
 *
 * Strategy:
 * 1. If candidates <= finalK, return as-is (no reranking needed)
 * 2. Otherwise, use Gemini 2.5 Flash (thinkingBudget=0) to score each candidate against the query
 * 3. Combine similarity score + rerank score with configurable weights
 */

import { GoogleGenAI } from '@google/genai';
import { createLogger } from './logger';
import type { RerankCandidate, RerankResult } from './types';

const log = createLogger('rerank');

let geminiClient: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return geminiClient;
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

  // Cap candidates for speed — fewer = faster LLM call
  const maxCandidates = 15;
  const scoringCandidates = candidates.length > maxCandidates
    ? candidates.slice(0, maxCandidates)
    : candidates;

  // Build the scoring prompt
  const candidateList = scoringCandidates
    .map((c, i) => `[${i}] ${c.text.substring(0, 300)}`)
    .join('\n\n');

  try {
    const gemini = getGemini();
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Query: "${query}"

Passages:
${candidateList}

Rate each passage (0-10):`,
      config: {
        systemInstruction: `You are a relevance scorer. Given a user query and a list of text passages, rate each passage's relevance on a scale of 0-10.
10 = directly answers the query or contains exactly what was asked for
7-9 = highly relevant, contains related/useful information
4-6 = somewhat related but doesn't answer the query
1-3 = barely related
0 = completely irrelevant

IMPORTANT: Consider semantic relationships. If the query mentions a category (e.g. "pasta"), passages about specific types (e.g. "ravioli", "lasagna") ARE highly relevant. Similarly for other categories.
The query may include "(related: ...)" hints showing related terms — use these to identify relevant passages.

Respond ONLY with a JSON array of scores in order, like: [8, 3, 9, 1, 5, ...]
No explanations, just the array.`,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 200,
        temperature: 0,
      },
    });

    const content = response.text || '[]';

    // Parse scores - handle various formats
    let scores: number[];
    try {
      const match = content.match(/\[[\s\S]*?\]/);
      scores = match ? JSON.parse(match[0]) : [];
    } catch {
      log.warn('Failed to parse rerank scores, using similarity only', { content });
      scores = [];
    }

    // Build combined scores (only for scored candidates)
    const results: RerankResult[] = scoringCandidates.map((c, i) => {
      const rawScore = Math.min(10, Math.max(0, scores[i] ?? 5)); // Clamp to 0-10
      const rerankScore = rawScore / 10; // Normalize to 0-1
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
