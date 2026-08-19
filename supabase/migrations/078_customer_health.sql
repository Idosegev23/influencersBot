-- Migration 078: Customer usage observability — install detection + health board.
-- Spec: docs/superpowers/specs/2026-08-19-customer-usage-observability-design.md §3
-- Plan: docs/superpowers/plans/2026-08-19-customer-usage-observability.md Task 1
--
-- NOTE ON account_contracts: this is the FIRST reliable record of who pays us.
-- accounts.plan is 'free' for every account except two demos marked 'pro', and
-- config.isDemo is inconsistent ('true' / 'false' / absent — the three most
-- active real customers all have it absent). Do not "fix" this by inferring
-- from config; inference is what produced that mess. Rows are added by hand.

create table if not exists public.account_contracts (
  account_id        uuid primary key references public.accounts(id) on delete cascade,
  is_paying         boolean not null default true,
  expected_channels text[] not null default '{}',
  contract_start    date,
  contract_end      date,
  trial_end         date,
  owner             text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint account_contracts_channels_valid check (
    expected_channels <@ array['widget','chat_page','whatsapp','instagram']::text[]
  )
);

-- One row per account + origin + DAY. Not per page view.
-- active_minutes is deliberately NOT called "hits": the 60s Redis dedupe window
-- means it counts minutes in which the widget loaded at least once. It saturates
-- at 1440 and says nothing about traffic volume. Traffic comes from
-- widget_events.widget_loaded. Never render this column as traffic.
create table if not exists public.install_pings (
  account_id     uuid not null references public.accounts(id) on delete cascade,
  origin         text not null,
  day            date not null,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  active_minutes int  not null default 1,
  widget_version text,
  sample_path    text,
  primary key (account_id, origin, day)
);

create index if not exists install_pings_acct_day on public.install_pings (account_id, day desc);

-- One row per account per CHANNEL per day — that is what lets a customer be
-- green on WhatsApp and red on the widget at the same time, which is the normal
-- case and the entire reason the checklist is per-channel.
create table if not exists public.account_health_daily (
  account_id       uuid not null references public.accounts(id) on delete cascade,
  date             date not null,
  channel          text not null check (channel in ('widget','chat_page','whatsapp','instagram')),
  status           text not null check (status in ('never_installed','silent','erroring','dormant','live')),
  active_minutes   int not null default 0,
  distinct_origins int not null default 0,
  loads            int not null default 0,
  opens            int not null default 0,
  messages         int not null default 0,
  sessions         int not null default 0,
  leads            int not null default 0,
  errors           int not null default 0,
  cost_usd         numeric(10,4) not null default 0,
  computed_at      timestamptz not null default now(),
  primary key (account_id, date, channel)
);

create index if not exists account_health_daily_date on public.account_health_daily (date desc);

