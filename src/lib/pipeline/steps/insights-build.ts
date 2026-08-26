import { generateContentInsights } from '@/lib/insights';
import type { StepContext } from '../types';
import type { StepResult } from './index';

/**
 * Build content insights from everything the scan just collected.
 *
 * Runs after persona-build so the topic classification and RAG index it reads are
 * already in place, and before finalize so a completed scan always lands with a
 * dashboard that has something on it.
 *
 * Never fails the job. A scan that produced posts, pages, a persona and a working
 * assistant is a successful scan; insights are the layer on top, and losing them
 * is not worth discarding the rest. The failure is logged where an operator will
 * see it.
 */
export async function insightsBuildStep(ctx: StepContext): Promise<StepResult> {
  try {
    const result = await generateContentInsights(ctx.accountId, ctx.jobId);
    console.log(
      `[insights-build] wrote ${result.written} insights for ${ctx.accountId}`,
      result.byType,
      result.droppedForNoEvidence ? `(dropped ${result.droppedForNoEvidence} with no evidence)` : '',
    );

    try {
      const { getScanJobsRepo } = await import('@/lib/db/repositories/scanJobsRepo');
      await getScanJobsRepo().addStepLog(
        ctx.jobId,
        'insights-build',
        'completed',
        100,
        result.written > 0
          ? `נוצרו ${result.written} תובנות תוכן`
          : 'לא נוצרו תובנות — אין מספיק תוכן מגובה בראיות',
      );
    } catch { /* logging must never fail the job */ }
  } catch (e: any) {
    const message = e?.message || String(e);
    console.error(`[insights-build] failed for job ${ctx.jobId}: ${message}`);
    try {
      const { getScanJobsRepo } = await import('@/lib/db/repositories/scanJobsRepo');
      await getScanJobsRepo().addStepLog(ctx.jobId, 'insights-build', 'failed', 0, `יצירת תובנות נכשלה: ${message}`);
    } catch { /* ditto */ }
  }

  return { status: 'advance' };
}
