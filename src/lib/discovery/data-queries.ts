// ============================================
// Discovery Feature — Data-Driven Queries
// ============================================

import { createClient } from '@/lib/supabase/server';
import type { DiscoveryItem } from './types';

const DEFAULT_LIMIT = 5;

function mapPostToItem(post: any, rank: number, metricLabel: string, metricField: string): DiscoveryItem {
  const isVideo = post.type === 'reel' || post.type === 'video';
  // For reels/videos, media_urls[0] is the actual video CDN URL
  const videoUrl = isVideo && post.media_urls?.length ? post.media_urls[0] : undefined;
  return {
    rank,
    postId: post.id,
    shortcode: post.shortcode,
    postUrl: post.post_url,
    videoUrl,
    thumbnailUrl: post.thumbnail_url || (!isVideo && post.media_urls?.[0]) || null,
    captionExcerpt: post.caption ? post.caption.slice(0, 120) : '',
    mediaType: post.type,
    postedAt: post.posted_at,
    metricValue: post[metricField] ?? 0,
    metricLabel,
  };
}

/**
 * Top videos by views_count
 */
export async function queryViralVideos(accountId: string, limit = DEFAULT_LIMIT): Promise<DiscoveryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('id, shortcode, post_url, thumbnail_url, media_urls, caption, type, posted_at, views_count')
    .eq('account_id', accountId)
    .in('type', ['reel', 'video'])
    .gt('views_count', 0)
    .order('views_count', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((p, i) => mapPostToItem(p, i + 1, 'צפיות', 'views_count'));
}

/**
 * Top posts by likes_count
 */
export async function queryMostLiked(accountId: string, limit = DEFAULT_LIMIT): Promise<DiscoveryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('id, shortcode, post_url, thumbnail_url, media_urls, caption, type, posted_at, likes_count')
    .eq('account_id', accountId)
    .gt('likes_count', 0)
    .order('likes_count', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((p, i) => mapPostToItem(p, i + 1, 'לייקים', 'likes_count'));
}

/**
 * Top posts by comments_count
 */
export async function queryMostCommented(accountId: string, limit = DEFAULT_LIMIT): Promise<DiscoveryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('id, shortcode, post_url, thumbnail_url, media_urls, caption, type, posted_at, comments_count')
    .eq('account_id', accountId)
    .gt('comments_count', 0)
    .order('comments_count', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((p, i) => mapPostToItem(p, i + 1, 'תגובות', 'comments_count'));
}

/**
 * Top posts by engagement_rate
 */
export async function queryHighestEngagement(accountId: string, limit = DEFAULT_LIMIT): Promise<DiscoveryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('id, shortcode, post_url, thumbnail_url, media_urls, caption, type, posted_at, engagement_rate, likes_count, comments_count')
    .eq('account_id', accountId)
    .gt('engagement_rate', 0)
    .order('engagement_rate', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((p, i) => ({
    ...mapPostToItem(p, i + 1, 'מעורבות', 'engagement_rate'),
    metricValue: parseFloat(Number(p.engagement_rate).toFixed(1)),
    metricLabel: '% מעורבות',
  }));
}

/**
 * Recent hits — last 30 days, ordered by engagement
 */
export async function queryRecentHits(accountId: string, limit = DEFAULT_LIMIT, days = 30): Promise<DiscoveryItem[]> {
  const supabase = createClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await supabase
    .from('instagram_posts')
    .select('id, shortcode, post_url, thumbnail_url, media_urls, caption, type, posted_at, engagement_rate, likes_count, views_count')
    .eq('account_id', accountId)
    .gte('posted_at', cutoff.toISOString())
    .order('engagement_rate', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((p, i) => ({
    ...mapPostToItem(p, i + 1, 'מעורבות', 'engagement_rate'),
    metricValue: parseFloat(Number(p.engagement_rate).toFixed(1)),
    metricLabel: '% מעורבות',
  }));
}

/**
 * Best reels by views
 */
export async function queryBestReels(accountId: string, limit = DEFAULT_LIMIT): Promise<DiscoveryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('id, shortcode, post_url, thumbnail_url, media_urls, caption, type, posted_at, views_count')
    .eq('account_id', accountId)
    .eq('type', 'reel')
    .gt('views_count', 0)
    .order('views_count', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((p, i) => mapPostToItem(p, i + 1, 'צפיות', 'views_count'));
}

// ------------------------------------------
// Availability check — count posts with data
// ------------------------------------------

export interface DataAvailability {
  postsWithViews: number;
  postsAny: number;
  reels: number;
  recentPosts: number;
}

export async function checkDataAvailability(accountId: string): Promise<DataAvailability> {
  const supabase = createClient();

  const [withViews, anyPosts, reels, recent] = await Promise.all([
    supabase.from('instagram_posts').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId).gt('views_count', 0),
    supabase.from('instagram_posts').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    supabase.from('instagram_posts').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId).eq('type', 'reel'),
    supabase.from('instagram_posts').select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gte('posted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  return {
    postsWithViews: withViews.count ?? 0,
    postsAny: anyPosts.count ?? 0,
    reels: reels.count ?? 0,
    recentPosts: recent.count ?? 0,
  };
}

// ------------------------------------------
// Query dispatcher
// ------------------------------------------

const QUERY_MAP: Record<string, (accountId: string, limit?: number) => Promise<DiscoveryItem[]>> = {
  'viral-videos': queryViralVideos,
  'most-liked': queryMostLiked,
  'most-commented': queryMostCommented,
  'highest-engagement': queryHighestEngagement,
  'recent-hits': queryRecentHits,
  'best-reels': queryBestReels,
};

export async function executeDataQuery(slug: string, accountId: string, limit = DEFAULT_LIMIT): Promise<DiscoveryItem[]> {
  const queryFn = QUERY_MAP[slug];
  if (!queryFn) return [];
  return queryFn(accountId, limit);
}
