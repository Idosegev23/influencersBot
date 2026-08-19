/**
 * GET /api/influencer/reels — candidate reels for the widget-editor's banner
 * rotation picker.
 *
 * Authenticated via influencer session cookie, same as
 * /api/influencer/settings. Lists up to 30 reel/video posts that have at
 * least a persisted poster image, ranked by view count, and marks which of
 * them already have a persisted playable mp4 (only those can be selected —
 * see the `video` field's doc below) and which are currently part of the
 * account's `config.reels` rotation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySessionToken, influencerSubject } from '@/lib/auth/session-token';

const COOKIE_PREFIX = 'influencer_session_';
const CANDIDATE_LIMIT = 30;

/**
 * Videos are persisted to `reel-video/${accountId}/${shortcode}.mp4`
 * (scripts/persist-reel-videos.ts) and the resulting public URL is written
 * to `config.reels` — there is no per-post column for it. `config.reels` is
 * therefore the only source of truth for "does this shortcode have a
 * playable mp4 right now"; matching by the shortcode embedded in the file
 * name is how a post row gets connected back to it.
 */
function findPersistedVideo(reels: unknown, shortcode: string): string | null {
  if (!Array.isArray(reels)) return null;
  for (const r of reels) {
    const video = (r as { video?: unknown } | null)?.video;
    if (typeof video === 'string' && video.endsWith(`/${shortcode}.mp4`)) return video;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 });
    }

    // ── Auth: verify influencer session cookie ──
    const cookieStore = await cookies();
    const session = cookieStore.get(`${COOKIE_PREFIX}${username}`);
    if (!verifySessionToken(session?.value, influencerSubject(username))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // ── Find account by username (same lookup as /api/influencer/settings) ──
    const { data: account, error: fetchErr } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('config->>username', username)
      .eq('status', 'active')
      .maybeSingle();

    if (fetchErr || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const currentReels = (account.config as any)?.reels;

    const { data: posts, error: postsErr } = await supabase
      .from('instagram_posts')
      .select('shortcode, stored_media_urls, stored_thumbnail_url, views_count, type')
      .eq('account_id', account.id)
      .in('type', ['reel', 'video'])
      .not('stored_media_urls', 'is', null)
      .order('views_count', { ascending: false })
      .limit(CANDIDATE_LIMIT);

    if (postsErr) {
      console.error('[influencer/reels] posts query error:', postsErr);
      return NextResponse.json({ error: 'Failed to load reels' }, { status: 500 });
    }

    const reels = (posts || []).map((p: any) => {
      // Same priority scripts/persist-reel-videos.ts uses when it first
      // writes a reel's poster into config.reels (stored_media_urls[0], the
      // persisted post image, before stored_thumbnail_url) — matching it
      // means re-selecting an already-persisted reel through this route
      // reproduces the exact poster URL already on file instead of quietly
      // swapping it for an equally-valid but different persisted image.
      const poster: string | null = p.stored_media_urls?.[0] || p.stored_thumbnail_url || null;
      // A reel that has never been through persist-reel-videos.ts has a
      // poster but no playable mp4 — only offer it when a video URL exists.
      const video = findPersistedVideo(currentReels, p.shortcode);
      return {
        shortcode: p.shortcode as string,
        poster,
        video,
        selected: video !== null,
      };
    });

    return NextResponse.json({ reels });
  } catch (error: any) {
    console.error('[influencer/reels] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}
