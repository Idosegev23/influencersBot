/**
 * Mindset Archetype - מיינדסט והעצמה
 * ארכיטיפ 9: מוטיבציה, עידוד, תמיכה רגשית
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, GuardrailRule } from './types';

const MINDSET_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'crisis-hotline',
    description: 'זיהוי משבר רגשי - הפניה לקו חם',
    triggers: {
      keywords: ['רוצה למות', 'לסיים את זה', 'אין לי כוח יותר', 'אובדני'],
      patterns: [/לא רוצה (לחיות|להמשיך)/i],
    },
    action: 'block',
    blockedResponse: '🚨 אני כאן כדי לעזור, אבל במצב כזה חשוב לדבר עם מי שיכול לעזור באמת:\n\nער"ן (עזרה ראשונה נפשית): 1201\nסהר (סיוע בהתמודדות עם משברים): *2230\n\nאת לא לבד, ויש אנשים שיכולים לעזור. 💚',
    severity: 'critical',
  },
  {
    id: 'no-legal-advice',
    description: 'איסור ייעוץ משפטי/גירושין',
    triggers: {
      keywords: ['גירושין', 'לעזוב אותו', 'להתגרש', 'עורך דין'],
    },
    action: 'block',
    blockedResponse: 'זה נשמע מורכב ורגשי... 💔\n\nאני סייד-קיק דיגיטלית ולא יועצת זוגית או משפטית. בסיטואציה כזאת כדאי לדבר עם מומחה שיכול לעזור באמת.',
    severity: 'high',
  },
];

const MINDSET_DEFINITION: ArchetypeDefinition = {
  type: 'mindset',
  name: 'מיינדסט',
  description: 'עוזרת עם מוטיבציה, ביטחון עצמי, והעצמה',
  triggers: { keywords: ['מוטיבציה', 'ביטחון', 'לחץ', 'חרדה', 'עצוב'] },
  logic: {
    buildKnowledgeQuery: (msg) => `mindset motivation empowerment ${msg}`,
    responseTemplates: [],
    defaultResponse: 'אני כאן בשבילך! ספרי לי מה את מרגישה.',
  },
  guardrails: MINDSET_GUARDRAILS,
  examples: [],
};

export class MindsetArchetype extends BaseArchetype {
  constructor() { super(MINDSET_DEFINITION); }
  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide archetype-specific responses based on knowledge base
}

export function createMindsetArchetype() { return new MindsetArchetype(); }
