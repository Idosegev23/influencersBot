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

import { understandMessage } from '@/engines/understanding';
import { 
  decide, 
  getUIDirectivesSummary, 
  getModelStrategySummary,
} from '@/engines/decision';
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

function encodeEvent(event: StreamEvent): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(JSON.stringify(event) + '\n');
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

        // === LOCK ===
        await acquireLock(currentSessionId, requestId);

        // Emit stream started with cache metrics (L1 + L2)
        await emitEvent({
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
              // L2 metrics
              redisAvailable: cachedData.metrics.redisAvailable,
              l1Hits: cachedData.metrics.l1Hits,
              l2Hits: cachedData.metrics.l2Hits,
              dbHits: cachedData.metrics.dbHits,
            },
          },
          metadata: { source: 'chat', engineVersion: 'v2', traceId, requestId },
        });

        // === UNDERSTANDING ===
        const understanding = await understandMessage({
          message,
          accountId,
          sessionId: currentSessionId,
          mode: 'creator',
        });

        // === DECISION ===
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
          session: { id: currentSessionId, state: 'Chat.Active', version: 1, lastActiveAt: new Date(), messageCount: 0 } as SessionContext,
          user: { anonId: `anon_${Date.now()}`, isRepeatVisitor: false } as UserContext,
          knowledge: { brandsRef: `brands:${accountId}`, contentIndexRef: `content:${accountId}` } as KnowledgeRefs,
          limits: { tokenBudgetRemaining: 100000, tokenBudgetTotal: 100000, costCeiling: 100, costUsed: 0, rateLimitRemaining: 100, rateLimitResetAt: new Date(Date.now() + 60000), periodType: 'month', periodStart: new Date(), periodEnd: new Date() } as LimitsContext,
          request: { requestId, traceId, timestamp: new Date(), source: 'chat', messageId: `msg_${Date.now()}`, clientMessageId } as RequestContext,
        };

        let decision = await decide({
          ctx: engineContext,
          understanding,
          traceId,
          requestId,
        });

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
        // Generate consistent anonId (from client or session-based)
        const anonId = `anon_${currentSessionId.slice(0, 8)}`;
        
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
        
        // Import Sandwich Bot
        const { processSandwichMessageWithMetadata } = await import('@/lib/chatbot/sandwichBot');
        
        // Get conversation history
        const { data: historyMessages } = await supabase
          .from('chat_messages')
          .select('role, message')
          .eq('session_id', currentSessionId)
          .order('created_at', { ascending: false })
          .limit(10);

        const conversationHistory = (historyMessages || [])
          .reverse()
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.message,
          }));

        let fullText = '';
        let responseId: string | null = null;
        let tokenInfo = { input: 0, output: 0 };

        try {
          // Process with Sandwich Bot (all 3 layers!)
          const sandwichResult = await processSandwichMessageWithMetadata({
            userMessage: message,
            accountId,
            username: username,
            conversationHistory,
          });

          // Stream the complete response
          fullText = sandwichResult.response;
          
          // Stream word by word for smooth UX
          const words = fullText.split(' ');
          for (let i = 0; i < words.length; i++) {
            const word = words[i] + (i < words.length - 1 ? ' ' : '');
            controller.enqueue(encodeEvent({ type: 'delta', text: word }));
            // Small delay for streaming effect
            await new Promise(resolve => setTimeout(resolve, 30));
          }

          console.log('[Stream] ✅ Sandwich Bot response:', {
            archetype: sandwichResult.metadata.archetype,
            confidence: sandwichResult.metadata.confidence,
            personalityApplied: sandwichResult.metadata.personalityApplied,
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

