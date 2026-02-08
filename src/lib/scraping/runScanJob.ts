/**
 * Run Scan Job - מריץ סריקה עבור job ספציפי
 */

import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { NewScanOrchestrator } from './newScanOrchestrator';

/**
 * Run a single scan job
 */
export async function runScanJob(jobId: string): Promise<void> {
  const repo = getScanJobsRepo();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [Scan Job] Starting job ${jobId}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Get the job
    const job = await repo.getById(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== 'queued') {
      console.log(`⚠️  [Scan Job] Job ${jobId} is already ${job.status}, skipping`);
      return;
    }

    // Mark as running
    await repo.markRunning(jobId, 'api-worker');

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
    await repo.markSucceeded(jobId, results);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [Scan Job] Job ${jobId} completed successfully!`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [Scan Job] Job ${jobId} FAILED:`, error.message || error);
    console.error(`${'='.repeat(60)}\n`);

    // Mark as failed
    const errorCode = error.code || error.errorCode || 'UNKNOWN_ERROR';
    const errorMessage = error.message || 'Unknown error occurred';
    
    try {
      await repo.markFailed(jobId, errorCode, errorMessage);
      console.log(`[Scan Job] Marked job ${jobId} as failed in database`);
    } catch (markError) {
      console.error(`[Scan Job] Failed to mark job as failed:`, markError);
    }

    // Re-throw so background handler knows it failed
    throw error;
  }
}
