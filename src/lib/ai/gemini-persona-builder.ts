/**
 * AI Persona Builder - בניית פרסונה מקצועית
 * Uses Gemini Pro for deep persona analysis
 */

import { getGeminiClient, MODELS } from '@/lib/ai/google-client';
import type { PreprocessedData } from '../scraping/preprocessing';

// ============================================
// Type Definitions
// ============================================

export interface GeminiPersonaOutput {
  identity: {
    who: string;
    targetAudience: string;
    corePromise: string;
    values: string[];
  };

  voice: {
    tone: string;
    responseStructure: string;
    avgLength: string;
    firstPerson: boolean;
    recurringPhrases: string[];
    avoidedWords: string[];
  };

  knowledgeMap: {
    coreTopics: Array<{
      name: string;
      subtopics: string[];
      keyPoints: string[];
      examples: string[];
    }>;
  };

  boundaries: {
    discussed: string[];
    notDiscussed: string[];
    unansweredQuestions: string[];
    uncertainAreas: string[];
  };

  evolution: {
    toneChanges: string[];
    topicShifts: string[];
    periodDifferences: string[];
  };

  responsePolicy: {
    highConfidence: string[];
    cautious: string[];
    refuse: string[];
  };

  products?: Array<{
    name: string;
    brand?: string;
    category?: string;
    description: string;
    mentionedInPosts: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    keyPoints: string[];
  }>;

  coupons?: Array<{
    code: string;
    brand: string;
    description?: string;
    discount?: string;
    expiresAt?: string;
    mentionedInPosts: string[];
  }>;

  brands?: Array<{
    name: string;
    relationship: 'partnership' | 'sponsored' | 'organic' | 'affiliate';
    category?: string;
    mentionCount: number;
    firstMentioned?: string;
  }>;
}

// ============================================
// הפרומפט העברי המלא
// ============================================

const PERSONA_BUILDER_PROMPT = `
אתה מערכת לבניית פרסונת ידע וקול אנושי על בסיס תוכן מאינסטגרם.

המטרה:
לבנות פרסונה עברית בלבד, שתוכל לענות לשאלות משתמשים בעתיד אך ורק על סמך המידע שסופק, ללא המצאות, ללא ידע חיצוני וללא הרחבות.

קלט:
תקבל JSON מאוחד של תוכן מחשבון אינסטגרם אחד, כולל:
- פרופיל
- פוסטים ורילסים
- תמלולי וידאו (transcriptions)
- תגובות ותגובות בעל החשבון
- אתרים (websites) - במיוחד linkis עם קופונים ומותגים
- הקשר האשטגים
- הקשר חיפוש

חוקים מחייבים:
1. מותר להשתמש אך ורק במידע שבקלט
2. אם אין מידע מספק, יש לציין זאת במפורש
3. אין להמציא דעות, עובדות או ידע כללי
4. יש להבחין בין עובדה לפרשנות מבוססת דפוס
5. כל התשובות העתידיות חייבות לשקף את הקול, הסגנון והגבולות של היוצר

משימות:
א. בניית פרסונה
ב. קול וסגנון
ג. מפת ידע
ד. גבולות
ה. זמן והתפתחות
ו. מדיניות תשובה
ז. זיהוי מוצרים, קופונים ומותגים

חשוב:
- זהה רק מה שמופיע בפועל בתוכן
- האתרים (websites) מכילים רשימות מלאות של קופונים ומוצרים
- הבחן בין שת"פ ממומן (#ad) להמלצה אורגנית
- אל תמציא מוצרים או קופונים
- חלץ את כל הקופונים מאתר linkis שבנתוני websites

פלט:
החזר JSON מובנה הכולל את כל הסעיפים לעיל (כולל products, coupons, brands).
`;

// ============================================
// Main Function: Build Persona with Gemini
// ============================================

