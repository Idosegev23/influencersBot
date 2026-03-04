/**
 * Cancel a website scan job
 * POST /api/scraping/website/cancel
 */

import { NextRequest, NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const repo = getScanJobsRepo();
    const job = await repo.getById(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'succeeded' || job.status === 'cancelled') {
      return NextResponse.json({ error: 'Job already finished', status: job.status }, { status: 409 });
    }

    await repo.cancel(jobId);

    return NextResponse.json({ success: true, message: 'Scan cancelled' });
  } catch (error: any) {
    console.error('[Website Scan Cancel] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
