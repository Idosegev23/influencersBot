/**
 * Widget Chat Handler
 * מטפל בהודעות צ'אט מהווידג'ט — משתמש באותו מנוע SandwichBot של הסושיאל
 * "אותו מוח, אותה איכות, שני מקומות שונים"
 *
 * כל חשבון הוא חשבון אחד (creator) — username = אינסטגרם, config.widget.domain = אתר.
 * אין צורך ב-findLinkedSocialAccount — הכל באותו חשבון.
 */

import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { processSandwichMessageWithMetadata } from './sandwichBot';
import { buildPersonalityFromDB } from './personality-wrapper';
import { updateRollingSummary, shouldUpdateSummary } from './conversation-memory';
import { getRecommendations, type ProductRecommendation } from '@/lib/recommendations/engine';
import {
  stripIntent,
  buildObjectionBlock,
  type IntentEnvelope,
} from './widget-objections';

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
  // Phase 1: structured product recommendations for client-side card rendering.
  // Empty array when no products were recommended this turn.
  products: ProductRecommendation[];
  // Phase 2: parsed <<INTENT>> envelope from this turn's response. null when
  // the model didn't emit one (e.g. error path, malformed envelope).
  intent: IntentEnvelope | null;
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
    // chat_sessions.id is UUID. The previous code generated a string here
    // (`widget_${ts}_${rand}`) which silently failed the UUID type-check —
    // sessions were never persisted, so no history, no rolling summary,
    // and Phase 2 intent-injection had no prior turn to read.
    sessionId = randomUUID();
    await supabase.from('chat_sessions').insert({
      id: sessionId,
      account_id: accountId,
      message_count: 0,
    });
  }

  // 2. Load account info + conversation history + last-turn intent in parallel
  //    Note: username and display_name live inside config JSONB, not as direct columns
  const [accountResult, historyData, lastIntentRow] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, type, config, language')
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
    // Phase 2: fetch the prior assistant turn's intent envelope so we can
    // inject objection-handling guidance for *this* turn when the visitor
    // signaled hesitation last time.
    supabase
      .from('chat_messages')
      .select('intent')
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: any) => r?.data?.intent as IntentEnvelope | null),
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

  // 4. Fetch product recommendations (fire parallel, non-blocking if fails)
  let recommendationBlock = '';
  let recommendedProducts: ProductRecommendation[] = [];
  try {
    const recResult = await getRecommendations({
      accountId,
      sessionId,
      conversationContext: message,
      maxResults: 3,
      strategy: 'auto',
    });
    recommendationBlock = recResult.promptBlock;
    recommendedProducts = recResult.products;
  } catch (err: any) {
    console.error('[WidgetChat] Recommendations error (non-fatal):', err.message);
  }

  // 5. Process through SandwichBot — SAME engine as social chatbot
  //    mode: 'widget' activates sales-oriented prompt with links, images, CTAs
  let fullText = '';
  let responseId: string | null = null;

  // Merge recommendation + objection blocks into widgetConfig for prompt injection.
  // Objection block is null unless prior turn flagged hesitation — additive guidance.
  const objectionBlock = buildObjectionBlock(config.widget || null, lastIntentRow || null);
  const widgetConfigWithRecs = {
    ...(config.widget || {}),
    _recommendationBlock: recommendationBlock,
    ...(objectionBlock ? { _objectionBlock: objectionBlock } : {}),
  };

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
      widgetConfig: widgetConfigWithRecs,
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
    fullText = (accountResult?.language === 'en')
      ? "Sorry, I couldn't process that. Please try again."
      : 'מצטער, לא הצלחתי לעבד את הבקשה. נסו שוב.';
  }

  // Phase 2: extract <<INTENT>> envelope from the (already suggestion-stripped)
  // response. cleanText is what the user sees; turnIntent persists for the
  // next turn's objection injection + ships to the client for layout decisions.
  const { cleanText, intent: turnIntent } = stripIntent(fullText);
  fullText = cleanText;

  // 6. Save messages + update session state (parallel)
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
      // Phase 2: persist the turn's parsed envelope so the next turn can
      // look it up for objection injection. Always nullable.
      intent: turnIntent || null,
    }),
    supabase
      .from('chat_sessions')
      .update({
        ...(responseId ? { last_response_id: responseId } : {}),
        message_count: msgCount,
      })
      .eq('id', sessionId),
  ]);

  // 7. Update rolling summary if threshold reached (fire-and-forget)
  if (shouldUpdateSummary(msgCount)) {
    updateRollingSummary(
      sessionId!,
      [...conversationHistory, { role: 'user', content: message }, { role: 'assistant', content: fullText }],
    ).catch(err => console.error('[WidgetChat] Summary update failed:', err));
  }

  return {
    response: fullText,
    sessionId: sessionId!,
    products: recommendedProducts,
    intent: turnIntent || null,
  };
}

// ============================================
// Helpers
// ============================================

function stripSuggestions(text: string): string {
  return text.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
}
