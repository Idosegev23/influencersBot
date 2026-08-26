import { createClient } from '@/lib/supabase/server';
import type { InsightComment, InsightCorpus, InsightPost } from './types';

/** Median of a numeric list; 0 for an empty one. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Raw engagement for one post.
 *
 * Views are excluded on purpose: only some posts on some platforms carry them, so
 * including them would rank every video above every photo regardless of how
 * people actually responded.
 */
export function rawEngagement(p: { likes: number; comments: number }): number {
  return p.likes + p.comments;
}

/**
 * Score posts RELATIVE TO THEIR OWN PLATFORM.
 *
 * A Facebook reaction and an Instagram like are not the same unit, and the two
 * audiences are different sizes. Ranking them together on raw counts would just
 * sort by platform. Each post is scored against its own platform's median, so
 * "twice as good as typical" means the same thing everywhere.
 *
 * A platform whose median is 0 (very low engagement, which is common and real)
 * falls back to the mean, and to raw counts if that is 0 too — so a handful of
 * posts with any engagement at all still separate from the flat ones.
 */
export function withRelativeEngagement(
  posts: Omit<InsightPost, 'relativeEngagement' | 'engagement'>[],
): InsightPost[] {
  const byPlatform = new Map<string, number[]>();
  for (const p of posts) {
    const list = byPlatform.get(p.platform) || [];
    list.push(rawEngagement(p));
    byPlatform.set(p.platform, list);
  }

  const baseline = new Map<string, number>();
  for (const [platform, values] of byPlatform) {
    const med = median(values);
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    baseline.set(platform, med > 0 ? med : mean > 0 ? mean : 1);
  }

  return posts.map((p) => {
    const engagement = rawEngagement(p);
    return {
      ...p,
      engagement,
      relativeEngagement: engagement / (baseline.get(p.platform) || 1),
    };
  });
}

/** Everything the generators read, fetched once. */
export async function collectCorpus(accountId: string): Promise<InsightCorpus> {
  const supabase = await createClient();

  const [acctRes, postsRes, chunksRes, pagesRes] = await Promise.all([
    supabase.from('accounts').select('config, language, timezone').eq('id', accountId).single(),
    supabase
      .from('instagram_posts')
      .select('id, platform, post_url, caption, likes_count, comments_count, views_count, posted_at, media_urls')
      .eq('account_id', accountId)
      .order('posted_at', { ascending: false })
      .limit(1000),
    supabase
      .from('document_chunks')
      .select('topic, entity_type')
      .eq('account_id', accountId)
      .limit(5000),
    supabase
      .from('instagram_bio_websites')
      .select('url, page_title, page_content')
      .eq('account_id', accountId)
      .limit(500),
  ]);

  const config = (acctRes.data?.config as Record<string, any>) || {};
  const rawPosts = postsRes.data || [];

  const posts = withRelativeEngagement(
    rawPosts.map((p: any) => ({
      id: p.id,
      platform: p.platform || 'instagram',
      url: p.post_url || null,
      caption: p.caption || '',
      likes: Number(p.likes_count || 0),
      comments: Number(p.comments_count || 0),
      views: Number(p.views_count || 0),
      postedAt: p.posted_at,
      hasMedia: Array.isArray(p.media_urls) ? p.media_urls.length > 0 : false,
    })),
  );

  // Comments, joined back to their post so evidence can link somewhere real.
  const postById = new Map(posts.map((p) => [p.id, p]));
  const { data: rawComments } = await supabase
    .from('instagram_comments')
    .select('text, post_id, commented_at, is_owner_reply')
    .eq('account_id', accountId)
    .limit(2000);

  const comments: InsightComment[] = (rawComments || [])
    // The account replying to itself is not audience voice.
    .filter((c: any) => !c.is_owner_reply && String(c.text || '').trim().length > 0)
    .map((c: any) => {
      const post = postById.get(c.post_id);
      return {
        text: String(c.text).trim(),
        postUrl: post?.url ?? null,
        platform: post?.platform ?? 'instagram',
        commentedAt: c.commented_at,
      };
    });

  const topicCounts: Record<string, number> = {};
  for (const row of chunksRes.data || []) {
    const topic = (row as any).topic;
    if (!topic) continue;
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  }

  // Representative pages per topic. document_chunks does not carry the page URL,
  // so website pages are matched by title, which is what the reader sees anyway.
  const pages = pagesRes.data || [];
  const topicSamples: Record<string, { title: string; url: string | null; excerpt: string }[]> = {};

  return {
    accountId,
    displayName: config.display_name || config.username || 'this account',
    language: acctRes.data?.language === 'en' ? 'en' : 'he',
    timezone: acctRes.data?.timezone || 'UTC',
    archetype: config.archetype || 'influencer',
    posts,
    comments,
    topicCounts,
    topicSamples,
    websitePageCount: pages.length,
    totalChunks: (chunksRes.data || []).length,
  };
}
