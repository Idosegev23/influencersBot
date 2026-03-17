/**
 * Instagram Graph API — DM Chat Handler
 * מעבד הודעות DM שמגיעות ישירות מ-Instagram Graph API webhook
 * "אותו מוח (SandwichBot), ערוץ חדש — Instagram Graph API נייטיב"
 *
 * ההבדל מ-Respond.io handler:
 * - מקבל פורמט webhook של Meta (לא Respond.io)
 * - שולח תשובות ישירות דרך Graph API (לא דרך Respond.io)
 * - תומך ב-rich messages (quick replies, images)
 */

import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { processSandwichMessageWithMetadata } from '@/lib/chatbot/sandwichBot';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { updateRollingSummary, shouldUpdateSummary } from '@/lib/chatbot/conversation-memory';
import { sendLongInstagramDM, type IGMessagingEvent } from './client';

// ============================================
// Types
// ============================================

interface DMProcessResult {
  success: boolean;
  response?: string;
  senderId?: string;
  error?: string;
}

// ============================================
// Main DM Handler
// ============================================

/**
 * Process an incoming Instagram DM message from Graph API webhook
 * Similar flow to Respond.io handler but with native Graph API format
 */
export async function processInstagramGraphDM(
  event: IGMessagingEvent,
  igAccountId: string,
): Promise<DMProcessResult> {
  const senderId = event.sender.id;
  const recipientId = event.recipient.id; // Our IG account
  const messageText = event.message?.text;
  const messageId = event.message?.mid;

  // Skip echo messages (messages we sent)
  if (event.message?.is_echo) {
    return { success: true };
  }

  // Skip non-text messages for now (attachments, reactions, etc.)
  if (!messageText) {
    console.log(`[IG Graph DM] Skipping non-text message from ${senderId}`);
    return { success: true };
  }

  console.log(`[IG Graph DM] Processing DM from ${senderId}: "${messageText.slice(0, 50)}..."`);

  const supabase = await createClient();

  try {
    // 1. Find which influencer account this IG account belongs to
    const accountId = await resolveAccountFromIGId(supabase, igAccountId);
    if (!accountId) {
      console.error(`[IG Graph DM] No account found for IG account ${igAccountId}`);
      return { success: false, error: `No account mapped for IG ${igAccountId}` };
    }

    // 2. Get or create DM session (keyed by sender + account via thread_id)
    const threadId = `dm_ig_graph_${senderId}_${accountId}`;
    const session = await getOrCreateSession(supabase, threadId, accountId, senderId);
    const sessionUUID = session.id; // actual UUID from DB

    // 3. Load account info + conversation history + personality
    const [accountData, historyData] = await Promise.all([
      supabase
        .from('accounts')
        .select('config')
        .eq('id', accountId)
        .single()
        .then(r => r.data),
      supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionUUID)
        .order('created_at', { ascending: false })
        .limit(10)
        .then(r => r.data),
    ]);

    const config = accountData?.config || {};
    const username = config.username || 'influencer';
    const influencerName = config.display_name || config.username || 'Influencer';

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

    // 5. Process through SandwichBot — SAME engine as widget, social, and Respond.io DM
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
      mode: 'dm', // Same DM mode as Respond.io handler
      onToken: (token: string) => {
        fullText += token;
      },
    });

    if (!fullText && sandwichResult.response) {
      fullText = sandwichResult.response;
    }
    responseId = sandwichResult.responseId || null;

    // Strip suggestions and markdown — DM doesn't support them
    fullText = fullText.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
    fullText = stripMarkdownForDM(fullText);

    console.log(`[IG Graph DM] SandwichBot response for sender ${senderId}:`, {
      archetype: sandwichResult.metadata.archetype,
      confidence: sandwichResult.metadata.confidence,
      responseLength: fullText.length,
    });

    // 6. Send reply via Instagram Graph API (auto-splits for 1000 char limit)
    const accessToken = await getAccessTokenForAccount(supabase, accountId);
    await sendLongInstagramDM(senderId, fullText, igAccountId, accessToken || undefined);

    // 7. Save messages + update session
    const msgCount = (session?.message_count || 0) + 2;
    await Promise.all([
      supabase.from('chat_messages').insert({
        session_id: sessionUUID,
        role: 'user',
        content: messageText,
      }),
      supabase.from('chat_messages').insert({
        session_id: sessionUUID,
        role: 'assistant',
        content: fullText,
      }),
      supabase
        .from('chat_sessions')
        .update({
          ...(responseId ? { last_response_id: responseId } : {}),
          message_count: msgCount,
        })
        .eq('id', sessionUUID),
    ]);

    // 8. Update rolling summary if needed (fire-and-forget)
    if (shouldUpdateSummary(msgCount)) {
      updateRollingSummary(
        sessionUUID,
        [...conversationHistory, { role: 'user', content: messageText }, { role: 'assistant', content: fullText }],
      ).catch(err => console.error('[IG Graph DM] Summary update failed:', err));
    }

    return {
      success: true,
      response: fullText,
      senderId,
    };
  } catch (error: any) {
    console.error(`[IG Graph DM] Error processing DM from sender ${senderId}:`, error.message);

    // Try to send error message back
    try {
      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      if (accessToken) {
        await sendLongInstagramDM(
          senderId,
          'מצטער, לא הצלחתי לעבד את ההודעה. נסה שוב בעוד רגע',
          igAccountId,
          accessToken,
        );
      }
    } catch {
      // Ignore send error
    }

    return { success: false, error: error.message, senderId };
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Resolve which influencer account an Instagram Business Account ID belongs to
 */
async function resolveAccountFromIGId(
  supabase: any,
  igAccountId: string,
): Promise<string | null> {
  // Check ig_graph_connections table first
  const { data: connection } = await supabase
    .from('ig_graph_connections')
    .select('account_id')
    .eq('ig_business_account_id', igAccountId)
    .eq('is_active', true)
    .single();

  if (connection?.account_id) return connection.account_id;

  // Fallback: if there's only one active account, use it
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('type', 'creator')
    .eq('status', 'active')
    .limit(2);

  if (accounts?.length === 1) {
    return accounts[0].id;
  }

  return null;
}

/**
 * Get or create a DM session
 * Uses thread_id (text) for lookup, id is a proper UUID
 */
async function getOrCreateSession(
  supabase: any,
  threadId: string,
  accountId: string,
  senderId: string,
): Promise<any> {
  // Look up by thread_id (text column)
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('thread_id', threadId)
    .single();

  if (session) return session;

  // Create new session with proper UUID
  const newId = randomUUID();
  const { data: newSession } = await supabase
    .from('chat_sessions')
    .insert({
      id: newId,
      thread_id: threadId,
      account_id: accountId,
      message_count: 0,
    })
    .select('*')
    .single();

  return newSession || { id: newId, message_count: 0 };
}

/**
 * Get the access token for a specific account
 */
async function getAccessTokenForAccount(
  supabase: any,
  accountId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('ig_graph_connections')
    .select('access_token')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .single();

  return data?.access_token || process.env.INSTAGRAM_ACCESS_TOKEN || null;
}

/**
 * Strip markdown for Instagram DM (same as Respond.io handler)
 */
function stripMarkdownForDM(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\-\*]\s+/gm, '▸ ')
    .replace(/^[\-\*]{3,}$/gm, '')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
