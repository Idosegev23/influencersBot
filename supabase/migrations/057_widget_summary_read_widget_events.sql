-- supabase/migrations/057_widget_summary_read_widget_events.sql
-- Phase B cutover: repoint widget_analytics_summary engagement source from the
-- legacy `events` (mode='widget') to the new `widget_events` pipeline.
-- Shape unchanged ({type,count}); only the engagement subquery FROM changes.
-- APPLY AT CUTOVER (after collectors ship + drain populates widget_events),
-- NOT before — applying against an empty widget_events blanks the dashboard.

CREATE OR REPLACE FUNCTION public.widget_analytics_summary(p_account_id uuid, p_since timestamptz)
RETURNS json LANGUAGE sql STABLE AS $function$
  SELECT json_build_object(
    'rec_total',  (SELECT count(*) FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since),
    'rec_clicks', (SELECT count(*) FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since AND was_clicked),
    'rec_by_product', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT product_name AS name, count(*)::int AS count,
               count(*) FILTER (WHERE was_clicked)::int AS clicks
        FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since
        GROUP BY product_name ORDER BY count(*) DESC LIMIT 15) t),
    'rec_by_strategy', (
      SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM (
        SELECT coalesce(strategy, 'unknown') AS strategy, count(*)::int AS count,
               count(*) FILTER (WHERE was_clicked)::int AS clicks
        FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since
        GROUP BY strategy ORDER BY count(*) DESC) s),
    'session_count', (SELECT count(*) FROM chat_sessions WHERE account_id = p_account_id AND created_at >= p_since),
    'product_count', (SELECT count(*) FROM widget_products WHERE account_id = p_account_id),
    'engagement', (
      SELECT coalesce(json_agg(row_to_json(e)), '[]'::json) FROM (
        SELECT type, count(*)::int AS count
        FROM widget_events
        WHERE account_id = p_account_id AND created_at >= p_since
        GROUP BY type ORDER BY count(*) DESC) e)
  );
$function$;
