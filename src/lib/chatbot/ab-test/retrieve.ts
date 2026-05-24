/**
 * Minimal engine-pluggable retrieval for the internal /internal/ab/[token] page.
 *
 * Keeps the comparison APPLES-TO-APPLES: only the embedding model + vector
 * column differ between OpenAI and Gemini. No query expansion, no reranking,
 * no LDRS-specific scoring — just raw vector search.
 *
 * Production retrieval (src/lib/rag/retrieve.ts) is untouched.
 */

import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/rag/embeddings';
import { generateGeminiEmbedding } from '@/lib/rag/gemini-embeddings';

export type Engine = 'openai' | 'gemini';

export interface AbRetrievedChunk {
  id: string;
  documentId: string;
  entityType: string;
  chunkText: string;
  similarity: number;
  updatedAt: string;
}

export interface AbRetrievalResult {
  chunks: AbRetrievedChunk[];
  embeddingMs: number;
  searchMs: number;
}

export async function abRetrieve(opts: {
  engine: Engine;
  accountId: string;
  query: string;
  topK?: number;
  threshold?: number;
}): Promise<AbRetrievalResult> {
  const { engine, accountId, query } = opts;
  const topK = opts.topK ?? 8;
  const threshold = opts.threshold ?? 0.3;

  const embedStart = Date.now();
  const embedding = engine === 'openai'
    ? await generateEmbedding(query)
    : await generateGeminiEmbedding(query);
  const embeddingMs = Date.now() - embedStart;

  if (!embedding) {
    return { chunks: [], embeddingMs, searchMs: 0 };
  }

  const searchStart = Date.now();
  const supabase = createClient();
  const rpcName = engine === 'openai' ? 'match_document_chunks' : 'match_document_chunks_gemini';

  const { data, error } = await supabase.rpc(rpcName, {
    p_account_id: accountId,
    p_embedding: JSON.stringify(embedding),
    p_match_count: topK,
    p_match_threshold: threshold,
    p_entity_types: null,
    p_updated_after: null,
    p_topics: null,
  });
  const searchMs = Date.now() - searchStart;

  if (error) {
    console.error('[AB Retrieve] RPC error', { engine, rpcName, error: error.message });
    return { chunks: [], embeddingMs, searchMs };
  }

  const chunks: AbRetrievedChunk[] = (data || []).map((r: any) => ({
    id: r.id,
    documentId: r.document_id,
    entityType: r.entity_type,
    chunkText: r.chunk_text,
    similarity: r.similarity,
    updatedAt: r.updated_at,
  }));

  return { chunks, embeddingMs, searchMs };
}

/**
 * Format retrieved chunks as a context block for the LLM. Same shape for both
 * engines so the only difference reaching the model is *which* chunks made it.
 */
export function formatChunksForContext(chunks: AbRetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  return chunks
    .map((c, i) => `[Source ${i + 1} | ${c.entityType} | sim=${c.similarity.toFixed(3)}]\n${c.chunkText}`)
    .join('\n\n---\n\n');
}
