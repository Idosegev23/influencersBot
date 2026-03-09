/**
 * AI Persona Builder - בניית פרסונה מקצועית
 * Primary: GPT-5.4 via Responses API (raw fetch — SDK project-scope workaround)
 * Fallback: Gemini 3.1 Pro
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PreprocessedData } from '../scraping/preprocessing';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize Gemini (fallback only)
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// ============================================
// Type Definitions — Enriched Schema (v2)
// ============================================

export interface GeminiPersonaOutput {
  identity: {
    who: string;
    entityType?: 'influencer' | 'brand' | 'business' | 'creator';
    targetAudience: string;
    secondaryAudience?: string;
    corePromise: string;
    supportingPromises?: string[];
    values: string[];
  };

  voice: {
    tone: string;
    toneSecondary?: string[];
    responseStructure: string;
    answerExamples?: string[];
    avgLength: string;
    firstPerson: boolean | string;
    firstPersonExamples?: string[];
    recurringPhrases: string[];
    avoidedWords: string[];
    emojiAnalysis?: {
      usage: 'none' | 'minimal' | 'moderate' | 'heavy';
      common: string[];
    };
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
    refusalStyle?: string;
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
// GPT-5.4 Optimized Prompt (XML blocks per best practices)
// ============================================

const PERSONA_BUILDER_PROMPT = `
<role>
אתה מערכת מומחית לבניית פרסונת ידע וקול אנושי על בסיס תוכן מאינסטגרם ואתרי אינטרנט.
המטרה: לבנות פרסונה עברית מדויקת ועשירה שתשמש מערכת צ'אטבוט לתשובות עתידיות.
</role>

<grounding_rules>
- בסס טענות אך ורק על הנתונים שסופקו בקלט.
- אם אין מידע מספק, ציין זאת במפורש — אל תמציא.
- הבחן בין עובדה (הוזכר במפורש בתוכן) לפרשנות (מסקנה מדפוס חוזר).
- אם מקורות סותרים, ציין את הסתירה במפורש.
</grounding_rules>

<completeness_contract>
- סרוק את כל הנתונים: פרופיל, פוסטים, תמלולי וידאו, תגובות, אתרים, האשטגים.
- תמלולי וידאו (transcriptions) הם המקור העשיר ביותר — שים לב במיוחד!
- אתרי linkis מכילים רשימות קופונים ומותגים מלאות — חלץ הכל!
- אל תעצור לפני שכיסית את כל הנתונים הרלוונטיים.
- לכל סעיף, חזור ובדוק שלא פספסת מידע מהקלט.
</completeness_contract>

<tasks>
א. **זהות ופרסונה** — מי הדמות, סוג הישות (משפיען/מותג/עסק/יוצר), קהל יעד ראשי ומשני, הבטחה מרכזית והבטחות משניות, ערכים.

ב. **קול וסגנון** — טון דיבור ראשי ומשני, מבנה תשובה אופייני עם דוגמאות, אורך ממוצע, שימוש בגוף ראשון עם דוגמאות, ביטויים חוזרים, מילים שלא משתמשים בהן, ניתוח שימוש באמוג'ים (כמות + רשימת נפוצים).

ג. **מפת ידע** — נושאים מרכזיים עם תתי-נושאים, טענות חוזרות, דוגמאות וסיפורים.

ד. **גבולות** — נושאים שנידונו, נושאים שלא נידונו, שאלות ללא מענה, אזורי חוסר מידע.

ה. **התפתחות בזמן** — שינויי טון, שינויי נושאים, הבדלים בין תקופות.

ו. **מדיניות תשובה** — מתי לענות בביטחון (עם דוגמאות ספציפיות), מתי בזהירות, מתי לסרב, וסגנון הסירוב המומלץ.

ז. **מוצרים** — כל מוצר שהוזכר במפורש: שם, מותג, קטגוריה, תיאור, סנטימנט, נקודות מפתח, כמה פעמים הוזכר. רק מוצרים שנבדקו/נוסו בפועל.

ח. **קופונים** — קוד מדויק, מותג, תיאור הנחה, תוקף, פוסטים שהזכירו. חלץ הכל מ-linkis ומפוסטים!

ט. **מותגים** — שם, סוג קשר (partnership/sponsored/organic/affiliate), קטגוריה, כמה פעמים הוזכר, מתי לראשונה. חפש גם באתרים!
</tasks>

<output_contract>
- החזר JSON בלבד, ללא טקסט נוסף, ללא markdown fences.
- עקוב אחרי הסכמה המדויקת שמוגדרת למטה.
- כל התוכן בעברית בלבד.
- אל תקצר תשובות — העדף מידע מלא ומדויק.
- אם שדה לא רלוונטי, החזר מערך ריק [] או מחרוזת ריקה "".
</output_contract>

<verification_loop>
לפני שמחזיר את התוצאה:
- בדוק שכל הסעיפים מכוסים ומלאים.
- בדוק שלא המצאת מידע שלא קיים בקלט.
- בדוק שמבנה ה-JSON תקין ותואם לסכמה.
- בדוק שחילצת את כל הקופונים מ-linkis.
- בדוק שזיהית את כל המוצרים מפוסטים ותמלולים.
</verification_loop>
`;

// ============================================
// JSON Schema for the output
// ============================================

const OUTPUT_SCHEMA = `{
  "identity": {
    "who": "תיאור תמציתי של הדמות/מותג — שורה אחת",
    "entityType": "influencer | brand | business | creator",
    "targetAudience": "תיאור קהל היעד הראשי",
    "secondaryAudience": "קהל יעד משני (אם קיים)",
    "corePromise": "ההבטחה המרכזית",
    "supportingPromises": ["הבטחה משנית 1", "הבטחה משנית 2"],
    "values": ["ערך 1", "ערך 2", "ערך 3"]
  },
  "voice": {
    "tone": "תיאור הטון הראשי (מחרוזת אחת)",
    "toneSecondary": ["טון משני 1", "טון משני 2"],
    "responseStructure": "תיאור מבנה תשובה אופייני",
    "answerExamples": ["דוגמה לתבנית תשובה: בעיה → פתרון → יתרון", "דוגמה נוספת"],
    "avgLength": "קצר / בינוני / ארוך",
    "firstPerson": "גוף ראשון יחיד / גוף ראשון רבים / תיאור",
    "firstPersonExamples": ["אני אוהבת", "אנחנו בטוחים"],
    "recurringPhrases": ["ביטוי חוזר 1", "ביטוי חוזר 2"],
    "avoidedWords": ["מילה להימנע 1", "מילה להימנע 2"],
    "emojiAnalysis": {
      "usage": "none | minimal | moderate | heavy",
      "common": ["✨", "💧", "🎉"]
    }
  },
  "knowledgeMap": {
    "coreTopics": [
      {
        "name": "שם הנושא",
        "subtopics": ["תת-נושא 1", "תת-נושא 2"],
        "keyPoints": ["טענה/נקודה חוזרת 1", "טענה 2"],
        "examples": ["דוגמה או סיפור מהתוכן"]
      }
    ]
  },
  "boundaries": {
    "discussed": ["נושא שנידון 1", "נושא 2"],
    "notDiscussed": ["נושא שלא נידון 1"],
    "unansweredQuestions": ["שאלה שנשאלה ולא נענתה"],
    "uncertainAreas": ["אזור חוסר מידע"]
  },
  "evolution": {
    "toneChanges": ["שינוי טון שזוהה"],
    "topicShifts": ["שינוי נושאים"],
    "periodDifferences": ["הבדל בין תקופות"]
  },
  "responsePolicy": {
    "highConfidence": ["מצב ספציפי שבו מותר לענות בביטחון"],
    "cautious": ["מצב שבו יש לענות בזהירות"],
    "refuse": ["מצב שבו יש לסרב"],
    "refusalStyle": "תיאור סגנון הסירוב המומלץ"
  },
  "products": [
    {
      "name": "שם המוצר",
      "brand": "מותג",
      "category": "קטגוריה",
      "description": "תיאור קצר",
      "mentionedInPosts": 5,
      "sentiment": "positive",
      "keyPoints": ["נקודה 1"]
    }
  ],
  "coupons": [
    {
      "code": "CODE123",
      "brand": "מותג",
      "description": "תיאור ההנחה",
      "discount": "20%",
      "expiresAt": "2026-03-01",
      "mentionedInPosts": ["post_url"]
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

// ============================================
// Main Function: Build Persona
// ============================================

export async function buildPersonaWithGemini(
  preprocessedData: PreprocessedData,
  profileData?: any
): Promise<GeminiPersonaOutput> {
  const inputData = prepareInputData(preprocessedData, profileData);
  const fullPrompt = buildFullPrompt(inputData);
  const inputSize = JSON.stringify(inputData).length;

  let text: string | null = null;

  // ── Attempt 1: GPT-5.4 via Responses API ──
  if (OPENAI_API_KEY) {
    text = await tryGPT54(fullPrompt, inputSize);
  }

  // ── Attempt 2: Gemini 3.1 Pro fallback ──
  if (!text) {
    console.log('🔄 [Fallback] GPT-5.4 unavailable, trying Gemini 3.1 Pro...');
    text = await tryGemini(fullPrompt, inputSize);
  }

  if (!text) {
    throw new Error('All AI providers failed for persona building (GPT-5.4 + Gemini 3.1 Pro)');
  }

  console.log(`📝 Response length: ${text.length} characters`);
  const persona = parsePersonaResponse(text);
  console.log('🎉 Persona generation complete!');
  return persona;
}

// ============================================
// GPT-5.4 via Responses API (raw fetch)
// ============================================

async function tryGPT54(fullPrompt: string, inputSize: number): Promise<string | null> {
  console.log('🧠 [GPT-5.4] Starting persona generation...');
  console.log(`📊 Input data size: ${inputSize} characters`);

  const retries = 2;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`⚡ [GPT-5.4] Attempt ${attempt}/${retries}...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600000); // 600s

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5.4',
          input: fullPrompt,
          reasoning: { effort: 'medium' },
          text: { format: { type: 'text' } },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`${response.status} ${errBody.substring(0, 300)}`);
      }

      const result = await response.json();
      console.log('✅ [GPT-5.4] Request succeeded!');

      // Extract text from Responses API format
      const rawOutput = result.output;
      let text: string | null = null;

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

      if (text && typeof text === 'string') {
        // Log usage if available
        if (result.usage) {
          console.log(`📊 [GPT-5.4] Tokens — in: ${result.usage.input_tokens}, out: ${result.usage.output_tokens}, reasoning: ${result.usage.output_tokens_details?.reasoning_tokens || 0}`);
        }
        return text;
      }

      throw new Error('Failed to extract text from GPT-5.4 response');
    } catch (error: any) {
      console.error(`❌ [GPT-5.4] Attempt ${attempt} failed:`, error.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      }
    }
  }

  return null;
}

// ============================================
// Gemini 3.1 Pro (fallback)
// ============================================

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

// ============================================
// Build Full Prompt
// ============================================

function buildFullPrompt(inputData: any): string {
  return `${PERSONA_BUILDER_PROMPT}

נתונים מעובדים:
${JSON.stringify(inputData, null, 2)}

החזר JSON בלבד בפורמט הבא (ללא טקסט נוסף, ללא markdown fences):
${OUTPUT_SCHEMA}`;
}

// ============================================
// Prepare Input Data
// ============================================

function prepareInputData(preprocessedData: PreprocessedData, profileData?: any) {
  // Budget: keep total under ~500K chars to fit GPT-5.4 context
  const MAX_WEBSITE_CHARS = 200_000; // 200K budget for websites
  const MAX_CONTENT_PER_PAGE = 1500; // truncate long pages

  // Smart website trimming: prioritize pages with most content
  let websites = (preprocessedData.websites || []).map(w => ({
    url: w.url,
    title: w.title,
    content: (w.content || '').substring(0, MAX_CONTENT_PER_PAGE),
  }));

  // If total website content exceeds budget, keep most content-rich pages
  const totalWebsiteChars = websites.reduce((sum, w) => sum + (w.content?.length || 0), 0);
  if (totalWebsiteChars > MAX_WEBSITE_CHARS) {
    // Sort by content length descending, keep richest pages within budget
    websites.sort((a, b) => (b.content?.length || 0) - (a.content?.length || 0));
    let charsSoFar = 0;
    const kept: typeof websites = [];
    for (const w of websites) {
      charsSoFar += (w.content?.length || 0);
      if (charsSoFar > MAX_WEBSITE_CHARS) break;
      kept.push(w);
    }
    console.log(`📊 [prepareInputData] Websites trimmed: ${websites.length} → ${kept.length} pages (${(charsSoFar / 1000).toFixed(0)}K chars)`);
    websites = kept;
  }

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

    websites,

    transcriptions: preprocessedData.transcriptions?.map(t => ({
      id: t.id,
      text: (t.text || '').substring(0, 2000), // cap individual transcriptions
      source: t.media_id,
    })) || [],

    posts: preprocessedData.posts?.slice(0, 50).map(p => ({
      caption: (p.caption || '').substring(0, 1000), // cap long captions
      hashtags: p.hashtags || [],
      likes: p.likes_count,
    })) || [],
  };
}

// ============================================
// Parse Response — handles both old and new schema
// ============================================

function parsePersonaResponse(text: string): GeminiPersonaOutput {
  let jsonText = text.trim();

  // Remove markdown code blocks if present
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonText);

    // Handle GPT-5.4 alternate key names (persona → identity, voice_style → voice)
    const normalized = normalizeSchema(parsed);

    // Validate minimal structure
    if (!normalized.identity || !normalized.voice) {
      throw new Error('Invalid persona structure — missing identity or voice');
    }

    return normalized;
  } catch (error) {
    console.error('[PersonaBuilder] Failed to parse response:', error);
    console.error('[PersonaBuilder] Raw response (first 500 chars):', text.substring(0, 500));

    return getDefaultPersona();
  }
}

/**
 * Normalize alternate schemas (GPT-5.4 sometimes uses different keys)
 * Maps: persona → identity, voice_style → voice, knowledge_map → knowledgeMap
 */
