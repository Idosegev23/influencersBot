/**
 * Intent Router
 * מזהה את כוונת המשתמש ומנתב לארכיטיפ המתאים
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  ArchetypeType, 
  IntentClassification, 
  RouterInput 
} from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================
// Archetype Triggers Map
// ============================================

const ARCHETYPE_TRIGGERS: Record<ArchetypeType, string[]> = {
  skincare: [
    'עור', 'פנים', 'קרם', 'סרום', 'רטינול', 'ויטמין C', 'SPF', 'קרם לחות',
    'אקנה', 'כתמים', 'קמטים', 'טיפוח', 'שגרת בוקר', 'שגרת ערב',
    'חומצה', 'פילינג', 'מסכה', 'טונר', 'קלינזר'
  ],
  
  fashion: [
    'בגד', 'אאוטפיט', 'שמלה', 'חולצה', 'מכנסיים', 'נעליים', 'תיק',
    'סטייל', 'מידה', 'גזרה', 'צבע', 'מותג', 'איפה קנית', 'איך משלבים',
    'לאירוע', 'לעבודה', 'יומיומי', 'ערב', 'קיץ', 'חורף'
  ],
  
  cooking: [
    'מתכון', 'אוכל', 'בישול', 'אפייה', 'מרכיבים', 'כמה זמן', 'תחליף',
    'פרווה', 'חלבי', 'בשרי', 'טבעוני', 'ללא גלוטן', 'דיאטה',
    'ארוחת בוקר', 'ארוחת ערב', 'קינוח', 'עוגה', 'עוגיות'
  ],
  
  fitness: [
    'אימון', 'כושר', 'חדר כושר', 'ריצה', 'שרירים', 'בטן', 'ישבן',
    'משקל', 'מוטיבציה', 'תוכנית אימונים', 'כאב', 'פציעה',
    'בבית', 'ציוד', 'משקולות', 'מזרן', 'סרטוני אימון'
  ],
  
  parenting: [
    'ילד', 'תינוק', 'בייבי', 'שינה', 'אוכל', 'גמילה', 'מוצץ',
    'עגלה', 'מיטת תינוק', 'חיתול', 'הנקה', 'בקבוק', 'פורמולה',
    'גן', 'משחקים', 'התפתחות', 'הליכה', 'דיבור'
  ],
  
  coupons: [
    'קופון', 'קוד הנחה', 'הנחה', 'מבצע', 'סייל', 'קוד',
    'איך מקבלים', 'יש לך קוד', 'יקר', 'מחיר', 'כמה עולה',
    'שווה', 'משתלם', 'חסכון'
  ],
  
  tech: [
    'מצלמה', 'טלפון', 'אייפון', 'אפליקציה', 'עריכה', 'פילטר',
    'סטורי', 'רילס', 'תאורה', 'חצובה', 'מיקרופון', 'הגדרות',
    'איך מצלמים', 'איך עורכים', 'איזה אפליקציה', 'איזו מצלמה'
  ],
  
  travel: [
    'טיול', 'נסיעה', 'חופשה', 'טיסה', 'מלון', 'יעד', 'מדינה',
    'ארוז', 'מזוודה', 'ויזה', 'ביטוח', 'המלצות', 'כמה ימים',
    'תקציב', 'מה לעשות', 'אטרקציות', 'מסעדות'
  ],
  
  mindset: [
    'מוטיבציה', 'השראה', 'ביטחון עצמי', 'דיכאון', 'חרדה', 'לחץ',
    'מנטאלי', 'רגשות', 'עצוב', 'מתוסכל', 'מפחד', 'דאגה',
    'איך להתמודד', 'כוח', 'העצמה', 'תמיכה'
  ],
  
  interior: [
    'עיצוב', 'בית', 'דירה', 'ריהוט', 'ספה', 'שולחן', 'כיסא',
    'צבעים', 'קיר', 'וילון', 'שטיח', 'תאורה', 'דקורציה',
    'איפה קנית', 'סגנון', 'מינימליסטי', 'בוהו', 'מודרני'
  ],
  
  general: [], // Fallback
};

// ============================================
// Intent Router Class
// ============================================

export class IntentRouter {
  /**
   * Classify user intent and route to archetype
   */
  async classify(input: RouterInput): Promise<IntentClassification> {
    const userMessage = input.userMessage.toLowerCase();

    // 1. Try simple keyword matching first (fast)
    const keywordMatch = this.quickKeywordMatch(userMessage);
    if (keywordMatch.confidence > 0.5) { // ⚡ Lowered threshold from 0.7 to 0.5
      console.log(`[IntentRouter] ✅ Keyword match: ${keywordMatch.primaryArchetype} (${keywordMatch.confidence.toFixed(2)})`);
      return keywordMatch;
    }

    // 2. Use Gemini for complex intent classification
    try {
      return await this.geminiClassify(input);
    } catch (error) {
      console.error('[IntentRouter] Gemini classification failed, using keyword match');
      return keywordMatch;
    }
  }

  /**
   * Quick keyword-based matching
   */
  private quickKeywordMatch(userMessage: string): IntentClassification {
    const scores: Record<ArchetypeType, number> = {
      skincare: 0,
      fashion: 0,
      cooking: 0,
      fitness: 0,
      parenting: 0,
      coupons: 0,
      tech: 0,
      travel: 0,
      mindset: 0,
      interior: 0,
      general: 0,
    };

    // Count keyword matches for each archetype
    for (const [archetype, keywords] of Object.entries(ARCHETYPE_TRIGGERS)) {
      for (const keyword of keywords) {
        if (userMessage.includes(keyword.toLowerCase())) {
          scores[archetype as ArchetypeType]++;
        }
      }
    }

    // Find top 2 archetypes
    const sorted = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .filter(([, score]) => score > 0);

    if (sorted.length === 0) {
      return {
        primaryArchetype: 'general',
        secondaryArchetypes: [],
        confidence: 0.3,
        reasoning: 'No specific keywords found',
      };
    }

    const [primary, ...secondary] = sorted;
    const primaryScore = primary[1];
    
    // ⚡ Better confidence calculation
    // If there's a clear winner, give high confidence
    const secondScore = secondary[0]?.[1] || 0;
    let confidence: number;
    
    if (primaryScore >= 3) {
      confidence = 0.9; // Strong match
    } else if (primaryScore >= 2) {
      confidence = 0.7; // Good match
    } else if (primaryScore > secondScore) {
      confidence = 0.6; // Decent match
    } else {
      confidence = 0.4; // Weak match
    }

    return {
      primaryArchetype: primary[0] as ArchetypeType,
      secondaryArchetypes: secondary.slice(0, 2).map(([type]) => type as ArchetypeType),
      confidence,
      reasoning: `Keyword match: ${primaryScore} matches`,
    };
  }

  /**
   * Use Gemini for intent classification
   */
  private async geminiClassify(input: RouterInput): Promise<IntentClassification> {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const prompt = `אתה מסווג כוונות למערכת בוט צ'אט של משפיענית.

קטגוריות אפשריות:
1. skincare - טיפוח עור, מוצרים, שגרות
2. fashion - אופנה, סטיילינג, בגדים
3. cooking - בישול, מתכונים, אוכל
4. fitness - כושר, אימונים, משקל
5. parenting - הורות, ילדים, תינוקות
6. coupons - קופונים, הנחות, קודים
7. tech - טכנולוגיה, מצלמות, עריכה
8. travel - טיולים, נסיעות, מלונות
9. mindset - מוטיבציה, העצמה, רגשות
10. interior - עיצוב פנים, דקורציה
11. general - כללי

הודעת משתמש: "${input.userMessage}"

${input.conversationHistory ? `
היסטוריית שיחה:
${input.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}
` : ''}

תחום עיקרי של המשפיענית: ${input.accountContext.primaryNiche || 'לא ידוע'}

החזר JSON בפורמט:
{
  "primaryArchetype": "הקטגוריה העיקרית",
  "secondaryArchetypes": ["קטגוריה משנית"],
  "confidence": 0.0-1.0,
  "reasoning": "הסבר קצר"
}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Gemini response');
    }

    const classification = JSON.parse(jsonMatch[0]);

    return {
      primaryArchetype: classification.primaryArchetype,
      secondaryArchetypes: classification.secondaryArchetypes || [],
      confidence: classification.confidence,
      reasoning: classification.reasoning,
    };
  }
}

// ============================================
// Singleton
// ============================================

let routerInstance: IntentRouter | null = null;

export function getIntentRouter(): IntentRouter {
  if (!routerInstance) {
    routerInstance = new IntentRouter();
  }
  return routerInstance;
}

/**
 * Quick route - classify and return archetype
 */
export async function routeToArchetype(input: RouterInput): Promise<IntentClassification> {
  const router = getIntentRouter();
  return router.classify(input);
}
