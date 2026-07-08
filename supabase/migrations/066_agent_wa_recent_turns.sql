-- Migration 066: raw last-N turns for the WhatsApp agent front-door.
-- The rolling summary (064) is lossy; the router (planFreeform) needs the actual recent turns to
-- resolve follow-up references ("כמה הצעתי לזה", "והמחיר?", "תשנה את זה") instead of asking a
-- needless clarify. Cheap append (no LLM), capped to the last few turns in code (MAX_RECENT_TURNS).
alter table public.crm_agent_wa_memory
  add column if not exists recent_turns jsonb not null default '[]'::jsonb;
