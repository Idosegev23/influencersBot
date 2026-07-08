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
  await getQStash().publishJSON({
    url: `${BASE_URL}/api/crm/wa-worker`,
    body: job,
    retries: 3,
    deduplicationId: String(job.msg?.id || `${job.agentId}:${Date.now()}`),
    ...(opts.delaySeconds ? { delay: opts.delaySeconds } : {}),
  });
}
