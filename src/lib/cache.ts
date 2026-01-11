/**
 * ============================================
 * In-Memory LRU Cache with Tags & Versioning
 * ============================================
 * 
 * Designed for 100K+ accounts with:
 * - Account-scoped keys (no cross-account leakage)
 * - Tag-based invalidation
 * - Version-based cache busting
 * - Stale-while-revalidate support
 * - Cache metrics for monitoring
 */

// ============================================
// Types
// ============================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  tags: string[];
  version?: string;
  staleAt?: number; // For stale-while-revalidate
}

interface CacheOptions {
  ttlMs: number;
  tags?: string[];
  version?: string;
  staleWhileRevalidateMs?: number; // How long stale data is acceptable
}

interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  evictions: number;
  size: number;
  hitRate: number;
}

interface WrapResult<T> {
  value: T;
  fromCache: boolean;
  stale: boolean;
  loadTimeMs: number;
}

// ============================================
// LRU Cache Implementation
// ============================================

class LRUCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private tagIndex = new Map<string, Set<string>>(); // tag -> keys
  private maxSize: number;
  private stats = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    evictions: 0,
  };

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): { value: T; stale: boolean } | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();

    // Check if completely expired
    if (entry.expiresAt < now) {
      // Check if stale-while-revalidate is allowed
      if (entry.staleAt && entry.staleAt > now) {
        this.stats.staleHits++;
        // Move to front (LRU)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return { value: entry.value, stale: true };
      }
      
      // Fully expired, remove
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    // Move to front (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return { value: entry.value, stale: false };
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T, options: CacheOptions): void {
    const now = Date.now();
    
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + options.ttlMs,
      createdAt: now,
      tags: options.tags || [],
      version: options.version,
      staleAt: options.staleWhileRevalidateMs 
        ? now + options.ttlMs + options.staleWhileRevalidateMs 
        : undefined,
    };

    this.cache.set(key, entry);

    // Update tag index
    for (const tag of entry.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Remove from tag index
    for (const tag of entry.tags) {
      this.tagIndex.get(tag)?.delete(key);
    }

    return this.cache.delete(key);
  }

  /**
   * Invalidate all keys with a specific tag
   */
  invalidateTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;

    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) count++;
    }

    this.tagIndex.delete(tag);
    return count;
  }

  /**
   * Invalidate all keys for an account
   */
  invalidateAccount(accountId: string): number {
    return this.invalidateTag(`account:${accountId}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, staleHits: 0, evictions: 0 };
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.tagIndex.clear();
    this.resetStats();
  }

  private evictOldest(): void {
    // Get first key (oldest in insertion order)
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }
}

// ============================================
// Global Cache Instance
// ============================================

const globalCache = new LRUCache(15000); // 15K entries

// ============================================
// Public API
// ============================================

/**
 * Get a value from cache
 */
export function cacheGet<T>(key: string): { value: T; stale: boolean } | null {
  return globalCache.get<T>(key);
}

/**
 * Set a value in cache
 */
export function cacheSet<T>(key: string, value: T, options: CacheOptions): void {
  globalCache.set(key, value, options);
}

/**
 * Delete a key from cache
 */
export function cacheDelete(key: string): boolean {
  return globalCache.delete(key);
}

/**
 * Wrap a function with caching
 * Returns cached value if available, otherwise calls fn and caches result
 */
export async function cacheWrap<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions
): Promise<WrapResult<T>> {
  const startMs = Date.now();
  
  // Check cache first
  const cached = globalCache.get<T>(key);
  
  if (cached && !cached.stale) {
    return {
      value: cached.value,
      fromCache: true,
      stale: false,
      loadTimeMs: Date.now() - startMs,
    };
  }

  // If stale, return immediately but refresh in background
  if (cached && cached.stale) {
    // Fire and forget refresh
    fn().then(value => {
      globalCache.set(key, value, options);
    }).catch(err => {
      console.error(`[Cache] Background refresh failed for ${key}:`, err);
    });

    return {
      value: cached.value,
      fromCache: true,
      stale: true,
      loadTimeMs: Date.now() - startMs,
    };
  }

  // Cache miss - load fresh
  const value = await fn();
  globalCache.set(key, value, options);

  return {
    value,
    fromCache: false,
    stale: false,
    loadTimeMs: Date.now() - startMs,
  };
}

/**
 * Invalidate by tag
 */
export function cacheInvalidateTag(tag: string): number {
  return globalCache.invalidateTag(tag);
}

/**
 * Invalidate all cache for an account
 */
export function cacheInvalidateAccount(accountId: string): number {
  return globalCache.invalidateAccount(accountId);
}

/**
 * Get cache statistics
 */
export function cacheGetStats(): CacheStats {
  return globalCache.getStats();
}

/**
 * Clear entire cache
 */
export function cacheClear(): void {
  globalCache.clear();
}

// ============================================
// Cache Key Builders (for consistency)
// ============================================

export const CacheKeys = {
  // Username to account mapping
  usernameToAccount: (username: string) => 
    `username:${username}:accountId`,
  
  // Account stable config (mode, plan, timezone, language)
  accountStable: (accountId: string) => 
    `account:${accountId}:stable`,
  
  // Influencer profile (display_name, type, avatar, etc.)
  influencerProfile: (influencerId: string) => 
    `influencer:${influencerId}:profile`,
  
  // Persona (tone, style, greeting, etc.)
  persona: (accountId: string, version?: string) => 
    version 
      ? `account:${accountId}:persona:v${version}`
      : `account:${accountId}:persona`,
  
  // Theme
  theme: (accountId: string, version?: string) => 
    version 
      ? `account:${accountId}:theme:v${version}`
      : `account:${accountId}:theme`,
  
  // Brands list
  brands: (accountId: string, version?: string) => 
    version 
      ? `account:${accountId}:brands:v${version}`
      : `account:${accountId}:brands`,
  
  // Content index (not full content, just refs)
  contentIndex: (accountId: string) => 
    `account:${accountId}:content:index`,
  
  // Session
  session: (sessionId: string) => 
    `session:${sessionId}`,
} as const;

// ============================================
// Cache Tags (for invalidation)
// ============================================

export const CacheTags = {
  account: (accountId: string) => `account:${accountId}`,
  accountBrands: (accountId: string) => `account:${accountId}:brands`,
  accountPersona: (accountId: string) => `account:${accountId}:persona`,
  accountTheme: (accountId: string) => `account:${accountId}:theme`,
  accountContent: (accountId: string) => `account:${accountId}:content`,
  influencer: (influencerId: string) => `influencer:${influencerId}`,
} as const;

// ============================================
// Cache TTL Constants
// ============================================

export const CacheTTL = {
  USERNAME_RESOLUTION: 5 * 60 * 1000,     // 5 minutes
  ACCOUNT_STABLE: 3 * 60 * 1000,          // 3 minutes
  INFLUENCER_PROFILE: 5 * 60 * 1000,      // 5 minutes
  PERSONA: 3 * 60 * 1000,                 // 3 minutes
  THEME: 5 * 60 * 1000,                   // 5 minutes
  BRANDS: 60 * 1000,                      // 60 seconds
  CONTENT_INDEX: 2 * 60 * 1000,           // 2 minutes
  SESSION: 30 * 1000,                     // 30 seconds (short for volatility)
  
  // Stale-while-revalidate extensions
  STALE_EXTENSION: 30 * 1000,             // 30 extra seconds of stale data
} as const;

// ============================================
// Metrics Export
// ============================================

export interface CacheMetrics {
  keyPrefix: string;
  hit: boolean;
  stale: boolean;
  loadTimeMs: number;
}

/**
 * Create cache metrics for stage timings
 */
export function createCacheMetrics(
  keyPrefix: string,
  result: WrapResult<unknown>
): CacheMetrics {
  return {
    keyPrefix,
    hit: result.fromCache,
    stale: result.stale,
    loadTimeMs: result.loadTimeMs,
  };
}



