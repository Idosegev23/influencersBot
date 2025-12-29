import OpenAI from 'openai';
import type { InfluencerType, InfluencerPersona, ExtractedData, ApifyPostData } from '@/types';

// Lazy initialization to avoid build errors
function getClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Models configuration
const CHAT_MODEL = 'gpt-5-nano';      // Fastest, cheapest - for chat
const ANALYSIS_MODEL = 'gpt-5.2';     // Best for complex analysis
const COMPLEX_MODEL = 'gpt-5.2';      // Best for persona generation

// ============================================
// Influencer Type Detection
// ============================================

export async function detectInfluencerType(
  bio: string,
  captions: string[]
): Promise<{ type: InfluencerType; confidence: number }> {
  const client = getClient();
  const sampleCaptions = captions.slice(0, 20).join('\n---\n');

  try {
    const response = await client.responses.create({
      model: ANALYSIS_MODEL,
      instructions: `אתה מנתח פרופילי אינסטגרם. קבע את סוג המשפיען לפי הביו והפוסטים.

סוגים אפשריים:
- food: מתכונים, בישול, מזון, מסעדות
- fashion: אופנה, סטיילינג, לוקים, בגדים
- tech: טכנולוגיה, גאדג'טים, אפליקציות
- lifestyle: לייפסטייל כללי, טיפים, חיים
- fitness: כושר, אימונים, תזונה ספורטיבית
- beauty: יופי, איפור, טיפוח
- other: אחר`,
      input: `Bio: ${bio}\n\nPosts:\n${sampleCaptions}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'influencer_type',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              type: { 
                type: 'string',
                enum: ['food', 'fashion', 'tech', 'lifestyle', 'fitness', 'beauty', 'other']
              },
              confidence: { type: 'number' }
            },
            required: ['type', 'confidence'],
            additionalProperties: false
          }
        }
      }
    });

    const result = JSON.parse(response.output_text);
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
  const client = getClient();
  const sampleCaptions = captions.slice(0, 15).join('\n---\n');

  try {
    const response = await client.responses.create({
      model: COMPLEX_MODEL, // Use gpt-5 for better persona generation
      instructions: `אתה מנתח סגנון כתיבה של משפיענים. נתח את הפוסטים וצור פרסונה.`,
      input: `סוג משפיען: ${influencerType}\nBio: ${bio}\n\nPosts:\n${sampleCaptions}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'persona',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              tone: { type: 'string', description: 'טון הכתיבה (חם/מקצועי/משעשע/אינפורמטיבי)' },
              style: { type: 'string', description: 'סגנון (קליל/רשמי/ידידותי/מעורר השראה)' },
              interests: { type: 'array', items: { type: 'string' } },
              signature_phrases: { type: 'array', items: { type: 'string' } },
              emoji_style: { type: 'string', enum: ['none', 'minimal', 'frequent'] },
              language: { type: 'string', enum: ['he', 'en', 'mixed'] }
            },
            required: ['tone', 'style', 'interests', 'signature_phrases', 'emoji_style', 'language'],
            additionalProperties: false
          }
        }
      }
    });

    const result = JSON.parse(response.output_text);
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
  const client = getClient();
  
  try {
    const response = await client.responses.create({
      model: ANALYSIS_MODEL,
      instructions: `נתח את הפוסט וחלץ מידע רלוונטי.

חפש:
- שמות מותגים (בעברית או אנגלית)
- קודי קופון (בדרך כלל באותיות גדולות/מספרים)
- מוצרים שמוזכרים
- נושאים עיקריים`,
      input: caption,
      text: {
        format: {
          type: 'json_schema',
          name: 'extracted_data',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              brands: { type: 'array', items: { type: 'string' } },
              coupons: { 
                type: 'array', 
                items: { 
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    brand: { type: 'string' }
                  },
                  required: ['code', 'brand'],
                  additionalProperties: false
                }
              },
              topics: { type: 'array', items: { type: 'string' } },
              products: { 
                type: 'array', 
                items: { 
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    link: { type: 'string' }
                  },
                  required: ['name', 'link'],
                  additionalProperties: false
                }
              }
            },
            required: ['brands', 'coupons', 'topics', 'products'],
            additionalProperties: false
          }
        }
      }
    });

    const result = JSON.parse(response.output_text);
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
  const client = getClient();
  
  try {
    const response = await client.responses.create({
      model: ANALYSIS_MODEL,
      instructions: `בדוק אם הפוסט מכיל מתכון. אם כן, חלץ אותו.`,
      input: caption,
      text: {
        format: {
          type: 'json_schema',
          name: 'recipe',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              is_recipe: { type: 'boolean' },
              title: { type: 'string' },
              ingredients: { type: 'array', items: { type: 'string' } },
              instructions: { type: 'array', items: { type: 'string' } }
            },
            required: ['is_recipe', 'title', 'ingredients', 'instructions'],
            additionalProperties: false
          }
        }
      }
    });

    const result = JSON.parse(response.output_text);
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
  const client = getClient();
  
  // Skip very short or empty captions
  if (!caption || caption.trim().length < 10) return null;
  
  const contentTypes = CONTENT_TYPES_BY_INFLUENCER[influencerType] || CONTENT_TYPES_BY_INFLUENCER.other;
  
  try {
    const response = await client.responses.create({
      model: ANALYSIS_MODEL,
      instructions: `אתה מנתח תוכן של משפיען/ית מסוג ${influencerType}.
נתח את הפוסט וחלץ ממנו את התוכן העיקרי.

סוגי תוכן אפשריים: ${contentTypes.join(', ')}

חשוב: 
- כל פוסט מכיל תוכן כלשהו - אל תחזיר "none" אלא אם הטקסט באמת ריק
- תן כותרת תמציתית שמתארת את תוכן הפוסט
- תאר את התוכן בקצרה
- חלץ נקודות מפתח, מוצרים שהוזכרו, מותגים, טיפים

לדוגמה:
- לוק אופנה → סוג: look, כותרת: "לוק שחור אלגנטי לערב", נקודות: פריטי הלבוש
- מתכון → סוג: recipe, כותרת: שם המנה, מרכיבים והוראות
- רגע משפחתי → סוג: moment/story, כותרת: תיאור הרגע
- שיתוף פעולה עם מותג → סוג: collaboration, כותרת: המותג והמוצר`,
      input: caption.slice(0, 2500),
      text: {
        format: {
          type: 'json_schema',
          name: 'dynamic_content',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              content_type: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              key_points: { type: 'array', items: { type: 'string' } },
              brands_mentioned: { type: 'array', items: { type: 'string' } },
              products_mentioned: { type: 'array', items: { type: 'string' } },
              hashtags: { type: 'array', items: { type: 'string' } },
              ingredients: { type: 'array', items: { type: 'string' } },
              instructions: { type: 'array', items: { type: 'string' } },
              mood: { type: 'string' },
              is_sponsored: { type: 'boolean' }
            },
            required: ['content_type', 'title', 'description', 'key_points', 'brands_mentioned', 'products_mentioned', 'hashtags', 'ingredients', 'instructions', 'mood', 'is_sponsored'],
            additionalProperties: false
          }
        }
      }
    });

    const result = JSON.parse(response.output_text);
    
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
// Chat - Using Responses API
// ============================================

