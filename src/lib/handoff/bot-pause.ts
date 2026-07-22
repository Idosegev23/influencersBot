import { supabase } from '@/lib/supabase';

/** Per-conversation bot pause state, stored on chat_sessions (migration 069). */
export async function isBotPaused(chatSessionId: string): Promise<boolean> {
  if (!chatSessionId) return false;
  const { data } = await supabase
    .from('chat_sessions')
    .select('bot_paused')
    .eq('id', chatSessionId)
    .maybeSingle();
  return Boolean(data?.bot_paused);
}

export async function pauseBot(chatSessionId: string, reason: string): Promise<void> {
  if (!chatSessionId) return;
  await supabase
    .from('chat_sessions')
    .update({
      bot_paused: true,
      bot_paused_at: new Date().toISOString(),
      bot_paused_reason: reason,
    })
    .eq('id', chatSessionId);
}

export async function resumeBot(chatSessionId: string): Promise<void> {
  if (!chatSessionId) return;
  await supabase
    .from('chat_sessions')
    .update({ bot_paused: false, bot_paused_at: null, bot_paused_reason: null })
    .eq('id', chatSessionId);
}
