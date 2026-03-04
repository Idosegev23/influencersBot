/**
 * Fashion Archetype - פאשניסטה
 * ארכיטיפ 2: סטיילינג, מידות, אופנה
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, ArchetypeInput, GuardrailRule } from './types';

// ============================================
// Guardrails for Fashion
// ============================================

const FASHION_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'no-body-shaming',
    description: 'איסור מוחלט על Body Shaming',
    triggers: {
      keywords: ['להיראות רזה', 'להיות רזה', 'להרזות', 'לשדר רזה', 'להסתיר שומן'],
      patterns: [/איך (להיראות|להיות) (יותר )?רז(ה|ות)/i],
    },
    action: 'block',
    blockedResponse: 'סטייל זה לא עניין של מידה, זה עניין של ביטחון עצמי! 💕\n\n[שם המשפיענית] מאמינ/ה שכל גוף יפה, ושסטייל טוב זה סטייל שגורם לך להרגיש טוב עם עצמך.\n\nבוא/י נתמקד בגזרות שמחמיאות למבנה הגוף שלך ובצבעים שמתאימים לך!',
    severity: 'critical',
  },
  {
    id: 'no-counterfeits',
    description: 'איסור המלצה על זיופים',
    triggers: {
      keywords: ['זיוף', 'העתק', 'חיקוי', 'פייק', 'לא מקורי'],
    },
    action: 'block',
    blockedResponse: 'אנחנו לא תומכים בזיופים ❌\n\nיש הרבה מותגים נגישים ומדהימים שנותנים את אותו ה-Vibe. [שם המשפיענית] תמיד מחפש/ת אופציות במחיר טוב אבל חוקיות.\n\nמעוניינ/ת שאמצא לך אלטרנטיבה דומה במחיר נגיש?',
    severity: 'critical',
  },
  {
    id: 'sizing-disclaimer',
    description: 'תזכורת שמידות משתנות בין מותגים',
    triggers: {
      keywords: ['מידה', 'size', 'גזרה', 'פיטינג'],
    },
    action: 'warn',
    warningMessage: 'שים/י לב שמידות משתנות בין מותגים! כדאי תמיד לבדוק את טבלת המידות של המותג הספציפי.',
    severity: 'medium',
  },
];

// ============================================
// Fashion Archetype Definition
// ============================================

const FASHION_DEFINITION: ArchetypeDefinition = {
  type: 'fashion',
  name: 'פאשניסטה',
  description: 'עוזר/ת עם סטיילינג, בחירת בגדים, שילובים, ומידות',

  triggers: {
    keywords: [
      'בגד', 'אאוטפיט', 'שמלה', 'חולצה', 'מכנסיים', 'נעליים',
      'סטייל', 'מידה', 'צבע', 'איך משלבים', 'איפה קנית',
    ],
  },

  logic: {
    buildKnowledgeQuery: (userMessage: string) => {
      return `fashion outfit styling products ${userMessage}`;
    },

    responseTemplates: [
      {
        situation: 'חיפוש מוצר',
        template: 'מחפש/ת את {item}? אני אשלח לך את הלינק! {coupon}',
        requiredFields: ['item'],
      },
      {
        situation: 'שאלת סטיילינג',
        template: '{name} משלב/ת את זה עם {combination}. זה נראה מהמם! 🔥',
        requiredFields: ['combination'],
      },
    ],

    defaultResponse: 'אני כאן לעזור עם הסטייל! ספר/י לי מה מחפש/ת.',
  },

  guardrails: FASHION_GUARDRAILS,

  examples: [
    {
      userQuestion: 'איך להיראות רזה יותר בבגדים?',
      expectedBehavior: 'חסימה + הפניה לביטחון עצמי + המלצות גזרות מחמיאות',
    },
  ],
};

// ============================================
// Fashion Archetype Implementation
// ============================================

export class FashionArchetype extends BaseArchetype {
  constructor() {
    super(FASHION_DEFINITION);
  }

  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide archetype-specific responses based on knowledge base

  private buildProductLocationResponse(kb: any): string {
    return `אני אשלח לך את הלינק המדויק!

[שם המשפיענית] קנה/תה את זה מ-[מותג] ויש קוד הנחה מיוחד: [קופון]

רגע, אני מוודא/ת שהקוד פעיל... ✨`;
  }

  private buildSizingResponse(kb: any): string {
    return `לגבי מידות - [שם המשפיענית] לוקח/ת [מידה] במותג הזה.

אבל שים/י לב! 👗
כל מותג עם הגזרות שלו. כדאי לבדוק:
- את טבלת המידות שלהם
- את הביקורות (אם כותבים שזה גדול/קטן)
- אם אפשר החזרה חינם

רוצה שאשלח לך את הלינק עם כל המידע?`;
  }

  private buildStylingResponse(kb: any): string {
    return `אוהב/ת את השאלה! 🔥

[שם המשפיענית] משלב/ת את זה ככה:
✨ עם ג'ינס קלאסי לפשטות
✨ נעליים שטוחות למראה casual
✨ תיק קטן לאיזון

זה הסוד — פשטות שנראית expensive!

רוצה עוד רעיונות לשילובים?`;
  }

  private buildGeneralFashionResponse(kb: any): string {
    return `אני כאן לעזור עם הסטייל! 👗

[שם המשפיענית] מאמינ/ה שאופנה זה להרגיש טוב עם מה שלובשים.

ספר/י לי:
- מחפש/ת משהו ספציפי?
- יש אירוע מסוים?
- רוצה רעיונות לשילובים?

בוא/י נמצא את הלוק המושלם! ✨`;
  }
}

// ============================================
// Export
// ============================================

export function createFashionArchetype(): FashionArchetype {
  return new FashionArchetype();
}
