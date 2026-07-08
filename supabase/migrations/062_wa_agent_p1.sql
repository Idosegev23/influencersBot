-- Migration 062 (P1): optimistic concurrency for the agent WA state machine.
-- A burst of voice notes can race crm_agent_wa_state; setStateGuarded() bumps
-- version and only writes when the caller's expected version still matches.
-- (061 is taken by P0's idempotency + Decision-Log migration.)
alter table public.crm_agent_wa_state
  add column if not exists version integer not null default 0;
