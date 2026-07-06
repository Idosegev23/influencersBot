-- supabase/migrations/055_widget_events_partitioned.sql
-- Phase B: dedicated scalable widget behavioral pipeline — partitioned raw store.
-- Monthly RANGE partitions; 90-day retention via DROP PARTITION.

CREATE TABLE IF NOT EXISTS widget_events (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  account_id  uuid NOT NULL,
  anon_id     text,
  session_id  uuid,
  event_uid   text,               -- client-generated dedupe key
  type        text NOT NULL,
  path        text,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS widget_events_acct_time_type
  ON widget_events (account_id, created_at DESC, type);
CREATE UNIQUE INDEX IF NOT EXISTS widget_events_uid_uniq
  ON widget_events (account_id, event_uid, created_at)
  WHERE event_uid IS NOT NULL;

-- Create a month partition for a given date if absent.
CREATE OR REPLACE FUNCTION widget_events_ensure_partition(p_month date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  start_ts date := date_trunc('month', p_month);
  end_ts   date := (date_trunc('month', p_month) + interval '1 month');
  part     text := 'widget_events_' || to_char(start_ts, 'YYYYMM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF widget_events FOR VALUES FROM (%L) TO (%L)',
      part, start_ts, end_ts);
  END IF;
END $$;

-- Ensure current + next month exist.
CREATE OR REPLACE FUNCTION widget_events_ensure_partitions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM widget_events_ensure_partition(current_date);
  PERFORM widget_events_ensure_partition((current_date + interval '1 month')::date);
END $$;

-- Drop partitions whose whole month is older than retention_days.
CREATE OR REPLACE FUNCTION widget_events_drop_old_partitions(retention_days int DEFAULT 90)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r record; dropped int := 0; cutoff date := current_date - retention_days;
BEGIN
  FOR r IN
    SELECT c.relname,
           to_date(right(c.relname, 6), 'YYYYMM') AS part_month
    FROM pg_class c JOIN pg_inherits i ON i.inhrelid = c.oid
    WHERE i.inhparent = 'widget_events'::regclass
  LOOP
    IF (r.part_month + interval '1 month')::date <= cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS %I', r.relname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END $$;

SELECT widget_events_ensure_partitions();
