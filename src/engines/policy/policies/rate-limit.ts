/**
 * ============================================
 * Policy: Rate Limiting (Redis + Fallback)
 * ============================================
 * 
 * Uses Redis for distributed rate limiting across instances.
 * Falls back to in-memory when Redis unavailable.
 * 
 * Scopes:
 * - per accountId (system-level)
 * - per anonId within accountId (user-level)
 * - per sessionId (session-level)
 */

import type { PolicyInput, PolicyCheckResult, AppliedPolicy, RateLimitResult as PolicyRateLimitResult } from '../types';
import { 
  checkAllRateLimits, 
  checkRateLimit as checkRedisRateLimit,
  type RateLimitContext,
  type RateLimitResult,
  type RateLimitBucket,
  type RateLimitScope,
} from '@/lib/rate-limit';
import { emitEvent } from '@/engines/events-emitter';

const POLICY_ID = 'rate_limit';
const POLICY_NAME = 'Rate Limiting';

// In-memory fallback cache
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit policy using Redis with in-memory fallback
 */
export async function checkRateLimit(input: PolicyInput): Promise<PolicyCheckResult> {
  const { ctx, traceId, requestId } = input;
  
  const applied: AppliedPolicy = {
    id: POLICY_ID,
    name: POLICY_NAME,
    category: 'rate_limit',
    result: 'allow',
    appliedAt: new Date().toISOString(),
  };

  // Build context for rate limiter
  const rateLimitCtx: RateLimitContext = {
    accountId: ctx.account.id,
    anonId: ctx.user.anonId,
    sessionId: ctx.session.id,
  };

  // Check all scopes using Redis-based rate limiter
  const { allowed, results, mostRestrictive } = await checkAllRateLimits('chat', rateLimitCtx);

  if (!allowed && mostRestrictive) {
    const retryAfterSeconds = Math.ceil(mostRestrictive.retryAfterMs / 1000);
    
    // Emit rate limit hit event
    await emitEvent({
      type: 'policy_checked',
      accountId: ctx.account.id,
      sessionId: ctx.session.id,
      mode: ctx.account.mode,
      payload: {
        policy: POLICY_ID,
        result: 'block',
        scope: mostRestrictive.scope,
        bucket: mostRestrictive.bucket,
        retryAfterMs: mostRestrictive.retryAfterMs,
        usedRedis: mostRestrictive.usedRedis,
      },
      metadata: {
        source: 'policy',
        engineVersion: 'v2',
        traceId,
        requestId,
      },
    });

    // Return blocked response based on scope
    const messageMap: Record<RateLimitScope, string> = {
      session: `רגע, אתה שולח יותר מדי הודעות. נסה שוב בעוד ${retryAfterSeconds} שניות`,
      anon: 'יותר מדי פעולות. נסה שוב בעוד כמה דקות',
      account: 'הגעת למגבלת ההודעות. נסה שוב בעוד כמה דקות',
    };

    return {
      allowed: false,
      blockedReason: messageMap[mostRestrictive.scope],
      blockedByRule: POLICY_ID,
      overrides: {
        handler: mostRestrictive.scope === 'account' ? 'notification_only' : 'chat',
        forceResponseTemplate: 'rate_limit_exceeded',
        uiDirectives: {
          responseLength: 'short',
          showQuickActions: retryAfterSeconds < 60 
            ? [`נסה שוב בעוד ${retryAfterSeconds} שניות`]
            : ['נסה שוב בעוד כמה דקות'],
        },
      },
      appliedPolicies: [{ ...applied, result: 'block' }],
    };
  }

  // Check cost budget (if near limit, warn and downgrade model)
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

  // Add rate limit metrics to applied policy
  applied.metadata = {
    scopes: results.map(r => ({
      scope: r.scope,
      remaining: r.remaining,
      usedRedis: r.usedRedis,
    })),
  };

  return {
    allowed: true,
    appliedPolicies: [applied],
  };
}

/**
 * Check action rate limit (for tracking clicks, copies, etc.)
 */
export async function checkActionRateLimit(
  accountId: string,
  sessionId: string,
  anonId: string,
  actionType: string
): Promise<PolicyRateLimitResult> {
  const ctx: RateLimitContext = { accountId, anonId, sessionId };
  const result = await checkRedisRateLimit('session', 'track', ctx);
  
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetAt: new Date(result.resetAt),
    retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
  };
}

/**
 * Increment action rate limit (for compatibility)
 * Note: Redis rate limiter auto-increments on check
 */
export async function incrementActionRateLimit(
  accountId: string,
  sessionId: string,
  anonId: string,
  actionType: string
): Promise<void> {
  // Redis rate limiter auto-increments, so this is a no-op
  // Keeping for API compatibility
}

/**
 * Cleanup old rate limit entries (for in-memory fallback)
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
