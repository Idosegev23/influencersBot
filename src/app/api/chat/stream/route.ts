/**
 * ============================================
 * Streaming Chat API
 * ============================================
 * 
 * NDJSON streaming endpoint for real-time chat responses.
 * 
 * Stream events:
 * - meta: Initial response with traceId, decisionId, uiDirectives
 * - cards: Brand/product cards data
 * - delta: Text chunks from OpenAI
 * - done: Final response with latency, tokens, cost
 * - error: Error information if something fails
 */

import { NextRequest, after } from 'next/server';
import { streamChatWithGemini } from '@/lib/gemini-chat';
import { 
  createChatSession, 
  saveChatMessage,
  supabase,
} from '@/lib/supabase';
import {
  sanitizeChatMessage,
  sanitizeUsername,
  isValidSessionId,
} from '@/lib/sanitize';
import { 
  loadChatContextCached,
  type CombinedLoadResult,
} from '@/lib/cached-loaders';

// Engine imports
import { 
  getAccountByInfluencerUsername,
  emitEvent,
  generateTraceId,
  generateRequestId,
  acquireLock,
  releaseLock,
  claimIdempotencyKey,
  completeIdempotencyKey,
  hashMessage,
} from '@/engines';

import { understandMessageFast } from '@/engines/understanding';
import { 
  decide, 
  getUIDirectivesSummary, 
  getModelStrategySummary,
} from '@/engines/decision';
import { processSupportFlow } from '@/lib/flows/support';
import {
  checkPolicies, 
  applyPolicyOverrides, 
  buildSecurityContext,
  getPolicySummary,
} from '@/engines/policy';
// Experiments disabled — table doesn't exist yet
// import { applyExperiments, trackExperimentExposure, type ExperimentContext } from '@/engines/experiments';
import type { EngineContext, AccountContext, SessionContext, UserContext, KnowledgeRefs, LimitsContext, RequestContext } from '@/engines/context';
import { processSandwichMessageWithMetadata } from '@/lib/chatbot/sandwichBot';
import { buildConversationContext, trimToTokenBudget, updateRollingSummary, shouldUpdateSummary } from '@/lib/chatbot/conversation-memory';
import { createPipelineMetrics, withMetrics, logPipelineMetrics, recordMetrics } from '@/lib/metrics/pipeline-metrics';
import { getCachedSuggestionRAG, cacheSuggestionRAG, prewarmSuggestionRAG, type CachedRAGResult } from '@/lib/suggestion-cache';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { getSmartThinkingMessage } from '@/lib/chatbot/thinking-messages';

// ============================================
// Stream Event Types
// ============================================

interface StreamMeta {
  type: 'meta';
  traceId: string;
  requestId: string;
  decisionId: string;
  sessionId: string;
  anonId: string; // For experiment tracking
  uiDirectives: Record<string, unknown>;
  stateTransition?: { from: string; to: string };
  suggestedActions?: Array<{ id: string; label: string; action: string }>;
  // Experiments for attribution
  experiments?: Array<{
    experimentKey: string;
    variantId: string;
    variantName: string;
  }>;
}

interface StreamCards {
  type: 'cards';
  cardsType: 'brands' | 'products' | 'content';
  items: unknown[];
}

interface StreamDelta {
  type: 'delta';
  text: string;
}

interface StreamDone {
  type: 'done';
  responseId: string | null;
  latencyMs: number;
  tokens?: { input: number; output: number };
  fullText: string;
}

interface StreamThinking {
  type: 'thinking';
  text: string;
}

interface StreamError {
  type: 'error';
  message: string;
  code?: string;
}

type StreamEvent = StreamMeta | StreamCards | StreamDelta | StreamDone | StreamError | StreamThinking;

// ============================================
// Helper: Encode NDJSON
// ============================================

const _encoder = new TextEncoder();
function encodeEvent(event: StreamEvent): Uint8Array {
  return _encoder.encode(JSON.stringify(event) + '\n');
}

