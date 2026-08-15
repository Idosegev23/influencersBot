/**
 * Drains one lead's FIFO queue: lock → pop → brain → send → mark done.
 *
 * Mirrors the customer-service worker. Two orderings are deliberate and easy to
 * get backwards:
 *
 *   1. The reply is SENT before the done-guard is written. A crash between them
 *      re-processes the message — a duplicate reply is recoverable, a lost one
 *      leaves the lead staring at silence.
 *   2. bot_paused is re-checked after every turn, because handoff_to_sales may
 *      have fired during it. The remaining queued messages then belong to the
 *      salesperson, not the bot.
 */
import { acquireLeadLock, releaseLeadLock } from '@/lib/bestie/wa-lead-locks';
import { dequeueLeadMessage, leadQueueLength, type BestieLeadJob } from '@/lib/bestie/wa-lead-queue';
import { publishLeadDrain } from '@/lib/bestie/wa-lead-publish';
import { runBestieTurn } from '@/lib/bestie/bestie-agent';
import { sendText, sendReaction } from '@/lib/whatsapp-cloud/client';
import { getBestieChannel } from '@/lib/whatsapp-cloud/channels';
import { redisGet, redisSetNx } from '@/lib/redis';

// Exit well before Vercel's 300s kill so the loop releases the lock and enqueues
// a continuation instead of dying mid-item with the lock still held.
const DRAIN_BUDGET_MS = 230_000;

async function isPaused(waId: string): Promise<boolean> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const { data } = await supabase
    .from('bestie_lead_sessions').select('bot_paused').eq('wa_id', waId).maybeSingle();
  return Boolean(data?.bot_paused);
}

async function markEngaged(waId: string): Promise<void> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const nowIso = new Date().toISOString();
  const { data: session } = await supabase
    .from('bestie_lead_sessions').select('lead_id').eq('wa_id', waId).maybeSingle();
  if (!session?.lead_id) return;
  // Only promote from greeted — never drag a handed_off lead back to engaged.
  await supabase
    .from('bestie_leads')
    .update({ status: 'engaged', last_inbound_at: nowIso, updated_at: nowIso })
    .eq('id', session.lead_id)
    .in('status', ['pending', 'greeted']);
}

export async function processOneLeadInbound(job: BestieLeadJob): Promise<string | null> {
  const doneKey = `bestie:wa:${job.msg?.id}:done`;
  try { if (job.msg?.id && (await redisGet(doneKey))) return null; } catch { /* ignore */ }

  await markEngaged(job.waId);

  const turn = await runBestieTurn(job);
  if (turn.reply.kind === 'none') return null;

  // Meta can return {success:false} WITHOUT throwing on 429/503 → retry the send.
  let sent: { success: boolean; wa_message_id?: string } = { success: false };
  for (let i = 0; i < 3; i++) {
    try {
      sent = await sendText({ channel: await getBestieChannel(),
        to: job.waId,
        body: turn.reply.body,
        contextMessageId: job.msg?.id,
      });
    } catch (e) {
      sent = { success: false };
      console.warn('[bestie-lead-worker] send threw', e);
    }
    if (sent.success) break;
    await new Promise(r => setTimeout(r, 400 * (i + 1)));
  }

  if (!sent.success) return null; // leave undone so a retry can pick it up

  try { if (job.msg?.id) await redisSetNx(doneKey, '1', 86_400); } catch { /* ignore */ }
  if (job.msg?.id) {
    void sendReaction({ channel: await getBestieChannel(), to: job.waId, messageId: job.msg.id, emoji: '✅' }).catch(() => {});
  }

  return sent.wa_message_id ?? null;
}

export async function runLeadDrain(waId: string): Promise<{ drained: number; requeued: boolean }> {
  if (!(await acquireLeadLock(waId))) {
    // A sibling holds the lock and will drain what we would have.
    return { drained: 0, requeued: false };
  }

  const startedAt = Date.now();
  let drained = 0;
  let requeued = false;

  try {
    while (Date.now() - startedAt < DRAIN_BUDGET_MS) {
      if (await isPaused(waId)) break; // a salesperson owns this thread now

      const job = await dequeueLeadMessage(waId);
      if (!job) break;

      try {
        await processOneLeadInbound(job);
      } catch (e) {
        console.error('[bestie-lead-worker] turn failed', e);
      }
      drained++;
    }

    if ((await leadQueueLength(waId)) > 0) {
      requeued = true;
    }
  } finally {
    await releaseLeadLock(waId);
  }

  // Publish AFTER releasing, so the continuation can actually take the lock.
  if (requeued) {
    try { await publishLeadDrain(waId, { force: true }); }
    catch (e) { console.error('[bestie-lead-worker] continuation publish failed', e); }
  }

  return { drained, requeued };
}
