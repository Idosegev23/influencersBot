/**
 * Knowledge Retrieval - שליפת מידע רלוונטי מהמקורות הסרוקים
 * מחבר את הארכיטיפים למידע האמיתי של המשפיען
 */

import { createClient } from '@/lib/supabase/server';
import type { ArchetypeType } from './archetypes/types';

// ============================================
// Type Definitions
// ============================================

export interface KnowledgeBase {
  posts: InstagramPost[];
  highlights: InstagramHighlight[];
  coupons: Coupon[];
  partnerships: Partnership[];
  insights: ConversationInsight[];
  websites: WebsiteContent[];
  transcriptions: VideoTranscription[];
}

export interface VideoTranscription {
  id: string;
  text: string;
  media_id: string;
  created_at: string;
}

export interface InstagramPost {
  id: string;
  caption: string;
  hashtags: string[];
  type: 'post' | 'reel' | 'carousel';
  posted_at: string;
  likes_count: number;
  engagement_rate: number;
  media_urls: string[];
}

export interface InstagramHighlight {
  id: string;
  title: string;
  cover_url: string;
  media_samples: any[];
  scraped_at: string;
}

export interface Coupon {
  brand: string;
  code: string;
  discount: string;
  category: string;
  link?: string;
}

export interface Partnership {
  brand_name: string;
  partnership_type: string;
  description: string;
}

export interface ConversationInsight {
  insight_type: string;
  title: string;
  content: string;
  occurrence_count: number;
  confidence_score: number;
}

export interface WebsiteContent {
  url: string;
  title: string;
  content: string;
  scraped_at: string;
}

// ============================================
// Archetype Keywords Mapping
// ============================================

const ARCHETYPE_KEYWORDS: Record<ArchetypeType, string[]> = {
  skincare: [
    'קרם', 'סרום', 'עור', 'פנים', 'ניקוי', 'טיפוח', 'שגרה',
    'רטינול', 'ויטמין', 'SPF', 'חומצה', 'אקנה', 'כתמים',
    'skincare', 'serum', 'cream', 'routine', 'retinol',
  ],
  fashion: [
    'בגד', 'אאוטפיט', 'שמלה', 'חולצה', 'מכנסיים', 'נעליים',
    'סטייל', 'לוק', 'אופנה', 'מידה', 'צבע', 'מותג',
    'fashion', 'outfit', 'style', 'dress', 'shirt',
  ],
  cooking: [
    'מתכון', 'אוכל', 'ארוחה', 'בישול', 'אפייה', 'מנה',
    'רכיבים', 'מצרכים', 'ארוחת', 'טעים', 'מהיר',
    'recipe', 'food', 'cooking', 'meal', 'ingredients',
  ],
  fitness: [
    'אימון', 'כושר', 'ספורט', 'תרגיל', 'שרירים', 'קרדיו',
    'משקולות', 'פילאטיס', 'יוגה', 'ריצה', 'כוח', 'מתיחות',
    'טיפים', 'להתחיל', 'מתאמנת', 'כושר גופני', 'בריאות',
    'workout', 'fitness', 'training', 'exercise', 'gym', 'yoga',
  ],
  parenting: [
    'ילד', 'תינוק', 'אמא', 'הורות', 'חינוך', 'גיל',
    'התפתחות', 'משחק', 'שינה', 'אוכל', 'גן',
    'parenting', 'baby', 'kids', 'child', 'mom',
  ],
  coupons: [
    'קופון', 'הנחה', 'מבצע', 'קוד', 'discount', 'sale',
    'promo', 'coupon', 'deal', 'offer', '%',
  ],
  tech: [
    'אפליקציה', 'טכנולוגיה', 'סושיאל', 'אינסטגרם', 'טיקטוק',
    'עריכה', 'פילטר', 'ריל', 'תוכן', 'קריאייטור',
    'app', 'tech', 'social', 'instagram', 'tiktok', 'content',
  ],
  travel: [
    'טיול', 'נסיעה', 'חופשה', 'מקום', 'מלון', 'טיסה',
    'המלצות', 'מסעדה', 'אטרקציה', 'יעד',
    'travel', 'trip', 'vacation', 'hotel', 'destination',
  ],
  mindset: [
    'מוטיבציה', 'השראה', 'העצמה', 'מחשבות', 'רגשות',
    'מיינדסט', 'חיובי', 'מטרה', 'הצלחה', 'צמיחה',
    'mindset', 'motivation', 'inspiration', 'growth', 'positive',
  ],
  interior: [
    'עיצוב', 'בית', 'דירה', 'חדר', 'ריהוט', 'דקורציה',
    'צבע', 'סגנון', 'אסתטיקה', 'פינה',
    'interior', 'home', 'design', 'decor', 'furniture',
  ],
  general: [],
};

