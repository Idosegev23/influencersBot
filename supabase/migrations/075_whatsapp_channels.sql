-- Migration 075: BYO WhatsApp — one row per business WhatsApp number.
-- Spec: docs/superpowers/specs/2026-08-06-byo-whatsapp-number-tech-provider-design.md §2
-- Plan: docs/superpowers/plans/2026-08-15-byo-whatsapp-channel-foundation.md Task 1
--
-- NOTE ON NAMING: whatsapp_cs_sessions.channel (migration 074) is the MEDIUM
-- (whatsapp|instagram|widget|web_chat). wa_channel_id below is WHICH BUSINESS NUMBER.
-- They are orthogonal. Do not merge them.

create table if not exists public.whatsapp_channels (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null unique references public.accounts(id) on delete cascade,
  waba_id               text not null,
  phone_number_id       text not null unique,
  display_phone_number  text,
  verified_name         text,
  token_secret_id       uuid,
  onboarding_mode       text not null default 'coexistence'
                          check (onboarding_mode in ('coexistence','full_api')),
  status                text not null default 'pending'
                          check (status in ('pending','active','suspended','disconnected')),
  payment_ready         boolean not null default false,
  sync_initiated_at     timestamptz,
  templates             jsonb not null default '{}'::jsonb,
  provision_state       jsonb not null default '{}'::jsonb,
  connected_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_wa_channels_account on public.whatsapp_channels(account_id);
create index if not exists idx_wa_channels_status  on public.whatsapp_channels(status);

-- 073 posture: RLS on, zero anon/authenticated grants. Server-side service_role only.
alter table public.whatsapp_channels enable row level security;
revoke all on public.whatsapp_channels from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_channels to service_role;

-- --------------------------------------------------------------------------
-- Sessions gain the number they arrived on.
-- --------------------------------------------------------------------------
alter table public.whatsapp_cs_sessions
  add column if not exists wa_channel_id uuid references public.whatsapp_channels(id) on delete set null;

-- Migration 074's index assumed one number. Replace it with two partial indexes so
-- the same shopper talking to two different business numbers gets two sessions,
-- while non-WhatsApp media (and pre-backfill rows) keep the original key.
drop index if exists uq_cs_sessions_channel_user;

create unique index if not exists uq_cs_sessions_channel_user_nochan
  on public.whatsapp_cs_sessions(channel, channel_user_id)
  where wa_channel_id is null;

create unique index if not exists uq_cs_sessions_channel_user_chan
  on public.whatsapp_cs_sessions(channel, channel_user_id, wa_channel_id)
  where wa_channel_id is not null;

create index if not exists idx_cs_sessions_wa_channel
  on public.whatsapp_cs_sessions(wa_channel_id);

comment on column public.whatsapp_cs_sessions.wa_channel_id is
  'Which business WhatsApp number this session arrived on (whatsapp_channels.id). NULL for non-WhatsApp media.';

-- --------------------------------------------------------------------------
-- Vault wrappers. PostgREST only exposes `public`, and the vault schema must not be
-- exposed directly — these three SECURITY DEFINER functions are the entire surface.
-- --------------------------------------------------------------------------
create or replace function public.wa_channel_store_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare v_id uuid;
begin
  select vault.create_secret(p_token, 'wa_channel_' || gen_random_uuid()::text,
                             'BYO WhatsApp channel access token') into v_id;
  return v_id;
end;
$$;

create or replace function public.wa_channel_read_token(p_secret_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where id = p_secret_id;
  return v_secret;
end;
$$;

create or replace function public.wa_channel_delete_token(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  delete from vault.secrets where id = p_secret_id;
end;
$$;

revoke all on function public.wa_channel_store_token(text)  from public, anon, authenticated;
revoke all on function public.wa_channel_read_token(uuid)   from public, anon, authenticated;
revoke all on function public.wa_channel_delete_token(uuid) from public, anon, authenticated;
grant execute on function public.wa_channel_store_token(text)  to service_role;
grant execute on function public.wa_channel_read_token(uuid)   to service_role;
grant execute on function public.wa_channel_delete_token(uuid) to service_role;
