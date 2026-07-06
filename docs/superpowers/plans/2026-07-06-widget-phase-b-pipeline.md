# Widget Phase B — Scalable Ingest + Rollup Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a dedicated, scalable widget-behavioral pipeline — partitioned raw store fed through a Redis buffer, drained by cron, rolled up into per-visit and per-day tables the dashboard reads — plus the widget.js collectors that produce the Tier-B behavioral signals.

**Architecture:** `widget.js collectors → POST /api/widget/events → Upstash Redis list buffer → drain cron (bulk insert) → widget_events (monthly-partitioned raw, 90d) → rollup cron → widget_sessions + widget_daily_stats`. All widget events (existing funnel + new behavioral) route through the new endpoint into `widget_events`, superseding the `mode='widget'` rows in the legacy `events` table; the admin RPC's engagement source is repointed to `widget_events` so the Phase-A dashboard keeps working.

**Tech Stack:** Postgres native RANGE partitioning + PL/pgSQL functions (migrations via `mcp__supabase__apply_migration`), Upstash Redis lists (`@/lib/redis`), Next.js route handlers + Vercel crons (`CRON_SECRET` bearer auth, registered in `vercel.json`), Vitest, vanilla `public/widget.js`.

## Global Constraints

- **Privacy (anonymous + PII masking):** rows carry `anon_id` only; hash IP (reuse `hashIp` from `@/lib/analytics/server-ingest`); the `click` collector records element tag/text/href but NEVER input values; strip query string from `path`; `cart_state` stores product ids + counts + value, never customer identity.
- **Retention:** raw `widget_events` kept 90 days via monthly partition DROP; `widget_sessions` + `widget_daily_stats` are permanent.
- **Cross-origin:** `/api/widget/events` MUST answer `OPTIONS` + echo `getCorsHeaders(origin)` on all responses (per-route local helper, mirror `src/app/api/widget/chat/route.ts:15-53`). Verify the widget token via `verifyWidgetToken` from `@/lib/analytics/widget-token`.
- **Cron auth:** every cron route checks `authHeader === 'Bearer ' + process.env.CRON_SECRET` (mirror `src/app/api/cron/analytics-rollup/route.ts:21-23`), `export const runtime='nodejs'`, `export const maxDuration=300`, and is registered in `vercel.json` `crons`.
- **Rollup idempotency:** `widget_rollup_run(window_days int)` recomputes the trailing window with UPSERT — safe to re-run (mirror `analytics_daily_rollup_run`).
- **Redis degradation:** if Redis is unavailable (`getClient()` null), the ingest endpoint returns 204 without throwing (events are best-effort; never 500 the widget).
- **Git:** commit each task straight to `main` and push; stage ONLY that task's files; `public/widget.js` has pre-existing unrelated uncommitted hunks that must NEVER be staged (`git add <path>` explicitly, never `-A`/`.`). Commit co-author line: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Account under test:** `argania_group` = `c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1`.
- **Migration numbering:** next free prefix is `055` (highest existing is `054`). Use sequential prefixes; verify no collision with `ls supabase/migrations/` before naming.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/055_widget_events_partitioned.sql` | Partitioned raw table + partition mgmt functions | Create |
| `supabase/migrations/056_widget_rollups.sql` | `widget_sessions`, `widget_daily_stats`, `widget_rollup_state`, `widget_rollup_run` RPC | Create |
| `supabase/migrations/057_widget_summary_read_widget_events.sql` | Repoint `widget_analytics_summary` engagement to `widget_events` | Create |
| `src/lib/redis.ts` | Add list buffer helpers (`redisRPush`, `redisLPopCount`, `redisLLen`) | Modify |
| `src/lib/analytics/widget-events.ts` | Event taxonomy allow-list + row normalization for the new pipeline | Create |
| `tests/unit/widget/widget-events-validate.test.ts` | Validation/normalization unit tests | Create |
| `src/app/api/widget/events/route.ts` | Ingest edge: token+schema → Redis buffer → 204 | Create |
| `tests/unit/widget/widget-events-cors.test.ts` | OPTIONS/CORS on the ingest route | Create |
| `src/app/api/cron/widget-events-drain/route.ts` | Drain buffer → bulk insert widget_events | Create |
| `src/app/api/cron/widget-rollup/route.ts` | Call `widget_rollup_run(3)` | Create |
| `src/app/api/cron/widget-partitions/route.ts` | Ensure next partition + drop >90d | Create |
| `vercel.json` | Register the 3 new crons | Modify |
| `public/widget.js` | Behavioral collectors + send to `/api/widget/events` | Modify |

**Build order rationale:** DB first (Tasks 1-3) so downstream code has real tables; then Redis helpers (4) and the ingest endpoint (5) that produces buffer entries; then the crons that consume them (6-8); then the collectors (9) that produce real traffic end-to-end.

---

## Task 1: Partitioned `widget_events` table + partition management

**Files:** Create `supabase/migrations/055_widget_events_partitioned.sql`

**Interfaces:**
- Produces: table `widget_events` (partitioned); functions `widget_events_ensure_partitions()`, `widget_events_drop_old_partitions(retention_days int)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/055_widget_events_partitioned.sql
CREATE TABLE IF NOT EXISTS widget_events (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  account_id  uuid NOT NULL,
  anon_id     text,
  session_id  uuid,
  event_uid   text,               -- client-generated dedupe key
  type        text NOT NULL,
  path        text,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS widget_events_acct_time_type
  ON widget_events (account_id, created_at DESC, type);
-- dedupe support for the drain worker (per-account within a partition)
CREATE UNIQUE INDEX IF NOT EXISTS widget_events_uid_uniq
  ON widget_events (account_id, event_uid, created_at)
  WHERE event_uid IS NOT NULL;

-- Create a month partition for a given date if absent.
CREATE OR REPLACE FUNCTION widget_events_ensure_partition(p_month date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  start_ts date := date_trunc('month', p_month);
  end_ts   date := (date_trunc('month', p_month) + interval '1 month');
  part     text := 'widget_events_' || to_char(start_ts, 'YYYYMM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF widget_events FOR VALUES FROM (%L) TO (%L)',
      part, start_ts, end_ts);
  END IF;
END $$;

-- Ensure current + next month exist (called nightly + at deploy).
CREATE OR REPLACE FUNCTION widget_events_ensure_partitions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM widget_events_ensure_partition(current_date);
  PERFORM widget_events_ensure_partition((current_date + interval '1 month')::date);
END $$;

-- Drop partitions whose whole month is older than retention_days.
CREATE OR REPLACE FUNCTION widget_events_drop_old_partitions(retention_days int DEFAULT 90)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r record; dropped int := 0; cutoff date := current_date - retention_days;
BEGIN
  FOR r IN
    SELECT c.relname,
           to_date(right(c.relname, 6), 'YYYYMM') AS part_month
    FROM pg_class c JOIN pg_inherits i ON i.inhrelid = c.oid
    WHERE i.inhparent = 'widget_events'::regclass
  LOOP
    IF (r.part_month + interval '1 month')::date <= cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS %I', r.relname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END $$;

SELECT widget_events_ensure_partitions();
```

- [ ] **Step 2: Apply + verify partitions exist**

Apply via `mcp__supabase__apply_migration` (name `widget_events_partitioned`). Verify:
```sql
SELECT c.relname FROM pg_class c JOIN pg_inherits i ON i.inhrelid=c.oid
WHERE i.inhparent='widget_events'::regclass ORDER BY 1;
```
Expected: two partitions `widget_events_YYYYMM` for the current + next month.

- [ ] **Step 3: Smoke-test insert + dedupe index**
```sql
INSERT INTO widget_events (account_id, anon_id, event_uid, type, path)
VALUES ('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1','aw_test','uid1','page_view','/');
-- second insert with same (account_id,event_uid,created_at) must not duplicate on drain;
SELECT count(*) FROM widget_events WHERE anon_id='aw_test';
DELETE FROM widget_events WHERE anon_id='aw_test';
```
Expected: 1 row, then cleaned up.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/055_widget_events_partitioned.sql
git commit -m "feat(widget-pipeline): partitioned widget_events table + partition mgmt functions"
```

---

## Task 2: Rollup tables + `widget_rollup_run` RPC

**Files:** Create `supabase/migrations/056_widget_rollups.sql`

**Interfaces:**
- Consumes: `widget_events` (Task 1).
- Produces: tables `widget_sessions`, `widget_daily_stats`, `widget_rollup_state`; RPC `widget_rollup_run(window_days int) RETURNS int` (rows upserted).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/056_widget_rollups.sql
CREATE TABLE IF NOT EXISTS widget_sessions (
  account_id   uuid NOT NULL,
  anon_id      text NOT NULL,
  session_key  text NOT NULL,           -- anon_id + '#' + first_seen epoch
  first_seen   timestamptz NOT NULL,
  last_seen    timestamptz NOT NULL,
  duration_sec int NOT NULL DEFAULT 0,
  page_count   int NOT NULL DEFAULT 0,
  max_scroll_pct int NOT NULL DEFAULT 0,
  product_views int NOT NULL DEFAULT 0,
  cart_max_value numeric NOT NULL DEFAULT 0,
  opened_widget bool NOT NULL DEFAULT false,
  sent_message  bool NOT NULL DEFAULT false,
  message_count int NOT NULL DEFAULT 0,
  entry_path   text,
  exit_path    text,
  PRIMARY KEY (account_id, session_key)
);

CREATE TABLE IF NOT EXISTS widget_daily_stats (
  account_id uuid NOT NULL,
  day        date NOT NULL,
  sessions   int NOT NULL DEFAULT 0,
  unique_visitors int NOT NULL DEFAULT 0,
  widget_opens int NOT NULL DEFAULT 0,
  messages   int NOT NULL DEFAULT 0,
  product_views int NOT NULL DEFAULT 0,
  add_to_carts int NOT NULL DEFAULT 0,
  avg_scroll_pct int NOT NULL DEFAULT 0,
  avg_duration_sec int NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE IF NOT EXISTS widget_rollup_state (
  id int PRIMARY KEY DEFAULT 1,
  last_run_at timestamptz,
  CHECK (id = 1)
);
INSERT INTO widget_rollup_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Recompute sessions + daily stats for the trailing window. Gap-based
-- sessionization: a >30min gap between an anon_id's events starts a new
-- session_key. Idempotent UPSERT (mirror analytics_daily_rollup_run).
CREATE OR REPLACE FUNCTION widget_rollup_run(window_days int DEFAULT 3)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  since timestamptz := now() - make_interval(days => window_days);
  n int := 0;
BEGIN
  -- 1) assign session_key via 30-min gap sessionization
  WITH ordered AS (
    SELECT *,
      CASE WHEN lag(created_at) OVER w IS NULL
                OR created_at - lag(created_at) OVER w > interval '30 minutes'
           THEN 1 ELSE 0 END AS is_new
    FROM widget_events
    WHERE created_at >= since AND anon_id IS NOT NULL
    WINDOW w AS (PARTITION BY account_id, anon_id ORDER BY created_at)
  ),
  keyed AS (
    SELECT *,
      account_id::text || '#' || anon_id || '#' ||
      extract(epoch FROM max(created_at) FILTER (WHERE is_new = 1)
              OVER (PARTITION BY account_id, anon_id ORDER BY created_at))::bigint AS session_key
    FROM ordered
  ),
  sess AS (
    SELECT account_id, anon_id, session_key,
      min(created_at) AS first_seen, max(created_at) AS last_seen,
      greatest(0, extract(epoch FROM max(created_at)-min(created_at))::int) AS duration_sec,
      count(*) FILTER (WHERE type='page_view') AS page_count,
      coalesce(max((payload->>'pct')::int) FILTER (WHERE type='scroll_depth'),0) AS max_scroll_pct,
      count(*) FILTER (WHERE type='product_view') AS product_views,
      coalesce(max((payload->>'value')::numeric) FILTER (WHERE type='cart_state'),0) AS cart_max_value,
      bool_or(type='widget_opened') AS opened_widget,
      bool_or(type='widget_message_sent') AS sent_message,
      count(*) FILTER (WHERE type='widget_message_sent') AS message_count,
      (array_agg(path ORDER BY created_at) FILTER (WHERE path IS NOT NULL))[1] AS entry_path,
      (array_agg(path ORDER BY created_at DESC) FILTER (WHERE path IS NOT NULL))[1] AS exit_path
    FROM keyed GROUP BY account_id, anon_id, session_key
  ),
  up_sessions AS (
    INSERT INTO widget_sessions AS s
      (account_id, anon_id, session_key, first_seen, last_seen, duration_sec,
       page_count, max_scroll_pct, product_views, cart_max_value, opened_widget,
       sent_message, message_count, entry_path, exit_path)
    SELECT account_id, anon_id, session_key, first_seen, last_seen, duration_sec,
       page_count, max_scroll_pct, product_views, cart_max_value, opened_widget,
       sent_message, message_count, entry_path, exit_path FROM sess
    ON CONFLICT (account_id, session_key) DO UPDATE SET
      last_seen=excluded.last_seen, duration_sec=excluded.duration_sec,
      page_count=excluded.page_count, max_scroll_pct=excluded.max_scroll_pct,
      product_views=excluded.product_views, cart_max_value=excluded.cart_max_value,
      opened_widget=excluded.opened_widget, sent_message=excluded.sent_message,
      message_count=excluded.message_count, exit_path=excluded.exit_path
    RETURNING 1
  )
  SELECT count(*) INTO n FROM up_sessions;

  -- 2) daily stats from the refreshed sessions in the window
  INSERT INTO widget_daily_stats AS d
    (account_id, day, sessions, unique_visitors, widget_opens, messages,
     product_views, add_to_carts, avg_scroll_pct, avg_duration_sec)
  SELECT account_id, first_seen::date AS day,
    count(*), count(DISTINCT anon_id),
    count(*) FILTER (WHERE opened_widget), sum(message_count),
    sum(product_views),
    (SELECT count(*) FROM widget_events e
       WHERE e.account_id=s.account_id AND e.type='cart_change'
         AND e.created_at::date = s.first_seen::date),
    coalesce(avg(max_scroll_pct)::int,0), coalesce(avg(duration_sec)::int,0)
  FROM widget_sessions s
  WHERE first_seen >= since
  GROUP BY account_id, first_seen::date
  ON CONFLICT (account_id, day) DO UPDATE SET
    sessions=excluded.sessions, unique_visitors=excluded.unique_visitors,
    widget_opens=excluded.widget_opens, messages=excluded.messages,
    product_views=excluded.product_views, add_to_carts=excluded.add_to_carts,
    avg_scroll_pct=excluded.avg_scroll_pct, avg_duration_sec=excluded.avg_duration_sec;

  UPDATE widget_rollup_state SET last_run_at = now() WHERE id = 1;
  RETURN n;
END $$;
```

- [ ] **Step 2: Apply + verify with seeded data**

Apply via `mcp__supabase__apply_migration` (name `widget_rollups`). Then seed a tiny two-session fixture and assert the rollup:
```sql
INSERT INTO widget_events (account_id, anon_id, type, path, payload, created_at) VALUES
 ('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1','aw_rt','page_view','/', '{}', now()-interval '5 min'),
 ('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1','aw_rt','scroll_depth','/', '{"pct":80}', now()-interval '4 min'),
 ('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1','aw_rt','widget_opened','/', '{}', now()-interval '3 min');
SELECT widget_rollup_run(1);
SELECT session_key, page_count, max_scroll_pct, opened_widget FROM widget_sessions WHERE anon_id='aw_rt';
SELECT day, sessions, widget_opens FROM widget_daily_stats WHERE account_id='c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1' AND day=current_date;
-- cleanup
DELETE FROM widget_events WHERE anon_id='aw_rt';
DELETE FROM widget_sessions WHERE anon_id='aw_rt';
```
Expected: one `widget_sessions` row with `page_count=1, max_scroll_pct=80, opened_widget=true`; a `widget_daily_stats` row with `widget_opens>=1`.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/056_widget_rollups.sql
git commit -m "feat(widget-pipeline): rollup tables + widget_rollup_run RPC (30-min sessionization, idempotent)"
```

---

## Task 3: Repoint `widget_analytics_summary` engagement to `widget_events`

**Files:** Create `supabase/migrations/057_widget_summary_read_widget_events.sql`

**Interfaces:** Produces: updated `widget_analytics_summary` whose `engagement` reads from `widget_events` (same `{type,count}` shape as Phase A) so the dashboard reflects the new pipeline; all other keys unchanged.

- [ ] **Step 1: Write the migration** — copy the current RPC body (from `054`) verbatim and change ONLY the `engagement` subquery source from `events WHERE mode='widget'` to `widget_events`:

```sql
-- supabase/migrations/057_widget_summary_read_widget_events.sql
CREATE OR REPLACE FUNCTION public.widget_analytics_summary(p_account_id uuid, p_since timestamptz)
RETURNS json LANGUAGE sql STABLE AS $function$
  SELECT json_build_object(
    'rec_total',  (SELECT count(*) FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since),
    'rec_clicks', (SELECT count(*) FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since AND was_clicked),
    'rec_by_product', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT product_name AS name, count(*)::int AS count,
               count(*) FILTER (WHERE was_clicked)::int AS clicks
        FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since
        GROUP BY product_name ORDER BY count(*) DESC LIMIT 15) t),
    'rec_by_strategy', (
      SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM (
        SELECT coalesce(strategy, 'unknown') AS strategy, count(*)::int AS count,
               count(*) FILTER (WHERE was_clicked)::int AS clicks
        FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since
        GROUP BY strategy ORDER BY count(*) DESC) s),
    'session_count', (SELECT count(*) FROM chat_sessions WHERE account_id = p_account_id AND created_at >= p_since),
    'product_count', (SELECT count(*) FROM widget_products WHERE account_id = p_account_id),
    'engagement', (
      SELECT coalesce(json_agg(row_to_json(e)), '[]'::json) FROM (
        SELECT type, count(*)::int AS count
        FROM widget_events
        WHERE account_id = p_account_id AND created_at >= p_since
        GROUP BY type ORDER BY count(*) DESC) e)
  );
$function$;
```

- [ ] **Step 2: Apply + verify** via `mcp__supabase__apply_migration` (name `widget_summary_read_widget_events`). Verify shape unchanged:
```sql
SELECT (widget_analytics_summary('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1', now()-interval '90 days')::jsonb)->'engagement';
```
Expected: `[]` or `{type,count}` rows sourced from `widget_events` (likely empty until collectors ship — that is correct).

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/057_widget_summary_read_widget_events.sql
git commit -m "refactor(widget-analytics): read engagement from widget_events (new pipeline source)"
```

---

## Task 4: Redis list buffer helpers

**Files:** Modify `src/lib/redis.ts`

**Interfaces:** Produces exported async fns: `redisRPush(key: string, items: string[]): Promise<number>` (returns new length, 0 if Redis down), `redisLPopCount(key: string, count: number): Promise<string[]>` (pops up to `count` from the head, `[]` if down/empty), `redisLLen(key: string): Promise<number>`.

- [ ] **Step 1: Add the helpers** near the other operations in `src/lib/redis.ts`:

```typescript
// ============================================
// List Buffer Operations (widget event ingest)
// ============================================

export async function redisRPush(key: string, items: string[]): Promise<number> {
  const client = getClient();
  if (!client || items.length === 0) return 0;
  try {
    return await client.rpush(key, ...items);
  } catch (err) {
    console.error('[Redis] RPUSH error:', err);
    return 0;
  }
}

export async function redisLPopCount(key: string, count: number): Promise<string[]> {
  const client = getClient();
  if (!client || count <= 0) return [];
  try {
    const res = await client.lpop(key, count);
    if (!res) return [];
    return (Array.isArray(res) ? res : [res]).map((x) =>
      typeof x === 'string' ? x : JSON.stringify(x));
  } catch (err) {
    console.error('[Redis] LPOP error:', err);
    return [];
  }
}

export async function redisLLen(key: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  try {
    return await client.llen(key);
  } catch (err) {
    console.error('[Redis] LLEN error:', err);
    return 0;
  }
}
```

- [ ] **Step 2: Write the failing test** `tests/unit/widget/redis-buffer.test.ts` — since these wrap a network client, test the down-path (no env → graceful zero/empty), which is pure:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { redisRPush, redisLPopCount, redisLLen } from '@/lib/redis';

describe('redis buffer helpers (degraded path)', () => {
  beforeAll(() => { delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; });
  it('RPUSH returns 0 when Redis unavailable', async () => { expect(await redisRPush('k', ['a'])).toBe(0); });
  it('LPOP returns [] when Redis unavailable', async () => { expect(await redisLPopCount('k', 5)).toEqual([]); });
  it('LLEN returns 0 when Redis unavailable', async () => { expect(await redisLLen('k')).toBe(0); });
  it('RPUSH of empty array is a no-op 0', async () => { expect(await redisRPush('k', [])).toBe(0); });
});
```

- [ ] **Step 3: Run RED → confirm fail** (`npx vitest run tests/unit/widget/redis-buffer.test.ts`; fails: functions undefined). **Step 4: implement (done in Step 1). Step 5: Run GREEN** — 4/4 pass.

> NOTE: the singleton `redisAvailable` in `redis.ts` latches. Run this test file in isolation so an earlier configured-client test in another file doesn't leak env. If the singleton makes the down-path untestable in-suite, the implementer should report DONE_WITH_CONCERNS and rely on the ingest-route integration check (Task 5 Step 5) instead of forcing a brittle test.

- [ ] **Step 6: Commit**
```bash
git add src/lib/redis.ts tests/unit/widget/redis-buffer.test.ts
git commit -m "feat(widget-pipeline): redis list buffer helpers (rpush/lpop-count/llen) with graceful degradation"
```

---

## Task 5: Ingest endpoint `/api/widget/events`

**Files:** Create `src/lib/analytics/widget-events.ts`, `src/app/api/widget/events/route.ts`, `tests/unit/widget/widget-events-validate.test.ts`, `tests/unit/widget/widget-events-cors.test.ts`

**Interfaces:**
- Consumes: `verifyWidgetToken` (`@/lib/analytics/widget-token`), `redisRPush` (Task 4), `hashIp`/`clientIp` (`@/lib/analytics/server-ingest`).
- Produces: `WIDGET_EVENT_TYPES: Set<string>`, `normalizeWidgetEvents(batch, stamps): NormalizedRow[]` in `widget-events.ts`; `bufferKey(accountId): string` = `wev:buf` (single shared list); `OPTIONS`/`POST` on the route.

- [ ] **Step 1: Write the taxonomy + normalizer** `src/lib/analytics/widget-events.ts`:

```typescript
import type { NextRequest } from 'next/server';

export const WIDGET_EVENT_TYPES = new Set<string>([
  'page_view','session_start','session_end',
  'scroll_depth','time_on_page','exit_intent','tab_visibility',
  'product_view','cart_state','cart_change','checkout_reached','purchase',
  'click','internal_nav','external_link_click',
  // existing funnel events also flow here now
  'widget_loaded','widget_opened','widget_closed','widget_message_sent','widget_message_received',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANON_RE = /^[a-zA-Z0-9_-]{4,64}$/;
const MAX_EVENTS = 50;

export interface NormalizedRow {
  account_id: string; anon_id: string | null; session_id: string | null;
  event_uid: string | null; type: string; path: string | null;
  payload: Record<string, unknown>; created_at: string;
}

// Strip query string (may carry PII) — keep pathname only.
function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string' || !p) return null;
  return p.split('?')[0].slice(0, 512);
}

export function normalizeWidgetEvents(
  raw: any,
  accountId: string,
): { rows: NormalizedRow[]; rejected: number } {
  const rows: NormalizedRow[] = [];
  let rejected = 0;
  const anon = typeof raw?.anonId === 'string' && ANON_RE.test(raw.anonId) ? raw.anonId : null;
  const session = typeof raw?.sessionId === 'string' && UUID_RE.test(raw.sessionId) ? raw.sessionId : null;
  const events = Array.isArray(raw?.events) ? raw.events.slice(0, MAX_EVENTS) : [];
  for (const e of events) {
    if (!e || typeof e.type !== 'string' || !WIDGET_EVENT_TYPES.has(e.type)) { rejected++; continue; }
    const payload = e.payload && typeof e.payload === 'object' ? e.payload : {};
    if (JSON.stringify(payload).length > 4096) { rejected++; continue; }
    const ts = typeof e.ts === 'number' && Number.isFinite(e.ts) ? new Date(e.ts).toISOString() : new Date().toISOString();
    rows.push({
      account_id: accountId, anon_id: anon, session_id: session,
      event_uid: typeof e.uid === 'string' ? e.uid.slice(0, 64) : null,
      type: e.type, path: cleanPath(e.path), payload, created_at: ts,
    });
  }
  return { rows, rejected };
}

export function bufferKey(): string { return 'wev:buf'; }
```

- [ ] **Step 2: Write validation tests** `tests/unit/widget/widget-events-validate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeWidgetEvents, WIDGET_EVENT_TYPES } from '@/lib/analytics/widget-events';

const ACC = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1';

describe('normalizeWidgetEvents', () => {
  it('accepts known types and strips query string from path', () => {
    const { rows, rejected } = normalizeWidgetEvents(
      { anonId: 'aw_abcd', events: [{ type: 'page_view', path: '/p?token=secret', ts: 1 }] }, ACC);
    expect(rejected).toBe(0);
    expect(rows[0].path).toBe('/p');
    expect(rows[0].account_id).toBe(ACC);
  });
  it('rejects unknown event types', () => {
    const { rows, rejected } = normalizeWidgetEvents({ events: [{ type: 'evil_event' }] }, ACC);
    expect(rows.length).toBe(0); expect(rejected).toBe(1);
  });
  it('drops malformed anonId to null', () => {
    const { rows } = normalizeWidgetEvents({ anonId: 'x', events: [{ type: 'click' }] }, ACC);
    expect(rows[0].anon_id).toBeNull();
  });
  it('caps at 50 events', () => {
    const evs = Array.from({ length: 80 }, () => ({ type: 'click' }));
    const { rows } = normalizeWidgetEvents({ events: evs }, ACC);
    expect(rows.length).toBe(50);
  });
});
```

- [ ] **Step 3: Run RED** (`npx vitest run tests/unit/widget/widget-events-validate.test.ts`) → fails (module missing). Then it passes once Step 1 exists.

- [ ] **Step 4: Write the route** `src/app/api/widget/events/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyWidgetToken } from '@/lib/analytics/widget-token';
import { normalizeWidgetEvents, bufferKey } from '@/lib/analytics/widget-events';
import { redisRPush } from '@/lib/redis';

export const runtime = 'nodejs';

function getCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const cors = getCorsHeaders(origin);
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    const verified = verifyWidgetToken(token);
    if (!verified || verified.accountId !== body?.accountId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors });
    }
    const { rows } = normalizeWidgetEvents(body, verified.accountId);
    if (rows.length > 0) {
      // Buffer the batch as one JSON string per event; drain worker parses.
      await redisRPush(bufferKey(), rows.map((r) => JSON.stringify(r)));
    }
    return new Response(null, { status: 204, headers: cors });
  } catch {
    // Never 500 the widget — analytics is best-effort.
    return new Response(null, { status: 204, headers: cors });
  }
}
```

- [ ] **Step 5: Write CORS test** `tests/unit/widget/widget-events-cors.test.ts` (mirror the Phase A pattern):
```typescript
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { OPTIONS } from '@/app/api/widget/events/route';
describe('widget/events CORS', () => {
  it('OPTIONS → 204 + ACAO echo', async () => {
    const req = new NextRequest('https://x/api/widget/events', { method: 'OPTIONS', headers: { origin: 'https://argania-oil.co.il' } });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://argania-oil.co.il');
  });
});
```
Run both new test files → green.

- [ ] **Step 6: Commit**
```bash
git add src/lib/analytics/widget-events.ts src/app/api/widget/events/route.ts tests/unit/widget/widget-events-validate.test.ts tests/unit/widget/widget-events-cors.test.ts
git commit -m "feat(widget-pipeline): /api/widget/events ingest — token+schema → redis buffer, best-effort 204"
```

---

## Task 6: Drain worker cron `/api/cron/widget-events-drain`

**Files:** Create `src/app/api/cron/widget-events-drain/route.ts`; Modify `vercel.json`

**Interfaces:** Consumes `redisLPopCount`/`redisLLen` (Task 4), `bufferKey` (Task 5), the service `supabase` (`@/lib/supabase`). Drains up to a bounded number of events per run, bulk-inserts into `widget_events` with `onConflict` ignore on the dedupe index.

- [ ] **Step 1: Write the route**:

```typescript
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
```

- [ ] **Step 2: Register the cron** in `vercel.json` `crons` array (add one entry; keep existing formatting):
```json
    { "path": "/api/cron/widget-events-drain", "schedule": "* * * * *" }
```

- [ ] **Step 3: Manual verification** (controller, after deploy): POST a valid batch to `/api/widget/events` (with a real signed token), then `curl` the drain route with the `CRON_SECRET` bearer and confirm `inserted>0`; then `SELECT count(*) FROM widget_events WHERE anon_id='<the anon>'`. Note in the report that a signed token is required (controller supplies it).

- [ ] **Step 4: Commit**
```bash
git add src/app/api/cron/widget-events-drain/route.ts vercel.json
git commit -m "feat(widget-pipeline): drain cron — redis buffer → bulk insert widget_events (dedup, bounded)"
```

---

## Task 7: Rollup cron `/api/cron/widget-rollup`

**Files:** Create `src/app/api/cron/widget-rollup/route.ts`; Modify `vercel.json`

**Interfaces:** Calls `widget_rollup_run(3)` (Task 2). Mirror `analytics-rollup/route.ts` exactly.

- [ ] **Step 1: Write the route**:
```typescript
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
```

- [ ] **Step 2: Register the cron** in `vercel.json`:
```json
    { "path": "/api/cron/widget-rollup", "schedule": "*/10 * * * *" }
```

- [ ] **Step 3: Verify** (controller, after deploy): `curl` with `CRON_SECRET` bearer → `{ok:true, rows_upserted:N}`.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/cron/widget-rollup/route.ts vercel.json
git commit -m "feat(widget-pipeline): rollup cron — widget_rollup_run(3) every 10m"
```

---

## Task 8: Partition maintenance cron `/api/cron/widget-partitions`

**Files:** Create `src/app/api/cron/widget-partitions/route.ts`; Modify `vercel.json`

**Interfaces:** Calls `widget_events_ensure_partitions()` + `widget_events_drop_old_partitions(90)` (Task 1).

- [ ] **Step 1: Write the route** (same auth pattern; two RPC calls):
```typescript
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
```
> NOTE: `supabase.rpc` on a `void`-returning function is fine; `ensure.error` is null on success.

- [ ] **Step 2: Register the cron** in `vercel.json`:
```json
    { "path": "/api/cron/widget-partitions", "schedule": "0 3 * * *" }
```

- [ ] **Step 3: Verify** (controller): `curl` with bearer → `{ok:true, partitions_dropped:0}` (0 expected until data ages out).

- [ ] **Step 4: Commit**
```bash
git add src/app/api/cron/widget-partitions/route.ts vercel.json
git commit -m "feat(widget-pipeline): partition-maintenance cron — ensure next month + drop >90d nightly"
```

---

## Task 9: widget.js behavioral collectors → `/api/widget/events`

**Files:** Modify `public/widget.js`

**Interfaces:** Consumes the existing `ANALYTICS_TOKEN`, `ANON_ID`, `sessionId`, `BASE_URL`, and page-context extraction already in `widget.js`. Produces a second batched queue that POSTs `{accountId, token, anonId, sessionId, events:[{type,uid,path,payload,ts}]}` to `/api/widget/events` via `sendBeacon`/`fetch keepalive`.

- [ ] **Step 1: Read the existing analytics plumbing** — `EVENT_QUEUE`, `flushAnalytics`, `widgetTrack`, `ANALYTICS_TOKEN`, `ANON_ID`, `captureWidgetAttribution` (`public/widget.js:377-474`). Reuse the beacon transport; add a parallel `BEHAVIOR_QUEUE` + `flushBehavior()` that hits `BASE_URL + '/api/widget/events'` with the `{token, accountId, anonId, sessionId, events}` envelope. Each event gets a `uid` = `ANON_ID + '_' + Date.now() + '_' + counter` for drain-dedup.

- [ ] **Step 2: Add the collectors** (each wrapped in try/catch — never break the host page; feature-detect before binding):
  - `page_view` on load (path = `location.pathname`, payload `{title, referrer_host}`).
  - `scroll_depth` — throttled (max ~1/2s), emit final max % on `pagehide`.
  - `time_on_page` — accumulate visible time, emit on `pagehide`.
  - `exit_intent` — `mouseout` with `e.clientY <= 0`, once per pageview.
  - `click` — delegated document listener, **sampled** (respect a server `sampling.click` knob from config, default 1.0); payload `{tag, text: (el.textContent||'').slice(0,80), href}` — NEVER read input `.value`.
  - `product_view` — when `extractPageContext().product` present, emit with `{product_name, price, sku}`.
  - `cart_state` — snapshot from page context / dataLayer at load (live cart tracking is Phase C); payload `{item_count, value}`.
  - Flush on `visibilitychange:hidden` + `pagehide` (mirror the existing analytics flush hooks).

- [ ] **Step 3: Route existing funnel events too** — in `widgetTrack`, additionally enqueue the funnel events already whitelisted in `WIDGET_EVENT_TYPES` (`widget_loaded/opened/closed/message_sent/message_received`) into `BEHAVIOR_QUEUE` so the new pipeline is the single source. Keep the existing `/api/analytics/widget` send in place (no data loss during transition; dedupe is by table, not cross-endpoint).

- [ ] **Step 4: Manual e2e verification** (controller, after deploy): load a page with the widget, scroll, click, open the widget; in the Network tab confirm a `POST /api/widget/events` 204 with a well-formed envelope; after the drain cron runs (or a manual drain curl), `SELECT type, count(*) FROM widget_events WHERE account_id='c68ef2bd-...' GROUP BY type` shows `page_view`, `scroll_depth`, `click`, `widget_opened`.

- [ ] **Step 5: Validate JS + commit** — `node --check public/widget.js`, then:
```bash
git add public/widget.js
git commit -m "feat(widget-pipeline): behavioral collectors (page_view/scroll/exit/click/product/cart) → /api/widget/events"
```

---

## Self-Review

**Spec coverage (§6 Ingest, §7 Rollup+retention, §5 data model):**
- §5.1 partitioned `widget_events` → Task 1. §5.2/§5.3 rollups → Task 2. §5.4 taxonomy → Task 5 (`WIDGET_EVENT_TYPES`).
- §6 collector → Task 9; ingest edge → Task 5; Redis buffer → Tasks 4-5; drain worker → Task 6.
- §7 rollup cron → Task 7; partition cron (create-ahead + 90d drop) → Tasks 1+8.
- Dashboard continuity (Phase-A RPC keeps working) → Task 3.
- Privacy masking (path query-strip, no input values, IP hash) → Tasks 5+9 + Global Constraints.

**Placeholder scan:** No TBD/TODO. Controller-supplied signed tokens (Tasks 6/9 verification) and `<the anon>` are explicit runtime inputs, not code gaps.

**Type consistency:** `bufferKey()` defined in Task 5, consumed in Task 6. `redisRPush/redisLPopCount/redisLLen` signatures defined in Task 4, consumed in Tasks 5-6. `normalizeWidgetEvents` return `{rows,rejected}` used by the route. `widget_rollup_run(window_days int)` (Task 2) called with `{window_days:3}` (Task 7). RPC `engagement` `{type,count}` (Task 3) matches the Phase-A route/type already shipped.

**Out of scope (Phase C):** live cart watcher (real-time add-to-cart detection), Trigger Engine, `/api/widget/complementary` AI recs, proactive popup surface. Task 9's `cart_state` is a passive load-time snapshot only.

**Known risks (flagged, not blocking):** (1) `widget_rollup_run` sessionization SQL is the most complex artifact — Task 2 Step 2's seeded assertion is the guard; (2) the `redis.ts` `redisAvailable` singleton can make the down-path test order-dependent (Task 4 note); (3) dual-send in Task 9 Step 3 temporarily writes widget funnel events to both `events` and `widget_events` — acceptable during transition, removed when #3 dashboard fully cuts over.
