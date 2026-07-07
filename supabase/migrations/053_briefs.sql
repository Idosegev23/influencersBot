-- Migration 053: Inbound "briefs".
--
-- A forwarded WhatsApp message becomes a BRIEF that the agent prices and sends
-- (human-in-the-loop), NOT an auto-created quote. These columns let the inbound
-- record carry the brief lifecycle + the suggested influencer for the agent to
-- confirm. Additive only — safe on the live table.

alter table public.crm_inbound_messages
  add column if not exists brief_status text not null default 'new',
  add column if not exists suggested_account_id uuid references public.accounts(id),
  add column if not exists deal_id uuid references public.partnerships(id);

comment on column public.crm_inbound_messages.brief_status is
  'Brief lifecycle: new | assigned | priced | sent | dismissed (distinct from parse_status, which tracks AI parsing).';
comment on column public.crm_inbound_messages.suggested_account_id is
  'Influencer account suggested by name/phone match; the agent confirms before pricing.';
comment on column public.crm_inbound_messages.deal_id is
  'The partnership (deal) created once the agent prices + sends this brief.';

create index if not exists crm_inbound_brief_status_idx
  on public.crm_inbound_messages (agent_id, brief_status);
