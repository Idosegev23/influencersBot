import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/websites - List all widget-enabled accounts
 * Sources: scan_jobs (scraped websites) + accounts with config.widget.enabled
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Get all website scan jobs with their results
    const { data: jobs, error: jobsError } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('platform', 'website')
      .order('created_at', { ascending: false });

    if (jobsError) {
      throw new Error(jobsError.message);
    }

    // Group by account_id, get latest per account
    const websiteMap = new Map<string, any>();
    for (const job of jobs || []) {
      if (!job.account_id) continue;
      if (!websiteMap.has(job.account_id)) {
        websiteMap.set(job.account_id, job);
      }
    }

    // 2. Get all accounts with widget enabled (may include accounts without scan jobs)
    const { data: widgetAccounts } = await supabase
      .from('accounts')
      .select('id, config')
      .eq('status', 'active')
      .not('config->widget', 'is', null);

    // Track which account IDs we've already processed
    const seenIds = new Set<string>();

    // 3. Build websites list from scan jobs first (they have richer data)
    const websites = [];
    for (const [accountId, latestJob] of websiteMap) {
      seenIds.add(accountId);

      const { count: pagesCount } = await supabase
        .from('instagram_bio_websites')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('source_type', 'standalone');

      const domain = latestJob.username; // stored as hostname
      const result = latestJob.result_summary || {};

      websites.push({
        id: accountId,
        domain,
        url: latestJob.config?.url || `https://${domain}`,
        status: latestJob.status,
        pagesCount: pagesCount || 0,
        totalWords: result.totalWords || 0,
        totalImages: result.totalImages || 0,
        lastScanAt: latestJob.finished_at || latestJob.created_at,
        jobId: latestJob.id,
      });
    }

    // 4. Add widget-enabled accounts that don't have scan jobs yet
    for (const account of widgetAccounts || []) {
      if (seenIds.has(account.id)) continue;

      const widgetConfig = account.config?.widget;
      if (!widgetConfig?.enabled) continue;

      const domain = widgetConfig.domain || account.config?.username || '';

      const { count: pagesCount } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', account.id);

      websites.push({
        id: account.id,
        domain,
        url: `https://${domain}`,
        status: 'widget-only',
        pagesCount: pagesCount || 0,
        totalWords: 0,
        totalImages: 0,
        lastScanAt: null,
        jobId: null,
      });
    }

    return NextResponse.json({ websites });
  } catch (error: any) {
    console.error('[Admin Websites] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
