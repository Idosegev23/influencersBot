-- Enable Supabase Realtime for the support ticket detail panel.
--
-- The agent dashboard subscribes to INSERTs on support_ticket_history
-- so a customer reply (routed by the WhatsApp webhook) appears in the
-- timeline the instant the webhook handler commits — no 15s polling
-- delay. Polling is kept as a fallback so a missed websocket message
-- doesn't leave the panel stale.
--
-- support_requests is enabled too so live updates of status / tracking
-- changes pushed by other agents on the team show up immediately.

ALTER PUBLICATION supabase_realtime ADD TABLE support_ticket_history;
ALTER PUBLICATION supabase_realtime ADD TABLE support_requests;
