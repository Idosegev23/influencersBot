/**
 * ============================================
 * Database Rule Loader with Caching
 * ============================================
 * 
 * Loads rules from DB with:
 * - Global rules (account_id is null)
 * - Account-specific rules
 * - Caching with version-based invalidation
 * - Debug info for rule matching
 */

import { supabase } from '@/lib/supabase';
import { cacheWrap, CacheTags, cacheInvalidateTag } from '@/lib/cache';
import type { Rule, RuleCondition, RuleAction } from '../types';

// ============================================
// Types
// ============================================

interface DBRule {
  id: string;
  name: string;
  description: string | null;
  category: string;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  mode: 'creator' | 'brand' | 'both' | null;
  account_id: string | null;
  enabled: boolean;
  version: number;
  published_at: string | null;
  updated_by: string | null;
  created_at: string;
}

export interface RuleLoadResult {
  rules: Rule[];
  globalRulesVersion: number;
  accountRulesVersion: number;
  loadedAt: Date;
  fromCache: boolean;
  loadTimeMs: number;
}

// ============================================
// Cache Configuration
// ============================================

const CACHE_TTL_GLOBAL_RULES = 5 * 60 * 1000;   // 5 minutes
const CACHE_TTL_ACCOUNT_RULES = 2 * 60 * 1000;  // 2 minutes
const CACHE_STALE_EXTENSION = 30 * 1000;        // 30 seconds

// ============================================
// Cache Keys
// ============================================

const CacheKeys = {
  globalRules: () => `rules:global`,
  accountRules: (accountId: string) => `rules:account:${accountId}`,
  globalRulesVersion: () => `rules:global:version`,
  accountRulesVersion: (accountId: string) => `rules:account:${accountId}:version`,
};

// ============================================
// Load Global Rules (cached)
// ============================================

async function loadGlobalRulesFromDB(): Promise<DBRule[]> {
  const { data, error } = await supabase
    .from('decision_rules')
    .select('*')
    .is('account_id', null)
    .eq('enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[RuleLoader] Error loading global rules:', error);
    return [];
  }

  return (data || []) as DBRule[];
}

async function loadGlobalRulesCached(): Promise<{ rules: DBRule[]; fromCache: boolean; loadTimeMs: number }> {
  const result = await cacheWrap(
    CacheKeys.globalRules(),
    loadGlobalRulesFromDB,
    {
      ttlMs: CACHE_TTL_GLOBAL_RULES,
      tags: ['rules:global'],
      staleWhileRevalidateMs: CACHE_STALE_EXTENSION,
    }
  );

  return {
    rules: result.value,
    fromCache: result.fromCache,
    loadTimeMs: result.loadTimeMs,
  };
}

// ============================================
// Load Account Rules (cached)
// ============================================

async function loadAccountRulesFromDB(accountId: string): Promise<DBRule[]> {
  const { data, error } = await supabase
    .from('decision_rules')
    .select('*')
    .eq('account_id', accountId)
    .eq('enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[RuleLoader] Error loading account rules:', error);
    return [];
  }

  return (data || []) as DBRule[];
}

async function loadAccountRulesCached(
  accountId: string
): Promise<{ rules: DBRule[]; fromCache: boolean; loadTimeMs: number }> {
  const result = await cacheWrap(
    CacheKeys.accountRules(accountId),
    () => loadAccountRulesFromDB(accountId),
    {
      ttlMs: CACHE_TTL_ACCOUNT_RULES,
      tags: [CacheTags.account(accountId), `rules:account:${accountId}`],
      staleWhileRevalidateMs: CACHE_STALE_EXTENSION,
    }
  );

  return {
    rules: result.value,
    fromCache: result.fromCache,
    loadTimeMs: result.loadTimeMs,
  };
}

// ============================================
// Convert DB Rule to Engine Rule
// ============================================

function dbRuleToEngineRule(dbRule: DBRule): Rule {
  return {
    id: dbRule.id,
    name: dbRule.name,
    description: dbRule.description || undefined,
    category: dbRule.category as Rule['category'],
    priority: dbRule.priority,
    mode: (dbRule.mode || 'both') as Rule['mode'],
    accountId: dbRule.account_id || undefined,
    enabled: dbRule.enabled,
    conditions: dbRule.conditions,
    actions: dbRule.actions,
    version: dbRule.version,
    source: 'db',
  };
}

