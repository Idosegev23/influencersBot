-- Agency CRM (Phase 0): extend public.users for agent login + forced onboarding.
-- Reuses the EXISTING public.users table (id, auth_user_id, email, role, managed_account_ids[], account_id).
-- No agent_influencers junction table — agent→accounts is the managed_account_ids array.

alter table public.users
  add column if not exists username varchar,
  add column if not exists contact_email varchar,           -- agent's REAL email (inbound-email matching key)
  add column if not exists whatsapp varchar,                -- agent's WhatsApp E.164/waId (inbound-WhatsApp matching key)
  add column if not exists must_change_password boolean not null default false,
  add column if not exists onboarding_completed boolean not null default false;

-- Unique username (case-insensitive) when present.
create unique index if not exists users_username_unique
  on public.users (lower(username)) where username is not null;

-- Fast lookups for inbound ingestion attribution.
create index if not exists users_contact_email_idx
  on public.users (lower(contact_email)) where contact_email is not null;
create index if not exists users_whatsapp_idx
  on public.users (whatsapp) where whatsapp is not null;

comment on column public.users.username is 'Agent/admin login username (admin reserved). Unique, case-insensitive.';
comment on column public.users.contact_email is 'Agent real email; matching key for inbound-email quote ingestion.';
comment on column public.users.whatsapp is 'Agent WhatsApp number (digits, no +); matching key for inbound-WhatsApp quote ingestion.';
comment on column public.users.must_change_password is 'True for freshly-provisioned agents; forces password change on first login.';
comment on column public.users.onboarding_completed is 'False until agent completes required profile (contact_email + whatsapp).';
