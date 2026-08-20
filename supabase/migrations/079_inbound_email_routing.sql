-- Inbound customer email replies landing in Bestie's shared mailbox.
--
-- Bestie sends every email from one address, so a customer's reply used to
-- arrive at bestie@ldrsgroup.com and sit there unanswered. Outbound mail now
-- carries the brand's Reply-To, but replies to older threads keep arriving, so
-- the Gmail poller forwards them to the right business.
--
-- This table exists for DEDUP: the poller re-reads a 2-day window every 10
-- minutes, and without a record of what was already forwarded each reply would
-- be sent to the brand ~288 times.
create table if not exists inbound_email_routing (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,   -- Gmail message id — the dedup key
  sender text not null,
  subject text,
  account_id uuid references accounts(id) on delete set null,
  ticket_id uuid references support_requests(id) on delete set null,
  matched_by text,                             -- 'ticket_code' | 'sender_email' | null
  forwarded_to text,                           -- the brand address it was sent to
  outcome text not null,                       -- 'forwarded' | 'unmatched' | 'no_brand_address' | 'error'
  note text,
  created_at timestamptz not null default now()
);

create index if not exists inbound_email_routing_account_idx
  on inbound_email_routing (account_id, created_at desc);
create index if not exists inbound_email_routing_outcome_idx
  on inbound_email_routing (outcome, created_at desc);

-- Service-role only: written by a cron, never touched by a browser client.
alter table inbound_email_routing enable row level security;