export async function chat(
  instructions: string,
  input: string,
  previousResponseId?: string
): Promise<{ response: string; responseId: string }> {
  const client = getClient();
  
  try {
    const response = await client.responses.create({
      model: CHAT_MODEL,
      instructions,
      input,
      ...(previousResponseId && { previous_response_id: previousResponseId }),
      store: true, // Enable stateful context
    });

    return {
      response: response.output_text,
      responseId: response.id,
    };
  } catch (error) {
    console.error('Error in chat:', error);
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
): Promise<{ response: string; responseId: string }> {
  const client = getClient();
  
  try {
    const response = await client.responses.create({
      model: CHAT_MODEL,
      instructions,
      input,
      tools: [{ type: 'web_search' }], // Built-in web search!
      ...(previousResponseId && { previous_response_id: previousResponseId }),
      store: true,
    });

    return {
      response: response.output_text,
      responseId: response.id,
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
  const client = getClient();
  
  const productContext = products.length > 0 
    ? `מוצרים וקופונים: ${products.map(p => `${p.name}${p.brand ? ` (${p.brand})` : ''}${p.coupon_code ? ` - קופון: ${p.coupon_code}` : ''}`).join(', ')}`
    : 'אין מוצרים מוגדרים עדיין';
  
  const contentContext = contentItems.length > 0
    ? `תוכן: ${contentItems.map(c => `${c.title} (${c.type})`).join(', ')}`
    : '';

  try {
    const response = await client.responses.create({
      model: COMPLEX_MODEL,
      instructions: `צור הודעת פתיחה ושאלות מוצעות לצ'אטבוט של משפיען.

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

אם יש קופונים - לפחות שאלה אחת צריכה להיות על הנחות/קופונים.`,
      input: JSON.stringify({
        name: displayName,
        type: influencerType,
        tone: persona.tone,
        style: persona.style,
        interests: persona.interests,
        products: productContext,
        content: contentContext
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'greeting_questions',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              greeting: { type: 'string', description: 'הודעת פתיחה חמה' },
              questions: { 
                type: 'array', 
                items: { type: 'string' },
                description: '4-6 שאלות מוצעות'
              }
            },
            required: ['greeting', 'questions'],
            additionalProperties: false
          }
        }
      }
    });

    const result = JSON.parse(response.output_text);
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
      lifestyle: ['מה ההמלצה החמה שלך?', 'יש קופונים?', 'איזה טיפ יש לך לחיים?', 'מה חדש אצלך?'],
      other: ['איך אפשר לעזור?', 'יש המלצות?', 'מה חדש?', 'יש קופונים?']
    };
    
    return {
      greeting: `היי! אני הבוט של ${displayName} 💫 מה תרצו לדעת?`,
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
    beauty: 'אתה מומחה ליופי וטיפוח. עזור עם שאלות על איפור, טיפוח עור, ומוצרי יופי.',
    other: 'אתה עוזר אישי. עזור עם שאלות כלליות ומתן המלצות.',
  };

  return `
אתה העוזר החכם של ${name} - משפיען/ית בתחום ה${influencerType}.

## הפרסונה שלך:
- טון: ${persona.tone}
- סגנון: ${persona.style}
- תחומי עניין: ${persona.interests.join(', ')}
${persona.signature_phrases.length > 0 ? `- ביטויים אופייניים: ${persona.signature_phrases.join(', ')}` : ''}

## התפקיד שלך:
${typeInstructions[influencerType]}

## כללים:
1. ענה תמיד בעברית
2. ${emojiInstruction}
3. היה חם וידידותי, כמו ${name} עצמו/ה
4. כשמציע מוצרים או קופונים, כלול את הלינקים מהקונטקסט
5. אל תמציא מידע - השתמש רק במה שקיבלת
6. תשובות קצרות וממוקדות

## מידע רלוונטי:
${context}
  `.trim();
}
