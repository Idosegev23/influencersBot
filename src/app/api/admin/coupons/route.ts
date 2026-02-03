import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

const COOKIE_NAME = 'influencerbot_admin_session';

// Check admin authentication
async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  return session?.value === 'authenticated';
}

/**
 * POST /api/admin/coupons
 * Create a standalone coupon (without partnership)
 */
export async function POST(request: Request) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      username,
      code,
      brandName,
      description,
      category,
      link,
      discountType = 'percentage',
      discountValue = 10,
    } = body;

    if (!username || !code || !brandName) {
      return NextResponse.json(
        { error: 'username, code, and brandName are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get account_id from username
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .maybeSingle();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found for username' },
        { status: 404 }
      );
    }

    // Create standalone coupon
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .insert({
        account_id: account.id,
        partnership_id: null, // Standalone coupon
        code,
        brand_name: brandName,
        description,
        brand_category: category,
        brand_link: link,
        discount_type: discountType,
        discount_value: discountValue,
        is_active: true,
      })
      .select()
      .single();

    if (couponError) {
      console.error('Error creating coupon:', couponError);
      return NextResponse.json(
        { error: 'Failed to create coupon', details: couponError.message },
        { status: 500 }
      );
    }

    console.log(`[Coupons] Created standalone coupon ${code} for @${username}`);

    return NextResponse.json({
      success: true,
      coupon,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/coupons:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/coupons?username=xxx
 * Get all coupons for an influencer
 */
export async function GET(request: Request) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'username is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get account_id from username
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .maybeSingle();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Get all coupons (both standalone and from partnerships)
    const { data: coupons, error: couponsError } = await supabase
      .from('coupons')
      .select(`
        *,
        partnership:partnerships(
          brand_name,
          brief
        )
      `)
      .eq('account_id', account.id)
      .order('created_at', { ascending: false });

    if (couponsError) {
      console.error('Error fetching coupons:', couponsError);
      return NextResponse.json(
        { error: 'Failed to fetch coupons' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      coupons,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/coupons:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
