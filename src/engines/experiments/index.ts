/**
 * ============================================
 * Experiments (A/B Testing) Engine
 * ============================================
 * 
 * Assign users to experiment variants and track results.
 * 
 * Features:
 * - Consistent assignment per anonId
 * - Multiple active experiments
 * - Variant affects UI directives only
 * - Tracking for conversion analysis
 */

import { supabase } from '@/lib/supabase';
import { emitEvent } from '../events-emitter';
import { cacheWrap, cacheInvalidateTag } from '@/lib/cache';
import type { UIDirectives } from '../decision/types';

// ============================================
// Types
// ============================================

export interface Experiment {
  id: string;
  key: string;
  name: string;
  description?: string;
  variants: ExperimentVariant[];
  allocation: number; // 0-100, percentage of users in experiment
  targetMode?: 'creator' | 'brand' | 'both';
  targetIntents?: string[];
  enabled: boolean;
  startAt?: Date;
  endAt?: Date;
  createdAt: Date;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number; // Relative weight for allocation
  uiOverrides: Partial<UIDirectives>;
  description?: string;
}

export interface ExperimentAssignment {
  experimentKey: string;
  variantId: string;
  variantName: string;
  assignedAt: Date;
}

export interface ExperimentContext {
  anonId: string;
  sessionId: string;
  accountId: string;
  mode: 'creator' | 'brand';
  intent?: string;
}

// ============================================
// Cache Configuration
// ============================================

const CACHE_TTL_EXPERIMENTS = 2 * 60 * 1000; // 2 minutes

// ============================================
// Database Operations
// ============================================

interface DBExperiment {
  id: string;
  key: string;
  name: string;
  description: string | null;
  variants: ExperimentVariant[];
  allocation: number;
  target_mode: string | null;
  target_intents: string[] | null;
  enabled: boolean;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}

