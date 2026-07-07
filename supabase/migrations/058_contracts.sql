-- Migration 058: contracts (Phase B).
-- A signed quote activates the deal; the agent then (optionally) generates a
-- CONTRACT — an editable text template rendered to a PDF and e-signed. doc_kind
-- on signature_requests distinguishes quote vs contract so the sign route branches.

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  agent_id uuid references public.users(id),
  account_id uuid references public.accounts(id),
  body text,                                   -- editable template (Hebrew, plain text)
  status text not null default 'draft',        -- draft | sent | signed
  signature_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contracts_partnership_idx on public.contracts(partnership_id);

alter table public.signature_requests
  add column if not exists doc_kind text not null default 'quote'; -- quote | contract
