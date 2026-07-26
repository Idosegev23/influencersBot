/**
 * Per-lead FIFO inbox for the Bestie lead funnel. Mirrors the customer-service
 * queue (src/lib/cs/wa-cs-queue.ts) on the `bestie:` Redis namespace, keyed on
 * wa_id. A single drain worker (holding the per-wa_id lock) pops these one by
 * one in arrival order.
 *
 * The namespace must stay distinct from `cs:` — a shared key would let a
 * customer-service drain pop a lead's message and reply to it with the wrong
 * brain entirely.
 */
import { redisRPush, redisLPopCount, redisLLen, redisSetNx } from '@/lib/redis';

export interface BestieLeadJob {
  waId: string;
  msg: any;                 // raw inbound WhatsApp message object
  textBody: string | null;  // pre-extracted (text/button/interactive title)
  leadId?: string | null;
  attempt?: number;
}

const qKey = (waId: string) => `bestie:wa:${waId}:q`;

/**
 * Append one inbound to the lead's FIFO queue. A per-wamid SETNX guard makes a
 * redelivered Meta webhook a no-op — without it the same message enqueues twice
 * and the lead gets two replies to one question.
 */
export async function enqueueLeadMessage(
  job: BestieLeadJob
): Promise<{ enqueued: boolean; queueLen: number }> {
  const wamid = String(job.msg?.id || '');
  if (wamid) {
    const fresh = await redisSetNx(`bestie:wa:${wamid}:queued`, '1', 86_400);
    if (!fresh) return { enqueued: false, queueLen: await redisLLen(qKey(job.waId)) };
  }
  const queueLen = await redisRPush(qKey(job.waId), [JSON.stringify(job)]);
  return { enqueued: true, queueLen };
}

/** Pop the oldest queued inbound (FIFO). Returns null when the queue is empty. */
export async function dequeueLeadMessage(waId: string): Promise<BestieLeadJob | null> {
  const [raw] = await redisLPopCount(qKey(waId), 1);
  if (!raw) return null;
  try { return JSON.parse(raw) as BestieLeadJob; } catch { return null; }
}

export async function leadQueueLength(waId: string): Promise<number> {
  return redisLLen(qKey(waId));
}
