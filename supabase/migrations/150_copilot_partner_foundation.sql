-- ==================================================
-- Migration 150: Co-Pilot partner foundation
-- ==================================================
-- Multiview resells the assistant to associations under its own brand.
-- A partner owns associations (ordinary `accounts` rows), hosts map to a
-- partner or an association, visitors carry a profile that merges when they
-- identify, and every interaction is an append-only structured event so
-- Multiview's Intent Exchange can aggregate across associations later.
-- Service role only: RLS on, no anon/authenticated grants.
-- ==================================================

-- accounts and chat_sessions are hot tables: fail fast instead of queueing behind locks.
set lock_timeout = '3s';

create table public.partners (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null,
  branding    jsonb not null default '{}'::jsonb,
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.partner_api_keys (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners(id) on delete cascade,
  key_hash      text not null unique,
  label         text not null default '',
  status        text not null default 'active' check (status in ('active','revoked')),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create table public.tenant_domains (
  host         text primary key check (host = lower(host)),
  partner_id   uuid not null references public.partners(id) on delete cascade,
  account_id   uuid references public.accounts(id) on delete cascade,
  kind         text not null default 'subdomain' check (kind in ('subdomain','custom')),
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index tenant_domains_account_idx on public.tenant_domains(account_id);
create index tenant_domains_partner_idx on public.tenant_domains(partner_id);

create index partner_api_keys_partner_idx on public.partner_api_keys(partner_id);

create table public.console_users (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners(id) on delete cascade,
  account_id     uuid references public.accounts(id) on delete cascade,
  email          text not null check (email = lower(email)),
  name           text not null default '',
  role           text not null default 'viewer' check (role in ('owner','admin','viewer')),
  status         text not null default 'active' check (status in ('active','disabled')),
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  unique (partner_id, email)
);

create table public.console_login_codes (
  id               uuid primary key default gen_random_uuid(),
  console_user_id  uuid not null references public.console_users(id) on delete cascade,
  code_hash        text not null,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  attempts         int not null default 0,
  created_at       timestamptz not null default now()
);
create index console_login_codes_user_idx on public.console_login_codes(console_user_id, created_at desc);

create table public.visitors (
  id                    uuid primary key default gen_random_uuid(),
  partner_id            uuid not null references public.partners(id) on delete cascade,
  account_id            uuid not null references public.accounts(id) on delete cascade,
  anon_id               text not null,
  member_ref            text,
  email                 text,
  name                  text,
  company               text,
  company_domain        text,
  identity_source       text check (identity_source in ('ams_login','newsletter','ams_email','email_domain','external')),
  identity_resolved_at  timestamptz,
  membership            jsonb,
  first_seen            timestamptz not null default now(),
  last_seen             timestamptz not null default now(),
  merged_into           uuid references public.visitors(id) on delete set null,
  unique (account_id, anon_id)
);
create unique index visitors_member_uidx on public.visitors(account_id, member_ref)
  where member_ref is not null and merged_into is null;
create index visitors_partner_idx on public.visitors(partner_id, last_seen desc);
create index visitors_merged_into_idx on public.visitors(merged_into) where merged_into is not null;

create table public.interaction_events (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partners(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  visitor_id   uuid not null references public.visitors(id) on delete cascade,
  session_id   uuid references public.chat_sessions(id) on delete set null,
  message_id   uuid,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  industry     text,
  occurred_at  timestamptz not null default now()
);
create index interaction_events_session_idx on public.interaction_events(session_id) where session_id is not null;
create index interaction_events_account_idx on public.interaction_events(account_id, occurred_at desc);
create index interaction_events_visitor_idx on public.interaction_events(visitor_id, occurred_at desc);
create index interaction_events_partner_type_idx on public.interaction_events(partner_id, type, occurred_at desc);

-- Hot tables: add plain nullable columns (no inline REFERENCES), then the FK as
-- NOT VALID + VALIDATE so the heavy lock is not held during a full scan.
alter table public.accounts add column partner_id uuid;
alter table public.chat_sessions add column visitor_id uuid;
alter table public.chat_sessions add column identified_at timestamptz;

-- On purpose restrict (default): a partner that still has associations cannot be deleted by accident.
alter table public.accounts add constraint accounts_partner_id_fkey
  foreign key (partner_id) references public.partners(id) not valid;
alter table public.accounts validate constraint accounts_partner_id_fkey;

alter table public.chat_sessions add constraint chat_sessions_visitor_id_fkey
  foreign key (visitor_id) references public.visitors(id) on delete set null not valid;
alter table public.chat_sessions validate constraint chat_sessions_visitor_id_fkey;

create index accounts_partner_idx on public.accounts(partner_id) where partner_id is not null;
-- Plain CREATE INDEX (CONCURRENTLY cannot run inside the migration transaction). Acceptable:
-- the column is all NULL here, so the partial index (where visitor_id is not null) is near-empty.
create index chat_sessions_visitor_idx on public.chat_sessions(visitor_id) where visitor_id is not null;

-- RLS: service role only
do $$
declare t text;
begin
  foreach t in array array['partners','partner_api_keys','tenant_domains','console_users',
                           'console_login_codes','visitors','interaction_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Vault wrappers (same pattern as 075 wa_channel_*)
create or replace function public.copilot_store_secret(p_secret text)
returns uuid language plpgsql security definer
set search_path = public, vault, extensions as $$
declare v_id uuid;
begin
  select vault.create_secret(p_secret, 'copilot_' || gen_random_uuid()::text,
                             'Co-Pilot association secret') into v_id;
  return v_id;
end; $$;

create or replace function public.copilot_read_secret(p_secret_id uuid)
returns text language plpgsql security definer
set search_path = public, vault, extensions as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = p_secret_id;
  return v_secret;
end; $$;

-- Atomic merge: move everything owned by p_from to p_into, then mark p_from merged.
create or replace function public.copilot_merge_visitor(p_from uuid, p_into uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_from public.visitors;
  v_into public.visitors;
begin
  if p_from = p_into then return; end if;

  -- Lock both rows in id order (deadlock-safe against concurrent merges).
  perform 1 from public.visitors where id in (p_from, p_into) order by id for update;
  select * into v_from from public.visitors where id = p_from;
  select * into v_into from public.visitors where id = p_into;

  if v_from.id is null or v_into.id is null then
    raise exception 'copilot_merge_visitor: visitor not found';
  end if;
  if v_from.account_id <> v_into.account_id or v_from.partner_id <> v_into.partner_id then
    raise exception 'copilot_merge_visitor: visitors belong to different account or partner';
  end if;
  if v_into.merged_into is not null then
    raise exception 'copilot_merge_visitor: target visitor is already merged';
  end if;
  if v_from.merged_into is not null then
    raise exception 'copilot_merge_visitor: source visitor is already merged';
  end if;

  update public.chat_sessions      set visitor_id = p_into where visitor_id = p_from;
  update public.interaction_events set visitor_id = p_into where visitor_id = p_from;
  -- re-point earlier merges (cannot self-cycle: p_into.merged_into is null, checked above)
  update public.visitors set merged_into = p_into where merged_into = p_from and id <> p_into;
  update public.visitors
     set merged_into = p_into,
         member_ref  = null,
         last_seen   = now()
   where id = p_from;
  update public.visitors v
     set first_seen = least(v.first_seen, f.first_seen),
         last_seen  = now()
    from public.visitors f
   where v.id = p_into and f.id = p_from;
end; $$;

revoke all on function public.copilot_store_secret(text)          from public, anon, authenticated;
revoke all on function public.copilot_read_secret(uuid)           from public, anon, authenticated;
revoke all on function public.copilot_merge_visitor(uuid, uuid)   from public, anon, authenticated;
grant execute on function public.copilot_store_secret(text)        to service_role;
grant execute on function public.copilot_read_secret(uuid)         to service_role;
grant execute on function public.copilot_merge_visitor(uuid, uuid) to service_role;
