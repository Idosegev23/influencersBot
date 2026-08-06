-- 073: close the anon-grant regression and fix its root cause.
--
-- Five objects created AFTER the 2026-07-18 `revoke_anon_table_grants` migration inherited
-- full ALL grants for anon/authenticated from pg_default_acl, with RLS off. `anon` is the
-- public browser key (NEXT_PUBLIC_SUPABASE_ANON_KEY), so via PostgREST these were
-- world-readable AND world-truncatable:
--
--   brand_orders                  33,394 rows  customer_phone / customer_email /
--                                              customer_name / tracking_number / line_items
--   bestie_attribution            47,863 rows
--   brand_abandoned_carts         14,670 rows
--   bestie_conversation_touches    9,089 rows  (a VIEW)
--   whatsapp_cs_sessions              68 rows  shopper phone / name / conversation context
--
-- The July migration cleaned the tables that existed at the time but left the DEFAULT
-- untouched, so every table created since was born open. Fixing the default is the actual
-- fix; the REVOKE below just cleans up the five that already leaked through.

REVOKE ALL ON TABLE
  public.brand_orders,
  public.brand_abandoned_carts,
  public.bestie_attribution,
  public.bestie_conversation_touches,
  public.whatsapp_cs_sessions
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Defense in depth: RLS with no policies denies anon/authenticated even if grants ever
-- reappear. service_role bypasses RLS, and every code path touching these is server-side
-- on the service_role client, so this is functionally inert today.
-- bestie_conversation_touches is a VIEW — RLS is not supported on views, so the REVOKE
-- above is its only protection.
ALTER TABLE public.brand_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestie_attribution    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_cs_sessions  ENABLE ROW LEVEL SECURITY;

-- KNOWN RESIDUAL, not fixable from here: supabase_admin owns a second default ACL on
-- schema public that still grants anon/authenticated on tables IT creates. Altering it
-- fails with 42501 (permission denied to change default privileges). Our migrations run
-- as `postgres`, which is now covered.
