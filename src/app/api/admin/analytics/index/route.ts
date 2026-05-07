/**
 * Admin analytics index. Returns one row per account with last-7d
 * totals and a 14-day sparkline series for visits — used by the
 * /admin/analytics list page to scan all accounts at a glance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const sparkStart = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last7Start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [accountsRes, rollupRes, anomaliesRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, type, plan, status, created_at, config')
      .order('created_at', { ascending: false }),
    supabase
      .from('analytics_daily_rollup')
      .select('account_id, date, visits, sessions, leads, support_tickets')
      .gte('date', sparkStart),
    supabase
      .from('analytics_anomalies')
      .select('account_id')
      .is('acknowledged_at', null)
      .gte('detected_on', sparkStart),
  ]);

  if (accountsRes.error) {
    return NextResponse.json({ error: accountsRes.error.message }, { status: 500 });
  }

  const rollup = rollupRes.data || [];
  const anomalyByAccount = new Map<string, number>();
  for (const a of anomaliesRes.data || []) {
    anomalyByAccount.set(a.account_id, (anomalyByAccount.get(a.account_id) || 0) + 1);
  }

  // Build per-account map of date → visits, plus 7d totals.
  const seriesByAccount = new Map<string, Map<string, number>>();
  const totalsByAccount = new Map<
    string,
    { visits: number; sessions: number; leads: number; support_tickets: number }
  >();
  for (const r of rollup) {
    const acc = r.account_id as string;
    if (!seriesByAccount.has(acc)) seriesByAccount.set(acc, new Map());
    const m = seriesByAccount.get(acc)!;
    const date = r.date as string;
    m.set(date, (m.get(date) || 0) + (r.visits || 0));

    if (date >= last7Start) {
      if (!totalsByAccount.has(acc)) {
        totalsByAccount.set(acc, { visits: 0, sessions: 0, leads: 0, support_tickets: 0 });
      }
      const t = totalsByAccount.get(acc)!;
      t.visits += r.visits || 0;
      t.sessions += r.sessions || 0;
      t.leads += r.leads || 0;
      t.support_tickets += r.support_tickets || 0;
    }
  }

  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) {
    dates.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  const rows = (accountsRes.data || []).map((a) => {
    const cfg = (a.config || {}) as Record<string, any>;
    const seriesMap = seriesByAccount.get(a.id) || new Map<string, number>();
    const spark = dates.map((d) => seriesMap.get(d) || 0);
    const totals = totalsByAccount.get(a.id) || { visits: 0, sessions: 0, leads: 0, support_tickets: 0 };
    return {
      id: a.id,
      username: cfg.username || '',
      display_name: cfg.display_name || cfg.username || a.id.slice(0, 8),
      type: a.type,
      plan: a.plan,
      status: a.status,
      anomalies: anomalyByAccount.get(a.id) || 0,
      spark,
      totals_7d: totals,
    };
  });

  return NextResponse.json({ rows });
}
