/**
 * ============================================
 * Decision Engine v1
 * ============================================
 * 
 * The "brain" of the system.
 * Takes Understanding result and Context, outputs Decision with:
 * - Handler selection
 * - UI directives
 * - Model strategy
 * - Security level
 */

import type { EngineContext } from '../context';
import type { UnderstandingResult } from '../understanding/types';
import type { DecisionResult, DecisionInput } from './types';
import { runRules, getAllRules, getRulesByCategory } from './rule-engine';
import { buildDefaultDecision } from './utils';

// Re-export types
export * from './types';

// Re-export utilities
export { getAllRules, getRulesByCategory };

/**
 * Main decision function
 * 
 * @param input - Decision input with context and understanding
 * @returns DecisionResult with handler, UI directives, model strategy
 */
export async function decide(input: DecisionInput): Promise<DecisionResult> {
  const { ctx, understanding, traceId, requestId } = input;

  // Build default decision as baseline
  let decision = buildDefaultDecision({
    ctx,
    understanding,
    traceId,
    requestId,
  });

  // Apply rules to modify decision
  decision = runRules({
    ctx,
    understanding,
    decision,
  });

  // Ensure idempotency key is set
  decision.idempotencyKey = decision.idempotencyKey ||
    `dec:${ctx.account.id}:${ctx.session.id}:${ctx.session.version}`;

  // Set trace IDs
  decision.traceId = traceId;
  decision.requestId = requestId;

  return decision;
}

/**
 * Quick decision for simple cases (no async operations)
 */
export function decideSync(args: {
  ctx: EngineContext;
  understanding: UnderstandingResult;
  traceId?: string;
  requestId?: string;
}): DecisionResult {
  const { ctx, understanding, traceId = '', requestId = '' } = args;

  let decision = buildDefaultDecision({
    ctx,
    understanding,
    traceId,
    requestId,
  });

  decision = runRules({
    ctx,
    understanding,
    decision,
  });

  return decision;
}

/**
 * Check if decision requires state transition
 */
export function hasStateTransition(decision: DecisionResult): boolean {
  return !!decision.stateTransition;
}

/**
 * Get UI directives summary for logging
 */
export function getUIDirectivesSummary(decision: DecisionResult): string {
  const { uiDirectives } = decision;
  const parts: string[] = [];

  if (uiDirectives.showCardList) parts.push(`cards:${uiDirectives.showCardList}`);
  if (uiDirectives.showForm) parts.push(`form:${uiDirectives.showForm}`);
  if (uiDirectives.showProgress) parts.push(`progress:${uiDirectives.showProgress.current}/${uiDirectives.showProgress.total}`);
  if (uiDirectives.showQuickActions?.length) parts.push(`actions:${uiDirectives.showQuickActions.length}`);
  if (uiDirectives.tone) parts.push(`tone:${uiDirectives.tone}`);
  if (uiDirectives.responseLength) parts.push(`length:${uiDirectives.responseLength}`);

  return parts.join(', ') || 'default';
}

/**
 * Get model strategy summary for logging
 */
export function getModelStrategySummary(decision: DecisionResult): string {
  const { modelStrategy } = decision;
  return `${modelStrategy.model}:${modelStrategy.maxTokens}tok`;
}



