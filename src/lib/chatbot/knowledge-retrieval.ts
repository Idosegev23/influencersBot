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
    'משקולות', 'פילאטיס', 'יוגה', 'ריצה', 'כוח',
    'workout', 'fitness', 'training', 'exercise', 'gym',
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
  
  console.log(`[Knowledge Retrieval] Starting for archetype: ${archetype}`);
  console.log(`[Knowledge Retrieval] User message: ${userMessage.substring(0, 50)}...`);

  // Get archetype keywords
  const keywords = ARCHETYPE_KEYWORDS[archetype] || [];
  
  // Extract additional keywords from user message
  const messageKeywords = extractKeywordsFromMessage(userMessage);
  const allKeywords = [...new Set([...keywords, ...messageKeywords])];
  
  console.log(`[Knowledge Retrieval] Using keywords: ${allKeywords.slice(0, 5).join(', ')}`);

  // Parallel fetch from all sources
  const [posts, highlights, coupons, partnerships, insights, websites] = await Promise.all([
    fetchRelevantPosts(supabase, accountId, allKeywords, limit),
    fetchRelevantHighlights(supabase, accountId, allKeywords, limit),
    fetchRelevantCoupons(supabase, accountId, allKeywords, archetype),
    fetchRelevantPartnerships(supabase, accountId, allKeywords),
    fetchRelevantInsights(supabase, accountId, archetype, limit),
    fetchRelevantWebsites(supabase, accountId, allKeywords, limit),
  ]);

  console.log(`[Knowledge Retrieval] ✅ Found:`);
  console.log(`  - Posts: ${posts.length}`);
  console.log(`  - Highlights: ${highlights.length}`);
  console.log(`  - Coupons: ${coupons.length}`);
  console.log(`  - Partnerships: ${partnerships.length}`);
  console.log(`  - Insights: ${insights.length}`);
  console.log(`  - Websites: ${websites.length}`);
  
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
  };
}

// ============================================
// Helper Functions
// ============================================

function extractKeywordsFromMessage(message: string): string[] {
  // Remove common words and extract meaningful terms
  const commonWords = ['את', 'אני', 'של', 'על', 'עם', 'מה', 'איך', 'למה', 'כמה'];
  
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
  if (keywords.length === 0) {
    // No keywords, return recent posts
    const { data } = await supabase
      .from('instagram_posts')
      .select('id, caption, hashtags, type, posted_at, likes_count, engagement_rate, media_urls')
      .eq('account_id', accountId)
      .order('posted_at', { ascending: false })
      .limit(limit);
    
    return data || [];
  }

  // Build ILIKE conditions for all keywords
  let query = supabase
    .from('instagram_posts')
    .select('id, caption, hashtags, type, posted_at, likes_count, engagement_rate, media_urls')
    .eq('account_id', accountId);

  // Search in caption with OR logic
  const captionConditions = keywords.map(k => `caption.ilike.%${k}%`).join(',');
  query = query.or(captionConditions);

  const { data } = await query
    .order('engagement_rate', { ascending: false })
    .order('posted_at', { ascending: false })
    .limit(limit);

  return data || [];
}

async function fetchRelevantHighlights(
  supabase: any,
  accountId: string,
  keywords: string[],
  limit: number
): Promise<InstagramHighlight[]> {
  if (keywords.length === 0) {
    const { data } = await supabase
      .from('instagram_highlights')
      .select('id, title, cover_url, media_samples, scraped_at')
      .eq('account_id', accountId)
      .order('scraped_at', { ascending: false })
      .limit(limit);
    
    return data || [];
  }

  let query = supabase
    .from('instagram_highlights')
    .select('id, title, cover_url, media_samples, scraped_at')
    .eq('account_id', accountId);

  const titleConditions = keywords.map(k => `title.ilike.%${k}%`).join(',');
  query = query.or(titleConditions);

  const { data } = await query
    .order('scraped_at', { ascending: false })
    .limit(limit);

  return data || [];
}

