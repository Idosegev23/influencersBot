import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  return (req.headers.get('authorization') || '') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  const { data, error } = await supabase.rpc('widget_rollup_run', { window_days: 3 });
  if (error) {
    console.error('[cron/widget-rollup] RPC error:', error.message);
    return NextResponse.json({ error: 'rollup_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows_upserted: data, duration_ms: Date.now() - started });
}
