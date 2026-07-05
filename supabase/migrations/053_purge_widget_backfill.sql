-- supabase/migrations/048_purge_widget_backfill.sql
-- Backfill events were synthetic (reconstructed from chat history on 2026-06-14,
-- commit 56670c5). They froze/inflated the widget dashboard headline numbers
-- (~98% of argania_group's widget events). Back up, then delete.
-- Pre-count captured before apply: 1258 rows.

CREATE TABLE IF NOT EXISTS _bkp_events_backfill_20260705 AS
SELECT * FROM events
WHERE mode = 'widget' AND metadata->>'source' = 'backfill_reconstructed';

DELETE FROM events
WHERE mode = 'widget' AND metadata->>'source' = 'backfill_reconstructed';