export async function buildPersonaWithGemini(
  preprocessedData: PreprocessedData,
  profileData?: any
): Promise<GeminiPersonaOutput> {
  const inputData = prepareInputData(preprocessedData, profileData);
  const fullPrompt = buildFullPrompt(inputData);
  const inputSize = JSON.stringify(inputData).length;

  console.log(`[Gemini Pro] Starting persona generation...`);
  console.log(`Input data size: ${inputSize} characters`);

  const retries = 2;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Gemini] Attempt ${attempt}/${retries}...`);

      const client = getGeminiClient();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini Pro request timeout (300s)')), 300000);
      });

      const geminiPromise = client.models.generateContent({
        model: MODELS.COMPLEX,
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          maxOutputTokens: 16384,
        },
      });

      const result = await Promise.race([geminiPromise, timeoutPromise]);
      const text = result.text || '';

      if (text && text.length > 100) {
        console.log('[Gemini Pro] Request succeeded!');
        console.log(`Response length: ${text.length} characters`);
        const persona = parseGeminiResponse(text);
        console.log('Persona generation complete!');
        return persona;
      }

      throw new Error('Gemini returned empty or too-short response');
    } catch (error: any) {
      console.error(`[Gemini] Attempt ${attempt} failed:`, error.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      }
    }
  }

  throw new Error('All AI attempts failed for persona building');
}

function buildFullPrompt(inputData: any): string {
  return `${PERSONA_BUILDER_PROMPT}

נתונים מעובדים:
${JSON.stringify(inputData, null, 2)}

