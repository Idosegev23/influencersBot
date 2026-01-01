import { NextRequest, NextResponse } from 'next/server';
import { emitEvent, generateRequestId, claimIdempotencyKey, completeIdempotencyKey } from '@/engines';
import { trackExperimentConversion, type ExperimentContext } from '@/engines/experiments';

/**
 * Track user interactions for analytics and learning loop
 * 
 * Tracks events like:
 * - coupon_copied
 * - link_opened
 * - quick_action_clicked
 * - support_started
 * - user_satisfied (thumbs up/down)
 * 
 * Features:
 * - Idempotency to prevent duplicates
 * - Full attribution (traceId, decisionId, experimentKey)
 * - Experiment conversion tracking
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  
  try {
    const body = await req.json();
    
    const {
      eventType,
      accountId,
      sessionId,
      anonId,
      traceId,
      decisionId,
      experimentKey,
      variantId,
      elementId,
      clientEventId, // Client-generated unique ID for dedup
      payload = {},
      mode = 'creator',
    } = body;

    if (!eventType || !sessionId) {
      return NextResponse.json(
        { error: 'eventType and sessionId are required' },
        { status: 400 }
      );
    }

    // ============================================
    // Idempotency Check
    // ============================================
    // Key format: track:{accountId}:{sessionId}:{decisionId}:{eventType}:{elementId}:{clientEventId}
    // This prevents double-clicks, retries, and offline/online duplicates
    const idempotencyKey = `track:${accountId || 'anon'}:${sessionId}:${decisionId || 'na'}:${eventType}:${elementId || 'na'}:${clientEventId || Date.now()}`;
    
    const idempotencyClaim = await claimIdempotencyKey(idempotencyKey, requestId, 120000); // 2 min TTL
    
    if (!idempotencyClaim.allowed) {
      // Already processed - return success to avoid client retries
      return NextResponse.json({ 
        success: true, 
        deduplicated: true,
        message: 'Event already tracked' 
      });
    }

    try {
      // ============================================
      // Map event types
      // ============================================
      const eventTypeMap: Record<string, string> = {
        coupon_copied: 'coupon_copied',
        link_opened: 'link_opened',
        quick_action_clicked: 'quick_action_clicked',
        support_started: 'support_started',
        user_satisfied: 'user_satisfied',
        user_unsatisfied: 'user_unsatisfied',
        conversation_abandoned: 'conversation_abandoned',
        form_submitted: 'form_submitted',
        card_clicked: 'card_clicked',
      };

      const mappedType = eventTypeMap[eventType] || eventType;

      // ============================================
      // Emit main event with full attribution
      // ============================================
      await emitEvent({
        type: mappedType as 'coupon_copied' | 'link_opened' | 'quick_action_clicked' | 'support_started' | 'user_satisfied',
        accountId: accountId || 'unknown',
        sessionId,
        mode: mode as 'creator' | 'brand',
        payload: {
          ...payload,
          clientEventType: eventType,
          elementId,
          // Attribution fields
          decisionId: decisionId || undefined,
          experimentKey: experimentKey || undefined,
          variantId: variantId || undefined,
        },
        metadata: {
          source: 'frontend',
          engineVersion: 'v2',
          traceId: traceId || undefined,
          requestId,
          decisionId: decisionId || undefined,
          // Idempotency tracking
          idempotencyKey,
          clientEventId: clientEventId || undefined,
        },
      });

      // ============================================
      // Track experiment conversion if applicable
      // ============================================
      if (experimentKey && anonId) {
        const conversionType = mapEventToConversion(eventType);
        if (conversionType) {
          const expCtx: ExperimentContext = {
            anonId,
            sessionId,
            accountId: accountId || 'unknown',
            mode: mode as 'creator' | 'brand',
          };
          await trackExperimentConversion(expCtx, experimentKey, conversionType, decisionId);
        }
      }

      // ============================================
      // Complete idempotency
      // ============================================
      await completeIdempotencyKey(idempotencyKey, { tracked: true, eventType: mappedType });

      return NextResponse.json({ 
        success: true,
        eventId: requestId,
      });
    } catch (error) {
      // Mark as failed but don't allow retry immediately
      await completeIdempotencyKey(idempotencyKey, { tracked: false, error: String(error) });
      throw error;
    }
  } catch (error) {
    console.error('Track API error:', error);
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}

/**
 * Map UI event types to experiment conversion types
 */
function mapEventToConversion(eventType: string): 'coupon_copied' | 'link_clicked' | 'support_created' | 'satisfied' | 'unsatisfied' | null {
  switch (eventType) {
    case 'coupon_copied':
      return 'coupon_copied';
    case 'link_opened':
    case 'link_clicked':
      return 'link_clicked';
    case 'support_started':
    case 'support_created':
      return 'support_created';
    case 'user_satisfied':
      return 'satisfied';
    case 'user_unsatisfied':
      return 'unsatisfied';
    default:
      return null;
  }
}