async function fetchRelevantCoupons(
  supabase: any,
  accountId: string,
  keywords: string[],
  archetype: ArchetypeType
): Promise<Coupon[]> {
  const allCoupons: Coupon[] = [];
  
  // ⚡ FIRST: Get coupons from Linkis/websites (most important!)
  try {
    const { data: websites } = await supabase
      .from('instagram_bio_websites')
      .select('page_content, url')
      .eq('account_id', accountId)
      .order('scraped_at', { ascending: false })
      .limit(5);
    
    if (websites) {
      for (const site of websites) {
        const content = site.page_content || '';
        
        // Parse coupons from Linkis format
        // Format: "1. פלולס - הנחה משתנה"
        const couponMatches = content.matchAll(/(\d+)\.\s*([^-\n]+)\s*-\s*([^\n]+)/g);
        
        for (const match of couponMatches) {
          const brand = match[2]?.trim();
          const discount = match[3]?.trim();
          
          if (brand && discount && !brand.includes('http')) {
            allCoupons.push({
              brand: brand,
              code: brand, // Use brand as code if no explicit code
              discount: discount,
              category: 'linkis',
              link: site.url,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('[fetchCoupons] Error loading from websites:', error);
  }
  
  // SECOND: Get coupons from partnerships table
  try {
    const shouldFetchAll = archetype === 'coupons' || keywords.some(k => 
      ['קופון', 'הנחה', 'מבצע', 'קוד', 'coupon'].includes(k.toLowerCase())
    );
    
    if (shouldFetchAll) {
      const { data } = await supabase
        .from('partnerships')
        .select('brand_name, coupon_code, discount_percentage, category, link')
        .eq('account_id', accountId)
        .eq('status', 'active')
        .not('coupon_code', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        allCoupons.push(...data.map((p: any) => ({
          brand: p.brand_name,
          code: p.coupon_code,
          discount: p.discount_percentage ? `${p.discount_percentage}%` : 'הנחה',
          category: p.category || 'partnership',
          link: p.link,
        })));
      }
    }
  } catch (error) {
    console.error('[fetchCoupons] Error loading from partnerships:', error);
  }

  console.log(`[fetchRelevantCoupons] ✅ Found ${allCoupons.length} total coupons`);
  
  return allCoupons;
}

async function fetchRelevantPartnerships(
  supabase: any,
  accountId: string,
  keywords: string[]
): Promise<Partnership[]> {
  let query = supabase
    .from('partnerships')
    .select('brand_name, partnership_type, description')
    .eq('account_id', accountId)
    .eq('status', 'active');

  if (keywords.length > 0) {
    const conditions = keywords.map(k => `brand_name.ilike.%${k}%,description.ilike.%${k}%`).join(',');
    query = query.or(conditions);
  }

  const { data } = await query.limit(10);

  return (data || []).map((p: any) => ({
    brand_name: p.brand_name,
    partnership_type: p.partnership_type || 'collaboration',
    description: p.description || '',
  }));
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
  // ⚡ Use instagram_bio_websites (correct table name)
  if (keywords.length === 0) {
    const { data } = await supabase
      .from('instagram_bio_websites')
      .select('url, page_title, page_content, scraped_at')
      .eq('account_id', accountId)
      .order('scraped_at', { ascending: false })
      .limit(limit);
    
    return (data || []).map((w: any) => ({
      url: w.url,
      title: w.page_title,
      content: w.page_content,
      scraped_at: w.scraped_at,
    }));
  }

  let query = supabase
    .from('instagram_bio_websites')
    .select('url, page_title, page_content, scraped_at')
    .eq('account_id', accountId);

  const contentConditions = keywords.map(k => `page_content.ilike.%${k}%,page_title.ilike.%${k}%`).join(',');
  query = query.or(contentConditions);

  const { data } = await query
    .order('scraped_at', { ascending: false })
    .limit(limit);

  return (data || []).map((w: any) => ({
    url: w.url,
    title: w.page_title,
    content: w.page_content,
    scraped_at: w.scraped_at,
  })) || [];
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
    kb.websites.length > 0
  );
}
