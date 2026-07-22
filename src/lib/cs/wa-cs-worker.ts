import { acquireCsLock, releaseCsLock } from '@/lib/cs/wa-cs-locks';
import { dequeueCsMessage, csQueueLength, type CsJob } from '@/lib/cs/wa-cs-queue';
import { publishCsDrain } from '@/lib/cs/wa-cs-publish';
import { runCsTurn, type CsTurnResult } from '@/lib/cs/cs-agent';
import { sendText, sendInteractiveButtons, sendInteractiveList, sendReaction } from '@/lib/whatsapp-cloud/client';
import { redisGet, redisSetNx } from '@/lib/redis';

// Exit ~70s before Vercel's 300s kill so the loop releases the lock and enqueues a continuation
// instead of dying mid-item with the lock still held.
const DRAIN_BUDGET_MS = 230_000;

/**
 * Process exactly one inbound: done-guard → runCsTurn → dispatch reply by kind (send-with-retry)
 * → done SETNX (only after a CONFIRMED send) → ✅ reaction. The reply is sent BEFORE the done guard
 * so a crash between them re-processes (no lost reply). runCsTurn is dynamically imported so this
 * module has no static dependency on the Phase-C brain-led agent loop (src/lib/cs/cs-agent.ts).
 * NOTE: Task C7 finalizes this body (static runCsTurn import, wa_message_id return) — see C7's diff.
 */
export async function processOneCsInbound(job: CsJob): Promise<string | null> {
  const doneKey = `cs:wa:${job.msg?.id}:done`;
  try { if (job.msg?.id && (await redisGet(doneKey))) return null; } catch { /* ignore */ }

  const turn = await runCsTurn(job);
  const reply = turn.reply;
  if (!reply || reply.kind === 'none') return null;

  // Meta can return {success:false} WITHOUT throwing on 429/503 → retry the SEND 3x.
  let sent: { success: boolean; wa_message_id?: string } = { success: false };
  for (let i = 0; i < 3; i++) {
    try {
      if (reply.kind === 'text') {
        sent = await sendText({ to: job.waId, body: reply.body, contextMessageId: job.msg?.id });
      } else if (reply.kind === 'buttons') {
        sent = await sendInteractiveButtons({ to: job.waId, body: reply.body, buttons: reply.buttons, header: reply.header, footer: reply.footer });
      } else if (reply.kind === 'list') {
        sent = await sendInteractiveList({ to: job.waId, body: reply.body, buttonLabel: reply.buttonLabel, sections: reply.sections, header: reply.header, footer: reply.footer });
      }
    } catch (e) { sent = { success: false }; console.warn('[cs-worker] send threw', e); }
    if (sent.success) break;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }

  if (sent.success) {
    try { if (job.msg?.id) await redisSetNx(doneKey, '1', 900); } catch { /* ignore */ }
    // Promise.resolve(...) wraps the call so a fire-and-forget reaction can never throw
    // synchronously into the caller, even if the reaction backend doesn't return a promise.
    if (job.msg?.id) void Promise.resolve(sendReaction({ to: job.waId, messageId: job.msg.id, emoji: '✅' })).catch(() => {});
  } else {
    console.error('[cs-worker] reply delivery FAILED after 3 retries', job.msg?.id);
    if (job.msg?.id) void Promise.resolve(sendReaction({ to: job.waId, messageId: job.msg.id, emoji: '⚠️' })).catch(() => {});
  }
  return sent.success ? (sent.wa_message_id ?? null) : null;
}

/**
 * Drain the shopper's FIFO queue. ONE drain holds the per-wa_id lock and pops messages one-by-one
 * in ARRIVAL ORDER. A concurrent drain that can't get the lock simply exits. On hitting the time
 * budget with items still queued, or on a release-race, it re-enqueues a forced continuation.
 */
export async function runCsDrain(waId: string): Promise<{ status: string; processed: number }> {
  const locked = await acquireCsLock(waId);
  if (!locked) return { status: 'busy', processed: 0 };

  const deadline = Date.now() + DRAIN_BUDGET_MS;
  let processed = 0;
  try {
    while (Date.now() < deadline) {
      const job = await dequeueCsMessage(waId);
      if (!job) break; // queue drained
      try { await processOneCsInbound(job); }
      catch (e) { console.warn('[cs-drain] item failed (dropped; dedup+done guards are the backstops)', e); }
      processed++;
    }
  } catch (e) {
    console.warn('[cs-drain] drain failed', e);
  } finally {
    await releaseCsLock(waId);
  }

  try {
    if (await csQueueLength(waId) > 0) await publishCsDrain(waId, { force: true });
  } catch (e) { console.warn('[cs-drain] continuation publish failed', e); }

  return { status: 'ok', processed };
}
