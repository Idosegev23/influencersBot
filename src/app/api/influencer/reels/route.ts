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
 *
 * The rank window alone is not a safe candidate set: `config.reels` can hold
 * a reel that has aged out of the top 30 by views (persist-reel-videos.ts
 * deliberately favors hand-picked shortcodes over view rank), or — rarer —
 * point at a shortcode whose `instagram_posts` row no longer exists at all
 * (the underlying Instagram post was deleted). Either way, a candidate list
 * that omits an already-selected reel makes it unselectable from the UI
 * forever: the editor's counter would say "5/5" with no tile to deselect.
 * So every shortcode currently in `config.reels` is unioned into the
 * response — enriched from its `instagram_posts` row when one still exists,
 * falling back to the poster/video already stored in `config.reels` when it
 * doesn't (`postMissing: true`, so the picker can explain the tile rather
 * than showing an unexplained poster with no matching post).
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySessionToken, influencerSubject } from '@/lib/auth/session-token';

const COOKIE_PREFIX = 'influencer_session_';
const CANDIDATE_LIMIT = 30;

interface StoredReel {
  video: string;
  poster: string | null;
}

function isStoredReel(r: unknown): r is StoredReel {
  return !!r && typeof r === 'object' && typeof (r as { video?: unknown }).video === 'string';
}

/**
 * Videos are persisted to `reel-video/${accountId}/${shortcode}.mp4`
 * (scripts/persist-reel-videos.ts) and the resulting public URL is written
 * to `config.reels` — there is no per-post column for it. `config.reels` is
 * therefore the only source of truth for "does this shortcode have a
 * playable mp4 right now"; matching by the shortcode embedded in the file
 * name is how a post row gets connected back to it.
 */
function findPersistedVideo(reels: StoredReel[], shortcode: string): string | null {
  for (const r of reels) {
    if (r.video.endsWith(`/${shortcode}.mp4`)) return r.video;
  }
  return null;
}

/** The shortcode embedded in a persisted reel's storage filename, or null. */
function extractShortcode(videoUrl: string): string | null {
  const m = videoUrl.match(/\/([^/]+)\.mp4$/);
  return m ? m[1] : null;
}

interface PostRow {
  shortcode: string;
  stored_media_urls: string[] | null;
  stored_thumbnail_url: string | null;
}

/**
 * Same priority scripts/persist-reel-videos.ts uses when it first writes a
 * reel's poster into config.reels (stored_media_urls[0], the persisted post
 * image, before stored_thumbnail_url) — matching it means re-selecting an
 * already-persisted reel through this route reproduces the exact poster URL
 * already on file instead of quietly swapping it for an equally-valid but
 * different persisted image.
 */
function posterFromPost(p: PostRow): string | null {
  return p.stored_media_urls?.[0] || p.stored_thumbnail_url || null;
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

    const currentReelsRaw = (account.config as any)?.reels;
    const currentReels: StoredReel[] = Array.isArray(currentReelsRaw) ? currentReelsRaw.filter(isStoredReel) : [];

    // shortcode -> stored {video, poster}, first occurrence wins, order
    // preserved — this doubles as "selected, in config.reels order" for the
    // union below.
    const persistedByShortcode = new Map<string, StoredReel>();
    for (const r of currentReels) {
      const sc = extractShortcode(r.video);
      if (sc && !persistedByShortcode.has(sc)) persistedByShortcode.set(sc, r);
    }
    const persistedShortcodes = [...persistedByShortcode.keys()];

    const { data: ranked, error: rankedErr } = await supabase
      .from('instagram_posts')
      .select('shortcode, stored_media_urls, stored_thumbnail_url, views_count, type')
      .eq('account_id', account.id)
      .in('type', ['reel', 'video'])
      .not('stored_media_urls', 'is', null)
      .order('views_count', { ascending: false })
      .limit(CANDIDATE_LIMIT);

    if (rankedErr) {
      console.error('[influencer/reels] ranked posts query error:', rankedErr);
      return NextResponse.json({ error: 'Failed to load reels' }, { status: 500 });
    }

    // Fill in the post row for any selected shortcode the rank window missed
    // — still fetched by explicit shortcode, not by rank, so an aged-out but
    // otherwise-alive post is still enriched with real poster/views data.
    const missingFromRanked = persistedShortcodes.filter(
      (sc) => !(ranked || []).some((p) => p.shortcode === sc),
    );
    let extraPosts: PostRow[] = [];
    if (missingFromRanked.length) {
      const { data, error: extraErr } = await supabase
        .from('instagram_posts')
        .select('shortcode, stored_media_urls, stored_thumbnail_url')
        .eq('account_id', account.id)
        .in('shortcode', missingFromRanked);
      if (extraErr) {
        console.error('[influencer/reels] selected posts query error:', extraErr);
        // Non-fatal — the affected shortcode(s) fall back to config.reels'
        // own stored poster below (postMissing: true), same as a genuinely
        // deleted post. Losing this enrichment must not break the route.
      } else {
        extraPosts = data || [];
      }
    }

    const postByShortcode = new Map<string, PostRow>();
    for (const p of ranked || []) postByShortcode.set(p.shortcode, p);
    for (const p of extraPosts) if (!postByShortcode.has(p.shortcode)) postByShortcode.set(p.shortcode, p);

    // Selected shortcodes first (config.reels order — visible without
    // scrolling, per the fix), then the rest of the rank window, excluding
    // duplicates.
    const orderedShortcodes: string[] = [
      ...persistedShortcodes,
      ...(ranked || [])
        .map((p) => p.shortcode as string)
        .filter((sc) => !persistedByShortcode.has(sc)),
    ];

    const reels = orderedShortcodes.map((shortcode) => {
      const post = postByShortcode.get(shortcode);
      const persistedEntry = persistedByShortcode.get(shortcode) || null;
      const video = findPersistedVideo(currentReels, shortcode);
      if (post) {
        return { shortcode, poster: posterFromPost(post), video, selected: video !== null, postMissing: false };
      }
      // No instagram_posts row at all (deleted from Instagram, or — in
      // principle — the enrichment query above failed). Only reachable for a
      // shortcode that's actually in config.reels, so persistedEntry is
      // always set here; the poster/video already stored there is the only
      // copy left.
      return {
        shortcode,
        poster: persistedEntry?.poster ?? null,
        video,
        selected: video !== null,
        postMissing: true,
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
