/**
 * General Archetype - כללי
 * Fallback ארכיטיפ לשאלות כלליות
 */

import { BaseArchetype } from './baseArchetype';
import { ArchetypeDefinition } from './types';

const GENERAL_DEFINITION: ArchetypeDefinition = {
  type: 'general',
  name: 'כללי',
  description: 'ארכיטיפ ברירת מחדל לשאלות כלליות',
  triggers: { keywords: [] },
  logic: {
    buildKnowledgeQuery: (msg) => msg,
    responseTemplates: [],
    defaultResponse: 'אני כאן לעזור! ספרי לי יותר.',
  },
  guardrails: [],
  examples: [],
};

export class GeneralArchetype extends BaseArchetype {
  constructor() { super(GENERAL_DEFINITION); }
  
  // ⚡ Now uses AI from BaseArchetype!
  // Will provide a natural, context-aware response based on available knowledge
}

export function createGeneralArchetype() { return new GeneralArchetype(); }
