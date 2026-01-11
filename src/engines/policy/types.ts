/**
 * ============================================
 * Policy Engine Types
 * ============================================
 * 
 * Policy runs AFTER Decision, BEFORE Action.
 * It enforces security, privacy, rate limits, and business rules.
 */

import type { SecurityLevel } from '../types';
import type { UIDirectives, HandlerType } from '../decision/types';

// ============================================
// Policy Result
// ============================================

export interface PolicyCheckResult {
  /** Whether the action is allowed to proceed */
  allowed: boolean;
  
  /** Reason for blocking (if not allowed) */
  blockedReason?: string;
  
  /** Policy rule that blocked */
  blockedByRule?: string;
  
  /** Overrides to apply to decision */
  overrides?: PolicyOverrides;
  
  /** Warnings (allowed but flagged) */
  warnings?: PolicyWarning[];
  
  /** Redactions to apply to response */
  redactions?: PolicyRedaction[];
  
  /** Policies that were applied */
  appliedPolicies: AppliedPolicy[];
}

export interface PolicyOverrides {
  /** Override handler */
  handler?: HandlerType;
  
  /** Override security level */
  securityLevel?: SecurityLevel;
  
  /** Override UI directives */
  uiDirectives?: Partial<UIDirectives>;
  
  /** Remove context items */
  removeFromContext?: string[];
  
  /** Force response template */
  forceResponseTemplate?: string;
  
  /** Force short response */
  forceShortResponse?: boolean;
}

export interface PolicyWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface PolicyRedaction {
  /** Path in response to redact */
  path: string;
  
  /** Reason for redaction */
  reason: string;
  
  /** How to redact (mask, hash, remove) */
  method: 'mask' | 'hash' | 'remove' | 'truncate';
}

export interface AppliedPolicy {
  id: string;
  name: string;
  category: PolicyCategory;
  result: 'allow' | 'block' | 'override' | 'warn';
  appliedAt: string;
}

// ============================================
// Policy Categories
// ============================================

export type PolicyCategory = 
  | 'security'       // securityLevel enforcement
  | 'privacy'        // PII protection
  | 'rate_limit'     // spam prevention
  | 'content'        // content filtering
  | 'compliance'     // GDPR, legal
  | 'timing'         // time-based rules
  | 'cost'           // budget enforcement
  ;

// ============================================
// Auth Context (for Policy)
// ============================================

export interface AuthContext {
  isAuthenticated: boolean;
  isOwner: boolean;
  userId?: string;
  role?: 'viewer' | 'editor' | 'admin' | 'owner';
}

export interface SecurityContext {
  channel: 'public_chat' | 'dashboard' | 'api' | 'webhook';
  auth: AuthContext;
  ipHash?: string;
  userAgent?: string;
  consents: {
    allowEscalationToHuman?: boolean;
    allowWhatsapp?: boolean;
    allowEmail?: boolean;
  };
}

// ============================================
// Rate Limit Types
// ============================================

export interface RateLimitConfig {
  /** Identifier (accountId, sessionId, anonId, etc) */
  key: string;
  
  /** Time window in seconds */
  windowSeconds: number;
  
  /** Max requests in window */
  maxRequests: number;
  
  /** Current count */
  currentCount?: number;
  
  /** Reset time */
  resetAt?: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

// ============================================
// Policy Input
// ============================================

export interface PolicyInput {
  /** Engine context */
  ctx: import('../context').EngineContext;
  
  /** Understanding result */
  understanding: import('../understanding/types').UnderstandingResult;
  
  /** Decision result */
  decision: import('../decision/types').DecisionResult;
  
  /** Security context (auth, channel) */
  security: SecurityContext;
  
  /** Trace IDs */
  traceId: string;
  requestId: string;
}



