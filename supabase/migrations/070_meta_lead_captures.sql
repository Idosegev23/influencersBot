-- Meta Lead Ads — raw payload capture.
--
-- Temporary landing pad for the Make.com HTTP module so we can observe the REAL
-- shape of a Meta instant-form submission (field names, phone format, whether a
-- consent field exists at all) before designing the lead engine around guesses.
--
-- Holds real PII (name / phone / email), so: RLS on with no policies (service
-- role only), no anon/authenticated grants, and every row carries expires_at so
-- a sweep can drop it. Nothing here is meant to live long.

create table if not exists public.meta_lead_captures (
  id           uuid        primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),
  -- true only when the shared secret was configured AND matched. False means the
  -- payload is unauthenticated and must not be trusted as a real lead.
  verified     boolean     not null default false,
  content_type text,
  body         jsonb,          -- parsed payload (JSON or form-encoded)
  raw_text     text,           -- fallback when the body did not parse
  headers      jsonb,          -- safe subset only — never the secret header
  ip           text,
  expires_at   timestamptz not null default now() + interval '14 days'
);

create index if not exists meta_lead_captures_received_at_idx
  on public.meta_lead_captures (received_at desc);

create index if not exists meta_lead_captures_expires_at_idx
  on public.meta_lead_captures (expires_at);

alter table public.meta_lead_captures enable row level security;

revoke all on public.meta_lead_captures from anon, authenticated;
