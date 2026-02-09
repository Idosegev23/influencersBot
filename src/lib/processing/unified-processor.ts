/**
 * Unified Data Processor
 * עיבוד מאוחד של כל המידע הגולמי עם Gemini 3 Pro
 */

import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';

// ============================================
// Type Definitions
// ============================================

export interface ProcessedInfluencerData {
  coupons: CouponData[];
  partnerships: PartnershipData[];
  speaking_style: SpeakingStyleData;
  response_style: ResponseStyleData;
  topics: TopicData[];
  recommended_products: ProductData[];
  values_and_approach: ValuesData;
}

export interface CouponData {
  code: string;
  brand?: string;
  discount_type?: string;
  discount_value?: string;
  source: string; // where it was found
  confidence: number;
}

export interface PartnershipData {
  brand: string;
  type: 'sponsored' | 'affiliate' | 'ambassador' | 'unknown';
  mentions: number;
  products?: string[];
  source: string;
}

export interface SpeakingStyleData {
  tone: string; // friendly, professional, casual, etc.
  language_preference: string;
  common_phrases: string[];
  emoji_usage: 'none' | 'low' | 'medium' | 'high';
  formality: 'formal' | 'semi-formal' | 'casual';
  avg_sentence_length: 'short' | 'medium' | 'long';
}

export interface ResponseStyleData {
  avg_length: 'short' | 'medium' | 'long';
  uses_questions: boolean;
  uses_emojis: boolean;
  response_patterns: string[];
  common_greetings: string[];
  common_closings: string[];
}

export interface TopicData {
  name: string;
  frequency: number; // 0-1
  engagement_level: 'low' | 'medium' | 'high';
  keywords: string[];
}

