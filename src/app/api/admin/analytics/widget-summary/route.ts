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

  // ---- Recommendations (windowed) ----
  const { data: recs } = await supabase
    .from('widget_recommendations')
    .select('product_name, strategy, was_clicked, created_at')
    .eq('account_id', accountId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);

  const recRows = recs || [];
  const totalRecs = recRows.length;
  const totalClicks = recRows.filter((r: any) => r.was_clicked).length;
  const ctr = totalRecs ? Number(((totalClicks / totalRecs) * 100).toFixed(1)) : 0;

  const strategyStats: Record<string, { count: number; clicks: number }> = {};
  const productStats: Record<string, { name: string; count: number; clicks: number }> = {};
  for (const r of recRows as any[]) {
    const s = r.strategy || 'unknown';
    (strategyStats[s] ||= { count: 0, clicks: 0 }).count++;
    if (r.was_clicked) strategyStats[s].clicks++;
    const p = r.product_name || 'unknown';
    (productStats[p] ||= { name: p, count: 0, clicks: 0 }).count++;
    if (r.was_clicked) productStats[p].clicks++;
  }
  const topProducts = Object.values(productStats).sort((a, b) => b.count - a.count).slice(0, 15);
  const strategyBreakdown = Object.entries(strategyStats).map(([strategy, s]) => ({
    strategy,
    count: s.count,
    clicks: s.clicks,
    ctr: s.count ? Number(((s.clicks / s.count) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.count - a.count);

  // ---- Catalog size ----
  const { count: productCount } = await supabase
    .from('widget_products')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  // ---- Sessions in window ----
  const { count: sessionCount } = await supabase
    .from('chat_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', since);

  // ---- Widget engagement events (mode='widget') ----
  // Some history is reconstructed from chat_sessions/chat_messages (tagged
  // metadata.source='backfill_reconstructed'). "active" means the live
  // pipeline is producing events — judge that ONLY from organic rows, so the
  // banner stays accurate even after a backfill.
  const { data: wEvents } = await supabase
    .from('events')
    .select('type, metadata')
    .eq('account_id', accountId)
    .eq('mode', 'widget')
    .gte('created_at', since)
    .limit(10000);
  const eventCounts: Record<string, number> = {};
  let realtimeCount = 0;
  let reconstructedCount = 0;
  for (const e of (wEvents || []) as any[]) {
    eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
    if (e?.metadata?.source === 'backfill_reconstructed') reconstructedCount++;
    else realtimeCount++;
  }
  const engagementEvents = Object.entries(eventCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
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
