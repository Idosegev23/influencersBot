import { NextResponse } from 'next/server';
import { verifyQStashSignature, publishStep } from '@/lib/pipeline/qstash';
import { acquireStepLock } from '@/lib/pipeline/locks';
import { STEP_HANDLERS } from '@/lib/pipeline/steps';
import { loadState } from '@/lib/pipeline/state';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { nextStep } from '@/lib/pipeline/types';
import type { PipelineStep } from '@/lib/pipeline/types';

export const maxDuration = 600;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const ok = await verifyQStashSignature(req, rawBody);
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  const { jobId, step, batch } = JSON.parse(rawBody) as { jobId: string; step: PipelineStep; batch: number };
  if (!(await acquireStepLock(jobId, step, batch))) return NextResponse.json({ deduped: true });

  const repo = getScanJobsRepo();
  const job = await repo.getById(jobId);
  if (!job) return NextResponse.json({ error: 'no job' }, { status: 404 });

  const state = await loadState(jobId);
  await repo.addStepLog(jobId, step, 'running', 0, `שלב ${step} רץ (batch ${batch})`);

  let result;
  try {
    result = await STEP_HANDLERS[step]({ jobId, accountId: job.account_id!, username: job.username, step, batch, state });
  } catch (e: any) {
    result = { status: 'failed', error: e?.message || String(e) } as const;
  }

  if (result.status === 'failed') {
    await repo.addStepLog(jobId, step, 'failed', 0, result.error);
    await repo.markFailed(jobId, 'PIPELINE_STEP_FAILED', `${step}: ${result.error}`);
    return NextResponse.json({ status: 'failed', step });
  }
  if (result.status === 're-enqueue') {
    await publishStep({ jobId, step, batch: batch + 1, delaySeconds: result.delaySeconds });
    return NextResponse.json({ status: 're-enqueued', step, batch: batch + 1 });
  }
  // advance
  await repo.addStepLog(jobId, step, 'completed', 100, `שלב ${step} הושלם`);
  const next = nextStep(step);
  if (next) { await publishStep({ jobId, step: next, batch: 0 }); return NextResponse.json({ status: 'advanced', next }); }
  await repo.markSucceeded(jobId, { pipeline: 'complete' });
  return NextResponse.json({ status: 'done' });
}
