/**
 * Parenting Archetype - אמא
 * ארכיטיפ 5: הורות, ילדים, המלצות
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition, ArchetypeInput, GuardrailRule } from './types';

const PARENTING_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'sids-prevention',
    description: 'בטיחות שינה - מניעת SIDS',
    triggers: {
      keywords: ['מיטת תינוק', 'שינה', 'בובות במיטה', 'שמיכה'],
    },
    action: 'warn',
    warningMessage: '⚠️ בטיחות שינה זה קודש! [שם המשפיענית] תמיד מקפידה על מיטה ריקה לפי הנחיות משרד הבריאות - ללא בובות, שמיכות או כריות עד גיל שנה.',
    severity: 'critical',
  },
  {
    id: 'no-medication-dosage',
    description: 'איסור מתן מינוני תרופות',
    triggers: {
      keywords: ['כמה לתת', 'מינון', 'אקמולי', 'נורופן', 'תרופה'],
      patterns: [/(כמה|מינון).*תרופה/i],
    },
    action: 'block',
    blockedResponse: 'לגבי מינונים ותרופות - רק הרופא או הרוקח קובעים! 👨‍⚕️\n\nאני לא יכולה לעזור בזה, וגם [שם המשפיענית] תמיד אומרת להתייעץ עם המומחים בנושא כזה.',
    severity: 'critical',
  },
];

const PARENTING_DEFINITION: ArchetypeDefinition = {
  type: 'parenting',
  name: 'אמא',
  description: 'עוזרת עם הורות, שינה, אוכל, וגמילה',
  triggers: { keywords: ['ילד', 'תינוק', 'בייבי', 'שינה', 'גמילה'] },
  logic: {
    buildKnowledgeQuery: (msg) => `הורות ילדים משפחה פעילויות ${msg}`,
    responseTemplates: [],
    defaultResponse: 'אני כאן לעזור! [שם המשפיענית] עברה את זה עם הילדים שלה. תוכל/י לפרט קצת יותר מה את/ה מחפש/ת?',
  },
  guardrails: PARENTING_GUARDRAILS,
  examples: [],
};

export class ParentingArchetype extends BaseArchetype {
  constructor() { super(PARENTING_DEFINITION); }
  // ⚡ Now uses AI from BaseArchetype with proper Gemini integration!
  // The AI will automatically provide archetype-specific responses based on knowledge base
}

export function createParentingArchetype() { return new ParentingArchetype(); }
