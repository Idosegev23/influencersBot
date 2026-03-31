/**
 * GET /api/admin/recommendations
 * Analytics dashboard for product recommendations across all accounts.
 * Query: ?account_id=xxx for per-account stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export async function GET(request: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const supabase = await createClient();
    const accountId = request.nextUrl.searchParams.get('account_id');

    // 1. Overall stats
    let recQuery = supabase
      .from('widget_recommendations')
      .select('id, product_name, strategy, was_clicked, created_at', { count: 'exact' });

    if (accountId) recQuery = recQuery.eq('account_id', accountId);

    const { data: recs, count: totalRecs } = await recQuery
      .order('created_at', { ascending: false })
      .limit(1000);

    const totalClicks = (recs || []).filter((r: any) => r.was_clicked).length;
    const ctr = totalRecs ? ((totalClicks / totalRecs) * 100).toFixed(1) : '0';

    // 2. Strategy breakdown
    const strategyStats: Record<string, { count: number; clicks: number }> = {};
    for (const rec of recs || []) {
      if (!strategyStats[rec.strategy]) strategyStats[rec.strategy] = { count: 0, clicks: 0 };
      strategyStats[rec.strategy].count++;
      if (rec.was_clicked) strategyStats[rec.strategy].clicks++;
    }

    // 3. Top recommended products
    const productStats: Record<string, { name: string; count: number; clicks: number }> = {};
    for (const rec of recs || []) {
      const key = rec.product_name || 'unknown';
      if (!productStats[key]) productStats[key] = { name: key, count: 0, clicks: 0 };
      productStats[key].count++;
      if (rec.was_clicked) productStats[key].clicks++;
    }
    const topProducts = Object.values(productStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // 4. Per-account product counts
    let accountsQuery = supabase
      .from('widget_products')
      .select('account_id', { count: 'exact' });
    if (accountId) accountsQuery = accountsQuery.eq('account_id', accountId);
    const { count: totalProducts } = await accountsQuery;

    // 5. Recent recommendations (last 50)
    const recent = (recs || []).slice(0, 50).map((r: any) => ({
      id: r.id,
      productName: r.product_name,
      strategy: r.strategy,
      clicked: r.was_clicked,
      createdAt: r.created_at,
    }));

    return NextResponse.json({
      success: true,
      stats: {
        totalRecommendations: totalRecs || 0,
        totalClicks,
        ctr: parseFloat(ctr),
        totalProducts: totalProducts || 0,
      },
      strategyBreakdown: Object.entries(strategyStats).map(([strategy, s]) => ({
        strategy,
        count: s.count,
        clicks: s.clicks,
        ctr: s.count ? parseFloat(((s.clicks / s.count) * 100).toFixed(1)) : 0,
      })),
      topProducts,
      recent,
    });
  } catch (error: any) {
    console.error('[AdminRecommendations] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
