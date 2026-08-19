-- Provisional seed for account_contracts (Task 11, Ruling R18).
--
-- Ruling R18 REPLACES the plan's Step 3, which hardcoded channel lists
-- "confirmed with Ido" — that confirmation never happened and must not be
-- invented. Every expected_channels value below is instead inferred from
-- real traffic observed on 2026-08-19, queried directly from the tables the
-- health board itself reads:
--
--   widget     <- account has >0 rows in install_pings (account_id)
--   chat_page  <- account has >0 rows in chat_sessions (account_id)
--   whatsapp   <- account has >0 rows in whatsapp_cs_sessions (active_account_id)
--   instagram  <- left out entirely; nothing in this plan produces evidence for it
--
-- Evidence (counts at seed time, 2026-08-19):
--
--   username               install_pings  chat_sessions  whatsapp_cs_sessions  -> expected_channels
--   argania_group          42             3359           168                   widget, chat_page, whatsapp
--   studiopasha_fashion    29             1357           162                   widget, chat_page, whatsapp
--   labeaute.israel        45             2682           43                    widget, chat_page, whatsapp
--   ldrs_group             6              237            0                     widget, chat_page
--   hamania.israel         0              6              0                     chat_page            (trial, ends 2026-09-12)
--   kuni_il                0              2              0                     chat_page
--   triroars               0              1              0                     chat_page
--   influencermarketing.ai 0              24             0                     chat_page
--
-- This deliberately UNDER-claims: a channel that was genuinely sold but never
-- installed is simply absent from the checklist rather than shown red. Every
-- row is stamped with a PROVISIONAL note so nobody mistakes this for a real
-- contract record. contract_start/contract_end are left null (unknown).
-- owner is left null rather than guessing an email. trial_end is set only for
-- החמניה, a known trial (see the trial-reminders cron, 2026-08-17).
--
-- All 8 usernames below were verified to resolve against `accounts` before
-- this file was run (see task-11-report.md for the verification query).

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page','whatsapp'], null,
       'PROVISIONAL — inferred from observed traffic 2026-08-19, needs Ido confirmation'
from accounts where config->>'username' = 'argania_group'
on conflict (account_id) do update set
  expected_channels = excluded.expected_channels,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page','whatsapp'], null,
       'PROVISIONAL — inferred from observed traffic 2026-08-19, needs Ido confirmation'
from accounts where config->>'username' = 'studiopasha_fashion'
on conflict (account_id) do update set
  expected_channels = excluded.expected_channels,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page','whatsapp'], null,
       'PROVISIONAL — inferred from observed traffic 2026-08-19, needs Ido confirmation'
from accounts where config->>'username' = 'labeaute.israel'
on conflict (account_id) do update set
  expected_channels = excluded.expected_channels,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page'], null,
       'PROVISIONAL — inferred from observed traffic 2026-08-19, needs Ido confirmation'
from accounts where config->>'username' = 'ldrs_group'
on conflict (account_id) do update set
  expected_channels = excluded.expected_channels,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();

-- Trial, ends 2026-09-12 (see the trial-reminders cron). No widget traffic
-- observed for this account, so widget is NOT included here even though the
-- brief's superseded Step 3 listed it.
insert into account_contracts (account_id, expected_channels, trial_end, owner, notes)
select id, array['chat_page'], '2026-09-12', null,
       'PROVISIONAL — inferred from observed traffic 2026-08-19, needs Ido confirmation'
from accounts where config->>'username' = 'hamania.israel'
on conflict (account_id) do update set
  expected_channels = excluded.expected_channels,
  trial_end = excluded.trial_end,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();

-- No widget traffic observed, so widget is NOT included here even though the
-- brief's superseded Step 3 listed it.
insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['chat_page'], null,
       'PROVISIONAL — inferred from observed traffic 2026-08-19, needs Ido confirmation'
from accounts where config->>'username' = 'kuni_il'
on conflict (account_id) do update set
  expected_channels = excluded.expected_channels,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();

-- Not in the brief's superseded Step 3, but named as a candidate account in
-- Ruling R18 (non-demo, non-crmOnly). Only chat_page traffic observed.
insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['chat_page'], null,
       'PROVISIONAL — inferred from observed traffic 2026-08-19, needs Ido confirmation'
from accounts where config->>'username' = 'triroars'
on conflict (account_id) do update set
  expected_channels = excluded.expected_channels,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();

-- Not in the brief's superseded Step 3, but named as a candidate account in
-- Ruling R18 (non-demo, non-crmOnly). Only chat_page traffic observed.
insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['chat_page'], null,
       'PROVISIONAL — inferred from observed traffic 2026-08-19, needs Ido confirmation'
from accounts where config->>'username' = 'influencermarketing.ai'
on conflict (account_id) do update set
  expected_channels = excluded.expected_channels,
  owner = excluded.owner,
  notes = excluded.notes,
  updated_at = now();
