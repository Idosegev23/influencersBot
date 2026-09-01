-- Whether mail to an address can actually be delivered.
--
-- Keyed by ADDRESS, not by ticket, deliberately: "this address is dead" is a fact about the
-- address, and the same address turns up in support_requests, bestie_leads, service_briefs
-- and client_contacts at once. One probe serves every surface, the backfill sweep, and the
-- support inbox render without anyone re-probing.
create table if not exists email_deliverability (
  address        text primary key,
  status         text not null check (status in ('ok', 'no_mx', 'bounced')),
  reason         text,
  checked_at     timestamptz not null default now(),
  bounce_count   int not null default 0,
  last_bounce_at timestamptz
);

-- Every read is "show me the addresses that are a problem" — the ok rows are the bulk and
-- are never scanned.
create index if not exists email_deliverability_bad_idx
  on email_deliverability (status) where status <> 'ok';
