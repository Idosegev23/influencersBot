import { getQStash } from '@/lib/pipeline/qstash';

const BASE_URL =
  process.env.WA_WORKER_BASE_URL || process.env.PIPELINE_BASE_URL || 'https://influencers-bot.vercel.app';

export interface AgentJob {
  waId: string;
  agentId: string;
  msg: any;
  textBody: string | null;
  attempt?: number; // requeue counter (lock contention / degraded mode)
}

/**
 * Enqueue an agent WhatsApp inbound for the worker. deduplicationId = the Meta
 * wamid so a redelivered webhook can't enqueue the same job twice (QStash dedups
 * within its window; the wa_message_id upsert + issue idempotency are the durable
 * backstops). Vercel freezes the fn after the response, so heavy work must run here.
 */
export async function publishAgentJob(job: AgentJob, opts: { delaySeconds?: number } = {}): Promise<void> {
  const baseId = String(job.msg?.id || `${job.agentId}:${Date.now()}`);
  // A REQUEUE (attempt>0) must NOT reuse the original wamid dedup id — QStash would
  // drop it inside its ~10-min dedup window and the message would be lost forever.
  // Attempt 0 keeps the wamid so a Meta webhook redelivery still can't double-enqueue.
  const deduplicationId = job.attempt ? `${baseId}:a${job.attempt}` : baseId;
  const payload = {
    url: `${BASE_URL}/api/crm/wa-worker`,
    body: job,
    retries: 3,
    deduplicationId,
    ...(opts.delaySeconds ? { delay: opts.delaySeconds } : {}),
  };
  // Retry a transient publish blip so the message isn't silently dropped.
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try { await getQStash().publishJSON(payload); return; }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 150 * (i + 1))); }
  }
  throw lastErr;
}
