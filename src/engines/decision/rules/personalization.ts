/**
 * Personalization Rules
 * Adjust tone and style based on mode and user
 */

import type { Rule } from '../types';

export const personalizationRules: Rule[] = [
  {
    id: 'tone_creator',
    name: 'Creator mode -> casual friendly tone',
    category: 'personalization',
    priority: 50,
    mode: 'creator',
    enabled: true,
    conditions: [
      { field: 'ctx.account.mode', operator: 'eq', value: 'creator' },
    ],
    actions: [
      { type: 'set_ui', value: { tone: 'casual' } },
    ],
  },

  {
    id: 'tone_brand',
    name: 'Brand mode -> professional tone',
    category: 'personalization',
    priority: 51,
    mode: 'brand',
    enabled: true,
    conditions: [
      { field: 'ctx.account.mode', operator: 'eq', value: 'brand' },
    ],
    actions: [
      { type: 'set_ui', value: { tone: 'professional' } },
    ],
  },

  {
    id: 'repeat_user_shorter',
    name: 'Repeat visitor -> shorter greetings',
    category: 'personalization',
    priority: 52,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'ctx.user.isRepeatVisitor', operator: 'eq', value: true },
      { field: 'understanding.intent', operator: 'eq', value: 'general' },
    ],
    actions: [
      { type: 'set_ui', value: { responseLength: 'short' } },
      { type: 'set_model', value: { maxTokens: 180 } },
    ],
  },

  {
    id: 'negative_sentiment_empathy',
    name: 'Negative sentiment -> empathetic tone',
    category: 'personalization',
    priority: 53,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.sentiment', operator: 'eq', value: 'negative' },
    ],
    actions: [
      { type: 'set_ui', value: { tone: 'empathetic' } },
    ],
  },

  {
    id: 'positive_sentiment_casual',
    name: 'Positive sentiment -> keep casual',
    category: 'personalization',
    priority: 54,
    mode: 'creator',
    enabled: true,
    conditions: [
      { field: 'understanding.sentiment', operator: 'eq', value: 'positive' },
    ],
    actions: [
      { type: 'set_ui', value: { tone: 'casual' } },
    ],
  },

  {
    id: 'brand_mentioned_highlight',
    name: 'Brand mentioned -> include brand context',
    category: 'personalization',
    priority: 55,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.entities.brands', operator: 'exists', value: true },
    ],
    actions: [
      { type: 'append_context', value: ['brands'] },
      { type: 'set_ui', value: { showCardList: 'brands' } },
    ],
  },
];



