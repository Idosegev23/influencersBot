/**
 * GET /api/chat/init
 * אתחול session + טעינת הודעת ברכה
 * Also fire-and-forget pre-warms RAG cache for suggested queries
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccountByUsername } from '@/lib/supabase';
import { prewarmSuggestionCache } from '@/lib/suggestion-cache';

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

    // Fire-and-forget: pre-warm suggestion response cache (DB-based, works across serverless instances)
    const allSuggestions = [...quickReplies, ...topicSuggestions.slice(0, 6)];
    prewarmSuggestionCache(account.id, username, displayName, allSuggestions.slice(0, 4))
      .catch(err => console.error('[Chat Init] Pre-warm failed (non-blocking):', err.message));

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

