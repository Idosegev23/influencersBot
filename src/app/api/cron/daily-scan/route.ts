/**
 * POST /api/cron/daily-scan
 * סריקה יומית ב-5:00 בבוקר
 * יוצר jobs לכל החשבונות שצריכים סריקה
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

export async function POST(req: NextRequest) {
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

    // Get all active accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .eq('status', 'active')
      .not('instagram_username', 'is', null);

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        message: 'No active accounts found',
        jobsCreated: 0,
      });
    }

    // Create scan jobs for accounts that need it
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
        await repo.create({
          username: account.instagram_username,
          account_id: account.id,
          priority: 50, // Lower priority for daily scans
          requested_by: 'cron:daily-scan',
          config: {
            postsLimit: 10, // Only yesterday's posts
            commentsPerPost: 2,
            maxWebsitePages: 0, // Don't crawl websites on daily
            samplesPerHighlight: 0, // Don't fetch highlights
            transcribeReels: true,
          },
        });

        jobsCreated++;
      }
    }

    console.log(`[Cron] Created ${jobsCreated} scan jobs`);

    return NextResponse.json({
      success: true,
      message: `Created ${jobsCreated} scan jobs`,
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
