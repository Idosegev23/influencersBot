/**
 * GET /api/chat/stats
 * מחזיר סטטיסטיקות חיות על הצ'אטבוט
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

    // Get account
    const account = await getAccountByUsername(username);

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    const supabase = await createClient();

    // Get conversation stats
    const { data: conversations } = await supabase
      .from('chatbot_conversations_v2')
      .select('id, created_at, message_count')
      .eq('account_id', account.id);

    // Get total messages
    const { count: totalMessages } = await supabase
      .from('chatbot_messages')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', account.id);

    // Get satisfaction ratings
    const { data: ratings } = await supabase
      .from('satisfaction_surveys')
      .select('rating')
      .eq('account_id', account.id)
      .not('rating', 'is', null);

    const avgRating = ratings && ratings.length > 0
      ? ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / ratings.length
      : null;

    return NextResponse.json({
      totalConversations: conversations?.length || 0,
      totalMessages: totalMessages || 0,
      satisfactionRate: avgRating ? avgRating * 20 : null, // Convert 1-5 to 0-100%
      activeConversations: conversations?.filter(c => 
        new Date(c.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length || 0,
    });

  } catch (error: any) {
    console.error('[Chat Stats] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
