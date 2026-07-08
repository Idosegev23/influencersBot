-- Migration 065: proactive nudge queue for the WhatsApp advisory brain (spec §4.5E).
-- One row per proposed action; a free-form "do it" reply on WhatsApp flips it open → done.
-- (Numbered 065 to avoid the applied 063 embeddings migration.)
create table if not exists public.crm_agent_nudges (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.users(id) on delete cascade,
  kind         text not null,     -- stuck_signature | unpriced_brief | similar_brief | digest
  subject_type text,              -- signature | brief | deal
  subject_id   text,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'open',  -- open | sent | done | dismissed
  sent_at      timestamptz,
  dedup_key    text not null,
  created_at   timestamptz not null default now()
);
create unique index if not exists idx_agent_nudges_dedup on public.crm_agent_nudges(agent_id, dedup_key);
create index if not exists idx_agent_nudges_open on public.crm_agent_nudges(agent_id, status);
comment on table public.crm_agent_nudges is 'Proactive nudge queue for the WhatsApp advisory brain (spec §4.5E). Deduped by (agent_id, dedup_key).';
