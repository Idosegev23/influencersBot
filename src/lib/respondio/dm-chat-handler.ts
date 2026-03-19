/**
 * Instagram DM Chat Handler via Respond.io
 * מעבד הודעות DM שמגיעות מ-Respond.io ומפעיל את SandwichBot
 * "אותו מוח, שלושה מקומות — סושיאל, ווידג'ט, ועכשיו גם DM"
 */

import { createClient } from '@/lib/supabase/server';
import { processSandwichMessageWithMetadata } from '@/lib/chatbot/sandwichBot';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { updateRollingSummary, shouldUpdateSummary } from '@/lib/chatbot/conversation-memory';
import { sendLongTextMessage } from './client';
import type { WebhookPayload } from './client';

// ============================================
// Types
// ============================================

interface DMProcessResult {
  success: boolean;
  response?: string;
  contactId?: number;
  error?: string;
}

// ============================================
// Main DM Handler
// ============================================

/**
 * Process an incoming Instagram DM message from Respond.io webhook
 * Finds the matching influencer account, runs SandwichBot, and sends the reply
 */
export async function processInstagramDM(payload: WebhookPayload): Promise<DMProcessResult> {
  const { contact, message } = payload.data;

  if (!contact?.id || !message?.text) {
    console.log('[DM Handler] Skipping: no contact or message text');
    return { success: false, error: 'Missing contact or message text' };
  }

  // Only process incoming messages
  if (message.direction !== 'incoming') {
    return { success: true }; // Ignore outgoing messages
  }

  const contactId = contact.id;
  const messageText = message.text;
  const channelId = message.channelId;

  console.log(`[DM Handler] Processing DM from contact ${contactId}: "${messageText.slice(0, 50)}..."`);

  const supabase = createClient();

  try {
    // 1. Find which influencer account this Instagram channel belongs to
    const accountId = await resolveAccountFromChannel(supabase, channelId, contact);
    if (!accountId) {
      console.error(`[DM Handler] No account found for channel ${channelId}`);
      return { success: false, error: `No account mapped for channel ${channelId}` };
    }

    // 2. Get or create DM session
    const sessionKey = `dm_respondio_${contactId}_${accountId}`;
    let session = await getOrCreateSession(supabase, sessionKey, accountId);

    // 3. Load account info + conversation history + personality
    const [accountData, historyData] = await Promise.all([
      supabase
        .from('accounts')
        .select('username, display_name')
        .eq('id', accountId)
        .single()
        .then(r => r.data),
      supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionKey)
        .order('created_at', { ascending: false })
        .limit(10)
        .then(r => r.data),
    ]);

    const username = accountData?.username || 'influencer';
    const influencerName = accountData?.display_name || accountData?.username || 'Influencer';

    const conversationHistory = (historyData || [])
      .reverse()
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // 4. Load personality
    const personalityConfig = await buildPersonalityFromDB(accountId).catch(() => null);

    // Prepend rolling summary if available
    if (session?.rolling_summary) {
      conversationHistory.unshift({
        role: 'assistant' as const,
        content: `[סיכום שיחה קודמת: ${session.rolling_summary}]`,
      });
    }

    // 5. Process through SandwichBot — SAME engine as widget and social
    let fullText = '';
    let responseId: string | null = null;

    const sandwichResult = await processSandwichMessageWithMetadata({
      userMessage: messageText,
      accountId,
      username,
      influencerName,
      conversationHistory,
      rollingSummary: session?.rolling_summary || undefined,
      personalityConfig: personalityConfig || undefined,
      previousResponseId: session?.last_response_id || null,
      mode: 'dm', // New mode for DM context
      onToken: (token: string) => {
        fullText += token;
      },
    });

    if (!fullText && sandwichResult.response) {
      fullText = sandwichResult.response;
    }
    responseId = sandwichResult.responseId || null;

    // Strip suggestions — DM doesn't use chips
    fullText = fullText.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();

    // Strip any remaining markdown formatting (safety net — the prompt asks for plain text,
    // but LLMs sometimes still use markdown)
    fullText = stripMarkdownForDM(fullText);

    console.log(`[DM Handler] SandwichBot response for contact ${contactId}:`, {
      archetype: sandwichResult.metadata.archetype,
      confidence: sandwichResult.metadata.confidence,
      responseLength: fullText.length,
    });

    // 6. Send reply via Respond.io (auto-splits for Instagram limit)
    await sendLongTextMessage(contactId, fullText, channelId);

    // 7. Save messages + update session
    const msgCount = (session?.message_count || 0) + 2;
    await Promise.all([
      supabase.from('chat_messages').insert({
        session_id: sessionKey,
        role: 'user',
        content: messageText,
      }),
      supabase.from('chat_messages').insert({
        session_id: sessionKey,
        role: 'assistant',
        content: fullText,
      }),
      supabase
        .from('chat_sessions')
        .update({
          ...(responseId ? { last_response_id: responseId } : {}),
          message_count: msgCount,
        })
        .eq('id', sessionKey),
    ]);

    // 8. Update rolling summary if needed (fire-and-forget)
    if (shouldUpdateSummary(msgCount)) {
      updateRollingSummary(
        sessionKey,
        [...conversationHistory, { role: 'user', content: messageText }, { role: 'assistant', content: fullText }],
      ).catch(err => console.error('[DM Handler] Summary update failed:', err));
    }

    return {
      success: true,
      response: fullText,
      contactId,
    };
  } catch (error: any) {
    console.error(`[DM Handler] Error processing DM from contact ${contactId}:`, error.message);

    // Try to send an error message back
    try {
      await sendLongTextMessage(contactId, 'מצטער, לא הצלחתי לעבד את ההודעה. נסה שוב בעוד רגע 🙏', channelId);
    } catch {
      // Ignore send error
    }

    return { success: false, error: error.message, contactId };
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Resolve which influencer account a Respond.io channel belongs to.
 * Uses the respondio_channel_mappings table.
 */
async function resolveAccountFromChannel(
  supabase: any,
  channelId: number,
  contact: any,
): Promise<string | null> {
  // First: check explicit channel-to-account mapping
  const { data: mapping } = await supabase
    .from('respondio_channel_mappings')
    .select('account_id')
    .eq('respondio_channel_id', channelId)
    .eq('is_active', true)
    .single();

  if (mapping?.account_id) return mapping.account_id;

  // Fallback: check if contact has a tag matching an account username
  if (contact?.tags?.length) {
    for (const tag of contact.tags) {
      const { data: account } = await supabase
        .from('accounts')
        .select('id')
        .eq('username', tag)
        .single();
      if (account?.id) return account.id;
    }
  }

  // Fallback: if there's only one active account, use it (single-tenant mode)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('account_type', 'instagram')
    .limit(2);

  if (accounts?.length === 1) {
    return accounts[0].id;
  }

  return null;
}

/**
 * Get or create a DM session
 */
async function getOrCreateSession(
  supabase: any,
  sessionId: string,
  accountId: string,
): Promise<any> {
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (session) return session;

  // Create new session
  await supabase.from('chat_sessions').insert({
    id: sessionId,
    account_id: accountId,
    message_count: 0,
  });

  return { message_count: 0 };
}

/**
 * Strip markdown formatting for Instagram DM compatibility.
 * Instagram DM only supports plain text — no bold, italic, headers, links, or images.
 * This is a safety net in case the LLM still outputs markdown despite instructions.
 */
function stripMarkdownForDM(text: string): string {
  return text
    // Remove image markdown: ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Convert link markdown [text](url) → text: url
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    // Remove bold: **text** or __text__
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Remove italic: *text* or _text_
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
    // Remove headers: ## text → text
    .replace(/^#{1,6}\s+/gm, '')
    // Convert markdown bullets: - text or * text → ▸ text
    .replace(/^[\-\*]\s+/gm, '▸ ')
    // Remove horizontal rules: --- or ***
    .replace(/^[\-\*]{3,}$/gm, '')
    // Remove code blocks: ```text```
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').trim())
    // Remove inline code: `text`
    .replace(/`([^`]+)`/g, '$1')
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
