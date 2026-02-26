/**
 * GET /api/cron/daily-scan
 * סריקה יומית ב-3:00 לפנות בוקר (01:00 UTC)
 * יוצר jobs לכל החשבונות שצריכים סריקה ומריץ אותם
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { runScanJob } from '@/lib/scraping/runScanJob';

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

    // Get all ACTIVE accounts with instagram_username from chatbot_persona
    const { data: personas, error: accountsError } = await supabase
      .from('chatbot_persona')
      .select('account_id, instagram_username')
      .not('instagram_username', 'is', null);

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    // Filter only active accounts
    const activeAccountIds = personas?.map(p => p.account_id) || [];
    const { data: activeAccounts } = await supabase
      .from('accounts')
      .select('id, status')
      .in('id', activeAccountIds)
      .eq('status', 'active');

    const activeSet = new Set(activeAccounts?.map(a => a.id) || []);
    const accounts = personas
      ?.filter(p => activeSet.has(p.account_id))
      .map(p => ({ id: p.account_id, instagram_username: p.instagram_username })) || [];

    if (accounts.length === 0) {
      return NextResponse.json({
        message: 'No active accounts found',
        jobsCreated: 0,
      });
    }

    // Create and run scan jobs for accounts that need it
    let jobsCreated = 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    for (const account of accounts) {
      // Check if already scanned today
      const recentJobs = await repo.getRecentJobs(account.instagram_username, 1);
      const lastJob = recentJobs[0];

      const shouldScan =
        !lastJob ||
        new Date(lastJob.created_at) < yesterday ||
        lastJob.status === 'failed';

      if (shouldScan) {
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

        // Fire and forget: run the scan in the background
        runScanJob(job.id).catch(err => {
          console.error(`[Cron] Scan failed for ${account.instagram_username}:`, err.message);
        });

        jobsCreated++;
      }
    }

    console.log(`[Cron] Created and started ${jobsCreated} scan jobs`);

    return NextResponse.json({
      success: true,
      message: `Created and started ${jobsCreated} scan jobs`,
      accountsChecked: accounts.length,
      jobsCreated,
    });

  } catch (error: any) {
    console.error('[Cron] /daily-scan error:', error);

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
