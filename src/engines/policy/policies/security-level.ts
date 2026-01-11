/**
 * ============================================
 * Policy: Security Level Enforcement
 * ============================================
 * 
 * Ensures that actions requiring higher security levels
 * are only allowed for authenticated/authorized users.
 */

import type { PolicyInput, PolicyCheckResult, AppliedPolicy, PolicyOverrides } from '../types';

const POLICY_ID = 'security_level';
const POLICY_NAME = 'Security Level Enforcement';

/**
 * Check security level policy
 * 
 * Rules:
 * 1. owner_only → requires isOwner
 * 2. authenticated → requires isAuthenticated
 * 3. public → anyone
 */
export function checkSecurityLevel(input: PolicyInput): PolicyCheckResult {
  const { decision, security } = input;
  const { auth } = security;
  const requiredLevel = decision.securityLevel;
  
  const applied: AppliedPolicy = {
    id: POLICY_ID,
    name: POLICY_NAME,
    category: 'security',
    result: 'allow',
    appliedAt: new Date().toISOString(),
  };

  // Public - always allowed
  if (requiredLevel === 'public') {
    return {
      allowed: true,
      appliedPolicies: [{ ...applied, result: 'allow' }],
    };
  }

  // Owner only - requires owner role
  if (requiredLevel === 'owner_only') {
    if (!auth.isOwner) {
      return {
        allowed: false,
        blockedReason: 'פעולה זו דורשת התחברות כבעל החשבון',
        blockedByRule: POLICY_ID,
        appliedPolicies: [{ ...applied, result: 'block' }],
        overrides: buildDowngradeOverrides('auth_required'),
      };
    }
    return {
      allowed: true,
      appliedPolicies: [{ ...applied, result: 'allow' }],
    };
  }

  // Authenticated - requires any auth
  if (requiredLevel === 'authenticated') {
    if (!auth.isAuthenticated) {
      // Downgrade to public with warning
      const overrides: PolicyOverrides = {
        securityLevel: 'public',
        removeFromContext: ['orderDetails', 'supportHistory', 'privateNotes'],
        uiDirectives: {
          showQuickActions: ['התחבר לצפייה בפרטים נוספים'],
        },
      };
      
      return {
        allowed: true, // Allow but downgrade
        warnings: [{
          code: 'auth_downgrade',
          message: 'תוכן מוגבל - נדרשת התחברות לצפייה בפרטים נוספים',
          severity: 'medium',
        }],
        overrides,
        appliedPolicies: [{ ...applied, result: 'override' }],
      };
    }
    return {
      allowed: true,
      appliedPolicies: [{ ...applied, result: 'allow' }],
    };
  }

  // Unknown level - allow but warn
  return {
    allowed: true,
    warnings: [{
      code: 'unknown_security_level',
      message: `Unknown security level: ${requiredLevel}`,
      severity: 'low',
    }],
    appliedPolicies: [{ ...applied, result: 'warn' }],
  };
}

/**
 * Build overrides for blocked action
 */
function buildDowngradeOverrides(template: string): PolicyOverrides {
  return {
    handler: 'chat',
    securityLevel: 'public',
    forceResponseTemplate: template,
    removeFromContext: ['orderDetails', 'supportHistory', 'privateNotes', 'customerPhone'],
    uiDirectives: {
      showQuickActions: ['התחבר לדשבורד', 'חזרה לצ\'אט'],
      showForm: undefined,
      showCardList: undefined,
    },
  };
}



