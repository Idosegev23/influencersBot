-- Migration 064: advisory-lane conversation memory for the WhatsApp brain (spec §2C/§8).
-- One rolling summary per agent so free-form follow-ups ("רגע, תשנה לאנה ל-90") resolve
-- in context. Read/written by src/lib/crm/agent-memory.ts. Scoped hard to agent_id.
create table if not exists public.crm_agent_wa_memory (
  agent_id         uuid primary key references public.users(id) on delete cascade,
  rolling_summary  text not null default '',
  last_response_id text,
  turn_count       int  not null default 0,
  updated_at       timestamptz not null default now()
);

comment on table public.crm_agent_wa_memory is 'Per-agent rolling conversation summary for the WhatsApp advisory brain (spec §2C/§8).';
