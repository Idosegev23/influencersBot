/**
 * Hybrid Multi-Stage Chat Endpoint
 * Test endpoint for the new retrieval system
 */

import { NextRequest, NextResponse } from 'next/server';
import { processWithHybridAndPersona } from '@/lib/chatbot/sandwich-bot-hybrid';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { message, username } = await req.json();

    if (!message || !username) {
      return NextResponse.json(
        { error: 'Missing message or username' },
        { status: 400 }
      );
    }

    console.log(`\n🚀 [Hybrid API] Request for @${username}`);
    console.log(`📝 Message: ${message}`);

    // Get account info
    const supabase = await createClient();
    const { data: persona } = await supabase
      .from('chatbot_persona')
      .select('account_id, name, tone')
      .eq('instagram_username', username)
      .single();

    if (!persona) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      );
    }

    // Process with Hybrid Multi-Stage
    const startTime = Date.now();
    const response = await processWithHybridAndPersona(
      persona.account_id,
      message,
      persona.name,
      persona.tone || 'ידידותי וחם',
      [] // No history for now
    );
    const duration = Date.now() - startTime;

    console.log(`✅ [Hybrid API] Complete in ${duration}ms`);

    return NextResponse.json({
      response,
      metadata: {
        duration,
        model: 'hybrid-multi-stage',
        username,
      },
    });

  } catch (error) {
    console.error('[Hybrid API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const maxDuration = 30; // 30 seconds for function calling
