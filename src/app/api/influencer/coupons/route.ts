import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

/**
 * GET /api/influencer/coupons?username=X
 * Returns all coupons for the account (not partnership-scoped)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) return auth.response!;

    const { data, error } = await supabase
      .from('coupons')
      .select('id, code, brand_name, description, discount_type, discount_value, is_active, partnership_id, created_at')
      .eq('account_id', auth.accountId)
      .order('brand_name', { ascending: true });

    if (error) {
      console.error('[coupons] GET error:', error.message);
      return NextResponse.json({ error: 'שגיאה בטעינת קופונים' }, { status: 500 });
    }

    return NextResponse.json({ coupons: data || [] });
  } catch (error) {
    console.error('[coupons] GET error:', error);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}

/**
 * POST /api/influencer/coupons?username=X
 * Create a new coupon
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) return auth.response!;

    const body = await request.json();

    if (!body.code) {
      return NextResponse.json({ error: 'קוד קופון נדרש' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        account_id: auth.accountId,
        code: body.code,
        brand_name: body.brand_name || null,
        description: body.description || null,
        discount_type: body.discount_type || 'percentage',
        discount_value: body.discount_value || 0,
        is_active: body.is_active !== false,
        partnership_id: body.partnership_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[coupons] POST error:', error.message);
      return NextResponse.json({ error: 'שגיאה ביצירת קופון' }, { status: 500 });
    }

    return NextResponse.json({ coupon: data });
  } catch (error) {
    console.error('[coupons] POST error:', error);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}

/**
 * PATCH /api/influencer/coupons?username=X
 * Update a coupon (body must include `id`)
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) return auth.response!;

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'מזהה קופון נדרש' }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('coupons')
      .select('account_id')
      .eq('id', body.id)
      .single();

    if (!existing || existing.account_id !== auth.accountId) {
      return NextResponse.json({ error: 'קופון לא נמצא' }, { status: 404 });
    }

    const updates: Record<string, any> = {};
    if (body.code !== undefined) updates.code = body.code;
    if (body.brand_name !== undefined) updates.brand_name = body.brand_name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.discount_type !== undefined) updates.discount_type = body.discount_type;
    if (body.discount_value !== undefined) updates.discount_value = body.discount_value;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const { data, error } = await supabase
      .from('coupons')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      console.error('[coupons] PATCH error:', error.message);
      return NextResponse.json({ error: 'שגיאה בעדכון קופון' }, { status: 500 });
    }

    return NextResponse.json({ coupon: data });
  } catch (error) {
    console.error('[coupons] PATCH error:', error);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}

/**
 * DELETE /api/influencer/coupons?username=X&id=UUID
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(request);
    if (!auth.authorized) return auth.response!;

    const { searchParams } = new URL(request.url);
    const couponId = searchParams.get('id');

    if (!couponId) {
      return NextResponse.json({ error: 'מזהה קופון נדרש' }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('coupons')
      .select('account_id')
      .eq('id', couponId)
      .single();

    if (!existing || existing.account_id !== auth.accountId) {
      return NextResponse.json({ error: 'קופון לא נמצא' }, { status: 404 });
    }

    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', couponId);

    if (error) {
      console.error('[coupons] DELETE error:', error.message);
      return NextResponse.json({ error: 'שגיאה במחיקת קופון' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[coupons] DELETE error:', error);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
