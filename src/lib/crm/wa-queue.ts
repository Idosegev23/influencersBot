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
  const baseId = String(job.msg?.id || `${job.agentId}_${Date.now()}`);
  // A REQUEUE (attempt>0) must NOT reuse the original wamid dedup id — QStash would
  // drop it inside its ~10-min dedup window and the message would be lost forever.
  // Attempt 0 keeps the wamid so a Meta webhook redelivery still can't double-enqueue.
  // NOTE: QStash rejects a deduplicationId containing ':' — separators must be '_' / '-'.
  const deduplicationId = job.attempt ? `${baseId}_a${job.attempt}` : baseId;
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

/**
 * Wake the per-agent drain worker (the FIFO messages themselves live in Redis, not in this job).
 * A 10-second-bucket dedup id COALESCES a burst of triggers into ~1 QStash publish, yet a later
 * burst (next bucket) still wakes a fresh drain — avoiding the "static dedup id swallowed inside
 * QStash's 10-min window" trap. `force` (a budget continuation or a release-race closer) always
 * fires with a unique id. Redundant drains are harmless: the per-agent lock turns extras into no-ops.
 */
export async function publishDrain(agentId: string, opts: { force?: boolean } = {}): Promise<void> {
  const bucket = Math.floor(Date.now() / 10_000);
  // QStash REJECTS a deduplicationId containing ':' (error "DeduplicationId cannot contain ':'").
  // Use '_' separators. agentId is a UUID (hyphens only), so the id stays collision-safe.
  const deduplicationId = opts.force ? `drain_${agentId}_f_${Date.now()}` : `drain_${agentId}_${bucket}`;
  const payload = {
    url: `${BASE_URL}/api/crm/wa-worker`,
    body: { drain: true, agentId },
    retries: 3,
    deduplicationId,
  };
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try { await getQStash().publishJSON(payload); return; }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 150 * (i + 1))); }
  }
  throw lastErr;
}
