/**
 * Skincare Archetype - סקין-קר מומחית
 * ארכיטיפ 1: שגרות טיפוח, מוצרים, רכיבים
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, ArchetypeInput, GuardrailRule } from './types';

// ============================================
// Guardrails for Skincare
// ============================================

const SKINCARE_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'no-prescription-drugs',
    description: 'איסור המלצה על תרופות מרשם',
    triggers: {
      keywords: ['ראקוטן', 'אקוטן', 'רואקוטן', 'אקנה-מיצין', 'טרטינואין', 'isotretinoin'],
    },
    action: 'block',
    blockedResponse: 'זה נושא רציני שדורש רופא עור. [שם המשפיענית] לא משחקת עם תרופות מרשם - זה תחום רפואי ויש להתייעץ עם רופא העור שלך.',
    severity: 'critical',
  },
  {
    id: 'dangerous-combinations',
    description: 'איסור שילובים מסוכנים של חומרים פעילים',
    triggers: {
      keywords: ['רטינול + חומצה', 'רטינול וחומצה', 'ויטמין C + רטינול'],
      patterns: [/רטינול.*חומצה/i, /חומצה.*רטינול/i],
    },
    action: 'block',
    blockedResponse: 'עצרי! 🛑 השילוב הזה יכול לגרום לגירוי רציני של העור. לפי הפרוטוקול של [שם המשפיענית], חומרים חזקים כאלה צריך להפריד: אחד בבוקר ואחד בערב. אל תשחקי עם זה!',
    severity: 'critical',
  },
  {
    id: 'spf-reminder',
    description: 'חובת תזכורת SPF עם כל חומר פעיל',
    triggers: {
      keywords: ['רטינול', 'חומצה', 'AHA', 'BHA', 'גליקולית', 'סליצילית'],
    },
    action: 'warn',
    warningMessage: 'חשוב! כשמשתמשים בחומצות או רטינול, SPF זה לא משא ומתן - זה חובה מוחלטת. [שם המשפיענית] תמיד מדגישה את זה.',
    severity: 'high',
  },
  {
    id: 'no-diy-treatments',
    description: 'איסור טיפולים ביתיים מסוכנים',
    triggers: {
      keywords: ['פילינג כימי בבית', 'מיקרונידלינג בבית', 'דרמה-רולר'],
    },
    action: 'warn',
    warningMessage: 'זה טיפול שצריך מקצוען. אפשר לעשות נזק רציני לעור אם לא עושים את זה נכון.',
    severity: 'high',
  },
];

// ============================================
// Skincare Archetype Definition
// ============================================

const SKINCARE_DEFINITION: ArchetypeDefinition = {
  type: 'skincare',
  name: 'מומחית סקין-קר',
  description: 'עוזרת עם שגרות טיפוח, המלצות מוצרים, הסבר רכיבים, ושילובים בטוחים',
  
  triggers: {
    keywords: [
      'עור', 'פנים', 'קרם', 'סרום', 'רטינול', 'ויטמין C', 'SPF',
      'אקנה', 'כתמים', 'קמטים', 'שגרה', 'טיפוח', 'ניקוי',
    ],
  },
  
  logic: {
    buildKnowledgeQuery: (userMessage: string) => {
      // Extract product/ingredient mentions
      const keywords = ['קרם', 'סרום', 'ניקוי', 'שגרה', 'טיפוח'];
      const found = keywords.filter(k => userMessage.includes(k));
      
      return `skincare routine products ingredients ${found.join(' ')}`;
    },
    
    responseTemplates: [
      {
        situation: 'שאלה על שגרה',
        template: 'בדיוק כמו ש{name} תמיד עושה בשגרת {time} שלה: {steps}',
        requiredFields: ['time', 'steps'],
      },
      {
        situation: 'שאלה על רכיב',
        template: '{name} משתמשת ב{ingredient} כי {reason}. {recommendation}',
        requiredFields: ['ingredient', 'reason'],
      },
      {
        situation: 'המלצת מוצר',
        template: '{name} ממש אוהבת את {product}. {why}',
        requiredFields: ['product', 'why'],
      },
    ],
    
    defaultResponse: 'אני יכולה לעזור לך עם זה! אספר לך מה [שם המשפיענית] עושה ומה שעובד לה.',
  },
  
  guardrails: SKINCARE_GUARDRAILS,
  
  examples: [
    {
      userQuestion: 'איזה רטינול את משתמשת?',
      expectedBehavior: 'תיאור המוצר + תזכורת SPF + אזהרה על גירוי',
    },
    {
      userQuestion: 'אפשר לערבב רטינול וחומצה?',
      expectedBehavior: 'חסימה מיידית + הסבר על הסכנה + המלצה להפריד',
    },
  ],
};

// ============================================
// Skincare Archetype Implementation
// ============================================

export class SkincareArchetype extends BaseArchetype {
  constructor() {
    super(SKINCARE_DEFINITION);
  }

  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide skincare-specific responses based on knowledge base
}

// ============================================
// Export
// ============================================

export function createSkincareArchetype(): SkincareArchetype {
  return new SkincareArchetype();
}