function normalizeSchema(parsed: any): GeminiPersonaOutput {
  const result: any = { ...parsed };

  // Map alternate top-level keys
  if (parsed.persona && !parsed.identity) {
    const p = parsed.persona;
    result.identity = {
      who: typeof p.who === 'string' ? p.who : (p.who?.description || p.name || ''),
      entityType: p.entityType || p.who?.entity_type,
      targetAudience: typeof p.audience === 'string' ? p.audience : (p.audience?.primary?.join(', ') || p.targetAudience || ''),
      secondaryAudience: typeof p.audience === 'object' ? p.audience?.secondary?.join(', ') : undefined,
      corePromise: typeof p.promise === 'string' ? p.promise : (p.promise?.core_promise || p.corePromise || ''),
      supportingPromises: p.promise?.supporting_promises || p.supportingPromises,
      values: Array.isArray(p.values) ? p.values : (p.values?.core_values || []),
    };
    delete result.persona;
  }

  if (parsed.voice_style && !parsed.voice) {
    const v = parsed.voice_style;
    result.voice = {
      tone: typeof v.tone === 'string' ? v.tone : (v.tone?.primary?.join(', ') || ''),
      toneSecondary: typeof v.tone === 'object' ? v.tone?.secondary : undefined,
      responseStructure: typeof v.answer_structure === 'string' ? v.answer_structure : (v.answer_structure?.typical?.join(' → ') || v.responseStructure || ''),
      answerExamples: v.answer_structure?.examples || v.answerExamples,
      avgLength: v.average_length?.future_answer_guideline || v.average_length?.posts || v.avgLength || '',
      firstPerson: v.first_person_usage?.usage || v.firstPerson || true,
      firstPersonExamples: v.first_person_usage?.examples || v.firstPersonExamples,
      recurringPhrases: v.repeated_words_phrases || v.recurringPhrases || [],
      avoidedWords: v.words_not_used?.should_avoid_based_on_data_limits || v.words_not_used?.explicitly_avoided || v.avoidedWords || [],
      emojiAnalysis: v.emoji_usage ? {
        usage: v.emoji_usage.present === false ? 'none' : (v.emoji_usage.common?.length > 5 ? 'heavy' : v.emoji_usage.common?.length > 2 ? 'moderate' : 'minimal'),
        common: v.emoji_usage.common || [],
      } : undefined,
    };
    delete result.voice_style;
  }

  // Normalize voice.tone if it's an object in the standard schema
  if (result.voice && typeof result.voice.tone === 'object') {
    const toneObj = result.voice.tone;
    result.voice.toneSecondary = toneObj.secondary || result.voice.toneSecondary;
    result.voice.tone = Array.isArray(toneObj.primary) ? toneObj.primary.join(', ') : (toneObj.primary || '');
  }

  // Normalize voice.firstPerson if it's an object
  if (result.voice && typeof result.voice.firstPerson === 'object') {
    const fp = result.voice.firstPerson;
    result.voice.firstPersonExamples = fp.examples || result.voice.firstPersonExamples;
    result.voice.firstPerson = fp.usage || true;
  }

  // Map knowledge_map → knowledgeMap
  if (parsed.knowledge_map && !parsed.knowledgeMap) {
    const km = parsed.knowledge_map;
    result.knowledgeMap = {
      coreTopics: (km.coreTopics || km.core_topics || km.mainTopics || km.main_topics || []).map((t: any) => ({
        name: t.name || t.topic || '',
        subtopics: t.subtopics || t.sub_topics || [],
        keyPoints: t.keyPoints || t.key_points || [],
        examples: t.examples || [],
      })),
    };
    delete result.knowledge_map;
  }

  // Map response_policy → responsePolicy (snake_case → camelCase)
  if (parsed.response_policy && !parsed.responsePolicy) {
    const rp = parsed.response_policy;
    result.responsePolicy = {
      highConfidence: rp.highConfidence || rp.high_confidence || rp.answer_with_confidence_when || [],
      cautious: rp.cautious || rp.answer_cautiously_when || [],
      refuse: rp.refuse || rp.refuse_when || [],
      refusalStyle: rp.refusalStyle || rp.recommended_refusal_style || undefined,
    };
    delete result.response_policy;
  }

  // Ensure refusalStyle is mapped even in standard schema
  if (result.responsePolicy && !result.responsePolicy.refusalStyle) {
    result.responsePolicy.refusalStyle = parsed.responsePolicy?.refusalStyle || parsed.responsePolicy?.recommended_refusal_style;
  }

  // Map time_evolution → evolution
  if (parsed.time_evolution && !parsed.evolution) {
    result.evolution = parsed.time_evolution;
    delete result.time_evolution;
  }

  // Ensure knowledgeMap exists
  if (!result.knowledgeMap) {
    result.knowledgeMap = { coreTopics: [] };
  }

  // Ensure boundaries exists
  if (!result.boundaries) {
    result.boundaries = { discussed: [], notDiscussed: [], unansweredQuestions: [], uncertainAreas: [] };
  }

  // Ensure evolution exists
  if (!result.evolution) {
    result.evolution = { toneChanges: [], topicShifts: [], periodDifferences: [] };
  }

  // Ensure responsePolicy exists
  if (!result.responsePolicy) {
    result.responsePolicy = { highConfidence: [], cautious: [], refuse: [] };
  }

  return result as GeminiPersonaOutput;
}

