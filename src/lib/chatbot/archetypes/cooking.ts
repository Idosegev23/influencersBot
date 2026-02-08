/**
 * Cooking Archetype - בשלנית
 * ארכיטיפ 3: מתכונים, תחליפים, הכפלות
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, ArchetypeInput, GuardrailRule } from './types';

const COOKING_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'allergy-warning',
    description: 'אזהרה קשיחה על אלרגיות',
    triggers: { keywords: ['אלרגיה', 'אלרגי', 'רגיש ל'] },
    action: 'warn',
    warningMessage: '⚠️ חשוב! אם יש לך אלרגיה, חובה לוודא שכל חומרי הגלם מסומנים ככאלה. המתכון עצמו יכול להיות בטוח, אבל המוצרים שאת קונה - תבדקי הכל!',
    severity: 'critical',
  },
  {
    id: 'food-safety',
    description: 'בטיחות מזון - אחסון וטריות',
    triggers: { keywords: ['נשאר בחוץ', 'כמה זמן טוב', 'פג תוקף'] },
    action: 'block',
    blockedResponse: '[שם המשפיענית] מאוד מקפידה על טריות ובטיחות מזון. אם זה עמד בחוץ יותר משעתיים - זה סיכון שלא כדאי לקחת. עדיף לזרוק. 🗑️',
    severity: 'critical',
  },
];

const COOKING_DEFINITION: ArchetypeDefinition = {
  type: 'cooking',
  name: 'בשלנית',
  description: 'עוזרת עם מתכונים, תחליפי רכיבים, והכפלות',
  triggers: { keywords: ['מתכון', 'בישול', 'אפייה', 'תחליף', 'רכיבים'] },
  logic: {
    buildKnowledgeQuery: (msg) => `recipes cooking ingredients ${msg}`,
    responseTemplates: [],
    defaultResponse: 'אני כאן לעזור עם המתכון! ספרי לי מה את צריכה.',
  },
  guardrails: COOKING_GUARDRAILS,
  examples: [],
};

export class CookingArchetype extends BaseArchetype {
  constructor() { super(COOKING_DEFINITION); }
  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide archetype-specific responses based on knowledge base
}

export function createCookingArchetype() { return new CookingArchetype(); }
