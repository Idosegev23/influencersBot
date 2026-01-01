/**
 * ============================================
 * Audience Interaction OS - Core Types v2 P0
 * ============================================
 * 
 * This file defines all interfaces for the 5-Engine architecture:
 * Interaction → Understanding → Decision → Policy → Action
 */

// ============================================
// Basic Enums and Types
// ============================================

export type AccountMode = 'creator' | 'brand';

export type AccountPlan = 'free' | 'pro' | 'enterprise';

export type InfluencerType = 
  | 'food' | 'fashion' | 'tech' | 'lifestyle' 
  | 'fitness' | 'beauty' | 'parenting' | 'travel' | 'other';

export type Channel = 'chat' | 'whatsapp' | 'email' | 'none';

export type SecurityLevel = 'public' | 'authenticated' | 'owner_only';

export type ModelTier = 'nano' | 'standard' | 'full';

// ============================================
// Understanding Engine Types
// ============================================

export type IntentType =
  | 'general_chat'
  | 'question'
  | 'coupon_request'
  | 'product_inquiry'
  | 'content_request'
  | 'support_issue'
  | 'complaint'
  | 'purchase_intent'
  | 'greeting'
  | 'farewell'
  | 'unclear';

export interface ExtractedEntities {
  brands: string[];
  products: string[];
  coupons: string[];
  orderNumbers: string[];
  phoneNumbers: string[];
  dates: string[];
  amounts: string[];
  custom: Record<string, string>;
}

export interface RiskFlags {
  privacy: boolean;      // PII exposure risk
  legal: boolean;        // Legal liability risk
  medical: boolean;      // Medical advice risk
  harassment: boolean;   // Abusive content
  financial: boolean;    // Financial advice risk
}

export interface UnderstandingResult {
  // Core classification
  intent: IntentType;
  confidence: number;           // 0-1
  
  // Extracted data
  entities: ExtractedEntities;
  topic: string;                // returns, shipping, recipe, tech-support, etc.
  
  // Context signals
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sentiment: 'positive' | 'neutral' | 'negative';
  
  // History awareness
  isRepeat: boolean;
  repeatCount?: number;
  
  // Ambiguity handling
  ambiguity: string[];
  suggestedClarifications: string[];
  
  // Safety
  risk: RiskFlags;
  requiresHuman: boolean;
  
  // Debug
  rawInput: string;
  processingTimeMs: number;
}

// ============================================
// Decision Engine Types
// ============================================

export type DecisionType = 
  | 'chat_response' 
  | 'support_flow' 
  | 'sales_flow' 
  | 'human_escalation'
  | 'clarification'
  | 'notification_only';

export type HandlerType = 
  | 'chat' 
  | 'support' 
  | 'sales' 
  | 'human' 
  | 'notification_only';

export type ActionStepType =
  | 'send_response'
  | 'create_support_ticket'
  | 'send_notification'
  | 'emit_event'
  | 'update_session_state'
  | 'defer_action'
  | 'trigger_webhook';

export interface ActionStep {
  type: ActionStepType;
  payload: Record<string, unknown>;
  idempotencyScope: 'session' | 'account' | 'global';
  requiredSecurityLevel?: SecurityLevel;
  channel?: Channel;
  retryable?: boolean;
  timeoutMs?: number;
}

export interface UIDirectives {
  // Layout
  layout: 'chat' | 'cards_first' | 'form_first';
  
  // Components to show
  showQuickActions?: string[];
  showProgress?: { current: number; total: number; label: string };
  showCardList?: 'brands' | 'products' | 'content';
  showForm?: 'phone' | 'name' | 'order' | 'problem' | 'custom';
  
  // Response style
  tone: 'professional' | 'casual' | 'empathetic';
  responseLength: 'short' | 'standard' | 'deep';
  
  // WOW features
  nextBestActions?: Array<{
    id: string;
    label: string;
    payload?: Record<string, unknown>;
  }>;
}

export interface ModelStrategy {
  model: ModelTier;
  fallback?: ModelTier;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  retries: number;
  fallbackResponseTemplate?: string;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  modelUsed: ModelTier;
}

export interface RuleApplication {
  ruleId: string;
  ruleName: string;
  category: string;
  matched: boolean;
  priority: number;
  version?: number;
}

export interface StateTransitionInfo {
  from: string;
  to: string;
  reason: string;
  timestamp: Date;
}

export interface DecisionResult {
  // Decision classification
  decisionType: DecisionType;
  handler: HandlerType;
  priority: number;               // 1-10
  
  // State management
  stateTransition?: StateTransitionInfo;
  
  // Execution plan
  actionPlan: ActionStep[];
  
