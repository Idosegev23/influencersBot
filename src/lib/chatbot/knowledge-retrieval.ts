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
  
  console.log(`[Knowledge Retrieval] 🔍 INDEXED SEARCH - כל התוכן נגיש!`);
  console.log(`[Knowledge Retrieval] Archetype: ${archetype}`);
  console.log(`[Knowledge Retrieval] Query: ${userMessage.substring(0, 50)}...`);

  // ⚡ Use Full Text Search INDEX! All 10,000+ items are searchable!
  // No more limits - PostgreSQL finds the most relevant content automatically
  const [posts, highlights, coupons, partnerships, insights, websites, transcriptions] = await Promise.all([
    fetchRelevantPostsIndexed(supabase, accountId, userMessage, Math.max(limit, 15)),
    fetchRelevantHighlights(supabase, accountId, [], limit),
    fetchRelevantCoupons(supabase, accountId, [], archetype, userMessage), // ⚡ Pass userMessage
    fetchRelevantPartnerships(supabase, accountId, [], userMessage), // ⚡ Pass userMessage
    fetchRelevantInsights(supabase, accountId, archetype, limit),
    fetchRelevantWebsites(supabase, accountId, [], limit),
    fetchRelevantTranscriptionsIndexed(supabase, accountId, userMessage, Math.max(limit, 20)),
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

// ⚡ NEW: Indexed search for posts (searches ALL posts!)
async function fetchRelevantPostsIndexed(
  supabase: any,
  accountId: string,
  userQuery: string,
  limit: number
): Promise<InstagramPost[]> {
  try {
    // Use Full Text Search INDEX - searches ALL posts in database!
    const { data, error } = await supabase
      .rpc('search_posts', {
        p_account_id: accountId,
        p_query: userQuery,
        p_limit: limit
      });

    if (error) {
      // Real error - log it!
      console.error('[fetchPostsIndexed] RPC error:', error);
      console.warn('[fetchPostsIndexed] Using fallback query');
      const { data: fallbackData } = await supabase
        .from('instagram_posts')
        .select('id, caption, hashtags, type, posted_at, likes_count, engagement_rate, media_urls')
        .eq('account_id', accountId)
        .order('posted_at', { ascending: false })
        .limit(limit);
      
      return fallbackData || [];
    }
    
    if (!data || data.length === 0) {
      // No results found (legitimate) - no error, just no matching content
      console.log('[fetchPostsIndexed] ℹ️ No posts match query, using recent posts');
      const { data: fallbackData } = await supabase
        .from('instagram_posts')
        .select('id, caption, hashtags, type, posted_at, likes_count, engagement_rate, media_urls')
        .eq('account_id', accountId)
        .order('posted_at', { ascending: false })
        .limit(limit);
      
      return fallbackData || [];
    }

    // Add missing fields to indexed results
    const fullPosts = await supabase
      .from('instagram_posts')
      .select('id, caption, hashtags, type, posted_at, likes_count, engagement_rate, media_urls')
      .eq('account_id', accountId)
      .in('id', data.map((p: any) => p.id));

    console.log(`[fetchPostsIndexed] ✅ Found ${fullPosts.data?.length || 0} posts via INDEX`);
    return fullPosts.data || [];
    
  } catch (error) {
    console.error('[fetchPostsIndexed] Exception:', error);
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
      .select('id, title, cover_image_url, items_count, scraped_at')
      .eq('account_id', accountId)
      .order('scraped_at', { ascending: false })
      .limit(50); // Get all highlights
    
    if (error) {
      console.error('[fetchHighlights] Error:', error);
      return [];
    }
    
    return (data || []).map((h: any) => ({
      id: h.id,
      title: h.title,
      cover_url: h.cover_image_url, // Map correct column name
      media_samples: [], // Not available in new schema
      scraped_at: h.scraped_at,
    }));
  } catch (error) {
    console.error('[fetchHighlights] Exception:', error);
    return [];
  }
}

async function fetchRelevantCoupons(
  supabase: any,
  accountId: string,
  keywords: string[],
  archetype: ArchetypeType,
  userMessage?: string // ⚡ Add userMessage parameter
): Promise<Coupon[]> {
  const allCoupons: Coupon[] = [];
  
  // ⚡ NEW: Use indexed search if user query has keywords
  // Use userMessage if available (better context), otherwise keywords
  const searchQuery = userMessage || keywords.join(' ');
  
    if (searchQuery && searchQuery.length > 2) {
      try {
        // Map Hebrew to English brand names for better search results
        const brandMap: Record<string, string> = {
          'ספרינג': 'Spring',
          'ארגניה': 'Argania',
          'ליבס': 'Leaves',
          'קייר': 'K-Care',
          'אורגניקס': 'Organics',
        };

        let mappedQuery = searchQuery;
        Object.entries(brandMap).forEach(([he, en]) => {
          if (searchQuery.toLowerCase().includes(he.toLowerCase())) {
            mappedQuery = `${mappedQuery} ${en}`;
          }
        });

        const { data: searchResults, error: searchError } = await supabase
          .rpc('search_coupons', {
            p_account_id: accountId,
            p_query: mappedQuery,
            p_limit: 20
          });

        if (searchError) {
          console.error('[fetchCoupons] RPC error:', searchError);
          console.warn('[fetchCoupons] Using fallback query');
        } else if (searchResults && searchResults.length > 0) {
          console.log(`[fetchCoupons] ✅ Found ${searchResults.length} coupons via INDEXED SEARCH`);
          
          // Fetch partnerships links in parallel
          const partnershipPromises = searchResults.map(async (c: any) => {
            const { data: partnership } = await supabase
              .from('partnerships')
              .select('link')
              .eq('account_id', accountId)
              .ilike('brand_name', c.brand_name)
              .maybeSingle();
            return partnership?.link || null;
          });
          
          const links = await Promise.all(partnershipPromises);
          
          for (let i = 0; i < searchResults.length; i++) {
            const c = searchResults[i];
            let discount = c.description || 'הנחה';
            
            if (c.discount_type === 'percentage' && c.discount_value) {
              discount = `${c.discount_value}% הנחה`;
            } else if (c.discount_type === 'fixed' && c.discount_value) {
              discount = `₪${c.discount_value} הנחה`;
            }
            
            // Clean and validate link
            let cleanLink = links[i];
            if (cleanLink) {
              cleanLink = cleanLink.trim();
              // Remove any non-URL characters (Hebrew text, spaces in the middle)
              cleanLink = cleanLink.replace(/\s+/g, '');
              // Ensure it starts with http/https
              if (!cleanLink.startsWith('http')) {
                cleanLink = 'https://' + cleanLink;
              }
            }
            
            allCoupons.push({
              brand: c.brand_name || 'מותג',
              code: c.code,
              discount: discount,
              category: 'general',
              link: cleanLink || null,
            });
          }
          return allCoupons;
        } else {
          console.log('[fetchCoupons] ℹ️ No coupons match search query');
        }
      } catch (error) {
        console.error('[fetchCoupons] Exception during indexed search:', error);
      }
    }
  
  // Fallback: Get ALL active coupons
  try {
    // Use raw SQL with explicit JOIN (more reliable than Supabase nested select)
    const { data: couponsData, error: couponsError } = await supabase
      .rpc('get_coupons_with_partnerships', {
        p_account_id: accountId
      });

    if (couponsError) {
      // Fallback: Try simple query without partnerships
      console.warn('⚠️ RPC failed, trying fallback query:', couponsError);
      
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('coupons')
        .select('id, code, description, discount_type, discount_value, partnership_id')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
      } else if (fallbackData) {
        // Get partnerships separately
        const partnershipIds = fallbackData.map((c: any) => c.partnership_id).filter(Boolean);
        const { data: partnershipsData } = await supabase
          .from('partnerships')
          .select('id, brand_name, category, link')
          .in('id', partnershipIds);
        
        const partnershipMap = new Map(partnershipsData?.map((p: any) => [p.id, p]) || []);
        
        for (const c of fallbackData) {
          const partnership = c.partnership_id ? partnershipMap.get(c.partnership_id) : null;
          let discount = c.description || 'הנחה';
          
          if (c.discount_type === 'percentage' && c.discount_value) {
            discount = `${c.discount_value}% הנחה`;
          } else if (c.discount_type === 'fixed' && c.discount_value) {
            discount = `₪${c.discount_value} הנחה`;
          } else if (c.discount_type === 'free_shipping') {
            discount = 'משלוח חינם';
          }
          
          allCoupons.push({
            brand: partnership?.brand_name || 'מותג',
            code: c.code,
            discount: discount,
            category: partnership?.category || 'general',
            link: partnership?.link,
          });
        }
      }
    } else if (couponsData) {
      // RPC worked, use the data directly
      for (const c of couponsData) {
        let discount = c.description || 'הנחה';
        
        if (c.discount_type === 'percentage' && c.discount_value) {
          discount = `${c.discount_value}% הנחה`;
        } else if (c.discount_type === 'fixed' && c.discount_value) {
          discount = `₪${c.discount_value} הנחה`;
        } else if (c.discount_type === 'free_shipping') {
          discount = 'משלוח חינם';
        }
        
        allCoupons.push({
          brand: c.brand_name || 'מותג',
          code: c.code,
          discount: discount,
          category: c.category || 'general',
          link: c.link,
        });
      }
    }
  } catch (error) {
    console.error('[fetchCoupons] Exception:', error);
  }

  console.log(`[fetchRelevantCoupons] ✅ Found ${allCoupons.length} total coupons (AI will filter)`);
  
  return allCoupons;
}

async function fetchRelevantPartnerships(
  supabase: any,
  accountId: string,
  keywords: string[],
  userMessage?: string // ⚡ Add userMessage parameter
): Promise<Partnership[]> {
  try {
    // ⚡ NEW: Use indexed search if user has query
    const userQuery = keywords.join(' ');
    // ⚡ FIX: Use full query if available
    const searchQuery = userMessage || userQuery;

    if (searchQuery && searchQuery.length > 2) {
      const { data: searchResults, error: searchError } = await supabase
        .rpc('search_partnerships', {
          p_account_id: accountId,
          p_query: searchQuery,
          p_limit: 10
        });

      if (searchError) {
        console.error('[fetchPartnerships] RPC error:', searchError);
        console.warn('[fetchPartnerships] Using fallback query');
      } else if (searchResults && searchResults.length > 0) {
        console.log(`[fetchPartnerships] ✅ Found ${searchResults.length} partnerships via INDEXED SEARCH`);
        return searchResults.map((p: any) => ({
          brand_name: p.brand_name,
          partnership_type: p.category || 'collaboration',
          description: p.brief || '',
        }));
      } else {
        console.log('[fetchPartnerships] ℹ️ No partnerships match search query');
      }
    }

    // Fallback: Get ALL active partnerships
    // NOTE: This includes brands WITHOUT coupons (they're shown as partnerships only, not as coupons)
    const { data, error } = await supabase
      .from('partnerships')
      .select('brand_name, status, brief, category')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('[fetchPartnerships] Error:', error);
      return [];
    }

    console.log(`[fetchPartnerships] ✅ Found ${data?.length || 0} partnerships (includes brands without coupons)`);

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

// ⚡ NEW: Indexed search for transcriptions (searches ALL 356 transcriptions!)
async function fetchRelevantTranscriptionsIndexed(
  supabase: any,
  accountId: string,
  userQuery: string,
  limit: number
): Promise<VideoTranscription[]> {
  try {
    // Use Full Text Search INDEX - searches ALL transcriptions in database!
    const { data, error } = await supabase
      .rpc('search_transcriptions', {
        p_account_id: accountId,
        p_query: userQuery,
        p_limit: limit
      });

    if (error) {
      // Real error - log it!
      console.error('[fetchTranscriptionsIndexed] RPC error:', error);
      console.warn('[fetchTranscriptionsIndexed] Using fallback query');
      const { data: fallbackData } = await supabase
        .from('instagram_transcriptions')
        .select('id, transcription_text, source_id, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      return (fallbackData || []).map((t: any) => ({
        id: t.id,
        text: t.transcription_text,
        media_id: t.source_id,
        created_at: t.created_at,
      }));
    }
    
    if (!data || data.length === 0) {
      // No results found (legitimate) - no error, just no matching content
      console.log('[fetchTranscriptionsIndexed] ℹ️ No transcriptions match query, using recent ones');
      const { data: fallbackData } = await supabase
        .from('instagram_transcriptions')
        .select('id, transcription_text, source_id, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      return (fallbackData || []).map((t: any) => ({
        id: t.id,
        text: t.transcription_text,
        media_id: t.source_id,
        created_at: t.created_at,
      }));
    }

    console.log(`[fetchTranscriptionsIndexed] ✅ Found ${data.length} transcriptions via INDEX`);
    
    return data.map((t: any) => ({
      id: t.id,
      text: t.transcription_text,
      media_id: t.source_id,
      created_at: t.created_at,
    }));
    
  } catch (error) {
    console.error('[fetchTranscriptionsIndexed] Exception:', error);
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
