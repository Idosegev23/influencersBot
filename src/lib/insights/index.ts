import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { collectCorpus } from './collect';
import { generateCadence, generateTopPerformers, generateTopicMap } from './deterministic';
import { generateContentGaps } from './gaps';
import type { ContentInsight, InsightCorpus } from './types';

export * from './types';
export { collectCorpus } from './collect';

/**
 * THE EVIDENCE RULE.
 *
 * An insight nobody can check is decoration. Every row must carry at least one
 * piece of evidence — a post, a page, a comment, or a retrieval probe — and rows
 * that cannot are dropped here rather than being softened with hedging language.
 * This is the single gate that separates this table from AI prose.
 */
export function enforceEvidence(insights: ContentInsight[]): ContentInsight[] {
  return insights.filter((i) => Array.isArray(i.evidence) && i.evidence.length > 0);
}

export interface GenerateResult {
  runId: string;
  written: number;
  byType: Record<string, number>;
  droppedForNoEvidence: number;
}

/**
 * Build every insight for an account from its scanned content and persist them.
 *
 * Writes the new run first and only then deletes the previous one, so a partial
 * failure leaves the last good insights on the dashboard instead of blanking it
 * in front of a customer.
 */
export async function generateContentInsights(
  accountId: string,
  scanJobId?: string,
): Promise<GenerateResult> {
  const corpus = await collectCorpus(accountId);
  const runId = randomUUID();

  const produced: ContentInsight[] = [
    ...generateTopicMap(corpus),
    ...generateTopPerformers(corpus),
    ...generateCadence(corpus),
    ...(await safeGaps(corpus)),
  ];

  const kept = enforceEvidence(produced);
  const droppedForNoEvidence = produced.length - kept.length;

  const supabase = await createClient();

  if (kept.length > 0) {
    const { error } = await supabase.from('content_insights').insert(
      kept.map((i) => ({
        account_id: accountId,
        insight_type: i.type,
        title: i.title,
        summary: i.summary,
        rank: i.rank,
        metrics: i.metrics,
        evidence: i.evidence,
        run_id: runId,
        scan_job_id: scanJobId ?? null,
      })),
    );
    if (error) throw new Error(`content_insights insert failed: ${error.message}`);

    // Only now is it safe to retire the previous run.
    await supabase.from('content_insights').delete().eq('account_id', accountId).neq('run_id', runId);
  }

  const byType: Record<string, number> = {};
  for (const i of kept) byType[i.type] = (byType[i.type] || 0) + 1;

  return { runId, written: kept.length, byType, droppedForNoEvidence };
}

/**
 * Gaps are the one generator that calls a model and the live retrieval path, so
 * it is the one that can fail on a bad key, a rate limit or a cold index. The
 * other three are arithmetic and must still reach the dashboard when it does.
 */
async function safeGaps(corpus: InsightCorpus): Promise<ContentInsight[]> {
  try {
    return await generateContentGaps(corpus);
  } catch (e: any) {
    console.error('[insights] content_gaps failed:', e?.message || e);
    return [];
  }
}
