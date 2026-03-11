import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const accountId = auth.accountId;

    // Fetch all coupons for this account with partnership info
    const { data: coupons, error } = await supabase
      .from('coupons')
      .select('*, partnerships(brand_name)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching coupons analytics:', error);
      return NextResponse.json(
        { error: 'Failed to load coupon analytics' },
        { status: 500 }
      );
    }

    const allCoupons = coupons || [];

    // Compute totals
    const totalCopies = allCoupons.reduce((s, c) => s + (c.copy_count || 0), 0);
    const totalUsage = allCoupons.reduce((s, c) => s + (c.usage_count || 0), 0);
    const activeBrands = new Set(
      allCoupons.filter((c) => c.is_active).map((c) => c.brand_name)
    ).size;
    const totalBrands = new Set(allCoupons.map((c) => c.brand_name)).size;

    // Build brand performance
    const brandPerformance = allCoupons.map((c) => ({
      brandId: c.id,
      brandName: c.brand_name || c.partnerships?.brand_name || 'לא ידוע',
      couponCode: c.code,
      category: c.brand_category || '',
      copyCount: c.copy_count || 0,
      uniqueUsers: c.copy_count || 0,
      link: c.brand_link || c.tracking_url || '',
      shortLink: '',
      linkClicks: c.usage_count || 0,
      clickThroughRate:
        c.copy_count && c.copy_count > 0
          ? ((c.usage_count || 0) / c.copy_count) * 100
          : 0,
    }));

    // Top coupons by copy count
    const topCoupons = [...brandPerformance]
      .sort((a, b) => b.copyCount - a.copyCount)
      .slice(0, 10);

    return NextResponse.json({
      totals: {
        totalCopies,
        totalUniqueCopiers: totalCopies,
        totalBrands,
        activeBrands,
        totalLinkClicks: totalUsage,
      },
      brandPerformance,
      topCoupons,
    });
  } catch (error) {
    console.error('GET /api/influencer/analytics/coupons error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
