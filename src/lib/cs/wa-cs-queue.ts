/**
 * Per-shopper FIFO inbox for the WhatsApp customer-service engine. Mirrors the CRM agent
 * queue (src/lib/crm/wa-agent-queue.ts) but on the `cs:` Redis namespace and keyed on wa_id.
 * A single drain worker (holding the per-wa_id lock) pops these one-by-one in arrival order.
 */
import { redisRPush, redisLPopCount, redisLLen, redisSetNx } from '@/lib/redis';
import { csQueueKey, csDedupKey } from './wa-cs-keys';
import type { CsImage } from './cs-media';

export interface CsJob {
  waChannelId: string;      // which business number this arrived on
  // Customer channel only: the account the NUMBER belongs to. Null on Bestie's shared number,
  // where the brand is discovered in conversation instead.
  boundAccountId?: string | null;
  waId: string;
  msg: any;                 // raw inbound WhatsApp message object
  textBody: string | null;  // pre-extracted (text/button/interactive title)
  contactId?: string | null;
  attempt?: number;
  image?: CsImage;          // worker-populated (materializeCsImage) for image inbounds — NOT enqueued to Redis
}

/**
 * Append one inbound to the shopper's FIFO queue. A per-wamid SETNX guard makes a redelivered
 * Meta webhook a no-op (the same message can't enqueue twice). Redis keys may contain ':'.
 */
export async function enqueueCsMessage(job: CsJob): Promise<{ enqueued: boolean; queueLen: number }> {
  const key = csQueueKey(job.waChannelId, job.waId);
  const wamid = String(job.msg?.id || '');
  if (wamid) {
    const fresh = await redisSetNx(csDedupKey(job.waChannelId, wamid), '1', 86_400);
    if (!fresh) return { enqueued: false, queueLen: await redisLLen(key) };
  }
  const queueLen = await redisRPush(key, [JSON.stringify(job)]);
  return { enqueued: true, queueLen };
}

/** Pop the oldest queued inbound (FIFO). Returns null when the queue is empty. */
export async function dequeueCsMessage(waChannelId: string, waId: string): Promise<CsJob | null> {
  const [raw] = await redisLPopCount(csQueueKey(waChannelId, waId), 1);
  if (!raw) return null;
  try { return JSON.parse(raw) as CsJob; } catch { return null; }
}

export async function csQueueLength(waChannelId: string, waId: string): Promise<number> {
  return redisLLen(csQueueKey(waChannelId, waId));
}
