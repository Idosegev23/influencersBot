/**
 * ============================================
 * Redis Client + Helpers
 * ============================================
 * 
 * Uses Upstash Redis for serverless compatibility.
 * Falls back gracefully if Redis is unavailable.
 */

import { Redis } from '@upstash/redis';

// ============================================
// Client Singleton
// ============================================

let redisClient: Redis | null = null;
let redisAvailable = true;

function getClient(): Redis | null {
  if (!redisAvailable) return null;
  
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
      console.warn('[Redis] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN - Redis disabled');
      redisAvailable = false;
      return null;
    }
    
    try {
      redisClient = new Redis({ url, token });
    } catch (err) {
      console.error('[Redis] Failed to create client:', err);
      redisAvailable = false;
      return null;
    }
  }
  
  return redisClient;
}

// ============================================
// Basic Operations
// ============================================

export async function redisGet<T>(key: string): Promise<T | null> {
  const client = getClient();
  if (!client) return null;
  
  try {
    const result = await client.get<T>(key);
    return result;
  } catch (err) {
    console.error('[Redis] GET error:', err);
    return null;
  }
}

export async function redisSet(
  key: string, 
  value: unknown, 
  ttlSeconds?: number
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  
  try {
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, JSON.stringify(value));
    } else {
      await client.set(key, JSON.stringify(value));
    }
    return true;
  } catch (err) {
    console.error('[Redis] SET error:', err);
    return false;
  }
}

export async function redisDel(...keys: string[]): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  
  try {
    const result = await client.del(...keys);
    return result;
  } catch (err) {
    console.error('[Redis] DEL error:', err);
    return 0;
  }
}

export async function redisExists(key: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  
  try {
    const result = await client.exists(key);
    return result === 1;
  } catch (err) {
    console.error('[Redis] EXISTS error:', err);
    return false;
  }
}

// ============================================
// TTL Operations
// ============================================

export async function redisTtl(key: string): Promise<number> {
  const client = getClient();
  if (!client) return -2;
  
  try {
    return await client.ttl(key);
  } catch (err) {
    console.error('[Redis] TTL error:', err);
    return -2;
  }
}

export async function redisExpire(key: string, ttlSeconds: number): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  
  try {
    const result = await client.expire(key, ttlSeconds);
    return result === 1;
  } catch (err) {
    console.error('[Redis] EXPIRE error:', err);
    return false;
  }
}

// ============================================
// Atomic Operations (for rate limiting)
// ============================================

export async function redisIncr(key: string): Promise<number | null> {
  const client = getClient();
  if (!client) return null;
  
  try {
    return await client.incr(key);
  } catch (err) {
    console.error('[Redis] INCR error:', err);
    return null;
  }
}

export async function redisIncrBy(key: string, increment: number): Promise<number | null> {
  const client = getClient();
  if (!client) return null;
  
  try {
    return await client.incrby(key, increment);
  } catch (err) {
    console.error('[Redis] INCRBY error:', err);
    return null;
  }
}

// ============================================
// Sliding Window Rate Limit (Lua Script)
// ============================================

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Returns { allowed, remaining, resetAt, retryAfterMs }
 */
export async function redisSlidingWindowRateLimit(args: {
  key: string;
  limit: number;
  windowMs: number;
  identifier: string; // unique ID for this request
}): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
} | null> {
  const client = getClient();
  if (!client) return null;
  
  const { key, limit, windowMs, identifier } = args;
  const now = Date.now();
  const windowStart = now - windowMs;
  
  try {
    // Use pipeline for atomic operation
    const pipeline = client.pipeline();
    
    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Count current entries in window
    pipeline.zcard(key);
    
    // Add this request
    pipeline.zadd(key, { score: now, member: `${identifier}:${now}` });
    
    // Set TTL on the key
    pipeline.expire(key, Math.ceil(windowMs / 1000) + 1);
    
    const results = await pipeline.exec();
    
    // Get current count (before adding this request)
    const currentCount = (results[1] as number) || 0;
    const allowed = currentCount < limit;
    const remaining = Math.max(0, limit - currentCount - 1);
    const resetAt = now + windowMs;
    
    // If not allowed, calculate retry time
    let retryAfterMs = 0;
    if (!allowed) {
      // Get oldest entry in window
      const oldest = await client.zrange(key, 0, 0, { withScores: true });
      if (oldest.length > 0) {
        const oldestTime = oldest[0].score as number;
        retryAfterMs = Math.max(0, oldestTime + windowMs - now);
      }
    }
    
    return { allowed, remaining, resetAt, retryAfterMs };
  } catch (err) {
    console.error('[Redis] Rate limit error:', err);
    return null;
  }
}

// ============================================
// Batch Operations (for invalidation)
// ============================================

export async function redisDelByPattern(pattern: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  
  try {
    // Get all keys matching pattern
    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;
    
    // Delete all matching keys
    const result = await client.del(...keys);
    return result;
  } catch (err) {
    console.error('[Redis] DEL pattern error:', err);
    return 0;
  }
}

// ============================================
// Health Check
// ============================================

export async function redisHealthCheck(): Promise<{
  available: boolean;
  latencyMs: number;
  error?: string;
}> {
  const client = getClient();
  if (!client) {
    return { available: false, latencyMs: 0, error: 'Client not initialized' };
  }
  
  const start = Date.now();
  try {
    await client.ping();
    return { available: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { 
      available: false, 
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============================================
// Status
// ============================================

export function isRedisAvailable(): boolean {
  return redisAvailable && !!getClient();
}

