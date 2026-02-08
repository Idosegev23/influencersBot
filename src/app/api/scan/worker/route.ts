/**
 * POST /api/scan/worker
 * Worker שמבצע את הסריקות בפועל
 * נועל job, מריץ סריקה, ומעדכן סטטוס
 */

import { NextRequest, NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { runScanJob } from '@/lib/scraping/newScanOrchestrator';
import { randomUUID } from 'crypto';

const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().substring(0, 8)}`;

export async function POST(req: NextRequest) {
  try {
    // Security: Check for internal token
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.SCAN_WORKER_TOKEN;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const repo = getScanJobsRepo();

    // Get next job
    const job = await repo.getNextJob(WORKER_ID);

    if (!job) {
      return NextResponse.json({
        message: 'No jobs available',
        workerId: WORKER_ID,
      });
    }

    console.log(`[Worker] Processing job: ${job.id} (@${job.username})`);

    // Run scan
    const result = await runScanJob(
      job.id,
      job.username,
      job.account_id!,
      job.config
    );

    // Update job based on result
    if (result.success) {
      await repo.markSucceeded(job.id, {
        profile: result.stats.profileScraped,
        posts_count: result.stats.postsCount,
        comments_count: result.stats.commentsCount,
        highlights_count: result.stats.highlightsCount,
        websites_crawled: result.stats.websitesCrawled,
        transcripts_count: result.stats.transcriptsCount,
        duration: result.duration,
      });

      return NextResponse.json({
        success: true,
        jobId: job.id,
        username: job.username,
        stats: result.stats,
        duration: result.duration,
      });
    } else {
      await repo.markFailed(
        job.id,
        result.error?.code || 'UNKNOWN',
        result.error?.message || 'Unknown error'
      );

      return NextResponse.json({
        success: false,
        jobId: job.id,
        username: job.username,
        error: result.error,
        willRetry: result.error?.retryable && job.attempt < job.max_attempts,
      });
    }

  } catch (error: any) {
    console.error('[API] /scan/worker error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// Stale Lock Cleanup
// ============================================

/**
 * GET /api/scan/worker?action=cleanup
 * Release stale locks
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'cleanup') {
      const repo = getScanJobsRepo();
      const released = await repo.releaseStaleLocks(15); // 15 minutes

      return NextResponse.json({
        message: `Released ${released} stale locks`,
        released,
      });
    }

    // Get queue stats
    const repo = getScanJobsRepo();
    const stats = await repo.getQueueStats();

    return NextResponse.json({
      workerId: WORKER_ID,
      queueStats: stats,
    });

  } catch (error: any) {
    console.error('[API] /scan/worker GET error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
