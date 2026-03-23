/**
 * Run hot topics compute engine manually.
 * npx tsx scripts/run-compute-hot-topics.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/["""''`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(ה|ב|ל|מ|ו|ש|כ)(?=[א-ת]{3,})/, '')
    .trim();
}

function calculateHeatScore(input: {
  coverage_count: number;
  total_news_accounts: number;
  hours_since_first_seen: number;
  total_engagement: number;
  max_engagement: number;
  total_posts: number;
}): number {
  const { coverage_count, total_news_accounts, hours_since_first_seen, total_engagement, max_engagement, total_posts } = input;
  const coverageScore = (coverage_count / Math.max(total_news_accounts, 1)) * 40;
  const recencyScore = Math.exp(-hours_since_first_seen / 24) * 30;
  const engagementScore = max_engagement > 0
    ? (Math.log(total_engagement + 1) / Math.log(max_engagement + 1)) * 15
    : 0;
  const intensityScore = (Math.min(total_posts, 10) / 10) * 15;
  return Math.min(100, coverageScore + recencyScore + engagementScore + intensityScore);
}

function determineStatus(heatScore: number, firstSeenAt: Date): string {
  const hoursAgo = (Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 24 && heatScore > 70) return 'breaking';
  if (hoursAgo < 72 || heatScore > 50) return 'hot';
  if (hoursAgo < 168 || heatScore > 30) return 'cooling';
  return 'archive';
}

interface ClusteredEntity {
  name: string;
  normalized: string;
  type: string;
  posts: { post_id: string; account_id: string; chunk_id: string; engagement: number; posted_at: string }[];
  account_ids: Set<string>;
  total_engagement: number;
  first_seen: Date;
  last_seen: Date;
}

async function main() {
  const startMs = Date.now();

  // Step 1: Get media_news accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('status', 'active')
    .eq('config->>archetype', 'media_news');

  const newsAccountIds = (accounts || []).map((a: any) => a.id);
  console.log(`Found ${newsAccountIds.length} news accounts`);

  if (newsAccountIds.length === 0) return;

  // Step 2: Cluster entities
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  console.log('Loading chunks with entities...');
  const { data: chunks, error: chunkError } = await supabase
    .from('document_chunks')
    .select('id, account_id, document_id, chunk_text, entity_type, metadata, updated_at')
    .in('account_id', newsAccountIds)
    .gte('updated_at', cutoff.toISOString())
    .not('metadata->entities_extracted', 'is', null);

  if (chunkError || !chunks) {
    console.error('Failed to load chunks:', chunkError?.message);
    return;
  }

  const chunksWithEntities = chunks.filter((c: any) => {
    const entities = (c.metadata as any)?.entities;
    return Array.isArray(entities) && entities.length > 0;
  });

  console.log(`Total chunks loaded: ${chunks.length}`);
  console.log(`Chunks with entities: ${chunksWithEntities.length}`);

  if (chunksWithEntities.length === 0) {
    console.log('No chunks with entities found.');
    return;
  }

  // Get engagement data: document_chunks.document_id -> documents.source_id -> instagram_posts.id
  // Supabase REST has URL length limits, so batch .in() calls in groups of 80
  const documentIds = [...new Set(chunksWithEntities.map((c: any) => c.document_id))];
  const BATCH = 80;
  console.log(`Resolving ${documentIds.length} document IDs to posts (batches of ${BATCH})...`);

  const allDocs: any[] = [];
  for (let i = 0; i < documentIds.length; i += BATCH) {
    const batch = documentIds.slice(i, i + BATCH);
    const { data } = await supabase.from('documents').select('id, source_id').in('id', batch);
    if (data) allDocs.push(...data);
  }
  console.log(`Resolved ${allDocs.length} documents`);

  const docToSourceMap = new Map(allDocs.map((d: any) => [d.id, d.source_id]));
  const sourceIds = [...new Set(allDocs.map((d: any) => d.source_id).filter(Boolean))];
  console.log(`Found ${sourceIds.length} unique source IDs (instagram_posts)`);

  const allPosts: any[] = [];
  for (let i = 0; i < sourceIds.length; i += BATCH) {
    const batch = sourceIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('instagram_posts')
      .select('id, likes_count, comments_count, views_count, posted_at')
      .in('id', batch);
    if (data) allPosts.push(...data);
  }

  const postBySourceId = new Map(allPosts.map((p: any) => [p.id, p]));
  const postMap = new Map<string, any>();
  for (const [docId, sourceId] of docToSourceMap) {
    if (sourceId && postBySourceId.has(sourceId)) {
      postMap.set(docId, postBySourceId.get(sourceId));
    }
  }
  console.log(`Found engagement data for ${postMap.size} posts`);

  // Cluster entities by normalized name
  const clusters = new Map<string, ClusteredEntity>();

  for (const chunk of chunksWithEntities) {
    const entities = ((chunk as any).metadata as any)?.entities;
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
          name: entity.name,
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

      const alreadyLinked = cluster.posts.some((p) => p.chunk_id === (chunk as any).id);
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

  const sortedClusters = Array.from(clusters.values())
    .filter((c) => c.posts.length >= 2)
    .sort((a, b) => {
      const coverageDiff = b.account_ids.size - a.account_ids.size;
      if (coverageDiff !== 0) return coverageDiff;
      return b.total_engagement - a.total_engagement;
    });

  console.log(`\nTotal unique entities: ${clusters.size}`);
  console.log(`Clusters with 2+ mentions: ${sortedClusters.length}`);

  if (sortedClusters.length === 0) return;

  console.log('\nTop 20 clusters:');
  sortedClusters.slice(0, 20).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (${c.type}) — ${c.account_ids.size} channels, ${c.posts.length} posts, engagement: ${c.total_engagement}`);
  });

  // Step 3-4: Score and upsert
  const maxEngagement = Math.max(...sortedClusters.map((c) => c.total_engagement), 1);
  const newTopicIds: string[] = [];
  let created = 0, updated = 0;

  console.log('\nUpserting hot topics...');

  for (const cluster of sortedClusters) {
    const hoursSinceFirst = (Date.now() - cluster.first_seen.getTime()) / (1000 * 60 * 60);

    const heatScore = calculateHeatScore({
      coverage_count: cluster.account_ids.size,
      total_news_accounts: newsAccountIds.length,
      hours_since_first_seen: hoursSinceFirst,
      total_engagement: cluster.total_engagement,
      max_engagement: maxEngagement,
      total_posts: cluster.posts.length,
    });

    const status = determineStatus(heatScore, cluster.first_seen);
    if (heatScore < 5) continue;

    const { data: existing } = await supabase
      .from('hot_topics')
      .select('id, summary')
      .eq('topic_name_normalized', cluster.normalized)
      .single();

    let topicId: string;

    if (existing) {
      const { error } = await supabase
        .from('hot_topics')
        .update({
          heat_score: heatScore,
          status,
          coverage_count: cluster.account_ids.size,
          total_posts: cluster.posts.length,
          total_engagement: cluster.total_engagement,
          last_seen_at: cluster.last_seen.toISOString(),
          entities: [cluster.name],
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        console.error(`  Update error for ${cluster.name}: ${error.message}`);
        continue;
      }
      topicId = existing.id;
      updated++;
    } else {
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
        console.error(`  Create error for ${cluster.name}: ${error?.message}`);
        continue;
      }
      topicId = newTopic.id;
      created++;
      newTopicIds.push(topicId);
    }

    // Upsert post links
    for (const p of cluster.posts) {
      await supabase
        .from('hot_topic_posts')
        .upsert({
          topic_id: topicId,
          post_id: p.post_id,
          account_id: p.account_id,
          chunk_id: p.chunk_id,
          relevance_score: p.engagement / Math.max(maxEngagement, 1),
        }, { onConflict: 'topic_id,post_id' });
    }
  }

  console.log(`\nTopics created: ${created}`);
  console.log(`Topics updated: ${updated}`);

  // Step 5: Generate summaries
  console.log('\nGenerating summaries...');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('No GEMINI_API_KEY, skipping summaries');
  } else {
    const genai = new GoogleGenAI({ apiKey });

    const { data: topicsForSummary } = await supabase
      .from('hot_topics')
      .select('id, topic_name, topic_type, tags')
      .gt('heat_score', 20)
      .is('summary', null)
      .order('heat_score', { ascending: false })
      .limit(15);

    let summarized = 0;

    for (const topic of (topicsForSummary || [])) {
      try {
        const { data: links } = await supabase
          .from('hot_topic_posts')
          .select('chunk_id, account_id')
          .eq('topic_id', topic.id)
          .order('relevance_score', { ascending: false })
          .limit(5);

        if (!links || links.length === 0) continue;

        const chunkIds = links.map((l: any) => l.chunk_id).filter(Boolean);
        if (chunkIds.length === 0) continue;

        const { data: chunkData } = await supabase
          .from('document_chunks')
          .select('chunk_text, account_id')
          .in('id', chunkIds);

        if (!chunkData || chunkData.length === 0) continue;

        const accountIds = [...new Set(links.map((l: any) => l.account_id))];
        const { data: acctData } = await supabase
          .from('accounts')
          .select('id, config')
          .in('id', accountIds);

        const accountNames = (acctData || []).map(
          (a: any) => (a.config as any)?.display_name || (a.config as any)?.username || 'ערוץ'
        );

        const excerpts = chunkData.map((c: any) => c.chunk_text.substring(0, 300)).join('\n---\n');

        const response = await genai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `אתה כתב חדשות בידור. כתוב תקציר של משפט אחד עד שניים בעברית על הנושא "${topic.topic_name}".
הנושא מסוג: ${topic.topic_type}
ערוצים שכיסו: ${accountNames.join(', ')}

קטעים רלוונטיים:
${excerpts}

כללים:
- משפט אחד עד שניים בלבד
- עברית טבעית, סגנון חדשותי-בידורי
- תייחס לעובדות שמופיעות בקטעים
- אל תמציא מידע שלא מופיע
- אל תוסיף אימוג'ים

תקציר:`,
          config: { temperature: 0.3, maxOutputTokens: 200 },
        });

        const summary = (response.text || '').trim();
        if (summary.length > 10) {
          await supabase
            .from('hot_topics')
            .update({ summary, updated_at: new Date().toISOString() })
            .eq('id', topic.id);
          summarized++;
          console.log(`  ${topic.topic_name}: ${summary.substring(0, 80)}...`);
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (err: any) {
        console.error(`  Summary error for ${topic.topic_name}: ${err.message}`);
      }
    }

    console.log(`Summaries generated: ${summarized}`);
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

  console.log(`\nArchived: ${archived?.length || 0} stale topics`);

  // Final summary
  const { data: finalTopics } = await supabase
    .from('hot_topics')
    .select('topic_name, heat_score, status, coverage_count, total_posts, summary')
    .neq('status', 'archive')
    .order('heat_score', { ascending: false })
    .limit(15);

  console.log(`\n${'='.repeat(60)}`);
  console.log('ACTIVE HOT TOPICS:');
  console.log(`${'='.repeat(60)}`);
  (finalTopics || []).forEach((t: any, i: number) => {
    const emoji = t.status === 'breaking' ? '🔴' : t.status === 'hot' ? '🔥' : '📰';
    console.log(`${emoji} ${i + 1}. ${t.topic_name} — score: ${t.heat_score.toFixed(1)}, ${t.status}, ${t.coverage_count} channels, ${t.total_posts} posts`);
    if (t.summary) console.log(`     ${t.summary}`);
  });

  console.log(`\nDone in ${((Date.now() - startMs) / 1000).toFixed(1)}s`);
}

main().catch(console.error);
