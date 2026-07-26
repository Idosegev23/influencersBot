-- Bestie lead funnel: Meta instant-form leads and their WhatsApp conversations.
--
-- Split in two on purpose. bestie_leads is the durable record of a person who
-- filled a form — it outlives any conversation. bestie_lead_sessions is the live
-- conversation state keyed by wa_id, which is the only thing the webhook has in
-- hand when a message arrives and therefore the only thing it can look up by.

create table if not exists public.bestie_leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Meta identity. leadgen_id is unique so a webhook redelivery is a no-op.
  leadgen_id    text unique,
  form_id       text,
  -- Empty on Meta test leads, populated in production. Never depend on these.
  ad_id         text,
  adset_id      text,
  campaign_id   text,

  full_name     text,
  email         text,
  phone_raw     text,          -- exactly what Meta sent, for debugging
  wa_id         text,          -- normalised; null when the number was unusable

  raw_payload   jsonb not null default '{}'::jsonb,

  -- pending       → stored, template not sent yet
  -- greeted       → intro template sent
  -- engaged       → the lead replied at least once
  -- handed_off    → email sent to sales; the bot is silent on this conversation
  -- unresponsive  → both nudges sent, no reply
  -- undeliverable → no usable phone number, so nothing was ever sent
  status        text not null default 'pending'
                check (status in ('pending','greeted','engaged','handed_off','unresponsive','undeliverable')),

  greeted_at      timestamptz,
  nudge_24h_at    timestamptz,
  nudge_72h_at    timestamptz,
  last_inbound_at timestamptz,
  handed_off_at   timestamptz,

  -- What the brain learned: business type, size, what they want, urgency.
  qualification jsonb not null default '{}'::jsonb
);

create index if not exists bestie_leads_wa_id_idx      on public.bestie_leads (wa_id);
create index if not exists bestie_leads_status_idx     on public.bestie_leads (status);
create index if not exists bestie_leads_created_at_idx on public.bestie_leads (created_at desc);

-- Conversation state, keyed the way the webhook can find it.
create table if not exists public.bestie_lead_sessions (
  wa_id             text primary key,
  lead_id           uuid references public.bestie_leads(id) on delete cascade,
  chat_session_id   uuid,
  -- Set when handoff fires. The branch claims the inbound but stays silent, so
  -- a salesperson never finds the bot still working the thread beside them.
  bot_paused        boolean not null default false,
  bot_paused_reason text,
  context           jsonb not null default '{}'::jsonb,
  last_activity_at  timestamptz not null default now(),
  version           integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists bestie_lead_sessions_lead_id_idx on public.bestie_lead_sessions (lead_id);

alter table public.bestie_leads         enable row level security;
alter table public.bestie_lead_sessions enable row level security;

revoke all on public.bestie_leads         from anon, authenticated;
revoke all on public.bestie_lead_sessions from anon, authenticated;
