import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/influencer/coupons/[id]/copy
 * Track coupon copy event
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Parse request body
    const body = await req.json();
    const {
      user_identifier,
      is_follower = false,
      copied_from = 'web',
    } = body;

    // Get user agent and IP (optional)
    const user_agent = req.headers.get('user-agent') || undefined;
    const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

    // Insert copy event
    const { data: copyEvent, error } = await supabase
      .from('coupon_copies')
      .insert({
        coupon_id: id,
        user_identifier,
        is_follower,
        copied_from,
        user_agent,
        ip_address,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to track copy:', error);
      return NextResponse.json(
        { error: 'Failed to track copy' },
        { status: 500 }
      );
    }

    // Get updated coupon with copy count
    const { data: coupon } = await supabase
      .from('coupons')
      .select('code, copy_count, usage_count')
      .eq('id', id)
      .single();

    return NextResponse.json({
      success: true,
      copy_event: copyEvent,
      coupon: {
        code: coupon?.code,
        copy_count: coupon?.copy_count || 0,
        usage_count: coupon?.usage_count || 0,
        conversion_rate: coupon?.copy_count > 0 
          ? ((coupon.usage_count / coupon.copy_count) * 100).toFixed(1)
          : '0',
      },
    });
  } catch (error) {
    console.error('POST /api/influencer/coupons/[id]/copy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
