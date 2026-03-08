/**
 * Knowledge Retrieval - שליפת מידע רלוונטי מהמקורות הסרוקים
 * מחבר את הארכיטיפים למידע האמיתי של המשפיען
 */

import { createClient } from '@/lib/supabase/server';
import { retrieveContext } from '@/lib/rag';
import type { RetrievedSource } from '@/lib/rag';
import type { ArchetypeType } from './archetypes/types';
import { getMetrics } from '@/lib/metrics/pipeline-metrics';

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
  content_text?: string; // Combined transcription + OCR text
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
  coupon_code?: string;
  link?: string;
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
  image_urls?: string[];
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
  limit: number = 10,
  rollingSummary?: string
): Promise<KnowledgeBase> {
  const supabase = await createClient();

  // Detect greetings — minimal retrieval to avoid knowledge dumping
  const isGreeting = isSimpleGreeting(userMessage);

  if (isGreeting) {
    console.log(`[Knowledge Retrieval] 👋 Greeting detected — minimal retrieval`);
    getMetrics()?.set('retrievalPath', 'greeting_skip');
    // For greetings: only fetch coupons (in case user asks next) — skip everything else
    const coupons = await fetchRelevantCoupons(supabase, accountId, [], archetype, '');
    return {
      posts: [],
      highlights: [],
      coupons,
      partnerships: [],
      insights: [],
      websites: [],
      transcriptions: [],
    };
  }

  console.log(`[Knowledge Retrieval] Archetype: ${archetype}`);
  console.log(`[Knowledge Retrieval] Query: ${userMessage.substring(0, 50)}...`);

  // ============================================
  // Combined Retrieval: Direct DB queries ALWAYS run
  // + RAG vector search when available, FTS fallback otherwise
  // ============================================
  const ragAvailable = await isRAGAvailable(supabase, accountId);
  const normalizedQuery = normalizeHebrewQuery(userMessage);

  console.log(`[Knowledge Retrieval] Mode: ${ragAvailable ? 'RAG + Direct DB' : 'FTS + Direct DB'}`);
  getMetrics()?.set('retrievalPath', ragAvailable ? 'rag+direct' : 'fts');

  // Direct DB queries — ALWAYS run regardless of RAG availability
  const directPromises = {
    websites: fetchRelevantWebsites(supabase, accountId, [], 3),
    coupons: fetchRelevantCoupons(supabase, accountId, [], archetype, userMessage),
    partnerships: fetchRelevantPartnerships(supabase, accountId, [], userMessage),
    insights: fetchRelevantInsights(supabase, accountId, archetype, 3),
  };

  // Content search — RAG vector search OR FTS fallback
  const contentPromises: Record<string, Promise<any>> = {};
  if (ragAvailable) {
    contentPromises.rag = retrieveContext({
      accountId,
      query: userMessage,
      topK: 12,
      conversationSummary: rollingSummary,
    });
  } else {
    contentPromises.posts = fetchRelevantPostsIndexed(supabase, accountId, normalizedQuery, 5);
    contentPromises.highlights = fetchRelevantHighlights(supabase, accountId, [], 20);
    contentPromises.transcriptions = fetchRelevantTranscriptionsIndexed(supabase, accountId, normalizedQuery, 5);
  }

  // Run ALL queries in parallel
  const allPromises: Record<string, Promise<any>> = { ...directPromises, ...contentPromises };
  const results: Record<string, any> = await promiseAllSettledObj(allPromises);

  // Direct DB results (always available)
  const directWebsites: WebsiteContent[] = results.websites || [];
  const coupons: Coupon[] = results.coupons || [];
  const partnerships: Partnership[] = results.partnerships || [];
  const insights: ConversationInsight[] = results.insights || [];

  let posts: InstagramPost[] = [];
  let transcriptions: VideoTranscription[] = [];
  let highlights: InstagramHighlight[] = [];
  let ragWebsites: WebsiteContent[] = [];

  if (ragAvailable && results.rag) {
    const { sources } = results.rag;
    console.log(`[Knowledge Retrieval] Vector search returned ${sources.length} sources`);
    const ragKnowledge = mapRAGSourcesToKnowledge(sources);
    posts = ragKnowledge.posts;
    transcriptions = ragKnowledge.transcriptions;
    highlights = ragKnowledge.highlights;
    ragWebsites = ragKnowledge.websites;
    // Merge RAG partnerships with direct DB partnerships
    partnerships.push(...ragKnowledge.partnerships);
  } else {
    posts = results.posts || [];
    transcriptions = results.transcriptions || [];
    highlights = results.highlights || [];
  }

  // Merge websites: direct DB (full content) + RAG (semantic excerpts), deduplicate by URL
  const mergedWebsites = mergeWebsites(directWebsites, ragWebsites);

  console.log(`[Knowledge Retrieval] ✅ Combined retrieval (RAG=${ragAvailable}):`);
  console.log(`  - Posts: ${posts.length}, Highlights: ${highlights.length}`);
  console.log(`  - Websites: ${mergedWebsites.length} (${directWebsites.length} direct + ${ragWebsites.length} RAG)`);
  console.log(`  - Coupons: ${coupons.length}, Partnerships: ${partnerships.length}`);
  console.log(`  - Transcriptions: ${transcriptions.length}, Insights: ${insights.length}`);

  return {
    posts,
    highlights,
    coupons,
    partnerships,
    insights,
    websites: mergedWebsites,
    transcriptions,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Run a dict of promises in parallel, returning resolved values (null for rejected).
 */
async function promiseAllSettledObj<T extends Record<string, Promise<any>>>(
  obj: T
): Promise<{ [K in keyof T]: Awaited<T[K]> | null }> {
  const keys = Object.keys(obj);
  const results = await Promise.allSettled(Object.values(obj));
  const out: any = {};
  keys.forEach((key, i) => {
    const r = results[i];
    out[key] = r.status === 'fulfilled' ? r.value : null;
    if (r.status === 'rejected') {
      console.error(`[Knowledge Retrieval] ${key} failed:`, r.reason);
    }
  });
  return out;
}

/**
 * Merge websites from direct DB + RAG, deduplicate by URL.
 * Direct DB data is preferred (full page_content vs RAG excerpts).
 */
function mergeWebsites(
  directWebsites: WebsiteContent[],
  ragWebsites: WebsiteContent[]
): WebsiteContent[] {
  const seen = new Set<string>();
  const merged: WebsiteContent[] = [];

  for (const w of directWebsites) {
    const key = w.url || w.title;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(w);
    }
  }

  for (const w of ragWebsites) {
    const key = w.url || w.title;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(w);
    }
  }

  return merged;
}

