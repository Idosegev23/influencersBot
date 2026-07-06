import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redisLRange, redisLTrim, redisLLen, redisSetNx, redisDel } from '@/lib/redis';
import { bufferKey } from '@/lib/analytics/widget-events';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  return (req.headers.get('authorization') || '') === `Bearer ${process.env.CRON_SECRET}`;
}

const BATCH = 500;      // events per peek round
const MAX_ROUNDS = 40;  // hard ceiling per invocation (≤20k events)

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  // Mutex: this cron runs every minute but maxDuration=300, so overlapping invocations
  // can both LRANGE the same batch, both upsert (harmlessly deduped), then each LTRIM
  // a *different* slice — silently dropping whichever batch the other invocation never
  // read. A short-lived NX lock ensures only one drain runs at a time.
  const LOCK_KEY = 'wev:drain:lock';
  const gotLock = await redisSetNx(LOCK_KEY, String(started), 55); // ~1 cron interval
  if (!gotLock) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'drain already running' });
  }
  // Peek-then-trim (not LPOP-then-insert): removing before a successful insert would
  // permanently drop the batch on any insert failure (at-most-once). Peeking and only
  // trimming after a confirmed insert makes this at-least-once; the (account_id,event_uid,
  // created_at) unique index (non-partial as of migration 058) makes re-processing a
  // left-behind batch on the next run a safe no-op via ignoreDuplicates.
  let inserted = 0, rounds = 0, degraded = false;
  try {
    for (; rounds < MAX_ROUNDS; rounds++) {
      const raw = await redisLRange(bufferKey(), 0, BATCH - 1);   // peek, do NOT remove yet
      if (raw.length === 0) break;
      // Entries that fail to parse are intentionally trimmed below along with the rest of
      // the batch — this is deliberate GC of unparseable garbage, not accidental data loss.
      const rows = raw.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      if (rows.length > 0) {
        const { error } = await supabase.from('widget_events').upsert(rows, {
          onConflict: 'account_id,event_uid,created_at', ignoreDuplicates: true,
        });
        if (error) {
          // Leave the batch in the buffer for the next run — never lose events.
          console.error('[cron/widget-events-drain] insert:', error.message);
          degraded = true;
          break;
        }
        inserted += rows.length;
      }
      // Only remove what we successfully persisted.
      await redisLTrim(bufferKey(), raw.length, -1);
    }
    const remaining = await redisLLen(bufferKey());
    return NextResponse.json({ ok: !degraded, degraded, inserted, rounds, remaining, duration_ms: Date.now() - started }, { status: degraded ? 500 : 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'drain_failed', inserted }, { status: 500 });
  } finally {
    await redisDel(LOCK_KEY);
  }
}
