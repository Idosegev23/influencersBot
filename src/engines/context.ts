/**
 * ============================================
 * Engine Context v2 P0
 * ============================================
 * 
 * Defines the Context Contract: what data is stable vs volatile,
 * what's loaded once vs every request, and what's never cached.
 * 
 * CRITICAL: This contract must be respected by all engines.
 */

import type { 
  AccountMode, 
  AccountPlan, 
  Channel, 
  SecurityLevel,
  ModelTier,
  Session,
} from './types';

// ============================================
// Account Context (STABLE - loaded once per session)
// ============================================

export interface AccountSecurityConfig {
  publicChatAllowed: boolean;
  requireAuthForSupport: boolean;
  allowedOrigins: string[];
  rateLimitOverride?: number;
}

export interface AccountContext {
  id: string;
  mode: AccountMode;
  profileId: string;              // influencer_id or brand_id
  
  // Localization
  timezone: string;               // e.g., "Asia/Jerusalem"
  language: 'he' | 'en';
  
  // Plan and limits
  plan: AccountPlan;
  
  // Channels
  allowedChannels: Channel[];
  
  // Security defaults
  security: AccountSecurityConfig;
  
  // Feature flags
  features: {
    supportFlowEnabled: boolean;
    salesFlowEnabled: boolean;
    whatsappEnabled: boolean;
    analyticsEnabled: boolean;
  };
}

// ============================================
// Session Context (VOLATILE - changes per conversation)
// ============================================

export interface SessionContext {
  id: string;
  state: string;                  // Current ConversationState
  version: number;                // For optimistic concurrency
  previousResponseId?: string;    // OpenAI continuity
  lastActiveAt: Date;
  messageCount: number;
  
  // Meta state (optional, for debugging)
  metaState?: 'understanding' | 'deciding' | 'executing' | 'idle';
  
  // History hints (loaded lazily)
  lastIntent?: string;
  lastTopic?: string;
  repeatIntentCount?: number;
}

// ============================================
// User Context (ANONYMOUS - for tracking only)
// ============================================

export interface UserContext {
  anonId: string;                 // Cookie-based anonymous ID
  isRepeatVisitor: boolean;
  sessionCount?: number;
  segments?: string[];            // e.g., ["high_engagement", "coupon_seeker"]
  lastVisitAt?: Date;
}

// ============================================
// Knowledge Context (REFS - not full data)
// ============================================

export interface KnowledgeRefs {
  brandsRef: string;              // Cache key for brands list
  contentIndexRef: string;        // Cache key for content
  faqRef?: string;                // Cache key for FAQ
  personaRef?: string;            // Cache key for persona
  
  // Timestamps for cache invalidation
  brandsLastSync?: Date;
  contentLastSync?: Date;
}

// ============================================
// Limits Context (COST CONTROL - checked every request)
// ============================================

export interface LimitsContext {
  // Token budget
  tokenBudgetRemaining: number;
  tokenBudgetTotal: number;
  
  // Cost ceiling
  costCeiling: number;            // Max cost per period
  costUsed: number;               // Cost used in current period
  
  // Rate limiting
  rateLimitRemaining: number;
  rateLimitResetAt: Date;
  
  // Period info
  periodType: 'day' | 'week' | 'month';
  periodStart: Date;
  periodEnd: Date;
}

// ============================================
// Request Context (PER-REQUEST - always fresh)
// ============================================

export interface RequestContext {
  requestId: string;              // Unique per request
  traceId: string;                // Spans multiple requests
  timestamp: Date;
  
  // Source info
  source: 'chat' | 'api' | 'webhook' | 'cron';
  ipAddress?: string;             // For rate limiting (hashed)
  userAgent?: string;
  
  // Current message
  messageId: string;
  clientMessageId: string;
}

// ============================================
// Full Engine Context
// ============================================

export interface EngineContext {
  account: AccountContext;
  session: SessionContext;
  user: UserContext;
  knowledge: KnowledgeRefs;
  limits: LimitsContext;
  request: RequestContext;
}

// ============================================
// Context Loading Strategy
// ============================================

/**
 * Context Loading Rules:
 * 
 * STABLE (cache for session duration):
 *   - account.*
 *   - knowledge refs
 * 
 * VOLATILE (load every request):
 *   - session.* (must be fresh for concurrency)
 *   - limits.* (must be accurate for cost control)
 *   - request.* (always new)
 * 
 * LAZY (load only when needed):
 *   - user.segments
 *   - session.lastIntent / lastTopic
 *   - Actual knowledge data (brands, content)
 * 
 * NEVER CACHE:
 *   - session.version (always fresh from DB)
 *   - limits.rateLimitRemaining (always fresh)
 *   - Any PII (phone, email, order numbers)
 */

export interface ContextLoadOptions {
  includeUserSegments?: boolean;
  includeSessionHistory?: boolean;
  skipCache?: boolean;
}

// ============================================
// Context Builder Interface
// ============================================

export interface ContextBuilder {
  /**
   * Build full context for a request
   */
  build(
    accountId: string,
    sessionId: string | undefined,
    requestId: string,
    options?: ContextLoadOptions
  ): Promise<EngineContext>;
  
  /**
   * Refresh only volatile parts
   */
  refreshVolatile(context: EngineContext): Promise<EngineContext>;
  
  /**
   * Get account context from cache
   */
  getAccountContext(accountId: string): Promise<AccountContext | null>;
  
  /**
   * Invalidate account cache (on settings change)
   */
  invalidateAccountCache(accountId: string): void;
}

// ============================================
// Privacy Rules for Context
// ============================================

/**
 * Privacy Rules:
 * 
 * 1. PII is NEVER stored in context object
 *    - Phone numbers extracted → stored masked
 *    - Order numbers → stored in support_requests only
 *    - Email addresses → stored encrypted or not at all
 * 
 * 2. Events get REDACTED context
 *    - No raw phone/email in event payloads
 *    - Use hashes or masked versions
 * 
 * 3. Logs are SANITIZED
 *    - No PII in log messages
 *    - Use context.request.requestId for correlation
 */

export interface PrivacyConfig {
  maskPhoneNumbers: boolean;
  hashEmails: boolean;
  redactOrderNumbers: boolean;
  logPIIFields: string[];         // Fields that should never be logged
}

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  maskPhoneNumbers: true,
  hashEmails: true,
  redactOrderNumbers: true,
  logPIIFields: ['phone', 'email', 'orderNumber', 'address', 'fullName'],
};

