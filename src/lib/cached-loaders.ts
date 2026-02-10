/**
 * ============================================
 * Cached Data Loaders (L1 + L2)
 * ============================================
 * 
 * Two-layer caching:
 * - L1: In-memory LRU (fast, per-instance)
 * - L2: Redis (shared across instances)
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
  l2CacheWrap,
  L2_KEYS,
  L2_TTL,
  invalidateBrandsCache as invalidateBrandsCacheL2,
  invalidateContentCache as invalidateContentCacheL2,
  type L2Metrics,
} from './cache-l2';
import { isRedisAvailable } from './redis';
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
      // ⚡ Fetch with full relations like getInfluencerByUsername
      const { data: account } = await supabase
        .from('accounts')
        .select(`
          *,
          chatbot_persona(
            id,
            name,
            instagram_username,
            instagram_followers,
            tone,
            response_style,
            topics,
            common_phrases,
            created_at,
            updated_at
          ),
          instagram_profile_history(
            username,
            full_name,
            bio,
            followers_count,
            profile_pic_url,
            is_verified,
            category,
            snapshot_date
          )
        `)
        .eq('id', influencerId)
        .single();

      if (!account) return null;

      // Transform to Influencer format (same logic as getInfluencerByUsername)
      const config = account.config || {};
      const persona = (account.chatbot_persona as any)?.[0];
      const profileHistory = account.instagram_profile_history || [];
      const latestProfile = profileHistory.length > 0 
        ? profileHistory.sort((a: any, b: any) => 
            new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
          )[0]
        : null;

      return {
        id: account.id,
        username: config.username || latestProfile?.username || 'unknown',
        display_name: config.display_name || latestProfile?.full_name || persona?.name || config.username || 'Unknown',
        subdomain: config.subdomain || config.username || account.id,
        
        // Instagram profile data
        instagram_username: latestProfile?.username || persona?.instagram_username || config.username,
        followers_count: latestProfile?.followers_count || persona?.instagram_followers || 0,
        profile_pic_url: latestProfile?.profile_pic_url || null,
        avatar_url: config.avatar_url || latestProfile?.profile_pic_url || null,
        bio: latestProfile?.bio || null,
        is_verified: latestProfile?.is_verified || false,
        category: latestProfile?.category || null,
        
        influencer_type: config.influencer_type || 'other',
        theme: config.theme || {},
        status: account.status || 'active',
        
        // Include raw config for other fields
        ...config,
      } as Influencer;
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
    // L2 metrics
    redisAvailable: boolean;
    l1Hits: number;
    l2Hits: number;
    dbHits: number;
  };
}

/**
 * Load all data needed for a chat request with caching
 * Uses L1 (in-memory) + L2 (Redis) with parallel loading
 */
export async function loadChatContextCached(
  username: string
): Promise<CombinedLoadResult> {
  const startMs = Date.now();
  const redisAvailable = isRedisAvailable();
  
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
        redisAvailable,
        l1Hits: usernameResult.metrics.hit ? 1 : 0,
        l2Hits: 0,
        dbHits: usernameResult.metrics.hit ? 0 : 1,
      },
    };
  }

  const { influencerId, accountId } = usernameResult.data;

  // Step 2: Load remaining data in parallel (with L2)
  const [influencerResult, brandsResult, contentResult] = await Promise.all([
    loadInfluencerProfileCached(influencerId),
    loadBrandsWithL2(influencerId, accountId),
    loadContentWithL2(influencerId, accountId),
  ]);

  // Calculate cache hit rate
  const allResults = [
    usernameResult.metrics,
    influencerResult.metrics,
    brandsResult.metrics,
    contentResult.metrics,
  ];
  
  const l1Hits = allResults.filter(m => m.hit).length;
  const l2Hits = [brandsResult.l2Metrics, contentResult.l2Metrics]
    .filter(m => m && m.l2Hit).length;
  const dbHits = allResults.filter(m => !m.hit).length - l2Hits;

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
      brandsHit: brandsResult.metrics.hit || (brandsResult.l2Metrics?.l2Hit ?? false),
      contentMs: contentResult.metrics.loadTimeMs,
      contentHit: contentResult.metrics.hit || (contentResult.l2Metrics?.l2Hit ?? false),
      totalMs: Date.now() - startMs,
      cacheHitRate: (l1Hits + l2Hits) / 4,
      redisAvailable,
      l1Hits,
      l2Hits,
      dbHits: Math.max(0, dbHits),
    },
  };
}

