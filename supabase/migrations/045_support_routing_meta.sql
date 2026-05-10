-- Support routing metadata: when an inbound WhatsApp reply is routed to
-- a ticket via heuristics (recent outbound / phone fallback), record how
-- we matched and whether the choice was ambiguous (several distinct
-- accounts had outbound activity to the same phone in the same window).
-- The UI surfaces a "may belong to another ticket" banner when
-- ambiguous=true and offers a one-click re-attach.
--
-- Shape:
--   {
--     matched_by: 'context' | 'recent_outbound' | 'phone',
--     ambiguous: boolean,
--     alternatives: [
--       { ticket_id, account_id, brand, customer_name, last_outbound_at }
--     ]
--   }

ALTER TABLE support_ticket_history
  ADD COLUMN IF NOT EXISTS routing_meta jsonb;