// ============================================
// POST Handler
// ============================================

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const traceId = generateTraceId();
  const requestId = generateRequestId();
  
  // State for cleanup
  let sessionIdForLock: string | null = null;
  let idempotencyKey: string | null = null;
  let accountId: string | null = null;

  // Create readable stream
  const stream = new ReadableStream({
    async start(controller) {
      const pm = createPipelineMetrics(requestId, 'pending');
      pm.mark('request_start');

      await withMetrics(pm, async () => {
      try {
        // === PARSE REQUEST ===
        const body = await req.json();
        const {
          message: rawMessage,
          username: rawUsername,
          sessionId: rawSessionId,
          previousResponseId,
          clientMessageId,
          fromSuggestion,
          chunkId,
        } = body;

        // Validate & sanitize
        const message = sanitizeChatMessage(rawMessage);
        const username = sanitizeUsername(rawUsername);
        // Extract clean display message (strip hidden context) for DB storage
        const displayMessage = message.split(/\n\n\[הקשר ה(לוק|מוצר):\]/)[0].trim();

        if (!message || message.length < 1) {
          controller.enqueue(encodeEvent({
            type: 'error',
            message: 'הודעה ריקה',
            code: 'EMPTY_MESSAGE',
          }));
          controller.close();
          return;
        }

        if (!username) {
          controller.enqueue(encodeEvent({
            type: 'error',
            message: 'שם משתמש לא תקין',
            code: 'INVALID_USERNAME',
          }));
          controller.close();
          return;
        }

        // === LOAD DATA WITH CACHING ===
        const cacheStartMs = Date.now();
        const cachedData = await loadChatContextCached(username);
        const cacheLoadMs = Date.now() - cacheStartMs;
        
        if (!cachedData.influencer) {
          controller.enqueue(encodeEvent({
            type: 'error',
            message: 'המשפיען לא נמצא',
            code: 'INFLUENCER_NOT_FOUND',
          }));
          controller.close();
          return;
        }

        const influencer = cachedData.influencer;
        const brands = cachedData.brands || [];
        const content = cachedData.content || [];
        accountId = cachedData.accountId || influencer.id;
        pm.data.accountId = accountId;
        if (fromSuggestion) pm.data.fromSuggestion = true;

        // === EARLY RAG CACHE CHECK (Warm RAG, Fresh Voice) ===
        // On suggestion click: check if RAG results are cached.
        // If yes → skip RAG retrieval (~3-5s saved), but LLM always runs fresh → unique response each time.
        let cachedRAG: CachedRAGResult | null = null;
        if (fromSuggestion && accountId) {
          const ragCacheStart = Date.now();
          cachedRAG = await getCachedSuggestionRAG(accountId, message);
          const ragCacheMs = Date.now() - ragCacheStart;
          if (cachedRAG) {
            console.log(`[Stream] RAG cache HIT (${ragCacheMs}ms) — archetype: ${cachedRAG.archetype}, LLM will run fresh`);
          } else {
            console.log(`[Stream] RAG cache MISS (${ragCacheMs}ms) — full pipeline`);
          }
        }

        // === SESSION ===
        let currentSessionId = rawSessionId;
        if (!currentSessionId || !isValidSessionId(currentSessionId)) {
          const session = await createChatSession(influencer.id);
          currentSessionId = session?.id;
        }
        sessionIdForLock = currentSessionId;

        // === IDEMPOTENCY ===
        idempotencyKey = `${accountId}:${currentSessionId}:chat:${hashMessage(message)}:${clientMessageId || 'na'}`;
        const idempotencyResult = await claimIdempotencyKey(idempotencyKey);

        if (!idempotencyResult.allowed) {
          if (idempotencyResult.cachedResult) {
            // Return cached response
            const cached = idempotencyResult.cachedResult as { response: string };
            controller.enqueue(encodeEvent({
              type: 'meta',
              traceId,
              requestId,
              decisionId: 'cached',
              sessionId: currentSessionId,
              anonId: `anon_${currentSessionId.slice(0, 8)}`,
              uiDirectives: {},
            }));
            controller.enqueue(encodeEvent({
              type: 'delta',
              text: cached.response,
            }));
            controller.enqueue(encodeEvent({
              type: 'done',
              responseId: null,
              latencyMs: Date.now() - startedAt,
              fullText: cached.response,
            }));
            controller.close();
            return;
          }
          // Still processing
          controller.enqueue(encodeEvent({
            type: 'error',
            message: 'הבקשה בעיבוד, נסה שוב בעוד רגע',
            code: 'PENDING',
          }));
          controller.close();
          return;
        }

        // === PARALLEL: Understanding + Lock + Event + Session + History ===
        const parallelStartMs = Date.now();
        const anonId = `anon_${currentSessionId?.slice(0, 8) || 'guest'}`;

        const [understanding, , , sessionData, historyData, personalityConfig] = await Promise.all([
          // Understanding: instant regex (nano always timed out — saves 600ms)
          Promise.resolve(understandMessageFast(message)),
          // Lock
          acquireLock(currentSessionId, requestId),
          // Event emission
          emitEvent({
            type: 'message_received',
            accountId,
            sessionId: currentSessionId,
            mode: 'creator',
            payload: {
              messageLength: message.length,
              streaming: true,
              cacheMetrics: {
                loadMs: cacheLoadMs,
                hitRate: cachedData.metrics.cacheHitRate,
                usernameHit: cachedData.metrics.usernameHit,
                influencerHit: cachedData.metrics.influencerHit,
                brandsHit: cachedData.metrics.brandsHit,
                contentHit: cachedData.metrics.contentHit,
                redisAvailable: cachedData.metrics.redisAvailable,
                l1Hits: cachedData.metrics.l1Hits,
                l2Hits: cachedData.metrics.l2Hits,
                dbHits: cachedData.metrics.dbHits,
              },
            },
            metadata: { source: 'chat', engineVersion: 'v2', traceId, requestId },
          }),
          // Session load (needed for state/support flow check)
          (currentSessionId && isValidSessionId(currentSessionId))
            ? supabase
                .from('chat_sessions')
                .select('*')
                .eq('id', currentSessionId)
                .single()
                .then(r => r.data)
            : Promise.resolve(null),
          // Conversation history (moved here — runs in parallel instead of sequentially)
          (currentSessionId && isValidSessionId(currentSessionId))
            ? supabase
                .from('chat_messages')
                .select('role, content')
                .eq('session_id', currentSessionId)
                .order('created_at', { ascending: false })
                .limit(10)
                .then(r => r.data)
            : Promise.resolve(null),
          // Personality config (pre-load to avoid DB call inside archetype)
          buildPersonalityFromDB(accountId).catch(() => null),
        ]);

        const parallelMs = Date.now() - parallelStartMs;

        let session = sessionData;

        // === PERSONAL HANDOFF GUARD ===
        // If this session has an active "talk to Itamar" handoff, mute the
        // bot and forward the visitor's message into the WhatsApp thread
        // with Itamar instead of running the LLM. The visitor sees a
        // system note; Itamar's reply still flows back through the
        // /api/webhooks/whatsapp route and gets routed via metadata.source
        // = 'whatsapp_personal'.
        if (currentSessionId) {
          const { data: activeHandoff } = await supabase
            .from('chat_handoffs')
            .select('id, ref_code, status, target_phone, target_name, last_outbound_wa_message_id, replied_at')
            .eq('session_id', currentSessionId)
            .in('status', ['forwarded', 'replied'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeHandoff) {
            const targetName = activeHandoff.target_name || 'איתמר';

            // 1) Persist the visitor message so the transcript stays whole
            await saveChatMessage(currentSessionId, 'user', displayMessage);

            // 2) Try to relay to Itamar's WhatsApp.
            //    sendText only works if a 24h customer window is open
            //    (i.e. Itamar replied at least once in the past 23h).
            //    If not, we fall back to "queued" UX — visitor's message
            //    is in our DB; we'll re-attempt automatically next time
            //    Itamar replies and re-opens the window.
            let routed = false;
            let waError: string | null = null;
            const windowOpen =
              activeHandoff.status === 'replied' &&
              activeHandoff.replied_at &&
              Date.now() - new Date(activeHandoff.replied_at as any).getTime() <
                23 * 60 * 60 * 1000;

            if (windowOpen) {
              try {
                const { sendText } = await import('@/lib/whatsapp-cloud/client');
                const phone = (activeHandoff.target_phone || '').trim();
                const r = await sendText({
                  to: phone,
                  body: `[#${activeHandoff.ref_code}] ${displayMessage}`,
                  contextMessageId: activeHandoff.last_outbound_wa_message_id || undefined,
                });
                if (r.success) {
                  routed = true;
                  await supabase
                    .from('chat_handoffs')
                    .update({ last_outbound_wa_message_id: r.wa_message_id })
                    .eq('id', activeHandoff.id);
                } else {
                  waError = r.error?.message || 'send failed';
                }
              } catch (e: any) {
                waError = e?.message || 'unknown';
              }
            }

            const note = routed
              ? `✉️ ההודעה שלך הועברה ל${targetName} בוואטסאפ. נמשיך כאן ברגע שהוא יענה.`
              : `✉️ ההודעה נשמרה. ${targetName} ${
                  activeHandoff.status === 'forwarded' ? 'עדיין לא ענה' : 'לא זמין כרגע'
                } — ברגע שייכנס היא תועבר אליו אוטומטית, ותראו את התשובה שלו כאן בצ׳אט.`;

            // 3) Persist the system note WITH metadata so the UI keeps
            //    showing the personal-handoff styling.
            await supabase.from('chat_messages').insert({
              session_id: currentSessionId,
              role: 'assistant',
              content: note,
              metadata: {
                source: 'handoff_relay_note',
                ref_code: activeHandoff.ref_code,
                routed,
                wa_error: waError,
              },
            });

            // 4) Stream the note to the client and close
            controller.enqueue(
              encodeEvent({
                type: 'meta',
                traceId,
                requestId,
                decisionId: 'handoff',
                sessionId: currentSessionId,
                anonId: `anon_${currentSessionId.slice(0, 8)}`,
                uiDirectives: {},
              }),
            );
            controller.enqueue(encodeEvent({ type: 'delta', text: note }));
            controller.enqueue(
              encodeEvent({
                type: 'done',
                responseId: null,
                latencyMs: Date.now() - startedAt,
                fullText: note,
              }),
            );
            controller.close();
            return;
          }
        }

        // === LEAD NAME (runs in parallel with decision engine below) ===
        const leadNamePromise = session?.lead_id
          ? Promise.resolve(
              supabase
                .from('chat_leads')
                .select('first_name')
                .eq('id', session.lead_id)
                .maybeSingle()
            ).then(r => r.data?.first_name as string | undefined).catch(() => undefined)
          : Promise.resolve(undefined);

        // === CHECK IF ALREADY IN SUPPORT FLOW ===
        const isInSupportFlow = session?.state?.startsWith('Support.');
        console.log('[Stream] Session check:', {
          sessionId: currentSessionId,
          sessionState: session?.state,
          isInSupportFlow,
        });

        // === BUILD ENGINE CONTEXT (needed for both decision and policy) ===
        const engineContext: EngineContext = {
          account: {
            id: accountId,
            mode: 'creator',
            profileId: influencer.id,
            timezone: 'Asia/Jerusalem',
            language: 'he',
            plan: 'pro',
            allowedChannels: ['chat'],
            security: { publicChatAllowed: true, requireAuthForSupport: false, allowedOrigins: [] },
            features: { supportFlowEnabled: true, salesFlowEnabled: false, whatsappEnabled: false, analyticsEnabled: true },
          } as AccountContext,
          session: { id: currentSessionId, state: session?.state || 'Chat.Active', version: 1, lastActiveAt: new Date(), messageCount: 0 } as SessionContext,
          user: { anonId: `anon_${Date.now()}`, isRepeatVisitor: false } as UserContext,
          knowledge: { brandsRef: `brands:${accountId}`, contentIndexRef: `content:${accountId}` } as KnowledgeRefs,
          limits: { tokenBudgetRemaining: 100000, tokenBudgetTotal: 100000, costCeiling: 100, costUsed: 0, rateLimitRemaining: 100, rateLimitResetAt: new Date(Date.now() + 60000), periodType: 'month', periodStart: new Date(), periodEnd: new Date() } as LimitsContext,
          request: { requestId, traceId, timestamp: new Date(), source: 'chat', messageId: `msg_${Date.now()}`, clientMessageId } as RequestContext,
        };
        
        // === DECISION ===
        let decision;
        if (!isInSupportFlow) {
          decision = await decide({
            ctx: engineContext,
            understanding,
            traceId,
            requestId,
          });
          console.log('[Stream] Decision made:', {
            handler: decision.handler,
            intent: understanding.intent,
          });
        } else {
          // Already in support flow - force support_flow handler
          console.log('[Stream] 🔄 Already in support flow, continuing...');
          decision = {
            handler: 'support_flow',
            archetype: null,
            uiDirectives: {},
            stateTransition: null,
            decisionId: `support_${Date.now()}`,
          };
        }

        // === HANDLE SUPPORT FLOW HAND-OFF ===
        if (decision.handler === 'support_flow' || isInSupportFlow) {
          console.log('[Stream] 🔄 Handing off to support flow...', {
            viaHandler: decision.handler === 'support_flow',
            viaSessionState: isInSupportFlow,
            currentState: session?.state,
          });
          
          // Map session state to support flow state
          let supportState = null;
          if (session?.state) {
            const stateMap: Record<string, 'detect' | 'brand' | 'name' | 'order' | 'problem' | 'phone' | 'complete'> = {
              'Idle': 'detect',
              'Support.CollectBrand': 'brand',  // Already asked for brand, waiting for answer
              'Support.CollectName': 'name',
              'Support.CollectOrder': 'order',
              'Support.CollectProblem': 'problem',
              'Support.CollectPhone': 'phone',
              'Support.Complete': 'complete',
            };
            const step = stateMap[session.state] || 'detect';
            supportState = { step, data: session.metadata || {} };
          }
          
          const supportResult = await processSupportFlow(
            message,
            username,
            supportState
          );

          // Map support flow step back to session state
          const reverseStateMap: Record<string, string> = {
            'detect': 'Idle',
            'brand': 'Support.CollectBrand',
            'name': 'Support.CollectName',
            'order': 'Support.CollectOrder',
            'problem': 'Support.CollectProblem',
            'phone': 'Support.CollectPhone',
            'complete': 'Support.Complete',
          };
          const newState = supportResult.supportState?.step 
            ? reverseStateMap[supportResult.supportState.step] || 'Support.CollectBrand'
            : decision.stateTransition?.to || 'Support.CollectBrand';

          // Send meta with support flow metadata
          controller.enqueue(encodeEvent({
            type: 'meta',
            traceId,
            requestId,
            decisionId: decision.decisionId,
            sessionId: currentSessionId,
            anonId,
            uiDirectives: {
              ...decision.uiDirectives,
              showCardList: supportResult.action === 'show_brands' ? 'brands' : null,
              showQuickActions: supportResult.action === 'show_brands' ? [] : ['המשך'],
              supportState: supportResult.supportState,
              action: supportResult.action,
              brands: supportResult.brands,
            },
            stateTransition: { from: session?.state || 'Idle', to: newState },
          }));

          // Stream the response (sent as a single chunk for speed)
          if (supportResult.response) {
            controller.enqueue(encodeEvent({ type: 'delta', text: supportResult.response }));
          }

          // Send done event
          controller.enqueue(encodeEvent({
            type: 'done',
            responseId: null,
            latencyMs: Date.now() - startedAt,
            fullText: supportResult.response || '',
          }));

          // Save messages and update session
          await Promise.all([
            saveChatMessage(currentSessionId, 'user', displayMessage),
            saveChatMessage(currentSessionId, 'assistant', supportResult.response || ''),
            supabase
              .from('chat_sessions')
              .update({ 
                state: newState,
                metadata: supportResult.supportState?.data || {},
                updated_at: new Date().toISOString(),
              })
              .eq('id', currentSessionId),
          ]);

          // Complete idempotency
          await completeIdempotencyKey(idempotencyKey, { 
            response: supportResult.response, 
            sessionId: currentSessionId 
          });

          await releaseLock(currentSessionId, requestId);
          controller.close();
          return;
        }

        // === POLICY ===
        const securityContext = buildSecurityContext(engineContext);
        const policyResult = await checkPolicies({
          ctx: engineContext,
          understanding,
          decision,
          security: securityContext,
          traceId,
          requestId,
        });

        if (!policyResult.allowed) {
          controller.enqueue(encodeEvent({
            type: 'error',
            message: policyResult.blockedReason || 'הפעולה נחסמה',
            code: 'POLICY_BLOCKED',
          }));
          await releaseLock(currentSessionId, requestId);
          await completeIdempotencyKey(idempotencyKey, { response: policyResult.blockedReason, blocked: true });
          controller.close();
          return;
        }

        if (policyResult.overrides) {
          decision = applyPolicyOverrides(decision, policyResult.overrides);
        }

        // === SEND META (fast!) ===
        const metaEvent: StreamMeta = {
          type: 'meta',
          traceId,
          requestId,
          decisionId: decision.decisionId,
          sessionId: currentSessionId,
          anonId, // For client-side experiment tracking
          uiDirectives: decision.uiDirectives as any,
          stateTransition: decision.stateTransition as any,
          suggestedActions: decision.uiDirectives.showQuickActions?.map((label, i) => ({
            id: `quick-${i}`,
            label,
            action: 'quick_action',
          })),
          experiments: [],
        };
        controller.enqueue(encodeEvent(metaEvent));

        // === SEND THINKING INDICATOR (immediate — reduces perceived latency) ===
        controller.enqueue(encodeEvent({
          type: 'thinking',
          text: getSmartThinkingMessage(message),
        }));

        // === SEND CARDS (if needed) ===
        if (decision.uiDirectives.showCardList === 'brands' && brands.length > 0) {
          const cardsEvent: StreamCards = {
            type: 'cards',
            cardsType: 'brands',
            items: brands.map(b => ({
              id: b.id,
              brand_name: b.brand_name,
              description: b.description,
              coupon_code: b.coupon_code,
              category: b.category,
              link: b.link,
            })),
          };
          controller.enqueue(encodeEvent(cardsEvent));
        }

        // === USE SANDWICH BOT ===
        const preSandwichMs = Date.now() - startedAt;
        console.log(`[Stream] Pre-sandwich breakdown: total=${preSandwichMs}ms | cache=${cacheLoadMs}ms | parallel=${parallelMs}ms | fromSuggestion=${!!fromSuggestion}`);

        // Conversation history was loaded in parallel above (historyData)
        const conversationHistory = (historyData || [])
          .reverse()
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        // --- Memory V2: Prepend rolling summary + token budget ---
        // Check global flag OR per-account override (cached 5 min)
        let memoryV2Active = process.env.MEMORY_V2_ENABLED === 'true';
        if (!memoryV2Active && accountId) {
          const flagKey = `memv2:${accountId}`;
          const cachedFlag = (globalThis as any).__memV2Cache?.get(flagKey);
          if (cachedFlag !== undefined && cachedFlag.exp > Date.now()) {
            memoryV2Active = cachedFlag.val;
          } else {
            const { data: acctFlags } = await supabase
              .from('accounts')
              .select('features')
              .eq('id', accountId)
              .single();
            memoryV2Active = acctFlags?.features?.memory_v2 === true;
            if (!(globalThis as any).__memV2Cache) (globalThis as any).__memV2Cache = new Map();
            (globalThis as any).__memV2Cache.set(flagKey, { val: memoryV2Active, exp: Date.now() + 300_000 });
          }
        }

        if (memoryV2Active && currentSessionId) {
          try {
            // conversation-memory (static import)
            const memoryCtx = await buildConversationContext(currentSessionId, conversationHistory);

            // Apply token budget: trim history if needed
            const budgetResult = trimToTokenBudget(
              conversationHistory,
              memoryCtx.rollingSummary,
            );

            // Replace history with trimmed version
            conversationHistory.length = 0;
            conversationHistory.push(...budgetResult.messages);

            // Prepend summary if available
            if (budgetResult.rollingSummary) {
              conversationHistory.unshift({
                role: 'assistant' as const,
                content: `[סיכום שיחה קודמת: ${budgetResult.rollingSummary}]`,
              });
            }

            console.log('[Memory] Context prepared', {
              sessionId: currentSessionId,
              turns: budgetResult.messages.length,
              hasSummary: !!budgetResult.rollingSummary,
              trimmed: budgetResult.trimmedCount,
              estimatedTokens: budgetResult.estimatedTokens,
            });
          } catch (memErr) {
            console.error('[Memory] Failed to load context:', memErr);
          }
        }

        let fullText = '';
        let responseId: string | null = null;
        let tokenInfo = { input: 0, output: 0 };

        // NOTE: RAG cache (Warm RAG, Fresh Voice) is checked before parallel block.
        // If cachedRAG is set, sandwich bot will skip RAG retrieval but LLM always runs fresh.

        try {
          // Process with Sandwich Bot (all 3 layers!) with REAL streaming
          const influencerName = influencer.display_name || influencer.username || username || 'Unknown';
          const streamStartMs = Date.now();
          pm.mark('sandwich_start');
          let firstTokenSent = false;

          // Await lead name (started in parallel with decision engine)
          const leadName = await leadNamePromise;

          // Build proactive enrichment data
          const activeCoupons = brands
            .filter(b => b.coupon_code)
            .map(b => ({ brand_name: b.brand_name, coupon_code: b.coupon_code, description: b.description }));

          // Extract recurring topics from rolling summary for deepening (Step 4)
          const conversationTopics: string[] = [];
          if (session?.rolling_summary) {
            // Extract key phrases from the rolling summary (simple heuristic)
            const summary = session.rolling_summary as string;
            const topicMatches = summary.match(/(?:דיברנו על|שאל(?:ה|) על|מתעניינ(?:ת|) ב|נושא[:]?\s*)([^,.;]+)/g);
            if (topicMatches?.length) {
              conversationTopics.push(...topicMatches.slice(0, 3).map(t => t.replace(/^(?:דיברנו על|שאל(?:ה|) על|מתעניינ(?:ת|) ב|נושא[:]?\s*)/, '').trim()));
            }
          }

          const sandwichResult = await processSandwichMessageWithMetadata({
            userMessage: message,
            accountId,
            username: username,
            influencerName,
            conversationHistory,
            userName: leadName,
            rollingSummary: session?.rolling_summary || undefined,
            modelTier: decision?.modelStrategy?.model,
            personalityConfig: personalityConfig || undefined,
            previousResponseId: session?.last_response_id || previousResponseId || null,
            fromSuggestion: !!fromSuggestion,
            chunkId: chunkId || undefined,
            // Inject cached RAG results (Warm RAG, Fresh Voice) — LLM runs fresh
            cachedKnowledgeBase: cachedRAG?.knowledgeBase,
            cachedArchetype: cachedRAG?.archetype,
            cachedConfidence: cachedRAG?.confidence,
            // Proactive enrichment (Steps 1-4)
            suggestedClarifications: understanding.suggestedClarifications?.length ? understanding.suggestedClarifications : undefined,
            activeCoupons: activeCoupons.length > 0 ? activeCoupons : undefined,
            conversationTopics: conversationTopics.length > 0 ? conversationTopics : undefined,
            // Real-time streaming: tokens go directly to client as they arrive from OpenAI
            onToken: (token: string) => {
              if (!firstTokenSent) {
                firstTokenSent = true;
                pm.measure('ttftMs', 'request_start');
                pm.mark('streaming_start');
              }
              fullText += token;
              controller.enqueue(encodeEvent({ type: 'delta', text: token }));
            },
          });
          pm.measure('openaiStreamMs', 'streaming_start');

          // If streaming was used, fullText was already accumulated via onToken
          // If not (fallback), use the response directly
          if (!fullText && sandwichResult.response) {
            fullText = sandwichResult.response;
            // Fallback: send response as a single chunk
            controller.enqueue(encodeEvent({ type: 'delta', text: fullText }));
          }

          // Capture Responses API response ID for context chaining
          responseId = sandwichResult.responseId || null;

          // Cache RAG results for future suggestion clicks (fire-and-forget)
          // Only cache if we didn't already have cached RAG (avoid redundant writes)
          if (fromSuggestion && accountId && !cachedRAG && fullText.length > 10) {
            cacheSuggestionRAG(accountId, message, {
              knowledgeBase: sandwichResult.metadata.knowledgeBase,
              archetype: sandwichResult.metadata.archetype,
              confidence: sandwichResult.metadata.confidence,
            }).catch(() => {});
          }

          const streamDurationMs = Date.now() - streamStartMs;
          pm.set('archetype', sandwichResult.metadata.archetype || 'general');
          console.log('[Stream] ✅ Sandwich Bot response:', {
            archetype: sandwichResult.metadata.archetype,
            confidence: sandwichResult.metadata.confidence,
            personalityApplied: sandwichResult.metadata.personalityApplied,
            streamingDurationMs: streamDurationMs,
            responseLength: fullText.length,
            responseId: responseId ? responseId.slice(0, 20) + '...' : null,
          });

        } catch (sandwichError: any) {
          console.error('[Stream] Sandwich Bot error:', sandwichError);
          // Smart fallback based on error type
          const isTimeout = sandwichError.message?.includes('timeout') || sandwichError.code === 'ECONNRESET';
          const isRateLimit = sandwichError.status === 429;
          if (isRateLimit) {
            fullText = 'אופס, יותר מדי הודעות ברגע 😅 נסה שוב עוד כמה שניות!';
          } else if (isTimeout) {
            fullText = 'לקח לי יותר מדי זמן לענות 😊 אפשר לנסות שוב? אולי תנסח/י את השאלה קצת אחרת';
          } else {
            fullText = 'אופס, משהו השתבש אצלי 😅 נסה לשלוח שוב או לנסח את השאלה אחרת';
          }
          controller.enqueue(encodeEvent({ type: 'delta', text: fullText }));
        }

        // === DONE — close stream immediately, save in after() ===
        const latencyMs = Date.now() - startedAt;
        controller.enqueue(encodeEvent({
          type: 'done',
          responseId,
          latencyMs,
          tokens: tokenInfo,
          fullText,
        }));

        pm.set('totalMs', latencyMs);
        logPipelineMetrics(pm);
        recordMetrics(pm);

        controller.close();

        // === SAVE & CLEANUP (runs after response via after()) ===
        // after() keeps the Lambda alive so DB writes complete reliably
        after(async () => {
          try {
            await Promise.all([
              saveChatMessage(currentSessionId, 'user', displayMessage),
              saveChatMessage(currentSessionId, 'assistant', fullText),
              responseId
                ? supabase
                    .from('chat_sessions')
                    .update({ last_response_id: responseId })
                    .eq('id', currentSessionId)
                : Promise.resolve(),
              emitEvent({
                type: 'response_sent',
                accountId,
                sessionId: currentSessionId,
                mode: 'creator',
                payload: {
                  responseLength: fullText.length,
                  handler: decision.handler,
                  intent: understanding.intent,
                  streaming: true,
                  decisionId: decision.decisionId,
                },
                metadata: {
                  source: 'chat',
                  engineVersion: 'v2',
                  traceId,
                  requestId,
                  latencyMs,
                  tokens: tokenInfo,
                },
              }),
            ]);

            // Pre-warm RAG cache for LLM-generated suggestions (no LLM calls — just DB queries)
            // Extract <<SUGGESTIONS>> from the response and pre-fetch RAG for each one
            if (accountId && fullText.includes('<<SUGGESTIONS>>')) {
              try {
                const sugMatch = fullText.match(/<<SUGGESTIONS>>(.*?)<<\/SUGGESTIONS>>/);
                if (sugMatch?.[1]) {
                  const llmSuggestions = sugMatch[1].split('|').map(s => s.trim()).filter(s => s.length > 2);
                  if (llmSuggestions.length > 0) {
                    console.log(`[Stream] after() pre-warming RAG for ${llmSuggestions.length} LLM suggestions (no LLM calls)`);
                    prewarmSuggestionRAG(accountId, llmSuggestions.slice(0, 3))
                      .catch(err => console.error('[Stream] RAG prewarm failed:', err.message));
                  }
                }
              } catch (sugErr) {
                // Non-critical — don't let suggestion extraction errors affect cleanup
              }
            }

            // Memory V2: Update rolling summary if threshold reached
            if (memoryV2Active && currentSessionId) {
              try {
                const msgCount = (session?.message_count || 0) + 2;
                if (shouldUpdateSummary(msgCount)) {
                  await updateRollingSummary(
                    currentSessionId,
                    [...conversationHistory, { role: 'user', content: message }, { role: 'assistant', content: fullText }],
                  ).catch(err => console.error('[Memory] Summary update failed:', err));
                }
              } catch (memErr) {
                console.error('[Memory] Summary scheduling failed:', memErr);
              }
            }

            await completeIdempotencyKey(idempotencyKey, { response: fullText, responseId });
            await releaseLock(currentSessionId, requestId);
          } catch (afterErr: any) {
            console.error('[Stream] after() save failed:', afterErr.message);
            // Still try to release lock
            await releaseLock(currentSessionId, requestId).catch(() => {});
            await completeIdempotencyKey(idempotencyKey, { response: fullText, responseId }).catch(() => {});
          }
        });

      } catch (error: any) {
        console.error('[Stream] Error:', error);
        
        // Send error event
        controller.enqueue(encodeEvent({
          type: 'error',
          message: 'שגיאה בעיבוד הבקשה',
          code: 'INTERNAL_ERROR',
        }));

        // Cleanup
        if (sessionIdForLock) {
          await releaseLock(sessionIdForLock, requestId).catch(() => {});
        }
        if (idempotencyKey) {
          await completeIdempotencyKey(idempotencyKey, { error: error.message }).catch(() => {});
        }

        // Log error event
        if (accountId && sessionIdForLock) {
          await emitEvent({
            type: 'response_sent',
            accountId,
            sessionId: sessionIdForLock,
            mode: 'creator',
            payload: { error: error.message, streaming: true },
            metadata: { source: 'chat', engineVersion: 'v2', traceId, requestId, latencyMs: Date.now() - startedAt },
          }).catch(() => {});
        }

        controller.close();
      }
      }); // end withMetrics

      // Always log metrics after request completes
      pm.set('totalMs', Date.now() - startedAt);
      logPipelineMetrics(pm);
      recordMetrics(pm);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Trace-Id': traceId,
      'X-Request-Id': requestId,
    },
  });
}

