import { NextRequest, NextResponse } from 'next/server';
import { chat, buildInfluencerInstructions } from '@/lib/openai';
import { 
  getInfluencerBySubdomain,
  getInfluencerByUsername, 
  createChatSession, 
  saveChatMessage,
  getProductsByInfluencer,
  getBrandsByInfluencer,
  getContentByInfluencer,
  trackEvent,
  supabase,
} from '@/lib/supabase';
import {
  sanitizeChatMessage,
  sanitizeUsername,
  isValidSessionId,
  isValidResponseId,
} from '@/lib/sanitize';

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

// Feature flag for full engine mode
const USE_UNDERSTANDING_ENGINE = process.env.USE_UNDERSTANDING_ENGINE !== 'false';

// Timing helper
interface StageTimings {
  parseMs: number;
  influencerLoadMs: number;
  accountLoadMs: number;
  sessionMs: number;
  lockMs: number;
  contextLoadMs: number;
  understandingMs: number;
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
        engineVersion: 'v2-hybrid',
        traceId,
        requestId,
      },
    });

    // Build context from brands, products, and content (parallel)
    const [brands, products, content] = await Promise.all([
      getBrandsByInfluencer(influencer.id),
      getProductsByInfluencer(influencer.id),
      getContentByInfluencer(influencer.id),
    ]);
    timings.contextLoadMs = Date.now() - stageStart;
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
        // Continue without understanding - fallback to basic chat
      }
    }
    timings.understandingMs = Date.now() - stageStart;
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

    // Build instructions
    const instructions = buildInfluencerInstructions(
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
            state: 'Chat.Active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentSessionId),
        trackEvent(influencer.id, 'message_sent', currentSessionId),
      ]);
    }
    timings.saveMs = Date.now() - stageStart;
    timings.totalMs = Date.now() - startedAt;

    // === ENGINE V2: Emit response_sent event with timings ===
    await emitEvent({
      type: 'response_sent',
      accountId,
      sessionId: currentSessionId || 'unknown',
      mode: 'creator',
      payload: {
        responseLength: result.response.length,
        handler: 'chat',
        hasResponseId: !!result.responseId,
        intent: understanding?.intent,
        confidence: understanding?.confidence,
      },
      metadata: {
        source: 'chat',
        engineVersion: 'v2-hybrid',
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

    return NextResponse.json({
      success: true,
      response: result.response,
      responseId: result.responseId,
      sessionId: currentSessionId,
      traceId,
      // Debug info (remove in production)
      ...(process.env.NODE_ENV === 'development' && { 
        understanding: understanding ? {
          intent: understanding.intent,
          confidence: understanding.confidence,
          topic: understanding.topic,
        } : null,
        timings,
      }),
    });
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
          engineVersion: 'v2-hybrid',
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
