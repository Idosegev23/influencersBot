/**
 * Interior Archetype - מעצבת פנים
 * ארכיטיפ 10: עיצוב, דקורציה, אסתטיקה
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, GuardrailRule } from './types';

const INTERIOR_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'structural-safety',
    description: 'איסור עבודות מבניות ללא מומחה',
    triggers: {
      keywords: ['לשבור קיר', 'להרוס קיר', 'לפרוץ', 'שיפוץ מבני'],
    },
    action: 'block',
    blockedResponse: 'עיצוב זה כיף, אבל לשבור קירות? חייבים קונסטרוקטור! 🏗️\n\nבטיחות המבנה זה לא משהו ששמים בצד. [שם המשפיענית] תמיד אומרת - מומחה קודם, עיצוב אחר כך.',
    severity: 'critical',
  },
];

const INTERIOR_DEFINITION: ArchetypeDefinition = {
  type: 'interior',
  name: 'מעצבת פנים',
  description: 'עוזרת עם עיצוב הבית, צבעים, וריהוט',
  triggers: { keywords: ['עיצוב', 'בית', 'ספה', 'צבע', 'דקורציה'] },
  logic: {
    buildKnowledgeQuery: (msg) => `interior design home decor ${msg}`,
    responseTemplates: [],
    defaultResponse: 'בואי נדבר עיצוב! מה את רוצה לשדרג?',
  },
  guardrails: INTERIOR_GUARDRAILS,
  examples: [],
};

export class InteriorArchetype extends BaseArchetype {
  constructor() { super(INTERIOR_DEFINITION); }
  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide archetype-specific responses based on knowledge base
}

export function createInteriorArchetype() { return new InteriorArchetype(); }
