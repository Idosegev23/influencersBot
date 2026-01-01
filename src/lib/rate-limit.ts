/**
 * ============================================
 * Rate Limiter (Redis + In-Memory Fallback)
 * ============================================
 * 
 * Scopes:
 * - per accountId (system-level)
 * - per anonId within accountId (user-level)
 * - per sessionId (session-level)
 * 
 * Buckets:
 * - chat: lower limits for streaming requests
 * - track: higher limits for analytics events
 */

import { redisSlidingWindowRateLimit, isRedisAvailable } from './redis';

// ============================================
// Types
// ============================================

export type RateLimitScope = 'account' | 'anon' | 'session';
export type RateLimitBucket = 'chat' | 'track' | 'admin';

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
  scope: RateLimitScope;
  bucket: RateLimitBucket;
  usedRedis: boolean;
}

export interface RateLimitContext {
  accountId: string;
  anonId?: string;
  sessionId?: string;
}

// ============================================
// Default Limits
// ============================================

const DEFAULT_LIMITS: Record<RateLimitBucket, Record<RateLimitScope, RateLimitConfig>> = {
  chat: {
    account: { limit: 120, windowMs: 60000 }, // 120 req/min per account
    anon: { limit: 30, windowMs: 60000 },     // 30 req/min per user
    session: { limit: 20, windowMs: 60000 },  // 20 req/min per session
  },
  track: {
    account: { limit: 500, windowMs: 60000 }, // 500 events/min per account
    anon: { limit: 100, windowMs: 60000 },    // 100 events/min per user
    session: { limit: 50, windowMs: 60000 },  // 50 events/min per session
  },
  admin: {
    account: { limit: 60, windowMs: 60000 },  // 60 req/min per account
    anon: { limit: 30, windowMs: 60000 },     // 30 req/min per user
    session: { limit: 20, windowMs: 60000 },  // 20 req/min per session
  },
};

// ============================================
// In-Memory Fallback (for local dev / Redis unavailable)
// ============================================

interface InMemoryEntry {
  count: number;
  windowStart: number;
}

const inMemoryLimits = new Map<string, InMemoryEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryLimits) {
    if (now - entry.windowStart > 120000) { // 2 minutes
      inMemoryLimits.delete(key);
    }
  }
}, 30000);

function checkInMemoryLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let entry = inMemoryLimits.get(key);
  
  // Reset if window expired
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now };
    inMemoryLimits.set(key, entry);
  }
  
  entry.count++;
  
  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);
  const resetAt = entry.windowStart + windowMs;
  const retryAfterMs = allowed ? 0 : resetAt - now;
  
  return {
    allowed,
    remaining,
    resetAt,
    retryAfterMs,
    scope: 'account',
    bucket: 'chat',
    usedRedis: false,
  };
}

// ============================================
// Main Functions
// ============================================

/**
 * Build rate limit key
 */
function buildKey(scope: RateLimitScope, bucket: RateLimitBucket, ctx: RateLimitContext): string {
  switch (scope) {
    case 'account':
      return `rl:${bucket}:account:${ctx.accountId}`;
    case 'anon':
      return `rl:${bucket}:anon:${ctx.accountId}:${ctx.anonId || 'na'}`;
    case 'session':
      return `rl:${bucket}:session:${ctx.sessionId || 'na'}`;
  }
}

/**
 * Check rate limit for a specific scope
 */
export async function checkRateLimit(
  scope: RateLimitScope,
  bucket: RateLimitBucket,
  ctx: RateLimitContext,
  customConfig?: RateLimitConfig
): Promise<RateLimitResult> {
  const config = customConfig || DEFAULT_LIMITS[bucket][scope];
  const key = buildKey(scope, bucket, ctx);
  const identifier = `${ctx.anonId || ctx.sessionId || 'req'}_${Date.now()}`;
  
  // Try Redis first
  if (isRedisAvailable()) {
    const result = await redisSlidingWindowRateLimit({
      key,
      limit: config.limit,
      windowMs: config.windowMs,
      identifier,
    });
    
    if (result) {
      return {
        ...result,
        scope,
        bucket,
        usedRedis: true,
      };
    }
  }
  
  // Fallback to in-memory
  const memResult = checkInMemoryLimit(key, config.limit, config.windowMs);
  return {
    ...memResult,
    scope,
    bucket,
    usedRedis: false,
  };
}

/**
 * Check all scopes for a bucket
 * Returns the most restrictive result
 */
export async function checkAllRateLimits(
  bucket: RateLimitBucket,
  ctx: RateLimitContext
): Promise<{
  allowed: boolean;
  results: RateLimitResult[];
  mostRestrictive: RateLimitResult | null;
}> {
  const scopes: RateLimitScope[] = ['account', 'anon', 'session'];
  const results: RateLimitResult[] = [];
  
  for (const scope of scopes) {
    // Skip if we don't have the required context
    if (scope === 'anon' && !ctx.anonId) continue;
    if (scope === 'session' && !ctx.sessionId) continue;
    
    const result = await checkRateLimit(scope, bucket, ctx);
    results.push(result);
  }
  
  // Find most restrictive (lowest remaining or not allowed)
  const blocked = results.filter(r => !r.allowed);
  if (blocked.length > 0) {
    // Return the one with longest retry
    const mostRestrictive = blocked.reduce((a, b) => 
      a.retryAfterMs > b.retryAfterMs ? a : b
    );
    return { allowed: false, results, mostRestrictive };
  }
  
  // All allowed, return the one with lowest remaining
  const mostRestrictive = results.reduce((a, b) => 
    a.remaining < b.remaining ? a : b
  );
  
  return { allowed: true, results, mostRestrictive };
}

/**
 * Build rate limit headers for response
 */
export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.remaining.toString(),
    'X-RateLimit-Remaining': Math.max(0, result.remaining).toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
    'X-RateLimit-Scope': result.scope,
    ...(result.retryAfterMs > 0 ? {
      'Retry-After': Math.ceil(result.retryAfterMs / 1000).toString(),
    } : {}),
  };
}

/**
 * Get current limits config
 */
export function getRateLimitsConfig(bucket: RateLimitBucket): Record<RateLimitScope, RateLimitConfig> {
  return DEFAULT_LIMITS[bucket];
}
