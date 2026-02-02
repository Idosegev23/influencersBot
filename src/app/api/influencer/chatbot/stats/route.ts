/**
 * GET /api/influencer/chatbot/stats
 * מחזיר סטטיסטיקות של הצ'אטבוט
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const accountId = account.id;

    // Get stats from various sources
    const [postsCount, commentsCount, persona, latestJob] = await Promise.all([
      // Total posts
      supabase
        .from('instagram_posts')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId),

      // Total comments
      supabase
        .from('instagram_comments')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId),

      // Persona with topics
      supabase
        .from('chatbot_persona')
        .select('preprocessing_data, last_full_scrape_at, scrape_stats')
        .eq('account_id', accountId)
        .single(),

      // Latest scraping job
      supabase
        .from('scraping_jobs')
        .select('completed_at, status')
        .eq('account_id', accountId)
        .order('completed_at', { ascending: false })
        .limit(1)
        .single(),

      // Latest profile
      supabase
        .from('instagram_profile_history')
        .select('followers_count')
        .eq('account_id', accountId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const topicsCount = persona.data?.preprocessing_data?.topics?.length || 0;

    return NextResponse.json({
      totalPosts: postsCount.count || 0,
      totalComments: commentsCount.count || 0,
      topicsCount,
      lastScrape: latestJob.data?.completed_at || persona.data?.last_full_scrape_at || null,
      followers: 0, // Will be filled from profile
    });

  } catch (error: any) {
    console.error('[Chatbot Stats] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
