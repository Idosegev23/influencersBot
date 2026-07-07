import { ingestAllForAccount } from '@/lib/rag/ingest';
import { createClient } from '@/lib/supabase/server';
import { setCount } from '@/lib/pipeline/state';
import type { EntityType } from '@/lib/rag/types';
import type { StepContext } from '../types';
import type { StepResult } from './index';

/**
 * RAG-ingest step — serverless-safe.
 *
 * Processes ONE entity type per invocation (batch index = position in RAG_TYPES)
 * and re-enqueues until all are done, so no single invocation approaches the
 * Vercel maxDuration. The old implementation called the monolithic
 * `processAccountContent` in one shot, which exceeded 300s on large sites and
 * got killed mid-run (see the Carolina Lemke acceptance run: 1,516 pages).
 *
 * `website` is capped at 200 chunks: a brand widget answers product questions
 * from the product catalog (`widget_products`), not from thousands of RAG pages,
 * so ingesting the full crawl is both slow and low-value.
 */
const RAG_TYPES: EntityType[] = [
  'post', 'transcription', 'partnership', 'coupon', 'knowledge_base', 'website', 'document',
];

const CONTENT_BUDGETS: Partial<Record<EntityType, number>> = { website: 200 };

export async function ragIngestStep(ctx: StepContext): Promise<StepResult> {
  const idx = ctx.batch;
  if (idx >= RAG_TYPES.length) return { status: 'advance' };
  const entityType = RAG_TYPES[idx];

  // archetype drives retrieval config; explicit contentBudgets bound this run
  const supabase = await createClient();
  const { data: acct } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
  const archetype = acct?.config?.archetype;

  await ingestAllForAccount(ctx.accountId, {
    entityTypes: [entityType],
    archetype,
    contentBudgets: CONTENT_BUDGETS,
  });

  await setCount(ctx.jobId, 'rag-ingest', { done: idx + 1, total: RAG_TYPES.length });

  return idx + 1 < RAG_TYPES.length ? { status: 're-enqueue' } : { status: 'advance' };
}
