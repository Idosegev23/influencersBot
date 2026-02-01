import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

// GET coupons for a partnership
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partnershipId } = await context.params;

    // Auth check with cookie-based auth (no RLS loop)
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) {
      return auth.response!;
    }

    const accountId = auth.accountId;

    // Verify partnership belongs to this account
    const { data: partnership } = await supabase
      .from('partnerships')
      .select('account_id')
      .eq('id', partnershipId)
      .single();

    if (!partnership) {
      return NextResponse.json(
        { error: 'שת"פ לא נמצא' },
        { status: 404 }
      );
    }

    if (partnership.account_id !== accountId) {
      return NextResponse.json(
        { error: 'אין הרשאה לגשת לשת"פ זה' },
        { status: 403 }
      );
    }

    // Get coupons
    console.log('🎟️ Fetching coupons for partnership:', partnershipId, 'account:', accountId);
    const { data, error } = await supabase
      .from('coupons')
      .select('*, coupon_usages(count)')
      .eq('partnership_id', partnershipId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching coupons:', error);
      return NextResponse.json(
        { error: 'שגיאה בטעינת קופונים' },
        { status: 500 }
      );
    }

    console.log('✅ Found coupons:', data?.length || 0);
    console.log('📦 Coupons data:', JSON.stringify(data, null, 2));

    return NextResponse.json({
      success: true,
      coupons: data || [],
    });
  } catch (error) {
    console.error('Error in GET /api/influencer/partnerships/[id]/coupons:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}

// CREATE new coupon
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partnershipId } = await context.params;

    // Auth check with cookie-based auth (no RLS loop)
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) {
      return auth.response!;
    }

    const accountId = auth.accountId;
    const body = await request.json();

    // Get partnership to verify access
    const { data: partnership } = await supabase
      .from('partnerships')
      .select('account_id')
      .eq('id', partnershipId)
      .single();

    if (!partnership) {
      return NextResponse.json(
        { error: 'שת"פ לא נמצא' },
        { status: 404 }
      );
    }

    if (partnership.account_id !== accountId) {
      return NextResponse.json(
        { error: 'אין הרשאה לגשת לשת"פ זה' },
        { status: 403 }
      );
    }

    // Create coupon
    console.log('➕ Creating coupon:', body.code, 'for partnership:', partnershipId);
    const { data, error } = await supabase
      .from('coupons')
      .insert({
        partnership_id: partnershipId,
        account_id: accountId,
        code: body.code,
        description: body.description,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        currency: body.currency || 'ILS',
        min_purchase_amount: body.min_purchase_amount,
        max_discount_amount: body.max_discount_amount,
        usage_limit: body.usage_limit,
        start_date: body.start_date,
        end_date: body.end_date,
        is_active: body.is_active !== false,
        tracking_url: body.tracking_url,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating coupon:', error);
      return NextResponse.json(
        { error: 'שגיאה ביצירת קופון', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ Coupon created successfully:', data.id, data.code);

    return NextResponse.json({
      success: true,
      coupon: data,
    });
  } catch (error) {
    console.error('Error in POST /api/influencer/partnerships/[id]/coupons:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
