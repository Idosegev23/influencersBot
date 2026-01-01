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

// Feature flag for full engine mode
const USE_FULL_ENGINE = process.env.USE_FULL_ENGINE === 'true';

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const traceId = generateTraceId();
  const requestId = generateRequestId();
  
  // For engine context
  let accountId: string | null = null;
  let sessionIdForEvents: string | null = null;
  let lockAcquired = false;

  try {
    const body = await req.json();
    
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

    // === ENGINE V2: Idempotency check ===
    const messageHash = hashMessage(message);
    const idempotencyKey = `${accountId}:${sessionId || 'new'}:chat:${messageHash}`;
    
    const idempotencyClaim = await claimIdempotencyKey(idempotencyKey, requestId);
    if (!idempotencyClaim.allowed && idempotencyClaim.cachedResult) {
      // Return cached response
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
        // Track chat started
        await trackEvent(influencer.id, 'chat_started', currentSessionId);
      }
    }
    sessionIdForEvents = currentSessionId;

    // === ENGINE V2: Acquire lock ===
    if (currentSessionId) {
      lockAcquired = await acquireLock(currentSessionId, requestId);
    }

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

    // Build context from brands, products, and content
    let context = '';
    
    // Get brands (main source for coupons)
    const brands = await getBrandsByInfluencer(influencer.id);
    if (brands.length > 0) {
      context += '## מותגים ושיתופי פעולה:\n';
      context += 'אלו המותגים שאני עובדת איתם ויש לי קופונים עבורם:\n';
      brands.forEach((b) => {
        context += `- ${b.brand_name}`;
        if (b.description) context += `: ${b.description}`;
        if (b.coupon_code) context += ` | קוד קופון: "${b.coupon_code}"`;
        else context += ` | ללא קוד קופון כרגע`;
        if (b.link) context += ` | לינק: ${b.link}`;
        context += '\n';
      });
      context += '\nכשמישהו שואל על קופונים או הנחות, תן להם את הקוד הרלוונטי מהרשימה למעלה.\n';
    }

    // Get products (for additional context)
    const products = await getProductsByInfluencer(influencer.id);
    if (products.length > 0) {
      context += '\n## מוצרים שהזכרתי לאחרונה:\n';
      products.slice(0, 10).forEach((p) => {
        context += `- ${p.name}`;
        if (p.brand) context += ` (${p.brand})`;
        if (p.coupon_code) context += ` - קופון: ${p.coupon_code}`;
        context += '\n';
      });
    }

    // Get content based on influencer type
    const content = await getContentByInfluencer(influencer.id);
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
      
      context += '\n## תכנים שפרסמתי לאחרונה:\n';
      contentSlice.forEach((c) => {
        const typeLabel = contentLabels[c.type] || c.type;
        context += `- [${typeLabel}] ${c.title}`;
        if (c.description) context += `: ${c.description.slice(0, 80)}...`;
        context += '\n';
      });
    }

    // Build instructions
    const instructions = buildInfluencerInstructions(
      influencer.display_name,
      influencer.persona,
      influencer.influencer_type,
      context
    );

    // Use Responses API with previous_response_id for multi-turn
    const result = await chat(
      instructions,
      message,
      responseId || undefined
    );

    // Save messages to database
    if (currentSessionId) {
      await saveChatMessage(currentSessionId, 'user', message);
      await saveChatMessage(currentSessionId, 'assistant', result.response);
      
      // Update session with response ID for next turn
      await supabase
        .from('chat_sessions')
        .update({ 
          thread_id: result.responseId,
          state: 'Chat.Active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSessionId);
      
      // Track message
      await trackEvent(influencer.id, 'message_sent', currentSessionId);
    }

    const latencyMs = Date.now() - startedAt;

    // === ENGINE V2: Emit response_sent event ===
    await emitEvent({
      type: 'response_sent',
      accountId,
      sessionId: currentSessionId || 'unknown',
      mode: 'creator',
      payload: {
        responseLength: result.response.length,
        handler: 'chat',
        hasResponseId: !!result.responseId,
      },
      metadata: {
        source: 'chat',
        engineVersion: 'v2-hybrid',
        traceId,
        requestId,
        latencyMs,
        idempotencyKey,
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
      traceId, // Include for debugging
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    console.error('Chat API error:', error);

    // === ENGINE V2: Emit error event ===
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
          latencyMs,
        },
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed', traceId },
      { status: 500 }
    );
  } finally {
    // === ENGINE V2: Release lock ===
    if (lockAcquired && sessionIdForEvents) {
      await releaseLock(sessionIdForEvents, requestId);
    }
  }
}
