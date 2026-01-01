/**
 * Rule Engine
 * Loads and applies rules to build DecisionResult
 */

import type { EngineContext } from '../context';
import type { UnderstandingResult } from '../understanding/types';
import type { 
  DecisionResult, 
  Rule, 
  RuleApplication,
  RuleCondition,
  RuleAction,
  UIDirectives,
  ModelStrategy,
} from './types';

// Import rules
import { routingRules } from './rules/routing';
import { escalationRules } from './rules/escalation';
import { securityRules } from './rules/security';
import { costRules } from './rules/cost';
import { personalizationRules } from './rules/personalization';

// All rules sorted by priority (lower = runs first)
const allRules: Rule[] = [
  ...escalationRules,  // Check abuse/escalation first
  ...routingRules,
  ...securityRules,
  ...costRules,
  ...personalizationRules,
].sort((a, b) => a.priority - b.priority);

/**
 * Run all rules and return modified decision
 */
export function runRules(args: {
  ctx: EngineContext;
  understanding: UnderstandingResult;
  decision: DecisionResult;
}): DecisionResult {
  const { ctx, understanding } = args;
  let decision = { ...args.decision };

  const applied: RuleApplication[] = [];

  for (const rule of allRules) {
    // Skip disabled rules
    if (!rule.enabled) continue;

    // Check mode match
    if (rule.mode !== 'both' && rule.mode !== ctx.account.mode) continue;

    // Check account match (for account-specific rules)
    if (rule.accountId && rule.accountId !== ctx.account.id) continue;

    // Check all conditions
    const conditionsMatch = rule.conditions.every(cond => 
      matchesCondition(ctx, understanding, decision, cond)
    );

    if (!conditionsMatch) continue;

    // Apply all actions
    for (const action of rule.actions) {
      decision = applyAction(decision, action, ctx);
    }

    // Record application
    applied.push({
      ruleId: rule.id,
      name: rule.name,
      category: rule.category,
      priority: rule.priority,
      appliedAt: new Date().toISOString(),
    });
  }

  decision.rulesApplied = applied;
  decision.reasoning = applied.length > 0
    ? `Applied ${applied.length} rules: ${applied.map(r => r.name).join(', ')}`
    : 'No rules matched, using default decision';

  return decision;
}

/**
 * Check if a condition matches
 */
function matchesCondition(
  ctx: EngineContext,
  understanding: UnderstandingResult,
  decision: DecisionResult,
  condition: RuleCondition
): boolean {
  const { field, operator, value } = condition;

  // Get field value from context
  const root = { ctx, understanding, decision };
  const fieldValue = getFieldValue(root, field);

  switch (operator) {
    case 'eq':
      return fieldValue === value;
    case 'neq':
      return fieldValue !== value;
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > (value as number);
    case 'gte':
      return typeof fieldValue === 'number' && fieldValue >= (value as number);
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < (value as number);
    case 'lte':
      return typeof fieldValue === 'number' && fieldValue <= (value as number);
    case 'contains':
      return Array.isArray(fieldValue) && fieldValue.includes(value);
    case 'not_contains':
      return Array.isArray(fieldValue) && !fieldValue.includes(value);
    case 'matches':
      return typeof fieldValue === 'string' && new RegExp(value as string, 'i').test(fieldValue);
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'not_in':
      return Array.isArray(value) && !value.includes(fieldValue);
    case 'exists':
      if (Array.isArray(fieldValue)) {
        return fieldValue.length > 0;
      }
      return fieldValue !== undefined && fieldValue !== null;
    case 'not_exists':
      if (Array.isArray(fieldValue)) {
        return fieldValue.length === 0;
      }
      return fieldValue === undefined || fieldValue === null;
    default:
      return false;
  }
}

/**
 * Get nested field value using dot notation
 */
function getFieldValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Apply a rule action to decision
 */
function applyAction(
  decision: DecisionResult,
  action: RuleAction,
  ctx: EngineContext
): DecisionResult {
  const next = { ...decision };

  switch (action.type) {
    case 'set_handler':
      next.handler = action.value as DecisionResult['handler'];
      break;

    case 'set_action':
      next.action = action.value as DecisionResult['action'];
      break;

    case 'set_security_level':
      next.securityLevel = action.value as DecisionResult['securityLevel'];
      break;

    case 'set_model':
      next.modelStrategy = {
        ...next.modelStrategy,
        ...(action.value as Partial<ModelStrategy>),
      };
      break;

    case 'set_ui':
      next.uiDirectives = {
        ...next.uiDirectives,
        ...(action.value as Partial<UIDirectives>),
      };
      break;

    case 'transition_state':
      next.stateTransition = {
        from: ctx.session.state,
        to: action.to || '',
        reason: action.reason || action.type,
      };
      break;

    case 'append_context':
      const newContext = action.value as string[];
      next.contextToInclude = Array.from(new Set([
        ...next.contextToInclude,
        ...newContext,
      ]));
      next.responseStrategy = {
        ...next.responseStrategy,
        contextToInclude: next.contextToInclude,
      };
      break;

    case 'set_response_strategy':
      next.responseStrategy = {
        ...next.responseStrategy,
        ...(action.value as Partial<typeof next.responseStrategy>),
      };
      break;
  }

  return next;
}

/**
 * Get all loaded rules (for debugging)
 */
export function getAllRules(): Rule[] {
  return [...allRules];
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string): Rule[] {
  return allRules.filter(r => r.category === category);
}

