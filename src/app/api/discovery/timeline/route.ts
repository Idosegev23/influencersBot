/**
 * GET /api/discovery/timeline
 * Returns recent posts for media_news accounts — chronological timeline.
 * Query params: username, limit (default 10)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccountByUsername } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }

    const account = await getAccountByUsername(username);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const supabase = await createClient();

    const { data: posts, error } = await supabase
      .from('instagram_posts')
      .select('id, caption, likes_count, comments_count, views_count, posted_at, thumbnail_url, media_url')
      .eq('account_id', account.id)
      .order('posted_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format timeline items — extract headline from first line of caption
    const items = (posts || []).map((p: any) => {
      const caption = (p.caption || '').replace(/[\t\u2068\u2069]/g, '').trim();
      const firstLine = caption.split('\n')[0]?.trim() || '';
      // Truncate headline to ~80 chars
      const headline = firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
      // Get a short preview (2-3 lines)
      const preview = caption.split('\n').slice(0, 3).join(' ').substring(0, 150).trim();

      return {
        id: p.id,
        headline,
        preview,
        postedAt: p.posted_at,
        likes: p.likes_count || 0,
        views: p.views_count || 0,
        thumbnailUrl: p.thumbnail_url || p.media_url || null,
      };
    });

    return NextResponse.json({ items }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error: any) {
    console.error('[API/discovery/timeline] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
