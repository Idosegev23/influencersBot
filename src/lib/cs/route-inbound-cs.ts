import { sendReaction, sendTyping } from '@/lib/whatsapp-cloud/client';
import { enqueueCsMessage } from '@/lib/cs/wa-cs-queue';
import { publishCsDrain } from '@/lib/cs/wa-cs-publish';

/**
 * The 4th webhook branch: an inbound from an UNKNOWN sender (not Itamar, not a registered agent,
 * not an open ticket) is a customer-service shopper. Give instant feedback (👀 + typing), push the
 * message onto the per-shopper FIFO queue, and wake the drain worker. Returns claimed=true when the
 * message was queued (so the caller stops routing). Mirrors maybeEnqueueAgentJob (route.ts:346).
 */
export async function routeInboundToCustomerService(input: {
  waId: string;
  contactId: string | null;
  msg: any;
  textBody: string | null;
}): Promise<{ claimed: boolean }> {
  // Instant feedback — fire-and-forget so they add no latency. 👀 lands first; the worker swaps
  // it to ✅/⚠️ when the reply is ready. Typing also marks-as-read.
  if (input.msg?.id) {
    void sendReaction({ to: input.waId, messageId: input.msg.id, emoji: '👀' }).catch(() => {});
    void sendTyping(input.msg.id).catch(() => {});
  }

  try {
    await enqueueCsMessage({
      waId: input.waId,
      contactId: input.contactId,
      msg: input.msg,
      textBody: input.textBody,
    });
  } catch (e) {
    // Redis unreachable → we can't even queue it → leave the message in whatsapp_messages for triage.
    console.error('[cs] failed to enqueue CS message', e);
    return { claimed: false };
  }

  // Safely queued; wake the drain (bucket-dedup coalesces a burst to ~1 publish). If this throws,
  // the message still gets picked up by the next inbound's drain or the sweep cron — so don't fail.
  try { await publishCsDrain(input.waId); }
  catch (e) { console.error('[cs] publishCsDrain failed (queued; next trigger will drain)', e); }

  return { claimed: true };
}
