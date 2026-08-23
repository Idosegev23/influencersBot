/**
 * GET /api/cron/weekly-conversation-report — Sunday 06:00 UTC, stage 3.
 *
 * `as_of=YYYY-MM-DD` replays the week that closed before that date, which is
 * how past weeks are backfilled so week-over-week comparison works on day one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runWeeklyReport } from '@/lib/conversation-analytics/weekly';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get('account_id');
  const asOf = req.nextUrl.searchParams.get('as_of');
  const now = asOf && !Number.isNaN(Date.parse(asOf)) ? new Date(asOf) : undefined;

  const { data: accounts } = await supabase.from('accounts').select('id, config').eq('status', 'active');

  const targets = (accounts || []).filter((a: any) =>
    (!accountId || a.id === accountId) &&
    a.config?.isDemo !== true &&
    a.config?.conversation_analytics?.enabled === true);

  const results: any[] = [];
  for (const a of targets) {
    try {
      results.push({ accountId: a.id, ...(await runWeeklyReport({ accountId: a.id, now })) });
    } catch (e: any) {
      console.error('[weekly-conversation-report]', a.id, e?.message || e);
      results.push({ accountId: a.id, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