אנא החזר JSON מובנה בפורמט הבא בלבד (ללא טקסט נוסף):
{
  "identity": { "who": "", "targetAudience": "", "corePromise": "", "values": [] },
  "voice": { "tone": "", "responseStructure": "", "avgLength": "", "firstPerson": true, "recurringPhrases": [], "avoidedWords": [] },
  "knowledgeMap": { "coreTopics": [{ "name": "", "subtopics": [], "keyPoints": [], "examples": [] }] },
  "boundaries": { "discussed": [], "notDiscussed": [], "unansweredQuestions": [], "uncertainAreas": [] },
  "evolution": { "toneChanges": [], "topicShifts": [], "periodDifferences": [] },
  "responsePolicy": { "highConfidence": [], "cautious": [], "refuse": [] },
  "products": [],
  "coupons": [],
  "brands": []
}`;
}

// ============================================
// Helper Functions
// ============================================

function prepareInputData(preprocessedData: PreprocessedData, profileData?: any) {
  return {
    profile: profileData ? {
      username: profileData.username,
      fullName: profileData.full_name,
      bio: profileData.bio,
      followersCount: profileData.followers_count,
      category: profileData.category,
    } : null,

    stats: preprocessedData.stats,
    topTerms: preprocessedData.topTerms.slice(0, 100),

    topics: preprocessedData.topics.map(t => ({
      name: t.name,
      frequency: t.frequency,
      posts: t.posts,
      keywords: t.keywords.slice(0, 5),
    })),

    timeline: preprocessedData.timeline.map(t => ({
      month: t.month,
      posts: t.posts,
      avgEngagement: t.avgEngagement,
      topTopics: t.topTopics,
    })),

    ownerReplies: {
      ratio: preprocessedData.ownerReplies.ratio,
      commonPhrases: preprocessedData.ownerReplies.commonPhrases.slice(0, 15),
      replyPatterns: preprocessedData.ownerReplies.replyPatterns,
    },

    faqCandidates: preprocessedData.faqCandidates.slice(0, 20).map(faq => ({
      question: faq.question,
      askedCount: faq.askedCount,
      hasAnswer: !!faq.ownerAnswer,
    })),

    boundaries: preprocessedData.boundaries,

    websites: preprocessedData.websites?.map(w => ({
      url: w.url,
      title: w.title,
      content: w.content,
    })) || [],

    transcriptions: preprocessedData.transcriptions?.map(t => ({
      id: t.id,
      text: t.text,
      source: t.media_id,
    })) || [],

    posts: preprocessedData.posts?.slice(0, 50).map(p => ({
      caption: p.caption || '',
      hashtags: p.hashtags || [],
      likes: p.likes_count,
    })) || [],
  };
}

function parseGeminiResponse(text: string): GeminiPersonaOutput {
  let jsonText = text.trim();

  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonText);

    if (!parsed.identity || !parsed.voice || !parsed.knowledgeMap) {
      throw new Error('Invalid persona structure');
    }

    return parsed as GeminiPersonaOutput;
  } catch (error) {
    console.error('[Gemini] Failed to parse response:', error);
    console.error('[Gemini] Raw response:', text.substring(0, 500));

    return {
      identity: { who: 'לא הצלחנו לזהות', targetAudience: 'לא ברור', corePromise: 'לא ברור', values: [] },
      voice: { tone: 'לא ברור', responseStructure: 'לא ברור', avgLength: 'לא ברור', firstPerson: true, recurringPhrases: [], avoidedWords: [] },
      knowledgeMap: { coreTopics: [] },
      boundaries: { discussed: [], notDiscussed: [], unansweredQuestions: [], uncertainAreas: [] },
      evolution: { toneChanges: [], topicShifts: [], periodDifferences: [] },
      responsePolicy: { highConfidence: [], cautious: [], refuse: [] },
    };
  }
}

// ============================================
// Save Persona to Database
// ============================================

export async function savePersonaToDatabase(
  supabase: any,
  accountId: string,
  persona: GeminiPersonaOutput,
  preprocessedData: PreprocessedData,
  geminiRawOutput: string
): Promise<void> {
  console.log('[Gemini] Saving persona to database...');

  const { error } = await supabase
    .from('chatbot_persona')
    .upsert({
      account_id: accountId,
      name: persona.identity.who || 'משפיען',
      tone: persona.voice.tone || 'ידידותי',
      language: 'he',
      voice_rules: persona.voice,
      knowledge_map: persona.knowledgeMap,
      boundaries: persona.boundaries,
      evolution: persona.evolution,
      response_policy: persona.responsePolicy,
      preprocessing_data: preprocessedData,
      gemini_raw_output: { raw: geminiRawOutput, parsed: persona },
      last_full_scrape_at: new Date().toISOString(),
      instagram_last_synced: new Date().toISOString(),
      scrape_stats: {
        postsScraped: preprocessedData.stats.totalPosts,
        topicsIdentified: preprocessedData.topics.length,
        faqCandidates: preprocessedData.faqCandidates.length,
        timeRange: preprocessedData.stats.timeRange,
      },
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'account_id',
    });

  if (error) {
    console.error('[Gemini] Error saving persona:', error);
    throw new Error(`Failed to save persona: ${error.message}`);
  }

  console.log('[Gemini] Persona saved successfully');

  if (persona.products || persona.coupons || persona.brands) {
    console.log('[Gemini] Storing commerce data in persona metadata...');

    const commerceData = {
      products: persona.products || [],
      coupons: persona.coupons || [],
      brands: persona.brands || [],
      extractedAt: new Date().toISOString(),
    };

    const { error: commerceError } = await supabase
      .from('chatbot_persona')
      .update({ metadata: commerceData })
      .eq('account_id', accountId);

    if (commerceError) {
      console.error('[Gemini] Error saving commerce data:', commerceError);
    } else {
      console.log(`[Gemini] Commerce: ${persona.products?.length || 0} products, ${persona.coupons?.length || 0} coupons, ${persona.brands?.length || 0} brands`);
    }
  }
}

// ============================================
// Main export function for Step 7
// ============================================

export async function runGeminiBuilder(
  accountId: string,
  preprocessedData: PreprocessedData,
  profileData?: any
): Promise<GeminiPersonaOutput> {
  return buildPersonaWithGemini(preprocessedData, profileData);
}