/**
 * Detect simple greetings that don't need full knowledge retrieval
 */
function isSimpleGreeting(message: string): boolean {
  const normalized = message.toLowerCase().trim();

  // Very short messages (<15 chars) with no question marks are likely greetings
  if (normalized.length > 20) return false;

  const GREETING_WORDS = [
    'היי', 'הי', 'שלום', 'אהלן', 'מה קורה', 'מה נשמע', 'מה שלומך',
    'מה העניינים', 'בוקר טוב', 'ערב טוב', 'לילה טוב', 'יום טוב',
    'hey', 'hi', 'hello', 'sup', 'yo', 'hola',
    'מה המצב', 'שלומות', 'אהלן וסהלן',
  ];

  return GREETING_WORDS.some(g => normalized.includes(g))
    || (normalized.length <= 8 && !normalized.includes('?'));
}

// ============================================
// RAG Vector Search Helpers
// ============================================

/**
 * Check if RAG vector data is available for this account.
 * Cached for 60s to avoid repeated DB hits.
 */
const ragAvailabilityCache = new Map<string, { available: boolean; expiry: number }>();

async function isRAGAvailable(supabase: any, accountId: string): Promise<boolean> {
  const cached = ragAvailabilityCache.get(accountId);
  if (cached && cached.expiry > Date.now()) return cached.available;

  try {
    const { count, error } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .limit(1);
    const available = !error && (count || 0) > 0;
    ragAvailabilityCache.set(accountId, { available, expiry: Date.now() + 300_000 });
    return available;
  } catch {
    return false;
  }
}

/**
 * Map RAG RetrievedSource[] to KnowledgeBase fields.
 * Preserves the KnowledgeBase interface so downstream code (baseArchetype) stays untouched.
 */
