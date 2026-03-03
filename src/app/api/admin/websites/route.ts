import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/websites - List all website accounts
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Get all website scan jobs with their results
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

    // Fetch page stats for each account
    const websites = [];
    for (const [accountId, latestJob] of websiteMap) {
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

    return NextResponse.json({ websites });
  } catch (error: any) {
    console.error('[Admin Websites] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
