import { redisSetNx, redisDel } from '@/lib/redis';

/**
 * Per-shopper mutex so a burst can't race whatsapp_cs_sessions. TTL >= the worker's
 * maxDuration (300s) so the lock can't expire mid-job and admit a sibling.
 */
export async function acquireCsLock(waId: string, ttlSeconds = 300): Promise<boolean> {
  return redisSetNx(`cs:wa:${waId}:lock`, '1', ttlSeconds);
}
export async function releaseCsLock(waId: string): Promise<void> {
  await redisDel(`cs:wa:${waId}:lock`);
}
