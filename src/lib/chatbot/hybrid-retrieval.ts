/**
 * Hybrid Multi-Stage Knowledge Retrieval
 * Stage 1: Lightweight metadata scan
 * Stage 2: AI decides what to fetch in detail
 * Stage 3: Deep fetch only what's needed
 */

import { createClient } from '@/lib/supabase/server';

// ============================================
// Types
// ============================================

export interface ContentMetadata {
  id: string;
  type: 'post' | 'transcription' | 'highlight' | 'story';
  title: string; // Short preview
  date: string;
  relevanceScore?: number;
}

export interface DetailedContent {
  id: string;
  type: 'post' | 'transcription' | 'highlight' | 'story';
  fullContent: string;
  metadata: any;
}

export interface RetrievalRequest {
  posts?: string[]; // IDs to fetch
  transcriptions?: string[];
  highlights?: string[];
  stories?: string[];
}

// ============================================
// Stage 1: Metadata Scan (Cheap!)
// ============================================

export async function scanContentMetadata(
  accountId: string
): Promise<ContentMetadata[]> {
  const supabase = await createClient();
  const metadata: ContentMetadata[] = [];

  console.log(`[Hybrid Stage 1] 🔍 Scanning metadata for account: ${accountId}`);

  // Get posts metadata (title only, no full content!)
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('id, caption, type, posted_at')
    .eq('account_id', accountId)
    .order('posted_at', { ascending: false })
    .limit(100);

  if (posts) {
    metadata.push(...posts.map(p => ({
      id: p.id,
      type: 'post' as const,
      title: truncate(p.caption, 150), // Just preview!
      date: p.posted_at,
    })));
  }

  // Get transcriptions metadata
  const { data: transcriptions } = await supabase
    .from('instagram_transcriptions')
    .select('id, transcription_text, created_at, source_id')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (transcriptions) {
    metadata.push(...transcriptions.map(t => ({
      id: t.id,
      type: 'transcription' as const,
      title: truncate(t.transcription_text, 150),
      date: t.created_at,
    })));
  }

  // Get highlights metadata
  const { data: highlights } = await supabase
    .from('instagram_highlights')
    .select('id, title, scraped_at, items_count')
    .eq('account_id', accountId)
    .order('scraped_at', { ascending: false })
    .limit(50);

  if (highlights) {
    metadata.push(...highlights.map(h => ({
      id: h.id,
      type: 'highlight' as const,
      title: h.title || 'Untitled Highlight',
      date: h.scraped_at,
    })));
  }

  // Get stories metadata (active only - 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: stories } = await supabase
    .from('instagram_stories')
    .select('id, story_id, posted_at, media_type')
    .eq('account_id', accountId)
    .gte('posted_at', oneDayAgo)
    .order('posted_at', { ascending: false })
    .limit(20);

  if (stories) {
    metadata.push(...stories.map(s => ({
      id: s.id,
      type: 'story' as const,
      title: `Story (${s.media_type})`,
      date: s.posted_at,
    })));
  }

  console.log(`[Hybrid Stage 1] ✅ Found ${metadata.length} items (metadata only)`);
  console.log(`  Posts: ${posts?.length || 0}`);
  console.log(`  Transcriptions: ${transcriptions?.length || 0}`);
  console.log(`  Highlights: ${highlights?.length || 0}`);
  console.log(`  Stories: ${stories?.length || 0}`);

  return metadata;
}

// ============================================
// Stage 3: Deep Fetch (Only What AI Requested)
// ============================================

