import { NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getScanJobsRepo().getById(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({
    status: job.status,
    steps: job.step_logs ?? [],
    counts: (job as any).pipeline_state?.counts ?? {},
    currentStep: (job as any).pipeline_state?.currentStep ?? null,
    error: job.error_message ?? null,
  });
}
