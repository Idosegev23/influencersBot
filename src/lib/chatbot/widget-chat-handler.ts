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
import { runEscalationCheck } from '@/engines/escalation/dispatch';
import { buildPersonalityFromDB } from './personality-wrapper';
import { updateRollingSummary, shouldUpdateSummary } from './conversation-memory';
import { getRecommendations, type ProductRecommendation } from '@/lib/recommendations/engine';
import {
  stripIntent,
  buildObjectionBlock,
  type IntentEnvelope,
} from './widget-objections';
import {
  stripAction,
  buildActionsBlock,
  buildPageContextBlock,
  buildReturningVisitorBlock,
  buildNavigationLinksBlock,
  deriveNavigationLinksFromDocs,
  type WidgetAction,
  type WidgetModulesFlags,
  type PageContext,
  type ReturningVisitor,
  type NavigationLink,
} from './widget-actions';

// ============================================
// Type Definitions
// ============================================

export interface WidgetChatParams {
  accountId: string;
  message: string;
  sessionId?: string;
  // Phase: concierge — page DOM context (schema.org / og / dataLayer) extracted
  // by the widget on each turn so the bot can reference what the visitor is
  // looking at. Optional — null when extraction failed or page is empty.
  pageContext?: PageContext | null;
  // Per-account module toggles, forwarded by the client. The handler also
  // re-reads them from the account config as the source of truth — the client
  // copy is only used to keep the prompt block honest when modules flip mid-session.
  modules?: Partial<WidgetModulesFlags>;
  // Anonymous visitor ID (random, stored in widget localStorage). Lets us link
  // sessions across visits without PII — used for returning-visitor recognition.
  anonId?: string;
  // Locale the widget rendered the welcome in. Defensive fallback so the
  // error message respects the visitor's language even if the account fetch
  // races / fails (the client already knows the language because /api/widget/config
  // returned it earlier in this session).
  language?: 'he' | 'en';
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
  // Phase concierge: parsed <<ACTION>> envelope. null when no action was proposed.
  action: WidgetAction | null;
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
      // anon_id ties this session to prior sessions from the same browser
      // so returning-visitor recognition can find them.
      anon_id: params.anonId || null,
    });
  } else if (params.anonId && !session.anon_id) {
    // Backfill anon_id on sessions created before this field existed,
    // so future returning-visitor lookups have something to match on.
    await supabase.from('chat_sessions').update({ anon_id: params.anonId }).eq('id', sessionId);
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

  // Merge recommendation + objection + concierge blocks into widgetConfig for
  // prompt injection. Each block is null/omitted unless its precondition is
  // met (prior-turn hesitation, enabled modules, extracted page context) —
  // so the prompt only grows when there's actually new guidance to inject.
  const objectionBlock = buildObjectionBlock(config.widget || null, lastIntentRow || null);

  // Source of truth for modules = account config. The client-passed `modules`
  // is a hint that lets us trace mismatches but never overrides the DB.
  const accountModules = (config.widget?.modules || {}) as Record<string, any>;
  // Order tracking is implicit — opted in when the account has a Shopify
  // integration configured. The handler doesn't expose the token; only the
  // boolean flag flows into the actions prompt.
  const shopifyEnabled = !!(config?.integrations?.shopify?.enabled
    && config?.integrations?.shopify?.shop_domain
    && config?.integrations?.shopify?.admin_api_token);
  const moduleFlags: WidgetModulesFlags = {
    support: accountModules.support?.enabled === true,
    leads: accountModules.leads?.enabled === true,
    bookings: accountModules.bookings?.enabled === true,
    orderTracking: shopifyEnabled,
  };
  const lang: 'he' | 'en' = (accountResult?.language === 'en') ? 'en' : 'he';
  const actionsBlock = buildActionsBlock(moduleFlags, lang);
  const pageContextBlock = buildPageContextBlock(params.pageContext || null, lang);

  // Returning-visitor recognition — look up the most recent chat_lead for
  // any session this anonId has been on. Skips when no anonId or no prior lead.
  // Single round-trip via inner-join-like query.
  let returningVisitor: ReturningVisitor | null = null;
  if (params.anonId) {
    const { data: priorSessions } = await supabase
      .from('chat_sessions')
      .select('id, lead_id, rolling_summary')
      .eq('account_id', accountId)
      .eq('anon_id', params.anonId)
      .neq('id', sessionId)
      .order('created_at', { ascending: false })
      .limit(5);

    const leadId = priorSessions?.find((s: any) => s.lead_id)?.lead_id;
    if (leadId) {
      const { data: lead } = await supabase
        .from('chat_leads')
        .select('first_name')
        .eq('id', leadId)
        .single();
      if (lead?.first_name) {
        returningVisitor = {
          firstName: lead.first_name,
          // Use the most recent rolling_summary as "last topic" hint —
          // it's an LLM-generated 1-2 sentence summary so it reads naturally.
          lastTopic: priorSessions?.[0]?.rolling_summary?.slice(0, 80) || null,
          visitCount: (priorSessions?.length || 0) + 1,
        };
      }
    }
  }
  const returningVisitorBlock = buildReturningVisitorBlock(returningVisitor, lang);

  // Navigation links — two layers:
  //   1) Manual list curated by the account owner via /manage/[token].
  //   2) Auto-derived from the account's scraped `documents` — every account
  //      that runs through our website-scraping pipeline has top-level pages
  //      with titles + URLs sitting in `documents.metadata.url`. We surface
  //      the top-level subset (path depth ≤ 2, excluding product details) so
  //      the bot can offer `navigate` actions without needing manual setup.
  // Manual list wins when set; auto fills the gap otherwise. We supplement
  // manual with auto-derived links that don't conflict, capped overall.
  const manualNavLinks: NavigationLink[] = Array.isArray((config.widget as any)?.navigation_links)
    ? (config.widget as any).navigation_links
    : [];

  let navigationLinks: NavigationLink[] = manualNavLinks;
  // Skip the doc-derived lookup when manual list is already healthy (5+ items)
  // — saves a query per chat turn. Otherwise auto-detect and merge.
  if (manualNavLinks.length < 5) {
    // Aggressive server-side filtering so the small result set contains
    // mostly top-level pages. Excludes product detail pages, deep nested
    // category sub-pages, paginated lists, and content article patterns.
    // Without these, accounts with 1000s of product/category pages (Tambour)
    // would return only deep pages and crowd out /contact, /faq, /about, etc.
    const { data: navDocs } = await supabase
      .from('documents')
      .select('title, metadata')
      .eq('account_id', accountId)
      .eq('entity_type', 'website')
      .not('metadata->>url', 'ilike', '%/product/%')
      .not('metadata->>url', 'ilike', '%/products/%')
      .not('metadata->>url', 'ilike', '%/professionals/%')
      .not('metadata->>url', 'ilike', '%/inspiration/%')
      .not('metadata->>url', 'ilike', '%/blog/%')
      .not('metadata->>url', 'ilike', '%/category/%')
      .not('metadata->>url', 'ilike', '%/tag/%')
      .not('metadata->>url', 'ilike', '%/page/%')
      .not('metadata->>url', 'ilike', '%/post/%')
      .not('metadata->>url', 'ilike', '%/article/%')
      .limit(1000);
    const autoLinks = deriveNavigationLinksFromDocs(navDocs || []);
    // Merge: manual paths take priority; auto fills the rest up to 15 total.
    const seen = new Set(manualNavLinks.map((l) => l.url));
    const supplement = autoLinks.filter((l) => !seen.has(l.url));
    navigationLinks = [...manualNavLinks, ...supplement].slice(0, 15);
  }
  const navigationLinksBlock = buildNavigationLinksBlock(navigationLinks, lang);

  const widgetConfigWithRecs = {
    ...(config.widget || {}),
    _recommendationBlock: recommendationBlock,
    ...(objectionBlock ? { _objectionBlock: objectionBlock } : {}),
    ...(actionsBlock ? { _actionsBlock: actionsBlock } : {}),
    ...(pageContextBlock ? { _pageContextBlock: pageContextBlock } : {}),
    ...(returningVisitorBlock ? { _returningVisitorBlock: returningVisitorBlock } : {}),
    ...(navigationLinksBlock ? { _navigationLinksBlock: navigationLinksBlock } : {}),
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
    // Log with enough context to diagnose intermittent prod failures
    // (cold-start timeouts, model timeouts, RAG hiccups). The message gets
    // swallowed otherwise because we always return a friendly fallback.
    console.error('[WidgetChat] SandwichBot error:', {
      message: error?.message,
      name: error?.name,
      accountId,
      sessionId,
      hasAccount: !!accountResult,
      accountLang: accountResult?.language,
      stack: error?.stack?.split('\n').slice(0, 3).join(' | '),
    });
    // Language fallback chain: explicit param from widget > account row > 'he'.
    // The widget already has the language from /api/widget/config; passing it
    // through means we don't lose the visitor's language when the account
    // fetch races/fails or some unrelated field mutation throws.
    const errLang = params.language || (accountResult?.language === 'en' ? 'en' : 'he');
    fullText = errLang === 'en'
      ? "Sorry, I hit a hiccup processing that. Please try again."
      : 'מצטער, נתקלתי בבעיה. נסו שוב.';
  }

  // Phase 2: extract <<INTENT>> envelope from the (already suggestion-stripped)
  // response. cleanText is what the user sees; turnIntent persists for the
  // next turn's objection injection + ships to the client for layout decisions.
  const { cleanText, intent: turnIntent } = stripIntent(fullText);
  fullText = cleanText;

  // Phase concierge: extract <<ACTION>> envelope. Runs AFTER stripIntent so
  // both envelopes can coexist in any order. turnAction ships to the client
  // for inline-card rendering; never persisted (visitor must confirm each time).
  const { cleanText: cleanText2, action: turnAction } = stripAction(fullText);
  fullText = cleanText2;

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

  // Escalation check — fire-and-forget; does not block the widget response.
  runEscalationCheck({
    accountId,
    sessionId: sessionId!,
    userMessage: message,
    source: 'widget',
  }).catch((e: any) => console.error('[escalation] widget hook failed:', e?.message || e));

  return {
    response: fullText,
    sessionId: sessionId!,
    products: recommendedProducts,
    intent: turnIntent || null,
    action: turnAction || null,
  };
}

// ============================================
// Helpers
// ============================================

function stripSuggestions(text: string): string {
  return text.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
}
