/**
 * Bot give-up telemetry.
 *
 * Records the points where the bot returned a reply it did not derive from
 * knowledge. This is an early churn signal: a customer whose bot disappoints
 * stops using it long before they say anything.
 *
 * Deliberately NOT wired into the retrieval fallbacks in knowledge-retrieval.ts
 * or complaint-classifier.ts — those degrade retrieval but still answer well,
 * and instrumenting them would bury the real signal in noise.
 */

import { supabase } from '@/lib/supabase';

export type BotGiveUpReason = 'no_knowledge' | 'empty_response' | 'tool_failure' | 'llm_error';

export async function recordBotGaveUp(input: {
  accountId: string;
  sessionId: string | null;
  surface: 'widget' | 'chat';
  reason: BotGiveUpReason;
}): Promise<void> {
  try {
    const { error } = await supabase.from('events').insert({
      account_id: input.accountId,
      session_id: input.sessionId,
      type: 'bot_no_answer',
      category: 'quality',
      mode: input.surface,
      payload: { reason: input.reason },
    });
    if (error) {
      console.error('[bot-quality] insert failed:', error.message);
    }
  } catch (e: any) {
    console.error('[bot-quality] insert threw:', e?.message);
  }
}
