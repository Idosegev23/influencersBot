import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth, requireAccountAccess } from '@/lib/auth/api-helpers';

// GET coupons for a partnership
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partnershipId } = await context.params;

    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const supabase = await createClient();

    // Get coupons
    const { data, error } = await supabase
      .from('coupons')
      .select('*, coupon_usages(count)')
      .eq('partnership_id', partnershipId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching coupons:', error);
      return NextResponse.json(
        { error: 'שגיאה בטעינת קופונים' },
        { status: 500 }
      );
    }

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

    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const supabase = await createClient();
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

    // Check access
    const accessResult = await requireAccountAccess(
      authResult.user.id,
      partnership.account_id,
      'update'
    );

    if (!accessResult.success) {
      return NextResponse.json(
        { error: accessResult.error },
        { status: accessResult.status }
      );
    }

    // Create coupon
    const { data, error } = await supabase
      .from('coupons')
      .insert({
        partnership_id: partnershipId,
        account_id: partnership.account_id,
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
      console.error('Error creating coupon:', error);
      return NextResponse.json(
        { error: 'שגיאה ביצירת קופון' },
        { status: 500 }
      );
    }

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
