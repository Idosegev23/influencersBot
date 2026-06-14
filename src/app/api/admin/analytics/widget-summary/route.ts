/**
 * GET /api/admin/analytics/widget-summary?accountId=xxx&days=30
 *
 * Widget-specific analytics for the admin account analytics page's "Widget"
 * tab. Aggregates everything we can derive from our OWN data:
 *  - product recommendations: volume, clicks, CTR, by strategy, top products
 *  - catalog: product count
 *  - widget engagement: events table rows with mode='widget' grouped by type
 *  - purchase conversions: from widget_conversions if the table exists yet
 *  - chat sessions in window
 *
 * Defensive throughout: a missing table (e.g. widget_conversions before its
 * migration) yields zeros rather than a 500, so the tab renders regardless.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }
  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createClient();

  // ---- Recommendations + engagement + counts via SQL aggregation ----
  // Aggregate in Postgres (RPC) instead of fetching rows and counting in JS:
  // PostgREST caps every row fetch at 1000, which made high-volume accounts
  // "stop counting" at 1000. The RPC counts the full set, no cap.
  const { data: agg, error: aggErr } = await supabase.rpc('widget_analytics_summary', {
    p_account_id: accountId,
    p_since: since,
  });
  if (aggErr) {
    console.error('[admin/analytics/widget-summary] rpc error:', aggErr.message);
    return NextResponse.json({ error: 'aggregation_failed' }, { status: 500 });
  }
  const a: any = agg || {};

  const totalRecs = Number(a.rec_total) || 0;
  const totalClicks = Number(a.rec_clicks) || 0;
  const ctr = totalRecs ? Number(((totalClicks / totalRecs) * 100).toFixed(1)) : 0;
  const topProducts = (a.rec_by_product || []) as Array<{ name: string; count: number; clicks: number }>;
  const strategyBreakdown = ((a.rec_by_strategy || []) as Array<{ strategy: string; count: number; clicks: number }>)
    .map((s) => ({
      strategy: s.strategy,
      count: s.count,
      clicks: s.clicks,
      ctr: s.count ? Number(((s.clicks / s.count) * 100).toFixed(1)) : 0,
    }));
  const productCount = Number(a.product_count) || 0;
  const sessionCount = Number(a.session_count) || 0;

  // Engagement: "active" = the live pipeline is producing organic events.
  // The RPC splits each type into total count vs realtime (non-backfill) count.
  const engRows = (a.engagement || []) as Array<{ type: string; count: number; realtime: number }>;
  const engagementEvents = engRows.map((e) => ({ type: e.type, count: e.count }));
  const realtimeCount = engRows.reduce((sum, e) => sum + (Number(e.realtime) || 0), 0);
  const reconstructedCount = engRows.reduce((sum, e) => sum + ((Number(e.count) || 0) - (Number(e.realtime) || 0)), 0);
  const widgetPipelineActive = realtimeCount > 0;

  // ---- Conversions (table may not exist yet) ----
  let conversions = {
    enabled: false,
    totalOrders: 0,
    attributedOrders: 0,
    attributedRevenue: 0,
    byTier: {} as Record<string, { count: number; revenue: number }>,
    recent: [] as any[],
  };
  try {
    const { data: convRows, error: convErr } = await supabase
      .from('widget_conversions')
      .select('order_number, total, attribution, line_items, customer, occurred_at')
      .eq('account_id', accountId)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (!convErr) {
      const rows = convRows || [];
      const tiers = ['direct', 'assisted', 'influenced', 'none'];
      const byTier: Record<string, { count: number; revenue: number }> = {};
      for (const t of tiers) {
        const tr = rows.filter((r: any) => r.attribution === t);
        byTier[t] = { count: tr.length, revenue: tr.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0) };
      }
      const attributed = rows.filter((r: any) => r.attribution && r.attribution !== 'none');
      conversions = {
        enabled: true,
        totalOrders: rows.length,
        attributedOrders: attributed.length,
        attributedRevenue: attributed.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0),
        byTier,
        recent: rows.slice(0, 20),
      };
    }
  } catch {
    /* widget_conversions not migrated yet — leave disabled */
  }

  return NextResponse.json({
    days,
    recommendations: { totalRecs, totalClicks, ctr, strategyBreakdown, topProducts },
    productCount: productCount || 0,
    sessionCount: sessionCount || 0,
    engagement: {
      active: widgetPipelineActive,
      reconstructed: reconstructedCount > 0,
      realtimeCount,
      events: engagementEvents,
    },
    conversions,
  });
}
