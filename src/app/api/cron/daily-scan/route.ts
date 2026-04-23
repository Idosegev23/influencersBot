/**
 * GET /api/cron/daily-scan
 * סריקה יומית — סורק חשבון **אחד** בכל הרצה
 * הקרון רץ כל 10 דקות בחלון 01:00-04:59 UTC (03:00-06:59 שעון ישראל)
 * כך כל חשבון מקבל 10 דקות שלמות ולא מתחרה עם אחרים
 *
 * Vercel Pro: maxDuration = 600s (10 min)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { runScanJob } from '@/lib/scraping/runScanJob';

// Vercel Pro: allow up to 10 minutes per single account scan
export const maxDuration = 600;

export async function GET(req: NextRequest) {
  try {
    // Security: Verify cron secret
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Cron] Starting daily scan (single-account mode)...');

    const supabase = await createClient();
    const repo = getScanJobsRepo();

    // ⚡ Cleanup: mark stuck "running" jobs (>30 min) as failed
    try {
      const { data: stuckJobs } = await supabase
        .from('scan_jobs')
        .select('id, username, started_at')
        .eq('status', 'running')
        .lt('started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

      if (stuckJobs && stuckJobs.length > 0) {
        for (const stuck of stuckJobs) {
          await repo.markFailed(stuck.id, 'TIMEOUT', `Stuck in running state since ${stuck.started_at} — auto-cleaned`);
          console.log(`[Cron] Cleaned stuck job ${stuck.id} (@${stuck.username})`);
        }
        console.log(`[Cron] Cleaned ${stuckJobs.length} stuck scan jobs`);
      }
    } catch (cleanupErr: any) {
      console.error('[Cron] Cleanup failed (non-fatal):', cleanupErr.message);
    }

    // Get ALL active creator accounts
    const { data: activeAccounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, config, status')
      .eq('type', 'creator')
      .eq('status', 'active');

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    // Also load persona data for instagram_username fallback
    const accountIds = (activeAccounts || []).map(a => a.id);
    const { data: personas } = await supabase
      .from('chatbot_persona')
      .select('account_id, instagram_username')
      .in('account_id', accountIds);

    const personaMap = new Map(
      (personas || []).map(p => [p.account_id, p.instagram_username])
    );

    // Build account list: prefer persona.instagram_username, fallback to config.username
    const accounts = (activeAccounts || [])
      .map(a => ({
        id: a.id,
        instagram_username:
          personaMap.get(a.id) ||
          (a.config as any)?.username ||
          null,
      }))
      .filter(a => a.instagram_username);

    if (accounts.length === 0) {
      return NextResponse.json({
        message: 'No active accounts found',
        scanned: null,
      });
    }

    // Pre-check: get last scan time per account and sort oldest-first
    const accountsWithLastScan = await Promise.all(
      accounts.map(async (account) => {
        const recentJobs = await repo.getRecentJobs(account.instagram_username, 1);
        const lastJob = recentJobs[0];
        return { ...account, lastJob };
      })
    );

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Filter to accounts that need scanning, then sort by priority
    const accountsToScan = accountsWithLastScan
      .filter(a => {
        return (
          !a.lastJob ||
          new Date(a.lastJob.created_at) < yesterday ||
          a.lastJob.status === 'failed'
        );
      })
      .sort((a, b) => {
        // No scan at all → highest priority
        if (!a.lastJob) return -1;
        if (!b.lastJob) return 1;
        // Failed scans get priority over old succeeded scans
        if (a.lastJob.status === 'failed' && b.lastJob.status !== 'failed') return -1;
        if (b.lastJob.status === 'failed' && a.lastJob.status !== 'failed') return 1;
        // Oldest scan first
        return new Date(a.lastJob.created_at).getTime() - new Date(b.lastJob.created_at).getTime();
      });

    const skippedCount = accounts.length - accountsToScan.length;

    // Pick ONLY the top-priority account
    if (accountsToScan.length === 0) {
      console.log(`[Cron] All ${accounts.length} accounts are up-to-date. Nothing to scan.`);
      return NextResponse.json({
        success: true,
        message: 'All accounts up-to-date',
        totalAccounts: accounts.length,
        scanned: null,
        pending: 0,
      });
    }

    const account = accountsToScan[0];
    const pendingCount = accountsToScan.length - 1;

    console.log(`[Cron] Scanning @${account.instagram_username} (${pendingCount} more pending). Last scan: ${account.lastJob?.created_at || 'never'}`);

    const job = await repo.create({
      username: account.instagram_username,
      account_id: account.id,
      priority: 50,
      requested_by: 'cron:daily-scan',
      config: {
        postsLimit: 50,
        commentsPerPost: 3,
        maxWebsitePages: 0,
        samplesPerHighlight: 999,
        transcribeReels: true,
        incremental: true,
        websiteCacheDays: 7,
      },
    });

    let status = 'completed';
    let error: string | undefined;

    try {
      await runScanJob(job.id);
      console.log(`[Cron] ✅ @${account.instagram_username} scan completed`);
    } catch (err: any) {
      status = 'failed';
      error = err.message?.substring(0, 200);
      console.error(`[Cron] ❌ @${account.instagram_username} scan failed:`, err.message);
    }

    return NextResponse.json({
      success: status === 'completed',
      message: `Scanned @${account.instagram_username}: ${status}`,
      totalAccounts: accounts.length,
      scanned: {
        username: account.instagram_username,
        accountId: account.id,
        jobId: job.id,
        status,
        error,
      },
      pending: pendingCount,
      upToDate: skippedCount,
    });

  } catch (error: any) {
    console.error('[Cron] /daily-scan error:', error);

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