// ============================================
// Main Load Function
// ============================================

export async function loadRulesFromDB(
  accountId: string,
  mode: 'creator' | 'brand'
): Promise<RuleLoadResult> {
  const startMs = Date.now();

  // Load global and account rules in parallel
  const [globalResult, accountResult] = await Promise.all([
    loadGlobalRulesCached(),
    loadAccountRulesCached(accountId),
  ]);

  // Combine and convert rules
  const allDBRules = [...globalResult.rules, ...accountResult.rules];
  
  // Filter by mode and convert
  const rules = allDBRules
    .filter(r => r.mode === 'both' || r.mode === mode || r.mode === null)
    .map(dbRuleToEngineRule);

  // Sort by priority (lower = higher priority)
  rules.sort((a, b) => a.priority - b.priority);

  return {
    rules,
    globalRulesVersion: globalResult.rules.length,
    accountRulesVersion: accountResult.rules.length,
    loadedAt: new Date(),
    fromCache: globalResult.fromCache && accountResult.fromCache,
    loadTimeMs: Date.now() - startMs,
  };
}

// ============================================
// Cache Invalidation
// ============================================

/**
 * Invalidate global rules cache
 */
export function invalidateGlobalRulesCache(): void {
  cacheInvalidateTag('rules:global');
}

/**
 * Invalidate account rules cache
 */
export function invalidateAccountRulesCache(accountId: string): void {
  cacheInvalidateTag(`rules:account:${accountId}`);
}

/**
 * Invalidate all rules cache for an account (including global)
 */
export function invalidateAllRulesCache(accountId: string): void {
  invalidateGlobalRulesCache();
  invalidateAccountRulesCache(accountId);
}

// ============================================
// CRUD Operations (for Admin API)
// ============================================

export interface CreateRuleInput {
  name: string;
  description?: string;
  category: string;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  mode?: 'creator' | 'brand' | 'both';
  accountId?: string;
  enabled?: boolean;
}

export async function createRule(input: CreateRuleInput): Promise<{ rule: Rule | null; error?: string }> {
  const { data, error } = await supabase
    .from('decision_rules')
    .insert({
      name: input.name,
      description: input.description || null,
      category: input.category,
      priority: input.priority,
      conditions: input.conditions,
      actions: input.actions,
      mode: input.mode || 'both',
      account_id: input.accountId || null,
      enabled: input.enabled ?? true,
      version: 1,
      published_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[RuleLoader] Create rule error:', error);
    return { rule: null, error: error.message };
  }

  // Invalidate cache
  if (input.accountId) {
    invalidateAccountRulesCache(input.accountId);
  } else {
    invalidateGlobalRulesCache();
  }

  return { rule: dbRuleToEngineRule(data as DBRule) };
}

export interface UpdateRuleInput {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  priority?: number;
  conditions?: RuleCondition[];
  actions?: RuleAction[];
  mode?: 'creator' | 'brand' | 'both';
  enabled?: boolean;
}

export async function updateRule(input: UpdateRuleInput): Promise<{ rule: Rule | null; error?: string }> {
  // First get the existing rule to know its account
  const { data: existing } = await supabase
    .from('decision_rules')
    .select('account_id, version')
    .eq('id', input.id)
    .single();

  if (!existing) {
    return { rule: null, error: 'Rule not found' };
  }

  const updates: Record<string, unknown> = {
    version: (existing.version || 1) + 1,
    published_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.category !== undefined) updates.category = input.category;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.conditions !== undefined) updates.conditions = input.conditions;
  if (input.actions !== undefined) updates.actions = input.actions;
  if (input.mode !== undefined) updates.mode = input.mode;
  if (input.enabled !== undefined) updates.enabled = input.enabled;

  const { data, error } = await supabase
    .from('decision_rules')
    .update(updates)
    .eq('id', input.id)
    .select()
    .single();

  if (error) {
    console.error('[RuleLoader] Update rule error:', error);
    return { rule: null, error: error.message };
  }

  // Invalidate cache
  if (existing.account_id) {
    invalidateAccountRulesCache(existing.account_id);
  } else {
    invalidateGlobalRulesCache();
  }

  return { rule: dbRuleToEngineRule(data as DBRule) };
}

