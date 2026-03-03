import { NextRequest, NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { getWebsiteScanOrchestrator } from '@/lib/scraping/website-scan-orchestrator';

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, accountId, maxPages = 50 } = body;

    if (!url || !accountId) {
      return NextResponse.json(
        { error: 'url and accountId are required' },
        { status: 400 },
      );
    }

    // Validate URL format
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const repo = getScanJobsRepo();

    // Check for running jobs on same account
    const recentJobs = await repo.getByAccount(accountId, 5);
    const runningJob = recentJobs.find(
      (j) => j.platform === 'website' && j.status === 'running',
    );
    if (runningJob) {
      return NextResponse.json(
        { error: 'A website scan is already running for this account', jobId: runningJob.id },
        { status: 409 },
      );
    }

    // Create job
    const job = await repo.create({
      platform: 'website',
      username: new URL(url.startsWith('http') ? url : `https://${url}`).hostname,
      account_id: accountId,
      config: { url, maxPages },
    });

    // Start orchestrator in background (fire-and-forget)
    const orchestrator = getWebsiteScanOrchestrator();
    orchestrator
      .run(job.id, url, accountId, { maxPages })
      .catch((err) => console.error(`[Website Scan] Background run failed:`, err.message));

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      message: `Started scanning ${url}`,
    });
  } catch (error: any) {
    console.error('[Website Scan Start] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
