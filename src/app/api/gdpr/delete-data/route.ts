import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, email, reason } = await req.json();

    // Validate input
    if (!sessionId && !email) {
      return NextResponse.json(
        { error: 'Either sessionId or email is required' },
        { status: 400 }
      );
    }

    // If sessionId is provided, delete session data
    if (sessionId) {
      // Delete chat messages first (foreign key constraint)
      const { error: messagesError } = await supabase
        .from('chat_messages')
        .delete()
        .eq('session_id', sessionId);

      if (messagesError) {
        console.error('Error deleting messages:', messagesError);
        return NextResponse.json(
          { error: 'Failed to delete messages' },
          { status: 500 }
        );
      }

      // Delete the session
      const { error: sessionError } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (sessionError) {
        console.error('Error deleting session:', sessionError);
        return NextResponse.json(
          { error: 'Failed to delete session' },
          { status: 500 }
        );
      }

      // Delete analytics events for this session
      await supabase
        .from('analytics_events')
        .delete()
        .eq('session_id', sessionId);

      return NextResponse.json({
        success: true,
        message: 'Session data deleted successfully',
      });
    }

    // If email is provided, log the deletion request
    // In production, this would trigger a manual review process
    if (email) {
      const { error: requestError } = await supabase
        .from('data_deletion_requests')
        .insert({
          email,
          reason: reason || 'Not specified',
          status: 'pending',
          created_at: new Date().toISOString(),
        });

      if (requestError) {
        // Table might not exist, just log the request
        console.log('Data deletion request received:', { email, reason });
      }

      return NextResponse.json({
        success: true,
        message: 'Deletion request received. We will process it within 30 days.',
      });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Error processing deletion request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 }
    );
  }

  // Get session data for export (right to data portability)
  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    session,
    messages: messages || [],
  });
}

