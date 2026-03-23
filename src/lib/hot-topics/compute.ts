/**
 * Hot Topics Compute Engine
 *
 * Main orchestrator called by the cron job every 3 hours.
 * Steps:
 * 1. Get media_news account IDs
 * 2. Cluster entities across accounts
 * 3. Calculate heat scores
 * 4. Upsert hot_topics + hot_topic_posts
 * 5. Generate AI summaries for top topics
 * 6. Archive stale topics
 */

import { createClient } from '@/lib/supabase/server';
import { clusterEntities } from './cluster';
import { calculateHeatScore, determineStatus } from './score';
import { generateTopicSummaries } from './summarize';
import { getNewsAccountIds } from './query';

interface ComputeResult {
  totalClusters: number;
  topicsCreated: number;
  topicsUpdated: number;
  topicsArchived: number;
  summariesGenerated: number;
  durationMs: number;
  errors: string[];
}

export async function computeHotTopics(): Promise<ComputeResult> {
  const startMs = Date.now();
  const result: ComputeResult = {
    totalClusters: 0,
    topicsCreated: 0,
    topicsUpdated: 0,
    topicsArchived: 0,
    summariesGenerated: 0,
    durationMs: 0,
    errors: [],
  };

  try {
    const supabase = createClient();

    // Step 1: Get media_news accounts
    const newsAccountIds = await getNewsAccountIds();
    if (newsAccountIds.length === 0) {
      console.log('[compute-hot-topics] No media_news accounts found');
      result.durationMs = Date.now() - startMs;
      return result;
    }

    console.log(`[compute-hot-topics] Found ${newsAccountIds.length} news accounts`);

    // Step 2: Cluster entities
    const clusters = await clusterEntities(newsAccountIds, 7);
    result.totalClusters = clusters.length;
    console.log(`[compute-hot-topics] ${clusters.length} entity clusters found`);

    if (clusters.length === 0) {
      result.durationMs = Date.now() - startMs;
      return result;
    }

    // Find max engagement for normalization
    const maxEngagement = Math.max(...clusters.map((c) => c.total_engagement), 1);

    // Step 3-4: Score and upsert each cluster
    const newTopicIds: string[] = [];

    for (const cluster of clusters) {
      const hoursSinceFirst =
        (Date.now() - cluster.first_seen.getTime()) / (1000 * 60 * 60);

      const heatScore = calculateHeatScore({
        coverage_count: cluster.account_ids.size,
        total_news_accounts: newsAccountIds.length,
        hours_since_first_seen: hoursSinceFirst,
        total_engagement: cluster.total_engagement,
        max_engagement: maxEngagement,
        total_posts: cluster.posts.length,
      });

      const status = determineStatus(heatScore, cluster.first_seen);

      // Skip very low-score topics
      if (heatScore < 5) continue;

      // Upsert into hot_topics
      const { data: existing } = await supabase
        .from('hot_topics')
        .select('id, summary')
        .eq('topic_name_normalized', cluster.normalized)
        .single();

      let topicId: string;

      if (existing) {
        // Update existing topic
        const { error } = await supabase
          .from('hot_topics')
          .update({
            heat_score: heatScore,
            status,
            coverage_count: cluster.account_ids.size,
            total_posts: cluster.posts.length,
            total_engagement: cluster.total_engagement,
            last_seen_at: cluster.last_seen.toISOString(),
            entities: [...cluster.account_ids].length > 1
              ? Array.from(new Set([cluster.name, ...cluster.posts.map(p => p.account_id)]))
              : [cluster.name],
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          result.errors.push(`Update topic ${cluster.name}: ${error.message}`);
          continue;
        }
        topicId = existing.id;
        result.topicsUpdated++;

        // Clear summary if coverage changed significantly (regenerate later)
        if (existing.summary && cluster.account_ids.size > 1) {
          // Keep existing summary, will be refreshed if stale
        }
      } else {
        // Create new topic
        const { data: newTopic, error } = await supabase
          .from('hot_topics')
          .insert({
            topic_name: cluster.name,
            topic_name_normalized: cluster.normalized,
            topic_type: cluster.type,
            entities: [cluster.name],
            heat_score: heatScore,
            status,
            coverage_count: cluster.account_ids.size,
            total_posts: cluster.posts.length,
            total_engagement: cluster.total_engagement,
            first_seen_at: cluster.first_seen.toISOString(),
            last_seen_at: cluster.last_seen.toISOString(),
          })
          .select('id')
          .single();

        if (error || !newTopic) {
          result.errors.push(`Create topic ${cluster.name}: ${error?.message}`);
          continue;
        }
        topicId = newTopic.id;
        result.topicsCreated++;
        newTopicIds.push(topicId);
      }

      // Upsert post links
      const postLinks = cluster.posts.map((p) => ({
        topic_id: topicId,
        post_id: p.post_id,
        account_id: p.account_id,
        chunk_id: p.chunk_id,
        relevance_score: p.engagement / Math.max(maxEngagement, 1),
      }));

      // Use upsert to handle duplicates
      for (const link of postLinks) {
        await supabase
          .from('hot_topic_posts')
          .upsert(link, { onConflict: 'topic_id,post_id' });
      }
    }

    // Step 5: Generate summaries for new/updated topics
    try {
      const { summarized, errors: sumErrors } = await generateTopicSummaries(
        newTopicIds.length > 0 ? newTopicIds : undefined
      );
      result.summariesGenerated = summarized;
      if (sumErrors.length > 0) {
        result.errors.push(...sumErrors.slice(0, 3));
      }
    } catch (err) {
      result.errors.push(`Summarization: ${(err as Error).message}`);
    }

    // Step 6: Archive stale topics
    const archiveCutoff = new Date();
    archiveCutoff.setDate(archiveCutoff.getDate() - 7);

    const { data: archived } = await supabase
      .from('hot_topics')
      .update({ status: 'archive', updated_at: new Date().toISOString() })
      .lt('heat_score', 10)
      .lt('last_seen_at', archiveCutoff.toISOString())
      .neq('status', 'archive')
      .select('id');

    result.topicsArchived = archived?.length || 0;

  } catch (err) {
    result.errors.push(`Fatal: ${(err as Error).message}`);
    console.error('[compute-hot-topics] Fatal error:', err);
  }

  result.durationMs = Date.now() - startMs;
  console.log('[compute-hot-topics] Complete:', JSON.stringify(result));
  return result;
}
