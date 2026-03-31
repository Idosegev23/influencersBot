/**
 * GET /api/influencer/chatbot/history
 * מחזיר היסטוריית סריקות
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

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

    // Require influencer or admin auth
    const isInfluencer = await checkInfluencerAuth(username);
    const isAdmin = !(await requireAdminAuth());
    if (!isInfluencer && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get account ID
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('username', username)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Get scraping jobs history
    const { data: jobs, error } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[Chatbot History] Error:', error);
      return NextResponse.json(
        { error: 'Failed to load history', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      jobs: jobs || [],
    });

  } catch (error: any) {
    console.error('[Chatbot History] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
