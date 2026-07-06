import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

function verifyCron(req: NextRequest): boolean {
  return (req.headers.get('authorization') || '') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const ensure = await supabase.rpc('widget_events_ensure_partitions');
  if (ensure.error) return NextResponse.json({ error: ensure.error.message }, { status: 500 });
  const drop = await supabase.rpc('widget_events_drop_old_partitions', { retention_days: 90 });
  if (drop.error) return NextResponse.json({ error: drop.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, partitions_dropped: drop.data });
}
