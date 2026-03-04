import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
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
      // If the job has been "running" for over 10 minutes with no updates, it's stale — auto-cancel
      const updatedAt = new Date(runningJob.updated_at || runningJob.started_at || 0).getTime();
      const staleThreshold = 10 * 60 * 1000; // 10 minutes
      if (Date.now() - updatedAt > staleThreshold) {
        console.log(`[Website Scan] Auto-cancelling stale job ${runningJob.id}`);
        await repo.cancel(runningJob.id);
      } else {
        return NextResponse.json(
          { error: 'A website scan is already running for this account', jobId: runningJob.id },
          { status: 409 },
        );
      }
    }

    // Create job
    const job = await repo.create({
      platform: 'website',
      username: new URL(url.startsWith('http') ? url : `https://${url}`).hostname,
      account_id: accountId,
      config: { url, maxPages },
    });

    // Run orchestrator in background using after() —
    // keeps the serverless function alive after the response is sent
    after(async () => {
      try {
        const orchestrator = getWebsiteScanOrchestrator();
        await orchestrator.run(job.id, url, accountId, { maxPages });
      } catch (err: any) {
        console.error(`[Website Scan] Background run failed:`, err.message);
        // Ensure job is marked failed if orchestrator crashes unexpectedly
        try {
          await repo.markFailed(job.id, 'ORCHESTRATOR_CRASH', err.message);
        } catch {
          // Last resort — nothing we can do
        }
      }
    });

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
