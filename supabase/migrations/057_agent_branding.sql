-- Migration 057: agent/agency branding for the quote PDF.
-- Stored as JSONB on the agent's user row: { name, phone, email, address, logo_path, logo_type }.
-- The logo file lives in the private partnership-documents bucket (agency-logos/<agentId>.<ext>).

alter table public.users
  add column if not exists agency jsonb not null default '{}'::jsonb;
