import { redisSetNx } from '@/lib/redis';
import type { PipelineStep } from './types';

/**
 * Acquire a per-(job, step, batch) mutex so a QStash message that is delivered
 * more than once cannot run the same step twice concurrently.
 * Lock key format `pipeline:{jobId}:lock:{step}:{batch}`, TTL 120s.
 */
export async function acquireStepLock(jobId: string, step: PipelineStep, batch: number): Promise<boolean> {
  return redisSetNx(`pipeline:${jobId}:lock:${step}:${batch}`, '1', 120);
}
