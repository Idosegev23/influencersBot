-- Migration 076: coexistence echo timestamps for the 6h auto-resume (spec D7).
-- Plan: docs/superpowers/plans/2026-08-16-byo-whatsapp-customer-onboarding.md Task 6
--
-- When a human replies from the WhatsApp Business app on their phone, Meta sends us an
-- smb_message_echoes webhook. We pause the bot and record WHEN, so the pause can expire
-- after N hours of human silence instead of needing a manual undo.

alter table public.whatsapp_cs_sessions
  add column if not exists human_last_reply_at timestamptz;

comment on column public.whatsapp_cs_sessions.human_last_reply_at is
  'Last time a human replied from the WhatsApp Business app (smb_message_echoes). Drives the 6h auto-resume (spec D7).';
