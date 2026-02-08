/**
 * GET /api/scan/status
 * בדיקת סטטוס סריקה
 */

import { NextRequest, NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    const repo = getScanJobsRepo();
    const job = await repo.getById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Build response
    const response: any = {
      jobId: job.id,
      username: job.username,
      status: job.status,
      progress: calculateProgress(job),
      steps: formatStepsForUI(job.step_logs || []), // ⚡ NEW: Include step logs!
      timestamps: {
        created: job.created_at,
        started: job.started_at,
        finished: job.finished_at,
      },
    };

    // Add error info if failed
    if (job.status === 'failed' && job.error_code) {
      response.error = {
        code: job.error_code,
        message: job.error_message,
      };
    }

    // Add results if succeeded
    if (job.status === 'succeeded' && job.result_summary) {
      response.results = job.result_summary;
      response.dataLinks = {
        profile: `/api/influencer/profile?accountId=${job.account_id}`,
        posts: `/api/influencer/posts?accountId=${job.account_id}`,
        highlights: `/api/influencer/highlights?accountId=${job.account_id}`,
      };
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[API] /scan/status error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculateProgress(job: any): number {
  // If we have detailed logs, calculate from them
  if (job.step_logs && job.step_logs.length > 0) {
    const latestLog = job.step_logs[job.step_logs.length - 1];
    return latestLog.progress || 0;
  }
  
  // Fallback to status-based progress
  switch (job.status) {
    case 'queued':
      return 0;
    case 'running':
      return 50;
    case 'succeeded':
      return 100;
    case 'failed':
    case 'cancelled':
      return 0;
    default:
      return 0;
  }
}

/**
 * ⚡ Format step logs for UI display
 * Converts array of logs into a keyed object for easy access
 */
function formatStepsForUI(logs: any[]): Record<string, any> {
  if (!logs || logs.length === 0) return {};
  
  const steps: Record<string, any> = {};
  
  // Group logs by step, keeping the latest status for each
  for (const log of logs) {
    steps[log.step] = {
      status: log.status,
      progress: log.progress,
      message: log.message,
      timestamp: log.timestamp,
    };
  }
  
  return steps;
}
