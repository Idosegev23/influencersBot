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

COMMIT;
