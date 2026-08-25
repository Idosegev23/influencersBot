#!/usr/bin/env node
/**
 * One-off recovery for the widget_events buffer blockage of 2026-08-19.
 *
 * A single `click` event captured form text that was truncated mid-emoji,
 * leaving a lone UTF-16 surrogate. That is legal JSON but illegal Postgres
 * text, so PostgREST rejected the whole 500-row batch with PGRST102. The
 * drain's peek -> insert -> break-on-error -> never-trim design then blocked
 * the queue permanently: 248,532 events backed up, the list hit Upstash's
 * 100 MiB per-key ceiling on 2026-08-21, and every widget behavioural event
 * has been dropped on the floor since.
 *
 * This drains the backlog with the same sanitiser the ingest route now
 * applies, and quarantines anything Postgres still refuses instead of
 * letting it block the queue again.
 *
 * Usage:  node scripts/recover-widget-events-buffer.mjs [--dry-run]
 */
import { readFileSync } from 'node:fs';

// ---- env -------------------------------------------------------------------
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!REDIS_URL || !REDIS_TOKEN || !SUPA_URL || !SUPA_KEY) {
  console.error('missing env: need UPSTASH_REDIS_REST_URL/TOKEN and NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY');
  process.exit(1);
}

const DRY = process.argv.includes('--dry-run');
const BUF = 'wev:buf';
const QUARANTINE = 'wev:quarantine';
const LOCK = 'wev:drain:lock';
const BATCH = 500;

// ---- redis -----------------------------------------------------------------
async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(`redis ${cmd[0]}: ${j.error}`);
  return j.result;
}

// ---- the sanitiser ---------------------------------------------------------
/**
 * Strip lone UTF-16 surrogates. A well-formed pair is left alone, so real
 * emoji survive; only the orphaned half of a pair that a naive .slice() left
 * behind is removed. Nothing else about the text is touched — the content is
 * kept, it is only made storable.
 */
function stripLoneSurrogates(value) {
  if (typeof value === 'string') {
    return value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  }
  if (Array.isArray(value)) return value.map(stripLoneSurrogates);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[stripLoneSurrogates(k)] = stripLoneSurrogates(value[k]);
    return out;
  }
  return value;
}

// ---- postgrest -------------------------------------------------------------
async function upsert(rows) {
  const r = await fetch(
    `${SUPA_URL}/rest/v1/widget_events?on_conflict=account_id,event_uid,created_at`,
    {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    },
  );
  if (r.ok) return { ok: true };
  return { ok: false, status: r.status, body: (await r.text()).slice(0, 300) };
}

/** Find and quarantine the individual rows Postgres still refuses. */
async function isolateBad(rows) {
  const bad = [];
  const good = [];
  for (const row of rows) {
    const res = await upsert([row]);
    if (res.ok) good.push(row);
    else bad.push({ row, reason: res.body });
  }
  return { good, bad };
}

// ---- main ------------------------------------------------------------------
const started = Date.now();
const gotLock = await redis(['SET', LOCK, `recover-${started}`, 'NX', 'EX', '900']);
if (gotLock !== 'OK') {
  console.error('another drain holds the lock; try again in a minute');
  process.exit(1);
}

let total = 0, inserted = 0, quarantined = 0, batches = 0;
try {
  total = await redis(['LLEN', BUF]);
  console.log(`buffer holds ${total.toLocaleString()} events${DRY ? ' (dry run)' : ''}`);

  for (;;) {
    const raw = await redis(['LRANGE', BUF, 0, BATCH - 1]);
    if (!raw || raw.length === 0) break;

    const rows = [];
    for (const s of raw) {
      try { rows.push(stripLoneSurrogates(JSON.parse(s))); }
      catch { /* unparseable garbage is dropped with the batch, as the drain intends */ }
    }

    if (rows.length) {
      let res = await upsert(rows);
      if (!res.ok) {
        // Sanitising was not enough — isolate the offenders so one row can
        // never again hold the whole queue hostage.
        console.log(`  batch ${batches} rejected (${res.status}); isolating…`);
        const { good, bad } = await isolateBad(rows);
        if (good.length) await upsert(good);
        for (const b of bad) {
          if (!DRY) await redis(['RPUSH', QUARANTINE, JSON.stringify(b)]);
          quarantined++;
        }
        inserted += good.length;
      } else {
        inserted += rows.length;
      }
    }

    if (DRY) { console.log('dry run: stopping after one batch'); break; }
    await redis(['LTRIM', BUF, raw.length, -1]);
    batches++;
    if (batches % 20 === 0) {
      const left = await redis(['LLEN', BUF]);
      console.log(`  ${inserted.toLocaleString()} inserted, ${left.toLocaleString()} left`);
    }
  }

  const remaining = await redis(['LLEN', BUF]);
  console.log(
    `\ndone in ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
    `inserted ${inserted.toLocaleString()}, quarantined ${quarantined}, remaining ${remaining}`,
  );
  if (quarantined) console.log(`quarantined rows are in the redis list "${QUARANTINE}"`);
} finally {
  await redis(['DEL', LOCK]);
}