export async function fetchDetailedContent(
  accountId: string,
  request: RetrievalRequest
): Promise<DetailedContent[]> {
  const supabase = await createClient();
  const detailed: DetailedContent[] = [];

  console.log(`[Hybrid Stage 3] 📥 Fetching detailed content:`, request);

  // Fetch requested posts
  if (request.posts && request.posts.length > 0) {
    const { data: posts } = await supabase
      .from('instagram_posts')
      .select('id, caption, hashtags, type, posted_at, media_urls, likes_count')
      .eq('account_id', accountId)
      .in('id', request.posts);

    if (posts) {
      detailed.push(...posts.map(p => ({
        id: p.id,
        type: 'post' as const,
        fullContent: formatPostContent(p),
        metadata: p,
      })));
    }
  }

  // Fetch requested transcriptions
  if (request.transcriptions && request.transcriptions.length > 0) {
    const { data: transcriptions } = await supabase
      .from('instagram_transcriptions')
      .select('id, transcription_text, source_id, created_at')
      .eq('account_id', accountId)
      .in('id', request.transcriptions);

    if (transcriptions) {
      detailed.push(...transcriptions.map(t => ({
        id: t.id,
        type: 'transcription' as const,
        fullContent: t.transcription_text,
        metadata: t,
      })));
    }
  }

  // Fetch requested highlights (with items)
  if (request.highlights && request.highlights.length > 0) {
    const { data: highlights } = await supabase
      .from('instagram_highlights')
      .select('id, title, cover_image_url, items_count, scraped_at')
      .eq('account_id', accountId)
      .in('id', request.highlights);

    if (highlights) {
      detailed.push(...highlights.map(h => ({
        id: h.id,
        type: 'highlight' as const,
        fullContent: `Highlight: ${h.title} (${h.items_count} items)`,
        metadata: h,
      })));
    }
  }

  // Fetch requested stories (with transcription if video)
  if (request.stories && request.stories.length > 0) {
    const { data: stories } = await supabase
      .from('instagram_stories')
      .select('id, story_id, media_type, media_url, posted_at, transcription_status')
      .eq('account_id', accountId)
      .in('id', request.stories);

    if (stories) {
      detailed.push(...stories.map(s => ({
        id: s.id,
        type: 'story' as const,
        fullContent: `Story (${s.media_type}) - ${s.posted_at}`,
        metadata: s,
      })));
    }
  }

  console.log(`[Hybrid Stage 3] ✅ Fetched ${detailed.length} detailed items`);

  return detailed;
}

// ============================================
// Utilities
// ============================================

function truncate(text: string | null, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function formatPostContent(post: any): string {
  let content = post.caption || '';
  
  if (post.hashtags && post.hashtags.length > 0) {
    content += '\n\n#' + post.hashtags.join(' #');
  }
  
  if (post.likes_count) {
    content += `\n\n❤️ ${post.likes_count} likes`;
  }
  
  return content;
}

// ============================================
// Format for AI Prompt
// ============================================

export function formatMetadataForAI(metadata: ContentMetadata[]): string {
  let prompt = '📋 **תוכן זמין (metadata בלבד):**\n\n';
  
  const postsMeta = metadata.filter(m => m.type === 'post');
  const transcriptionsMeta = metadata.filter(m => m.type === 'transcription');
  const highlightsMeta = metadata.filter(m => m.type === 'highlight');
  const storiesMeta = metadata.filter(m => m.type === 'story');

  if (postsMeta.length > 0) {
    prompt += `📸 **פוסטים (${postsMeta.length}):**\n`;
    postsMeta.slice(0, 50).forEach((p, i) => {
      prompt += `${i + 1}. [ID: ${p.id}] ${p.title}\n`;
    });
    prompt += '\n';
  }

  if (transcriptionsMeta.length > 0) {
    prompt += `🎥 **תמלולים מסרטונים (${transcriptionsMeta.length}):**\n`;
    transcriptionsMeta.slice(0, 30).forEach((t, i) => {
      prompt += `${i + 1}. [ID: ${t.id}] ${t.title}\n`;
    });
    prompt += '\n';
  }

  if (highlightsMeta.length > 0) {
    prompt += `✨ **הילייטס (${highlightsMeta.length}):**\n`;
    highlightsMeta.forEach((h, i) => {
      prompt += `${i + 1}. [ID: ${h.id}] ${h.title}\n`;
    });
    prompt += '\n';
  }

  if (storiesMeta.length > 0) {
    prompt += `📱 **סטוריז פעילים (${storiesMeta.length}):**\n`;
    storiesMeta.forEach((s, i) => {
      prompt += `${i + 1}. [ID: ${s.id}] ${s.title}\n`;
    });
    prompt += '\n';
  }

  prompt += `
⚠️ **הוראות ל-AI:**
1. קרא את רשימת התוכן למעלה (כותרות בלבד!)
2. בחר מה רלוונטי לשאלה - תן רשימת IDs
3. אני אביא את התוכן המלא רק של מה שביקשת
4. פורמט: {"posts": ["id1", "id2"], "transcriptions": ["id3"]}

דוגמה: אם השאלה על מתכון וראית פוסט 5 וסרטון 23 שנראים רלוונטיים:
→ {"posts": ["post-id-5"], "transcriptions": ["trans-id-23"]}
`;

  return prompt;
}

export function formatDetailedContentForAI(detailed: DetailedContent[]): string {
  let prompt = '📚 **תוכן מלא שביקשת:**\n\n';
  
  detailed.forEach((item, i) => {
    prompt += `${i + 1}. [${item.type}] ${item.fullContent}\n\n`;
  });
  
  return prompt;
}