function mapRAGSourcesToKnowledge(sources: RetrievedSource[]): {
  posts: InstagramPost[];
  transcriptions: VideoTranscription[];
  highlights: InstagramHighlight[];
  partnerships: Partnership[];
  websites: WebsiteContent[];
} {
  const posts: InstagramPost[] = [];
  const transcriptions: VideoTranscription[] = [];
  const highlights: InstagramHighlight[] = [];
  const partnerships: Partnership[] = [];
  const websites: WebsiteContent[] = [];

  for (const source of sources) {
    switch (source.entityType) {
      case 'post':
        posts.push({
          id: source.documentId,
          caption: source.excerpt,
          hashtags: (source.metadata.hashtags as string[]) || [],
          type: (source.metadata.postType as 'post' | 'reel' | 'carousel') || 'post',
          posted_at: (source.metadata.postedAt as string) || source.updatedAt,
          likes_count: (source.metadata.likesCount as number) || 0,
          engagement_rate: 0,
          media_urls: [],
        });
        break;
      case 'transcription':
        transcriptions.push({
          id: source.documentId,
          text: source.excerpt,
          media_id: (source.metadata.originalSourceId as string) || '',
          created_at: source.updatedAt,
        });
        break;
      case 'highlight':
        highlights.push({
          id: source.documentId,
          title: source.title,
          cover_url: '',
          media_samples: [],
          scraped_at: source.updatedAt,
          content_text: source.excerpt,
        });
        break;
      case 'partnership':
        partnerships.push({
          brand_name: (source.metadata.brandName as string) || source.title,
          partnership_type: (source.metadata.category as string) || 'collaboration',
          description: source.excerpt,
        });
        break;
      case 'website':
        websites.push({
          url: (source.metadata.url as string) || '',
          title: source.title,
          content: source.excerpt,
          scraped_at: source.updatedAt,
          image_urls: (source.metadata.imageUrls as string[]) || [],
        });
        break;
      case 'document':
        partnerships.push({
          brand_name: source.title,
          partnership_type: 'document',
          description: source.excerpt,
        });
        break;
    }
  }

  return { posts, transcriptions, highlights, partnerships, websites };
}

function extractKeywordsFromMessage(message: string): string[] {
  const commonWords = ['את', 'אני', 'של', 'על', 'עם', 'מה', 'איך', 'למה', 'כמה', 'יש', 'לך'];

  const words = message
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !commonWords.includes(word));

  return words;
}

// ============================================
// Hebrew Query Normalization
// ============================================
// Hebrew FTS with 'simple' config has no stemming —
// "מתכונים" (plural) won't match "מתכון" (singular).
// This normalizer strips common prefixes/suffixes and stop words
// so FTS has a much better chance of matching.

const HEBREW_STOP_WORDS = new Set([
  'את', 'אני', 'של', 'על', 'עם', 'מה', 'איך', 'למה', 'כמה', 'יש', 'לי',
  'לך', 'אם', 'גם', 'רק', 'כל', 'הוא', 'היא', 'הם', 'הן', 'אנחנו',
  'זה', 'זו', 'זאת', 'אלה', 'אלו', 'כבר', 'עוד', 'מאוד', 'פה', 'שם',
  'איזה', 'אילו', 'כמו', 'לפני', 'אחרי', 'בין', 'תחת', 'מול', 'ליד',
  'בלי', 'עד', 'כדי', 'לא', 'כן', 'או', 'אבל', 'כי', 'שלי', 'שלך',
  'can', 'you', 'the', 'is', 'are', 'do', 'have', 'what', 'how', 'me', 'my',
]);

// Common Hebrew prefixes: ה (the), ב (in), ל (to), מ (from), כ (like), ש (that), ו (and)
const HEBREW_PREFIXES = /^[הבלמכשו]/;
// Common Hebrew plural/suffix patterns
const HEBREW_SUFFIXES = [
  { pattern: /ים$/, replacement: '' },   // masculine plural: מתכונים → מתכונ → מתכון (after sofit)
  { pattern: /ות$/, replacement: '' },   // feminine plural: חולצות → חולצ → חולץ (after sofit)
  { pattern: /ית$/, replacement: '' },   // feminine: ישראלית → ישראל
];

