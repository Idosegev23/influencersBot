-- Agency CRM (Phase 3-4): invoice request → 48h reminders → payment tracking.

alter table public.invoices
  add column if not exists requested_at timestamptz,          -- when invoice-upload was requested (the "done" trigger)
  add column if not exists uploaded_at timestamptz,           -- when the invoice doc was uploaded
  add column if not exists last_reminder_at timestamptz,      -- last chase
  add column if not exists reminder_count int not null default 0,
  add column if not exists payment_terms_days int not null default 30,  -- e.g. net+30
  add column if not exists payment_route text not null default 'via_agency'
    check (payment_route in ('direct_from_brand','via_agency')),
  add column if not exists upload_token text,                 -- public upload link token
  add column if not exists storage_path text,                 -- uploaded invoice PDF in partnership-documents
  add column if not exists agent_id uuid references public.users(id) on delete set null;

create unique index if not exists invoices_upload_token_unique on public.invoices (upload_token) where upload_token is not null;
create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoices_agent_idx on public.invoices (agent_id);

-- For plan-vs-actual: when the agent marked the activity complete.
alter table public.partnerships
  add column if not exists activity_completed_at timestamptz;

comment on column public.invoices.payment_route is 'direct_from_brand | via_agency — from the agent POV only the classification changes.';
comment on column public.invoices.requested_at is 'Set when the agent marks activity done and Bestie requests an invoice upload; reminders key off this, not contract dates.';
