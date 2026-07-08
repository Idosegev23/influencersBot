/**
 * Per-agent FIFO inbox (burst reliability). When an agent forwards 15 messages seconds
 * apart, each is pushed onto a Redis list in ARRIVAL ORDER; a single drain worker (holding
 * the per-agent lock) pops them one-by-one and processes each on its own — nothing merged,
 * nothing dropped, strict order (so a brief is always recorded before a later message prices it).
 *
 * Replaces the old "one QStash job per message, each contends for the lock, requeue-with-cap"
 * design, whose 30s requeue window was 7× shorter than a single message's lock-hold → bursts
 * fell through to a degraded concurrent path that raced state, reordered, and lost replies.
 */
import { redisRPush, redisLPopCount, redisLLen, redisSetNx } from '@/lib/redis';
import type { AgentJob } from '@/lib/crm/wa-queue';

const qKey = (agentId: string) => `wa:agent:${agentId}:q`;

/**
 * Append one inbound to the agent's FIFO queue. A per-wamid SETNX guard makes a redelivered
 * Meta webhook a no-op (the same message can't enqueue twice). Returns whether we actually
 * pushed and the resulting queue length.
 */
export async function enqueueAgentMessage(job: AgentJob): Promise<{ enqueued: boolean; queueLen: number }> {
  const wamid = String(job.msg?.id || '');
  if (wamid) {
    const fresh = await redisSetNx(`wa:msg:${wamid}:queued`, '1', 86_400);
    if (!fresh) return { enqueued: false, queueLen: await redisLLen(qKey(job.agentId)) };
  }
  const queueLen = await redisRPush(qKey(job.agentId), [JSON.stringify(job)]);
  return { enqueued: true, queueLen };
}

/** Pop the oldest queued inbound (FIFO). Returns null when the queue is empty. */
export async function dequeueAgentMessage(agentId: string): Promise<AgentJob | null> {
  const [raw] = await redisLPopCount(qKey(agentId), 1);
  if (!raw) return null;
  try { return JSON.parse(raw) as AgentJob; } catch { return null; }
}

export async function agentQueueLength(agentId: string): Promise<number> {
  return redisLLen(qKey(agentId));
}
