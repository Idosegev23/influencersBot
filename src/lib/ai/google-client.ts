/**
 * Centralized Google Gemini AI client
 * Single source of truth for all Gemini model constants and client initialization.
 */

import { GoogleGenAI } from '@google/genai';

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

/** Model constants — single place to update when new versions drop */
export const MODELS = {
  /** Main chat — best quality/speed ratio ($0.50/$3 per 1M) */
  CHAT_FAST: 'gemini-3-flash-preview',
  /** Cheapest chat — widget, understanding engine ($0.25/$1.50 per 1M) */
  CHAT_LITE: 'gemini-3.1-flash-lite-preview',
  /** Complex tasks — persona building, deep analysis ($2/$12 per 1M) */
  COMPLEX: 'gemini-3.1-pro-preview',
  /** Embeddings — free tier: 100 RPM / 1,000 RPD */
  EMBEDDING: 'gemini-embedding-001',
  /** Reranking — already in use in rerank.ts */
  RERANK: 'gemini-2.5-flash',
  /** Query expansion — already in use in retrieve.ts */
  EXPAND: 'gemini-2.5-flash-lite',
} as const;

/** Embedding dimensions — kept at 1536 to match existing DB schema (no migration needed) */
export const EMBEDDING_DIMENSIONS = 1536;
