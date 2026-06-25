-- Agency CRM: defense-in-depth RLS on the CRM-exclusive tables.
--
-- These tables are accessed ONLY by server code using the service-role key
-- (which bypasses RLS), so enabling RLS with no permissive policies simply
-- denies any anon/authenticated direct access — zero app impact. Tenant
-- isolation between agents is already enforced in the API layer; this is
-- belt-and-suspenders.
--
-- NOTE: intentionally NOT enabling RLS on partnerships / invoices / tasks /
-- accounts here — those predate the CRM and are shared with influencer-facing
-- features; changing their RLS posture needs a dedicated, tested pass.
--
-- APPLY: paste into the Supabase SQL editor (no MCP/psql available at authoring time).

alter table public.signature_requests   enable row level security;
alter table public.crm_inbound_messages enable row level security;
alter table public.gmail_sync_state      enable row level security;

-- (No policies = only the service-role key can read/write. That is the intent.)
