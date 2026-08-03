-- Idle-timeout support for the OpenAI `previous_response_id` conversation chain.
--
-- Chaining makes OpenAI bill the entire accumulated conversation as input on every turn,
-- so a session's cost grows quadratically with turn count. On 2026-07-25 one session
-- (194 messages / 6 hours) drove $205 against a $37/day average, 72% of it billed as
-- `input, long context`. The chain was never cleared because nothing tracked when a
-- session last actually spoke:
--
--   * `updated_at`    — written only on shipping/support state transitions, never on a
--                       normal LLM turn, and chat_sessions has no updated_at trigger.
--   * `last_event_at` — written only by the analytics beacon, so it is absent entirely
--                       for the Instagram DM, Respond.io and widget-embed surfaces.
--
-- `last_turn_at` is written by the same UPDATE that persists `last_response_id`, on all
-- four surfaces, and is therefore the one timestamp that reliably marks a real turn.

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS last_turn_at TIMESTAMPTZ;

COMMENT ON COLUMN chat_sessions.last_turn_at IS
  'When this session last completed an LLM turn. Drives the previous_response_id idle TTL (src/lib/chatbot/chain-ttl.ts). NULL on rows predating the column — treated as stale, i.e. the chain is dropped.';

-- Backfill from the newest message so existing active sessions are not reset on deploy.
UPDATE chat_sessions s
SET last_turn_at = m.last_msg
FROM (
  SELECT session_id, MAX(created_at) AS last_msg
  FROM chat_messages
  GROUP BY session_id
) m
WHERE m.session_id = s.id
  AND s.last_turn_at IS NULL;

-- Supports the budget-alert rollup, which scans recent turns per account.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_turn_at
  ON chat_sessions (last_turn_at DESC)
  WHERE last_turn_at IS NOT NULL;
