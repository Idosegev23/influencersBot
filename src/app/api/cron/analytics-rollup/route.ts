/**
 * Daily analytics rollup. Re-computes the past 3 days' worth of
 * `analytics_daily_rollup` rows from raw tables (chat_visits, chat_sessions,
 * events). Idempotent UPSERT on (account_id, date, ref_source, device) —
 * safe to re-run.
 *
 * Why 3 days: late-arriving events (mobile offline → online flush) can
 * land hours after the activity. Rolling a 3-day window catches them.
 *
 * Auth: CRON_SECRET via Authorization: Bearer.
 *
 * Schedule: daily 03:00 UTC (vercel.json).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.rpc('analytics_daily_rollup_run', {
      window_days: 3,
    });
    if (error) {
      console.error('[cron/analytics-rollup] RPC error:', error.message);
      return NextResponse.json(
        { error: 'rollup_failed', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      rows_affected: data,
    });
  } catch (e: any) {
    console.error('[cron/analytics-rollup] error:', e);
    return NextResponse.json({ error: e?.message || 'rollup_failed' }, { status: 500 });
  }
}
