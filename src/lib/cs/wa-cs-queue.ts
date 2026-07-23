/**
 * Per-shopper FIFO inbox for the WhatsApp customer-service engine. Mirrors the CRM agent
 * queue (src/lib/crm/wa-agent-queue.ts) but on the `cs:` Redis namespace and keyed on wa_id.
 * A single drain worker (holding the per-wa_id lock) pops these one-by-one in arrival order.
 */
import { redisRPush, redisLPopCount, redisLLen, redisSetNx } from '@/lib/redis';
import type { CsImage } from './cs-media';

export interface CsJob {
  waId: string;
  msg: any;                 // raw inbound WhatsApp message object
  textBody: string | null;  // pre-extracted (text/button/interactive title)
  contactId?: string | null;
  attempt?: number;
  image?: CsImage;          // worker-populated (materializeCsImage) for image inbounds — NOT enqueued to Redis
}

const qKey = (waId: string) => `cs:wa:${waId}:q`;

/**
 * Append one inbound to the shopper's FIFO queue. A per-wamid SETNX guard makes a redelivered
 * Meta webhook a no-op (the same message can't enqueue twice). Redis keys may contain ':'.
 */
export async function enqueueCsMessage(job: CsJob): Promise<{ enqueued: boolean; queueLen: number }> {
  const wamid = String(job.msg?.id || '');
  if (wamid) {
    const fresh = await redisSetNx(`cs:wa:${wamid}:queued`, '1', 86_400);
    if (!fresh) return { enqueued: false, queueLen: await redisLLen(qKey(job.waId)) };
  }
  const queueLen = await redisRPush(qKey(job.waId), [JSON.stringify(job)]);
  return { enqueued: true, queueLen };
}

/** Pop the oldest queued inbound (FIFO). Returns null when the queue is empty. */
export async function dequeueCsMessage(waId: string): Promise<CsJob | null> {
  const [raw] = await redisLPopCount(qKey(waId), 1);
  if (!raw) return null;
  try { return JSON.parse(raw) as CsJob; } catch { return null; }
}

export async function csQueueLength(waId: string): Promise<number> {
  return redisLLen(qKey(waId));
}
