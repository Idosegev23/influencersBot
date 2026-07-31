/**
 * Run Scan Job - מריץ סריקה עבור job ספציפי
 */

import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { NewScanOrchestrator } from './newScanOrchestrator';

export interface RunScanJobOptions {
  /**
   * Whether this call owns the `scan_jobs` row's lifecycle (running → succeeded/failed).
   *
   * True (default) for the legacy single-shot callers — cron, `/api/scan/start`,
   * `/api/admin/full-scan`, the CLI scripts — where the Instagram scan IS the whole job.
   *
   * The QStash pipeline must pass **false**: its `ig-scan` step shares the same job row,
   * and the Instagram scan is step 2 of 11. Marking terminal status here reported every
   * pipeline job `succeeded` while six steps were still queued (misleading
   * `/admin/scan/[jobId]` and anything else reading `status`), and the not-queued guard
   * made a QStash retry of `ig-scan` skip the scan silently while the pipeline advanced
   * with no Instagram data. In pipeline mode `/api/pipeline/run` owns status, and
   * `acquireStepLock` already provides the de-duplication the guard was there for.
   */
  manageJobStatus?: boolean;
}

/**
 * Run a single scan job
 */
export async function runScanJob(jobId: string, options: RunScanJobOptions = {}): Promise<void> {
  const { manageJobStatus = true } = options;
  const repo = getScanJobsRepo();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [Scan Job] Starting job ${jobId}${manageJobStatus ? '' : ' (pipeline mode — caller owns status)'}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Get the job
    const job = await repo.getById(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (manageJobStatus) {
      if (job.status !== 'queued') {
        console.log(`⚠️  [Scan Job] Job ${jobId} is already ${job.status}, skipping`);
        return;
      }

      // Mark as running
      await repo.markRunning(jobId, 'api-worker');
    }

    // Create orchestrator
    const orchestrator = new NewScanOrchestrator();

    // Run the scan!
    console.log(`[Scan Job] Running orchestrator for @${job.username}...`);
    const results = await orchestrator.run(
      jobId,
      job.username,
      job.account_id!,
      job.config || {}
    );

    // Mark as succeeded
    if (manageJobStatus) await repo.markSucceeded(jobId, results);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [Scan Job] Job ${jobId} completed successfully!`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [Scan Job] Job ${jobId} FAILED:`, error.message || error);
    console.error(`${'='.repeat(60)}\n`);

    // Mark as failed
    if (manageJobStatus) {
      const errorCode = error.code || error.errorCode || 'UNKNOWN_ERROR';
      const errorMessage = error.message || 'Unknown error occurred';

      try {
        await repo.markFailed(jobId, errorCode, errorMessage);
        console.log(`[Scan Job] Marked job ${jobId} as failed in database`);
      } catch (markError) {
        console.error(`[Scan Job] Failed to mark job as failed:`, markError);
      }
    }

    // Re-throw so background handler knows it failed
    throw error;
  }
}
