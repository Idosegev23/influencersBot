-- Migration 060: WhatsApp agent conversation state.
-- The agent drives the whole flow (build quote? price, send, contract?, reminders)
-- via a WhatsApp conversation. We keep one active conversation per agent.

create table if not exists public.crm_agent_wa_state (
  agent_id uuid primary key references public.users(id) on delete cascade,
  stage text not null default 'idle',
  brief_id uuid,
  deal_id uuid,
  context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
