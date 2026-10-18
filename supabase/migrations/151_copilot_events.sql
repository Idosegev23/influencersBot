-- ==================================================
-- Migration 151: Co-Pilot upcoming events
-- ==================================================
-- The association assistant may only suggest an event that has not happened
-- yet. Crawled pages carry dates as prose, so an extractor turns the
-- association's event pages into dated rows here; the chat turn reads only
-- rows whose end (or start) is today or later.
-- ==================================================
create table public.copilot_events (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  title             text not null,
  starts_on         date not null,
  ends_on           date,
  location          text,
  url               text not null,
  registration_url  text,
  summary           text,
  source_url        text,
  extracted_at      timestamptz not null default now(),
  unique (account_id, url, starts_on)
);
create index copilot_events_upcoming_idx on public.copilot_events(account_id, starts_on);
alter table public.copilot_events enable row level security;
revoke all on public.copilot_events from anon, authenticated;