-- 073 posture: RLS with no policies, defense in depth. Every consumer of these
-- tables (install-ping recorder, diagnostics route, nightly rollup, admin health
-- API) uses the service-role client, which bypasses RLS entirely — this blocks
-- nobody today. It only matters if a default-privilege ACL ever reappears (073's
-- KNOWN RESIDUAL note: supabase_admin's own default ACL is not fixed).
alter table public.account_contracts    enable row level security;
alter table public.install_pings        enable row level security;
alter table public.account_health_daily enable row level security;

-- Task 2: recordInstallPing() RPC (src/lib/telemetry/install-ping.ts). Its only
-- caller is the service-role client exported from @/lib/supabase, which already
-- bypasses RLS on its own — so SECURITY DEFINER buys nothing here and only adds
-- an escalation vector (Ruling R9, code review round 1): a definer function on a
-- caller-controlled p_account_id, reachable via PostgREST's default PUBLIC
-- EXECUTE grant, would let any authenticated caller forge install_pings rows for
-- accounts they don't own. Runs SECURITY INVOKER (the default) instead, so a
-- future caller without service-role privileges fails loudly under RLS rather
-- than silently succeeding. search_path is pinned per house style
-- (075_whatsapp_channels.sql:70-98) even though this function doesn't touch
-- non-public schemas, to close the mutable-search_path attack class by default.
create or replace function public.upsert_install_ping(
  p_account_id uuid,
  p_origin text,
  p_widget_version text,
  p_sample_path text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.install_pings
    (account_id, origin, day, first_seen_at, last_seen_at, active_minutes, widget_version, sample_path)
  values
    (p_account_id, p_origin, current_date, now(), now(), 1, p_widget_version, p_sample_path)
  on conflict (account_id, origin, day) do update set
    last_seen_at   = now(),
    active_minutes = public.install_pings.active_minutes + 1,
    -- widget_version: prefer the LATEST value seen (deployed version can change
    -- mid-day; excluded wins). sample_path: keep the FIRST representative path
    -- seen for the day (existing wins) — later pings shouldn't overwrite it with
    -- an arbitrary later page. Intentionally asymmetric, not a bug.
    widget_version = coalesce(excluded.widget_version, public.install_pings.widget_version),
    sample_path    = coalesce(public.install_pings.sample_path, excluded.sample_path);
end $$;

revoke execute on function public.upsert_install_ping(uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.upsert_install_ping(uuid, text, text, text) to service_role;

-- Task 8: nightly rollup facts. Returns per-channel raw facts for one account
-- and day, as a single jsonb object keyed by channel — one round trip per
-- account instead of four, and aggregated in Postgres never in JS (PostgREST
-- caps a row fetch at 1000, which is the bug that silently truncated counts
-- for high-volume accounts before). Same security posture as
-- upsert_install_ping above (Ruling R9): the only caller is the service-role
-- client from @/lib/supabase, which already bypasses RLS, so SECURITY DEFINER
-- would only add an escalation vector for no benefit. Runs SECURITY INVOKER
-- (the default) with search_path pinned.
create or replace function public.account_health_facts(p_account_id uuid, p_day date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with ping as (
    select max(last_seen_at) as last_seen,
           bool_or(true)     as ever,
           count(distinct origin) as origins,
           coalesce(sum(active_minutes), 0) as minutes
    from public.install_pings
    where account_id = p_account_id and day <= p_day
  ),
  -- Fix 1b (whole-branch review, 2026-08-19): every window below is now
  -- upper-bounded at (p_day + 1)::timestamptz, not just lower-bounded. This
  -- was harmless while the cron defaulted `p_day` to today (the upper bound
  -- was implicitly "now", which IS (p_day+1) minus a few hours) but becomes
  -- an active defect the moment Fix 1 makes the cron default to yesterday: a
  -- lower-bound-only window measured against a PAST p_day keeps counting
  -- everything from that day's start through the moment the RPC actually
  -- runs — e.g. rolling up 2026-08-18 on 2026-08-19 would silently absorb ~14
  -- extra hours of the 19th into the 18th's "24h"/"7d" facts. sess_ever /
  -- wa_ever below already got this treatment in an earlier round; this CTE
  -- copies their shape.
  wev as (
    select count(*) filter (where type = 'widget_loaded'
             and created_at > (p_day + 1)::timestamptz - interval '24 hours'
             and created_at <= (p_day + 1)::timestamptz)                       as loads_24h,
           count(*) filter (where type = 'widget_opened'
             and created_at > (p_day + 1)::timestamptz - interval '7 days'
             and created_at <= (p_day + 1)::timestamptz)                       as opens_7d,
           -- Fix 2 (whole-branch review): the day's OWN opens, bounded to
           -- exactly p_day. This is what account_health_daily.opens must hold
           -- from now on — see the jsonb_build_object comment below for why.
           count(*) filter (where type = 'widget_opened'
             and created_at::date = p_day)                                    as opens_day,
           count(*) filter (where type in ('client_error','config_load_failed','csp_blocked')
             and created_at > (p_day + 1)::timestamptz - interval '24 hours'
             and created_at <= (p_day + 1)::timestamptz)                       as errors_24h,
           count(*) filter (where type = 'widget_message_sent'
             and created_at::date = p_day)                                    as messages
    from public.widget_events
    where account_id = p_account_id
      and created_at > (p_day + 1)::timestamptz - interval '8 days'
      and created_at <= (p_day + 1)::timestamptz
  ),
  -- chat_page "ever" facts (review round 1, Finding 1): everPinged /
  -- opensLast7d / loadsLast24h must reflect activity up to and including
  -- p_day, not p_day's own count alone — the widget's `ping` CTE above
  -- already gets this right with `day <= p_day`; chat_page and whatsapp did
  -- not, so a channel live for months with zero sessions on the exact night
  -- the cron runs reported everPinged=false and flipped the board to
  -- never_installed. Anchored to (p_day + 1)::timestamptz throughout —
  -- never now() (Finding 2) — so re-running a past day via ?day=YYYY-MM-DD
  -- measures freshness against the day being rebuilt, not today's wall clock.
  sess_ever as (
    select bool_or(true) as ever,
           max(created_at) as last_seen,
           count(*) filter (where created_at > (p_day + 1)::timestamptz - interval '7 days')  as opens_7d,
           count(*) filter (where created_at > (p_day + 1)::timestamptz - interval '24 hours') as loads_24h
    from public.chat_sessions
    where account_id = p_account_id and created_at <= (p_day + 1)::timestamptz
  ),
  -- The day's own session count stays day-scoped on purpose — this is what
  -- account_health_daily.sessions (and chat_page's day-scoped "loads" proxy)
  -- report, distinct from the "ever" facts above.
  sess_day as (
    select count(*) as n from public.chat_sessions
    where account_id = p_account_id and created_at::date = p_day
  ),
  -- Same ever-vs-day split for whatsapp (Finding 1).
  wa_ever as (
    select bool_or(true) as ever,
           max(last_activity_at) as last_seen,
           count(*) filter (where last_activity_at > (p_day + 1)::timestamptz - interval '7 days')  as opens_7d,
           count(*) filter (where last_activity_at > (p_day + 1)::timestamptz - interval '24 hours') as loads_24h
    from public.whatsapp_cs_sessions
    where active_account_id = p_account_id and last_activity_at <= (p_day + 1)::timestamptz
  ),
  wa_day as (
    select count(*) as n from public.whatsapp_cs_sessions
    where active_account_id = p_account_id and last_activity_at::date = p_day
  )
  -- Fix 2 (whole-branch review, 2026-08-19): every channel below now also
  -- exposes `opensToday` — the day's OWN opens, bounded to p_day — alongside
  -- the pre-existing `opensLast7d`. rollup.ts writes `opensToday` into
  -- account_health_daily.opens (a DAILY row), matching every sibling column
  -- (loads, errors, messages, sessions), which are all genuinely per-day.
  -- Before this, rollup.ts wrote the 7-day rolling `opensLast7d` into that
  -- daily column, and admin_health_board's sum() over 7 trailing daily rows
  -- summed seven overlapping 7-day windows — a ~7x inflation (measured live:
  -- Studio Pasha chat_page loads=50/24h vs opens=366/7d). `opensLast7d`
  -- itself is UNCHANGED and still the value deriveChannelStatus's `dormant`
  -- rule needs — do not remove it.
  --
  -- For chat_page and whatsapp there is no separate "loaded vs opened"
  -- signal — a session IS the open — so opensToday is simply that channel's
  -- day-scoped session count (sess_day.n / wa_day.n), the same source
  -- `sessions` already reads. Widget is the only channel with a distinct
  -- widget_opened event, computed in wev.opens_day above.
  select jsonb_build_object(
    'widget', jsonb_build_object(
      'everPinged', coalesce((select ever from ping), false),
      -- Anchored to p_day (Finding 2), not now() — see comment above sess_ever.
      'hoursSinceLastPing', (select extract(epoch from ((p_day + 1)::timestamptz - last_seen)) / 3600 from ping),
      'opensLast7d', (select opens_7d from wev),
      'opensToday', (select opens_day from wev),
      'errorsLast24h', (select errors_24h from wev),
      'loadsLast24h', (select loads_24h from wev),
      'activeMinutes', (select minutes from ping),
      'distinctOrigins', (select origins from ping),
      'messages', (select messages from wev),
      'sessions', (select n from sess_day)
    ),
    'chat_page', jsonb_build_object(
      'everPinged', coalesce((select ever from sess_ever), false),
      'hoursSinceLastPing', (select extract(epoch from ((p_day + 1)::timestamptz - last_seen)) / 3600 from sess_ever),
      'opensLast7d', (select opens_7d from sess_ever),
      'opensToday', (select n from sess_day),
      'loadsLast24h', (select loads_24h from sess_ever),
      -- errorsLast24h is a real hardcoded 0, not a measurement (review round 1,
      -- Minor 2): chat_page has no error signal wired up yet — widget_events
      -- client errors are widget-only — so deriveChannelStatus can never
      -- return 'erroring' for chat_page in v1. Fine as a scope limit; called
      -- out here the same way rollup.ts calls out the unpopulated `leads` field.
      'errorsLast24h', 0,
      'activeMinutes', 0, 'distinctOrigins', 0, 'messages', 0,
      'sessions', (select n from sess_day)
    ),
    'whatsapp', jsonb_build_object(
      'everPinged', coalesce((select ever from wa_ever), false),
      'hoursSinceLastPing', (select extract(epoch from ((p_day + 1)::timestamptz - last_seen)) / 3600 from wa_ever),
      'opensLast7d', (select opens_7d from wa_ever),
      'opensToday', (select n from wa_day),
      'loadsLast24h', (select loads_24h from wa_ever),
      -- Same v1 scope limit as chat_page above (review round 1, Minor 2): no
      -- error signal wired up for WhatsApp yet, so this is a real hardcoded 0.
      'errorsLast24h', 0,
      'activeMinutes', 0, 'distinctOrigins', 0, 'messages', (select n from wa_day),
      'sessions', (select n from wa_day)
    ),
    'instagram', jsonb_build_object(
      'everPinged', false, 'hoursSinceLastPing', null,
      'opensLast7d', 0, 'opensToday', 0, 'errorsLast24h', 0, 'loadsLast24h', 0,
      'activeMinutes', 0, 'distinctOrigins', 0, 'messages', 0, 'sessions', 0
    )
  );
$$;

revoke execute on function public.account_health_facts(uuid, date) from public, anon, authenticated;
grant  execute on function public.account_health_facts(uuid, date) to service_role;

-- Task 8: one-time backfill of install_pings from the widget_loaded events
-- already sitting in widget_events, so the health board isn't born
-- all-never_installed on day one (see scripts/backfill-install-history.ts for
-- the full rationale and the synthetic-origin caveat). Same R9 posture as the
-- two functions above: SECURITY INVOKER, search_path pinned, execute revoked
-- from public/anon/authenticated and granted only to service_role — the only
-- caller is the one-time backfill script's service-role client.
create or replace function public.backfill_install_pings()
returns int
language plpgsql
set search_path = public
as $$
declare n int;
begin
  insert into public.install_pings
    (account_id, origin, day, first_seen_at, last_seen_at, active_minutes, widget_version, sample_path)
  select account_id,
         'backfill://widget_events',
         created_at::date,
         min(created_at),
         max(created_at),
         -- active_minutes here is a raw widget_loaded event COUNT, not the
         -- Redis-deduped minute count the column is meant to hold (see the
         -- column's own comment above, line ~28-31: it saturates at 1440 and
         -- means "minutes in which the widget loaded at least once"). On a
         -- busy historical day this proxy can far exceed 1440. It does not
         -- affect status derivation — activeMinutes is not part of
         -- ChannelFacts — but do not render this backfilled value as real
         -- traffic or real active-minutes (review round 1, Minor 1).
         count(*),
         null,
         null
  from public.widget_events
  where type = 'widget_loaded'
  group by account_id, created_at::date
  on conflict (account_id, origin, day) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.backfill_install_pings() from public, anon, authenticated;
grant  execute on function public.backfill_install_pings() to service_role;

-- Task 9: admin health board. One jsonb object per paying account, with one
-- channel entry per channel that actually has rows in account_health_daily
-- for the window (a channel with zero rows — e.g. never rolled up — is
-- simply absent, not synthesized as never_installed here; the nightly rollup
-- is what writes never_installed rows). Same R9 posture as the three
-- functions above: SECURITY INVOKER (the default — no `security definer`),
-- search_path pinned, execute revoked from public/anon/authenticated and
-- granted only to service_role. The only caller is the service-role client
-- from @/lib/supabase used by /api/admin/health.
--
-- Ruling R5: last_seen is max(h.date), NOT max(h.computed_at). computed_at is
-- when the nightly cron RAN, which is near-identical across every row written
-- in the same batch — using it would make a channel that died a week ago show
-- "last seen" as this morning's cron time, the exact inverse of what this
-- column exists to tell. h.date is the last day the channel actually showed
-- signs of life; day granularity, not a timestamp, is the honest trade-off.
--
-- Fix 4 (whole-branch review, 2026-08-19): the `filter` clause below was
-- `h.status <> 'never_installed'`, which is too narrow — R5 caught the
-- computed_at inversion but missed a second one. The nightly rollup writes a
-- row for EVERY expected channel EVERY day regardless of activity, so a
-- channel that died and is now correctly reported as 'silent' still passes
-- `<> 'never_installed'` and its `date` (today's cron run) wins the max() —
-- collapsing "last seen" to today-or-null for exactly the accounts this
-- column exists to flag (measured live: KUNI and החמניה both showed
-- status='silent' with lastSeen=today, rendered under the 🔴 "נדם" chip).
-- Filtering to the statuses that represent actual life — live / dormant /
-- erroring — fixes it: 'silent' and 'never_installed' both correctly fall
-- through to whatever earlier date last had real activity, or null if none
-- ever did.
create or replace function public.admin_health_board(p_days int default 14)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb) from (
    select jsonb_build_object(
      'account_id', c.account_id,
      'name', coalesce(a.config->>'display_name', a.config->>'username', left(c.account_id::text, 8)),
      'contractEnd', c.contract_end,
      'trialEnd', c.trial_end,
      'owner', c.owner,
      'channels', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'channel', ch.channel,
          'status',  ch.status,
          'lastSeen', ch.last_seen,
          'opens7d', ch.opens7d,
          'loads7d', ch.loads7d,
          'errors7d', ch.errors7d,
          'spark', ch.spark
        )), '[]'::jsonb)
        from (
          select h.channel,
                 (array_agg(h.status order by h.date desc))[1] as status,
                 max(h.date) filter (where h.status in ('live','dormant','erroring')) as last_seen,
                 -- coalesce to 0 (fix round 1, Finding 1): a filtered sum() over
                 -- zero matching rows is NULL, not 0, in Postgres. That happens
                 -- for real whenever a channel's most recent recorded day falls
                 -- outside the 7-day window but inside the p_days display
                 -- window. HealthRow declares these as `number` on the TS side,
                 -- so an un-coalesced NULL crossed the API boundary against its
                 -- own contract and rendered as the literal text "(null)" in the
                 -- erroring chip. Fixed at the root, not the render site.
                 coalesce(sum(h.opens)  filter (where h.date > current_date - 7), 0) as opens7d,
                 coalesce(sum(h.loads)  filter (where h.date > current_date - 7), 0) as loads7d,
                 coalesce(sum(h.errors) filter (where h.date > current_date - 7), 0) as errors7d,
                 array_agg(h.loads order by h.date) as spark
          from public.account_health_daily h
          where h.account_id = c.account_id
            and h.date > current_date - p_days
          group by h.channel
        ) ch
      )
    ) as row
    from public.account_contracts c
    join public.accounts a on a.id = c.account_id
    where c.is_paying = true
  ) t;
$$;

revoke execute on function public.admin_health_board(int) from public, anon, authenticated;
grant  execute on function public.admin_health_board(int) to service_role;

-- Ruling R16 (fix round 1): the drill-down route's per-version breakdown was
-- summing active_minutes in JS over a `.limit(100)`-bounded install_pings
-- fetch. That is both a "never aggregate in JS" violation AND silently lossy
-- on real accounts: install_pings is one row per account per ORIGIN per DAY,
-- so a 30-day window costs 30 rows per origin — LA BEAUTÉ alone (3 live
-- origins) already spends ~90 of the 100-row cap. Ordered last_seen_at desc,
-- the rows that get truncated first are the OLDEST — exactly where a stale,
-- un-updated widget_version would show up, so the "who's stuck on old code"
-- signal degrades silently on the busiest accounts first. This function moves
-- the aggregation into Postgres with no row cap.
--
-- Null widget_version is real, not a bug: pings recorded between Tasks 3 and
-- 5 (before the version param existed) have none, and backfill_install_pings
-- rows (from historical widget_events, no version info available) never will.
-- Explicit choice: bucket both under the literal 'unknown' label, matching
-- what the JS reduce() it replaces already did (`p.widget_version || 'unknown'`).
--
-- Same R9 posture as the four functions above: SECURITY INVOKER (the
-- default — no `security definer`), search_path pinned, execute revoked from
-- public/anon/authenticated and granted only to service_role. The only
-- caller is the service-role client from @/lib/supabase used by
-- /api/admin/health/[accountId].
create or replace function public.account_install_versions(p_account_id uuid, p_since date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('version', version, 'loads', loads) order by loads desc), '[]'::jsonb)
  from (
    select coalesce(widget_version, 'unknown') as version,
           sum(active_minutes) as loads
    from public.install_pings
    where account_id = p_account_id
      and day >= p_since
    group by coalesce(widget_version, 'unknown')
  ) v;
$$;

revoke execute on function public.account_install_versions(uuid, date) from public, anon, authenticated;
grant  execute on function public.account_install_versions(uuid, date) to service_role;
