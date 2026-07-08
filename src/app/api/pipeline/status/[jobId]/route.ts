import { NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { computeScanProgress } from '@/lib/pipeline/progress';

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getScanJobsRepo().getById(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const prog = computeScanProgress(job as any);

  return NextResponse.json({
    status: job.status,
    steps: job.step_logs ?? [],
    counts: (job as any).pipeline_state?.counts ?? {},
    error: job.error_message ?? null,
    // ⚡ live progress (currentStep now derived, not the stale pipeline_state.currentStep)
    percent: prog.percent,
    currentStep: prog.currentStep,
    completedSteps: prog.completedSteps,
    totalSteps: prog.totalSteps,
    elapsedMs: prog.elapsedMs,
    lastUpdateMs: prog.lastUpdateMs,
  });
}
