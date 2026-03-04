import { getGeminiClient, MODELS } from '@/lib/ai/google-client';
import type { InfluencerType, InfluencerPersona, ExtractedData, ApifyPostData } from '@/types';

// Models configuration - using Gemini
const CHAT_MODEL = MODELS.CHAT_LITE;      // Fastest, cheapest - for chat
const ANALYSIS_MODEL = MODELS.CHAT_LITE;  // For analysis
const COMPLEX_MODEL = MODELS.COMPLEX;     // For persona generation

// ============================================
// Influencer Type Detection
// ============================================

export async function detectInfluencerType(
  bio: string,
  captions: string[]
): Promise<{ type: InfluencerType; confidence: number }> {
  const client = getGeminiClient();
  const sampleCaptions = captions.slice(0, 20).join('\n---\n');

  try {
    const response = await client.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: `Bio: ${bio}\n\nPosts:\n${sampleCaptions}`,
      config: {
        systemInstruction: `אתה מנתח פרופילי אינסטגרם. קבע את סוג המשפיען לפי הביו והפוסטים.

סוגים אפשריים:
- food: מתכונים, בישול, מזון, מסעדות
- fashion: אופנה, סטיילינג, לוקים, בגדים
- tech: טכנולוגיה, גאדג'טים, אפליקציות
- lifestyle: לייפסטייל כללי, טיפים, חיים
- fitness: כושר, אימונים, תזונה ספורטיבית
- beauty: יופי, איפור, טיפוח
- other: אחר

החזר JSON בפורמט: {"type": "...", "confidence": 0.0-1.0}`,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      type: result.type || 'other',
      confidence: result.confidence || 0.5,
    };
  } catch (error) {
    console.error('Error detecting influencer type:', error);
    return { type: 'other', confidence: 0 };
  }
}

// ============================================
// Persona Generation
// ============================================

