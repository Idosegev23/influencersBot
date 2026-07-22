-- Migration 069: chat_sessions bot-pause state for human handoff / bot-takeover (spec §9.2).
-- Each CS thread binds a chat_session, so per-conversation pause applies directly. Read on every bot turn.
alter table public.chat_sessions
  add column if not exists bot_paused boolean not null default false;
alter table public.chat_sessions
  add column if not exists bot_paused_at timestamptz;
alter table public.chat_sessions
  add column if not exists bot_paused_reason text;
comment on column public.chat_sessions.bot_paused is
  'Human-handoff pause flag (spec §9.2). true → bot skips its turn; cleared only by manual resume.';
