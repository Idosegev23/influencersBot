/**
 * Entity Clustering
 *
 * Groups extracted entities across media_news accounts into topic clusters.
 * Entities with the same normalized name are considered the same topic.
 */

import { createClient } from '@/lib/supabase/server';
import type { ClusteredEntity, EntityMention } from './types';

/**
 * Normalize an entity name for deduplication.
 * Lowercase, trim whitespace, remove quotes and extra punctuation.
 */
export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/["""''`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(ה|ב|ל|מ|ו|ש|כ)(?=[א-ת]{3,})/, '') // Remove common Hebrew prefixes for matching
    .trim();
}

/**
 * Load all entities from media_news account chunks (last N days)
 * and cluster them by normalized name.
 */
export async function clusterEntities(
  newsAccountIds: string[],
  lookbackDays: number = 7
): Promise<ClusteredEntity[]> {
  const supabase = createClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  // Load chunks with entities from the news accounts
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('id, account_id, document_id, chunk_text, entity_type, metadata, updated_at')
    .in('account_id', newsAccountIds)
    .gte('updated_at', cutoff.toISOString())
    .not('metadata->entities_extracted', 'is', null);

  if (error || !chunks) {
    console.error('[cluster] Failed to load chunks:', error?.message);
    return [];
  }

  // Filter to chunks that actually have entities
  const chunksWithEntities = chunks.filter((c: any) => {
    const entities = (c.metadata as any)?.entities;
    return Array.isArray(entities) && entities.length > 0;
  });

  if (chunksWithEntities.length === 0) {
    console.log('[cluster] No chunks with entities found');
    return [];
  }

  // Get engagement data: document_chunks.document_id -> documents.source_id -> instagram_posts.id
  // Supabase REST has URL length limits, so batch .in() calls in groups of 80
  const documentIds = [...new Set(chunksWithEntities.map((c: any) => c.document_id))];
  const BATCH = 80;

  // Resolve document_id -> source_id via the documents table (batched)
  const allDocs: any[] = [];
  for (let i = 0; i < documentIds.length; i += BATCH) {
    const batch = documentIds.slice(i, i + BATCH);
    const { data } = await supabase.from('documents').select('id, source_id').in('id', batch);
    if (data) allDocs.push(...data);
  }

  const docToSourceMap = new Map(allDocs.map((d: any) => [d.id, d.source_id]));
  const sourceIds = [...new Set(allDocs.map((d: any) => d.source_id).filter(Boolean))];

  // Fetch engagement from instagram_posts using source_ids (batched)
  const allPosts: any[] = [];
  for (let i = 0; i < sourceIds.length; i += BATCH) {
    const batch = sourceIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('instagram_posts')
      .select('id, likes_count, comments_count, views_count, posted_at')
      .in('id', batch);
    if (data) allPosts.push(...data);
  }

  // Map: document_id -> post engagement data (via source_id)
  const postBySourceId = new Map(allPosts.map((p: any) => [p.id, p]));
  const postMap = new Map<string, any>();
  for (const [docId, sourceId] of docToSourceMap) {
    if (sourceId && postBySourceId.has(sourceId)) {
      postMap.set(docId, postBySourceId.get(sourceId));
    }
  }

  // Cluster entities by normalized name
  const clusters = new Map<string, ClusteredEntity>();

  for (const chunk of chunksWithEntities) {
    const entities = ((chunk as any).metadata as any)?.entities as EntityMention[];
    if (!entities) continue;

    const post = postMap.get((chunk as any).document_id);
    const engagement = post
      ? (post.likes_count || 0) + (post.comments_count || 0) + (post.views_count || 0)
      : 0;

    for (const entity of entities) {
      const normalized = normalizeEntityName(entity.name);
      if (normalized.length < 2) continue;

      let cluster = clusters.get(normalized);
      if (!cluster) {
        cluster = {
          name: entity.name, // Keep the original casing from first occurrence
          normalized,
          type: entity.type,
          posts: [],
          account_ids: new Set(),
          total_engagement: 0,
          first_seen: new Date((chunk as any).updated_at),
          last_seen: new Date((chunk as any).updated_at),
        };
        clusters.set(normalized, cluster);
      }

      // Add post reference (avoid duplicates)
      const alreadyLinked = cluster.posts.some(
        (p) => p.chunk_id === (chunk as any).id
      );
      if (!alreadyLinked) {
        cluster.posts.push({
          post_id: (chunk as any).document_id,
          account_id: (chunk as any).account_id,
          chunk_id: (chunk as any).id,
          engagement,
          posted_at: post?.posted_at || (chunk as any).updated_at,
        });
      }

      cluster.account_ids.add((chunk as any).account_id);
      cluster.total_engagement += engagement;

      const chunkDate = new Date((chunk as any).updated_at);
      if (chunkDate < cluster.first_seen) cluster.first_seen = chunkDate;
      if (chunkDate > cluster.last_seen) cluster.last_seen = chunkDate;
    }
  }

  // Convert to array and sort by number of covering accounts, then by engagement
  return Array.from(clusters.values())
    .filter((c) => c.posts.length >= 2) // At least 2 mentions to be a "topic"
    .sort((a, b) => {
      const coverageDiff = b.account_ids.size - a.account_ids.size;
      if (coverageDiff !== 0) return coverageDiff;
      return b.total_engagement - a.total_engagement;
    });
}
