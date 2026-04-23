/**
 * GET /api/cron/refresh-media-urls
 *
 * Weekly deep refresh of Instagram media URLs.
 * Instagram CDN URLs are signed and expire after 1-2 weeks. The daily-scan
 * cron already refreshes the 50 most-recent posts per account; this weekly
 * cron refreshes a deeper window (100 posts) so older recipes/products/looks
 * surfaced by the widget don't break over time.
 *
 * Strategy: one account per run, oldest-refresh-first. Vercel cron fires
 * hourly on Sunday so many accounts are covered without hitting timeouts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScrapeCreatorsClient } from '@/lib/scraping/scrapeCreatorsClient';
import { persistPostMedia } from '@/lib/scraping/media-storage';

export const maxDuration = 300;

const REFRESH_POSTS_LIMIT = 100;
const REFRESH_FLAG_KEY = 'last_media_refresh_at';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET;
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  // Pull active creator accounts
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, config, status, type')
    .eq('type', 'creator')
    .eq('status', 'active');

  if (accErr) {
    return NextResponse.json({ error: accErr.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: 'No active accounts', scanned: null });
  }

  // Resolve instagram_username (persona first, config fallback)
  const ids = accounts.map(a => a.id);
  const { data: personas } = await supabase
    .from('chatbot_persona')
    .select('account_id, instagram_username')
    .in('account_id', ids);
  const personaMap = new Map((personas || []).map(p => [p.account_id, p.instagram_username]));

  const candidates = accounts
    .map(a => ({
      id: a.id,
      username: personaMap.get(a.id) || (a.config as any)?.username || null,
      lastRefresh: ((a.config as any)?.[REFRESH_FLAG_KEY] as string | undefined) || null,
    }))
    .filter(a => a.username)
    .sort((a, b) => {
      if (!a.lastRefresh && !b.lastRefresh) return 0;
      if (!a.lastRefresh) return -1;
      if (!b.lastRefresh) return 1;
      return new Date(a.lastRefresh).getTime() - new Date(b.lastRefresh).getTime();
    });

  const target = candidates[0];
  if (!target) {
    return NextResponse.json({ message: 'No accounts with resolvable usernames', scanned: null });
  }

  const client = getScrapeCreatorsClient();
  let refreshed = 0;
  let inserted = 0;
  let error: string | undefined;

  try {
    const posts = await client.getPosts(target.username, REFRESH_POSTS_LIMIT);

    if (posts.length > 0) {
      const shortcodes = posts.map(p => p.shortcode);
      const { data: existingRows } = await supabase
        .from('instagram_posts')
        .select('shortcode')
        .eq('account_id', target.id)
        .in('shortcode', shortcodes);
      const existing = new Set((existingRows || []).map((r: { shortcode: string }) => r.shortcode));

      for (const post of posts) {
        const persisted = await persistPostMedia(
          supabase,
          target.id,
          post.shortcode,
          post.media_urls,
          post.thumbnail_url,
        );

        const { error: upErr } = await supabase.from('instagram_posts').upsert({
          account_id: target.id,
          shortcode: post.shortcode,
          post_id: post.post_id,
          post_url: post.post_url,
          type: post.media_type === 'video' ? 'reel' : post.media_type,
          caption: post.caption,
          mentions: post.mentions || [],
          media_urls: post.media_urls,
          thumbnail_url: post.thumbnail_url,
          stored_media_urls: persisted.stored_media_urls,
          stored_thumbnail_url: persisted.stored_thumbnail_url,
          media_stored_at: persisted.media_stored_at,
          likes_count: post.likes_count,
          comments_count: post.comments_count,
          views_count: post.views_count,
          posted_at: post.posted_at,
          location: post.location,
          is_sponsored: post.is_sponsored,
          scraped_at: new Date().toISOString(),
        }, { onConflict: 'account_id,shortcode' });

        if (!upErr) {
          if (existing.has(post.shortcode)) refreshed++;
          else inserted++;
        }
      }
    }

    // Mark this account as refreshed so the next run picks a different one
    const { data: current } = await supabase.from('accounts').select('config').eq('id', target.id).single();
    const nextConfig = { ...(current?.config || {}), [REFRESH_FLAG_KEY]: new Date().toISOString() };
    await supabase.from('accounts').update({ config: nextConfig }).eq('id', target.id);
  } catch (err: any) {
    error = err?.message?.substring(0, 300) || String(err);
    console.error(`[Cron refresh-media-urls] @${target.username} failed:`, error);
  }

  return NextResponse.json({
    success: !error,
    scanned: target.username,
    refreshed,
    inserted,
    error,
  });
}
