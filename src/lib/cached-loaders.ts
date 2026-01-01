/**
 * ============================================
 * Cached Data Loaders
 * ============================================
 * 
 * Wraps database queries with caching for:
 * - Username resolution
 * - Account stable config
 * - Influencer profile
 * - Persona & theme
 * - Brands list
 * - Content index
 */

import {
  cacheWrap,
  CacheKeys,
  CacheTags,
  CacheTTL,
  type CacheMetrics,
  createCacheMetrics,
} from './cache';
import {
  getInfluencerByUsername,
  getBrandsByInfluencer,
  getContentByInfluencer,
  supabase,
  type Brand,
} from './supabase';
import type { Influencer, ContentItem } from '@/types';

// ============================================
// Types
// ============================================

export interface AccountStable {
  id: string;
  mode: 'creator' | 'brand';
  plan: string;
  timezone: string;
  language: string;
  allowedChannels: string[];
  features: {
    supportFlowEnabled: boolean;
    salesFlowEnabled: boolean;
    whatsappEnabled: boolean;
    analyticsEnabled: boolean;
  };
  security: {
    publicChatAllowed: boolean;
    requireAuthForSupport: boolean;
    allowedOrigins: string[];
  };
}

export interface InfluencerProfile {
  id: string;
  username: string;
  display_name: string;
  influencer_type: string;
  profile_image_url: string | null;
  bio: string | null;
  updated_at: string | null;
}

export interface LoadResult<T> {
  data: T;
  metrics: CacheMetrics;
}

// ============================================
// Username Resolution (Step 1 of every request)
// ============================================

export async function resolveUsernameToAccountId(
  username: string
): Promise<LoadResult<{ influencerId: string; accountId: string } | null>> {
  const key = CacheKeys.usernameToAccount(username);
  
  const result = await cacheWrap(
    key,
    async () => {
      const influencer = await getInfluencerByUsername(username);
      if (!influencer) return null;
      
      // Check if there's an account for this influencer
      const { data: account } = await supabase
        .from('accounts')
        .select('id')
        .eq('profile_id', influencer.id)
        .single();
      
      return {
        influencerId: influencer.id,
        accountId: account?.id || influencer.id, // Fallback to influencer ID
      };
    },
    {
      ttlMs: CacheTTL.USERNAME_RESOLUTION,
      tags: [`username:${username}`],
      staleWhileRevalidateMs: CacheTTL.STALE_EXTENSION,
    }
  );

  return {
    data: result.value,
    metrics: createCacheMetrics('username', result),
  };
}

// ============================================
// Influencer Profile (cached)
// ============================================

export async function loadInfluencerProfileCached(
  influencerId: string
): Promise<LoadResult<Influencer | null>> {
  const key = CacheKeys.influencerProfile(influencerId);
  
  const result = await cacheWrap(
    key,
    async () => {
      const { data } = await supabase
        .from('influencers')
        .select('*')
        .eq('id', influencerId)
        .single();
      return data as Influencer | null;
    },
    {
      ttlMs: CacheTTL.INFLUENCER_PROFILE,
      tags: [CacheTags.influencer(influencerId)],
      staleWhileRevalidateMs: CacheTTL.STALE_EXTENSION,
    }
  );

  return {
    data: result.value,
    metrics: createCacheMetrics('influencerProfile', result),
  };
}

// ============================================
// Account Stable Config (cached)
// ============================================

export async function loadAccountStableCached(
  accountId: string
): Promise<LoadResult<AccountStable | null>> {
  const key = CacheKeys.accountStable(accountId);
  
  const result = await cacheWrap(
    key,
    async () => {
      const { data } = await supabase
        .from('accounts')
        .select('id, mode, plan, config')
        .eq('id', accountId)
        .single();
      
      if (!data) return null;
      
      const config = (data.config as Record<string, unknown>) || {};
      
      return {
        id: data.id,
        mode: (data.mode || 'creator') as 'creator' | 'brand',
        plan: data.plan || 'free',
        timezone: (config.timezone as string) || 'Asia/Jerusalem',
        language: (config.language as string) || 'he',
        allowedChannels: (config.allowedChannels as string[]) || ['chat'],
        features: {
          supportFlowEnabled: (config.supportFlowEnabled as boolean) ?? true,
          salesFlowEnabled: (config.salesFlowEnabled as boolean) ?? false,
          whatsappEnabled: (config.whatsappEnabled as boolean) ?? false,
          analyticsEnabled: (config.analyticsEnabled as boolean) ?? true,
        },
        security: {
          publicChatAllowed: (config.publicChatAllowed as boolean) ?? true,
          requireAuthForSupport: (config.requireAuthForSupport as boolean) ?? false,
          allowedOrigins: (config.allowedOrigins as string[]) || [],
        },
      };
    },
    {
      ttlMs: CacheTTL.ACCOUNT_STABLE,
      tags: [CacheTags.account(accountId)],
      staleWhileRevalidateMs: CacheTTL.STALE_EXTENSION,
    }
  );

  return {
    data: result.value,
    metrics: createCacheMetrics('accountStable', result),
  };
}

// ============================================
// Brands List (cached, versioned)
// ============================================

