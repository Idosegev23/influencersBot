-- Migration 061: P0 money-correctness — issue idempotency + Decision-Log.

-- (3) Idempotency: a double reply / webhook redelivery must never mint two signatures.
alter table public.signature_requests add column if not exists idempotency_key text;
create unique index if not exists signature_requests_idempotency_key_uidx
  on public.signature_requests (idempotency_key)
  where idempotency_key is not null;

-- (4) Decision-Log: one row per inbound agent message (audit + eval source, spec §6.1).
create table if not exists public.crm_agent_wa_log (
  id                uuid primary key default gen_random_uuid(),
  message_id        text,
  agent_id          uuid references public.users(id) on delete set null,
  ts                timestamptz not null default now(),
  channel           text,              -- 'voice' | 'text' | 'attachment' | 'unknown'
  stt_provider      text,
  stt_confidence    numeric,
  transcript        text,
  router_intent     text,
  router_confidence numeric,
  plan_json         jsonb,
  model_used        text,
  input_tokens      integer,
  output_tokens     integer,
  latency_ms        integer,
  outcome           text,              -- 'done' | 'need_more' | 'error'
  deal_id           uuid,
  amount            numeric,
  agent_corrected   boolean not null default false
);
create index if not exists crm_agent_wa_log_agent_ts_idx on public.crm_agent_wa_log (agent_id, ts desc);
create index if not exists crm_agent_wa_log_message_idx on public.crm_agent_wa_log (message_id);
