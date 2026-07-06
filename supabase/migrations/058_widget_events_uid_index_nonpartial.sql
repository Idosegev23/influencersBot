-- supabase/migrations/058_widget_events_uid_index_nonpartial.sql
-- Fix (review finding): the drain worker uses supabase-js .upsert() with
-- onConflict='account_id,event_uid,created_at'. PostgREST emits a bare
-- ON CONFLICT (cols) with NO predicate, which Postgres refuses to match
-- against a PARTIAL unique index (WHERE event_uid IS NOT NULL) → 42P10 on
-- every insert → silent 0-writes. Recreate the index WITHOUT the partial
-- predicate so it can serve as the ON CONFLICT arbiter. NULL event_uid rows
-- remain distinct (NULLS DISTINCT default) → always inserted, never deduped,
-- which is the intended behavior (only client-supplied uids dedupe retries).

DROP INDEX IF EXISTS widget_events_uid_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS widget_events_uid_uniq
  ON widget_events (account_id, event_uid, created_at);
