/**
 * Debug endpoint: returns pipeline metrics aggregator state.
 * Protected by CRON_SECRET; open in development.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedSummary, getRawHistory, resetAggregator } from '@/lib/metrics/pipeline-metrics';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get('raw') === '1';

  return NextResponse.json({
    summary: getAggregatedSummary(),
    ...(raw ? { raw: getRawHistory() } : {}),
  });
}

export async function DELETE(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  resetAggregator();
  return NextResponse.json({ ok: true, message: 'Aggregator reset' });
}
