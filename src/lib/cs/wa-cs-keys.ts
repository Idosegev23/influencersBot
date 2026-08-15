/**
 * One place for every CS Redis / QStash key, so the channel scoping can't drift
 * between the queue, the lock and the drain publisher.
 *
 * Redis keys MAY contain ':'. QStash deduplicationIds MAY NOT — use '_' there.
 */
export const csQueueKey = (waChannelId: string, waId: string) => `cs:${waChannelId}:wa:${waId}:q`;
export const csLockKey  = (waChannelId: string, waId: string) => `cs:${waChannelId}:wa:${waId}:lock`;
export const csDedupKey = (waChannelId: string, wamid: string) => `cs:${waChannelId}:wa:${wamid}:queued`;

export const csDrainDedupId = (waChannelId: string, waId: string, bucket: number) =>
  `csdrain_${waChannelId}_${waId}_${bucket}`;
