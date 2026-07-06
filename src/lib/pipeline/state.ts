import { createClient } from '@/lib/supabase/server';
import { redisRPush, redisLPopCount, redisLLen, redisSet, redisGet } from '@/lib/redis';
import type { PipelineState, PipelineStep } from './types';

/** Load the durable pipeline state JSONB from the scan_jobs row. */
export async function loadState(jobId: string): Promise<PipelineState> {
  const supabase = await createClient();
  const { data } = await supabase.from('scan_jobs').select('pipeline_state').eq('id', jobId).single();
  return (data?.pipeline_state ?? {}) as PipelineState;
}

/** Persist the full pipeline state back onto the scan_jobs row (whole-object write). */
export async function saveState(jobId: string, state: PipelineState): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('scan_jobs')
    .update({ pipeline_state: state, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}

/** Merge a {done,total} patch for one counter key into pipeline_state.counts (read-modify-write). */
export async function setCount(
  jobId: string,
  key: string,
  patch: { done?: number; total?: number }
): Promise<PipelineState> {
  const state = await loadState(jobId);
  const prev = state.counts?.[key] ?? { done: 0, total: 0 };
  state.counts = {
    ...(state.counts ?? {}),
    [key]: { done: patch.done ?? prev.done, total: patch.total ?? prev.total },
  };
  await saveState(jobId, state);
  return state;
}

// ============================================
// Frontier (Redis list) — URLs pending crawl
// ============================================

export async function pushFrontier(jobId: string, urls: string[]): Promise<void> {
  if (urls.length) await redisRPush(`pipeline:${jobId}:frontier`, urls);
}

export async function popFrontier(jobId: string, n: number): Promise<string[]> {
  return redisLPopCount(`pipeline:${jobId}:frontier`, n);
}

export async function frontierSize(jobId: string): Promise<number> {
  return redisLLen(`pipeline:${jobId}:frontier`);
}

// ============================================
// Per-step cursor (Redis string)
// ============================================

export async function getCursor(jobId: string, step: PipelineStep): Promise<number> {
  const v = await redisGet<string>(`pipeline:${jobId}:cursor:${step}`);
  return v ? parseInt(v, 10) : 0;
}

export async function setCursor(jobId: string, step: PipelineStep, n: number): Promise<void> {
  await redisSet(`pipeline:${jobId}:cursor:${step}`, String(n), 86400);
}
