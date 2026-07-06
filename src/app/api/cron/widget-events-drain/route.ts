import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redisLPopCount, redisLLen } from '@/lib/redis';
import { bufferKey } from '@/lib/analytics/widget-events';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  return (req.headers.get('authorization') || '') === `Bearer ${process.env.CRON_SECRET}`;
}

const BATCH = 500;      // events per LPOP round
const MAX_ROUNDS = 40;  // hard ceiling per invocation (≤20k events)

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  let inserted = 0, rounds = 0;
  try {
    for (; rounds < MAX_ROUNDS; rounds++) {
      const raw = await redisLPopCount(bufferKey(), BATCH);
      if (raw.length === 0) break;
      const rows = raw.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      if (rows.length === 0) continue;
      // Ignore duplicates via the (account_id,event_uid,created_at) unique index.
      const { error } = await supabase.from('widget_events').upsert(rows, {
        onConflict: 'account_id,event_uid,created_at', ignoreDuplicates: true,
      });
      if (error) { console.error('[cron/widget-events-drain] insert:', error.message); break; }
      inserted += rows.length;
    }
    const remaining = await redisLLen(bufferKey());
    return NextResponse.json({ ok: true, inserted, rounds, remaining, duration_ms: Date.now() - started });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'drain_failed', inserted }, { status: 500 });
  }
}
