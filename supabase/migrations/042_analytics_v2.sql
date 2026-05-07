-- 042: Internal per-account analytics v2
-- Adds attribution columns to chat_visits, session lifecycle to chat_sessions,
-- and three side tables: analytics_daily_rollup, gsc_query_daily, analytics_provisioning.
-- Auto-provisions analytics_provisioning row on account insert via trigger.

BEGIN;

-- chat_visits: full attribution
ALTER TABLE chat_visits
  ADD COLUMN IF NOT EXISTS utm_source     TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium     TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign   TEXT,
  ADD COLUMN IF NOT EXISTS utm_term       TEXT,
  ADD COLUMN IF NOT EXISTS utm_content    TEXT,
  ADD COLUMN IF NOT EXISTS gclid          TEXT,
  ADD COLUMN IF NOT EXISTS fbclid         TEXT,
  ADD COLUMN IF NOT EXISTS ttclid         TEXT,
  ADD COLUMN IF NOT EXISTS landing_path   TEXT,
  ADD COLUMN IF NOT EXISTS referrer_host  TEXT,
  ADD COLUMN IF NOT EXISTS device         TEXT,
  ADD COLUMN IF NOT EXISTS country        TEXT,
  ADD COLUMN IF NOT EXISTS language       TEXT,
  ADD COLUMN IF NOT EXISTS is_returning   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_visits_utm_campaign
  ON chat_visits(account_id, utm_campaign, created_at DESC)
  WHERE utm_campaign IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_visits_returning
  ON chat_visits(account_id, is_returning, created_at DESC);

-- chat_sessions: lifecycle + exit tracking. created_at already serves as start.
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS last_event_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_sec   INTEGER,
  ADD COLUMN IF NOT EXISTS exit_kind      TEXT,
  ADD COLUMN IF NOT EXISTS first_tab      TEXT,
  ADD COLUMN IF NOT EXISTS last_tab       TEXT,
  ADD COLUMN IF NOT EXISTS is_new_visitor BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_ended_at
  ON chat_sessions(account_id, ended_at DESC)
  WHERE ended_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_open
  ON chat_sessions(account_id, last_event_at)
  WHERE ended_at IS NULL;

-- Daily rollup: pre-aggregated metrics per account/date/source/device.
CREATE TABLE IF NOT EXISTS analytics_daily_rollup (
  account_id            UUID    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date                  DATE    NOT NULL,
  ref_source            TEXT    NOT NULL DEFAULT '',
  device                TEXT    NOT NULL DEFAULT '',
  visits                INTEGER NOT NULL DEFAULT 0,
  unique_visitors       INTEGER NOT NULL DEFAULT 0,
  new_visitors          INTEGER NOT NULL DEFAULT 0,
  returning_visitors    INTEGER NOT NULL DEFAULT 0,
  sessions              INTEGER NOT NULL DEFAULT 0,
  sessions_with_message INTEGER NOT NULL DEFAULT 0,
  messages_user         INTEGER NOT NULL DEFAULT 0,
  messages_bot          INTEGER NOT NULL DEFAULT 0,
  leads                 INTEGER NOT NULL DEFAULT 0,
  support_tickets       INTEGER NOT NULL DEFAULT 0,
  coupon_copies         INTEGER NOT NULL DEFAULT 0,
  external_exits        INTEGER NOT NULL DEFAULT 0,
  back_to_ig            INTEGER NOT NULL DEFAULT 0,
  back_to_site          INTEGER NOT NULL DEFAULT 0,
  avg_duration_sec      INTEGER NOT NULL DEFAULT 0,
  bounce_count          INTEGER NOT NULL DEFAULT 0,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, date, ref_source, device)
);

CREATE INDEX IF NOT EXISTS idx_analytics_rollup_account_date
  ON analytics_daily_rollup(account_id, date DESC);

-- Search Console daily query rows.
CREATE TABLE IF NOT EXISTS gsc_query_daily (
  id          BIGSERIAL PRIMARY KEY,
  account_id  UUID    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date        DATE    NOT NULL,
  query       TEXT    NOT NULL,
  page        TEXT    NOT NULL DEFAULT '',
  clicks      INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr         NUMERIC(8,4) NOT NULL DEFAULT 0,
  position    NUMERIC(8,2) NOT NULL DEFAULT 0,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, date, query, page)
);

CREATE INDEX IF NOT EXISTS idx_gsc_account_date
  ON gsc_query_daily(account_id, date DESC, clicks DESC);

