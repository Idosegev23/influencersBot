/**
 * Routing Rules
 * Route intents to appropriate handlers with UI directives
 */

import type { Rule } from '../types';

export const routingRules: Rule[] = [
  {
    id: 'routing_coupon',
    name: 'Coupon intent routes to chat + brand cards',
    category: 'routing',
    priority: 10,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.intent', operator: 'eq', value: 'coupon' },
    ],
    actions: [
      { type: 'set_action', value: 'respond' },
      { type: 'set_handler', value: 'chat' },
      {
        type: 'set_ui',
        value: {
          showCardList: 'brands',
          showQuickActions: ['העתק קופון', 'פתח אתר', 'בעיה בקופון'],
          responseLength: 'short',
          layout: 'cards_first',
        },
      },
      { type: 'append_context', value: ['brands', 'coupon_policy', 'persona'] },
      { type: 'set_model', value: { model: 'nano', maxTokens: 220, fallback: 'standard' } },
    ],
  },

  {
    id: 'routing_support',
    name: 'Support intent routes to support flow',
    category: 'routing',
    priority: 11,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.intent', operator: 'eq', value: 'support' },
    ],
    actions: [
      { type: 'set_action', value: 'respond' },
      { type: 'set_handler', value: 'support_flow' },
      {
        type: 'transition_state',
        to: 'Support.CollectBrand',
        reason: 'support_flow_start',
      },
      {
        type: 'set_ui',
        value: {
          // NO showCardList - don't show coupons/brands for support!
          showProgress: { current: 1, total: 5, label: 'פותחים פנייה' },
          responseLength: 'short', // Keep it brief - we're starting support flow
          tone: 'empathetic',
          layout: 'chat', // Simple chat layout, not cards
          showQuickActions: [], // Will be set by support flow logic
        },
      },
      { type: 'set_model', value: { model: 'nano', maxTokens: 180, fallback: 'standard' } },
      { type: 'append_context', value: ['brands', 'support_policy', 'persona'] },
    ],
  },

  {
    id: 'routing_sales',
    name: 'Sales intent routes to sales flow',
    category: 'routing',
    priority: 12,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.intent', operator: 'eq', value: 'sales' },
    ],
    actions: [
      { type: 'set_action', value: 'respond' },
      { type: 'set_handler', value: 'sales_flow' },
      {
        type: 'set_ui',
        value: {
          showCardList: 'products',
          showQuickActions: ['מחירים', 'מבצעים', 'המלצה אישית'],
          responseLength: 'standard',
          layout: 'cards_first',
        },
      },
      { type: 'set_model', value: { model: 'standard', maxTokens: 350, fallback: 'standard' } },
      { type: 'append_context', value: ['products', 'brands', 'pricing', 'persona'] },
    ],
  },

  {
    id: 'routing_general',
    name: 'General intent routes to chat',
    category: 'routing',
    priority: 15,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.intent', operator: 'eq', value: 'general' },
    ],
    actions: [
      { type: 'set_action', value: 'respond' },
      { type: 'set_handler', value: 'chat' },
      {
        type: 'set_ui',
        value: {
          showQuickActions: ['קופונים', 'המלצות', 'בעיה בהזמנה'],
          responseLength: 'standard',
          layout: 'chat',
        },
      },
      { type: 'set_model', value: { model: 'nano', maxTokens: 300, fallback: 'standard' } },
      { type: 'append_context', value: ['persona', 'content'] },
    ],
  },

  {
    id: 'routing_content_request',
    name: 'Content request shows content cards',
    category: 'routing',
    priority: 13,
    mode: 'creator',
    enabled: true,
    conditions: [
      { field: 'understanding.topic', operator: 'matches', value: 'recipe|content|tip|מתכון' },
    ],
    actions: [
      { type: 'set_action', value: 'respond' },
      { type: 'set_handler', value: 'chat' },
      {
        type: 'set_ui',
        value: {
          showCardList: 'content',
          responseLength: 'standard',
          layout: 'chat',
        },
      },
      { type: 'append_context', value: ['content', 'persona'] },
    ],
  },
];



