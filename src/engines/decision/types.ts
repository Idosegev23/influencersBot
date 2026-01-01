/**
 * ============================================
 * Decision Engine Types
 * ============================================
 */

import type { EngineContext } from '../context';
import type { UnderstandingResult } from '../understanding/types';

// Rule types
export type RuleCategory = 
  | 'routing'
  | 'escalation'
  | 'personalization'
  | 'cost'
  | 'security';

export type ConditionOperator = 
  | 'eq' | 'neq' 
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains'
  | 'matches' | 'in' | 'not_in'
  | 'exists' | 'not_exists';

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export type RuleActionType = 
  | 'set_handler'
  | 'set_action'
  | 'set_security_level'
  | 'set_model'
  | 'set_ui'
  | 'transition_state'
  | 'append_context'
  | 'set_response_strategy';

export interface RuleAction {
  type: RuleActionType;
  value?: unknown;
  to?: string;
  reason?: string;
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  category: RuleCategory;
  priority: number;
  mode: 'creator' | 'brand' | 'both';
  accountId?: string;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export interface RuleApplication {
  ruleId: string;
  name: string;
  category: string;
  priority: number;
  appliedAt: string;
}

// Handler types
export type HandlerType = 
  | 'chat' 
  | 'support_flow' 
  | 'sales_flow' 
  | 'human' 
  | 'notification_only';

export type ActionType = 
  | 'respond'
  | 'clarify'
  | 'escalate'
  | 'notify'
  | 'defer';

export type SecurityLevel = 'public' | 'authenticated' | 'owner_only';

export type ModelTier = 'nano' | 'standard' | 'full';

// UI Directives
export interface UIDirectives {
  layout?: 'chat' | 'cards_first' | 'form_first';
  showCardList?: 'brands' | 'products' | 'content';
  showQuickActions?: string[];
  showProgress?: {
    current: number;
    total: number;
    label: string;
  };
  showForm?: 'phone' | 'order' | 'problem' | 'name';
  tone?: 'casual' | 'professional' | 'empathetic';
  responseLength?: 'short' | 'standard' | 'deep';
  nextBestActions?: Array<{
    id: string;
    label: string;
    payload?: Record<string, unknown>;
  }>;
}

// Model Strategy
export interface ModelStrategy {
  model: ModelTier;
  fallback?: ModelTier;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  retries?: number;
}

// State Transition
export interface StateTransition {
  from: string;
  to: string;
  reason: string;
}

// Response Strategy
export interface ResponseStrategy {
  type: 'direct' | 'with_context' | 'with_search' | 'template';
  contextToInclude?: string[];
  templateId?: string;
}

// Cost Estimate
export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  modelUsed: ModelTier;
}

// Full Decision Result
export interface DecisionResult {
  // Core
  action: ActionType;
  handler: HandlerType;
  priority: number;
  
  // State
  stateTransition?: StateTransition;
  
  // Response
  responseStrategy: ResponseStrategy;
  contextToInclude: string[];
  
  // UI
  uiDirectives: UIDirectives;
  channel: 'chat' | 'whatsapp' | 'email' | 'none';
  
  // Model
  modelStrategy: ModelStrategy;
  
  // Security
  securityLevel: SecurityLevel;
  
  // Cost
  costEstimate: CostEstimate;
  
  // Audit
  reasoning: string;
  rulesApplied: RuleApplication[];
  
  // Tracing
  idempotencyKey: string;
  traceId: string;
  requestId: string;
}

// Decision Input
export interface DecisionInput {
  ctx: EngineContext;
  understanding: UnderstandingResult;
  traceId: string;
  requestId: string;
}

