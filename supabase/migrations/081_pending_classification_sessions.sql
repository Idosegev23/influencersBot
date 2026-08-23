-- ==================================================
-- Migration 081: pending_classification_sessions
-- ==================================================
-- Anti-join in SQL so the classifier's pagination actually advances.
--
-- The first implementation fetched the newest N sessions and filtered out the
-- already-classified ones in JS. Once the newest N were done every later round
-- got an empty set and the backfill stopped at 100 of 3,605 sessions. The
-- exclusion has to happen before LIMIT, which means it has to happen here.
--
-- Also coalesces the settle timestamp: 245 of Argania's sessions have a NULL
-- last_turn_at (it arrived in migration 072), and `NULL < x` is NULL, not true,
-- so they were invisible to the old filter.
-- ==================================================

CREATE OR REPLACE FUNCTION public.pending_classification_sessions(
  p_account_id     UUID,
  p_since          TIMESTAMPTZ DEFAULT NULL,
  p_limit          INTEGER DEFAULT 100,
  p_settle_minutes INTEGER DEFAULT 30,
  p_max_attempts   INTEGER DEFAULT 3
)
RETURNS TABLE (
  id         UUID,
  anon_id    TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT s.id, s.anon_id, s.created_at
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
  'Sessions still needing classification. The NOT EXISTS runs before LIMIT — filtering after LIMIT is what stalled the first backfill at 100 rows.';

REVOKE ALL ON FUNCTION public.pending_classification_sessions FROM PUBLIC, anon, authenticated;
