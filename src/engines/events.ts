/**
 * ============================================
 * Event Model v2 P0
 * ============================================
 * 
 * Complete event model for Event Sourcing architecture.
 * Every action is an event. Events enable:
 * - Audit trail
 * - Debugging
 * - Analytics
 * - Learning loop
 */

import type { AccountMode, SecurityLevel, ModelTier } from './types';

// ============================================
// Event Types
// ============================================

export type EventType =
  // ===== Interaction Events =====
  | 'message_received'
  | 'quick_action_clicked'
  | 'form_submitted'
  | 'file_uploaded'
  
  // ===== Understanding Events =====
  | 'intent_detected'
  | 'entities_extracted'
  | 'ambiguity_detected'
  | 'risk_flagged'
  | 'topic_classified'
  
  // ===== Decision Events =====
  | 'decision_made'
  | 'rule_applied'
  | 'rule_skipped'
  | 'policy_checked'
  | 'policy_blocked'
  | 'policy_warning'
  
  // ===== State Events =====
  | 'state_changed'
  | 'flow_started'
  | 'flow_completed'
  | 'flow_cancelled'
  | 'flow_timeout'
  
  // ===== Action Events =====
  | 'response_sent'
  | 'notification_sent'
  | 'notification_failed'
  | 'support_ticket_created'
  | 'sale_initiated'
  | 'webhook_triggered'
  
  // ===== Escalation Events =====
  | 'escalation_triggered'
  | 'escalation_accepted'
  | 'escalation_resolved'
  
  // ===== Cost Events =====
  | 'tokens_consumed'
  | 'cost_threshold_warning'
  | 'cost_threshold_exceeded'
  | 'rate_limit_hit'
  
  // ===== Outcome Events (for Learning) =====
  | 'coupon_copied'
  | 'link_clicked'
  | 'product_viewed'
  | 'support_resolved'
  | 'user_satisfied'           // thumbs up
  | 'user_unsatisfied'         // thumbs down
  | 'conversation_abandoned'
  | 'conversation_completed'
  
  // ===== System Events =====
  | 'session_started'
  | 'session_resumed'
  | 'session_expired'
  | 'error_occurred'
  | 'lock_acquired'
  | 'lock_released'
  | 'lock_timeout';

// ============================================
// Event Categories (for filtering/routing)
// ============================================

export type EventCategory =
  | 'interaction'
  | 'understanding'
  | 'decision'
  | 'state'
  | 'action'
  | 'escalation'
  | 'cost'
  | 'outcome'
  | 'system';

export const EVENT_CATEGORIES: Record<EventType, EventCategory> = {
  // Interaction
  'message_received': 'interaction',
  'quick_action_clicked': 'interaction',
  'form_submitted': 'interaction',
  'file_uploaded': 'interaction',
  
  // Understanding
  'intent_detected': 'understanding',
  'entities_extracted': 'understanding',
  'ambiguity_detected': 'understanding',
  'risk_flagged': 'understanding',
  'topic_classified': 'understanding',
  
  // Decision
  'decision_made': 'decision',
  'rule_applied': 'decision',
  'rule_skipped': 'decision',
  'policy_checked': 'decision',
  'policy_blocked': 'decision',
  'policy_warning': 'decision',
  
  // State
  'state_changed': 'state',
  'flow_started': 'state',
  'flow_completed': 'state',
  'flow_cancelled': 'state',
  'flow_timeout': 'state',
  
  // Action
  'response_sent': 'action',
  'notification_sent': 'action',
  'notification_failed': 'action',
  'support_ticket_created': 'action',
  'sale_initiated': 'action',
  'webhook_triggered': 'action',
  
  // Escalation
  'escalation_triggered': 'escalation',
  'escalation_accepted': 'escalation',
  'escalation_resolved': 'escalation',
  
  // Cost
  'tokens_consumed': 'cost',
  'cost_threshold_warning': 'cost',
  'cost_threshold_exceeded': 'cost',
  'rate_limit_hit': 'cost',
  
  // Outcome
  'coupon_copied': 'outcome',
  'link_clicked': 'outcome',
  'product_viewed': 'outcome',
  'support_resolved': 'outcome',
  'user_satisfied': 'outcome',
  'user_unsatisfied': 'outcome',
  'conversation_abandoned': 'outcome',
  'conversation_completed': 'outcome',
  
  // System
  'session_started': 'system',
  'session_resumed': 'system',
  'session_expired': 'system',
  'error_occurred': 'system',
  'lock_acquired': 'system',
  'lock_released': 'system',
  'lock_timeout': 'system',
};

// ============================================
// Event Metadata
// ============================================

export interface EventMetadata {
  // Tracing
  traceId: string;
  requestId: string;
  
  // Source
  source: 'chat' | 'api' | 'webhook' | 'cron' | 'system';
  engineVersion: string;
  
  // Rules (for decision events)
  rulesVersion?: string;
  
  // Cost tracking
  cost?: number;
  tokensUsed?: number;
  modelUsed?: ModelTier;
  
