/**
 * Widget Chat Handler
 * מטפל בהודעות צ'אט מהווידג'ט — משתמש באותו מנוע SandwichBot של הסושיאל
 * "אותו מוח, אותה איכות, שני מקומות שונים"
 *
 * כל חשבון הוא חשבון אחד (creator) — username = אינסטגרם, config.widget.domain = אתר.
 * אין צורך ב-findLinkedSocialAccount — הכל באותו חשבון.
 */

import { createClient } from '@/lib/supabase/server';
import { processSandwichMessageWithMetadata } from './sandwichBot';
import { buildPersonalityFromDB } from './personality-wrapper';
import { updateRollingSummary, shouldUpdateSummary } from './conversation-memory';

// ============================================
// Type Definitions
// ============================================

export interface WidgetChatParams {
  accountId: string;
  message: string;
  sessionId?: string;
  onToken?: (token: string) => void;
}

export interface WidgetChatResult {
  response: string;
  sessionId: string;
}

// ============================================
// Main Handler
// ============================================

export async function processWidgetMessage(params: WidgetChatParams): Promise<WidgetChatResult> {
  const { accountId, message, onToken } = params;
  const supabase = await createClient();

  // 1. Get or create session
  let sessionId = params.sessionId;
  let session: any = null;

  if (sessionId) {
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    session = data;
  }

  if (!session) {
    sessionId = `widget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await supabase.from('chat_sessions').insert({
      id: sessionId,
      account_id: accountId,
      message_count: 0,
    });
  }

  // 2. Load account info + conversation history in parallel
  //    Note: username and display_name live inside config JSONB, not as direct columns
  const [accountResult, historyData] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, type, config')
      .eq('id', accountId)
      .single()
      .then(r => r.data),
    supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(r => r.data),
  ]);

  const config = accountResult?.config || {};
  const username = config.username || 'website';
  const influencerName = config.display_name || config.username || 'Website';

  const conversationHistory = (historyData || [])
    .reverse()
    .map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  // 3. Load personality from the account
  const personalityConfig = await buildPersonalityFromDB(accountId).catch(() => null);

  // Prepend rolling summary if available (same as social chat)
  if (session?.rolling_summary) {
    conversationHistory.unshift({
      role: 'assistant' as const,
      content: `[סיכום שיחה קודמת: ${session.rolling_summary}]`,
    });
  }

  // 4. Process through SandwichBot — SAME engine as social chatbot
  //    mode: 'widget' activates sales-oriented prompt with links, images, CTAs
  let fullText = '';
  let responseId: string | null = null;

  try {
    const sandwichResult = await processSandwichMessageWithMetadata({
      userMessage: message,
      accountId,
      username,
      influencerName,
      conversationHistory,
      rollingSummary: session?.rolling_summary || undefined,
      personalityConfig: personalityConfig || undefined,
      previousResponseId: session?.last_response_id || null,
      mode: 'widget',
      widgetConfig: config.widget || undefined,
      onToken: (token: string) => {
        fullText += token;
        onToken?.(token);
      },
    });

    if (!fullText && sandwichResult.response) {
      fullText = sandwichResult.response;
    }

    responseId = sandwichResult.responseId || null;
    fullText = stripSuggestions(fullText);

    console.log(`[WidgetChat] @${username} response:`, {
      archetype: sandwichResult.metadata.archetype,
      confidence: sandwichResult.metadata.confidence,
      personalityApplied: sandwichResult.metadata.personalityApplied,
      responseLength: fullText.length,
      hasResponseId: !!responseId,
      hasSummary: !!session?.rolling_summary,
    });
  } catch (error: any) {
    console.error('[WidgetChat] SandwichBot error:', error.message);
    fullText = 'מצטער, לא הצלחתי לעבד את הבקשה. נסו שוב.';
  }

  // 5. Save messages + update session state (parallel)
  const msgCount = (session?.message_count || 0) + 2;
  await Promise.all([
    supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: message,
    }),
    supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: fullText,
    }),
    supabase
      .from('chat_sessions')
      .update({
        ...(responseId ? { last_response_id: responseId } : {}),
        message_count: msgCount,
      })
      .eq('id', sessionId),
  ]);

  // 6. Update rolling summary if threshold reached (fire-and-forget)
  if (shouldUpdateSummary(msgCount)) {
    updateRollingSummary(
      sessionId!,
      [...conversationHistory, { role: 'user', content: message }, { role: 'assistant', content: fullText }],
    ).catch(err => console.error('[WidgetChat] Summary update failed:', err));
  }

  return { response: fullText, sessionId: sessionId! };
}

// ============================================
// Helpers
// ============================================

function stripSuggestions(text: string): string {
  return text.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
}
