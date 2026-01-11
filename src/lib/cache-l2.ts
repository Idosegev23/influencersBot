/**
 * ============================================
 * L2 Cache (Redis-backed)
 * ============================================
 * 
 * Two-layer caching:
 * - L1: In-memory LRU (fast, per-instance)
 * - L2: Redis (shared across instances)
 * 
 * Fallback chain: L1 -> L2 -> DB
 */

import { cacheGet, cacheSet, cacheDel, type CacheOptions } from './cache';
import { redisGet, redisSet, redisDel, redisDelByPattern, isRedisAvailable } from './redis';

// ============================================
// Types
// ============================================

interface L2CacheEntry<T> {
  value: T;
  cachedAt: number;
  ttlMs: number;
  version?: string;
  source: 'db' | 'redis';
}

interface L2CacheOptions extends CacheOptions {
  version?: string;
  skipL1?: boolean;
  skipL2?: boolean;
}

interface L2Metrics {
  l1Hit: boolean;
  l2Hit: boolean;
  source: 'l1' | 'l2' | 'db';
  latencyMs: number;
}

// ============================================
// Cache Keys (Account-scoped)
// ============================================

export const L2_KEYS = {
  username: (username: string) => `l2:username:${username}`,
  accountStable: (accountId: string) => `l2:account:${accountId}:stable`,
  accountBrands: (accountId: string) => `l2:account:${accountId}:brands`,
  accountRules: (accountId: string) => `l2:account:${accountId}:rules`,
  accountExperiments: (accountId: string) => `l2:account:${accountId}:experiments`,
  accountContent: (accountId: string) => `l2:account:${accountId}:content:index`,
  persona: (profileId: string) => `l2:persona:${profileId}`,
} as const;

// ============================================
// Default TTLs (in seconds)
// ============================================

export const L2_TTL = {
  username: 300, // 5 minutes
  accountStable: 300, // 5 minutes
  accountBrands: 60, // 1 minute
  accountRules: 120, // 2 minutes
  accountExperiments: 120, // 2 minutes
  accountContent: 120, // 2 minutes
  persona: 300, // 5 minutes
} as const;

// ============================================
// Core Functions
// ============================================

/**
 * Get from L1 -> L2 -> fetcher (DB)
 * Writes back to both layers
 */
export async function l2CacheWrap<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: L2CacheOptions = {}
): Promise<{ value: T; metrics: L2Metrics }> {
  const start = Date.now();
  
  // Try L1 (in-memory)
  if (!options.skipL1) {
    const l1Value = cacheGet<T>(key);
    if (l1Value !== undefined) {
      return {
        value: l1Value,
        metrics: { l1Hit: true, l2Hit: false, source: 'l1', latencyMs: Date.now() - start },
      };
    }
  }
  
  // Try L2 (Redis)
  if (!options.skipL2 && isRedisAvailable()) {
    const l2Entry = await redisGet<L2CacheEntry<T>>(key);
    if (l2Entry && l2Entry.value !== undefined) {
      // Check version if specified
      if (!options.version || l2Entry.version === options.version) {
        // Write back to L1
        if (!options.skipL1) {
          cacheSet(key, l2Entry.value, {
            ttlMs: l2Entry.ttlMs,
            tags: options.tags,
          });
        }
        
        return {
          value: l2Entry.value,
          metrics: { l1Hit: false, l2Hit: true, source: 'l2', latencyMs: Date.now() - start },
        };
      }
    }
  }
  
  // Fetch from DB
  const value = await fetcher();
  
  // Write to both layers
  if (value !== undefined) {
    const ttlMs = options.ttlMs || 60000;
    const ttlSeconds = Math.ceil(ttlMs / 1000);
    
    // L1
    if (!options.skipL1) {
      cacheSet(key, value, { ttlMs, tags: options.tags });
    }
    
    // L2
    if (!options.skipL2 && isRedisAvailable()) {
      const entry: L2CacheEntry<T> = {
        value,
        cachedAt: Date.now(),
        ttlMs,
        version: options.version,
        source: 'db',
      };
      await redisSet(key, entry, ttlSeconds);
    }
  }
  
  return {
    value,
    metrics: { l1Hit: false, l2Hit: false, source: 'db', latencyMs: Date.now() - start },
  };
}

/**
 * Direct set to both L1 and L2
 */
export async function l2CacheSet<T>(
  key: string,
  value: T,
  options: L2CacheOptions = {}
): Promise<void> {
  const ttlMs = options.ttlMs || 60000;
  const ttlSeconds = Math.ceil(ttlMs / 1000);
  
  // L1
  if (!options.skipL1) {
    cacheSet(key, value, { ttlMs, tags: options.tags });
  }
  
  // L2
  if (!options.skipL2 && isRedisAvailable()) {
    const entry: L2CacheEntry<T> = {
      value,
      cachedAt: Date.now(),
      ttlMs,
      version: options.version,
      source: 'db',
    };
    await redisSet(key, entry, ttlSeconds);
  }
}

