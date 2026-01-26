import { NextRequest, NextResponse } from 'next/server';
import { chat, buildInfluencerInstructions } from '@/lib/openai';
import { 
  getInfluencerBySubdomain,
  getInfluencerByUsername, 
  createChatSession, 
  saveChatMessage,
  getProductsByInfluencer,
  trackEvent,
  supabase,
} from '@/lib/supabase';
import { buildInstructionsWithPersona } from '@/lib/chatbot/instructions-builder';
import {
  sanitizeChatMessage,
  sanitizeUsername,
  isValidSessionId,
  isValidResponseId,
} from '@/lib/sanitize';
import {
  loadChatContextCached,
  loadBrandsCached,
  loadContentIndexCached,
} from '@/lib/cached-loaders';

// Engine v2 imports
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

// Understanding Engine
import { understandMessage } from '@/engines/understanding';

// Decision Engine
import { 
  decide, 
  getUIDirectivesSummary, 
  getModelStrategySummary,
} from '@/engines/decision';
import type { EngineContext, AccountContext, SessionContext, UserContext, KnowledgeRefs, LimitsContext, RequestContext } from '@/engines/context';

// Policy Engine
import { 
  checkPolicies, 
  applyPolicyOverrides, 
  buildSecurityContext,
  getPolicySummary,
} from '@/engines/policy';
import type { SecurityContext, PolicyCheckResult } from '@/engines/policy';

// Feature flags
const USE_UNDERSTANDING_ENGINE = process.env.USE_UNDERSTANDING_ENGINE !== 'false';
const USE_DECISION_ENGINE = process.env.USE_DECISION_ENGINE !== 'false';
const USE_POLICY_ENGINE = process.env.USE_POLICY_ENGINE !== 'false';

// Timing helper
interface StageTimings {
  parseMs: number;
  influencerLoadMs: number;
  accountLoadMs: number;
  sessionMs: number;
  lockMs: number;
  contextLoadMs: number;
  understandingMs: number;
  decisionMs: number;
  policyMs: number;
  openaiMs: number;
  saveMs: number;
  totalMs: number;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const traceId = generateTraceId();
  const requestId = generateRequestId();
  
  // Stage timings
  const timings: Partial<StageTimings> = {};
  let stageStart = Date.now();
  
  // For engine context
  let accountId: string | null = null;
  let sessionIdForEvents: string | null = null;
  let lockAcquired = false;

