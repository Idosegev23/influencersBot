/**
 * Forward a Bestie chat session to Itamar's personal WhatsApp via the
 * `bestie_handoff_lead` template.
 *
 * Flow:
 *   1. Generate a 4-char ref code (e.g. "A4F2")
 *   2. Insert a chat_handoffs row in `pending` status
 *   3. Send the template to ITAMAR_WHATSAPP_NUMBER (or override)
 *   4. Update the row to `forwarded` with the wa_message_id, OR `failed`
 *
 * Itamar's reply lands in /api/webhooks/whatsapp where it gets matched
 * back to this handoff via:
 *   (a) msg.context.id === last_outbound_wa_message_id   [quote-reply]
 *   (b) the leading [#REFCODE] tag in the body
 *   (c) most-recent forwarded handoff for his phone within 24h
 */

import { createClient } from '@supabase/supabase-js';
import { sendTemplate } from '@/lib/whatsapp-cloud/client';

const TEMPLATE_NAME = 'bestie_handoff_lead';
const TEMPLATE_LANG = 'he';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function generateRefCode(): string {
  // 4-char base32 (no ambiguous chars) — gives 32^4 = ~1M combos
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

interface ForwardInput {
  sessionId: string;
  accountId: string;
  visitorLabel: string; // e.g. "Noa Lavi · @noki_coffe · 9.1K"
  visitorQuestion: string;
  /** Override the default ITAMAR_WHATSAPP_NUMBER env (used for testing). */
  targetPhoneOverride?: string;
  targetName?: string; // for the row, defaults to "Itamar"
}

interface ForwardResult {
  success: boolean;
  refCode?: string;
  handoffId?: string;
  waMessageId?: string;
  error?: string;
}

export async function forwardToItamar(input: ForwardInput): Promise<ForwardResult> {
  const supabase = getSupabase();

  const targetPhone =
    input.targetPhoneOverride ||
    process.env.ITAMAR_WHATSAPP_NUMBER ||
    '';
  if (!targetPhone) {
    return { success: false, error: 'ITAMAR_WHATSAPP_NUMBER not configured' };
  }

  // Trim long questions — template body has a 1024-char limit overall;
  // we cap the question to 250 chars per the example we submitted.
  const questionCapped =
    input.visitorQuestion.length > 250
      ? input.visitorQuestion.slice(0, 247) + '…'
      : input.visitorQuestion;

  // 1. Reserve a unique ref_code (retry up to 5x in the rare collision case)
  let refCode = '';
  let handoffId = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateRefCode();
    const { data, error } = await supabase
      .from('chat_handoffs')
      .insert({
        account_id: input.accountId,
        session_id: input.sessionId,
        ref_code: candidate,
        visitor_label: input.visitorLabel,
        visitor_question: input.visitorQuestion,
        target_phone: targetPhone,
        target_name: input.targetName || 'Itamar',
        status: 'pending',
        template_name: TEMPLATE_NAME,
      })
      .select('id, ref_code')
      .single();

    if (!error && data) {
      refCode = data.ref_code;
      handoffId = data.id;
      break;
    }
    // Unique violation (23505) → retry with a new code
    if (error?.code !== '23505') {
      console.error('[handoff] failed to insert chat_handoff row:', error);
      return { success: false, error: error?.message || 'DB insert failed' };
    }
  }
  if (!refCode) {
    return { success: false, error: 'Could not allocate a unique ref code' };
  }

  // 2. Fire the template
  const result = await sendTemplate({
    to: targetPhone,
    templateName: TEMPLATE_NAME,
    languageCode: TEMPLATE_LANG,
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: refCode },
          { type: 'text', text: input.visitorLabel.slice(0, 120) },
          { type: 'text', text: questionCapped },
        ],
      },
    ],
  });

  if (!result.success) {
    await supabase
      .from('chat_handoffs')
      .update({
        status: 'failed',
        forward_error: result.error?.message || 'send failed',
      })
      .eq('id', handoffId);
    return {
      success: false,
      refCode,
      handoffId,
      error: result.error?.message || 'WhatsApp send failed',
    };
  }

  // 3. Mark forwarded
  await supabase
    .from('chat_handoffs')
    .update({
      status: 'forwarded',
      forwarded_at: new Date().toISOString(),
      last_outbound_wa_message_id: result.wa_message_id || null,
    })
    .eq('id', handoffId);

  return {
    success: true,
    refCode,
    handoffId,
    waMessageId: result.wa_message_id,
  };
}
