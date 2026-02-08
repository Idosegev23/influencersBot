/**
 * Coupons Archetype - ציידת קופונים
 * ארכיטיפ 6: קופונים, הנחות, קודים
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, ArchetypeInput, GuardrailRule } from './types';
import { createClient } from '@/lib/supabase/server';

// ============================================
// Guardrails for Coupons
// ============================================

const COUPONS_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'affiliate-disclosure',
    description: 'גילוי נאות של קישורי שותפים',
    triggers: {
      keywords: ['לינק', 'קישור', 'לקנות', 'רכישה'],
    },
    action: 'warn',
    warningMessage: '💡 שימי לב: זה לינק שותפים, כלומר אם תרכשי דרכו, [שם המשפיענית] תקבל עמלה קטנה (המחיר שלך לא משתנה!).',
    severity: 'medium',
  },
  {
    id: 'no-price-guarantee',
    description: 'איסור להבטיח מחיר',
    triggers: {
      keywords: ['המחיר', 'עולה', 'כמה', 'מחיר סופי'],
      conditions: ['asking for exact price'],
    },
    action: 'warn',
    warningMessage: 'שימי לב - מחירים משתנים כל הזמן בחנויות. המחיר שאני נותנת זה מה שפעיל כרגע, אבל כדאי לבדוק שוב לפני הרכישה.',
    severity: 'high',
  },
  {
    id: 'verify-code-validity',
    description: 'חובת בדיקת תוקף קוד',
    triggers: {
      keywords: ['קוד', 'קופון', 'הנחה'],
    },
    action: 'redirect',
    warningMessage: 'רגע, אני מוודאת שהקוד הזה עדיין פעיל... ⏳',
    severity: 'medium',
  },
];

// ============================================
// Coupons Archetype Definition
// ============================================

const COUPONS_DEFINITION: ArchetypeDefinition = {
  type: 'coupons',
  name: 'ציידת קופונים',
  description: 'עוזרת למצוא קופונים, בודקת תוקף, ומוודאת הנחות',
  
  triggers: {
    keywords: [
      'קופון', 'קוד', 'הנחה', 'מבצע', 'סייל',
      'יקר', 'מחיר', 'כמה עולה', 'שווה', 'חסכון',
    ],
  },
  
  logic: {
    buildKnowledgeQuery: (userMessage: string) => {
      return `coupons discounts codes promotions ${userMessage}`;
    },
    
    responseTemplates: [
      {
        situation: 'בקשת קופון',
        template: 'יש קוד מיוחד! {code} ב-{brand}. {discount}',
        requiredFields: ['code', 'brand'],
      },
      {
        situation: 'שאלת מחיר',
        template: 'כרגע המחיר הוא {price}, אבל עם הקוד {code} את מקבלת {discount}!',
        requiredFields: ['price', 'code'],
      },
    ],
    
    defaultResponse: 'אני כאן כדי לעזור לך לחסוך! ספרי לי מה את מחפשת.',
  },
  
  guardrails: COUPONS_GUARDRAILS,
  
  examples: [
    {
      userQuestion: 'יש קופון למוצר הזה?',
      expectedBehavior: 'בדיקה בזמן אמת ב-DB + תוקף + גילוי נאות',
    },
  ],
};

// ============================================
// Coupons Archetype Implementation
// ============================================

export class CouponsArchetype extends BaseArchetype {
  constructor() {
    super(COUPONS_DEFINITION);
  }

  // ⚡ Now uses AI from BaseArchetype - no need to override!
  // The AI will automatically use the coupons from knowledge base
}

// ============================================
// Export
// ============================================

export function createCouponsArchetype(): CouponsArchetype {
  return new CouponsArchetype();
}
