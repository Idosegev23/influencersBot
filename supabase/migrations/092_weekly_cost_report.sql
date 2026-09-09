-- Weekly cost report aggregates.
--
-- The report needs, per account: this week's model cost and conversations, last week's, and the
-- running all-time totals it is compared against. Doing that in the app would mean pulling every
-- chat_session and every chat_message to the client (26k+ rows) to count them; it belongs here.
--
-- A "conversation" is a chat_session that a person actually spoke in — a session with no user
-- message is a page open, not a conversation, and counting those deflates the per-conversation
-- cost that the pricing ladder is built on. "Turns" are the assistant replies in it.
--
-- CS sessions are included: as of the same change that added this, runCsTurn records its cost
-- like the chat bot does, so both sides of `cost_tracking` now have conversations behind them.

CREATE OR REPLACE FUNCTION weekly_cost_report(p_week_start DATE, p_week_end DATE)
RETURNS TABLE (
  account_id UUID,
  username TEXT,
  week_cost NUMERIC,
  week_conversations BIGINT,
  week_turns BIGINT,
  prev_cost NUMERIC,
  prev_conversations BIGINT,
  all_cost NUMERIC,
  all_conversations BIGINT,
  all_turns BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT p_week_start AS ws,
           p_week_end   AS we,
           (p_week_start - 7) AS pws,
           (p_week_start - 1) AS pwe
  ),
  -- One row per conversation, with its assistant-turn count, resolved once and reused.
  convo AS (
    SELECT s.id,
           s.account_id,
           s.created_at::date AS d,
           COUNT(*) FILTER (WHERE m.role = 'assistant') AS turns
    FROM chat_sessions s
    JOIN chat_messages m ON m.session_id = s.id
    GROUP BY s.id, s.account_id, s.created_at
    HAVING COUNT(*) FILTER (WHERE m.role = 'user') > 0
  ),
  cost AS (
    SELECT c.account_id,
           SUM(c.estimated_cost) FILTER (WHERE c.period_start BETWEEN b.ws AND b.we)   AS week_cost,
           SUM(c.estimated_cost) FILTER (WHERE c.period_start BETWEEN b.pws AND b.pwe) AS prev_cost,
           SUM(c.estimated_cost)                                                        AS all_cost
    FROM cost_tracking c CROSS JOIN bounds b
    WHERE c.period_type = 'day'
    GROUP BY c.account_id
  ),
  conv AS (
    SELECT v.account_id,
           COUNT(*)    FILTER (WHERE v.d BETWEEN b.ws AND b.we)   AS week_conversations,
           SUM(v.turns) FILTER (WHERE v.d BETWEEN b.ws AND b.we)  AS week_turns,
           COUNT(*)    FILTER (WHERE v.d BETWEEN b.pws AND b.pwe) AS prev_conversations,
           COUNT(*)                                               AS all_conversations,
           SUM(v.turns)                                           AS all_turns
    FROM convo v CROSS JOIN bounds b
    GROUP BY v.account_id
  )
  SELECT
    a.id,
    COALESCE(a.config->>'username', a.config->>'display_name', LEFT(a.id::text, 8)) AS username,
    COALESCE(cost.week_cost, 0),
    COALESCE(conv.week_conversations, 0),
    COALESCE(conv.week_turns, 0),
    COALESCE(cost.prev_cost, 0),
    COALESCE(conv.prev_conversations, 0),
    COALESCE(cost.all_cost, 0),
    COALESCE(conv.all_conversations, 0),
    COALESCE(conv.all_turns, 0)
  FROM accounts a
  LEFT JOIN cost ON cost.account_id = a.id
  LEFT JOIN conv ON conv.account_id = a.id
  -- Only accounts that have ever cost or talked; the rest would be rows of zeroes.
  WHERE cost.account_id IS NOT NULL OR conv.account_id IS NOT NULL;
$$;

COMMENT ON FUNCTION weekly_cost_report IS
  'Per-account cost + conversation aggregates for the Sunday cost report: this week, last week, all time.';

-- The daily scan, per account, for the same week. result_summary is the only record of what a
-- scan actually did — nothing writes a cost, which is why the report states that explicitly.
CREATE OR REPLACE FUNCTION weekly_scan_report(p_week_start DATE, p_week_end DATE)
RETURNS TABLE (
  username TEXT,
  runs BIGINT,
  failed_runs BIGINT,
  posts_fetched BIGINT,
  new_posts BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.username,
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT COALESCE((s.result_summary->>'success')::boolean, false)),
    COALESCE(SUM((s.result_summary->'stats'->>'postsCount')::int), 0),
    COALESCE(SUM((s.result_summary->'stats'->>'newPostsCount')::int), 0)
  FROM scan_jobs s
  WHERE s.requested_by = 'cron:daily-scan'
    AND s.created_at::date BETWEEN p_week_start AND p_week_end
  GROUP BY s.username;
$$;

COMMENT ON FUNCTION weekly_scan_report IS
  'Daily-scan runs, failures and fetch yield per account for one week.';

-- What setting an account up cost, for the accounts created in the week. Embeddings only —
-- they are the one part of the pipeline whose token count is recorded.
CREATE OR REPLACE FUNCTION weekly_setup_report(p_week_start DATE, p_week_end DATE)
RETURNS TABLE (
  username TEXT,
  created_at DATE,
  chunks BIGINT,
  embed_tokens BIGINT,
  scan_jobs BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(a.config->>'username', LEFT(a.id::text, 8)) AS username,
    a.created_at::date,
    (SELECT COUNT(*)                    FROM document_chunks dc WHERE dc.account_id = a.id),
    (SELECT COALESCE(SUM(dc.token_count), 0) FROM document_chunks dc WHERE dc.account_id = a.id),
    (SELECT COUNT(*)                    FROM scan_jobs sj WHERE sj.account_id = a.id)
  FROM accounts a
  WHERE a.created_at::date BETWEEN p_week_start AND p_week_end;
$$;

COMMENT ON FUNCTION weekly_setup_report IS
  'Measured setup footprint (embeddings, chunks, scan jobs) for accounts created in one week.';