function getDefaultPersona(): GeminiPersonaOutput {
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
    knowledgeMap: { coreTopics: [] },
    boundaries: { discussed: [], notDiscussed: [], unansweredQuestions: [], uncertainAreas: [] },
    evolution: { toneChanges: [], topicShifts: [], periodDifferences: [] },
    responsePolicy: { highConfidence: [], cautious: [], refuse: [] },
  };
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
  console.log('[PersonaBuilder] Saving persona to database...');

  // Build voice_rules with identity embedded (for gemini-chat.ts compatibility)
  const voiceRulesForDB = {
    ...persona.voice,
    identity: {
      who: persona.identity.who,
      entityType: persona.identity.entityType,
    },
  };

  const { error } = await supabase
    .from('chatbot_persona')
    .upsert({
      account_id: accountId,

      // Required fields
      name: persona.identity.who || 'משפיען',
      tone: typeof persona.voice.tone === 'string' ? persona.voice.tone : 'ידידותי',
      language: 'he',

      // Enhanced fields
      voice_rules: voiceRulesForDB,
      knowledge_map: persona.knowledgeMap,
      boundaries: persona.boundaries,
      evolution: persona.evolution,
      response_policy: persona.responsePolicy,

      // Emoji settings from analysis
      emoji_usage: persona.voice.emojiAnalysis?.usage || 'minimal',
      emoji_types: persona.voice.emojiAnalysis?.common || [],

      // Common phrases from analysis
      common_phrases: persona.voice.recurringPhrases?.slice(0, 10) || [],

      // Store preprocessing data and raw output
      preprocessing_data: preprocessedData,
      gemini_raw_output: { raw: geminiRawOutput, parsed: persona, model: 'gpt-5.4', version: 'v2' },

      // Timestamps
      last_full_scrape_at: new Date().toISOString(),
      instagram_last_synced: new Date().toISOString(),

      // Stats
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
    console.error('[PersonaBuilder] Error saving persona:', error);
    throw new Error(`Failed to save persona: ${error.message}`);
  }

  console.log('[PersonaBuilder] Persona saved successfully');

  // Store commerce data in metadata
  if (persona.products || persona.coupons || persona.brands) {
    console.log('[PersonaBuilder] Storing commerce data...');

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
      console.error('[PersonaBuilder] Error saving commerce data:', commerceError);
    } else {
      console.log(`[PersonaBuilder] Commerce: ${persona.products?.length || 0} products, ${persona.coupons?.length || 0} coupons, ${persona.brands?.length || 0} brands`);
    }
  }

  console.log('[PersonaBuilder] All data saved successfully');
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
