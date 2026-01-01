/**
 * Security Rules
 * Handle privacy risks, PII, and access control
 */

import type { Rule } from '../types';

export const securityRules: Rule[] = [
  {
    id: 'security_privacy_risk',
    name: 'Privacy risk -> elevate security level',
    category: 'security',
    priority: 30,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.risk.privacy', operator: 'eq', value: true },
    ],
    actions: [
      { type: 'set_security_level', value: 'authenticated' },
      { type: 'append_context', value: ['privacy_notice'] },
    ],
  },

  {
    id: 'security_harassment',
    name: 'Harassment risk -> owner only',
    category: 'security',
    priority: 29,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.risk.harassment', operator: 'eq', value: true },
    ],
    actions: [
      { type: 'set_security_level', value: 'owner_only' },
      { type: 'set_action', value: 'notify' },
    ],
  },

  {
    id: 'security_order_details',
    name: 'Order number detected -> require auth',
    category: 'security',
    priority: 31,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.entities.orderNumbers', operator: 'exists', value: true },
    ],
    actions: [
      { type: 'set_security_level', value: 'authenticated' },
    ],
  },

  {
    id: 'security_phone_detected',
    name: 'Phone number detected -> flag for redaction',
    category: 'security',
    priority: 32,
    mode: 'both',
    enabled: true,
    conditions: [
      { field: 'understanding.entities.phoneNumbers', operator: 'exists', value: true },
    ],
    actions: [
      { type: 'set_security_level', value: 'authenticated' },
      { type: 'append_context', value: ['pii_handling'] },
    ],
  },
];

