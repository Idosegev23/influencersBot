/**
 * GET /api/chat/session/validate
 * בודק אם session תקף
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { valid: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if session exists
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select('id, created_at')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return NextResponse.json({ valid: false });
    }

    // Check if session is not too old (30 days)
    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    if (sessionAge > maxAge) {
      return NextResponse.json({ valid: false, reason: 'expired' });
    }

    return NextResponse.json({ valid: true, sessionId: session.id });

  } catch (error: any) {
    console.error('[Session Validate] Error:', error);
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
