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
  type: 'post' | 'transcription' | 'highlight' | 'story' | 'coupon';
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
// Stage 1: Smart Search (Using Index!) ⚡
// ============================================

export async function searchContentByQuery(
  accountId: string,
  userQuery: string
): Promise<ContentMetadata[]> {
  const supabase = await createClient();
  const metadata: ContentMetadata[] = [];

  console.log(`[Hybrid Stage 1] 🔍 Smart search for: "${userQuery}"`);
  console.log(`  Using Full Text Search INDEX - כל התוכן נגיש!`);

  // Use indexed search - ALL content is searchable!
  const { data: searchResults, error } = await supabase
    .rpc('search_all_content', {
      p_account_id: accountId,
      p_query: userQuery,
      p_limit: 50
    });

  if (error) {
    console.warn('[Hybrid Stage 1] Search failed, falling back to recent posts');
    
    // Fallback: Get recent posts
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
        title: truncate(p.caption, 150),
        date: p.posted_at,
      })));
    }
    
    console.log(`[Hybrid Stage 1] ⚠️ Fallback: ${posts?.length || 0} recent posts`);
    return metadata;
  }

  // Parse search results (from indexed search!)
  if (searchResults && searchResults.length > 0) {
    metadata.push(...searchResults.map((r: any) => ({
      id: r.id,
      type: r.content_type as 'post' | 'transcription',
      title: truncate(r.content_text, 150),
      date: r.created_at,
      relevanceScore: r.relevance,
    })));
  }

  // Also search coupons directly (not included in search_all_content)
  const couponKeywords = ['קופון', 'קוד', 'הנחה', 'coupon', 'discount', 'code', 'קודים', 'קופונים'];
  const queryLower = userQuery.toLowerCase();
  const isCouponQuery = couponKeywords.some(k => queryLower.includes(k));

  if (isCouponQuery) {
    const { data: coupons } = await supabase
      .from('coupons')
      .select('id, code, description, discount_type, discount_value, is_active, created_at')
      .eq('account_id', accountId)
      .eq('is_active', true);

    if (coupons && coupons.length > 0) {
      metadata.push(...coupons.map(c => ({
        id: c.id,
        type: 'coupon' as const,
        title: `🎟️ קוד: ${c.code} — ${c.description || ''} (${c.discount_value}${c.discount_type === 'percentage' ? '%' : '₪'} הנחה)`,
        date: c.created_at,
        relevanceScore: 1.0, // High relevance — user explicitly asked
      })));
      console.log(`[Hybrid Stage 1] 🎟️ Added ${coupons.length} active coupons`);
    }
  }

  // Always load coupons as context even for non-coupon queries (they're small)
  if (!isCouponQuery) {
    const { data: coupons } = await supabase
      .from('coupons')
      .select('id, code, description, discount_type, discount_value, is_active, created_at')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .limit(10);

    if (coupons && coupons.length > 0) {
      metadata.push(...coupons.map(c => ({
        id: c.id,
        type: 'coupon' as const,
        title: `🎟️ קוד: ${c.code} — ${c.description || ''} (${c.discount_value}${c.discount_type === 'percentage' ? '%' : '₪'} הנחה)`,
        date: c.created_at,
        relevanceScore: 0.3,
      })));
    }
  }

  console.log(`[Hybrid Stage 1] ✅ Found ${metadata.length} relevant items (indexed search!)`);
  console.log(`  Average relevance: ${(searchResults?.reduce((sum: number, r: any) => sum + r.relevance, 0) / searchResults?.length || 0).toFixed(2)}`);

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
  const couponsMeta = metadata.filter(m => m.type === 'coupon');

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

  if (couponsMeta.length > 0) {
    prompt += `🎟️ **קופונים פעילים (${couponsMeta.length}):**\n`;
    couponsMeta.forEach((c, i) => {
      prompt += `${i + 1}. ${c.title}\n`;
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
