/**
 * Cost Rules
 * Manage token budget and rate limits
 */

import type { Rule } from '../types';

export const costRules: Rule[] = [
  {
    id: 'cost_low_budget',
    name: 'Low token budget -> force nano + short',
    category: 'cost',
    priority: 40,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'ctx.limits.tokenBudgetRemaining', operator: 'lt', value: 5000 },
    ],
    actions: [
      { type: 'set_model', value: { model: 'nano', maxTokens: 160, fallback: 'nano' } },
      { type: 'set_ui', value: { responseLength: 'short' } },
    ],
  },

  {
    id: 'cost_very_low_budget',
    name: 'Very low budget -> minimal response',
    category: 'cost',
    priority: 39,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'ctx.limits.tokenBudgetRemaining', operator: 'lt', value: 1000 },
    ],
    actions: [
      { type: 'set_model', value: { model: 'nano', maxTokens: 80, fallback: 'nano' } },
      { type: 'set_ui', value: { responseLength: 'short' } },
      { type: 'set_action', value: 'clarify' }, // Prompt for simpler questions
    ],
  },

  {
    id: 'cost_rate_limited',
    name: 'Low rate limit -> short response',
    category: 'cost',
    priority: 41,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'ctx.limits.rateLimitRemaining', operator: 'lt', value: 10 },
    ],
    actions: [
      { type: 'set_model', value: { model: 'nano', maxTokens: 120 } },
      { type: 'set_ui', value: { responseLength: 'short' } },
    ],
  },

  {
    id: 'cost_budget_warning',
    name: 'Budget approaching limit -> optimize',
    category: 'cost',
    priority: 42,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'ctx.limits.costUsed', operator: 'gt', value: 80 }, // 80% of ceiling
    ],
    actions: [
      { type: 'set_model', value: { model: 'nano', maxTokens: 200 } },
    ],
  },
];