export interface ProductData {
  name: string;
  brand?: string;
  category?: string;
  mentions: number;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface ValuesData {
  core_values: string[];
  approach: string;
  personality_traits: string[];
  content_focus: string[];
}

// ============================================
// Data Collection Functions
// ============================================

/**
 * Collect all raw data for an account
 */
async function collectRawData(accountId: string): Promise<{
  posts: any[];
  comments: any[];
  highlights: any[];
  stories: any[];
  transcriptions: any[];
  bio: any;
  websites: any[];
}> {
  const supabase = await createClient();

  // Fetch all data in parallel
  const [
    postsResult,
    commentsResult,
    highlightsResult,
    storiesResult,
    transcriptionsResult,
    profileResult,
    websitesResult,
  ] = await Promise.all([
    // Posts (last 10, no hashtags)
    supabase
      .from('instagram_posts')
      .select('id, caption, type, likes_count, comments_count, posted_at')
      .eq('account_id', accountId)
      .order('posted_at', { ascending: false })
      .limit(10),
    
    // Comments (owner replies and top comments)
    supabase
      .from('instagram_comments')
      .select('id, text, author_username, is_owner_reply, likes_count')
      .eq('account_id', accountId)
      .order('likes_count', { ascending: false })
      .limit(30),
    
    // Highlights
    supabase
      .from('instagram_highlights')
      .select('id, title, items_count')
      .eq('account_id', accountId),
    
    // Stories
    supabase
      .from('instagram_stories')
      .select('id, media_type, mentioned_users, hashtags')
      .eq('account_id', accountId),
    
    // Transcriptions
    supabase
      .from('instagram_transcriptions')
      .select('id, source_type, transcription_text, language, on_screen_text')
      .eq('account_id', accountId)
      .eq('processing_status', 'completed'),
    
    // Profile (latest)
    supabase
      .from('instagram_profile_history')
      .select('username, full_name, bio, bio_links, category')
      .eq('account_id', accountId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single(),
    
    // Websites
    supabase
      .from('instagram_bio_websites')
      .select('url, page_title, page_content, extracted_data')
      .eq('account_id', accountId)
      .eq('processing_status', 'completed'),
  ]);

  return {
    posts: postsResult.data || [],
    comments: commentsResult.data || [],
    highlights: highlightsResult.data || [],
    stories: storiesResult.data || [],
    transcriptions: transcriptionsResult.data || [],
    bio: profileResult.data,
    websites: websitesResult.data || [],
  };
}

/**
 * Prepare content for Gemini analysis
 */
function prepareContentForAnalysis(rawData: {
  posts: any[];
  comments: any[];
  highlights: any[];
  stories: any[];
  transcriptions: any[];
  bio: any;
  websites: any[];
}): string {
  const sections: string[] = [];

  // Bio section
  if (rawData.bio) {
    sections.push(`=== ביו ===
שם: ${rawData.bio.full_name || 'לא ידוע'}
קטגוריה: ${rawData.bio.category || 'לא ידוע'}
ביו: ${rawData.bio.bio || ''}
קישורים: ${(rawData.bio.bio_links || []).join(', ')}`);
  }

  // Posts section (without hashtags)
  if (rawData.posts.length > 0) {
    const postTexts = rawData.posts
      .map(p => {
        // Remove hashtags from caption
        const cleanCaption = (p.caption || '')
          .replace(/#[\w\u0590-\u05ff]+/g, '')
          .trim();
        return cleanCaption;
      })
      .filter(Boolean)
      .join('\n---\n');
    
    if (postTexts) {
      sections.push(`=== פוסטים אחרונים (10) ===\n${postTexts}`);
    }
  }

  // Comments section (owner replies)
  const ownerReplies = rawData.comments.filter(c => c.is_owner_reply);
  if (ownerReplies.length > 0) {
    const repliesText = ownerReplies
      .map(c => c.text)
      .filter(Boolean)
      .join('\n---\n');
    
    if (repliesText) {
      sections.push(`=== תגובות של המשפיען ===\n${repliesText}`);
    }
  }

  // Follower comments
  const followerComments = rawData.comments
    .filter(c => !c.is_owner_reply)
    .slice(0, 10);
  if (followerComments.length > 0) {
    const commentsText = followerComments
      .map(c => c.text)
      .filter(Boolean)
      .join('\n---\n');
    
    if (commentsText) {
      sections.push(`=== תגובות עוקבים ===\n${commentsText}`);
    }
  }

  // Transcriptions section
  if (rawData.transcriptions.length > 0) {
    const transcriptionTexts = rawData.transcriptions
      .map(t => {
        let text = t.transcription_text || '';
        if (t.on_screen_text && t.on_screen_text.length > 0) {
          text += '\n[טקסט על המסך: ' + t.on_screen_text.join(', ') + ']';
        }
        return text;
      })
      .filter(Boolean)
      .join('\n---\n');
    
    if (transcriptionTexts) {
      sections.push(`=== תמלולי סרטונים ===\n${transcriptionTexts}`);
    }
  }

  // Website content
  if (rawData.websites.length > 0) {
    const websiteTexts = rawData.websites
      .map(w => {
        const content = (w.page_content || '').substring(0, 2000);
        return `[${w.page_title || w.url}]\n${content}`;
      })
      .join('\n---\n');
    
    if (websiteTexts) {
      sections.push(`=== תוכן מאתרים ===\n${websiteTexts}`);
    }
  }

  // Limit total content
  const fullContent = sections.join('\n\n');
  if (fullContent.length > 30000) {
    return fullContent.substring(0, 30000) + '\n...[קוצר]';
  }

  return fullContent;
}

// ============================================
// Gemini Processing Functions
// ============================================

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY is required');
  }
  
  return new GoogleGenAI(apiKey);
}

/**
 * Process all raw data with Gemini 3 Pro
 */
export async function processInfluencerData(
  accountId: string
): Promise<ProcessedInfluencerData | null> {
  console.log(`[Unified Processor] Starting processing for account: ${accountId}`);

  const startTime = Date.now();

  try {
    // Collect all raw data
    const rawData = await collectRawData(accountId);
    console.log(`[Unified Processor] Collected: ${rawData.posts.length} posts, ${rawData.comments.length} comments, ${rawData.transcriptions.length} transcriptions`);

    // Prepare content for analysis
    const content = prepareContentForAnalysis(rawData);
    console.log(`[Unified Processor] Content length: ${content.length} characters`);

    if (content.length < 100) {
      console.log('[Unified Processor] Not enough content to analyze');
      return null;
    }

    // Build the analysis prompt
    const prompt = `אתה מנתח תוכן של משפיענים באינסטגרם.
נתח את כל המידע הבא וחלץ מידע מובנה על המשפיען.

תוכן לניתוח:
${content}

=== הנחיות ===
1. **קופונים** - חפש קודי הנחה (לרוב אותיות גדולות + מספרים)
2. **שת"פים** - זהה מותגים שהמשפיען עובד איתם (sponsored, affiliate, ambassador)
3. **סגנון דיבור** - איך המשפיען מדבר? פורמלי? חברי? משתמש באימוג'י?
4. **סגנון תשובות** - איך עונה לתגובות? קצר? ארוך? שואל שאלות?
5. **נושאים** - מה הנושאים המרכזיים? אופנה? כושר? אוכל?
6. **מוצרים** - מה המשפיען ממליץ עליו?
7. **ערכים וגישה** - מה חשוב למשפיען? מה המסר שלו?

=== פורמט תשובה (JSON בלבד) ===
{
  "coupons": [
    {
      "code": "SALE20",
      "brand": "Nike",
      "discount_type": "percentage",
      "discount_value": "20%",
      "source": "post",
      "confidence": 0.95
    }
  ],
  "partnerships": [
    {
      "brand": "Nike",
      "type": "sponsored",
      "mentions": 5,
      "products": ["נעלי ריצה"],
      "source": "posts"
    }
  ],
  "speaking_style": {
    "tone": "friendly",
    "language_preference": "he",
    "common_phrases": ["מה נשמע", "אהבתי"],
    "emoji_usage": "high",
    "formality": "casual",
    "avg_sentence_length": "short"
  },
  "response_style": {
    "avg_length": "short",
    "uses_questions": true,
    "uses_emojis": true,
    "response_patterns": ["תודה!", "שמחה שאהבת"],
    "common_greetings": ["היי!", "מה קורה?"],
    "common_closings": ["נשיקות", "❤️"]
  },
  "topics": [
    {
      "name": "אופנה",
      "frequency": 0.4,
      "engagement_level": "high",
      "keywords": ["סטייל", "לוק", "טרנד"]
    }
  ],
  "recommended_products": [
    {
      "name": "נעלי ריצה Air Max",
      "brand": "Nike",
      "category": "ספורט",
      "mentions": 3,
      "sentiment": "positive"
    }
  ],
  "values_and_approach": {
    "core_values": ["בריאות", "משפחה", "אותנטיות"],
    "approach": "educational",
    "personality_traits": ["חמה", "מקצועית", "נגישה"],
    "content_focus": ["טיפים", "המלצות", "סיפורים אישיים"]
  }
}

חשוב:
- אם לא מצאת משהו, השאר מערך/אובייקט ריק
- אל תמציא מידע - רק מה שבאמת מופיע בתוכן
- החזר רק JSON תקין`;

    // Call Gemini 3 Pro
    console.log('[Unified Processor] Calling Gemini 3 Pro...');
    const genAI = getGeminiClient();

    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        temperature: 0.5,
        responseMimeType: 'application/json',
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Unified Processor] Gemini responded in ${elapsed}s`);

    // Parse response
    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as ProcessedInfluencerData;

    // Validate and set defaults
    if (!Array.isArray(parsed.coupons)) parsed.coupons = [];
    if (!Array.isArray(parsed.partnerships)) parsed.partnerships = [];
    if (!parsed.speaking_style) parsed.speaking_style = getDefaultSpeakingStyle();
    if (!parsed.response_style) parsed.response_style = getDefaultResponseStyle();
    if (!Array.isArray(parsed.topics)) parsed.topics = [];
    if (!Array.isArray(parsed.recommended_products)) parsed.recommended_products = [];
    if (!parsed.values_and_approach) parsed.values_and_approach = getDefaultValues();

    console.log(`[Unified Processor] Extracted: ${parsed.coupons.length} coupons, ${parsed.partnerships.length} partnerships, ${parsed.topics.length} topics`);

    return parsed;

  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[Unified Processor] Failed after ${elapsed}s:`, error.message);
    return null;
  }
}

