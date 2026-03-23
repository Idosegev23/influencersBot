/**
 * Hot Topics Query Helpers
 *
 * Used by chat (greeting, "מה חדש?" intent) and discovery UI.
 */

import { createClient } from '@/lib/supabase/server';
import type { HotTopic } from './types';

/**
 * Get top hot topics by status and heat score.
 */
export async function getTopHotTopics(
  limit: number = 5,
  statuses: string[] = ['breaking', 'hot']
): Promise<HotTopic[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('hot_topics')
    .select('*')
    .in('status', statuses)
    .order('heat_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[hot-topics/query] Failed to get top topics:', error.message);
    return [];
  }

  return (data || []) as HotTopic[];
}

/**
 * Get hot topics filtered by tag.
 */
export async function getHotTopicsByTag(
  tag: string,
  limit: number = 10
): Promise<HotTopic[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from('hot_topics')
    .select('*')
    .contains('tags', [tag])
    .in('status', ['breaking', 'hot', 'cooling'])
    .order('heat_score', { ascending: false })
    .limit(limit);

  return (data || []) as HotTopic[];
}

/**
 * Get a single hot topic with its linked posts.
 */
export async function getHotTopicWithPosts(topicId: string) {
  const supabase = createClient();

  const [topicResult, postsResult] = await Promise.all([
    supabase.from('hot_topics').select('*').eq('id', topicId).single(),
    supabase
      .from('hot_topic_posts')
      .select('post_id, account_id, relevance_score, created_at')
      .eq('topic_id', topicId)
      .order('relevance_score', { ascending: false })
      .limit(20),
  ]);

  if (!topicResult.data) return null;

  return {
    topic: topicResult.data as HotTopic,
    posts: postsResult.data || [],
  };
}

/**
 * Get all media_news account IDs.
 */
export async function getNewsAccountIds(): Promise<string[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from('accounts')
    .select('id')
    .eq('status', 'active')
    .eq('config->>archetype', 'media_news');

  return (data || []).map((a: any) => a.id);
}
