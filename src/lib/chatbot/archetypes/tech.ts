/**
 * Tech Archetype - טכנולוגית (Creator)
 * ארכיטיפ 7: מצלמות, עריכה, אפליקציות
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, GuardrailRule } from './types';

const TECH_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'no-piracy',
    description: 'איסור פיראטיות',
    triggers: { keywords: ['קראק', 'פיראטי', 'חינם בחינם', 'להוריד חינם'] },
    action: 'block',
    blockedResponse: 'אנחנו לא תומכות בפיראטיות ❌ יש הרבה אפליקציות חינמיות ולגיטימיות שעובדות מעולה!',
    severity: 'critical',
  },
  {
    id: 'hardware-safety',
    description: 'אזהרה על מטענים/אביזרים לא מקוריים',
    triggers: { keywords: ['מטען זול', 'מטען סיני', 'לא מקורי'] },
    action: 'warn',
    warningMessage: 'שימי לב - מטענים לא מקוריים יכולים להרוס את הסוללה ואפילו להיות מסוכנים! 🔥',
    severity: 'high',
  },
];

const TECH_DEFINITION: ArchetypeDefinition = {
  type: 'tech',
  name: 'טכנולוגית',
  description: 'עוזרת עם ציוד יצירת תוכן, עריכה, והגדרות',
  triggers: { keywords: ['מצלמה', 'טלפון', 'עריכה', 'אפליקציה', 'פילטר'] },
  logic: {
    buildKnowledgeQuery: (msg) => `tech camera apps equipment ${msg}`,
    responseTemplates: [],
    defaultResponse: 'בואי נדבר טכנולוגיה! איך אפשר לעזור?',
  },
  guardrails: TECH_GUARDRAILS,
  examples: [],
};

export class TechArchetype extends BaseArchetype {
  constructor() { super(TECH_DEFINITION); }
  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide archetype-specific responses based on knowledge base
}

export function createTechArchetype() { return new TechArchetype(); }
