import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

// GET - Get coupon performance analytics
export async function GET(req: NextRequest) {
  try {
    // Auth check with cookie-based auth (no RLS loop)
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { searchParams } = new URL(req.url);
    const partnershipId = searchParams.get('partnershipId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const accountId = auth.accountId;

    // Get all partnerships (brands) for this influencer
    const { data: brands, error: brandsError } = await supabase
      .from('partnerships')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true);

    if (brandsError) {
      console.error('Partnerships error:', brandsError);
      return NextResponse.json({ error: 'Failed to fetch partnerships' }, { status: 500 });
    }

    // Build date filter for events
    let eventsQuery = supabase
      .from('events')
      .select('*')
      .eq('account_id', account.id)
      .eq('type', 'coupon_copied');

    if (startDate) {
      eventsQuery = eventsQuery.gte('created_at', startDate);
    }
    if (endDate) {
      eventsQuery = eventsQuery.lte('created_at', endDate);
    }

    const { data: couponEvents, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error('Events error:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch coupon events' }, { status: 500 });
    }

    // Group events by brand
    const brandPerformance = brands?.map(brand => {
      const brandEvents = couponEvents?.filter(
        e => e.payload?.brandId === brand.id || e.payload?.brand_name === brand.brand_name
      ) || [];

      const uniqueSessions = new Set(brandEvents.map(e => e.session_id).filter(Boolean));

      return {
        brandId: brand.id,
        brandName: brand.brand_name,
        couponCode: brand.coupon_code,
        category: brand.category,
        copyCount: brandEvents.length,
        uniqueUsers: uniqueSessions.size,
        link: brand.link,
        shortLink: brand.short_link,
      };
    }).sort((a, b) => b.copyCount - a.copyCount) || [];

    // Get link clicks from events
    const { data: linkClicks, error: clicksError } = await supabase
      .from('events')
      .select('payload, session_id')
      .eq('account_id', account.id)
      .eq('type', 'link_clicked');

    if (clicksError) {
      console.error('Link clicks error:', clicksError);
    }

    // Add link click data to brand performance
    const enhancedPerformance = brandPerformance.map(brand => {
      const brandClicks = linkClicks?.filter(
        e => e.payload?.brandId === brand.brandId || e.payload?.brand_name === brand.brandName
      ) || [];

      return {
        ...brand,
        linkClicks: brandClicks.length,
        clickThroughRate: brand.copyCount > 0 
          ? Math.round((brandClicks.length / brand.copyCount) * 100 * 10) / 10 
          : 0,
      };
    });

    // Calculate totals
    const totals = {
      totalCopies: couponEvents?.length || 0,
      totalUniqueCopiers: new Set(couponEvents?.map(e => e.session_id).filter(Boolean)).size,
      totalBrands: brands?.length || 0,
      activeBrands: enhancedPerformance.filter(b => b.copyCount > 0).length,
      totalLinkClicks: linkClicks?.length || 0,
    };

    // Get performance over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: timeSeriesData, error: timeSeriesError } = await supabase
      .from('events')
      .select('created_at, payload')
      .eq('account_id', account.id)
      .eq('type', 'coupon_copied')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (timeSeriesError) {
      console.error('Time series error:', timeSeriesError);
    }

    // Group by day
    const performanceByDay: Record<string, number> = {};
    timeSeriesData?.forEach(event => {
      const date = new Date(event.created_at).toISOString().split('T')[0];
      performanceByDay[date] = (performanceByDay[date] || 0) + 1;
    });

    const performanceOverTime = Object.entries(performanceByDay).map(([date, count]) => ({
      date,
      copies: count
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Top performing coupons
    const topCoupons = enhancedPerformance.slice(0, 10);

    return NextResponse.json({
      totals,
      brandPerformance: enhancedPerformance,
      topCoupons,
      performanceOverTime,
    });
  } catch (error) {
    console.error('Get coupon analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch coupon analytics' }, { status: 500 });
  }
}