// ============================================
// Main Retrieval Function
// ============================================

export async function retrieveKnowledge(
  accountId: string,
  archetype: ArchetypeType,
  userMessage: string,
  limit: number = 10
): Promise<KnowledgeBase> {
  const supabase = await createClient();
  
  console.log(`[Knowledge Retrieval] 🚀 AI-First Strategy: Fetching ALL data, letting Gemini understand context`);
  console.log(`[Knowledge Retrieval] Archetype: ${archetype}`);
  console.log(`[Knowledge Retrieval] Message: ${userMessage.substring(0, 50)}...`);

  // ⚡ AI-First: Keywords are only for archetype routing, not for data filtering
  // The AI (Gemini) will understand Hebrew/English/variations and find relevant info
  const keywords = ARCHETYPE_KEYWORDS[archetype] || [];
  const messageKeywords = extractKeywordsFromMessage(userMessage);
  const allKeywords = [...new Set([...keywords, ...messageKeywords])];

  // Parallel fetch from all sources - NO keyword filtering in SQL!
  const [posts, highlights, coupons, partnerships, insights, websites, transcriptions] = await Promise.all([
    fetchRelevantPosts(supabase, accountId, allKeywords, limit),
    fetchRelevantHighlights(supabase, accountId, allKeywords, limit),
    fetchRelevantCoupons(supabase, accountId, allKeywords, archetype),
    fetchRelevantPartnerships(supabase, accountId, allKeywords),
    fetchRelevantInsights(supabase, accountId, archetype, limit),
    fetchRelevantWebsites(supabase, accountId, allKeywords, limit),
    fetchRelevantTranscriptions(supabase, accountId, allKeywords, limit),
  ]);

  console.log(`[Knowledge Retrieval] ✅ Found:`);
  console.log(`  - Posts: ${posts.length}`);
  console.log(`  - Highlights: ${highlights.length}`);
  console.log(`  - Coupons: ${coupons.length}`);
  console.log(`  - Partnerships: ${partnerships.length}`);
  console.log(`  - Insights: ${insights.length}`);
  console.log(`  - Websites: ${websites.length}`);
  console.log(`  - Transcriptions: ${transcriptions.length}`);
  
  // 🐛 DEBUG: Show actual data
  if (coupons.length > 0) {
    console.log(`\n📋 [DEBUG] Coupons data:`);
    coupons.forEach(c => console.log(`   - ${c.brand}: ${c.code} (${c.discount})`));
  }
  if (posts.length > 0) {
    console.log(`\n📋 [DEBUG] Posts data:`);
    posts.slice(0, 3).forEach(p => console.log(`   - ${p.caption?.substring(0, 60)}...`));
  }

  return {
    posts,
    highlights,
    coupons,
    partnerships,
    insights,
    websites,
    transcriptions,
  };
}

// ============================================
// Helper Functions
// ============================================

function extractKeywordsFromMessage(message: string): string[] {
  // ⚡ AI-First: We barely use keywords anymore - AI understands the full message
  // This is just for basic archetype routing, not for filtering data
  const commonWords = ['את', 'אני', 'של', 'על', 'עם', 'מה', 'איך', 'למה', 'כמה', 'יש', 'לך'];
  
  const words = message
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !commonWords.includes(word));
  
  return words;
}