// Hebrew sofit (final-form) letter pairs: regular → sofit
// When a suffix is stripped, the new final letter needs its sofit form
const SOFIT_MAP: Record<string, string> = {
  'נ': 'ן', // nun → nun sofit
  'מ': 'ם', // mem → mem sofit
  'צ': 'ץ', // tsade → tsade sofit
  'פ': 'ף', // pe → pe sofit
  'כ': 'ך', // kaf → kaf sofit
};

/**
 * Apply sofit (final-form) conversion to last character of a Hebrew word.
 * e.g. "מתכונ" (regular nun) → "מתכון" (sofit nun)
 */
function applySofit(word: string): string {
  if (word.length === 0) return word;
  const lastChar = word[word.length - 1];
  const sofit = SOFIT_MAP[lastChar];
  if (sofit) {
    return word.slice(0, -1) + sofit;
  }
  return word;
}

function normalizeHebrewQuery(message: string): string {
  const words = message
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1)
    .filter(w => !HEBREW_STOP_WORDS.has(w));

  const normalized = new Set<string>();

  for (const word of words) {
    // Always include the original word
    normalized.add(word);

    // Skip short words and English words
    if (word.length < 3 || /^[a-zA-Z]/.test(word)) {
      continue;
    }

    // Try stripping prefix (only if word is long enough after)
    if (word.length > 3 && HEBREW_PREFIXES.test(word)) {
      normalized.add(word.slice(1));
    }

    // Try stripping suffixes
    for (const { pattern, replacement } of HEBREW_SUFFIXES) {
      if (pattern.test(word) && word.length > 4) {
        const stemmed = word.replace(pattern, replacement);
        if (stemmed.length >= 2) {
          // Add both raw stemmed form and sofit-corrected form
          normalized.add(stemmed);
          normalized.add(applySofit(stemmed));
        }
      }
    }
  }

  return Array.from(normalized).join(' ');
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
      // No FTS results — return empty instead of dumping recent posts
      // This lets the AI honestly say "I don't have info about that"
      console.log('[fetchPostsIndexed] ℹ️ No posts match query — returning empty');
      return [];
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
    // Fetch highlights + items + transcriptions in 2 parallel queries instead of 3 serial ones
    const { data, error } = await supabase
      .from('instagram_highlights')
      .select('id, title, cover_image_url, items_count, scraped_at')
      .eq('account_id', accountId)
      .order('scraped_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[fetchHighlights] Error:', error);
      return [];
    }

    const highlightIds = (data || []).map((h: any) => h.id);
    if (highlightIds.length === 0) return [];

    // Single query: join items → transcriptions via source_id
    // Get items and transcriptions in parallel
    const { data: items } = await supabase
      .from('instagram_highlight_items')
      .select('id, highlight_id')
      .in('highlight_id', highlightIds);

    const itemIds = (items || []).map((i: any) => i.id);

    // Only query transcriptions if we have items
    let trans: any[] = [];
    if (itemIds.length > 0) {
      const { data: transData } = await supabase
        .from('instagram_transcriptions')
        .select('source_id, transcription_text, on_screen_text')
        .eq('source_type', 'highlight_item')
        .in('source_id', itemIds)
        .eq('processing_status', 'completed');
      trans = transData || [];
    }

    // Build item→highlight lookup
    const itemToHighlight = new Map((items || []).map((i: any) => [i.id, i.highlight_id]));

    // Group transcriptions by highlight_id
    const transcriptions: Record<string, any[]> = {};
    for (const t of trans) {
      const highlightId = itemToHighlight.get(t.source_id);
      if (highlightId) {
        (transcriptions[highlightId] ??= []).push(t);
      }
    }

    return (data || []).map((h: any) => {
      const highlightTrans = transcriptions[h.id] || [];
      const allText = highlightTrans.map((t: any) => {
        const parts = [];
        if (t.transcription_text) parts.push(t.transcription_text);
        if (t.on_screen_text && Array.isArray(t.on_screen_text)) {
          parts.push(t.on_screen_text.join(' '));
        }
        return parts.join(' ');
      }).join(' | ');

      return {
        id: h.id,
        title: h.title,
        cover_url: h.cover_image_url,
        media_samples: highlightTrans,
        scraped_at: h.scraped_at,
        content_text: allText,
      };
    });
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

          // Batch-fetch all partnership links in ONE query (instead of N+1)
          const brandNames = searchResults.map((c: any) => c.brand_name).filter(Boolean);
          const { data: partnershipsData } = brandNames.length > 0
            ? await supabase
                .from('partnerships')
                .select('brand_name, link')
                .eq('account_id', accountId)
                .in('brand_name', brandNames)
            : { data: [] };
          const linkMap = new Map((partnershipsData || []).map((p: any) => [p.brand_name?.toLowerCase(), p.link]));

          for (const c of searchResults) {
            let discount = c.description || 'הנחה';

            if (c.discount_type === 'percentage' && c.discount_value) {
              discount = `${c.discount_value}% הנחה`;
            } else if (c.discount_type === 'fixed' && c.discount_value) {
              discount = `₪${c.discount_value} הנחה`;
            }

            // Clean and validate link
            let cleanLink = linkMap.get(c.brand_name?.toLowerCase()) || null;
            if (cleanLink) {
              cleanLink = cleanLink.trim().replace(/\s+/g, '');
              if (!cleanLink.startsWith('http')) {
                cleanLink = 'https://' + cleanLink;
              }
            }

            allCoupons.push({
              brand: c.brand_name || 'מותג',
              code: c.code,
              discount: discount,
              category: 'general',
              link: cleanLink,
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
          coupon_code: p.coupon_code || undefined,
          link: p.link || undefined,
        }));
      } else {
        console.log('[fetchPartnerships] ℹ️ No partnerships match search query');
      }
    }

    // Fallback: Get active partnerships
    const { data, error } = await supabase
      .from('partnerships')
      .select('brand_name, status, brief, category, coupon_code, link')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) {
      console.error('[fetchPartnerships] Error:', error);
      return [];
    }

    console.log(`[fetchPartnerships] ✅ Found ${data?.length || 0} partnerships (includes brands without coupons)`);

    return (data || []).map((p: any) => ({
      brand_name: p.brand_name,
      partnership_type: 'collaboration',
      description: p.brief || p.category || '',
      coupon_code: p.coupon_code || undefined,
      link: p.link || undefined,
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
      .select('url, page_title, page_content, scraped_at, image_urls')
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
      image_urls: w.image_urls || [],
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
      // No FTS results — return empty instead of dumping recent transcriptions
      console.log('[fetchTranscriptionsIndexed] ℹ️ No transcriptions match query — returning empty');
      return [];
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

  // Add partnerships (brands + coupon codes)
  if (kb.partnerships.length > 0) {
    const withCoupons = kb.partnerships.filter(p => p.coupon_code);
    const withoutCoupons = kb.partnerships.filter(p => !p.coupon_code);

    if (withCoupons.length > 0) {
      context += '## 🎟️ קופונים ושותפויות פעילות:\n';
      context += '⚠️ חשוב: התאם שמות מותגים בצורה גמישה — "fre"="FRÉ", "לוריאל"="L\'Oréal", "קליניק"="Clinique" וכו\'. אם המשתמש מזכיר מותג בכתיב קרוב — תתאים!\n';
      withCoupons.forEach(p => {
        context += `- 🏷️ ${p.brand_name} → קוד: "${p.coupon_code}"`;
        if (p.link) context += ` | לינק: ${p.link}`;
        if (p.description) context += ` (${p.description})`;
        context += '\n';
      });
      context += '\n';
    }

    if (withoutCoupons.length > 0) {
      context += '## שותפויות נוספות (ללא קופון):\n';
      withoutCoupons.forEach(p => {
        context += `- ${p.brand_name}`;
        if (p.link) context += ` | ${p.link}`;
        if (p.description) context += ` (${p.description})`;
        context += '\n';
      });
      context += '\n';
    }
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
    kb.partnerships.length > 0 ||
    kb.insights.length > 0 ||
    kb.websites.length > 0 ||
    kb.transcriptions.length > 0
  );
}
