-- Migration 074: CS-engine M1 (spec 2026-08-12 §8, step 1 of 2 — NON-destructive):
-- whatsapp_cs_sessions becomes channel-keyed. wa_id stays populated and remains the PK;
-- step 2 (drop NOT NULL, then the column) ships only after this path has run in production.
alter table public.whatsapp_cs_sessions
  add column if not exists channel text not null default 'whatsapp',
  add column if not exists channel_user_id text;

update public.whatsapp_cs_sessions set channel_user_id = wa_id where channel_user_id is null;

alter table public.whatsapp_cs_sessions
  alter column channel_user_id set not null;

create unique index if not exists uq_cs_sessions_channel_user
  on public.whatsapp_cs_sessions(channel, channel_user_id);

comment on column public.whatsapp_cs_sessions.channel is
  'whatsapp | instagram | widget | web_chat (spec 2026-08-12 §8). Default whatsapp for legacy rows.';