-- Per-account analytics config + GSC connection state.
CREATE TABLE IF NOT EXISTS analytics_provisioning (
  account_id        UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  gsc_site_url      TEXT,
  gsc_refresh_token TEXT,
  gsc_connected_at  TIMESTAMPTZ,
  gsc_status        TEXT NOT NULL DEFAULT 'pending',
  gsc_last_fetch    TIMESTAMPTZ,
  retention_days    INTEGER NOT NULL DEFAULT 365,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_provisioning_gsc
  ON analytics_provisioning(gsc_status)
  WHERE gsc_site_url IS NOT NULL;

-- Auto-provision a row whenever a new account is created.
CREATE OR REPLACE FUNCTION on_account_insert_provision_analytics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO analytics_provisioning (account_id)
  VALUES (NEW.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_account_insert_analytics ON accounts;
CREATE TRIGGER tr_account_insert_analytics
  AFTER INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION on_account_insert_provision_analytics();

-- Backfill: ensure every existing account has an analytics_provisioning row.
INSERT INTO analytics_provisioning (account_id)
SELECT id FROM accounts
ON CONFLICT (account_id) DO NOTHING;

-- Extend events.mode to allow analytics surfaces ('chat','widget') in
-- addition to the existing creator/brand persona modes used by the
-- engines pipeline.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_mode_check;
ALTER TABLE events ADD CONSTRAINT events_mode_check
  CHECK (mode::text = ANY (ARRAY['creator','brand','chat','widget']::text[]));

-- Anomaly alerts: dedicated table so we don't have to satisfy
-- in_app_notifications.user_id NOT NULL. Cron writes one row per
-- (account, day, metric) when yesterday drops >50% from 14-day baseline.
CREATE TABLE IF NOT EXISTS analytics_anomalies (
  id          BIGSERIAL PRIMARY KEY,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  detected_on DATE NOT NULL,
  metric      TEXT NOT NULL,
  yesterday   NUMERIC NOT NULL,
  baseline    NUMERIC NOT NULL,
  delta_pct   NUMERIC NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'warning',
  details     JSONB NOT NULL DEFAULT '{}',
  acknowledged_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, detected_on, metric)
);

CREATE INDEX IF NOT EXISTS idx_analytics_anomalies_account
  ON analytics_anomalies(account_id, detected_on DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_anomalies_open
  ON analytics_anomalies(account_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- Add aggregate columns for conversation starters + dynamic CTA clicks.
ALTER TABLE analytics_daily_rollup
  ADD COLUMN IF NOT EXISTS dynamic_clicks         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversation_starters  INTEGER NOT NULL DEFAULT 0;

-- Daily rollup function. Re-run idempotently on a window of days
-- (default 3) and UPSERT into analytics_daily_rollup. Counts both
-- the legacy engines events (message_received / response_sent /
-- support_started / link_opened) and the new client pipeline names
-- (chat_message_*, support_ticket_submitted, external_link_clicked,
-- back_to_*, starter_pill_clicked, etc.) so the rollup is correct
-- regardless of which surface fired the event.
CREATE OR REPLACE FUNCTION analytics_daily_rollup_run(window_days INT DEFAULT 3)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INT := 0;
BEGIN
  INSERT INTO analytics_daily_rollup AS r (
    account_id, date, ref_source, device,
    visits, unique_visitors, new_visitors, returning_visitors,
    sessions, sessions_with_message,
    messages_user, messages_bot,
    leads, support_tickets, coupon_copies,
    external_exits, back_to_ig, back_to_site,
    conversation_starters, dynamic_clicks,
    avg_duration_sec, bounce_count, computed_at
  )
  WITH visits AS (
    SELECT
      cv.account_id,
      (cv.created_at AT TIME ZONE 'UTC')::date AS date,
      COALESCE(cv.ref_source, '') AS ref_source,
      COALESCE(cv.device, '') AS device,
      COUNT(*) AS visits,
      COUNT(DISTINCT cv.anon_id) FILTER (WHERE cv.anon_id IS NOT NULL) AS unique_visitors,
      COUNT(*) FILTER (WHERE NOT cv.is_returning) AS new_visitors,
      COUNT(*) FILTER (WHERE cv.is_returning) AS returning_visitors
    FROM chat_visits cv
    WHERE cv.created_at >= (CURRENT_DATE - (window_days - 1) * INTERVAL '1 day')
      AND cv.created_at < (CURRENT_DATE + INTERVAL '1 day')
    GROUP BY 1, 2, 3, 4
  ),
  sessions AS (
    SELECT
      cs.account_id,
      (cs.created_at AT TIME ZONE 'UTC')::date AS date,
      COALESCE(cs.ref_source, '') AS ref_source,
      ''::text AS device,
      COUNT(*) AS sessions,
      COUNT(*) FILTER (WHERE cs.message_count > 0) AS sessions_with_message,
      COALESCE(AVG(cs.duration_sec) FILTER (WHERE cs.duration_sec IS NOT NULL), 0)::int AS avg_duration_sec,
      COUNT(*) FILTER (WHERE cs.message_count <= 1) AS bounce_count
    FROM chat_sessions cs
    WHERE cs.created_at >= (CURRENT_DATE - (window_days - 1) * INTERVAL '1 day')
      AND cs.created_at < (CURRENT_DATE + INTERVAL '1 day')
    GROUP BY 1, 2, 3, 4
  ),
  events_agg AS (
    SELECT
      e.account_id,
      (e.created_at AT TIME ZONE 'UTC')::date AS date,
      ''::text AS ref_source,
      ''::text AS device,
      COUNT(*) FILTER (WHERE e.type IN ('chat_message_sent','message_received')) AS messages_user,
      COUNT(*) FILTER (WHERE e.type IN ('chat_message_received','response_sent')) AS messages_bot,
      COUNT(*) FILTER (WHERE e.type IN ('lead_form_submitted','meeting_request_submitted','widget_lead_submitted')) AS leads,
      COUNT(*) FILTER (WHERE e.type IN ('support_ticket_submitted','support_started')) AS support_tickets,
      COUNT(*) FILTER (WHERE e.type = 'coupon_copied') AS coupon_copies,
      COUNT(*) FILTER (WHERE e.type IN ('external_link_clicked','link_opened')) AS external_exits,
      COUNT(*) FILTER (WHERE e.type = 'back_to_instagram_clicked') AS back_to_ig,
      COUNT(*) FILTER (WHERE e.type = 'back_to_website_clicked') AS back_to_site,
      COUNT(*) FILTER (WHERE e.type IN (
        'starter_pill_clicked','suggestion_pill_clicked','conversation_starter_clicked','meeting_pill_clicked'
      )) AS conversation_starters,
      COUNT(*) FILTER (WHERE e.type IN (
        'dynamic_cta_clicked','product_card_clicked','product_buy_clicked','product_clicked',
        'brand_card_opened','service_card_opened','topic_question_clicked','topic_card_clicked',
        'case_study_clicked','reel_clicked','highlight_clicked','content_card_clicked',
        'discovery_category_opened','quick_action_clicked','card_clicked','coupon_revealed','coupon_redeemed_clicked'
      )) AS dynamic_clicks
    FROM events e
    WHERE e.created_at >= (CURRENT_DATE - (window_days - 1) * INTERVAL '1 day')
      AND e.created_at < (CURRENT_DATE + INTERVAL '1 day')
    GROUP BY 1, 2, 3, 4
  ),
  combined AS (
    SELECT account_id, date, ref_source, device,
           visits, unique_visitors, new_visitors, returning_visitors,
           0::int AS sessions, 0::int AS sessions_with_message,
           0::int AS messages_user, 0::int AS messages_bot,
           0::int AS leads, 0::int AS support_tickets, 0::int AS coupon_copies,
           0::int AS external_exits, 0::int AS back_to_ig, 0::int AS back_to_site,
           0::int AS conversation_starters, 0::int AS dynamic_clicks,
           0::int AS avg_duration_sec, 0::int AS bounce_count
    FROM visits
    UNION ALL
    SELECT account_id, date, ref_source, device,
           0, 0, 0, 0,
           sessions, sessions_with_message,
           0, 0, 0, 0, 0, 0, 0, 0,
           0, 0,
           avg_duration_sec, bounce_count
    FROM sessions
    UNION ALL
    SELECT account_id, date, ref_source, device,
           0, 0, 0, 0, 0, 0,
           messages_user, messages_bot,
           leads, support_tickets, coupon_copies,
           external_exits, back_to_ig, back_to_site,
           conversation_starters, dynamic_clicks,
           0, 0
    FROM events_agg
  )
  SELECT
    account_id, date, ref_source, device,
    SUM(visits)::int, SUM(unique_visitors)::int,
    SUM(new_visitors)::int, SUM(returning_visitors)::int,
    SUM(sessions)::int, SUM(sessions_with_message)::int,
    SUM(messages_user)::int, SUM(messages_bot)::int,
    SUM(leads)::int, SUM(support_tickets)::int, SUM(coupon_copies)::int,
    SUM(external_exits)::int, SUM(back_to_ig)::int, SUM(back_to_site)::int,
    SUM(conversation_starters)::int, SUM(dynamic_clicks)::int,
    MAX(avg_duration_sec)::int, SUM(bounce_count)::int,
    NOW()
  FROM combined
  GROUP BY account_id, date, ref_source, device
  ON CONFLICT (account_id, date, ref_source, device) DO UPDATE SET
    visits = EXCLUDED.visits,
    unique_visitors = EXCLUDED.unique_visitors,
    new_visitors = EXCLUDED.new_visitors,
    returning_visitors = EXCLUDED.returning_visitors,
    sessions = EXCLUDED.sessions,
    sessions_with_message = EXCLUDED.sessions_with_message,
    messages_user = EXCLUDED.messages_user,
    messages_bot = EXCLUDED.messages_bot,
    leads = EXCLUDED.leads,
    support_tickets = EXCLUDED.support_tickets,
    coupon_copies = EXCLUDED.coupon_copies,
    external_exits = EXCLUDED.external_exits,
    back_to_ig = EXCLUDED.back_to_ig,
    back_to_site = EXCLUDED.back_to_site,
    conversation_starters = EXCLUDED.conversation_starters,
    dynamic_clicks = EXCLUDED.dynamic_clicks,
    avg_duration_sec = EXCLUDED.avg_duration_sec,
    bounce_count = EXCLUDED.bounce_count,
    computed_at = NOW();

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

COMMIT;
