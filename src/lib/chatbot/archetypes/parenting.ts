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
      // Baby-sleep-specific phrases only — bare 'שינה' also matches adult sleep
      // questions (supplements, mattresses…) and must not drag the SIDS warning in.
      keywords: ['מיטת תינוק', 'שינת תינוק', 'שינה של התינוק', 'בובות במיטה', 'שמיכה לתינוק'],
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
    // Dynamic fallback that encourages rephrasing
    defaultResponse: 'אני לא בטוחה שהבנתי בדיוק למה התכוונת, אבל [שם המשפיענית] תמיד שמחה לעזור בנושאי הורות וילדים! תוכלי לנסות לשאול שוב במילים אחרות? אולי על נושא ספציפי כמו שינה, תזונה או פעילויות?',
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
