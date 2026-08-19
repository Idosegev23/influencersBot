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
