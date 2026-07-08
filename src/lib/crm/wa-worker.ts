import { supabase as supabaseAdmin } from '@/lib/supabase';
import { downloadMedia, sendText, sendReaction } from '@/lib/whatsapp-cloud/client';
import { acquireAgentLock, releaseAgentLock } from '@/lib/crm/wa-locks';
import { publishAgentJob, type AgentJob } from '@/lib/crm/wa-queue';
import { handleAgentMessage, type WaAgent } from '@/lib/crm/wa-conversation';
import { reactionForOutcome, channelOf } from '@/lib/crm/wa-outcome';
import { logAgentWa } from '@/lib/crm/wa-log';
import { redisGet, redisSetNx } from '@/lib/redis';

const MAX_REQUEUE = 5;

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
 * Process one enqueued agent inbound. Per-agent Redis mutex serializes a burst of
 * voice notes; on contention the job is re-enqueued with a short delay (approx FIFO)
 * up to MAX_REQUEUE, after which it runs degraded (the wa_message_id dedup + issue
 * idempotency remain the correctness backstops). ✅/⚠️ reaction is outcome-gated; every
 * message writes one crm_agent_wa_log row (Decision-Log moved here from the webhook).
 */
export async function runAgentJob(job: AgentJob): Promise<{ status: string; outcome?: string }> {
  // Worker-side dedup: a QStash redelivery (fn timeout AFTER we already replied) must not
  // re-run the brain / re-send. Defensive — a Redis blip just means no dedup (safe).
  const doneKey = `wa:msg:${job.msg?.id}:done`;
  try { if (job.msg?.id && (await redisGet(doneKey))) return { status: 'duplicate' }; } catch { /* ignore */ }

  const attempt = job.attempt ?? 0;
  const locked = await acquireAgentLock(job.agentId);
  if (!locked && attempt < MAX_REQUEUE) {
    await publishAgentJob({ ...job, attempt: attempt + 1 }, { delaySeconds: 3 });
    return { status: 'requeued' };
  }
  const startedAt = Date.now();
  try {
    const agent = await loadAgentById(job.agentId);
    if (!agent) return { status: 'no-agent' };
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
    return { status: 'ok', outcome: result.outcome };
  } catch (e) {
    console.warn('[wa-worker] job failed', e);
    return { status: 'error' };
  } finally {
    if (locked) await releaseAgentLock(job.agentId);
  }
}
