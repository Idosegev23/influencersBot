import { supabase as supabaseAdmin } from '@/lib/supabase';
import { downloadMedia, sendText, sendReaction } from '@/lib/whatsapp-cloud/client';
import { acquireAgentLock, releaseAgentLock } from '@/lib/crm/wa-locks';
import { publishAgentJob, publishDrain, type AgentJob } from '@/lib/crm/wa-queue';
import { dequeueAgentMessage, agentQueueLength } from '@/lib/crm/wa-agent-queue';
import { handleAgentMessage, type WaAgent } from '@/lib/crm/wa-conversation';
import { reactionForOutcome, channelOf } from '@/lib/crm/wa-outcome';
import { logAgentWa } from '@/lib/crm/wa-log';
import { redisGet, redisSetNx } from '@/lib/redis';

// A brief-parse + gpt-5.5 turn can take ~30s while holding the per-agent lock; give
// requeued burst messages enough attempts (10 × 3s ≈ 30s) to wait it out and process
// SERIALLY, instead of exhausting retries and running degraded/concurrent.
const MAX_REQUEUE = 10;

// Stop draining ~70s before Vercel's 300s kill so the loop exits cleanly, releases the lock,
// and re-enqueues a continuation — instead of being killed mid-item with the lock still held.
const DRAIN_BUDGET_MS = 230_000;

export async function loadAgentById(agentId: string): Promise<WaAgent | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, role, status, managed_account_ids, full_name')
    .eq('id', agentId)
    .maybeSingle();
  if (!data || (data as any).role !== 'agent' || (data as any).status !== 'active') return null;
  return data as any;
}

/** Download an attachment / transcribe a voice note (P1 keeps the Gemini quote-parser path; P2 swaps STT). */
export async function materializeInbound(msg: any): Promise<{ attachments: any[]; voiceText: string | null; isVoice: boolean; sttConfidence: number | null; sttProvider: string | null }> {
  const attachments: { filename: string; mime: string; bytes: Uint8Array }[] = [];
  const type: string = msg?.type;
  const mediaId: string | undefined = msg?.[type]?.id;
  let voiceText: string | null = null;
  let isVoice = false;
  let sttConfidence: number | null = null;
  let sttProvider: string | null = null;

  if (mediaId && (type === 'document' || type === 'image')) {
    try {
      const dl = await downloadMedia(mediaId);
      if (dl) {
        const mime = dl.mimeType || msg[type]?.mime_type || 'application/octet-stream';
        const ext = mime.split('/')[1] || 'bin';
        attachments.push({ filename: msg[type]?.filename || `${type}.${ext}`, mime, bytes: new Uint8Array(dl.bytes) });
      }
    } catch (e) { console.warn('[wa-worker] media download failed', e); }
  }

  if (type === 'audio' && mediaId) {
    isVoice = true; // set NOW so a throw still triggers the "resend" guard downstream
    try {
      const dl = await downloadMedia(mediaId);
      if (dl) {
        const mime = dl.mimeType || msg.audio?.mime_type || 'audio/ogg';
        const { transcribeHebrew } = await import('@/lib/stt/transcribeHebrew');
        const t = await transcribeHebrew(new Uint8Array(dl.bytes), mime);
        voiceText = t.text;
        sttConfidence = t.confidence;
        sttProvider = t.provider;
      }
    } catch (e) { console.warn('[wa-worker] transcription failed', e); }
  }
  return { attachments, voiceText, isVoice, sttConfidence, sttProvider };
}

/**
 * Process exactly one inbound (materialize → brain → reply → ✅/⚠️ reaction → Decision-Log row).
 * The caller (the drain loop) already holds the per-agent lock, so this does NO locking. A
 * wa_message_id "done" guard makes a re-delivery a no-op; the reply is sent BEFORE the guard is
 * set so a crash between them just re-processes (no lost reply). Returns the outcome, or null if
 * the guard short-circuited a duplicate.
 */