async function fetchRelevantPosts(
  supabase: any,
  accountId: string,
  keywords: string[],
  limit: number
): Promise<InstagramPost[]> {
  try {
    // ⚡ AI-First: Get recent high-engagement posts, AI will understand context
    const { data, error } = await supabase
      .from('instagram_posts')
      .select('id, caption, hashtags, type, posted_at, likes_count, engagement_rate, media_urls')
      .eq('account_id', accountId)
      .order('posted_at', { ascending: false }) // Most recent first
      .limit(Math.max(limit, 20)); // At least 20 posts for AI to work with
    
    if (error) {
      console.error('[fetchPosts] Error:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('[fetchPosts] Exception:', error);
    return [];
  }
}

async function fetchRelevantHighlights(
  supabase: any,
  accountId: string,
  keywords: string[],
  limit: number
): Promise<InstagramHighlight[]> {
  try {
    // ⚡ AI-First: Get all highlights, AI understands titles in any language
    const { data, error } = await supabase
      .from('instagram_highlights')
      .select('id, title, cover_url, media_samples, scraped_at')
      .eq('account_id', accountId)
      .order('scraped_at', { ascending: false })
      .limit(50); // Get all highlights
    
    if (error) {
      console.error('[fetchHighlights] Error:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('[fetchHighlights] Exception:', error);
    return [];
  }
}

async function fetchRelevantCoupons(
  supabase: any,
  accountId: string,
  keywords: string[],
  archetype: ArchetypeType
): Promise<Coupon[]> {
  const allCoupons: Coupon[] = [];
  
  // ⚡ AI-First Strategy: Get ALL active coupons, let AI decide what's relevant
  try {
    const { data: couponsData, error: couponsError } = await supabase
      .from('coupons')
      .select(`
        id,
        code,
        description,
        discount_type,
        discount_value,
        partnerships (
          brand_name,
          category,
          website
        )
      `)
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(100); // ⬅️ Get ALL coupons, AI will understand Hebrew/English/variations

    if (couponsError) {
      console.error('❌ Error fetching coupons:', couponsError);
    } else if (couponsData) {
      allCoupons.push(...couponsData.map((c: any) => {
        const partnership = c.partnerships;
        let discount = c.description || 'הנחה';
        
        if (c.discount_type === 'percentage' && c.discount_value) {
          discount = `${c.discount_value}% הנחה`;
        } else if (c.discount_type === 'fixed' && c.discount_value) {
          discount = `₪${c.discount_value} הנחה`;
        } else if (c.discount_type === 'free_shipping') {
          discount = 'משלוח חינם';
        }
        
        return {
          brand: partnership?.brand_name || 'מותג לא ידוע',
          code: c.code,
          discount: discount,
          category: partnership?.category || 'general',
          link: partnership?.website,
        };
      }));
    }
  } catch (error) {
    console.error('[fetchCoupons] Error loading from coupons table:', error);
  }

  console.log(`[fetchRelevantCoupons] ✅ Found ${allCoupons.length} total coupons (AI will filter)`);
  
  return allCoupons;
}

async function fetchRelevantPartnerships(
  supabase: any,
  accountId: string,
  keywords: string[]
): Promise<Partnership[]> {
  try {
    // ⚡ AI-First: Get ALL partnerships, let Gemini understand the brands
    const { data, error } = await supabase
      .from('partnerships')
      .select('brand_name, status, brief, category')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50); // Get all partnerships
    
    if (error) {
      console.error('[fetchPartnerships] Error:', error);
      return [];
    }

    return (data || []).map((p: any) => ({
      brand_name: p.brand_name,
      partnership_type: 'collaboration',
      description: p.brief || p.category || '',
    }));
  } catch (error) {
    console.error('[fetchPartnerships] Exception:', error);
    return [];
  }
}

async function fetchRelevantInsights(
  supabase: any,
  accountId: string,
  archetype: ArchetypeType,
  limit: number
): Promise<ConversationInsight[]> {
  const { data } = await supabase
    .from('conversation_insights')
    .select('insight_type, title, content, occurrence_count, confidence_score')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .eq('archetype', archetype)
    .order('occurrence_count', { ascending: false })
    .limit(limit);

  return data || [];
}

async function fetchRelevantWebsites(
  supabase: any,
  accountId: string,
  keywords: string[],
  limit: number
): Promise<WebsiteContent[]> {
  try {
    // ⚡ AI-First: Get all Linkis pages (coupons, links, etc.)
    const { data, error } = await supabase
      .from('instagram_bio_websites')
      .select('url, page_title, page_content, scraped_at')
      .eq('account_id', accountId)
      .order('scraped_at', { ascending: false })
      .limit(20); // Get all recent website data
    
    if (error) {
      console.error('[fetchWebsites] Error:', error);
      return [];
    }
    
    return (data || []).map((w: any) => ({
      url: w.url,
      title: w.page_title,
      content: w.page_content,
      scraped_at: w.scraped_at,
    }));
  } catch (error) {
    console.error('[fetchWebsites] Exception:', error);
    return [];
  }
}

async function fetchRelevantTranscriptions(
  supabase: any,
  accountId: string,
  keywords: string[],
  limit: number
): Promise<VideoTranscription[]> {
  try {
    // ⚡ AI-First: Get ALL recent transcriptions (recipes, workouts, tips in videos)
    const { data, error } = await supabase
      .from('instagram_transcriptions')
      .select('id, transcription_text, source_id, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(Math.max(limit, 30)); // Get at least 30 recent video transcriptions

    if (error) {
      console.error('[fetchTranscriptions] Error:', error);
      return [];
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      text: t.transcription_text,
      media_id: t.source_id,
      created_at: t.created_at,
    }));
  } catch (error) {
    console.error('[fetchTranscriptions] Exception:', error);
    return [];
  }
}

// ============================================
// Knowledge Base Utilities
// ============================================

/**
 * Format knowledge base for AI prompt
 */
export function formatKnowledgeForPrompt(kb: KnowledgeBase, maxLength: number = 3000): string {
  let context = '';

  // Add posts
  if (kb.posts.length > 0) {
    context += '## פוסטים רלוונטיים:\n\n';
    kb.posts.slice(0, 3).forEach((post, i) => {
      context += `${i + 1}. [${post.type}] ${post.posted_at.split('T')[0]}\n`;
      context += `   ${post.caption?.substring(0, 200)}...\n`;
      if (post.hashtags?.length > 0) {
        context += `   #${post.hashtags.slice(0, 3).join(' #')}\n`;
      }
      context += '\n';
    });
  }

  // Add highlights
  if (kb.highlights.length > 0) {
    context += '## הילייטס:\n';
    kb.highlights.slice(0, 3).forEach(h => {
      context += `- ${h.title}\n`;
    });
    context += '\n';
  }

  // Add coupons
  if (kb.coupons.length > 0) {
    context += '## קופונים פעילים:\n';
    kb.coupons.forEach(c => {
      context += `- ${c.brand}: קוד "${c.code}" (${c.discount})`;
      if (c.link) context += ` | ${c.link}`;
      context += '\n';
    });
    context += '\n';
  }

  // Add insights
  if (kb.insights.length > 0) {
    context += '## תובנות מהשיחות:\n';
    kb.insights.slice(0, 3).forEach(insight => {
      context += `- [${insight.insight_type}] ${insight.title}\n`;
      context += `  ${insight.content.substring(0, 150)}...\n`;
    });
    context += '\n';
  }

  // Add transcriptions (video/reel content) - IMPORTANT for recipes, workouts, tips
  if (kb.transcriptions.length > 0) {
    context += '## תמלולים מסרטונים (מתכונים, אימונים, טיפים):\n';
    kb.transcriptions.slice(0, 5).forEach(t => {
      context += `- ${t.text}\n\n`; // Show full transcription
    });
    context += '\n';
  }

  // Truncate if too long
  if (context.length > maxLength) {
    context = context.substring(0, maxLength) + '\n...(קטע נוסף)';
  }

  // 🐛 DEBUG: Show formatted prompt
  console.log(`\n📋 [DEBUG] Formatted Knowledge Context (${context.length} chars):`);
  console.log('─'.repeat(60));
  console.log(context.substring(0, 500) + '...');
  console.log('─'.repeat(60));

  return context;
}

/**
 * Check if knowledge base has relevant content
 */
export function hasRelevantKnowledge(kb: KnowledgeBase): boolean {
  return (
    kb.posts.length > 0 ||
    kb.highlights.length > 0 ||
    kb.coupons.length > 0 ||
    kb.insights.length > 0 ||
    kb.websites.length > 0 ||
    kb.transcriptions.length > 0
  );
}
