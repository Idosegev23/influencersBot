/**
 * Widget Chat Handler
 * מטפל בהודעות צ'אט מהווידג'ט — משתמש באותו מנוע SandwichBot של הסושיאל
 * "אותו מוח, אותה איכות, שני מקומות שונים"
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
    // Load existing session with all context fields
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

  // 2. Load account info + conversation history + personality (all in parallel)
  const [accountData, historyData] = await Promise.all([
    supabase
      .from('accounts')
      .select('username, display_name, account_type')
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

  const conversationHistory = (historyData || [])
    .reverse()
    .map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  // 3. Resolve the effective account — for website accounts, find the linked social
  //    so SandwichBot uses the SAME identity, personality, and knowledge as the social chatbot
  let effectiveAccountId = accountId;
  let username = accountData?.username || 'website';
  let influencerName = accountData?.display_name || accountData?.username || 'Website';

  if (accountData?.account_type === 'website') {
    const linkedSocial = await findLinkedSocialAccount(supabase, accountId);
    if (linkedSocial) {
      effectiveAccountId = linkedSocial.id;
      username = linkedSocial.username;
      influencerName = linkedSocial.display_name || linkedSocial.username;
      console.log(`[WidgetChat] Website account ${accountId} → linked social ${linkedSocial.id} (@${linkedSocial.username})`);
    }
  }

  // 4. Load personality from the EFFECTIVE account (social, not website)
  const personalityConfig = await buildPersonalityFromDB(effectiveAccountId).catch(() => null);

  // Prepend rolling summary if available (same as social chat)
  if (session?.rolling_summary) {
    conversationHistory.unshift({
      role: 'assistant' as const,
      content: `[סיכום שיחה קודמת: ${session.rolling_summary}]`,
    });
  }

  // 5. Process through SandwichBot — SAME engine as social chatbot
  //    Including previousResponseId for OpenAI context chaining (key quality feature)
  let fullText = '';
  let responseId: string | null = null;

  try {
    const sandwichResult = await processSandwichMessageWithMetadata({
      userMessage: message,
      accountId: effectiveAccountId,
      username,
      influencerName,
      conversationHistory,
      rollingSummary: session?.rolling_summary || undefined,
      personalityConfig: personalityConfig || undefined,
      previousResponseId: session?.last_response_id || null,
      mode: 'widget',
      onToken: (token: string) => {
        fullText += token;
        onToken?.(token);
      },
    });

    // If streaming was used, fullText was accumulated via onToken
    // If not (fallback), use the response directly
    if (!fullText && sandwichResult.response) {
      fullText = sandwichResult.response;
    }

    // Capture response ID for context chaining on next turn
    responseId = sandwichResult.responseId || null;

    // Strip <<SUGGESTIONS>> tags — widget doesn't use suggestion chips
    fullText = stripSuggestions(fullText);

    console.log(`[WidgetChat] SandwichBot response:`, {
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
    }),
    // Save response_id for context chaining + increment message count
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

  return { response: fullText, sessionId: sessionId! };
}

// ============================================
// Helpers
// ============================================

/**
 * Find the linked social account for a website account.
 * Looks for a social account with matching domain in their bio websites.
 */
async function findLinkedSocialAccount(
  supabase: any,
  websiteAccountId: string,
): Promise<{ id: string; username: string; display_name?: string } | null> {
  try {
    // Get the website URL from the website account
    const { data: websiteAccount } = await supabase
      .from('accounts')
      .select('username, config')
      .eq('id', websiteAccountId)
      .single();

    if (!websiteAccount) return null;

    // The username for website accounts is the domain (e.g., "argania-oil.co.il")
    const domain = websiteAccount.username;

    // Find social accounts that have this domain in their bio websites
    const { data: linkedPages } = await supabase
      .from('instagram_bio_websites')
      .select('account_id')
      .ilike('url', `%${domain}%`)
      .neq('account_id', websiteAccountId)
      .limit(1);

    if (linkedPages?.[0]) {
      const { data: socialAccount } = await supabase
        .from('accounts')
        .select('id, username, display_name')
        .eq('id', linkedPages[0].account_id)
        .single();
      return socialAccount || null;
    }

    return null;
  } catch (error: any) {
    console.error('[WidgetChat] Failed to find linked social account:', error.message);
    return null;
  }
}

/**
 * Strip <<SUGGESTIONS>> tags from response — widget doesn't use suggestion chips.
 */
function stripSuggestions(text: string): string {
  return text.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
}