async function processOneInbound(agent: WaAgent, job: AgentJob): Promise<string | null> {
  const doneKey = `wa:msg:${job.msg?.id}:done`;
  try { if (job.msg?.id && (await redisGet(doneKey))) return null; } catch { /* ignore */ }

  const startedAt = Date.now();
  const { attachments, voiceText, isVoice, sttConfidence, sttProvider } = await materializeInbound(job.msg);
  const result = await handleAgentMessage(agent, job.waId, voiceText || job.textBody, attachments, { isVoice, sttConfidence });
  if (result.reply) {
    await sendText({ to: job.waId, body: result.reply, contextMessageId: job.msg.id });
    try { if (job.msg?.id) await redisSetNx(doneKey, '1', 900); } catch { /* ignore */ } // mark replied → dedup a retry
    const emoji = reactionForOutcome(result.outcome);
    if (emoji) void sendReaction({ to: job.waId, messageId: job.msg.id, emoji }).catch(() => {});
  }
  void logAgentWa({
    messageId: job.msg.id,
    agentId: agent.id,
    channel: channelOf(job.msg),
    transcript: voiceText || job.textBody || null,
    outcome: result.outcome,
    latencyMs: Date.now() - startedAt,
    sttProvider: isVoice ? sttProvider : null,
    sttConfidence: isVoice ? sttConfidence : null,
    log: result.log,
  }).catch(() => {});
  return result.outcome;
}

/**
 * Drain the agent's FIFO queue. ONE drain holds the per-agent lock and pops messages one-by-one
 * in ARRIVAL ORDER — nothing merged, nothing dropped, no concurrency (so a brief is always recorded
 * before a later message prices it). A concurrent drain that can't get the lock simply exits; the
 * holder will pick up whatever it pushed. On hitting the time budget with items still queued, it
 * re-enqueues a continuation (and closes the tiny release-race by re-checking the queue after unlock).
 */
export async function runAgentDrain(agentId: string): Promise<{ status: string; processed: number }> {
  const locked = await acquireAgentLock(agentId);
  if (!locked) return { status: 'busy', processed: 0 }; // another drain owns it → it'll drain our items

  const deadline = Date.now() + DRAIN_BUDGET_MS;
  let processed = 0;
  try {
    const agent = await loadAgentById(agentId);
    if (!agent) return { status: 'no-agent', processed: 0 };
    while (Date.now() < deadline) {
      const job = await dequeueAgentMessage(agentId);
      if (!job) break; // queue drained
      try { await processOneInbound(agent, job); }
      catch (e) { console.warn('[wa-drain] item failed (dropped, dedup+idempotency are the backstops)', e); }
      processed++;
    }
  } catch (e) {
    console.warn('[wa-drain] drain failed', e);
  } finally {
    await releaseAgentLock(agentId);
  }

  // Continuation (budget hit) OR release-race closer (a message pushed in the unlock window):
  // if anything remains, wake a fresh drain. force=true → unique dedup id so QStash won't swallow it.
  try {
    if (await agentQueueLength(agentId) > 0) await publishDrain(agentId, { force: true });
  } catch (e) { console.warn('[wa-drain] continuation publish failed', e); }

  return { status: 'ok', processed };
}

/**
 * LEGACY single-message path — kept only to drain any old-format {msg,...} jobs still in flight
 * across a deploy. New inbounds go through the Redis FIFO queue + runAgentDrain. Safe to remove
 * once no legacy jobs remain in QStash (~10 min after deploy).
 */
export async function runAgentJob(job: AgentJob): Promise<{ status: string; outcome?: string }> {
  const doneKey = `wa:msg:${job.msg?.id}:done`;
  try { if (job.msg?.id && (await redisGet(doneKey))) return { status: 'duplicate' }; } catch { /* ignore */ }

  const attempt = job.attempt ?? 0;
  const locked = await acquireAgentLock(job.agentId);
  if (!locked && attempt < MAX_REQUEUE) {
    await publishAgentJob({ ...job, attempt: attempt + 1 }, { delaySeconds: 3 });
    return { status: 'requeued' };
  }
  try {
    const agent = await loadAgentById(job.agentId);
    if (!agent) return { status: 'no-agent' };
    const outcome = await processOneInbound(agent, job);
    return { status: 'ok', outcome: outcome ?? undefined };
  } catch (e) {
    console.warn('[wa-worker] legacy job failed', e);
    return { status: 'error' };
  } finally {
    if (locked) await releaseAgentLock(job.agentId);
  }
}
