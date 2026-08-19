import { NextRequest, NextResponse } from 'next/server';
import { rollupAccountHealth } from '@/lib/health/rollup';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  return (req.headers.get('authorization') || '') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Default to YESTERDAY — the last fully-completed day — not today. Every
  // window in account_health_facts is anchored at (p_day + 1)::timestamptz
  // (tomorrow midnight relative to p_day) and assumes p_day is settled: at
  // this cron's 03:15 UTC run, "today" has only had ~3 hours of traffic, so
  // a `day` default of today permanently captured ~3 hours of data for that
  // date (measured 2026-08-18: 2 widget_loaded events by 03:15 vs 934 for the
  // full day) — erroring thresholds never tripped and silent fired ~21h
  // early. House precedent (src/app/api/cron/analytics-rollup/route.ts)
  // recomputes a trailing window for late arrivals; this cron computes one
  // day at a time instead (rollupAccountHealth takes a single `day`), so the
  // fix is a completed anchor day, not a wider window. ?day=YYYY-MM-DD still
  // overrides for manual backfill/re-runs; the upsert is keyed on
  // (account_id, date, channel), so re-running is always safe.
  const day = req.nextUrl.searchParams.get('day')
    || (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();
  try {
    const result = await rollupAccountHealth(day);
    return NextResponse.json({ ok: true, day, ...result });
  } catch (e: any) {
    console.error('[cron/account-health-rollup]', e?.message);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
