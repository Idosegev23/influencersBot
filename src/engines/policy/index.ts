/**
 * ============================================
 * Policy Engine v1
 * ============================================
 * 
 * The Policy Engine runs AFTER Decision Engine, BEFORE Action execution.
 * It enforces:
 * - Security levels (public/authenticated/owner_only)
 * - Privacy rules (no public PII collection)
 * - Rate limits (per session/account/action)
 * - Cost controls
 * 
 * Order of execution:
 * 1. ContextBuilder → 2. Understanding → 3. Decision → 4. POLICY → 5. Action
 */

import type { 
  PolicyInput, 
  PolicyCheckResult, 
  AppliedPolicy, 
  PolicyOverrides,
  PolicyWarning,
  SecurityContext,
  AuthContext,
} from './types';
import type { EngineContext } from '../context';
import type { UnderstandingResult } from '../understanding/types';
import type { DecisionResult, UIDirectives } from '../decision/types';

import { checkSecurityLevel } from './policies/security-level';
import { checkPublicOrderDetails } from './policies/public-order-details';
import { checkRateLimit } from './policies/rate-limit';

// Re-export types
export * from './types';

// Re-export utilities
export { maskOrderNumber, maskPhoneNumber } from './policies/public-order-details';
export { checkActionRateLimit, incrementActionRateLimit, cleanupRateLimits } from './policies/rate-limit';

/**
 * Main policy check function
 * 
 * Runs all policies in order and returns combined result
 */
export async function checkPolicies(input: PolicyInput): Promise<PolicyCheckResult> {
  const allApplied: AppliedPolicy[] = [];
  const allWarnings: PolicyWarning[] = [];
  let combinedOverrides: PolicyOverrides = {};
  
  // 1. Check security level (blocking)
  const securityResult = checkSecurityLevel(input);
  allApplied.push(...securityResult.appliedPolicies);
  
  if (!securityResult.allowed) {
    return {
      allowed: false,
      blockedReason: securityResult.blockedReason,
      blockedByRule: securityResult.blockedByRule,
      overrides: securityResult.overrides,
      appliedPolicies: allApplied,
    };
  }
  
  if (securityResult.warnings) {
    allWarnings.push(...securityResult.warnings);
  }
  if (securityResult.overrides) {
    combinedOverrides = mergeOverrides(combinedOverrides, securityResult.overrides);
  }

  // 2. Check public order details (overriding)
  const orderDetailsResult = checkPublicOrderDetails(input);
  allApplied.push(...orderDetailsResult.appliedPolicies);
  
  if (orderDetailsResult.warnings) {
    allWarnings.push(...orderDetailsResult.warnings);
  }
  if (orderDetailsResult.overrides) {
    combinedOverrides = mergeOverrides(combinedOverrides, orderDetailsResult.overrides);
  }

  // 3. Check rate limits (blocking)
  const rateLimitResult = await checkRateLimit(input);
  allApplied.push(...rateLimitResult.appliedPolicies);
  
  if (!rateLimitResult.allowed) {
    return {
      allowed: false,
      blockedReason: rateLimitResult.blockedReason,
      blockedByRule: rateLimitResult.blockedByRule,
      overrides: rateLimitResult.overrides,
      warnings: allWarnings,
      appliedPolicies: allApplied,
    };
  }
  
  if (rateLimitResult.warnings) {
    allWarnings.push(...rateLimitResult.warnings);
  }
  if (rateLimitResult.overrides) {
    combinedOverrides = mergeOverrides(combinedOverrides, rateLimitResult.overrides);
  }

  // All policies passed
  return {
    allowed: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    overrides: Object.keys(combinedOverrides).length > 0 ? combinedOverrides : undefined,
    appliedPolicies: allApplied,
  };
}

/**
 * Apply policy overrides to decision
 */
export function applyPolicyOverrides(
  decision: DecisionResult,
  overrides: PolicyOverrides
): DecisionResult {
  const updated = { ...decision };
  
  if (overrides.handler) {
    updated.handler = overrides.handler;
  }
  
  if (overrides.securityLevel) {
    updated.securityLevel = overrides.securityLevel;
  }
  
  if (overrides.uiDirectives) {
    updated.uiDirectives = {
      ...updated.uiDirectives,
      ...overrides.uiDirectives,
    };
  }
  
  if (overrides.removeFromContext) {
    updated.contextToInclude = updated.contextToInclude.filter(
      c => !overrides.removeFromContext?.includes(c)
    );
  }
  
  if (overrides.forceShortResponse) {
    updated.uiDirectives = {
      ...updated.uiDirectives,
      responseLength: 'short',
    };
  }
  
  return updated;
}

/**
 * Build security context from request
 */
export function buildSecurityContext(
  ctx: EngineContext,
  requestHeaders?: Record<string, string>
): SecurityContext {
  // Determine channel
  const channel = determineChannel(ctx.request.source);
  
  // Build auth context (default: public anonymous)
  const auth: AuthContext = {
    isAuthenticated: false,
    isOwner: false,
  };
  
  // TODO: Extract from session/JWT when auth is implemented
  // For now, dashboard access = owner
  if (channel === 'dashboard') {
    auth.isAuthenticated = true;
    auth.isOwner = true;
    auth.role = 'owner';
  }
  
  return {
    channel,
    auth,
    ipHash: requestHeaders?.['x-forwarded-for']?.split(',')[0]?.trim(),
    userAgent: requestHeaders?.['user-agent'],
    consents: {
      allowEscalationToHuman: true,  // Default true
      allowWhatsapp: true,           // Default true
      allowEmail: false,             // Require explicit consent
    },
  };
}

/**
 * Determine channel from request source
 */
function determineChannel(
  source: 'chat' | 'api' | 'webhook' | 'cron'
): 'public_chat' | 'dashboard' | 'api' | 'webhook' {
  switch (source) {
    case 'chat':
      return 'public_chat';
    case 'api':
      return 'api';
    case 'webhook':
      return 'webhook';
    case 'cron':
      return 'api';
    default:
      return 'public_chat';
  }
}

/**
 * Merge policy overrides
 */
function mergeOverrides(
  base: PolicyOverrides,
  override: PolicyOverrides
): PolicyOverrides {
  return {
    ...base,
    ...override,
    uiDirectives: {
      ...base.uiDirectives,
      ...override.uiDirectives,
    },
    removeFromContext: [
      ...(base.removeFromContext || []),
      ...(override.removeFromContext || []),
    ],
  };
}

/**
 * Get policy summary for logging
 */
export function getPolicySummary(result: PolicyCheckResult): string {
  const parts: string[] = [];
  
  parts.push(result.allowed ? 'allowed' : 'blocked');
  
  if (result.blockedByRule) {
    parts.push(`by:${result.blockedByRule}`);
  }
  
  if (result.warnings?.length) {
    parts.push(`warnings:${result.warnings.length}`);
  }
  
  if (result.overrides && Object.keys(result.overrides).length > 0) {
    parts.push(`overrides:${Object.keys(result.overrides).join(',')}`);
  }
  
  parts.push(`policies:${result.appliedPolicies.length}`);
  
  return parts.join(' ');
}