export async function loadBrandsCached(
  influencerId: string,
  accountId: string
): Promise<LoadResult<Brand[]>> {
  // First get version for cache key
  const key = CacheKeys.brands(accountId);
  
  const result = await cacheWrap(
    key,
    async () => {
      return await getBrandsByInfluencer(influencerId);
    },
    {
      ttlMs: CacheTTL.BRANDS,
      tags: [
        CacheTags.account(accountId),
        CacheTags.accountBrands(accountId),
      ],
      staleWhileRevalidateMs: CacheTTL.STALE_EXTENSION,
    }
  );

  return {
    data: result.value,
    metrics: createCacheMetrics('brands', result),
  };
}

// ============================================
// Content Index (cached)
// ============================================

export async function loadContentIndexCached(
  influencerId: string,
  accountId: string,
  limit = 10
): Promise<LoadResult<ContentItem[]>> {
  const key = CacheKeys.contentIndex(accountId);
  
  const result = await cacheWrap(
    key,
    async () => {
      const content = await getContentByInfluencer(influencerId);
      // Return only first N items for the index
      return content.slice(0, limit);
    },
    {
      ttlMs: CacheTTL.CONTENT_INDEX,
      tags: [
        CacheTags.account(accountId),
        CacheTags.accountContent(accountId),
      ],
      staleWhileRevalidateMs: CacheTTL.STALE_EXTENSION,
    }
  );

  return {
    data: result.value,
    metrics: createCacheMetrics('contentIndex', result),
  };
}

// ============================================
// Combined Loader (for streaming endpoint)
// ============================================

export interface CombinedLoadResult {
  influencer: Influencer | null;
  accountId: string | null;
  brands: Brand[];
  content: ContentItem[];
  metrics: {
    usernameMs: number;
    usernameHit: boolean;
    influencerMs: number;
    influencerHit: boolean;
    brandsMs: number;
    brandsHit: boolean;
    contentMs: number;
    contentHit: boolean;
    totalMs: number;
    cacheHitRate: number;
  };
}

/**
 * Load all data needed for a chat request with caching
 * Uses parallel loading where possible
 */
export async function loadChatContextCached(
  username: string
): Promise<CombinedLoadResult> {
  const startMs = Date.now();
  
  // Step 1: Resolve username (must be first)
  const usernameResult = await resolveUsernameToAccountId(username);
  
  if (!usernameResult.data) {
    return {
      influencer: null,
      accountId: null,
      brands: [],
      content: [],
      metrics: {
        usernameMs: usernameResult.metrics.loadTimeMs,
        usernameHit: usernameResult.metrics.hit,
        influencerMs: 0,
        influencerHit: false,
        brandsMs: 0,
        brandsHit: false,
        contentMs: 0,
        contentHit: false,
        totalMs: Date.now() - startMs,
        cacheHitRate: usernameResult.metrics.hit ? 1 : 0,
      },
    };
  }

  const { influencerId, accountId } = usernameResult.data;

  // Step 2: Load remaining data in parallel
  const [influencerResult, brandsResult, contentResult] = await Promise.all([
    loadInfluencerProfileCached(influencerId),
    loadBrandsCached(influencerId, accountId),
    loadContentIndexCached(influencerId, accountId),
  ]);

  // Calculate cache hit rate
  const hits = [
    usernameResult.metrics.hit,
    influencerResult.metrics.hit,
    brandsResult.metrics.hit,
    contentResult.metrics.hit,
  ].filter(Boolean).length;

  return {
    influencer: influencerResult.data,
    accountId,
    brands: brandsResult.data,
    content: contentResult.data,
    metrics: {
      usernameMs: usernameResult.metrics.loadTimeMs,
      usernameHit: usernameResult.metrics.hit,
      influencerMs: influencerResult.metrics.loadTimeMs,
      influencerHit: influencerResult.metrics.hit,
      brandsMs: brandsResult.metrics.loadTimeMs,
      brandsHit: brandsResult.metrics.hit,
      contentMs: contentResult.metrics.loadTimeMs,
      contentHit: contentResult.metrics.hit,
      totalMs: Date.now() - startMs,
      cacheHitRate: hits / 4,
    },
  };
}

// ============================================
// Cache Invalidation Helpers (for CRUD endpoints)
// ============================================

import { cacheInvalidateTag, cacheInvalidateAccount } from './cache';

/**
 * Invalidate cache after brand update
 */
export function invalidateBrandsCache(accountId: string): void {
  cacheInvalidateTag(CacheTags.accountBrands(accountId));
}

/**
 * Invalidate cache after persona update
 */
export function invalidatePersonaCache(accountId: string): void {
  cacheInvalidateTag(CacheTags.accountPersona(accountId));
}

/**
 * Invalidate cache after theme update
 */
export function invalidateThemeCache(accountId: string): void {
  cacheInvalidateTag(CacheTags.accountTheme(accountId));
}

/**
 * Invalidate cache after content update
 */
export function invalidateContentCache(accountId: string): void {
  cacheInvalidateTag(CacheTags.accountContent(accountId));
}

/**
 * Invalidate all cache for an account
 */
export function invalidateAllAccountCache(accountId: string): void {
  cacheInvalidateAccount(accountId);
}

