/**
 * GET /api/influencer/ldrs-foryou
 *
 * Returns the live LDRS Instagram content for the conference ForYou tab:
 *   - Recent reels (top N by recency × engagement)
 *   - Highlights (cover thumbnails + items count)
 *
 * Data is whatever the daily-scan cron last refreshed; the visitor sees
 * the freshest snapshot without us having to scrape on demand.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  try {
    const supabase = getSupabase();

    // ── Reels: latest first, prefer ones with thumbnail ──
    const { data: reelsRaw } = await supabase
      .from('instagram_posts')
      .select(
        'shortcode, post_url, type, caption, thumbnail_url, stored_thumbnail_url, ' +
          'video_duration, views_count, likes_count, comments_count, posted_at',
      )
      .eq('account_id', LDRS_ACCOUNT_ID)
      .in('type', ['Video', 'video', 'reel', 'Reel'])
      .order('posted_at', { ascending: false })
      .limit(24);

    const reels = ((reelsRaw as any[]) || []).map((r) => ({
      shortcode: r.shortcode,
      url: r.post_url || `https://instagram.com/reel/${r.shortcode}/`,
      caption: r.caption || '',
      thumbnail: r.stored_thumbnail_url || r.thumbnail_url || null,
      duration: r.video_duration,
      views: r.views_count,
      likes: r.likes_count,
      comments: r.comments_count,
      posted_at: r.posted_at,
    }));

    // ── Highlights with their real item count + cover thumb (latest item) ──
    const { data: highlightsRaw } = await supabase
      .from('instagram_highlights')
      .select('id, highlight_id, title, cover_image_url')
      .eq('account_id', LDRS_ACCOUNT_ID);

    const hRows = (highlightsRaw as any[]) || [];
    const highlightIds = hRows.map((h) => h.id);

    let coversByHighlight: Record<
      string,
      { items: number; thumb: string | null }
    > = {};
    if (highlightIds.length) {
      const { data: items } = await supabase
        .from('instagram_highlight_items')
        .select(
          'highlight_id, thumbnail_url, stored_thumbnail_url, media_url, stored_media_url, item_index',
        )
        .in('highlight_id', highlightIds)
        .order('item_index', { ascending: false });
      for (const it of (items as any[]) || []) {
        const k = it.highlight_id as string;
        if (!coversByHighlight[k]) {
          coversByHighlight[k] = {
            items: 0,
            thumb:
              it.stored_thumbnail_url ||
              it.thumbnail_url ||
              it.stored_media_url ||
              it.media_url ||
              null,
          };
        }
        coversByHighlight[k].items += 1;
      }
    }

    const highlights = hRows
      .map((h) => {
        const c = coversByHighlight[h.id];
        return {
          id: h.id,
          highlight_id: h.highlight_id,
          title: h.title || '',
          cover: c?.thumb || h.cover_image_url || null,
          items_count: c?.items || 0,
        };
      })
      .filter((h) => h.items_count > 0 && h.cover)
      .sort((a, b) => b.items_count - a.items_count);

    // Brand logo to overlay on every highlight (Instagram-style: the
    // brand's profile picture as the highlight cover).
    const { data: account } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', LDRS_ACCOUNT_ID)
      .single();
    const brandLogo = (account?.config as any)?.avatar_url || null;

    return NextResponse.json({
      reels,
      highlights,
      brandLogo,
      generated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[ldrs-foryou] error:', e);
    return NextResponse.json({ reels: [], highlights: [], error: e.message }, { status: 200 });
  }
}
