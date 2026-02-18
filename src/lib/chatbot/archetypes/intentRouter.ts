/**
 * Intent Router
 * מזהה את כוונת המשתמש ומנתב לארכיטיפ המתאים
 *
 * Keyword-only classification — no AI fallback.
 * Fast path: greeting detection → keyword matching → general fallback.
 */

import {
  ArchetypeType,
  IntentClassification,
  RouterInput
} from './types';

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
    'ארוחת בוקר', 'ארוחת ערב', 'קינוח', 'עוגה', 'עוגיות',
    'שווארמה', 'פסטה', 'פיצה', 'טחינה', 'חומוס', 'פלאפל', 'סלט',
    'מרק', 'עוף', 'בשר', 'דג', 'טונה', 'פיתה', 'לחם', 'אורז',
    'שניצל', 'המבורגר', 'סושי', 'ביצה', 'ביצים', 'ירקות', 'פירות',
    'רוטב', 'תבלין', 'שום', 'בצל', 'עגבנייה', 'גבינה', 'שוקולד',
  ],

  fitness: [
    'אימון', 'כושר', 'חדר כושר', 'ריצה', 'שרירים', 'בטן', 'ישבן',
    'משקל', 'מוטיבציה', 'תוכנית אימונים', 'כאב', 'פציעה',
    'בבית', 'ציוד', 'משקולות', 'מזרן', 'סרטוני אימון'
  ],

  parenting: [
    'ילד', 'תינוק', 'בייבי', 'שינה', 'גמילה', 'מוצץ',
    'עגלת תינוק', 'מיטת תינוק', 'חיתול', 'הנקה', 'בקבוק', 'פורמולה',
    'גן', 'משחקים', 'התפתחות', 'הליכה', 'דיבור',
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
   * Classify user intent and route to archetype.
   * Keyword-only — no AI call. Instant response.
   */
  classify(input: RouterInput): IntentClassification {
    const userMessage = input.userMessage.toLowerCase().trim();

    // 0. Fast-path: detect greetings instantly
    const greetingMatch = this.detectGreeting(userMessage);
    if (greetingMatch) {
      console.log(`[IntentRouter] 👋 Greeting detected`);
      return greetingMatch;
    }

    // 1. Keyword matching — accept any match (single keyword is enough)
    const keywordMatch = this.quickKeywordMatch(userMessage);
    if (keywordMatch.confidence >= 0.5) {
      console.log(`[IntentRouter] ✅ Keyword match: ${keywordMatch.primaryArchetype} (${keywordMatch.confidence.toFixed(2)})`);
      return keywordMatch;
    }

    // 2. No match → general (instant, no AI call)
    console.log(`[IntentRouter] ℹ️ No keyword match → general`);
    return keywordMatch; // Already has primaryArchetype: 'general'
  }

  /**
   * Detect simple greetings — returns immediately
   */
  private detectGreeting(message: string): IntentClassification | null {
    const GREETING_PATTERNS = [
      'היי', 'הי', 'שלום', 'אהלן', 'מה קורה', 'מה נשמע', 'מה שלומך',
      'מה העניינים', 'בוקר טוב', 'ערב טוב', 'לילה טוב', 'יום טוב',
      'hey', 'hi', 'hello', 'sup', 'yo', 'hola',
      'מה המצב', 'שלומות', 'אהלן וסהלן',
    ];

    // Very short messages (<15 chars) that match a greeting pattern
    if (message.length <= 15 && GREETING_PATTERNS.some(g => message.includes(g))) {
      return {
        primaryArchetype: 'general',
        secondaryArchetypes: [],
        confidence: 0.95,
        reasoning: 'greeting',
      };
    }

    // Exact match for very short messages (1-2 words, <8 chars) — treat as greeting
    if (message.length <= 8 && !message.includes('?') && !message.includes('קופון') && !message.includes('הנחה')) {
      return {
        primaryArchetype: 'general',
        secondaryArchetypes: [],
        confidence: 0.9,
        reasoning: 'short_greeting',
      };
    }

    return null;
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

    const secondScore = secondary[0]?.[1] || 0;
    let confidence: number;

    if (primaryScore >= 3) {
      confidence = 0.95; // Strong match
    } else if (primaryScore >= 2) {
      confidence = 0.85; // Good match
    } else if (primaryScore > secondScore) {
      confidence = 0.7; // Single keyword, clear winner
    } else {
      confidence = 0.5; // Tied but has a match
    }

    return {
      primaryArchetype: primary[0] as ArchetypeType,
      secondaryArchetypes: secondary.slice(0, 2).map(([type]) => type as ArchetypeType),
      confidence,
      reasoning: `Keyword match: ${primaryScore} matches`,
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
export function routeToArchetype(input: RouterInput): IntentClassification {
  const router = getIntentRouter();
  return router.classify(input);
}
