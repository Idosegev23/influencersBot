-- supabase/migrations/059_widget_events_default_partition.sql
-- Fix (final review): a clock-skewed client Date.now() produces a created_at
-- with no matching monthly partition (only current+next exist). Without a
-- DEFAULT partition the whole bulk upsert fails (23514), the drain treats it
-- as a transient error and never LTRIMs, so the poison batch re-fails every
-- minute — wedging the single shared buffer for ALL accounts. A DEFAULT
-- partition guarantees every row lands somewhere; out-of-range rows sit here
-- harmlessly, excluded from the rolling rollup window (WHERE created_at >= since).
-- The normalizer also clamps egregiously-future timestamps to now() so the
-- DEFAULT never holds future-month rows (which would block creating that
-- month's real partition later).

CREATE TABLE IF NOT EXISTS widget_events_default PARTITION OF widget_events DEFAULT;
