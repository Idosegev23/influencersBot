/**
 * GET /api/cron/daily-scan
 * סריקה יומית ב-3:00 לפנות בוקר (01:00 UTC)
 * יוצר jobs לכל החשבונות הפעילים שצריכים סריקה ומריץ אותם
 *
 * Vercel Pro: maxDuration = 600s (10 min) — enough for sequential scans
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { runScanJob } from '@/lib/scraping/runScanJob';

// Vercel Pro: allow up to 10 minutes for sequential scans
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

    console.log('[Cron] Starting daily scan...');

    const supabase = await createClient();
    const repo = getScanJobsRepo();

    // Get ALL active creator accounts — not just those with persona
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
      .filter(a => a.instagram_username); // Skip accounts with no username at all

    if (accounts.length === 0) {
      return NextResponse.json({
        message: 'No active accounts found',
        jobsCreated: 0,
      });
    }

    // Pre-check: get last scan time per account and sort oldest-first
    // This ensures stale accounts get priority when we hit the time budget
    const accountsWithLastScan = await Promise.all(
      accounts.map(async (account) => {
        const recentJobs = await repo.getRecentJobs(account.instagram_username, 1);
        const lastJob = recentJobs[0];
        return { ...account, lastJob };
      })
    );

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Filter to accounts that need scanning, then sort oldest scan first
    const accountsToScan = accountsWithLastScan
      .filter(a => {
        const shouldScan =
          !a.lastJob ||
          new Date(a.lastJob.created_at) < yesterday ||
          a.lastJob.status === 'failed';
        return shouldScan;
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
    console.log(`[Cron] ${accountsToScan.length} accounts need scanning, ${skippedCount} skipped (recent). Order: ${accountsToScan.map(a => a.instagram_username).join(', ')}`);

    // Time budget: stop 30s before maxDuration to return a clean response
    const startTime = Date.now();
    const TIME_BUDGET_MS = (maxDuration - 30) * 1000; // 570s

    let jobsCreated = 0;
    let jobsCompleted = 0;
    let jobsFailed = 0;
    const results: Array<{ username: string; status: string }> = [];

    for (const account of accountsToScan) {
      // Check time budget before starting a new scan
      const elapsed = Date.now() - startTime;
      if (elapsed > TIME_BUDGET_MS) {
        const remaining = accountsToScan.length - jobsCreated;
        console.log(`[Cron] ⏰ Time budget reached after ${Math.round(elapsed / 1000)}s. ${remaining} accounts deferred to next run.`);
        results.push({ username: account.instagram_username, status: 'deferred (time budget)' });
        continue;
      }

      const job = await repo.create({
        username: account.instagram_username,
        account_id: account.id,
        priority: 50,
        requested_by: 'cron:daily-scan',
        config: {
          postsLimit: 10,
          commentsPerPost: 2,
          maxWebsitePages: 0,
          samplesPerHighlight: 0,
          transcribeReels: true,
        },
      });

      jobsCreated++;

      // Run scan and AWAIT it (don't fire-and-forget — Vercel kills the process)
      try {
        await runScanJob(job.id);
        jobsCompleted++;
        results.push({ username: account.instagram_username, status: 'completed' });
        console.log(`[Cron] ✅ ${account.instagram_username} scan completed`);
      } catch (err: any) {
        jobsFailed++;
        results.push({ username: account.instagram_username, status: `failed: ${err.message?.substring(0, 100)}` });
        console.error(`[Cron] ❌ ${account.instagram_username} scan failed:`, err.message);
      }
    }

    console.log(`[Cron] Daily scan done: ${jobsCompleted} completed, ${jobsFailed} failed, ${skippedCount} skipped (recent)`);

    return NextResponse.json({
      success: true,
      message: `Scanned ${jobsCompleted}/${jobsCreated} accounts`,
      accountsChecked: accounts.length,
      needsScan: accountsToScan.length,
      skippedRecent: skippedCount,
      jobsCreated,
      jobsCompleted,
      jobsFailed,
      results,
    });

  } catch (error: any) {
    console.error('[Cron] /daily-scan error:', error);

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
