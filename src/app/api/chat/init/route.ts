/**
 * GET /api/chat/init
 * אתחול session + טעינת הודעת ברכה
 * Also fire-and-forget pre-warms RAG cache for suggested queries
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccountByUsername } from '@/lib/supabase';
import { generateEmbeddings } from '@/lib/rag/embeddings';
import { cacheWrap } from '@/lib/cache';
import { createHash } from 'crypto';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Get account using the helper function
    const account = await getAccountByUsername(username);

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    const supabase = await createClient();

    // Load persona
    const { data: persona } = await supabase
      .from('chatbot_persona')
      .select('name, voice_rules, knowledge_map')
      .eq('account_id', account.id)
      .single();

    // Extract display name from config
    const displayName = (account.config as any)?.display_name || username;

    // Build greeting message
    let greeting = `שלום! אני הבוט של ${persona?.name || displayName} 😊`;
    
    if (persona?.voice_rules?.tone) {
      // Use voice_rules to craft a better greeting
      greeting += `\nאני כאן כדי לעזור לך עם שאלות, המלצות וקופונים בלעדיים. במה אפשר לעזור?`;
    } else {
      greeting += `\nאיך אפשר לעזור?`;
    }

    // Get quick replies from knowledge map
    const quickReplies: string[] = [];

    if (persona?.knowledge_map?.coreTopics?.length > 0) {
      const topTopics = persona.knowledge_map.coreTopics.slice(0, 3);
      quickReplies.push(...topTopics.map((t: any) => `ספר/י לי על ${t.name}`));
    }

    quickReplies.push('יש קופונים?');

    // Build topic-based suggestion pool for fast follow-ups
    const topicSuggestions: string[] = [];
    if (persona?.knowledge_map?.coreTopics?.length > 0) {
      for (const topic of persona.knowledge_map.coreTopics.slice(0, 8)) {
        const name = topic.name || topic;
        if (typeof name === 'string' && name.length > 0 && name.length < 30) {
          topicSuggestions.push(`מה חדש ב${name}?`);
          topicSuggestions.push(`ספרו לי על ${name}`);
        }
      }
    }
    // Add generic suggestions
    topicSuggestions.push('יש קופון הנחה?', 'מה הכי שווה עכשיו?', 'ספרו לי עוד');

    // Load partnerships count for marketing disclaimer
    const { count: partnershipsCount } = await supabase
      .from('partnerships')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id);

    // Fire-and-forget: pre-warm RAG cache for suggested queries
    const allSuggestions = [...quickReplies, ...topicSuggestions.slice(0, 6)];
    prewarmRagCache(account.id, allSuggestions).catch(err =>
      console.error('[Chat Init] Pre-warm failed (non-blocking):', err.message)
    );

    return NextResponse.json({
      greeting,
      quickReplies,
      topicSuggestions,
      hasCommercialContent: (partnershipsCount || 0) > 0,
      accountId: account.id,
      displayName,
    });

  } catch (error: any) {
    console.error('[Chat Init] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================
// RAG Pre-warming (fire-and-forget)
// ============================================

function queryHash(accountId: string, query: string): string {
  return createHash('md5').update(`${accountId}:${query}`).digest('hex').slice(0, 12);
}

async function prewarmRagCache(accountId: string, queries: string[]): Promise<void> {
  if (queries.length === 0) return;

  const start = Date.now();

  // Batch-generate embeddings for all suggestions at once
  const embeddings = await generateEmbeddings(queries);

  const supabase = await createClient();

  // Run vector searches in parallel, each wrapped in L2 cache
  const results = await Promise.allSettled(
    queries.map(async (query, i) => {
      const cacheKey = `rag:vecs:${queryHash(accountId, query)}`;
      await cacheWrap<{ data: any[] | null; error: any }>(
        cacheKey,
        async () => {
          const res = await supabase.rpc('match_document_chunks', {
            p_account_id: accountId,
            p_embedding: JSON.stringify(embeddings[i]),
            p_match_count: 20,
            p_match_threshold: 0.3,
            p_entity_types: null,
            p_updated_after: null,
          });
          return { data: res.data, error: res.error };
        },
        { ttlMs: 180_000 } // 3 minutes — matches retrieve.ts TTL
      );
    })
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[Chat Init] Pre-warmed ${succeeded}/${queries.length} RAG queries in ${Date.now() - start}ms`);
}
