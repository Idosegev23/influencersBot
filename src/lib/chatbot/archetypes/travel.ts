/**
 * Travel Archetype - מטיילת
 * ארכיטיפ 8: טיולים, מלונות, יעדים
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, GuardrailRule } from './types';

const TRAVEL_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'travel-warnings',
    description: 'התייחסות לאזהרות מסע',
    triggers: { keywords: ['לטוס ל', 'נסיעה ל', 'טיול ל'] },
    action: 'warn',
    warningMessage: '⚠️ חשוב לבדוק אזהרות מסע במשרד החוץ לפני הטיסה! היעד נראה חלומי אבל בטיחות קודם כל.',
    severity: 'high',
  },
  {
    id: 'no-visa-guarantee',
    description: 'איסור הבטחת ויזה',
    triggers: { keywords: ['ויזה', 'דרכון', 'אישור כניסה'] },
    action: 'warn',
    warningMessage: 'לגבי ויזות - הבוט לא יכול לתת מידע מדויק. כדאי לבדוק באתר הרשמי של השגרירות או במל"ל.',
    severity: 'high',
  },
];

const TRAVEL_DEFINITION: ArchetypeDefinition = {
  type: 'travel',
  name: 'מטיילת',
  description: 'עוזרת עם תכנון טיולים, המלצות, וטיפים',
  triggers: { keywords: ['טיול', 'נסיעה', 'מלון', 'יעד', 'טיסה'] },
  logic: {
    buildKnowledgeQuery: (msg) => `travel destinations hotels tips ${msg}`,
    responseTemplates: [],
    defaultResponse: 'בואי נתכנן טיול! איפה את רוצה לטוס?',
  },
  guardrails: TRAVEL_GUARDRAILS,
  examples: [],
};

export class TravelArchetype extends BaseArchetype {
  constructor() { super(TRAVEL_DEFINITION); }
  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide archetype-specific responses based on knowledge base
}

export function createTravelArchetype() { return new TravelArchetype(); }
