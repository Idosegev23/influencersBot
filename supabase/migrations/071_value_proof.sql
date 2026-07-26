-- 071_value_proof.sql — value-proof metrics
-- Spec: docs/superpowers/specs/2026-07-26-value-proof-metrics-design.md
-- Plan: docs/superpowers/plans/2026-07-26-value-proof-metrics.md

-- ---------------------------------------------------------------------------
-- Identity normalizers.
--
-- bestie_wa_id is the SQL mirror of toWaId() in src/lib/whatsapp-cloud/client.ts:
-- strip non-digits -> drop a leading 00 -> a leading 0 becomes 972 -> a bare
-- 9-digit number gets 972. Kept IMMUTABLE so it can be used in indexes and joins.
-- Any change here must change toWaId too; tests/unit/value-proof-identity.test.ts
-- is the canonical fixture set.
-- ---------------------------------------------------------------------------
create or replace function bestie_wa_id(p text) returns text
language sql immutable as $$
  with d0 as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d),
       d1 as (select case when d like '00%' then substr(d, 3) else d end as d from d0),
       d2 as (select case when d like '0%'  then '972' || substr(d, 2) else d end as d from d1),
       d3 as (select case when length(d) = 9 then '972' || d else d end as d from d2)
  select nullif(d, '') from d3;
$$;

create or replace function bestie_email(p text) returns text
language sql immutable as $$
  select case when position('@' in lower(btrim(coalesce(p, '')))) > 1
              then lower(btrim(p)) else null end;
$$;

-- ---------------------------------------------------------------------------
-- Abandoned carts, mirrored from QuickShop GET /api/v1/abandoned-carts.
-- NOTE: recovered_at is null on every row QuickShop serves (14,416 checked
-- 2026-07-26) — the endpoint appears to return only unrecovered carts. The
-- column is kept because the API sends it, but recovery is DERIVED by us:
-- a cart is recovered when its email places a later paid, non-POS order.
-- ---------------------------------------------------------------------------
create table if not exists brand_abandoned_carts (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts(id) on delete cascade,
  external_id      text not null,
  email            text,
  email_norm       text,
  items            jsonb not null default '[]'::jsonb,
  subtotal         numeric,
  checkout_step    text,
  reminder_count   integer not null default 0,
  reminder_sent_at timestamptz,
  recovered_at     timestamptz,
  abandoned_at     timestamptz not null,
  raw              jsonb,
  synced_at        timestamptz not null default now(),
  unique (account_id, external_id)
);
create index if not exists brand_abandoned_carts_acct_time_idx on brand_abandoned_carts (account_id, abandoned_at desc);
create index if not exists brand_abandoned_carts_acct_email_idx on brand_abandoned_carts (account_id, email_norm);

-- ---------------------------------------------------------------------------
-- One row per attributed subject (order or cart). Written by
-- src/lib/analytics/value-proof/refresh.ts, which owns the tier logic.
-- ---------------------------------------------------------------------------
create table if not exists bestie_attribution (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('order', 'cart')),
  subject_id   uuid not null,
  tier         text not null check (tier in ('direct', 'assisted', 'influenced', 'none')),
  match_key    text check (match_key in ('utm', 'anon_id', 'phone', 'email')),
  touch_at     timestamptz,
  lag_sec      integer,
  amount       numeric,
  occurred_at  timestamptz not null,
  recovered_at timestamptz,          -- carts only: when the derived recovery order landed
  computed_at  timestamptz not null default now(),
  unique (account_id, subject_kind, subject_id)
);
create index if not exists bestie_attribution_lookup_idx
  on bestie_attribution (account_id, subject_kind, tier, occurred_at desc);

-- Metric 7's "on what". The escalation detector already classifies a reason at
-- runtime and then discards it; this is where it lands.
alter table support_requests add column if not exists escalation_reason text;
create index if not exists support_requests_reason_idx on support_requests (account_id, escalation_reason);

-- ---------------------------------------------------------------------------
-- The touch spine. A view, not a table, so every conversation already in the
-- database is attributable retroactively with nothing new captured.
-- A "conversation" requires >=1 user-authored message.
-- ---------------------------------------------------------------------------
create or replace view bestie_conversation_touches as
  select s.account_id, s.created_at as touch_at, 'chat'::text as surface,
         s.id as session_id, s.anon_id, null::text as phone, null::text as email
    from chat_sessions s
   where exists (select 1 from chat_messages m where m.session_id = s.id and m.role = 'user')
  union all
  select w.account_id, w.first_seen, 'widget', null::uuid, w.anon_id, null, null
    from widget_sessions w
   where w.sent_message
  union all
  select r.account_id, r.created_at, 'support', r.session_id, null,
         bestie_wa_id(r.customer_phone), bestie_email(r.customer_email)
    from support_requests r
  union all
  select l.account_id, l.created_at, 'lead', l.session_id, null,
         bestie_wa_id(l.phone), null
    from chat_leads l
  union all
  select c.active_account_id, c.created_at, 'whatsapp_cs', c.active_chat_session_id, null,
         bestie_wa_id(c.wa_id), null
    from whatsapp_cs_sessions c
   where c.active_account_id is not null;
