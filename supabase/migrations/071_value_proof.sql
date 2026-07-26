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

-- ---------------------------------------------------------------------------
-- Raw aggregates for one account and window. Shape is consumed by
-- buildValueProof() in src/lib/analytics/value-proof/metrics.ts, which applies
-- the measured/lowConfidence rules. This function returns FACTS only — it never
-- decides whether something is "not measured".
--
-- Aggregated in Postgres for the same reason widget_analytics_summary is:
-- PostgREST truncates a row fetch at 1000, which would silently cut 26K orders.
--
-- Deflection's denominator is SUPPORT-INTENT conversations, matched on the
-- intent.topic the bot already records. Counting every ticket-free conversation
-- put Argania at 82.0% instead of the real 48.9%.
-- ---------------------------------------------------------------------------
create or replace function value_proof_summary(
  p_account_id uuid,
  p_since      timestamptz,
  p_until      timestamptz
) returns json language sql stable as $$
  with conv as (
    select count(*)::int n from (
      select s.id from chat_sessions s
       where s.account_id = p_account_id and s.created_at between p_since and p_until
         and exists (select 1 from chat_messages m where m.session_id = s.id and m.role = 'user')
      union all
      select null from widget_sessions w
       where w.account_id = p_account_id and w.first_seen between p_since and p_until and w.sent_message
    ) x
  ),
  tick as (
    select count(*)::int total,
           count(*) filter (where source = 'auto_escalation')::int gave_up,
           count(*) filter (where resolved_at is not null)::int resolved,
           percentile_cont(0.5) within group (
             order by extract(epoch from (resolved_at - created_at))
           ) filter (where resolved_at > created_at) close_p50
      from support_requests
     where account_id = p_account_id and created_at between p_since and p_until
  ),
  support_intent as (
    select distinct s.id sid
      from chat_messages m join chat_sessions s on s.id = m.session_id
     where s.account_id = p_account_id and s.created_at between p_since and p_until
       and m.intent->>'topic' ~ 'הזמנ|משלוח|שירות לקוחות|החזר|זיכוי|תקלה|פגום|ביטול|מעקב|חבילה|שליח|תשלום|אשראי'
  ),
  deflect as (
    select count(*)::int total,
           count(*) filter (
             where not exists (select 1 from support_requests r where r.session_id = si.sid)
           )::int n
      from support_intent si
  ),
  tagged as (
    select count(distinct s.id)::int n
      from chat_messages m join chat_sessions s on s.id = m.session_id
     where s.account_id = p_account_id and s.created_at between p_since and p_until
       and m.intent->>'topic' is not null
  ),
  attr as (
    select tier, count(*)::int n, coalesce(sum(amount), 0) revenue
      from bestie_attribution
     where account_id = p_account_id and subject_kind = 'order'
       and occurred_at between p_since and p_until
     group by tier
  ),
  -- AOV comes from its own function because both sides must share an EFFECTIVE
  -- window: max(requested since, first attributed order). Asking for "all time"
  -- otherwise pits the bestie side (which starts 2026-06-12) against a baseline
  -- reaching back to January, turning a real -4.8% into -0.3%.
  cart as (
    select count(*) filter (where c.email_norm is not null)::int with_email,
           count(*) filter (where a.recovered_at is not null
                            and a.recovered_at - a.occurred_at <= interval '7 days')::int recovered_7d,
           coalesce(sum(a.amount) filter (where a.recovered_at is not null
                            and a.recovered_at - a.occurred_at <= interval '7 days'), 0) recovered_7d_value,
           count(*) filter (where a.recovered_at is not null
                            and a.recovered_at - a.occurred_at <= interval '7 days'
                            and a.tier <> 'none')::int bestie_touched
      from bestie_attribution a
      join brand_abandoned_carts c on c.id = a.subject_id
     where a.account_id = p_account_id and a.subject_kind = 'cart'
       and a.occurred_at between p_since and p_until
  ),
  lat as (
    select count(*)::int n,
           percentile_cont(0.5) within group (order by (m.metadata->>'latency_ms')::numeric) p50
      from chat_messages m join chat_sessions s on s.id = m.session_id
     where s.account_id = p_account_id and m.created_at between p_since and p_until
       and m.role <> 'user' and (m.metadata ? 'latency_ms')
  ),
  reasons as (
    select coalesce(json_agg(row_to_json(r)), '[]'::json) j from (
      select escalation_reason reason, count(*)::int n
        from support_requests
       where account_id = p_account_id and created_at between p_since and p_until
         and escalation_reason is not null
       group by 1 order by 2 desc) r
  ),
  visits as (
    select count(*)::int n
      from events
     where account_id = p_account_id and type = 'dashboard_visit'
       and created_at between p_since and p_until
  ),
  setup as (
    select case when x.first_answer is null then null
                else round((extract(epoch from (x.first_answer - x.acct_created)) / 86400)::numeric, 1)
           end days
      from (
        select (select min(m.created_at) from chat_messages m
                  join chat_sessions s on s.id = m.session_id
                 where s.account_id = p_account_id and m.role <> 'user') first_answer,
               (select created_at from accounts where id = p_account_id) acct_created
      ) x
  )
  select json_build_object(
    'window', json_build_object('since', p_since, 'until', p_until),
    'attributed', (
      select json_object_agg(k.tier, json_build_object('n', coalesce(t.n, 0), 'revenue', coalesce(t.revenue, 0)))
        from (select unnest(array['direct','assisted','influenced','none']) tier) k
        left join attr t on t.tier = k.tier
    ),
    'conversations',      (select n from conv),
    'deflected',          (select n from deflect),
    'support_intent',     (select total from deflect),
    'topic_tagged',       (select n from tagged),
    'tickets',            (select total from tick),
    'auto_escalations',   (select gave_up from tick),
    'tickets_resolved',   (select resolved from tick),
    'close_seconds_p50',  (select close_p50 from tick),
    'handoffs',           (select count(*)::int from chat_handoffs where account_id = p_account_id),
    'escalation_reasons', (select j from reasons),
    'latency_samples',    (select n from lat),
    'latency_p50_ms',     (select p50 from lat),
    'carts',              (select row_to_json(cart) from cart),
    'aov',                value_proof_aov(p_account_id, p_since, p_until),
    'setup_days',         (select days from setup),
    'dashboard_visits',   (select n from visits)
  );
$$;

-- AOV with a shared effective window (see the note in value_proof_summary).
create or replace function value_proof_aov(
  p_account_id uuid,
  p_since      timestamptz,
  p_until      timestamptz
) returns json language sql stable as $$
  with t0 as (
    select greatest(p_since, coalesce(min(occurred_at), p_since)) eff
      from bestie_attribution
     where account_id = p_account_id and subject_kind = 'order'
       and tier <> 'none' and amount > 0
       and occurred_at between p_since and p_until
  )
  select json_build_object(
    'bestie',   coalesce(avg(amount) filter (where tier <> 'none'), 0),
    'other',    coalesce(avg(amount) filter (where tier = 'none'), 0),
    'bestie_n', count(*) filter (where tier <> 'none')::int,
    'other_n',  count(*) filter (where tier = 'none')::int,
    'from',     (select eff from t0)
  )
  from bestie_attribution, t0
  where account_id = p_account_id and subject_kind = 'order'
    and amount > 0 and occurred_at between t0.eff and p_until;
$$;