// ============================================
// Default Values
// ============================================

function getDefaultSpeakingStyle(): SpeakingStyleData {
  return {
    tone: 'friendly',
    language_preference: 'he',
    common_phrases: [],
    emoji_usage: 'medium',
    formality: 'casual',
    avg_sentence_length: 'medium',
  };
}

function getDefaultResponseStyle(): ResponseStyleData {
  return {
    avg_length: 'short',
    uses_questions: false,
    uses_emojis: true,
    response_patterns: [],
    common_greetings: [],
    common_closings: [],
  };
}

function getDefaultValues(): ValuesData {
  return {
    core_values: [],
    approach: 'general',
    personality_traits: [],
    content_focus: [],
  };
}

// ============================================
// Database Functions
// ============================================

/**
 * Save processed data to database
 */
export async function saveProcessedData(
  accountId: string,
  data: ProcessedInfluencerData
): Promise<string | null> {
  const supabase = await createClient();

  const { data: saved, error } = await supabase
    .from('influencer_processed_data')
    .upsert({
      account_id: accountId,
      coupons: data.coupons,
      partnerships: data.partnerships,
      speaking_style: data.speaking_style,
      response_style: data.response_style,
      topics: data.topics,
      recommended_products: data.recommended_products,
      values_and_approach: data.values_and_approach,
      gemini_model_used: 'gemini-3-pro-preview',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'account_id',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Unified Processor] Error saving processed data:', error);
    return null;
  }

  console.log(`[Unified Processor] Saved processed data: ${saved?.id}`);
  return saved?.id || null;
}

/**
 * Get processed data for an account
 */
export async function getProcessedData(
  accountId: string
): Promise<ProcessedInfluencerData | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('influencer_processed_data')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    coupons: data.coupons || [],
    partnerships: data.partnerships || [],
    speaking_style: data.speaking_style || getDefaultSpeakingStyle(),
    response_style: data.response_style || getDefaultResponseStyle(),
    topics: data.topics || [],
    recommended_products: data.recommended_products || [],
    values_and_approach: data.values_and_approach || getDefaultValues(),
  };
}

/**
 * Full processing pipeline
 */
export async function runFullProcessing(
  accountId: string
): Promise<{
  success: boolean;
  data?: ProcessedInfluencerData;
  error?: string;
}> {
  try {
    // Process all data
    const processed = await processInfluencerData(accountId);
    
    if (!processed) {
      return { success: false, error: 'Processing failed or not enough data' };
    }

    // Save to database
    const savedId = await saveProcessedData(accountId, processed);
    
    if (!savedId) {
      return { success: false, error: 'Failed to save processed data' };
    }

    return { success: true, data: processed };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
