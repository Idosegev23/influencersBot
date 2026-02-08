/**
 * POST /api/scan/start
 * התחלת סריקה חדשה - מריץ מיד ברקע!
 */

import { NextRequest, NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { runScanJob } from '@/lib/scraping/runScanJob';
import { DEFAULT_SCAN_CONFIG } from '@/lib/scraping/newScanOrchestrator';

/**
 * Run scan in background (fire and forget)
 */
async function runScanInBackground(jobId: string) {
  try {
    console.log(`[Background] Starting scan for job ${jobId}`);
    await runScanJob(jobId);
    console.log(`[Background] ✅ Scan completed successfully for job ${jobId}`);
  } catch (error: any) {
    console.error(`[Background] ❌ Scan failed for job ${jobId}:`, error.message || error);
    // Error already logged and marked in runScanJob
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, accountId, force, priority, config } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const repo = getScanJobsRepo();

    // Check TTL unless force is true
    if (!force) {
      const ttlCheck = await repo.canScan(username);
      
      if (!ttlCheck.can_scan) {
        return NextResponse.json({
          canScan: false,
          reason: ttlCheck.reason,
          lastScan: ttlCheck.last_scan,
          message: `@${username} נסרק לאחרונה ב-${new Date(ttlCheck.last_scan!).toLocaleString('he-IL')}. כדי לסרוק שוב, השתמש ב-force=true`,
        }, { status: 429 });
      }
    }

    // Create scan job with DEFAULT_SCAN_CONFIG merged
    const job = await repo.create({
      username,
      account_id: accountId,
      priority: priority || 100,
      requested_by: 'api',
      config: { ...DEFAULT_SCAN_CONFIG, ...(config || {}) }, // ⚡ Merge with defaults!
    });

    // ⚡ Start scanning IMMEDIATELY (don't wait for worker)
    console.log(`[Scan Start] Triggering immediate scan for job ${job.id}`);
    
    // Run scan in background (fire and forget)
    runScanInBackground(job.id).catch(err => {
      console.error(`[Scan Start] Background scan failed for job ${job.id}:`, err);
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: 'running', // It's already running!
      estimatedPolicy: {
        postsLimit: config?.postsLimit || DEFAULT_SCAN_CONFIG.postsLimit,
        commentsPerPost: config?.commentsPerPost || DEFAULT_SCAN_CONFIG.commentsPerPost,
        maxWebsitePages: config?.maxWebsitePages || DEFAULT_SCAN_CONFIG.maxWebsitePages,
        transcribeReels: config?.transcribeReels !== undefined ? config.transcribeReels : DEFAULT_SCAN_CONFIG.transcribeReels,
      },
      message: `סריקה התחילה עבור @${username} (תמלול: ${config?.transcribeReels !== undefined ? config.transcribeReels : DEFAULT_SCAN_CONFIG.transcribeReels})`,
    });

  } catch (error: any) {
    console.error('[API] /scan/start error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
