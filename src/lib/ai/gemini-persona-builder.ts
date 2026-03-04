/**
 * AI Persona Builder - בניית פרסונה מקצועית
 * Primary: GPT-5.2 Pro (reasoning)
 * Fallback: Gemini 3 Pro (when OpenAI quota exceeded / errors)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import type { PreprocessedData } from '../scraping/preprocessing';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;

// Initialize OpenAI for GPT-5.2 Pro
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Gemini
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

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

  // Commerce & Products
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
- תמלולי וידאו (transcriptions) - 356 תמלולים מלאים מסרטונים! שים לב במיוחד לאלה!
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
- מי הדמות
- למי היא פונה
- מה ההבטחה שלה
- מה הערכים המרכזיים

ב. קול וסגנון
- טון דיבור
- מבנה תשובה אופייני
- אורך ממוצע
- שימוש בגוף ראשון
- מילים וביטויים חוזרים
- מילים שלא נעשה בהן שימוש

ג. מפת ידע
- נושאים מרכזיים (מתוך topics)
- תתי נושאים
- טענות חוזרות
- דוגמאות וסיפורים אם קיימים

ד. גבולות
- נושאים שנידונו
- נושאים שלא נידונו
- שאלות שנשאלו ולא נענו
- אזורים של חוסר מידע

ה. זמן והתפתחות
- שינויי טון
- שינויי נושאים
- הבדלים בין תקופות

ו. מדיניות תשובה
- מתי מותר לענות בביטחון
- מתי יש לענות בזהירות
- מתי יש לסרב לענות

ז. זיהוי מוצרים, קופונים ומותגים
חשוב! זהה מהתוכן:

**מוצרים**: מוצרים ספציפיים שהמשפיען ממליץ עליהם
- רק מוצרים שהוזכרו במפורש ונבדקו/נוסו
- כלול: שם, מותג, קטגוריה, תיאור, רגש (positive/negative)
- נקודות מפתח על המוצר
- כמה פעמים הוזכר

**קופונים**: קודי הנחה שהמשפיען חולק
- קוד מדויק (לדוגמה: DEKEL20)
- למי הקוד (מותג/אתר)
- תיאור ההנחה (20%, משלוח חינם וכו')
- תוקף אם צוין
- רשימת פוסטים שהזכירו

**מותגים**: מותגים שהמשפיען עובד איתם
- **חפש גם באתרים!** (websites) - אתרי linkis ואתרים אחרים מכילים רשימות קופונים מלאות
- שם המותג
- סוג הקשר: partnership, sponsored, organic, affiliate
- קטגוריה
- כמה פעמים הוזכר
- מתי הוזכר לראשונה

הערות חשובות:
- זהה רק מה שמופיע בפועל בתוכן
- **האתרים (websites) מכילים רשימות מלאות של קופונים ומוצרים - שים לב במיוחד לאתרי linkis!**
- הבחן בין שת"פ ממומן (#ad) להמלצה אורגנית
- אל תמציא מוצרים או קופונים
- **חלץ את כל הקופונים מאתר linkis שבנתוני websites!**

פלט:
החזר JSON מובנה הכולל את כל הסעיפים לעיל (כולל products, coupons, brands), מוכן להזנה למערכת תשובות.

חשוב מאוד:
- אל תמציא מידע שלא קיים בנתונים
- אם אין מספיק מידע על נושא מסוים, ציין זאת במפורש
- שמור על עקביות בין הסעיפים השונים
- התשובה צריכה להיות בעברית בלבד
`;

// ============================================
// Main Function: Build Persona with Gemini
// ============================================

export async function buildPersonaWithGemini(
  preprocessedData: PreprocessedData,
  profileData?: any
): Promise<GeminiPersonaOutput> {
  // Prepare input data + prompt (shared between providers)
  const inputData = prepareInputData(preprocessedData, profileData);
  const fullPrompt = buildFullPrompt(inputData);
  const inputSize = JSON.stringify(inputData).length;

  // Try GPT-5.2 Pro first, then fallback to Gemini 3.1 Pro
  let text: string | null = null;

  // ── Attempt 1: GPT-5.2 Pro ──
  if (process.env.OPENAI_API_KEY) {
    text = await tryGPT(fullPrompt, inputSize);
  }

  // ── Attempt 2: Gemini 3.1 Pro fallback ──
  if (!text) {
    console.log('🔄 [Fallback] GPT-5.2 Pro unavailable, trying Gemini 3.1 Pro...');
    text = await tryGemini(fullPrompt, inputSize);
  }

  if (!text) {
    throw new Error('All AI providers failed for persona building (GPT-5.2 Pro + Gemini 3.1 Pro)');
  }

  console.log(`📝 Response length: ${text.length} characters`);
  const persona = parseGeminiResponse(text);
  console.log('🎉 Persona generation complete!');
  return persona;
}

// ── GPT-5.2 Pro ──
async function tryGPT(fullPrompt: string, inputSize: number): Promise<string | null> {
  console.log('🧠 [GPT-5.2 Pro] Starting persona generation...');
  console.log(`📊 Input data size: ${inputSize} characters`);

  let text: string | null = null;
  const retries = 2;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`⚡ [GPT] Attempt ${attempt}/${retries}...`);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('GPT-5.2 Pro request timeout (600s)')), 600000);
      });

      const gptPromise = openai.responses.create({
        model: 'gpt-5.2-pro',
        input: fullPrompt,
        reasoning: { effort: 'high' },
        text: { verbosity: 'high' },
      });

      const response = await Promise.race([gptPromise, timeoutPromise]);

      console.log('✅ [GPT-5.2 Pro] Request succeeded!');

      // Extract text from response
      const rawOutput = (response as any).output;

      if (typeof rawOutput === 'string') {
        text = rawOutput;
      } else if (Array.isArray(rawOutput)) {
        const messageObj = rawOutput.find((item: any) => item.type === 'message');
        if (messageObj?.content && Array.isArray(messageObj.content)) {
          const textContent = messageObj.content.find((c: any) => c.type === 'output_text' || c.text);
          text = textContent?.text;
        }
      } else if (rawOutput && typeof rawOutput === 'object') {
        text = rawOutput.text || rawOutput.content;
      }

      if (text && typeof text === 'string') break;
      throw new Error('Failed to extract text from GPT response');
    } catch (error: any) {
      console.error(`❌ [GPT] Attempt ${attempt} failed:`, error.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }
  }

  return text;
}

// ── Gemini 3.1 Pro ──
async function tryGemini(fullPrompt: string, inputSize: number): Promise<string | null> {
  if (!genAI) {
    console.error('❌ [Gemini] GEMINI_API_KEY not configured, cannot fallback');
    return null;
  }

  console.log('🧠 [Gemini 3.1 Pro] Starting persona generation...');
  console.log(`📊 Input data size: ${inputSize} characters`);

  const retries = 2;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`⚡ [Gemini] Attempt ${attempt}/${retries}...`);

      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-pro-preview',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          maxOutputTokens: 16384,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini 3.1 Pro request timeout (300s)')), 300000);
      });

      const geminiPromise = model.generateContent(fullPrompt);
      const result = await Promise.race([geminiPromise, timeoutPromise]);
      const text = result.response.text();

      if (text && text.length > 100) {
        console.log('✅ [Gemini 3.1 Pro] Request succeeded!');
        return text;
      }

      throw new Error('Gemini returned empty or too-short response');
    } catch (error: any) {
      console.error(`❌ [Gemini] Attempt ${attempt} failed:`, error.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      }
    }
  }

  return null;
}

// ── Build the full prompt (shared) ──
function buildFullPrompt(inputData: any): string {
  return `${PERSONA_BUILDER_PROMPT}

נתונים מעובדים:
${JSON.stringify(inputData, null, 2)}

אנא החזר JSON מובנה בפורמט הבא בלבד (ללא טקסט נוסף):
{
  "identity": {
    "who": "תיאור הדמות",
    "targetAudience": "קהל היעד",
    "corePromise": "ההבטחה המרכזית",
    "values": ["ערך 1", "ערך 2"]
  },
  "voice": {
    "tone": "תיאור טון הדיבור",
    "responseStructure": "מבנה תשובה אופייני",
    "avgLength": "אורך ממוצע",
    "firstPerson": true,
    "recurringPhrases": ["ביטוי 1", "ביטוי 2"],
    "avoidedWords": ["מילה 1", "מילה 2"]
  },
  "knowledgeMap": {
    "coreTopics": [
      {
        "name": "שם נושא",
        "subtopics": ["תת נושא 1", "תת נושא 2"],
        "keyPoints": ["נקודה 1", "נקודה 2"],
        "examples": ["דוגמה 1", "דוגמה 2"]
      }
    ]
  },
  "boundaries": {
    "discussed": ["נושא 1", "נושא 2"],
    "notDiscussed": ["נושא 1", "נושא 2"],
    "unansweredQuestions": ["שאלה 1", "שאלה 2"],
    "uncertainAreas": ["אזור 1", "אזור 2"]
  },
  "evolution": {
    "toneChanges": ["שינוי 1", "שינוי 2"],
    "topicShifts": ["שינוי 1", "שינוי 2"],
    "periodDifferences": ["הבדל 1", "הבדל 2"]
  },
  "responsePolicy": {
    "highConfidence": ["מצב 1", "מצב 2"],
    "cautious": ["מצב 1", "מצב 2"],
    "refuse": ["מצב 1", "מצב 2"]
  },
  "products": [
    {
      "name": "שם מוצר",
      "brand": "מותג",
      "category": "קטגוריה",
      "description": "תיאור",
      "mentionedInPosts": 5,
      "sentiment": "positive",
      "keyPoints": ["נקודה 1", "נקודה 2"]
    }
  ],
  "coupons": [
    {
      "code": "CODE123",
      "brand": "מותג",
      "description": "תיאור ההנחה",
      "discount": "20%",
      "expiresAt": "2026-03-01",
      "mentionedInPosts": ["post_url_1", "post_url_2"]
    }
  ],
  "brands": [
    {
      "name": "מותג",
      "relationship": "partnership",
      "category": "קטגוריה",
      "mentionCount": 10,
      "firstMentioned": "2025-01-15"
    }
  ]
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
    
    topTerms: preprocessedData.topTerms.slice(0, 100), // Top 100
    
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

    // ⚡ CRITICAL: Include website data (linkis with all coupons!)
    websites: preprocessedData.websites?.map(w => ({
      url: w.url,
      title: w.title,
      content: w.content,
    })) || [],

    // ⚡ CRITICAL: Include ALL transcriptions for rich persona!
    transcriptions: preprocessedData.transcriptions?.map(t => ({
      id: t.id,
      text: t.text,
      source: t.media_id,
    })) || [],

    // ⚡ CRITICAL: Include post captions (products & brands mentioned here!)
    posts: preprocessedData.posts?.slice(0, 50).map(p => ({
      caption: p.caption || '',
      hashtags: p.hashtags || [],
      likes: p.likes_count,
    })) || [],
  };
}

function parseGeminiResponse(text: string): GeminiPersonaOutput {
  // Extract JSON from response (handle cases where Gemini adds markdown)
  let jsonText = text.trim();
  
  // Remove markdown code blocks if present
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
  }
  
  try {
    const parsed = JSON.parse(jsonText);
    
    // Validate structure
    if (!parsed.identity || !parsed.voice || !parsed.knowledgeMap) {
      throw new Error('Invalid persona structure');
    }
    
    return parsed as GeminiPersonaOutput;
  } catch (error) {
    console.error('[Gemini] Failed to parse response:', error);
    console.error('[Gemini] Raw response:', text.substring(0, 500));
    
    // Return default structure if parsing fails
    return {
      identity: {
        who: 'לא הצלחנו לזהות',
        targetAudience: 'לא ברור',
        corePromise: 'לא ברור',
        values: [],
      },
      voice: {
        tone: 'לא ברור',
        responseStructure: 'לא ברור',
        avgLength: 'לא ברור',
        firstPerson: true,
        recurringPhrases: [],
        avoidedWords: [],
      },
      knowledgeMap: {
        coreTopics: [],
      },
      boundaries: {
        discussed: [],
        notDiscussed: [],
        unansweredQuestions: [],
        uncertainAreas: [],
      },
      evolution: {
        toneChanges: [],
        topicShifts: [],
        periodDifferences: [],
      },
      responsePolicy: {
        highConfidence: [],
        cautious: [],
        refuse: [],
      },
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
      
      // Required fields
      name: persona.identity.who || 'משפיען',
      tone: persona.voice.tone || 'ידידותי',
      language: 'he',
      
      // New enhanced fields
      voice_rules: persona.voice,
      knowledge_map: persona.knowledgeMap,
      boundaries: persona.boundaries,
      evolution: persona.evolution,
      response_policy: persona.responsePolicy,
      
      // Store preprocessing data and raw output
      preprocessing_data: preprocessedData,
      gemini_raw_output: { raw: geminiRawOutput, parsed: persona },
      
      // Update timestamps
      last_full_scrape_at: new Date().toISOString(),
      instagram_last_synced: new Date().toISOString(),
      
      // Store stats
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

  // Store products/coupons/brands in persona metadata for now
  // (They will be manually added to proper tables later or via separate process)
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
      .update({
        metadata: commerceData,
      })
      .eq('account_id', accountId);

    if (commerceError) {
      console.error('[Gemini] Error saving commerce data:', commerceError);
    } else {
      console.log('[Gemini] Commerce data stored successfully');
      console.log(`[Gemini] - ${persona.products?.length || 0} products`);
      console.log(`[Gemini] - ${persona.coupons?.length || 0} coupons`);
      console.log(`[Gemini] - ${persona.brands?.length || 0} brands`);
    }
  }

  console.log('[Gemini] All data saved successfully');
}

// ============================================
// Main export function for Step 7
// ============================================

export async function runGeminiBuilder(
  accountId: string,
  preprocessedData: PreprocessedData,
  profileData?: any
): Promise<GeminiPersonaOutput> {
  const persona = await buildPersonaWithGemini(preprocessedData, profileData);
  return persona;
}
