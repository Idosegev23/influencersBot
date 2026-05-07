/**
 * Daily anomaly detector. Compares yesterday's KPI totals to a 14-day
 * trailing baseline. If a metric drops by >50% (and the baseline is high
 * enough to be meaningful), writes a row to analytics_anomalies. The
 * dashboard reads from that table for "alerts" badges.
 *
 * Metrics watched: visits, sessions, leads, support_tickets, coupon_copies.
 *
 * Schedule: daily 05:00 UTC.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

const DROP_THRESHOLD = 0.5;
const MIN_BASELINE = 5;

const METRICS = ['visits', 'sessions', 'leads', 'support_tickets', 'coupon_copies'] as const;
type Metric = (typeof METRICS)[number];

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

interface RollupRow {
  account_id: string;
  date: string;
  visits: number;
  sessions: number;
  leads: number;
  support_tickets: number;
  coupon_copies: number;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const baselineStart = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const baselineEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Pull rollup rows for yesterday + the 14-day baseline window.
  const { data: rollup, error } = await supabase
    .from('analytics_daily_rollup')
    .select('account_id, date, visits, sessions, leads, support_tickets, coupon_copies')
    .gte('date', baselineStart)
    .lte('date', yesterday);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: RollupRow[] = (rollup || []) as RollupRow[];

  // Aggregate per (account, date) — rollup may have multiple rows per day
  // when ref_source/device varies.
  const byAccountDate = new Map<string, RollupRow>();
  for (const r of rows) {
    const key = `${r.account_id}|${r.date}`;
    const cur = byAccountDate.get(key);
    if (cur) {
      cur.visits += r.visits || 0;
      cur.sessions += r.sessions || 0;
      cur.leads += r.leads || 0;
      cur.support_tickets += r.support_tickets || 0;
      cur.coupon_copies += r.coupon_copies || 0;
    } else {
      byAccountDate.set(key, {
        account_id: r.account_id,
        date: r.date,
        visits: r.visits || 0,
        sessions: r.sessions || 0,
        leads: r.leads || 0,
        support_tickets: r.support_tickets || 0,
        coupon_copies: r.coupon_copies || 0,
      });
    }
  }

  const accounts = Array.from(new Set(rows.map((r) => r.account_id)));
  const inserts: Array<Record<string, unknown>> = [];

  for (const accountId of accounts) {
    const ydayRow = byAccountDate.get(`${accountId}|${yesterday}`);
    if (!ydayRow) continue;

    const baselineRows: RollupRow[] = [];
    for (const [k, v] of byAccountDate.entries()) {
      if (!k.startsWith(`${accountId}|`)) continue;
      if (v.date >= yesterday) continue;
      if (v.date < baselineStart || v.date > baselineEnd) continue;
      baselineRows.push(v);
    }
    if (baselineRows.length < 5) continue;

    for (const metric of METRICS) {
      const baseValues = baselineRows.map((r) => r[metric]);
      const baseAvg = baseValues.reduce((s, v) => s + v, 0) / baseValues.length;
      if (baseAvg < MIN_BASELINE) continue;
      const yVal = ydayRow[metric];
      const delta = (yVal - baseAvg) / baseAvg;
      if (delta > -DROP_THRESHOLD) continue;

      inserts.push({
        account_id: accountId,
        detected_on: yesterday,
        metric,
        yesterday: yVal,
        baseline: Number(baseAvg.toFixed(2)),
        delta_pct: Number((delta * 100).toFixed(2)),
        severity: delta < -0.75 ? 'critical' : 'warning',
        details: {
          baseline_window: { start: baselineStart, end: baselineEnd },
          baseline_samples: baselineRows.length,
        },
      });
    }
  }

  if (inserts.length > 0) {
    const { error: upsertErr } = await supabase
      .from('analytics_anomalies')
      .upsert(inserts as any, { onConflict: 'account_id,detected_on,metric' });
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - startedAt,
    accounts_checked: accounts.length,
    anomalies_recorded: inserts.length,
  });
}
