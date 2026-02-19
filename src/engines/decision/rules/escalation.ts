/**
 * Escalation Rules
 * Handle low confidence, human requests, and abuse
 */

import type { Rule } from '../types';

export const escalationRules: Rule[] = [
  {
    id: 'escalation_low_confidence',
    name: 'Low confidence -> clarify with quick actions',
    category: 'escalation',
    priority: 20,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.confidence', operator: 'lt', value: 0.45 },
    ],
    actions: [
      { type: 'set_action', value: 'clarify' },
      { type: 'set_handler', value: 'chat' },
      {
        type: 'set_ui',
        value: {
          showQuickActions: [],
          responseLength: 'short',
          tone: 'professional',
          layout: 'chat',
        },
      },
      { type: 'set_model', value: { model: 'nano', maxTokens: 180, fallback: 'standard' } },
      { type: 'append_context', value: ['suggestedClarifications', 'persona'] },
    ],
  },

  {
    id: 'escalation_requires_human',
    name: 'Requires human -> handoff',
    category: 'escalation',
    priority: 21,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.requiresHuman', operator: 'eq', value: true },
    ],
    actions: [
      { type: 'set_action', value: 'escalate' },
      { type: 'set_handler', value: 'human' },
      {
        type: 'set_ui',
        value: {
          responseLength: 'short',
          tone: 'empathetic',
          showQuickActions: [],
        },
      },
      { type: 'set_model', value: { model: 'nano', maxTokens: 140 } },
    ],
  },

  {
    id: 'escalation_handoff_intent',
    name: 'Handoff intent -> notify human',
    category: 'escalation',
    priority: 22,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.intent', operator: 'eq', value: 'handoff_human' },
    ],
    actions: [
      { type: 'set_action', value: 'escalate' },
      { type: 'set_handler', value: 'human' },
      {
        type: 'set_ui',
        value: {
          responseLength: 'short',
          tone: 'empathetic',
        },
      },
      { type: 'set_model', value: { model: 'nano', maxTokens: 120 } },
    ],
  },

  {
    id: 'escalation_abuse',
    name: 'Abuse detected -> block and notify',
    category: 'escalation',
    priority: 5, // High priority - check early
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.intent', operator: 'eq', value: 'abuse' },
    ],
    actions: [
      { type: 'set_action', value: 'notify' },
      { type: 'set_handler', value: 'notification_only' },
      { type: 'set_security_level', value: 'owner_only' },
      {
        type: 'set_ui',
        value: {
          responseLength: 'short',
          tone: 'professional',
        },
      },
      { type: 'set_model', value: { model: 'nano', maxTokens: 80 } },
    ],
  },

  {
    id: 'escalation_high_urgency',
    name: 'High urgency -> prioritize response',
    category: 'escalation',
    priority: 23,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.urgency', operator: 'eq', value: 'critical' },
    ],
    actions: [
      {
        type: 'set_ui',
        value: {
          tone: 'empathetic',
          responseLength: 'standard',
        },
      },
      { type: 'set_model', value: { model: 'standard', maxTokens: 350 } },
    ],
  },
];