export async function deleteRule(ruleId: string): Promise<{ success: boolean; error?: string }> {
  // First get the rule to know its account
  const { data: existing } = await supabase
    .from('decision_rules')
    .select('account_id')
    .eq('id', ruleId)
    .single();

  if (!existing) {
    return { success: false, error: 'Rule not found' };
  }

  const { error } = await supabase
    .from('decision_rules')
    .delete()
    .eq('id', ruleId);

  if (error) {
    console.error('[RuleLoader] Delete rule error:', error);
    return { success: false, error: error.message };
  }

  // Invalidate cache
  if (existing.account_id) {
    invalidateAccountRulesCache(existing.account_id);
  } else {
    invalidateGlobalRulesCache();
  }

  return { success: true };
}

export async function toggleRule(ruleId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
  return updateRule({ id: ruleId, enabled }).then(result => ({
    success: !!result.rule,
    error: result.error,
  }));
}

// ============================================
// List Rules (for Admin UI)
// ============================================

export interface ListRulesOptions {
  accountId?: string;
  category?: string;
  mode?: 'creator' | 'brand' | 'both';
  enabled?: boolean;
  includeGlobal?: boolean;
}

export async function listRules(options: ListRulesOptions = {}): Promise<{ rules: Rule[]; error?: string }> {
  let query = supabase
    .from('decision_rules')
    .select('*')
    .order('priority', { ascending: true });

  // Filter by account
  if (options.accountId) {
    if (options.includeGlobal) {
      // Account rules + global
      query = query.or(`account_id.eq.${options.accountId},account_id.is.null`);
    } else {
      query = query.eq('account_id', options.accountId);
    }
  } else if (!options.includeGlobal) {
    // Only global rules
    query = query.is('account_id', null);
  }

  if (options.category) {
    query = query.eq('category', options.category);
  }

  if (options.mode) {
    query = query.or(`mode.eq.${options.mode},mode.eq.both,mode.is.null`);
  }

  if (options.enabled !== undefined) {
    query = query.eq('enabled', options.enabled);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[RuleLoader] List rules error:', error);
    return { rules: [], error: error.message };
  }

  return {
    rules: (data || []).map(r => dbRuleToEngineRule(r as DBRule)),
  };
}

// ============================================
// Test Rule (for Admin UI)
// ============================================

export interface TestRuleInput {
  rule: Rule;
  message: string;
  intent: string;
  confidence: number;
  entities: Record<string, string>;
  mode: 'creator' | 'brand';
}

export interface TestRuleResult {
  matched: boolean;
  matchedConditions: Array<{ field: string; expected: unknown; actual: unknown; result: boolean }>;
  wouldApply: RuleAction[];
}

export function testRule(input: TestRuleInput): TestRuleResult {
  const { rule, message, intent, confidence, entities, mode } = input;
  
  // Build test context
  const testContext = {
    understanding: { intent, confidence, entities },
    ctx: { account: { mode } },
    message,
  };

  const matchedConditions: TestRuleResult['matchedConditions'] = [];
  let allMatched = true;

  for (const condition of rule.conditions) {
    const value = getField(testContext, condition.field);
    const result = evaluateCondition(value, condition.operator, condition.value);
    
    matchedConditions.push({
      field: condition.field,
      expected: condition.value,
      actual: value,
      result,
    });

    if (!result) allMatched = false;
  }

  return {
    matched: allMatched,
    matchedConditions,
    wouldApply: allMatched ? rule.actions : [],
  };
}

// Helper functions for condition evaluation
function getField(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function evaluateCondition(value: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case 'eq':
      return value === expected;
    case 'neq':
      return value !== expected;
    case 'gt':
      return typeof value === 'number' && value > (expected as number);
    case 'gte':
      return typeof value === 'number' && value >= (expected as number);
    case 'lt':
      return typeof value === 'number' && value < (expected as number);
    case 'lte':
      return typeof value === 'number' && value <= (expected as number);
    case 'contains':
      if (Array.isArray(value)) return value.includes(expected);
      if (typeof value === 'string') return value.includes(expected as string);
      return false;
    case 'matches':
      return typeof value === 'string' && new RegExp(expected as string).test(value);
    case 'exists':
      return value !== undefined && value !== null;
    case 'not_exists':
      return value === undefined || value === null;
    default:
      return false;
  }
}