  // Response strategy
  responseStrategy: {
    type: 'direct' | 'with_context' | 'with_search' | 'template';
    contextToInclude: string[];
    templateId?: string;
  };
  
  // UI/UX
  uiDirectives: UIDirectives;
  channel: Channel;
  
  // Model selection
  modelStrategy: ModelStrategy;
  
  // Security
  securityLevel: SecurityLevel;
  
  // Cost and performance
  costEstimate: CostEstimate;
  
  // Debug and audit
  reasoning: string;
  rulesApplied: RuleApplication[];
  
  // Idempotency
  idempotencyKey: string;
  
  // Tracing
  traceId: string;
  requestId: string;
}

// ============================================
// Policy Engine Types
// ============================================

export interface RedactionDirective {
  path: string;                 // e.g., "actionPlan[0].payload.orderNumber"
  reason: string;
  replaceWith?: string;         // Optional replacement value
}

export interface PolicyCheckResult {
  allowed: boolean;
  blockedReason?: string;
  
  // Modifications
  overrides?: Partial<DecisionResult>;
  redactions?: RedactionDirective[];
  
  // Warnings (allow but log)
  warnings?: string[];
  
  // Audit
  policiesChecked: string[];
  policiesTriggered: string[];
}

export type PolicyRuleType =
  | 'no_expired_coupons'
  | 'no_night_notifications'
  | 'no_public_order_details'
  | 'no_auto_escalation_without_consent'
  | 'gdpr_compliance'
  | 'rate_limit'
  | 'budget_limit'
  | 'content_moderation';

// ============================================
// Action Engine Types
// ============================================

export interface ActionResult {
  success: boolean;
  stepResults: Array<{
    step: ActionStep;
    success: boolean;
    error?: string;
    durationMs: number;
  }>;
  totalDurationMs: number;
  eventsEmitted: string[];
}

// ============================================
// Rule Engine Types
// ============================================

export type RuleCategory = 
  | 'routing'
  | 'escalation'
  | 'personalization'
  | 'timing'
  | 'cost'
  | 'security';

export type ConditionOperator = 
  | 'eq' | 'neq' 
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains'
  | 'matches' | 'in' | 'not_in'
  | 'exists' | 'not_exists';

export interface RuleCondition {
  field: string;                // e.g., "understanding.intent"
  operator: ConditionOperator;
  value: unknown;
}

export interface RuleAction {
  type: 'set' | 'add' | 'remove' | 'override';
  target: string;               // e.g., "decision.handler"
  value: unknown;
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  category: RuleCategory;
  priority: number;             // Lower = runs first
  
  // Conditions (AND logic)
  conditions: RuleCondition[];
  
  // Actions when matched
  actions: RuleAction[];
  
  // Scope
  mode: 'creator' | 'brand' | 'both';
  accountId?: string;           // NULL = global rule
  
  // Status
  enabled: boolean;
  
  // Versioning
  version?: number;
  publishedAt?: Date;
  updatedBy?: string;
  
  // Source tracking
  source?: 'code' | 'db';       // Where this rule came from
}

// ============================================
// Message Types
// ============================================

export interface IncomingMessage {
  clientMessageId: string;      // From UI - for dedup
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  serverMessageId: string;
  content: string;
  timestamp: Date;
  uiDirectives?: UIDirectives;
  metadata?: Record<string, unknown>;
}

// ============================================
// Session Types
// ============================================

export interface Session {
  id: string;
  accountId: string;
  state: string;                // Current conversation state
  version: number;              // For optimistic concurrency
  previousResponseId?: string;  // OpenAI response ID for continuity
  lastActiveAt: Date;
  messageCount: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface SessionLock {
  sessionId: string;
  lockedBy: string;             // Request ID
  lockedAt: Date;
  expiresAt: Date;
}

// ============================================
// Idempotency Types
// ============================================

export type IdempotencyStatus = 'pending' | 'done' | 'failed';

export interface IdempotencyRecord {
  key: string;                  // {accountId}:{sessionId}:{decisionType}:{state}:{hash}
  status: IdempotencyStatus;
  result?: unknown;
  lockedBy?: string;
  createdAt: Date;
  expiresAt: Date;
}

// ============================================
// Engine Pipeline Types
// ============================================

export interface ProcessMessageInput {
  message: IncomingMessage;
  accountId: string;
  mode: AccountMode;
  sessionId?: string;
  previousResponseId?: string;
  traceId?: string;
  requestId?: string;
}

export interface ProcessMessageOutput {
  response: OutgoingMessage;
  sessionId: string;
  responseId: string;
  decision: DecisionResult;
  actionResult: ActionResult;
  traceId: string;
  requestId: string;
}

