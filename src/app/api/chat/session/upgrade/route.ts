/**
 * POST /api/chat/session/upgrade
 * Upgrade anonymous session to identified user (by email)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, email } = body;

    if (!sessionId || !email) {
      return NextResponse.json(
        { error: 'sessionId and email are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('chat_sessions')
      .update({
        user_identifier: email,
        is_follower: true,
      })
      .eq('id', sessionId);

    if (error) {
      console.error('[Session Upgrade] Error:', error);
      return NextResponse.json(
        { error: 'Failed to upgrade session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Session Upgrade] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
