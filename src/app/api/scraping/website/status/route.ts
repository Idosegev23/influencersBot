import { NextRequest, NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const repo = getScanJobsRepo();
    const job = await repo.getById(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      platform: job.platform,
      steps: job.step_logs || [],
      result: job.result_summary,
      error: job.error_message
        ? { code: job.error_code, message: job.error_message }
        : null,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
    });
  } catch (error: any) {
    console.error('[Website Scan Status] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
