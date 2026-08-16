import { redisSetNx, redisDel } from '@/lib/redis';
import { csLockKey } from './wa-cs-keys';

/**
 * Per-shopper mutex so a burst can't race whatsapp_cs_sessions. Scoped to the business
 * number: the same shopper on two channels is two conversations and must not share a lock.
 * TTL >= the worker's maxDuration (300s) so the lock can't expire mid-job and admit a sibling.
 */
export async function acquireCsLock(waChannelId: string, waId: string, ttlSeconds = 300): Promise<boolean> {
  return redisSetNx(csLockKey(waChannelId, waId), '1', ttlSeconds);
}
export async function releaseCsLock(waChannelId: string, waId: string): Promise<void> {
  await redisDel(csLockKey(waChannelId, waId));
}