  // Performance
  latencyMs?: number;
  
  // Idempotency
  idempotencyKey?: string;
  
  // Security
  securityLevel?: SecurityLevel;
  
  // Custom extensions
  custom?: Record<string, unknown>;
}

// ============================================
// System Event Schema
// ============================================

export interface SystemEvent {
  id: string;
  type: EventType;
  category: EventCategory;
  timestamp: Date;
  
  // Context
  accountId: string;
  sessionId: string;
  mode: AccountMode;
  
  // Payload (type-specific data)
  payload: Record<string, unknown>;
  
  // Metadata
  metadata: EventMetadata;
}

// ============================================
// Typed Event Payloads
// ============================================

export interface MessageReceivedPayload {
  messageId: string;
  clientMessageId: string;
  contentLength: number;
  hasAttachments: boolean;
  // Note: actual content is NOT stored for privacy
}

export interface IntentDetectedPayload {
  intent: string;
  confidence: number;
  topic?: string;
  requiresHuman: boolean;
}

export interface DecisionMadePayload {
  decisionType: string;
  handler: string;
  actionPlanLength: number;
  stateTransition?: {
    from: string;
    to: string;
  };
}

export interface RuleAppliedPayload {
  ruleId: string;
  ruleName: string;
  category: string;
  priority: number;
  version: number;
  matched: boolean;
}

export interface StateChangedPayload {
  previousState: string;
  newState: string;
  trigger: string;
  reason?: string;
}

export interface ResponseSentPayload {
  responseId: string;
  channel: string;
  contentLength: number;
  hasUIDirectives: boolean;
}

export interface TokensConsumedPayload {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: ModelTier;
  estimatedCost: number;
}

export interface OutcomeEventPayload {
  outcomeType: string;
  relatedEntityId?: string;      // coupon_id, product_id, etc.
  relatedEntityType?: string;
  value?: number;                // For revenue tracking
}

export interface ErrorOccurredPayload {
  errorCode: string;
  errorMessage: string;
  errorStack?: string;
  recoverable: boolean;
  retryable: boolean;
}

// ============================================
// Event Emitter Interface
// ============================================

export interface EventEmitter {
  /**
   * Emit a single event
   */
  emit(event: Omit<SystemEvent, 'id' | 'timestamp' | 'category'>): Promise<string>;
  
  /**
   * Emit multiple events in batch
   */
  emitBatch(events: Array<Omit<SystemEvent, 'id' | 'timestamp' | 'category'>>): Promise<string[]>;
  
  /**
   * Subscribe to events (for real-time processing)
   */
  subscribe(
    filter: { types?: EventType[]; categories?: EventCategory[]; accountId?: string },
    handler: (event: SystemEvent) => void
  ): () => void;
}

// ============================================
// Event Query Interface
// ============================================

export interface EventQuery {
  accountId?: string;
  sessionId?: string;
  types?: EventType[];
  categories?: EventCategory[];
  startTime?: Date;
  endTime?: Date;
  traceId?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
}

export interface EventStore {
  /**
   * Store events
   */
  store(events: SystemEvent[]): Promise<void>;
  
  /**
   * Query events
   */
  query(query: EventQuery): Promise<SystemEvent[]>;
  
  /**
   * Get events by trace ID (for debugging)
   */
  getByTraceId(traceId: string): Promise<SystemEvent[]>;
  
  /**
   * Get session timeline
   */
  getSessionTimeline(sessionId: string): Promise<SystemEvent[]>;
  
  /**
   * Aggregate for analytics
   */
  aggregate(
    accountId: string,
    period: { start: Date; end: Date },
    groupBy: 'type' | 'category' | 'day'
  ): Promise<Array<{ key: string; count: number }>>;
}

// ============================================
// Privacy-Safe Event Creation
// ============================================

/**
 * Create event with automatic PII redaction
 */
export function createSafeEvent(
  type: EventType,
  accountId: string,
  sessionId: string,
  mode: AccountMode,
  payload: Record<string, unknown>,
  metadata: Partial<EventMetadata>
): Omit<SystemEvent, 'id' | 'timestamp'> {
  // Redact known PII fields
  const safePayload = redactPII(payload);
  
  return {
    type,
    category: EVENT_CATEGORIES[type],
    accountId,
    sessionId,
    mode,
    payload: safePayload,
    metadata: {
      traceId: metadata.traceId || generateTraceId(),
      requestId: metadata.requestId || generateRequestId(),
      source: metadata.source || 'system',
      engineVersion: metadata.engineVersion || '2.0.0',
      ...metadata,
    },
  };
}

// ============================================
// PII Redaction
// ============================================

const PII_FIELDS = ['phone', 'email', 'orderNumber', 'address', 'fullName', 'customerPhone'];

function redactPII(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(payload)) {
    if (PII_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      // Mask the value
      if (typeof value === 'string') {
        result[key] = maskString(value);
      } else {
        result[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively redact nested objects
      result[key] = redactPII(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

function maskString(value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}