export async function generatePersona(
  bio: string,
  captions: string[],
  influencerType: InfluencerType
): Promise<InfluencerPersona> {
  const client = getGeminiClient();
  const sampleCaptions = captions.slice(0, 15).join('\n---\n');

  try {
    const response = await client.models.generateContent({
      model: COMPLEX_MODEL,
      contents: `סוג משפיען: ${influencerType}\nBio: ${bio}\n\nPosts:\n${sampleCaptions}`,
      config: {
        systemInstruction: `אתה מנתח סגנון כתיבה של משפיענים. נתח את הפוסטים וצור פרסונה.

החזר JSON בפורמט:
{
  "tone": "טון הכתיבה (חם/מקצועי/משעשע/אינפורמטיבי)",
  "style": "סגנון (קליל/רשמי/ידידותי/מעורר השראה)",
  "interests": ["תחום 1", "תחום 2"],
  "signature_phrases": ["ביטוי 1", "ביטוי 2"],
  "emoji_style": "none|minimal|frequent",
  "language": "he|en|mixed"
}`,
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      tone: result.tone || 'ידידותי',
      style: result.style || 'קליל',
      interests: result.interests || [],
      signature_phrases: result.signature_phrases || [],
      emoji_style: result.emoji_style || 'minimal',
      language: result.language || 'he',
    };
  } catch (error) {
    console.error('Error generating persona:', error);
    return {
      tone: 'ידידותי',
      style: 'קליל',
      interests: [],
      signature_phrases: [],
      emoji_style: 'minimal',
      language: 'he',
    };
  }
}

// ============================================
// Persona Generation from Posts (wrapper)
// ============================================

export async function generatePersonaFromPosts(
  posts: ApifyPostData[],
  profile: { fullName: string; biography: string },
  influencerType: InfluencerType
): Promise<InfluencerPersona> {
  const captions = posts.map(p => p.caption).filter(Boolean);
  return generatePersona(profile.biography, captions, influencerType);
}

// ============================================
// Content Extraction
// ============================================

export async function extractDataFromPost(caption: string): Promise<ExtractedData> {
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: caption,
      config: {
        systemInstruction: `נתח את הפוסט וחלץ מידע רלוונטי.

חפש:
- שמות מותגים (בעברית או אנגלית)
- קודי קופון (בדרך כלל באותיות גדולות/מספרים)
- מוצרים שמוזכרים
- נושאים עיקריים

החזר JSON בפורמט:
{
  "brands": ["מותג 1"],
  "coupons": [{"code": "CODE", "brand": "מותג"}],
  "topics": ["נושא 1"],
  "products": [{"name": "מוצר", "link": ""}]
}`,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      brands: result.brands || [],
      coupons: result.coupons || [],
      topics: result.topics || [],
      products: result.products || [],
    };
  } catch (error) {
    console.error('Error extracting data from post:', error);
    return { brands: [], coupons: [], topics: [], products: [] };
  }
}

export async function extractRecipeFromPost(caption: string): Promise<{
  title: string;
  ingredients: string[];
  instructions: string[];
} | null> {
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: caption,
      config: {
        systemInstruction: `בדוק אם הפוסט מכיל מתכון. אם כן, חלץ אותו.

החזר JSON בפורמט:
{
  "is_recipe": true/false,
  "title": "שם המתכון",
  "ingredients": ["מרכיב 1"],
  "instructions": ["שלב 1"]
}`,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const result = JSON.parse(response.text || '{}');
    if (result.is_recipe && result.title) {
      return {
        title: result.title,
        ingredients: result.ingredients || [],
        instructions: result.instructions || [],
      };
    }
    return null;
  } catch (error) {
    console.error('Error extracting recipe:', error);
    return null;
  }
}

// Content types based on influencer type
const CONTENT_TYPES_BY_INFLUENCER: Record<InfluencerType, string[]> = {
  food: ['recipe', 'review', 'tip', 'recommendation'],
  fashion: ['look', 'outfit', 'collaboration', 'style_tip', 'event'],
  beauty: ['tutorial', 'review', 'tip', 'look', 'routine'],
  lifestyle: ['tip', 'moment', 'review', 'recommendation', 'story'],
  fitness: ['workout', 'tip', 'routine', 'motivation', 'recipe'],
  parenting: ['tip', 'story', 'recommendation', 'moment', 'review'],
  tech: ['review', 'tutorial', 'tip', 'unboxing'],
  travel: ['review', 'tip', 'recommendation', 'story', 'itinerary'],
  other: ['tip', 'review', 'story', 'moment', 'recommendation']
};

// Extract content from ANY post - dynamic based on influencer type
export async function extractContentFromPost(
  caption: string,
  influencerType: InfluencerType,
  imageUrl?: string
): Promise<{
  type: string;
  title: string;
  description: string;
  content: Record<string, unknown>;
} | null> {
  const client = getGeminiClient();

  // Skip very short or empty captions
  if (!caption || caption.trim().length < 10) return null;

  const contentTypes = CONTENT_TYPES_BY_INFLUENCER[influencerType] || CONTENT_TYPES_BY_INFLUENCER.other;

  try {
    const response = await client.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: caption.slice(0, 2500),
      config: {
        systemInstruction: `אתה מנתח תוכן של משפיען/ית מסוג ${influencerType}.
נתח את הפוסט וחלץ ממנו את התוכן העיקרי.

סוגי תוכן אפשריים: ${contentTypes.join(', ')}

חשוב:
- כל פוסט מכיל תוכן כלשהו - אל תחזיר "none" אלא אם הטקסט באמת ריק
- תן כותרת תמציתית שמתארת את תוכן הפוסט
- תאר את התוכן בקצרה
- חלץ נקודות מפתח, מוצרים שהוזכרו, מותגים, טיפים

החזר JSON בפורמט:
{
  "content_type": "סוג",
  "title": "כותרת",
  "description": "תיאור",
  "key_points": ["נקודה 1"],
  "brands_mentioned": ["מותג 1"],
  "products_mentioned": ["מוצר 1"],
  "hashtags": ["#tag"],
  "ingredients": [],
  "instructions": [],
  "mood": "מצב רוח",
  "is_sponsored": false
}`,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const result = JSON.parse(response.text || '{}');

    if (!result.title || result.title.trim() === '') {
      return null;
    }

    // Normalize content type to valid enum values
    const validTypes = [
      'recipe', 'review', 'recommendation', 'look', 'outfit', 'style_tip',
      'tutorial', 'routine', 'tip', 'moment', 'story', 'workout', 'motivation',
      'collaboration', 'event', 'unboxing', 'itinerary'
    ];

    let contentType = result.content_type?.toLowerCase().replace(/\s+/g, '_') || 'tip';

    // Handle combined types like "moment/story" - take the first one
    if (contentType.includes('/')) {
      contentType = contentType.split('/')[0];
    }

    // Map common variations to valid types
    const typeMapping: Record<string, string> = {
      'lifestyle': 'story',
      'personal': 'moment',
      'sponsored': 'collaboration',
      'ad': 'collaboration',
      'product': 'review',
      'fashion': 'look',
      'beauty': 'tutorial',
      'food': 'recipe',
      'exercise': 'workout',
      'travel_tip': 'itinerary',
      'guide': 'tutorial',
      'howto': 'tutorial',
      'how_to': 'tutorial',
    };

    if (typeMapping[contentType]) {
      contentType = typeMapping[contentType];
    }

    // If still not valid, default to 'tip'
    if (!validTypes.includes(contentType)) {
      contentType = 'tip';
    }

    // Build rich content object with all extracted data
    const content: Record<string, unknown> = {
      key_points: result.key_points || [],
      brands: result.brands_mentioned || [],
      products: result.products_mentioned || [],
      hashtags: result.hashtags || [],
      mood: result.mood || '',
      is_sponsored: result.is_sponsored || false
    };

    // Add specific fields based on content type
    if (contentType === 'recipe' && result.ingredients?.length > 0) {
      content.ingredients = result.ingredients;
      content.instructions = result.instructions || [];
    }

    if (contentType === 'look' || contentType === 'outfit') {
      content.items = result.key_points || [];
    }

    if (contentType === 'workout' || contentType === 'routine') {
      content.exercises = result.key_points || [];
      content.instructions = result.instructions || [];
    }

    return {
      type: contentType,
      title: result.title,
      description: result.description || caption.slice(0, 300),
      content
    };
  } catch (error) {
    console.error('Error extracting content:', error);
    return null;
  }
}

// ============================================
// Batch Processing
// ============================================

export async function analyzeAllPosts(
  posts: ApifyPostData[]
): Promise<Map<string, ExtractedData>> {
  const results = new Map<string, ExtractedData>();

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    const promises = batch.map(async (post) => {
      const data = await extractDataFromPost(post.caption);
      results.set(post.shortCode, data);
    });
    await Promise.all(promises);

    // Small delay between batches
    if (i + batchSize < posts.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

// ============================================
// Chat - Using Gemini
// ============================================

export async function chat(
  instructions: string,
  input: string,
  previousResponseId?: string
): Promise<{ response: string; responseId: string | null }> {
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: CHAT_MODEL,
      contents: input,
      config: {
        systemInstruction: instructions,
      },
    });

    return {
      response: response.text || '',
      responseId: null,
    };
  } catch (error) {
    console.error('Error in chat:', error);
    throw error;
  }
}

// ============================================
// Streaming Chat - Using Gemini streaming
// ============================================

interface StreamChatParams {
  message: string;
  instructions: string;
  previousResponseId?: string;
  onDelta: (delta: string) => void;
}

interface StreamChatResult {
  responseId: string | null;
  tokens?: { input: number; output: number };
}

export async function streamChat(params: StreamChatParams): Promise<StreamChatResult> {
  const { message, instructions, onDelta } = params;
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContentStream({
      model: CHAT_MODEL,
      contents: message,
      config: {
        systemInstruction: instructions,
      },
    });

    for await (const chunk of response) {
      const text = chunk.text || '';
      if (text) {
        onDelta(text);
      }
    }

    return { responseId: null };
  } catch (error) {
    console.error('Error in streamChat:', error);
    throw error;
  }
}

