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

import { NextRequest } from 'next/server';
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
import {
  applyExperiments,
  trackExperimentExposure,
  type ExperimentContext,
  type ExperimentAssignment,
} from '@/engines/experiments';
import type { EngineContext, AccountContext, SessionContext, UserContext, KnowledgeRefs, LimitsContext, RequestContext } from '@/engines/context';
import { processSandwichMessageWithMetadata } from '@/lib/chatbot/sandwichBot';
import { buildConversationContext, trimToTokenBudget, updateRollingSummary, shouldUpdateSummary } from '@/lib/chatbot/conversation-memory';

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

interface StreamError {
  type: 'error';
  message: string;
  code?: string;
}

type StreamEvent = StreamMeta | StreamCards | StreamDelta | StreamDone | StreamError;

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
      try {
        // === PARSE REQUEST ===
        const body = await req.json();
        const {
          message: rawMessage,
          username: rawUsername,
          sessionId: rawSessionId,
          previousResponseId,
          clientMessageId,
        } = body;

        // Validate & sanitize
        const message = sanitizeChatMessage(rawMessage);
        const username = sanitizeUsername(rawUsername);
        
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

        // === Understanding (fast keyword-based, no AI call) ===
        const understanding = understandMessageFast(message);

        // === PARALLEL: Lock + Event + Session Load ===
        const anonId = `anon_${currentSessionId?.slice(0, 8) || 'guest'}`;

        const [, , sessionData] = await Promise.all([
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
        ]);

        let session = sessionData;

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
            },
            stateTransition: { from: session?.state || 'Idle', to: newState },
            // Support flow specific data
            supportState: supportResult.supportState,
            action: supportResult.action,
            brands: supportResult.brands,
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
            saveChatMessage(currentSessionId, 'user', message),
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

        // === EXPERIMENTS ===
        // Use anonId defined earlier (before support flow)
        const expContext: ExperimentContext = {
          anonId,
          sessionId: currentSessionId,
          accountId,
          mode: 'creator',
          intent: understanding?.intent,
        };

        // Apply experiment overrides to UI directives
        const { directives: experimentDirectives, experiments } = await applyExperiments(
          expContext,
          decision.uiDirectives
        );
        
        // Update decision with experiment overrides
        decision = {
          ...decision,
          uiDirectives: experimentDirectives,
        };

        // Track experiment exposures
        for (const exp of experiments) {
          await trackExperimentExposure(expContext, exp, decision.decisionId);
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
          // Pass experiments to client for attribution
          experiments: experiments.map(e => ({
            experimentKey: e.experimentKey,
            variantId: e.variantId,
            variantName: e.variantName,
          })),
        };
        controller.enqueue(encodeEvent(metaEvent));

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
        console.log('[Stream] 🥪 Using Sandwich Bot architecture');
        
        // Sandwich Bot (static import)
        
        // Get conversation history
        const { data: historyMessages } = await supabase
          .from('chat_messages')
          .select('role, content')
          .eq('session_id', currentSessionId)
          .order('created_at', { ascending: false })
          .limit(10);

        const conversationHistory = (historyMessages || [])
          .reverse()
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        // --- Memory V2: Prepend rolling summary + token budget ---
        // Check global flag OR per-account override (accounts.features.memory_v2)
        let memoryV2Active = process.env.MEMORY_V2_ENABLED === 'true';
        if (!memoryV2Active && accountId) {
          const { data: acctFlags } = await supabase
            .from('accounts')
            .select('features')
            .eq('id', accountId)
            .single();
          memoryV2Active = acctFlags?.features?.memory_v2 === true;
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

        try {
          // Process with Sandwich Bot (all 3 layers!) with REAL streaming
          const influencerName = influencer.display_name || influencer.username || username || 'Unknown';
          const streamStartMs = Date.now();
          
          const sandwichResult = await processSandwichMessageWithMetadata({
            userMessage: message,
            accountId,
            username: username,
            influencerName,
            conversationHistory,
            // Real-time streaming: tokens go directly to client as they arrive from OpenAI
            onToken: (token: string) => {
              fullText += token;
              controller.enqueue(encodeEvent({ type: 'delta', text: token }));
            },
          });

          // If streaming was used, fullText was already accumulated via onToken
          // If not (fallback), use the response directly
          if (!fullText && sandwichResult.response) {
            fullText = sandwichResult.response;
            // Fallback: send response as a single chunk
            controller.enqueue(encodeEvent({ type: 'delta', text: fullText }));
          }

          const streamDurationMs = Date.now() - streamStartMs;
          console.log('[Stream] ✅ Sandwich Bot response:', {
            archetype: sandwichResult.metadata.archetype,
            confidence: sandwichResult.metadata.confidence,
            personalityApplied: sandwichResult.metadata.personalityApplied,
            streamingDurationMs: streamDurationMs,
            responseLength: fullText.length,
          });

        } catch (sandwichError: any) {
          console.error('[Stream] Sandwich Bot error:', sandwichError);
          // Fallback response
          fullText = 'מצטער, משהו השתבש. נסה שוב!';
          controller.enqueue(encodeEvent({ type: 'delta', text: fullText }));
        }

        // === DONE ===
        const latencyMs = Date.now() - startedAt;
        controller.enqueue(encodeEvent({
          type: 'done',
          responseId,
          latencyMs,
          tokens: tokenInfo,
          fullText,
        }));

        // === SAVE & EVENTS ===
        await Promise.all([
          saveChatMessage(currentSessionId, 'user', message),
          saveChatMessage(currentSessionId, 'assistant', fullText),
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

        // --- Memory V2: Update rolling summary if threshold reached ---
        if (memoryV2Active && currentSessionId) {
          try {
            // conversation-memory (static import)
            // Use DB message_count (incremented by saveChatMessage above) + 2 for just-saved pair
            const msgCount = (session?.message_count || 0) + 2;
            if (shouldUpdateSummary(msgCount)) {
              // Fire-and-forget: don't block the response
              updateRollingSummary(
                currentSessionId,
                [...conversationHistory, { role: 'user', content: message }, { role: 'assistant', content: fullText }],
              ).catch(err => console.error('[Memory] Summary update failed:', err));
            }
          } catch (memErr) {
            console.error('[Memory] Summary scheduling failed:', memErr);
          }
        }

        // Complete idempotency
        await completeIdempotencyKey(idempotencyKey, { response: fullText, responseId });

        // Release lock
        await releaseLock(currentSessionId, requestId);

        controller.close();

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