/**
 * Delete from both L1 and L2
 */
export async function l2CacheDel(key: string): Promise<void> {
  cacheDel(key);
  
  if (isRedisAvailable()) {
    await redisDel(key);
  }
}

/**
 * Delete by pattern from L2 (useful for invalidation)
 */
export async function l2CacheDelByPattern(pattern: string): Promise<number> {
  if (!isRedisAvailable()) return 0;
  return redisDelByPattern(pattern);
}

// ============================================
// Invalidation Functions (Account-scoped)
// ============================================

export async function invalidateAccountCache(accountId: string): Promise<void> {
  const keys = [
    L2_KEYS.accountStable(accountId),
    L2_KEYS.accountBrands(accountId),
    L2_KEYS.accountRules(accountId),
    L2_KEYS.accountExperiments(accountId),
    L2_KEYS.accountContent(accountId),
  ];
  
  // L1
  keys.forEach(k => cacheDel(k));
  
  // L2
  if (isRedisAvailable()) {
    await redisDel(...keys);
  }
}

export async function invalidateBrandsCache(accountId: string): Promise<void> {
  await l2CacheDel(L2_KEYS.accountBrands(accountId));
}

export async function invalidateRulesCache(accountId: string): Promise<void> {
  await l2CacheDel(L2_KEYS.accountRules(accountId));
  // Also invalidate global rules
  await l2CacheDelByPattern('l2:account:*:rules');
}

export async function invalidateExperimentsCache(accountId: string): Promise<void> {
  await l2CacheDel(L2_KEYS.accountExperiments(accountId));
}

export async function invalidateContentCache(accountId: string): Promise<void> {
  await l2CacheDel(L2_KEYS.accountContent(accountId));
}

export async function invalidateUsernameCache(username: string): Promise<void> {
  await l2CacheDel(L2_KEYS.username(username));
}

// ============================================
// Pre-built Loaders
// ============================================

import {
  getInfluencerByUsername as getInfluencerByUsernameDB,
  getBrandsByInfluencer as getBrandsByInfluencerDB,
  getContentByInfluencer as getContentByInfluencerDB,
  getInfluencerById as getInfluencerByIdDB,
} from '@/lib/supabase';
import type { Influencer, BrandCardData, ContentItem } from '@/types';

/**
 * Username -> AccountId resolution with L2
 */
export async function getAccountIdByUsername(username: string): Promise<{
  accountId: string | null;
  profileId: string | null;
  mode: 'creator' | 'brand';
  metrics: L2Metrics;
}> {
  const key = L2_KEYS.username(username);
  
  const result = await l2CacheWrap<{
    accountId: string;
    profileId: string;
    mode: 'creator' | 'brand';
  } | null>(
    key,
    async () => {
      const influencer = await getInfluencerByUsernameDB(username);
      if (!influencer) return null;
      
      return {
        accountId: influencer.id, // Assuming influencer.id is accountId for now
        profileId: influencer.id,
        mode: influencer.mode as 'creator' | 'brand' || 'creator',
      };
    },
    { ttlMs: L2_TTL.username * 1000 }
  );
  
  return {
    accountId: result.value?.accountId || null,
    profileId: result.value?.profileId || null,
    mode: result.value?.mode || 'creator',
    metrics: result.metrics,
  };
}

/**
 * Load brands with L2
 */
export async function getBrandsByAccount(accountId: string): Promise<{
  brands: BrandCardData[];
  metrics: L2Metrics;
}> {
  const key = L2_KEYS.accountBrands(accountId);
  
  const result = await l2CacheWrap<BrandCardData[]>(
    key,
    () => getBrandsByInfluencerDB(accountId),
    { ttlMs: L2_TTL.accountBrands * 1000, tags: [`account:${accountId}`] }
  );
  
  return { brands: result.value || [], metrics: result.metrics };
}

/**
 * Load content index with L2
 */
export async function getContentByAccount(accountId: string): Promise<{
  content: ContentItem[];
  metrics: L2Metrics;
}> {
  const key = L2_KEYS.accountContent(accountId);
  
  const result = await l2CacheWrap<ContentItem[]>(
    key,
    () => getContentByInfluencerDB(accountId),
    { ttlMs: L2_TTL.accountContent * 1000, tags: [`account:${accountId}`] }
  );
  
  return { content: result.value || [], metrics: result.metrics };
}

/**
 * Load influencer profile with L2
 */
export async function getInfluencerProfile(profileId: string): Promise<{
  influencer: Influencer | null;
  metrics: L2Metrics;
}> {
  const key = L2_KEYS.persona(profileId);
  
  const result = await l2CacheWrap<Influencer | null>(
    key,
    () => getInfluencerByIdDB(profileId),
    { ttlMs: L2_TTL.persona * 1000, tags: [`profile:${profileId}`] }
  );
  
  return { influencer: result.value, metrics: result.metrics };
}