/**
 * Load brands with L2 (Redis) support
 */
async function loadBrandsWithL2(
  influencerId: string,
  accountId: string
): Promise<LoadResult<Brand[]> & { l2Metrics?: L2Metrics }> {
  // Try L2 first if Redis is available
  if (isRedisAvailable()) {
    const l2Result = await l2CacheWrap<Brand[]>(
      L2_KEYS.accountBrands(accountId),
      async () => getBrandsByInfluencer(influencerId),
      { ttlMs: L2_TTL.accountBrands * 1000, tags: [`account:${accountId}`] }
    );
    
    return {
      data: l2Result.value || [],
      metrics: createCacheMetrics('brands', { 
        value: l2Result.value, 
        hit: l2Result.metrics.l1Hit,
        stale: false,
      }),
      l2Metrics: l2Result.metrics,
    };
  }
  
  // Fallback to L1 only
  return {
    ...(await loadBrandsCached(influencerId, accountId)),
    l2Metrics: undefined,
  };
}

/**
 * Load content with L2 (Redis) support
 */
async function loadContentWithL2(
  influencerId: string,
  accountId: string,
  limit = 10
): Promise<LoadResult<ContentItem[]> & { l2Metrics?: L2Metrics }> {
  // Try L2 first if Redis is available
  if (isRedisAvailable()) {
    const l2Result = await l2CacheWrap<ContentItem[]>(
      L2_KEYS.accountContent(accountId),
      async () => {
        const content = await getContentByInfluencer(influencerId);
        return content.slice(0, limit);
      },
      { ttlMs: L2_TTL.accountContent * 1000, tags: [`account:${accountId}`] }
    );
    
    return {
      data: l2Result.value || [],
      metrics: createCacheMetrics('contentIndex', { 
        value: l2Result.value, 
        hit: l2Result.metrics.l1Hit,
        stale: false,
      }),
      l2Metrics: l2Result.metrics,
    };
  }
  
  // Fallback to L1 only
  return {
    ...(await loadContentIndexCached(influencerId, accountId, limit)),
    l2Metrics: undefined,
  };
}

// ============================================
// Cache Invalidation Helpers (for CRUD endpoints)
// ============================================

import { cacheInvalidateTag, cacheInvalidateAccount } from './cache';
import { 
  invalidateAccountCache as invalidateAccountCacheL2,
  invalidateRulesCache as invalidateRulesCacheL2,
  invalidateExperimentsCache as invalidateExperimentsCacheL2,
} from './cache-l2';

/**
 * Invalidate cache after brand update (L1 + L2)
 */
export async function invalidateBrandsCache(accountId: string): Promise<void> {
  cacheInvalidateTag(CacheTags.accountBrands(accountId));
  await invalidateBrandsCacheL2(accountId);
}

/**
 * Invalidate cache after persona update (L1 + L2)
 */
export async function invalidatePersonaCache(accountId: string): Promise<void> {
  cacheInvalidateTag(CacheTags.accountPersona(accountId));
  // L2 invalidation is handled via accountStable
}

/**
 * Invalidate cache after theme update (L1 + L2)
 */
export async function invalidateThemeCache(accountId: string): Promise<void> {
  cacheInvalidateTag(CacheTags.accountTheme(accountId));
  // L2 invalidation is handled via accountStable
}

/**
 * Invalidate cache after content update (L1 + L2)
 */
export async function invalidateContentCache(accountId: string): Promise<void> {
  cacheInvalidateTag(CacheTags.accountContent(accountId));
  await invalidateContentCacheL2(accountId);
}

/**
 * Invalidate cache after rules update (L1 + L2)
 */
export async function invalidateRulesCache(accountId: string): Promise<void> {
  await invalidateRulesCacheL2(accountId);
}

/**
 * Invalidate cache after experiments update (L1 + L2)
 */
export async function invalidateExperimentsCache(accountId: string): Promise<void> {
  await invalidateExperimentsCacheL2(accountId);
}

/**
 * Invalidate all cache for an account (L1 + L2)
 */
export async function invalidateAllAccountCache(accountId: string): Promise<void> {
  cacheInvalidateAccount(accountId);
  await invalidateAccountCacheL2(accountId);
}