async function loadActiveExperimentsFromDB(): Promise<Experiment[]> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('experiments')
    .select('*')
    .eq('enabled', true)
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`);

  if (error) {
    console.error('[Experiments] Error loading experiments:', error);
    return [];
  }

  return (data || []).map((e: DBExperiment) => ({
    id: e.id,
    key: e.key,
    name: e.name,
    description: e.description || undefined,
    variants: e.variants,
    allocation: e.allocation,
    targetMode: e.target_mode as Experiment['targetMode'],
    targetIntents: e.target_intents || undefined,
    enabled: e.enabled,
    startAt: e.start_at ? new Date(e.start_at) : undefined,
    endAt: e.end_at ? new Date(e.end_at) : undefined,
    createdAt: new Date(e.created_at),
  }));
}

async function loadActiveExperimentsCached(): Promise<Experiment[]> {
  const result = await cacheWrap(
    'experiments:active',
    loadActiveExperimentsFromDB,
    {
      ttlMs: CACHE_TTL_EXPERIMENTS,
      tags: ['experiments'],
    }
  );
  return result.value;
}

// ============================================
// Assignment Logic
// ============================================

/**
 * Deterministic hash for consistent assignment
 */
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Check if user is in experiment allocation
 */
function isUserInExperiment(anonId: string, experimentKey: string, allocation: number): boolean {
  const hash = hashString(`${anonId}:${experimentKey}:allocation`);
  return (hash % 100) < allocation;
}

/**
 * Select variant based on weights
 */
function selectVariant(anonId: string, experimentKey: string, variants: ExperimentVariant[]): ExperimentVariant {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  const hash = hashString(`${anonId}:${experimentKey}:variant`);
  const bucket = hash % totalWeight;
  
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return variant;
    }
  }
  
  return variants[0]; // Fallback
}

/**
 * Check if experiment applies to this context
 */
function experimentApplies(experiment: Experiment, ctx: ExperimentContext): boolean {
  // Check mode
  if (experiment.targetMode && experiment.targetMode !== 'both' && experiment.targetMode !== ctx.mode) {
    return false;
  }
  
  // Check intent
  if (experiment.targetIntents?.length && ctx.intent) {
    if (!experiment.targetIntents.includes(ctx.intent)) {
      return false;
    }
  }
  
  return true;
}

// ============================================
// Main Functions
// ============================================

/**
 * Get all experiment assignments for a user
 */
export async function getExperimentAssignments(
  ctx: ExperimentContext
): Promise<ExperimentAssignment[]> {
  const experiments = await loadActiveExperimentsCached();
  const assignments: ExperimentAssignment[] = [];

  for (const experiment of experiments) {
    // Check if experiment applies to this context
    if (!experimentApplies(experiment, ctx)) {
      continue;
    }

    // Check if user is in experiment allocation
    if (!isUserInExperiment(ctx.anonId, experiment.key, experiment.allocation)) {
      continue;
    }

    // Assign variant
    const variant = selectVariant(ctx.anonId, experiment.key, experiment.variants);
    
    assignments.push({
      experimentKey: experiment.key,
      variantId: variant.id,
      variantName: variant.name,
      assignedAt: new Date(),
    });
  }

  return assignments;
}

/**
 * Apply experiment overrides to UI directives
 */
export async function applyExperiments(
  ctx: ExperimentContext,
  baseDirectives: UIDirectives
): Promise<{
  directives: UIDirectives;
  experiments: ExperimentAssignment[];
}> {
  const assignments = await getExperimentAssignments(ctx);
  let directives = { ...baseDirectives };

  // Apply each experiment's variant overrides
  for (const assignment of assignments) {
    const experiments = await loadActiveExperimentsCached();
    const experiment = experiments.find(e => e.key === assignment.experimentKey);
    
    if (experiment) {
      const variant = experiment.variants.find(v => v.id === assignment.variantId);
      if (variant?.uiOverrides) {
        directives = {
          ...directives,
          ...variant.uiOverrides,
          // Merge arrays instead of replacing
          showQuickActions: variant.uiOverrides.showQuickActions 
            ? variant.uiOverrides.showQuickActions 
            : directives.showQuickActions,
        };
      }
    }
  }

  return { directives, experiments: assignments };
}

/**
 * Track experiment exposure (when user sees the variant)
 */
export async function trackExperimentExposure(
  ctx: ExperimentContext,
  assignment: ExperimentAssignment,
  decisionId: string
): Promise<void> {
  await emitEvent({
    type: 'experiment_exposed',
    accountId: ctx.accountId,
    sessionId: ctx.sessionId,
    mode: ctx.mode,
    payload: {
      experimentKey: assignment.experimentKey,
      variantId: assignment.variantId,
      variantName: assignment.variantName,
      anonId: ctx.anonId,
      decisionId,
    },
    metadata: {
      source: 'experiments',
      engineVersion: 'v2',
    },
  });
}

/**
 * Track experiment conversion
 */
export async function trackExperimentConversion(
  ctx: ExperimentContext,
  experimentKey: string,
  conversionType: 'coupon_copied' | 'link_clicked' | 'support_created' | 'satisfied' | 'unsatisfied',
  decisionId?: string
): Promise<void> {
  await emitEvent({
    type: 'experiment_converted',
    accountId: ctx.accountId,
    sessionId: ctx.sessionId,
    mode: ctx.mode,
    payload: {
      experimentKey,
      conversionType,
      anonId: ctx.anonId,
      decisionId,
    },
    metadata: {
      source: 'experiments',
      engineVersion: 'v2',
    },
  });
}

// ============================================
// Admin Functions
// ============================================

export interface CreateExperimentInput {
  key: string;
  name: string;
  description?: string;
  variants: Array<{
    name: string;
    weight: number;
    uiOverrides: Partial<UIDirectives>;
    description?: string;
  }>;
  allocation: number;
  targetMode?: 'creator' | 'brand' | 'both';
  targetIntents?: string[];
  enabled?: boolean;
  startAt?: Date;
  endAt?: Date;
}

export async function createExperiment(input: CreateExperimentInput): Promise<{ experiment: Experiment | null; error?: string }> {
  // Generate variant IDs
  const variants: ExperimentVariant[] = input.variants.map((v, i) => ({
    id: `variant_${Date.now()}_${i}`,
    name: v.name,
    weight: v.weight,
    uiOverrides: v.uiOverrides,
    description: v.description,
  }));

  const { data, error } = await supabase
    .from('experiments')
    .insert({
      key: input.key,
      name: input.name,
      description: input.description || null,
      variants,
      allocation: input.allocation,
      target_mode: input.targetMode || 'both',
      target_intents: input.targetIntents || null,
      enabled: input.enabled ?? true,
      start_at: input.startAt?.toISOString() || null,
      end_at: input.endAt?.toISOString() || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[Experiments] Create error:', error);
    return { experiment: null, error: error.message };
  }

  // Invalidate cache
  cacheInvalidateTag('experiments');

  const exp = data as DBExperiment;
  return {
    experiment: {
      id: exp.id,
      key: exp.key,
      name: exp.name,
      description: exp.description || undefined,
      variants: exp.variants,
      allocation: exp.allocation,
      targetMode: exp.target_mode as Experiment['targetMode'],
      targetIntents: exp.target_intents || undefined,
      enabled: exp.enabled,
      startAt: exp.start_at ? new Date(exp.start_at) : undefined,
      endAt: exp.end_at ? new Date(exp.end_at) : undefined,
      createdAt: new Date(exp.created_at),
    },
  };
}

export async function toggleExperiment(experimentId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('experiments')
    .update({ enabled })
    .eq('id', experimentId);

  if (error) {
    return { success: false, error: error.message };
  }

  cacheInvalidateTag('experiments');
  return { success: true };
}

export async function listExperiments(): Promise<{ experiments: Experiment[]; error?: string }> {
  const { data, error } = await supabase
    .from('experiments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { experiments: [], error: error.message };
  }

  return {
    experiments: (data || []).map((e: DBExperiment) => ({
      id: e.id,
      key: e.key,
      name: e.name,
      description: e.description || undefined,
      variants: e.variants,
      allocation: e.allocation,
      targetMode: e.target_mode as Experiment['targetMode'],
      targetIntents: e.target_intents || undefined,
      enabled: e.enabled,
      startAt: e.start_at ? new Date(e.start_at) : undefined,
      endAt: e.end_at ? new Date(e.end_at) : undefined,
      createdAt: new Date(e.created_at),
    })),
  };
}

// ============================================
// Analytics Functions
// ============================================

export interface ExperimentResults {
  experimentKey: string;
  totalExposures: number;
  variants: Array<{
    variantId: string;
    variantName: string;
    exposures: number;
    conversions: {
      coupon_copied: number;
      link_clicked: number;
      support_created: number;
      satisfied: number;
      unsatisfied: number;
    };
    conversionRates: {
      coupon_copied: number;
      link_clicked: number;
      support_created: number;
      satisfied: number;
      unsatisfied: number;
    };
  }>;
}

export async function getExperimentResults(
  experimentKey: string,
  startDate?: Date,
  endDate?: Date
): Promise<ExperimentResults> {
  // Get exposures
  let exposuresQuery = supabase
    .from('events')
    .select('payload')
    .eq('type', 'experiment_exposed')
    .eq('payload->>experimentKey', experimentKey);

  if (startDate) {
    exposuresQuery = exposuresQuery.gte('created_at', startDate.toISOString());
  }
  if (endDate) {
    exposuresQuery = exposuresQuery.lte('created_at', endDate.toISOString());
  }

  const { data: exposures } = await exposuresQuery;

  // Get conversions
  let conversionsQuery = supabase
    .from('events')
    .select('payload')
    .eq('type', 'experiment_converted')
    .eq('payload->>experimentKey', experimentKey);

  if (startDate) {
    conversionsQuery = conversionsQuery.gte('created_at', startDate.toISOString());
  }
  if (endDate) {
    conversionsQuery = conversionsQuery.lte('created_at', endDate.toISOString());
  }

  const { data: conversions } = await conversionsQuery;

  // Aggregate by variant
  const variantStats = new Map<string, {
    variantId: string;
    variantName: string;
    exposures: number;
    conversions: Record<string, number>;
  }>();

  for (const e of exposures || []) {
    const payload = e.payload as Record<string, string>;
    const variantId = payload.variantId;
    const variantName = payload.variantName;
    
    if (!variantStats.has(variantId)) {
      variantStats.set(variantId, {
        variantId,
        variantName,
        exposures: 0,
        conversions: {},
      });
    }
    variantStats.get(variantId)!.exposures++;
  }

  for (const c of conversions || []) {
    const payload = c.payload as Record<string, string>;
    const variantId = payload.variantId || 'unknown';
    const conversionType = payload.conversionType;
    
    if (variantStats.has(variantId)) {
      const stats = variantStats.get(variantId)!;
      stats.conversions[conversionType] = (stats.conversions[conversionType] || 0) + 1;
    }
  }

  // Build results
  const variants = Array.from(variantStats.values()).map(v => {
    const conversions = {
      coupon_copied: v.conversions.coupon_copied || 0,
      link_clicked: v.conversions.link_clicked || 0,
      support_created: v.conversions.support_created || 0,
      satisfied: v.conversions.satisfied || 0,
      unsatisfied: v.conversions.unsatisfied || 0,
    };

    const conversionRates = {
      coupon_copied: v.exposures > 0 ? conversions.coupon_copied / v.exposures : 0,
      link_clicked: v.exposures > 0 ? conversions.link_clicked / v.exposures : 0,
      support_created: v.exposures > 0 ? conversions.support_created / v.exposures : 0,
      satisfied: v.exposures > 0 ? conversions.satisfied / v.exposures : 0,
      unsatisfied: v.exposures > 0 ? conversions.unsatisfied / v.exposures : 0,
    };

    return {
      variantId: v.variantId,
      variantName: v.variantName,
      exposures: v.exposures,
      conversions,
      conversionRates,
    };
  });

  return {
    experimentKey,
    totalExposures: variants.reduce((sum, v) => sum + v.exposures, 0),
    variants,
  };
}

