/**
 * Suggestion Response Cache
 *
 * Pre-generates full-quality responses for suggested questions
 * and stores them in Supabase (shared across serverless instances).
 *
 * Flow:
 * 1. /api/chat/init → fire-and-forget prewarmSuggestionCache()
 * 2. /api/chat/stream → if fromSuggestion, check cache first
 * 3. Cache hit → return instantly (< 50ms DB lookup vs 9s pipeline)
 * 4. Cache miss → run full pipeline as usual
 */

import { createClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

const CACHE_TTL_MINUTES = 30;

function hashQuery(accountId: string, query: string): string {
  return createHash('md5').update(`${accountId}:${query}`).digest('hex').slice(0, 16);
}

/**
 * Check if we have a cached response for this suggestion
 */
export async function getCachedSuggestionResponse(
  accountId: string,
  query: string
): Promise<string | null> {
  try {
    const supabase = await createClient();
    const hash = hashQuery(accountId, query);

    const { data } = await supabase
      .from('suggestion_response_cache')
      .select('response_text')
      .eq('account_id', accountId)
      .eq('query_hash', hash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    return data?.response_text || null;
  } catch {
    return null;
  }
}

/**
 * Store a response in the cache (upsert)
 */
export async function cacheSuggestionResponse(
  accountId: string,
  query: string,
  response: string,
  archetype?: string
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
        response_text: response,
        archetype,
        expires_at: expiresAt,
      }, { onConflict: 'account_id,query_hash' });
  } catch (err: any) {
    console.error('[SuggestionCache] Failed to cache:', err.message);
  }
}

/**
 * Pre-warm: generate full-quality responses for suggestions and cache them.
 * Runs the FULL pipeline (RAG + keyword supplement + LLM rerank + GPT response).
 * Fire-and-forget from /api/chat/init.
 */
export async function prewarmSuggestionCache(
  accountId: string,
  username: string,
  influencerName: string,
  suggestions: string[]
): Promise<void> {
  if (suggestions.length === 0) return;
  const start = Date.now();

  // Import dynamically to avoid circular deps
  const { processSandwichMessageWithMetadata } = await import('@/lib/chatbot/sandwichBot');

  // Process suggestions sequentially to avoid overwhelming the API
  let cached = 0;
  for (const suggestion of suggestions.slice(0, 4)) {
    try {
      // Check if already cached and not expired
      const existing = await getCachedSuggestionResponse(accountId, suggestion);
      if (existing) {
        cached++;
        continue;
      }

      // Run FULL pipeline — no shortcuts
      const result = await processSandwichMessageWithMetadata({
        userMessage: suggestion,
        accountId,
        username,
        influencerName,
        conversationHistory: [],
      });

      if (result.response && result.response.length > 10) {
        await cacheSuggestionResponse(
          accountId,
          suggestion,
          result.response,
          result.metadata?.archetype
        );
        cached++;
      }
    } catch (err: any) {
      console.error(`[SuggestionCache] Failed to pre-warm "${suggestion.slice(0, 30)}":`, err.message);
    }
  }

  console.log(`[SuggestionCache] Pre-warmed ${cached}/${Math.min(suggestions.length, 4)} in ${Date.now() - start}ms`);
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
