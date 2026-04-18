import { NextRequest, NextResponse } from 'next/server';
import { emitEvent, generateRequestId, claimIdempotencyKey, completeIdempotencyKey } from '@/engines';
import { trackExperimentConversion, type ExperimentContext } from '@/engines/experiments';
import { createClient } from '@/lib/supabase';
import { sendFollowerCouponDelivery, fireAndForget } from '@/lib/whatsapp-notify';

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
      // WhatsApp coupon delivery (fire-and-forget)
      // Gated by WHATSAPP_NOTIFY_ENABLED + per-template flag inside notify lib.
      // Only fires when: event is coupon_copied AND we can resolve the
      // follower's lead (phone + opt-in) AND the coupon exists.
      // ============================================
      if (mappedType === 'coupon_copied' && sessionId) {
        void dispatchCouponDeliveryWhatsApp({
          sessionId,
          accountId,
          couponCode: payload?.couponCode,
          brandName: payload?.brandName,
        });
      }

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
 * Resolve follower+coupon context and fire the WhatsApp
 * `follower_coupon_delivery_v3` template. Non-blocking, failures swallowed.
 *
 * Note: UTILITY-category templates don't require explicit marketing opt-in
 * under Meta policy — the user just actively copied a coupon, so sending
 * the details to their WhatsApp is a direct response to that action.
 *
 * Resolution chain:
 *   session → lead          (phone, first_name)
 *   account → config.username (URL slug)
 *   coupons (code matches)  → brand (via partnerships), discount, end_date
 */
async function dispatchCouponDeliveryWhatsApp(args: {
  sessionId: string;
  accountId?: string;
  couponCode?: string;
  brandName?: string;
}): Promise<void> {
  try {
    if (!args.couponCode) return;
    const supabase = createClient();

    // 1. Session → lead
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('account_id, lead_id')
      .eq('id', args.sessionId)
      .maybeSingle();
    if (!session?.lead_id) return;

    const { data: lead } = await supabase
      .from('chat_leads')
      .select('first_name, phone, whatsapp_marketing_opt_in')
      .eq('id', session.lead_id)
      .maybeSingle();
    if (!lead?.phone || !lead?.first_name) return;

    // Coupon delivery is MARKETING template — requires explicit opt-in
    if (!lead.whatsapp_marketing_opt_in) return;

    const accountId = args.accountId || session.account_id;
    if (!accountId) return;

    // 2. Username (URL slug) lives on accounts.config.username
    const { data: account } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .maybeSingle();
    const username = (account?.config as any)?.username as string | undefined;
    if (!username) return;

    // 3. Coupon details (+ partnership for brand name)
    const { data: coupon } = await supabase
      .from('coupons')
      .select(`
        code,
        discount_type,
        discount_value,
        currency,
        end_date,
        description,
        partnership_id,
        partnerships:partnership_id ( brand_name )
      `)
      .eq('account_id', accountId)
      .eq('code', args.couponCode)
      .maybeSingle();

    // Human-readable benefit string from discount_type+value
    let benefit = coupon?.description || '';
    if (!benefit && coupon?.discount_type && coupon?.discount_value != null) {
      if (coupon.discount_type === 'percentage') {
        benefit = `${coupon.discount_value}% הנחה`;
      } else if (coupon.discount_type === 'fixed') {
        benefit = `${coupon.discount_value} ${coupon.currency || 'ILS'} הנחה`;
      } else if (coupon.discount_type === 'free_shipping') {
        benefit = 'משלוח חינם';
      }
    }
    if (!benefit) benefit = 'הטבה בלעדית';

    const brand =
      args.brandName ||
      (Array.isArray(coupon?.partnerships)
        ? coupon?.partnerships?.[0]?.brand_name
        : (coupon?.partnerships as any)?.brand_name) ||
      '';

    const expiresOn = coupon?.end_date
      ? new Date(coupon.end_date).toLocaleDateString('he-IL')
      : 'ללא תוקף';

    fireAndForget(
      sendFollowerCouponDelivery({
        to: lead.phone,
        followerFirstName: lead.first_name,
        brand,
        benefit,
        code: args.couponCode,
        expiresOn,
        influencerUsername: username,
      })
    );
  } catch (err) {
    console.warn('[track] dispatchCouponDeliveryWhatsApp failed (non-fatal):', err);
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
