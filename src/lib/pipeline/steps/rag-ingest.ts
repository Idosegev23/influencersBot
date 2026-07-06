import { processAccountContent } from '@/lib/processing/content-processor-orchestrator';
import type { StepContext } from '../types';
import type { StepResult } from './index';

/**
 * RAG-ingest step. Reuses the content-processor orchestrator with transcription
 * and persona disabled — transcription already ran in the `transcribe` step and
 * persona runs in `persona-build`. This builds the RAG index (posts, highlights,
 * comments, website pages) via the same path `setup-account.ts` uses.
 *
 * `scanJobId` is the pipeline job id (the `scan_jobs` row), so orchestrator
 * progress logs attach to the same job.
 */
export async function ragIngestStep(ctx: StepContext): Promise<StepResult> {
  await processAccountContent({
    accountId: ctx.accountId,
    scanJobId: ctx.jobId,
    transcribeVideos: false,
    buildRagIndex: true,
    buildPersona: false,
  });
  return { status: 'advance' };
}
