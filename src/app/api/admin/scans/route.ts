import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { computeScanProgress } from '@/lib/pipeline/progress';

/**
 * GET /api/admin/scans
 *
 * Central scans dashboard feed: the 30 most recent scan jobs, each enriched
 * with derived progress (via computeScanProgress) and a human-readable account
 * name. Active jobs (queued/running) are floated to the top; within a group the
 * DB's `created_at desc` order is preserved.
 *
 * Returns: { scans: [{ jobId, accountId, name, username, status, currentStep,
 *   percent, completedSteps, totalSteps, elapsedMs, lastUpdateMs, error }] }
 */
const ACTIVE = new Set(['queued', 'running']);

export async function GET() {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const supabase = await createClient();

    const { data: jobs, error } = await supabase
      .from('scan_jobs')
      .select('id, username, account_id, status, step_logs, created_at, finished_at, error_message')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Error fetching scan jobs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const jobList = jobs || [];

    // Resolve account display names in one batched query.
    const accountIds = [...new Set(jobList.map((j: any) => j.account_id).filter(Boolean))];
    const nameMap = new Map<string, string | undefined>();
    if (accountIds.length) {
      const { data: accts } = await supabase
        .from('accounts')
        .select('id, config')
        .in('id', accountIds);
      for (const a of accts || []) {
        nameMap.set(a.id, a.config?.display_name);
      }
    }

    const scans = jobList.map((job: any) => {
      const prog = computeScanProgress(job);
      return {
        jobId: job.id,
        accountId: job.account_id ?? null,
        name: nameMap.get(job.account_id) || job.username,
        username: job.username,
        status: job.status,
        currentStep: prog.currentStep,
        percent: prog.percent,
        completedSteps: prog.completedSteps,
        totalSteps: prog.totalSteps,
        elapsedMs: prog.elapsedMs,
        lastUpdateMs: prog.lastUpdateMs,
        error: job.error_message ?? null,
      };
    });

    // Active-first; stable sort preserves the created_at desc order within groups.
    scans.sort((a, b) => {
      const aActive = ACTIVE.has(a.status) ? 0 : 1;
      const bActive = ACTIVE.has(b.status) ? 0 : 1;
      return aActive - bActive;
    });

    return NextResponse.json({ scans });
  } catch (err) {
    console.error('Error in GET /api/admin/scans:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
