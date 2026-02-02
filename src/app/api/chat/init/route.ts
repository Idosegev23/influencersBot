/**
 * GET /api/chat/init
 * אתחול session + טעינת הודעת ברכה
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccountByUsername } from '@/lib/supabase';

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

    return NextResponse.json({
      greeting,
      quickReplies,
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
