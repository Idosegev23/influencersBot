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
 * `website` is capped for brands: their widget answers product questions from
 * the product catalog (`widget_products`), not from thousands of RAG pages, so
 * ingesting the full crawl is both slow and low-value.
 *
 * That reasoning does not survive contact with an archetype that HAS no
 * catalog. For an association or a ministry the site IS the knowledge base, and
 * the pages people actually ask about — dues, events, regulations — are exactly
 * the ones a 200-chunk cap drops. ABA's /membership/join/ page, the single page
 * their own feedback asked about, lost that lottery: 97 of 385 pages were
 * ingested and it was not among them.
 */
const RAG_TYPES: EntityType[] = [
  'post', 'transcription', 'partnership', 'coupon', 'knowledge_base', 'website', 'document',
];

/** Archetypes with no product catalog behind them — the crawl is all they have. */
const SITE_IS_THE_KNOWLEDGE_BASE = new Set(['association', 'government_ministry']);

function contentBudgetsFor(archetype?: string): Partial<Record<EntityType, number>> {
  return { website: SITE_IS_THE_KNOWLEDGE_BASE.has(archetype ?? '') ? 2000 : 200 };
}

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
    contentBudgets: contentBudgetsFor(archetype),
  });

  await setCount(ctx.jobId, 'rag-ingest', { done: idx + 1, total: RAG_TYPES.length });

  return idx + 1 < RAG_TYPES.length ? { status: 're-enqueue' } : { status: 'advance' };
}
