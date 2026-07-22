import { getQStash } from '@/lib/pipeline/qstash';

const BASE_URL =
  process.env.WA_WORKER_BASE_URL || process.env.PIPELINE_BASE_URL || 'https://influencers-bot.vercel.app';

/**
 * Wake the per-shopper CS drain worker. The FIFO messages live in Redis, not this job.
 * A 10-second-bucket dedup id coalesces a burst of triggers into ~1 QStash publish; `force`
 * (a budget continuation / release-race closer / cron sweep) always fires with a unique id.
 * QStash REJECTS a deduplicationId containing ':' — use '_' separators only.
 */
export async function publishCsDrain(waId: string, opts: { force?: boolean } = {}): Promise<void> {
  const bucket = Math.floor(Date.now() / 10_000);
  const deduplicationId = opts.force ? `csdrain_${waId}_f_${Date.now()}` : `csdrain_${waId}_${bucket}`;
  const payload = {
    url: `${BASE_URL}/api/cs/wa-worker`,
    body: { drain: true, waId },
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
