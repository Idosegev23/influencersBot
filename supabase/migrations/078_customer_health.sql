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
  wev as (
    select count(*) filter (where type = 'widget_loaded'
             and created_at > (p_day + 1)::timestamptz - interval '24 hours') as loads_24h,
           count(*) filter (where type = 'widget_opened'
             and created_at > (p_day + 1)::timestamptz - interval '7 days')    as opens_7d,
           count(*) filter (where type in ('client_error','config_load_failed','csp_blocked')
             and created_at > (p_day + 1)::timestamptz - interval '24 hours') as errors_24h,
           count(*) filter (where type = 'widget_message_sent'
             and created_at::date = p_day)                                    as messages
    from public.widget_events
    where account_id = p_account_id and created_at > (p_day + 1)::timestamptz - interval '8 days'
  ),
  sess as (
    select count(*) as n from public.chat_sessions
    where account_id = p_account_id and created_at::date = p_day
  ),
  wa as (
    select count(*) as n, max(last_activity_at) as last_seen
    from public.whatsapp_cs_sessions
    where active_account_id = p_account_id and last_activity_at::date = p_day
  )
  select jsonb_build_object(
    'widget', jsonb_build_object(
      'everPinged', coalesce((select ever from ping), false),
      'hoursSinceLastPing', (select extract(epoch from (now() - last_seen)) / 3600 from ping),
      'opensLast7d', (select opens_7d from wev),
      'errorsLast24h', (select errors_24h from wev),
      'loadsLast24h', (select loads_24h from wev),
      'activeMinutes', (select minutes from ping),
      'distinctOrigins', (select origins from ping),
      'messages', (select messages from wev),
      'sessions', (select n from sess)
    ),
    'chat_page', jsonb_build_object(
      'everPinged', (select n from sess) > 0,
      'hoursSinceLastPing', case when (select n from sess) > 0 then 0 else null end,
      'opensLast7d', (select n from sess),
      'errorsLast24h', 0, 'loadsLast24h', (select n from sess),
      'activeMinutes', 0, 'distinctOrigins', 0, 'messages', 0,
      'sessions', (select n from sess)
    ),
    'whatsapp', jsonb_build_object(
      'everPinged', (select n from wa) > 0,
      'hoursSinceLastPing',
        (select extract(epoch from (now() - last_seen)) / 3600 from wa),
      'opensLast7d', (select n from wa),
      'errorsLast24h', 0, 'loadsLast24h', (select n from wa),
      'activeMinutes', 0, 'distinctOrigins', 0, 'messages', (select n from wa),
      'sessions', (select n from wa)
    ),
    'instagram', jsonb_build_object(
      'everPinged', false, 'hoursSinceLastPing', null,
      'opensLast7d', 0, 'errorsLast24h', 0, 'loadsLast24h', 0,
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
