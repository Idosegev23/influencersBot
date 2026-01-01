import { NextRequest, NextResponse } from 'next/server';
import { emitEvent, generateRequestId } from '@/engines';

/**
 * Track user interactions for analytics and learning loop
 * 
 * Tracks events like:
 * - coupon_copied
 * - link_opened
 * - quick_action_clicked
 * - support_started
 * - user_satisfied (thumbs up/down)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const {
      eventType,
      accountId,
      sessionId,
      traceId,
      payload = {},
    } = body;

    if (!eventType || !sessionId) {
      return NextResponse.json(
        { error: 'eventType and sessionId are required' },
        { status: 400 }
      );
    }

    // Map frontend event types to system events
    const eventTypeMap: Record<string, string> = {
      coupon_copied: 'coupon_copied',
      link_opened: 'link_opened',
      quick_action_clicked: 'quick_action_clicked',
      support_started: 'support_started',
      user_satisfied: 'user_satisfied',
      conversation_abandoned: 'conversation_abandoned',
      form_submitted: 'form_submitted',
      card_clicked: 'card_clicked',
    };

    const mappedType = eventTypeMap[eventType] || eventType;

    await emitEvent({
      type: mappedType as any,
      accountId: accountId || 'unknown',
      sessionId,
      mode: 'creator',
      payload: {
        ...payload,
        clientEventType: eventType,
      },
      metadata: {
        source: 'frontend',
        engineVersion: 'v2',
        traceId: traceId || undefined,
        requestId: generateRequestId(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Track API error:', error);
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}

