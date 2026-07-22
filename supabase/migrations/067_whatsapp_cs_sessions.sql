-- Migration 067: whatsapp_cs_sessions — lightweight per-shopper state for the brain-led CS loop (spec §10.1).
-- NOT an FSM: `phase` is a COARSE ANALYTICS HINT ONLY (onboarding|serving) and does NOT gate the brain.
-- Optimistic-locking `version` mirrors crm_agent_wa_state.
create table if not exists public.whatsapp_cs_sessions (
  wa_id                   text primary key,
  contact_id              uuid references public.whatsapp_contacts(id),
  phase                   text not null default 'onboarding',
  active_account_id       uuid references public.accounts(id),
  active_ticket_id        uuid references public.support_requests(id),
  active_chat_session_id  uuid references public.chat_sessions(id),
  customer_name           text,
  context                 jsonb not null default '{}'::jsonb,
  last_activity_at        timestamptz not null default now(),
  version                 int not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_cs_sessions_active_account
  on public.whatsapp_cs_sessions(active_account_id);
comment on table public.whatsapp_cs_sessions is
  'Lightweight state for the brain-led CS tool loop keyed on shopper wa_id (spec §10.1). phase (onboarding|serving) is an analytics HINT only — it does NOT gate the brain. version = optimistic lock.';
