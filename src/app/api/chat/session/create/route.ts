/**
 * POST /api/chat/session/create
 * יצירת session חדש במסד הנתונים
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, username } = body;

    if (!sessionId || !username) {
      return NextResponse.json(
        { error: 'sessionId and username are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get account
    const { data: account } = await supabase
      .from('influencer_accounts')
      .select('id')
      .eq('username', username)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Create session in chat_sessions table
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert({
        id: sessionId,
        influencer_id: account.id,
        user_identifier: sessionId, // For anonymous users
        is_follower: false,
        state: 'Chat.Active',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // If session already exists, that's okay
      if (error.code === '23505') {
        return NextResponse.json({ success: true, exists: true });
      }
      
      console.error('[Session Create] Error:', error);
      return NextResponse.json(
        { error: 'Failed to create session', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId: session.id,
    });

  } catch (error: any) {
    console.error('[Session Create] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
