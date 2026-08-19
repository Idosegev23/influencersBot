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
  // Default to today; ?day=YYYY-MM-DD lets us re-run a past day. The upsert is
  // keyed on (account_id, date, channel), so re-running is always safe.
  const day = req.nextUrl.searchParams.get('day')
    || new Date().toISOString().slice(0, 10);
  try {
    const result = await rollupAccountHealth(day);
    return NextResponse.json({ ok: true, day, ...result });
  } catch (e: any) {
    console.error('[cron/account-health-rollup]', e?.message);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
