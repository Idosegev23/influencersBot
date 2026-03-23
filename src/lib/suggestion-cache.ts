/**
 * Suggestion RAG Cache — "Warm RAG, Fresh Voice"
 *
 * Caches only the RAG retrieval results (knowledge chunks + archetype routing),
 * NOT the final LLM response. This means:
 * - Pre-warm is CHEAP (DB queries only, no LLM cost)
 * - LLM always runs fresh → unique wording, personalization works
 * - ~2-3s on suggestion click (vs 6-9s without cache)
 *
 * Flow:
 * 1. /api/chat/init → fire-and-forget prewarmSuggestionRAG()
 * 2. /api/chat/stream → if fromSuggestion, check RAG cache
 * 3. Cache hit → skip RAG retrieval, run LLM fresh (~2-3s)
 * 4. Cache miss → full pipeline as usual (~6-9s)
 */

import { createClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';
import type { KnowledgeBase } from '@/lib/chatbot/knowledge-retrieval';

const CACHE_TTL_MINUTES = 10;

/** Cached RAG result: knowledge + archetype routing */
export interface CachedRAGResult {
  knowledgeBase: KnowledgeBase;
  archetype: string;
  confidence: number;
}

/** Normalize query before hashing — trim, collapse whitespace, remove punctuation */
function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[?!.,؟…]+$/g, '')
    .replace(/^[?!.,؟…]+/g, '');
}

function hashQuery(accountId: string, query: string): string {
  return createHash('md5').update(`${accountId}:${normalizeQuery(query)}`).digest('hex').slice(0, 16);
}

/**
 * Check if we have cached RAG results for this suggestion
 */
export async function getCachedSuggestionRAG(
  accountId: string,
  query: string
): Promise<CachedRAGResult | null> {
  try {
    const supabase = await createClient();
    const hash = hashQuery(accountId, query);

    const { data } = await supabase
      .from('suggestion_response_cache')
      .select('rag_data, archetype')
      .eq('account_id', accountId)
      .eq('query_hash', hash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!data?.rag_data) return null;

    return {
      knowledgeBase: data.rag_data.knowledgeBase,
      archetype: data.rag_data.archetype || data.archetype || 'general',
      confidence: data.rag_data.confidence ?? 0.8,
    };
  } catch {
    return null;
  }
}

/**
 * Store RAG results in the cache (upsert)
 */
export async function cacheSuggestionRAG(
  accountId: string,
  query: string,
  ragResult: CachedRAGResult
): Promise<void> {
  try {
    const supabase = await createClient();
    const hash = hashQuery(accountId, query);
    const expiresAt = new Date(Date.now() + CACHE_TTL_MINUTES * 60 * 1000).toISOString();

    await supabase
      .from('suggestion_response_cache')
      .upsert({
        account_id: accountId,
        query_hash: hash,
        query_text: query,
        rag_data: {
          knowledgeBase: ragResult.knowledgeBase,
          archetype: ragResult.archetype,
          confidence: ragResult.confidence,
        },
        archetype: ragResult.archetype,
        expires_at: expiresAt,
      }, { onConflict: 'account_id,query_hash' });
  } catch (err: any) {
    console.error('[SuggestionRAG] Failed to cache:', err.message);
  }
}

/**
 * Pre-warm: run ONLY RAG retrieval (no LLM) for suggested questions.
 * This is cheap — just DB vector search + text search, no AI model calls.
 * Fire-and-forget from /api/chat/init.
 */
export async function prewarmSuggestionRAG(
  accountId: string,
  suggestions: string[]
): Promise<void> {
  if (suggestions.length === 0) return;
  const start = Date.now();

  // Dynamic imports to avoid circular deps
  const { routeToArchetype } = await import('@/lib/chatbot/archetypes/intentRouter');
  const { retrieveKnowledge } = await import('@/lib/chatbot/knowledge-retrieval');

  const toProcess = suggestions.slice(0, 4);
  let cached = 0;

  // Check which ones are already cached
  const cacheChecks = await Promise.all(
    toProcess.map(async (s) => ({
      suggestion: s,
      exists: !!(await getCachedSuggestionRAG(accountId, s)),
    }))
  );
  const uncached = cacheChecks.filter(c => !c.exists).map(c => c.suggestion);
  cached += cacheChecks.filter(c => c.exists).length;

  if (uncached.length === 0) {
    console.log(`[SuggestionRAG] All ${toProcess.length} already cached (${Date.now() - start}ms)`);
    return;
  }

  // Run uncached suggestions in parallel (RAG is cheap, so can be aggressive)
  const results = await Promise.allSettled(
    uncached.map(async (suggestion) => {
      // Step 1: Route to archetype (regex-based, instant)
      const classification = await routeToArchetype({
        userMessage: suggestion,
        conversationHistory: [],
        accountContext: { accountId, username: '' },
      });

      // Step 2: Retrieve knowledge (DB queries only — no LLM)
      const knowledgeBase = await retrieveKnowledge(
        accountId,
        classification.primaryArchetype as any,
        suggestion,
        10 // limit
      );

      // Step 3: Cache the result
      await cacheSuggestionRAG(accountId, suggestion, {
        knowledgeBase,
        archetype: classification.primaryArchetype,
        confidence: classification.confidence,
      });
      return true;
    })
  );

  cached += results.filter(r => r.status === 'fulfilled' && r.value).length;
  const failed = results.filter(r => r.status === 'rejected');
  failed.forEach((r, idx) => {
    console.error(`[SuggestionRAG] Failed to pre-warm "${uncached[idx]?.slice(0, 30)}":`, (r as PromiseRejectedResult).reason?.message);
  });

  console.log(`[SuggestionRAG] Pre-warmed ${cached}/${toProcess.length} RAG results in ${Date.now() - start}ms (no LLM calls)`);
}

/**
 * Cleanup expired entries (call from cron or occasionally)
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('suggestion_response_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');
    return data?.length || 0;
  } catch {
    return 0;
  }
}
