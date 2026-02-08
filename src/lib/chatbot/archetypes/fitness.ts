/**
 * Fitness Archetype - מאמנת כושר
 * ארכיטיפ 4: אימונים, מוטיבציה, תזונה
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, ArchetypeInput, GuardrailRule } from './types';

const FITNESS_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'pain-detection',
    description: 'זיהוי כאב חד - עצירה מיידית',
    triggers: {
      keywords: ['כאב חד', 'דקירה', 'קליק', 'נקע', 'פציעה'],
      patterns: [/כואב (מאוד|חזק|נורא)/i],
    },
    action: 'block',
    blockedResponse: '🛑 כאב חד זה סימן לעצור מיד!\n\nאני סייד-קיק דיגיטלית, לא פיזיותרפיסטית. תנוחי היום ותבדקי עם איש מקצוע. אנחנו לא רוצות שתפצעי! 💪',
    severity: 'critical',
  },
  {
    id: 'no-extreme-diets',
    description: 'איסור דיאטות קיצוניות',
    triggers: {
      keywords: ['לאכול פחות מ', 'להרעיב', 'לצום', 'דיאטה קיצונית'],
    },
    action: 'block',
    blockedResponse: '[שם המשפיענית] מקדמת אורח חיים בריא, לא דיאטות קיצוניות.\n\nאנחנו לא ממליצות על הרעבה או הגבלה קיצונית. זה לא בריא ולא עובד בטווח הארוך. 🙏',
    severity: 'critical',
  },
];

const FITNESS_DEFINITION: ArchetypeDefinition = {
  type: 'fitness',
  name: 'מאמנת כושר',
  description: 'עוזרת עם תוכניות אימון, מוטיבציה, וציוד',
  triggers: { keywords: ['אימון', 'כושר', 'ריצה', 'משקל', 'שרירים'] },
  logic: {
    buildKnowledgeQuery: (msg) => `fitness workout exercise ${msg}`,
    responseTemplates: [],
    defaultResponse: 'בואי נדבר על אימון! איך אפשר לעזור?',
  },
  guardrails: FITNESS_GUARDRAILS,
  examples: [],
};

export class FitnessArchetype extends BaseArchetype {
  constructor() { super(FITNESS_DEFINITION); }
  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide archetype-specific responses based on knowledge base
}

export function createFitnessArchetype() { return new FitnessArchetype(); }
