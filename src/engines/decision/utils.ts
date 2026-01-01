/**
 * Decision Engine Utilities
 */

import type { EngineContext } from '../context';
import type { UnderstandingResult } from '../understanding/types';
import type { 
  DecisionResult, 
  UIDirectives, 
  ModelStrategy, 
  ResponseStrategy,
  CostEstimate,
  HandlerType,
  ActionType,
} from './types';

/**
 * Generate a unique decision ID
 * Format: dec_<timestamp>_<random>
 */
export function generateDecisionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `dec_${timestamp}_${random}`;
}

/**
 * Build default decision based on understanding
 */
export function buildDefaultDecision(args: {
  ctx: EngineContext;
  understanding: UnderstandingResult;
  traceId?: string;
  requestId?: string;
}): DecisionResult {
  const { ctx, understanding, traceId = '', requestId = '' } = args;

  // Map intent to default handler
  const handler = mapIntentToHandler(understanding.intent);
  const action = mapIntentToAction(understanding.intent);

  // Default UI directives
  const uiDirectives: UIDirectives = {
    layout: 'chat',
    tone: ctx.account.mode === 'creator' ? 'casual' : 'professional',
    responseLength: 'standard',
    showQuickActions: ['קופונים', 'המלצות', 'בעיה בהזמנה'],
  };

  // Default model strategy
  const modelStrategy: ModelStrategy = {
    model: 'nano',
    fallback: 'standard',
    maxTokens: 300,
    temperature: 0.7,
    timeoutMs: 30000,
    retries: 2,
  };

  // Default response strategy
  const responseStrategy: ResponseStrategy = {
    type: 'with_context',
    contextToInclude: ['persona', 'brands'],
  };

  // Cost estimate
  const costEstimate: CostEstimate = {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
    modelUsed: 'nano',
  };

  return {
    decisionId: generateDecisionId(),
    action,
    handler,
    priority: 5,
    responseStrategy,
    contextToInclude: ['persona', 'brands'],
    uiDirectives,
    channel: 'chat',
    modelStrategy,
    securityLevel: 'public',
    costEstimate,
    reasoning: `Default decision for intent: ${understanding.intent}`,
    rulesApplied: [],
    idempotencyKey: `dec:${ctx.account.id}:${ctx.session.id}:${ctx.session.version}`,
    traceId,
    requestId,
  };
}

/**
 * Map intent to handler
 */
function mapIntentToHandler(intent: string): HandlerType {
  switch (intent) {
    case 'support':
      return 'support_flow';
    case 'sales':
      return 'sales_flow';
    case 'handoff_human':
    case 'abuse':
      return 'human';
    default:
      return 'chat';
  }
}

/**
 * Map intent to action
 */
function mapIntentToAction(intent: string): ActionType {
  switch (intent) {
    case 'handoff_human':
      return 'escalate';
    case 'abuse':
      return 'notify';
    case 'unknown':
      return 'clarify';
    default:
      return 'respond';
  }
}

/**
 * Merge UI directives
 */
export function mergeUIDirectives(
  base: UIDirectives,
  override: Partial<UIDirectives>
): UIDirectives {
  return {
    ...base,
    ...override,
    // Merge arrays instead of replacing
    showQuickActions: override.showQuickActions || base.showQuickActions,
    nextBestActions: override.nextBestActions || base.nextBestActions,
  };
}

/**
 * Merge model strategy
 */
export function mergeModelStrategy(
  base: ModelStrategy,
  override: Partial<ModelStrategy>
): ModelStrategy {
  return {
    ...base,
    ...override,
  };
}

