/**
 * ============================================
 * Policy: No Public Order Details
 * ============================================
 * 
 * Prevents public chat from collecting or displaying
 * sensitive order information (full order numbers, phone numbers).
 */

import type { PolicyInput, PolicyCheckResult, AppliedPolicy, PolicyOverrides } from '../types';

const POLICY_ID = 'no_public_order_details';
const POLICY_NAME = 'No Public Order Details';

/**
 * Check public order details policy
 * 
 * Rules:
 * 1. Public chat cannot request full order numbers
 * 2. Public chat cannot request phone numbers
 * 3. Public chat cannot display order history
 * 4. Alternative: redirect to private support flow
 */
export function checkPublicOrderDetails(input: PolicyInput): PolicyCheckResult {
  const { decision, security, understanding } = input;
  const { channel } = security;
  
  const applied: AppliedPolicy = {
    id: POLICY_ID,
    name: POLICY_NAME,
    category: 'privacy',
    result: 'allow',
    appliedAt: new Date().toISOString(),
  };

  // Only applies to public chat
  if (channel !== 'public_chat') {
    return {
      allowed: true,
      appliedPolicies: [applied],
    };
  }

  const issues: string[] = [];
  const overrides: PolicyOverrides = {};
  
  // Check if decision wants to collect order number
  if (decision.uiDirectives.showForm === 'order') {
    issues.push('order_form_blocked');
    overrides.uiDirectives = {
      ...overrides.uiDirectives,
      showForm: undefined,
      showQuickActions: [
        'אשלח פרטים בפרטי',
        'צריך עזרה אחרת',
      ],
    };
  }

  // Check if decision wants to collect phone
  if (decision.uiDirectives.showForm === 'phone') {
    issues.push('phone_form_blocked');
    overrides.uiDirectives = {
      ...overrides.uiDirectives,
      showForm: undefined,
      showQuickActions: [
        'אשלח טלפון בוואטסאפ',
        'צריך עזרה אחרת',
      ],
    };
  }

  // Check if understanding detected PII in user message
  if (understanding.piiDetectedPaths.length > 0) {
    issues.push('pii_in_message');
    // Add redaction for phone numbers in response
    overrides.forceShortResponse = true;
  }

  // Check if context includes order details
  if (decision.contextToInclude.includes('orderDetails')) {
    issues.push('order_context_blocked');
    overrides.removeFromContext = [
      ...(overrides.removeFromContext || []),
      'orderDetails',
      'orderHistory',
      'customerPhone',
    ];
  }

  // If support intent in public, redirect to private flow
  if (understanding.intent === 'support' && decision.handler === 'support_flow') {
    // Allow but modify to not collect sensitive data publicly
    overrides.uiDirectives = {
      ...overrides.uiDirectives,
      showQuickActions: [
        'פנייה דרך וואטסאפ',
        'פנייה דרך מייל',
        'להמשיך בצ\'אט (ללא פרטי הזמנה)',
      ],
      showForm: undefined, // Don't show order/phone forms in public
      showProgress: undefined, // Don't show support flow progress
    };
    issues.push('support_flow_public_limited');
  }

  // If any issues found, return with overrides
  if (issues.length > 0) {
    return {
      allowed: true, // Allow but with overrides
      warnings: issues.map(issue => ({
        code: issue,
        message: `Blocked public collection of sensitive data: ${issue}`,
        severity: 'medium' as const,
      })),
      overrides,
      appliedPolicies: [{ ...applied, result: 'override' }],
    };
  }

  return {
    allowed: true,
    appliedPolicies: [applied],
  };
}

/**
 * Mask order number for public display
 * Example: 12345678 → ****5678
 */
export function maskOrderNumber(orderNumber: string): string {
  if (orderNumber.length <= 4) return '****';
  return '****' + orderNumber.slice(-4);
}

/**
 * Mask phone number for public display
 * Example: 0541234567 → 054***4567
 */
export function maskPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 7) return '***';
  return cleaned.slice(0, 3) + '***' + cleaned.slice(-4);
}

