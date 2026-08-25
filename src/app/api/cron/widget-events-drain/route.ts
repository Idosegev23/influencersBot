import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redisLRange, redisLTrim, redisLLen, redisSetNx, redisDel, redisRPush, redisSet, redisGet } from '@/lib/redis';
import { bufferKey, stripLoneSurrogates } from '@/lib/analytics/widget-events';
import { drainBatch, quarantineKey } from '@/lib/analytics/drain-batch';
import { sendAdminAlert } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  return (req.headers.get('authorization') || '') === `Bearer ${process.env.CRON_SECRET}`;
}

const BATCH = 500;      // events per peek round
const MAX_ROUNDS = 40;  // hard ceiling per invocation (≤20k events)

/**
 * Backlog past which we stop assuming this is a busy hour and start assuming
 * something is broken. Steady state is a few hundred; the 2026-08-19 blockage
 * sat at 248,532 for six days before anyone looked.
 */
const BACKLOG_ALERT_THRESHOLD = 25_000;
/** One alert per this window, so a stuck queue does not mail every minute. */
const ALERT_COOLDOWN_SECONDS = 6 * 3600;
const ALERT_KEY = 'wev:drain:alerted';

async function alertOnce(subject: string, message: string, details: string) {
  try {
    if (await redisGet(ALERT_KEY)) return;
    await redisSet(ALERT_KEY, '1', ALERT_COOLDOWN_SECONDS);
    await sendAdminAlert({ level: 'critical', subject, message, details });
  } catch (e) {
    // An alert that cannot be sent must not take the drain down with it.
    console.error('[cron/widget-events-drain] alert failed:', e);
  }
}

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
  // trimming after the batch is accounted for makes this at-least-once; the
  // (account_id,event_uid,created_at) unique index (non-partial as of migration 058)
  // makes re-processing a left-behind batch on the next run a safe no-op via
  // ignoreDuplicates.
  //
  // What is NOT done here any more: breaking out and leaving the batch in place when
  // an insert fails. That is what happened on 2026-08-19 — one row carrying an
  // unpaired UTF-16 surrogate (legal JSON, illegal Postgres text) was retried every
  // minute for six days while 248,532 events piled up behind it and the Redis list
  // hit Upstash's 100 MiB per-key ceiling, after which every widget event was dropped
  // on the floor. Refusing to lose one row lost them all. Now a row the database
  // refuses is quarantined with its reason and the queue keeps moving.
  let inserted = 0, rounds = 0, quarantined = 0;
  try {
    for (; rounds < MAX_ROUNDS; rounds++) {
      const raw = await redisLRange(bufferKey(), 0, BATCH - 1);   // peek, do NOT remove yet
      if (raw.length === 0) break;
      // Entries that fail to parse are intentionally trimmed below along with the rest of
      // the batch — this is deliberate GC of unparseable garbage, not accidental data loss.
      const rows = raw
        .map((s) => { try { return JSON.parse(s); } catch { return null; } })
        .filter(Boolean)
        // Belt to the ingest route's braces: widget.js versions cached in visitors'
        // browsers for weeks may still be producing rows the ingest sanitiser never saw.
        .map((r) => stripLoneSurrogates(r));

      if (rows.length > 0) {
        const res = await drainBatch(rows, async (batch) => {
          const { error } = await supabase.from('widget_events').upsert(batch, {
            onConflict: 'account_id,event_uid,created_at', ignoreDuplicates: true,
          });
          return error ? { ok: false, error: error.message } : { ok: true };
        });
        inserted += res.inserted;
        if (res.quarantined.length > 0) {
          quarantined += res.quarantined.length;
          console.error(
            '[cron/widget-events-drain] quarantined', res.quarantined.length,
            'row(s):', res.quarantined[0].reason,
          );
          await redisRPush(quarantineKey(), res.quarantined.map((q) => JSON.stringify(q)));
          await alertOnce(
            'Widget events: rows the database refused',
            `${res.quarantined.length} widget event row(s) could not be stored and were quarantined.`,
            `First reason: ${res.quarantined[0].reason}\nInspect the Redis list "${quarantineKey()}".`,
          );
        }
      }
      // Everything in this slice is now either stored or quarantined, so it is safe
      // to remove — and removing it is what keeps the queue moving.
      await redisLTrim(bufferKey(), raw.length, -1);
    }

    const remaining = await redisLLen(bufferKey());
    // A backlog this size means the drain is not keeping up, or is not running.
    // Six days of HTTP 500 every minute went unnoticed in August because nothing
    // watched the exit code; this makes the queue itself raise its hand.
    if (remaining > BACKLOG_ALERT_THRESHOLD) {
      await alertOnce(
        'Widget events backlog is not draining',
        `${remaining.toLocaleString()} events are queued in Redis.`,
        `Inserted ${inserted} this run across ${rounds} round(s). ` +
        `Upstash refuses writes to a single key past 100 MiB — at roughly 250,000 events ` +
        `the queue stops accepting and every widget event is dropped.`,
      );
    }

    return NextResponse.json({
      ok: true, inserted, rounds, quarantined, remaining, duration_ms: Date.now() - started,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'drain_failed', inserted }, { status: 500 });
  } finally {
    await redisDel(LOCK_KEY);
  }
}
