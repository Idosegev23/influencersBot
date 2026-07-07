-- Migration 056: CRM domain model.
--
-- Talent (מיוצג)  = accounts (the agent's roster) — unchanged.
-- Client (לקוח)   = the ORDERER — an ad agency or a brand acting as its own client;
--                   agencies carry a contact list.
-- Brand (מותג)    = a separate entity a campaign is for.
-- Campaign (קמפיין) = belongs to a brand + a client; a deal = talent × campaign.
-- Isolation is code-enforced by agent_id (RLS off).

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.users(id),
  name text not null,
  category text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.users(id),
  name text not null,
  type text not null default 'brand', -- 'brand' | 'agency'
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.users(id),
  brand_id uuid references public.brands(id),
  client_id uuid references public.clients(id),
  name text not null,        -- e.g. "H&M אביב 2026"
  season text,
  status text not null default 'active', -- active | archived
  created_at timestamptz not null default now()
);

-- Link deals to the domain (additive; existing rows keep NULLs).
alter table public.partnerships
  add column if not exists campaign_id uuid references public.campaigns(id),
  add column if not exists client_id uuid references public.clients(id),
  add column if not exists brand_id uuid references public.brands(id);

create index if not exists brands_agent_idx on public.brands(agent_id);
create index if not exists clients_agent_idx on public.clients(agent_id);
create index if not exists client_contacts_client_idx on public.client_contacts(client_id);
create index if not exists campaigns_agent_idx on public.campaigns(agent_id);
create index if not exists campaigns_brand_idx on public.campaigns(brand_id);
create index if not exists campaigns_client_idx on public.campaigns(client_id);
create index if not exists partnerships_campaign_idx on public.partnerships(campaign_id);
