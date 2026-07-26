import { redisSetNx, redisDel } from '@/lib/redis';

/**
 * Per-lead mutex so a burst of messages can't race bestie_lead_sessions.
 * TTL >= the worker's maxDuration (300s) so the lock cannot expire mid-job and
 * admit a sibling that would answer the same lead twice.
 */
export async function acquireLeadLock(waId: string, ttlSeconds = 300): Promise<boolean> {
  return redisSetNx(`bestie:wa:${waId}:lock`, '1', ttlSeconds);
}

export async function releaseLeadLock(waId: string): Promise<void> {
  await redisDel(`bestie:wa:${waId}:lock`);
}