// ============================================
// Chat with Web Search (for real-time info)
// ============================================

export async function chatWithWebSearch(
  instructions: string,
  input: string,
  previousResponseId?: string
): Promise<{ response: string; responseId: string | null }> {
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: CHAT_MODEL,
      contents: input,
      config: {
        systemInstruction: instructions,
        tools: [{ googleSearch: {} }],
      },
    });

    return {
      response: response.text || '',
      responseId: null,
    };
  } catch (error) {
    console.error('Error in chat with web search:', error);
    throw error;
  }
}

// ============================================
// Generate Personalized Greeting & Questions
// ============================================

export async function generateGreetingAndQuestions(
  displayName: string,
  influencerType: InfluencerType,
  persona: InfluencerPersona,
  products: Array<{ name: string; brand?: string; coupon_code?: string }>,
  contentItems: Array<{ title: string; type: string }> = []
): Promise<{ greeting: string; questions: string[] }> {
  const client = getGeminiClient();

  const productContext = products.length > 0
    ? `מוצרים וקופונים: ${products.map(p => `${p.name}${p.brand ? ` (${p.brand})` : ''}${p.coupon_code ? ` - קופון: ${p.coupon_code}` : ''}`).join(', ')}`
    : 'אין מוצרים מוגדרים עדיין';

  const contentContext = contentItems.length > 0
    ? `תוכן: ${contentItems.map(c => `${c.title} (${c.type})`).join(', ')}`
    : '';

  try {
    const response = await client.models.generateContent({
      model: COMPLEX_MODEL,
      contents: JSON.stringify({
        name: displayName,
        type: influencerType,
        tone: persona.tone,
        style: persona.style,
        interests: persona.interests,
        products: productContext,
        content: contentContext
      }),
      config: {
        systemInstruction: `צור הודעת פתיחה ושאלות מוצעות לצ'אטבוט של משפיען.

## ההודעה צריכה להיות:
- חמה ומזמינה
- תואמת לסגנון ולטון של המשפיען
- בעברית
- קצרה (עד 2 משפטים)
- מזמינה את הגולש לשאול שאלות

## השאלות צריכות להיות:
- 4-6 שאלות קצרות שגולשים סביר ישאלו
- רלוונטיות לתחום המשפיען ולמוצרים
- מגוונות (חלקן על מוצרים, חלקן על תוכן)
- בעברית

אם יש קופונים - לפחות שאלה אחת צריכה להיות על הנחות/קופונים.

החזר JSON בפורמט:
{
  "greeting": "הודעת פתיחה חמה",
  "questions": ["שאלה 1", "שאלה 2", "שאלה 3", "שאלה 4"]
}`,
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      greeting: result.greeting || `היי! אני הבוט של ${displayName}. איך אפשר לעזור?`,
      questions: result.questions || [
        'אילו מוצרים את/ה ממליץ/ה?',
        'יש לך קופונים להנחות?',
        'מה התוכן החדש?'
      ],
    };
  } catch (error) {
    console.error('Error generating greeting and questions:', error);
    // Return sensible defaults based on influencer type
    const typeDefaults: Record<InfluencerType, string[]> = {
      food: ['יש לך מתכון מהיר לארוחת ערב?', 'איזה קופונים יש לך?', 'מה המתכון הכי פופולרי שלך?', 'יש תחליף לביצים במתכונים?'],
      fashion: ['איזה לוק את ממליצה השבוע?', 'יש קופון לחנויות שאת עובדת איתן?', 'מה הטרנד החם עכשיו?', 'איך משלבים ג\'ינס עם סניקרס?'],
      tech: ['איזה גאדג\'ט שווה לקנות?', 'יש קופון הנחה?', 'מה דעתך על האייפון החדש?', 'איזה אפליקציה מומלצת?'],
      fitness: ['איזה אימון מתאים למתחילים?', 'יש קופון לתוספי תזונה?', 'כמה פעמים בשבוע לעשות קרדיו?', 'מה לאכול אחרי אימון?'],
      beauty: ['איזה מוצר טיפוח הכי שווה?', 'יש קופון הנחה?', 'מה השגרה שלך בבוקר?', 'איזה שפתון מומלץ?'],
      parenting: ['איזה טיפ יש לך להורים?', 'מה הילדים אוהבים?', 'איך מאזנים בין עבודה למשפחה?', 'יש קופונים לציוד לילדים?'],
      travel: ['לאן כדאי לטוס?', 'יש המלצה למלון?', 'איזה יעד מומלץ למשפחות?', 'יש קופון לטיסות?'],
      lifestyle: ['מה ההמלצה החמה שלך?', 'יש קופונים?', 'איזה טיפ יש לך לחיים?', 'מה חדש אצלך?'],
      other: ['איך אפשר לעזור?', 'יש המלצות?', 'מה חדש?', 'יש קופונים?']
    };

    return {
      greeting: `היי! אני הבוט של ${displayName}. מה תרצו לדעת?`,
      questions: typeDefaults[influencerType] || typeDefaults.other,
    };
  }
}

// ============================================
// Build Instructions for Influencer
// ============================================

export function buildInfluencerInstructions(
  name: string,
  persona: InfluencerPersona,
  influencerType: InfluencerType,
  context: string
): string {
  const emojiInstruction = {
    none: 'אל תשתמש באימוג\'ים כלל.',
    minimal: 'השתמש באימוג\'ים במידה מינימלית.',
    frequent: 'אפשר להשתמש באימוג\'ים בחופשיות.',
  }[persona.emoji_style];

  const typeInstructions: Record<InfluencerType, string> = {
    food: 'אתה מומחה לבישול ומתכונים. עזור עם שאלות על מתכונים, תחליפים למרכיבים, וטיפים לבישול.',
    fashion: 'אתה מומחה לאופנה וסטיילינג. עזור עם שאלות על לוקים, שילובי בגדים, וטרנדים.',
    tech: 'אתה מומחה לטכנולוגיה. עזור עם שאלות על גאדג\'טים, אפליקציות, והמלצות טכנולוגיות.',
    lifestyle: 'אתה מומחה ללייפסטייל. עזור עם טיפים לחיים, המלצות, ושאלות כלליות.',
    fitness: 'אתה מומחה לכושר ותזונה. עזור עם שאלות על אימונים, תזונה, ואורח חיים בריא.',
    parenting: 'אתה מומחה להורות ומשפחה. עזור עם שאלות על גידול ילדים, טיפים להורים, ומוצרים לילדים.',
    travel: 'אתה מומחה לטיולים. עזור עם שאלות על יעדים, מלונות, וטיפים לטיולים.',
    beauty: 'אתה מומחה ליופי וטיפוח. עזור עם שאלות על איפור, טיפוח עור, ומוצרי יופי.',
    other: 'אתה עוזר אישי. עזור עם שאלות כלליות ומתן המלצות.',
  };

  return `
אתה העוזר החכם של ${name} - משפיען/ית בתחום ה${influencerType}.

## סגנון התשובות:
- טון: ${persona.tone}
- סגנון: ${persona.style}
${persona.signature_phrases.length > 0 ? `- ביטויים אופייניים: ${persona.signature_phrases.join(', ')}` : ''}

## מומחיות:
${typeInstructions[influencerType]}

## כללים:
1. **עברית בלבד** - לא מילים באנגלית
2. **קצר ולעניין** - 2-3 משפטים. לא רשימות, לא חפירות
3. **טבעי** - כמו שיחה עם חברה, לא כמו רובוט
4. ${emojiInstruction}
5. **קופונים** - רק הרלוונטי. אין קופון? תגיד בכנות
6. **לא להמציא** - רק מידע שקיבלת
7. **בעיות** - הפנה למותג, לא לבקש פרטים אישיים
8. **גיוון** - אם המשתמש מבקש עוד המלצות, תציע משהו אחר! לא לחזור על אותו מתכון/המלצה שכבר נתת

## המותגים והקופונים:
${context}
  `.trim();
}
