/**
 * ============================================
 * Policy: Rate Limiting
 * ============================================
 * 
 * Prevents spam and billing runaway by limiting:
 * - Messages per session/minute
 * - Actions per account/minute  
 * - Total cost per period
 */

import type { PolicyInput, PolicyCheckResult, AppliedPolicy, RateLimitConfig, RateLimitResult } from '../types';
import { supabase } from '@/lib/supabase';

const POLICY_ID = 'rate_limit';
const POLICY_NAME = 'Rate Limiting';

// Rate limit configurations
const RATE_LIMITS = {
  // Per session: 10 messages per minute
  sessionMessages: {
    windowSeconds: 60,
    maxRequests: 10,
  },
  // Per account: 100 messages per 5 minutes
  accountMessages: {
    windowSeconds: 300,
    maxRequests: 100,
  },
  // Per anon user (IP hash): 20 actions per 5 minutes
  anonActions: {
    windowSeconds: 300,
    maxRequests: 20,
  },
  // Actions (clicks, copies) per session: 30 per minute
  sessionActions: {
    windowSeconds: 60,
    maxRequests: 30,
  },
} as const;

// In-memory cache for rate limits (simple sliding window)
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit policy
 */
export async function checkRateLimit(input: PolicyInput): Promise<PolicyCheckResult> {
  const { ctx, security, decision } = input;
  
  const applied: AppliedPolicy = {
    id: POLICY_ID,
    name: POLICY_NAME,
    category: 'rate_limit',
    result: 'allow',
    appliedAt: new Date().toISOString(),
  };

  // Check session rate limit
  const sessionKey = `session:${ctx.session.id}`;
  const sessionLimit = checkMemoryRateLimit(sessionKey, RATE_LIMITS.sessionMessages);
  
  if (!sessionLimit.allowed) {
    return {
      allowed: false,
      blockedReason: `רגע, אתה שולח יותר מדי הודעות. נסה שוב בעוד ${sessionLimit.retryAfterSeconds} שניות`,
      blockedByRule: POLICY_ID,
      overrides: {
        handler: 'chat',
        forceResponseTemplate: 'rate_limit_exceeded',
        uiDirectives: {
          responseLength: 'short',
          showQuickActions: ['נסה שוב בעוד דקה'],
        },
      },
      appliedPolicies: [{ ...applied, result: 'block' }],
    };
  }

  // Check account rate limit
  const accountKey = `account:${ctx.account.id}`;
  const accountLimit = checkMemoryRateLimit(accountKey, RATE_LIMITS.accountMessages);
  
  if (!accountLimit.allowed) {
    return {
      allowed: false,
      blockedReason: 'הגעת למגבלת ההודעות. נסה שוב בעוד כמה דקות',
      blockedByRule: POLICY_ID,
      overrides: {
        handler: 'notification_only',
        forceResponseTemplate: 'account_rate_limit',
      },
      appliedPolicies: [{ ...applied, result: 'block' }],
    };
  }

  // Check anon user rate limit (based on anonId/IP)
  const anonKey = `anon:${ctx.user.anonId}`;
  const anonLimit = checkMemoryRateLimit(anonKey, RATE_LIMITS.anonActions);
  
  if (!anonLimit.allowed) {
    return {
      allowed: false,
      blockedReason: 'יותר מדי פעולות. נסה שוב בעוד כמה דקות',
      blockedByRule: POLICY_ID,
      appliedPolicies: [{ ...applied, result: 'block' }],
    };
  }

  // Check cost budget (if near limit, warn and downgrade model)
  const costRemaining = ctx.limits.costCeiling - ctx.limits.costUsed;
  const costRatio = ctx.limits.costUsed / ctx.limits.costCeiling;
  
  if (costRatio > 0.9) {
    // Over 90% - force nano model and short responses
    return {
      allowed: true,
      warnings: [{
        code: 'cost_budget_critical',
        message: `תקציב עלויות כמעט נגמר (${Math.round(costRatio * 100)}%)`,
        severity: 'high',
      }],
      overrides: {
        uiDirectives: {
          responseLength: 'short',
        },
      },
      appliedPolicies: [{ ...applied, result: 'override' }],
    };
  }
  
  if (costRatio > 0.75) {
    // Over 75% - warn
    return {
      allowed: true,
      warnings: [{
        code: 'cost_budget_warning',
        message: `תקציב עלויות מתקרב למגבלה (${Math.round(costRatio * 100)}%)`,
        severity: 'medium',
      }],
      appliedPolicies: [{ ...applied, result: 'warn' }],
    };
  }

  // Increment counters
  incrementRateLimit(sessionKey, RATE_LIMITS.sessionMessages);
  incrementRateLimit(accountKey, RATE_LIMITS.accountMessages);
  incrementRateLimit(anonKey, RATE_LIMITS.anonActions);

  return {
    allowed: true,
    appliedPolicies: [applied],
  };
}

/**
 * Check in-memory rate limit (sliding window)
 */
function checkMemoryRateLimit(
  key: string, 
  config: { windowSeconds: number; maxRequests: number }
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const entry = rateLimitCache.get(key);
  
  // If no entry or window expired, allow
  if (!entry || entry.resetAt < now) {
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: new Date(now + windowMs),
    };
  }
  
  // Check if over limit
  if (entry.count >= config.maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.resetAt),
      retryAfterSeconds,
    };
  }
  
  // Under limit
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count - 1,
    resetAt: new Date(entry.resetAt),
  };
}

/**
 * Increment rate limit counter
 */
function incrementRateLimit(
  key: string, 
  config: { windowSeconds: number; maxRequests: number }
): void {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const entry = rateLimitCache.get(key);
  
  if (!entry || entry.resetAt < now) {
    // Start new window
    rateLimitCache.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
  } else {
    // Increment existing
    entry.count++;
  }
}

/**
 * Check action rate limit (for tracking clicks, copies, etc.)
 */
export function checkActionRateLimit(
  sessionId: string,
  actionType: string
): RateLimitResult {
  const key = `action:${sessionId}:${actionType}`;
  return checkMemoryRateLimit(key, RATE_LIMITS.sessionActions);
}

/**
 * Increment action rate limit
 */
export function incrementActionRateLimit(
  sessionId: string,
  actionType: string
): void {
  const key = `action:${sessionId}:${actionType}`;
  incrementRateLimit(key, RATE_LIMITS.sessionActions);
}

/**
 * Cleanup old rate limit entries (call periodically)
 */
export function cleanupRateLimits(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of rateLimitCache.entries()) {
    if (entry.resetAt < now) {
      rateLimitCache.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

// Auto-cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

