-- Agency CRM (Phase 2): quotes → e-signature + inbound ingestion audit.

-- A deal is associated to the managing agent (in addition to the influencer account).
alter table public.partnerships
  add column if not exists agent_id uuid references public.users(id) on delete set null;
create index if not exists partnerships_agent_id_idx on public.partnerships (agent_id);

-- Signature requests (port of leaders-platform, adapted to Supabase Storage).
create table if not exists public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  partnership_id uuid references public.partnerships(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  agent_id uuid references public.users(id) on delete set null,
  title text not null default 'הצעת מחיר',
  status text not null default 'pending' check (status in ('pending','opened','signed','expired','cancelled')),
  -- PDFs live in the private `partnership-documents` bucket
  document_storage_path text,           -- unsigned quote PDF
  signed_storage_path text,             -- signed PDF (after signing)
  -- signer captured fields
  signer_name text,
  signer_email text,
  signer_role text,
  signer_notes text,
  signer_id_number text,
  signer_company text,
  signer_company_hp text,
  signed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists signature_requests_partnership_idx on public.signature_requests (partnership_id);
create index if not exists signature_requests_agent_idx on public.signature_requests (agent_id);
create index if not exists signature_requests_status_idx on public.signature_requests (status);

-- Inbound ingestion audit (email / WhatsApp / manual → quote).
create table if not exists public.crm_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','email','manual')),
  agent_id uuid references public.users(id) on delete set null,   -- matched agent (null if unmatched)
  sender text,                          -- email address or wa_id
  provider_message_id text,             -- gmail id / wa_message_id (dedupe key)
  subject text,
  raw_text text,
  media_refs jsonb default '[]'::jsonb,
  parse_status text not null default 'pending' check (parse_status in ('pending','parsed','failed','unmatched')),
  parsed_data jsonb,
  partnership_id uuid references public.partnerships(id) on delete set null,
  signature_request_id uuid references public.signature_requests(id) on delete set null,
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_inbound_provider_msg_unique
  on public.crm_inbound_messages (channel, provider_message_id) where provider_message_id is not null;
create index if not exists crm_inbound_agent_idx on public.crm_inbound_messages (agent_id);

-- Gmail poller cursor (one row).
create table if not exists public.gmail_sync_state (
  id int primary key default 1,
  last_history_id text,
  last_polled_at timestamptz,
  constraint gmail_sync_singleton check (id = 1)
);

comment on table public.signature_requests is 'Agency-CRM quote e-signature requests (signed quote = agreement).';
comment on table public.crm_inbound_messages is 'Agency-CRM inbound quote ingestion audit (email/WhatsApp/manual).';
