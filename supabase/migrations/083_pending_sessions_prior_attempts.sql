-- ==================================================
-- Migration 083: prior_attempts on pending_classification_sessions
-- ==================================================
-- The attempt counter never incremented: the classifier's upsert payload omitted
-- `attempts`, so it stayed at 1 and MAX_ATTEMPTS was inert. A session that always
-- fails would be re-picked and re-billed on every hourly run, forever. Return the
-- prior count so the writer can carry it forward.
-- ==================================================

DROP FUNCTION IF EXISTS public.pending_classification_sessions(UUID, TIMESTAMPTZ, INTEGER, INTEGER, INTEGER);

CREATE FUNCTION public.pending_classification_sessions(
  p_account_id     UUID,
  p_since          TIMESTAMPTZ DEFAULT NULL,
  p_limit          INTEGER DEFAULT 100,
  p_settle_minutes INTEGER DEFAULT 30,
  p_max_attempts   INTEGER DEFAULT 3
)
RETURNS TABLE (
  id             UUID,
  anon_id        TEXT,
  created_at     TIMESTAMPTZ,
  prior_attempts INTEGER
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.id,
    s.anon_id,
    s.created_at,
    COALESCE((
      SELECT c.attempts FROM public.conversation_classifications c
      WHERE c.session_id = s.id
    ), 0) AS prior_attempts
  FROM public.chat_sessions s
  WHERE s.account_id = p_account_id
    AND COALESCE(s.last_turn_at, s.updated_at, s.created_at)
        < NOW() - (p_settle_minutes || ' minutes')::INTERVAL
    AND (p_since IS NULL OR s.created_at >= p_since)
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.session_id = s.id AND m.role = 'user'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_classifications c
      WHERE c.session_id = s.id
        AND (c.status <> 'failed' OR c.attempts >= p_max_attempts)
    )
  ORDER BY s.created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.pending_classification_sessions IS
  'Sessions still needing classification, with the attempt count so far. The NOT EXISTS runs before LIMIT — filtering after LIMIT is what stalled the first backfill at 100 rows.';

REVOKE ALL ON FUNCTION public.pending_classification_sessions FROM PUBLIC, anon, authenticated;