  try {
    const body = await req.json();
    timings.parseMs = Date.now() - stageStart;
    stageStart = Date.now();
    
    // Sanitize inputs
    const rawIdentifier = body.username || body.subdomain;
    const identifier = rawIdentifier ? sanitizeUsername(rawIdentifier) : null;
    const message = body.message ? sanitizeChatMessage(body.message) : null;
    const sessionId = body.sessionId && isValidSessionId(body.sessionId) ? body.sessionId : null;
    const responseId = body.responseId && isValidResponseId(body.responseId) ? body.responseId : null;
    const clientMessageId = body.clientMessageId || requestId;

    if (!identifier || !message) {
      return NextResponse.json(
        { error: 'Username/subdomain and message are required' },
        { status: 400 }
      );
    }

    // Get influencer - try by username first, then by subdomain
    let influencer = await getInfluencerByUsername(identifier);
    if (!influencer) {
      influencer = await getInfluencerBySubdomain(identifier);
    }
    timings.influencerLoadMs = Date.now() - stageStart;
    stageStart = Date.now();

    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      );
    }

    if (!influencer.persona) {
      return NextResponse.json(
        { error: 'Influencer not configured properly' },
        { status: 500 }
      );
    }

    // === ENGINE V2: Get or create account ===
    const accountInfo = await getAccountByInfluencerUsername(influencer.username);
    accountId = accountInfo?.accountId || influencer.id;
    timings.accountLoadMs = Date.now() - stageStart;
    stageStart = Date.now();

    // === ENGINE V2: Idempotency check ===
    const messageHash = hashMessage(message);
    const idempotencyKey = `${accountId}:${sessionId || 'new'}:chat:${messageHash}:${clientMessageId}`;
    
    const idempotencyClaim = await claimIdempotencyKey(idempotencyKey, requestId);
    if (!idempotencyClaim.allowed && idempotencyClaim.cachedResult) {
      const cached = idempotencyClaim.cachedResult as { response: string; responseId: string; sessionId: string };
      return NextResponse.json({
        success: true,
        response: cached.response,
        responseId: cached.responseId,
        sessionId: cached.sessionId,
        cached: true,
      });
    }

    // Get or create session
    let currentSessionId: string | null = sessionId;
    if (!currentSessionId) {
      const session = await createChatSession(influencer.id);
      if (session) {
        currentSessionId = session.id;
        await trackEvent(influencer.id, 'chat_started', currentSessionId);
      }
    }
    sessionIdForEvents = currentSessionId;
    timings.sessionMs = Date.now() - stageStart;
    stageStart = Date.now();

    // === ENGINE V2: Acquire lock ===
    if (currentSessionId) {
      lockAcquired = await acquireLock(currentSessionId, requestId);
    }
    timings.lockMs = Date.now() - stageStart;
    stageStart = Date.now();

    // === ENGINE V2: Emit message_received event ===
    await emitEvent({
      type: 'message_received',
      accountId,
      sessionId: currentSessionId || 'unknown',
      mode: 'creator',
      payload: {
        messageLength: message.length,
        clientMessageId,
        hasResponseId: !!responseId,
      },
      metadata: {
        source: 'chat',
        engineVersion: 'v2',
        traceId,
        requestId,
      },
    });

    // Build context from brands, products, and content (parallel with caching)
    const [brandsResult, contentResult, products] = await Promise.all([
      loadBrandsCached(influencer.id, accountId),
      loadContentIndexCached(influencer.id, accountId),
      getProductsByInfluencer(influencer.id), // Products not cached yet
    ]);
    const brands = brandsResult.data;
    const content = contentResult.data;
    timings.contextLoadMs = Date.now() - stageStart;
    timings.cacheMetrics = {
      brandsHit: brandsResult.metrics.hit,
      brandsMs: brandsResult.metrics.loadTimeMs,
      contentHit: contentResult.metrics.hit,
      contentMs: contentResult.metrics.loadTimeMs,
    };
    stageStart = Date.now();

    // === UNDERSTANDING ENGINE ===
    let understanding = null;
    if (USE_UNDERSTANDING_ENGINE) {
      try {
        understanding = await understandMessage({
          message,
          accountId,
          mode: 'creator',
          brands: brands.map(b => b.brand_name),
          sessionId: currentSessionId || undefined,
        });
        
        // Emit understanding events
        await emitEvent({
          type: 'intent_detected',
          accountId,
          sessionId: currentSessionId || 'unknown',
          mode: 'creator',
          payload: {
            intent: understanding.intent,
            confidence: understanding.confidence,
            topic: understanding.topic,
            suggestedHandler: understanding.routeHints?.suggestedHandler,
          },
          metadata: {
            source: 'understanding',
            engineVersion: 'v2',
            traceId,
            requestId,
          },
        });

        // Emit entities if found
        if (Object.keys(understanding.entities).some(k => {
          const val = understanding.entities[k as keyof typeof understanding.entities];
          return Array.isArray(val) ? val.length > 0 : !!val;
        })) {
          await emitEvent({
            type: 'entities_extracted',
            accountId,
            sessionId: currentSessionId || 'unknown',
            mode: 'creator',
            payload: {
              entities: understanding.entities,
              piiDetected: understanding.piiDetectedPaths,
            },
            metadata: {
              source: 'understanding',
              engineVersion: 'v2',
              traceId,
              requestId,
            },
          });
        }

        // Emit risk if flagged
        if (understanding.risk && Object.values(understanding.risk).some(v => v)) {
          await emitEvent({
            type: 'risk_flagged',
            accountId,
            sessionId: currentSessionId || 'unknown',
            mode: 'creator',
            payload: {
              risk: understanding.risk,
              requiresHuman: understanding.requiresHuman,
            },
            metadata: {
              source: 'understanding',
              engineVersion: 'v2',
              traceId,
              requestId,
            },
          });
        }
      } catch (err) {
        console.error('[Understanding] Error:', err);
      }
    }
    timings.understandingMs = Date.now() - stageStart;
    stageStart = Date.now();

    // === DECISION ENGINE ===
    let decision = null;
    if (USE_DECISION_ENGINE && understanding) {
      try {
        // Build minimal EngineContext for decision
        const engineContext: EngineContext = {
          account: {
            id: accountId,
            mode: 'creator',
            profileId: influencer.id,
            timezone: 'Asia/Jerusalem',
            language: 'he',
            plan: 'pro',
            allowedChannels: ['chat'],
            security: {
              publicChatAllowed: true,
              requireAuthForSupport: false,
              allowedOrigins: [],
            },
            features: {
              supportFlowEnabled: true,
              salesFlowEnabled: false,
              whatsappEnabled: false,
              analyticsEnabled: true,
            },
          } as AccountContext,
          session: {
            id: currentSessionId || '',
            state: 'Chat.Active',
            version: 1,
            lastActiveAt: new Date(),
            messageCount: 0,
          } as SessionContext,
          user: {
            anonId: `anon_${Date.now()}`,
            isRepeatVisitor: false,
          } as UserContext,
          knowledge: {
            brandsRef: `brands:${accountId}`,
            contentIndexRef: `content:${accountId}`,
          } as KnowledgeRefs,
          limits: {
            tokenBudgetRemaining: 100000,
            tokenBudgetTotal: 100000,
            costCeiling: 100,
            costUsed: 0,
            rateLimitRemaining: 100,
            rateLimitResetAt: new Date(Date.now() + 60000),
            periodType: 'month',
            periodStart: new Date(),
            periodEnd: new Date(),
          } as LimitsContext,
          request: {
            requestId,
            traceId,
            timestamp: new Date(),
            source: 'chat',
            messageId: `msg_${Date.now()}`,
            clientMessageId,
          } as RequestContext,
        };

        decision = await decide({
          ctx: engineContext,
          understanding,
          traceId,
          requestId,
        });

        // Emit decision event
        await emitEvent({
          type: 'decision_made',
          accountId,
          sessionId: currentSessionId || 'unknown',
          mode: 'creator',
          payload: {
            action: decision.action,
            handler: decision.handler,
            uiDirectives: getUIDirectivesSummary(decision),
            modelStrategy: getModelStrategySummary(decision),
            rulesApplied: decision.rulesApplied.length,
            ruleNames: decision.rulesApplied.map(r => r.name),
          },
          metadata: {
            source: 'decision',
            engineVersion: 'v2',
            traceId,
            requestId,
          },
        });
      } catch (err) {
        console.error('[Decision] Error:', err);
      }
    }
    timings.decisionMs = Date.now() - stageStart;
    stageStart = Date.now();

    // === POLICY ENGINE ===
    let policyResult: PolicyCheckResult | null = null;
    let engineContext: EngineContext | null = null;
    
    if (USE_POLICY_ENGINE && decision && understanding) {
      try {
        // Build engine context (already built above for decision)
        engineContext = {
          account: {
            id: accountId,
            mode: 'creator',
            profileId: influencer.id,
            timezone: 'Asia/Jerusalem',
            language: 'he',
            plan: 'pro',
            allowedChannels: ['chat'],
            security: {
              publicChatAllowed: true,
              requireAuthForSupport: false,
              allowedOrigins: [],
            },
            features: {
              supportFlowEnabled: true,
              salesFlowEnabled: false,
              whatsappEnabled: false,
              analyticsEnabled: true,
            },
          } as AccountContext,
          session: {
            id: currentSessionId || '',
            state: 'Chat.Active',
            version: 1,
            lastActiveAt: new Date(),
            messageCount: 0,
          } as SessionContext,
          user: {
            anonId: `anon_${Date.now()}`,
            isRepeatVisitor: false,
          } as UserContext,
          knowledge: {
            brandsRef: `brands:${accountId}`,
            contentIndexRef: `content:${accountId}`,
          } as KnowledgeRefs,
          limits: {
            tokenBudgetRemaining: 100000,
            tokenBudgetTotal: 100000,
            costCeiling: 100,
            costUsed: 0,
            rateLimitRemaining: 100,
            rateLimitResetAt: new Date(Date.now() + 60000),
            periodType: 'month',
            periodStart: new Date(),
            periodEnd: new Date(),
          } as LimitsContext,
          request: {
            requestId,
            traceId,
            timestamp: new Date(),
            source: 'chat',
            messageId: `msg_${Date.now()}`,
            clientMessageId,
          } as RequestContext,
        };

        // Build security context
        const securityContext: SecurityContext = buildSecurityContext(engineContext);
        
        // Run policy checks
        policyResult = await checkPolicies({
          ctx: engineContext,
          understanding,
          decision,
          security: securityContext,
          traceId,
          requestId,
        });

        // Emit policy event
        await emitEvent({
          type: 'policy_checked',
          accountId,
          sessionId: currentSessionId || 'unknown',
          mode: 'creator',
          payload: {
            allowed: policyResult.allowed,
            blockedReason: policyResult.blockedReason,
            blockedByRule: policyResult.blockedByRule,
            policySummary: getPolicySummary(policyResult),
            warningsCount: policyResult.warnings?.length || 0,
            hasOverrides: !!policyResult.overrides,
          },
          metadata: {
            source: 'policy',
            engineVersion: 'v2',
            traceId,
            requestId,
          },
        });

        // If blocked, return early with policy response
        if (!policyResult.allowed) {
          timings.policyMs = Date.now() - stageStart;
          timings.totalMs = Date.now() - startedAt;

          // Emit blocked event
          await emitEvent({
            type: 'policy_blocked',
            accountId,
            sessionId: currentSessionId || 'unknown',
            mode: 'creator',
            payload: {
              rule: policyResult.blockedByRule,
              reason: policyResult.blockedReason,
              decisionId: decision.decisionId,
            },
            metadata: {
              source: 'policy',
              engineVersion: 'v2',
              traceId,
              requestId,
              latencyMs: timings.totalMs,
            },
          });

          // Complete idempotency with blocked response
          const blockedResponse = {
            response: policyResult.blockedReason || 'הפעולה נחסמה',
            responseId: null,
            sessionId: currentSessionId,
          };
          await completeIdempotencyKey(idempotencyKey, blockedResponse);

          return NextResponse.json({
            success: false,
            response: policyResult.blockedReason,
            blocked: true,
            blockedBy: policyResult.blockedByRule,
            sessionId: currentSessionId,
            traceId,
          });
        }

        // Apply policy overrides to decision
        if (policyResult.overrides) {
          decision = applyPolicyOverrides(decision, policyResult.overrides);
        }
      } catch (err) {
        console.error('[Policy] Error:', err);
      }
    }
    timings.policyMs = Date.now() - stageStart;
    stageStart = Date.now();

    // Build context string
    let contextStr = '';
    
    if (brands.length > 0) {
      contextStr += '## מותגים ושיתופי פעולה:\n';
      contextStr += 'אלו המותגים שאני עובדת איתם ויש לי קופונים עבורם:\n';
      brands.forEach((b) => {
        contextStr += `- ${b.brand_name}`;
        if (b.description) contextStr += `: ${b.description}`;
        if (b.coupon_code) contextStr += ` | קוד קופון: "${b.coupon_code}"`;
        else contextStr += ` | ללא קוד קופון כרגע`;
        if (b.link) contextStr += ` | לינק: ${b.link}`;
        contextStr += '\n';
      });
      contextStr += '\nכשמישהו שואל על קופונים או הנחות, תן להם את הקוד הרלוונטי מהרשימה למעלה.\n';
    }

    if (products.length > 0) {
      contextStr += '\n## מוצרים שהזכרתי לאחרונה:\n';
      products.slice(0, 10).forEach((p) => {
        contextStr += `- ${p.name}`;
        if (p.brand) contextStr += ` (${p.brand})`;
        if (p.coupon_code) contextStr += ` - קופון: ${p.coupon_code}`;
        contextStr += '\n';
      });
    }

    if (content.length > 0) {
      const contentSlice = content.slice(0, 15);
      const contentLabels: Record<string, string> = {
        recipe: 'מתכונים',
        look: 'לוקים',
        outfit: 'אאוטפיטים',
        tip: 'טיפים',
        workout: 'אימונים',
        review: 'ביקורות',
        recommendation: 'המלצות',
        story: 'סיפורים',
        moment: 'רגעים',
        tutorial: 'מדריכים',
        routine: 'רוטינות',
      };
      
      contextStr += '\n## תכנים שפרסמתי לאחרונה:\n';
      contentSlice.forEach((c) => {
        const typeLabel = contentLabels[c.type] || c.type;
        contextStr += `- [${typeLabel}] ${c.title}`;
        if (c.description) contextStr += `: ${c.description.slice(0, 80)}...`;
        contextStr += '\n';
      });
    }

    // === LOAD PERSONA + KNOWLEDGE BASE ===
    let persona = null;
    let knowledge: any[] = [];
    
    try {
      // Load chatbot persona
      const { data: personaData } = await supabase
        .from('chatbot_persona')
        .select('*')
        .eq('account_id', accountId)
        .single();
      
      persona = personaData;

      // Load knowledge base (top 10 by priority)
      const { data: knowledgeData } = await supabase
        .from('chatbot_knowledge_base')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .limit(10);
      
      knowledge = knowledgeData || [];
    } catch (error) {
      console.log('Persona/knowledge not available, using fallback');
    }

    // Build instructions with decision-based tone
    const tone = decision?.uiDirectives?.tone || 'casual';
    const responseLength = decision?.uiDirectives?.responseLength || 'standard';
    
    // Use enhanced instructions if persona available, otherwise fallback
    const instructions = persona
      ? buildInstructionsWithPersona(influencer, persona, knowledge)
      : buildInfluencerInstructions(
          influencer.display_name,
          influencer.persona,
          influencer.influencer_type,
          contextStr
        );

    // Use Responses API with previous_response_id for multi-turn
    const result = await chat(
      instructions,
      message,
      responseId || undefined
    );
    timings.openaiMs = Date.now() - stageStart;
    stageStart = Date.now();

    // Save messages to database
    if (currentSessionId) {
      await Promise.all([
        saveChatMessage(currentSessionId, 'user', message),
        saveChatMessage(currentSessionId, 'assistant', result.response),
        supabase
        .from('chat_sessions')
          .update({ 
            thread_id: result.responseId,
            state: decision?.stateTransition?.to || 'Chat.Active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentSessionId),
        trackEvent(influencer.id, 'message_sent', currentSessionId),
      ]);
    }
    timings.saveMs = Date.now() - stageStart;
    timings.totalMs = Date.now() - startedAt;

    // === ENGINE V2: Emit response_sent event with full details ===
    await emitEvent({
      type: 'response_sent',
      accountId,
      sessionId: currentSessionId || 'unknown',
      mode: 'creator',
      payload: {
        responseLength: result.response.length,
        handler: decision?.handler || 'chat',
        hasResponseId: !!result.responseId,
        intent: understanding?.intent,
        confidence: understanding?.confidence,
        action: decision?.action,
        rulesApplied: decision?.rulesApplied?.length || 0,
      },
      metadata: {
        source: 'chat',
        engineVersion: 'v2',
        traceId,
        requestId,
        latencyMs: timings.totalMs,
        idempotencyKey,
        stageTimings: timings,
      },
    });

    // === ENGINE V2: Complete idempotency ===
    const responseData = {
      response: result.response,
      responseId: result.responseId,
      sessionId: currentSessionId,
    };
    await completeIdempotencyKey(idempotencyKey, responseData);

    // Build response with UI directives
    const response: Record<string, unknown> = {
      success: true,
      response: result.response,
      responseId: result.responseId,
      sessionId: currentSessionId,
      traceId,
      state: decision?.stateTransition?.to || 'Chat.Active',
    };

    // Include UI directives for frontend
    if (decision?.uiDirectives) {
      response.uiDirectives = decision.uiDirectives;
      response.decisionId = decision.decisionId; // For linking UI actions to decisions
      
      // Include brands data if showCardList is 'brands'
      if (decision.uiDirectives.showCardList === 'brands' && brands.length > 0) {
        response.cardsPayload = {
          type: 'brands',
          data: brands.map(b => ({
            id: b.id,
            brand_name: b.brand_name,
            description: b.description,
            coupon_code: b.coupon_code,
            category: b.category,
            link: b.link,
            discount_percent: b.discount_percent,
          })),
        };
      }
      
      // Build suggested actions from decision
      if (decision.uiDirectives.showQuickActions?.length) {
        response.suggestedActions = decision.uiDirectives.showQuickActions.map((label, i) => ({
          id: `quick-${i}`,
          label,
          action: 'quick_action',
          payload: { text: label },
        }));
      }
    }

    // Debug info in development
    if (process.env.NODE_ENV === 'development') {
      response.debug = {
        understanding: understanding ? {
          intent: understanding.intent,
          confidence: understanding.confidence,
          topic: understanding.topic,
          entities: understanding.entities,
        } : null,
        decision: decision ? {
          action: decision.action,
          handler: decision.handler,
          rulesApplied: decision.rulesApplied.map(r => r.name),
          uiDirectives: decision.uiDirectives,
          modelStrategy: decision.modelStrategy,
        } : null,
        timings,
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    timings.totalMs = Date.now() - startedAt;
    console.error('Chat API error:', error);

    if (accountId) {
      await emitEvent({
        type: 'error_occurred',
        accountId,
        sessionId: sessionIdForEvents || 'unknown',
        mode: 'creator',
        payload: {
          error: error instanceof Error ? error.message : String(error),
          stage: 'chat_api',
        },
        metadata: {
          source: 'chat',
          engineVersion: 'v2',
          traceId,
          requestId,
          latencyMs: timings.totalMs,
          stageTimings: timings,
        },
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed', traceId },
      { status: 500 }
    );
  } finally {
    if (lockAcquired && sessionIdForEvents) {
      await releaseLock(sessionIdForEvents, requestId);
    }
  }
}
