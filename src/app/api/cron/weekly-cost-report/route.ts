/**
 * GET /api/cron/weekly-cost-report — Sunday 08:00 Israel time (05:00 UTC).
 *
 * Mails the week's cost per conversation to the people who price on it. It sends on every
 * outcome, including a week with no traffic and a week whose query broke: a cron that goes
 * silent is indistinguishable from a quiet week, which is how `conversation_analysis_runs`
 * stayed empty for months with nobody noticing.
 *
 * `as_of=YYYY-MM-DD` replays the week that closed before that date, so a past week can be run
 * for verification; pair it with `send_email=0` to build the report without mailing anyone.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runWeeklyCostReport } from '@/lib/costs/weekly-report';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const asOf = req.nextUrl.searchParams.get('as_of');
  const now = asOf && !Number.isNaN(Date.parse(asOf)) ? new Date(asOf) : undefined;
  const sendEmail = req.nextUrl.searchParams.get('send_email') !== '0';

  const result = await runWeeklyCostReport({ now, sendEmail });

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    error: result.error,
    week: result.report ? { start: result.report.weekStart, end: result.report.weekEnd } : undefined,
    summary: result.report
      ? {
          costUsd: result.report.week.costUsd,
          conversations: result.report.week.conversations,
          usdPerConversation: result.report.week.usdPerConversation,
          allTimeUsdPerConversation: result.report.allTime.usdPerConversation,
        }
      : undefined,
  }, { status: result.ok ? 200 : 500 });
}
