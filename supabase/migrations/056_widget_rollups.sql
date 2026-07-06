-- supabase/migrations/056_widget_rollups.sql
-- Phase B: rollup tables + widget_rollup_run RPC (30-min gap sessionization,
-- idempotent UPSERT — mirrors analytics_daily_rollup_run).

CREATE TABLE IF NOT EXISTS widget_sessions (
  account_id   uuid NOT NULL,
  anon_id      text NOT NULL,
  session_key  text NOT NULL,
  first_seen   timestamptz NOT NULL,
  last_seen    timestamptz NOT NULL,
  duration_sec int NOT NULL DEFAULT 0,
  page_count   int NOT NULL DEFAULT 0,
  max_scroll_pct int NOT NULL DEFAULT 0,
  product_views int NOT NULL DEFAULT 0,
  cart_max_value numeric NOT NULL DEFAULT 0,
  opened_widget bool NOT NULL DEFAULT false,
  sent_message  bool NOT NULL DEFAULT false,
  message_count int NOT NULL DEFAULT 0,
  entry_path   text,
  exit_path    text,
  PRIMARY KEY (account_id, session_key)
);

CREATE TABLE IF NOT EXISTS widget_daily_stats (
  account_id uuid NOT NULL,
  day        date NOT NULL,
  sessions   int NOT NULL DEFAULT 0,
  unique_visitors int NOT NULL DEFAULT 0,
  widget_opens int NOT NULL DEFAULT 0,
  messages   int NOT NULL DEFAULT 0,
  product_views int NOT NULL DEFAULT 0,
  add_to_carts int NOT NULL DEFAULT 0,
  avg_scroll_pct int NOT NULL DEFAULT 0,
  avg_duration_sec int NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE IF NOT EXISTS widget_rollup_state (
  id int PRIMARY KEY DEFAULT 1,
  last_run_at timestamptz,
  CHECK (id = 1)
);
INSERT INTO widget_rollup_state (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION widget_rollup_run(window_days int DEFAULT 3)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  since timestamptz := now() - make_interval(days => window_days);
  n int := 0;
BEGIN
  WITH ordered AS (
    SELECT *,
      CASE WHEN lag(created_at) OVER w IS NULL
                OR created_at - lag(created_at) OVER w > interval '30 minutes'
           THEN 1 ELSE 0 END AS is_new
    FROM widget_events
    WHERE created_at >= since AND anon_id IS NOT NULL
    WINDOW w AS (PARTITION BY account_id, anon_id ORDER BY created_at)
  ),
  keyed AS (
    SELECT *,
      account_id::text || '#' || anon_id || '#' ||
      extract(epoch FROM max(created_at) FILTER (WHERE is_new = 1)
              OVER (PARTITION BY account_id, anon_id ORDER BY created_at))::bigint AS session_key
    FROM ordered
  ),
  sess AS (
    SELECT account_id, anon_id, session_key,
      min(created_at) AS first_seen, max(created_at) AS last_seen,
      greatest(0, extract(epoch FROM max(created_at)-min(created_at))::int) AS duration_sec,
      count(*) FILTER (WHERE type='page_view') AS page_count,
      coalesce(max((payload->>'pct')::int) FILTER (WHERE type='scroll_depth'),0) AS max_scroll_pct,
      count(*) FILTER (WHERE type='product_view') AS product_views,
      coalesce(max((payload->>'value')::numeric) FILTER (WHERE type='cart_state'),0) AS cart_max_value,
      bool_or(type='widget_opened') AS opened_widget,
      bool_or(type='widget_message_sent') AS sent_message,
      count(*) FILTER (WHERE type='widget_message_sent') AS message_count,
      (array_agg(path ORDER BY created_at) FILTER (WHERE path IS NOT NULL))[1] AS entry_path,
      (array_agg(path ORDER BY created_at DESC) FILTER (WHERE path IS NOT NULL))[1] AS exit_path
    FROM keyed GROUP BY account_id, anon_id, session_key
  ),
  up_sessions AS (
    INSERT INTO widget_sessions AS s
      (account_id, anon_id, session_key, first_seen, last_seen, duration_sec,
       page_count, max_scroll_pct, product_views, cart_max_value, opened_widget,
       sent_message, message_count, entry_path, exit_path)
    SELECT account_id, anon_id, session_key, first_seen, last_seen, duration_sec,
       page_count, max_scroll_pct, product_views, cart_max_value, opened_widget,
       sent_message, message_count, entry_path, exit_path FROM sess
    ON CONFLICT (account_id, session_key) DO UPDATE SET
      last_seen=excluded.last_seen, duration_sec=excluded.duration_sec,
      page_count=excluded.page_count, max_scroll_pct=excluded.max_scroll_pct,
      product_views=excluded.product_views, cart_max_value=excluded.cart_max_value,
      opened_widget=excluded.opened_widget, sent_message=excluded.sent_message,
      message_count=excluded.message_count, exit_path=excluded.exit_path
    RETURNING 1
  )
  SELECT count(*) INTO n FROM up_sessions;

  INSERT INTO widget_daily_stats AS d
    (account_id, day, sessions, unique_visitors, widget_opens, messages,
     product_views, add_to_carts, avg_scroll_pct, avg_duration_sec)
  SELECT s.account_id, s.first_seen::date AS day,
    count(*), count(DISTINCT s.anon_id),
    count(*) FILTER (WHERE s.opened_widget), sum(s.message_count),
    sum(s.product_views),
    coalesce(max(cc.cart_changes), 0),
    coalesce(avg(s.max_scroll_pct)::int,0), coalesce(avg(s.duration_sec)::int,0)
  FROM widget_sessions s
  LEFT JOIN (
    SELECT account_id, created_at::date AS day, count(*) AS cart_changes
    FROM widget_events WHERE type='cart_change' AND created_at >= since
    GROUP BY account_id, created_at::date
  ) cc ON cc.account_id = s.account_id AND cc.day = s.first_seen::date
  WHERE s.first_seen >= since
  GROUP BY s.account_id, s.first_seen::date
  ON CONFLICT (account_id, day) DO UPDATE SET
    sessions=excluded.sessions, unique_visitors=excluded.unique_visitors,
    widget_opens=excluded.widget_opens, messages=excluded.messages,
    product_views=excluded.product_views, add_to_carts=excluded.add_to_carts,
    avg_scroll_pct=excluded.avg_scroll_pct, avg_duration_sec=excluded.avg_duration_sec;

  UPDATE widget_rollup_state SET last_run_at = now() WHERE id = 1;
  RETURN n;
END $$;
