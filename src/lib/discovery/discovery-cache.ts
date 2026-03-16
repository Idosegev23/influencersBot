// ============================================
// Discovery Feature — Cache Layer
// ============================================

import { cacheWrap, cacheGet, cacheSet, cacheInvalidateTag } from '@/lib/cache';

// Cache TTLs
const TTL = {
  CATEGORIES: 5 * 60 * 1000,          // 5 minutes
  DATA_DRIVEN_LIST: 60 * 60 * 1000,   // 1 hour
  AI_LIST: 5 * 60 * 1000,             // 5 minutes (DB is source of truth)
  QUESTIONS: 60 * 1000,               // 1 minute (voting needs fresher data)
} as const;

// Stale-while-revalidate windows
const STALE = {
  CATEGORIES: 10 * 60 * 1000,         // 10 min stale ok
  DATA_DRIVEN_LIST: 2 * 60 * 60 * 1000, // 2 hours stale ok
  AI_LIST: 30 * 60 * 1000,            // 30 min stale ok
} as const;

// Cache key builders
export const CacheKeys = {
  categories: (accountId: string) => `discovery:categories:${accountId}`,
  list: (accountId: string, slug: string) => `discovery:list:${accountId}:${slug}`,
  questions: (accountId: string) => `discovery:questions:${accountId}`,
} as const;

// Cache tags for invalidation
export const CacheTags = {
  discovery: (accountId: string) => `discovery:${accountId}`,
  discoveryList: (accountId: string, slug: string) => `discovery:list:${accountId}:${slug}`,
} as const;

/**
 * Cached wrapper for category availability check
 */
export async function cachedCategories<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const result = await cacheWrap<T>(
    CacheKeys.categories(accountId),
    fn,
    {
      ttlMs: TTL.CATEGORIES,
      tags: [`account:${accountId}`, CacheTags.discovery(accountId)],
      staleWhileRevalidateMs: STALE.CATEGORIES,
    }
  );
  return result.value;
}

/**
 * Cached wrapper for data-driven list query
 */
export async function cachedDataList<T>(accountId: string, slug: string, fn: () => Promise<T>): Promise<T> {
  const result = await cacheWrap<T>(
    CacheKeys.list(accountId, slug),
    fn,
    {
      ttlMs: TTL.DATA_DRIVEN_LIST,
      tags: [`account:${accountId}`, CacheTags.discovery(accountId), CacheTags.discoveryList(accountId, slug)],
      staleWhileRevalidateMs: STALE.DATA_DRIVEN_LIST,
    }
  );
  return result.value;
}

/**
 * Cached wrapper for AI list (shorter TTL since DB is source of truth)
 */
export async function cachedAIList<T>(accountId: string, slug: string, fn: () => Promise<T>): Promise<T> {
  const result = await cacheWrap<T>(
    CacheKeys.list(accountId, slug),
    fn,
    {
      ttlMs: TTL.AI_LIST,
      tags: [`account:${accountId}`, CacheTags.discovery(accountId), CacheTags.discoveryList(accountId, slug)],
      staleWhileRevalidateMs: STALE.AI_LIST,
    }
  );
  return result.value;
}

/**
 * Invalidate all discovery cache for an account
 */
export function invalidateDiscoveryCache(accountId: string): number {
  return cacheInvalidateTag(CacheTags.discovery(accountId));
}
