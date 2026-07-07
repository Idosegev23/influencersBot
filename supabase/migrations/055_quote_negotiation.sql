-- Migration 055: quote negotiation (return-for-edit) + 3-day follow-up reminders.
--
-- The client can return a quote for edits instead of signing (haggle / drop a
-- deliverable). And unsigned quotes get a 3-day follow-up nudge to the agent.

alter table public.signature_requests
  add column if not exists returned_for_edit boolean not null default false,
  add column if not exists edit_notes text,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_count integer not null default 0;

create index if not exists signature_requests_pending_idx
  on public.signature_requests (status, created_at)
  where status = 'pending';
