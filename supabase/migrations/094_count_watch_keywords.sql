-- ==================================================
-- Migration 094: count_watch_keywords
-- ==================================================
-- Counts brand-named terms across conversation text, split by whether the
-- conversation was a complaint.
--
-- The split is not cosmetic. Argania's "פגום" appears in 110 conversations, but
-- 61 of them are customers describing their own hair ("שיער פגום אחרי החלקה")
-- and only 49 are a product that arrived damaged. One number would have told
-- the brand it had more than twice the damage problem it actually has.
--
-- Counting runs on the text rather than on the classifier's extracted keywords,
-- which fragment a concept across variants: "חסר" arrives as "מוצר חסר" (82),
-- "פריט חסר" (39), "יחידה חסרה" (6) and the bare word only 15 times.
--
-- Patterns are built in TypeScript (keyword-watch.ts) so the Hebrew prefix,
-- suffix and final-form rules have one home and unit tests.
--
-- "Not a complaint" and "not classified yet" are separate columns. Collapsing
-- them made an account whose backfill had not run report every term as
-- "110 conversations, 0 complaints" — which reads as good news when the truth is
-- that nothing had been looked at. LA BEAUTÉ surfaced this before launch.
-- ==================================================

DROP FUNCTION IF EXISTS public.count_watch_keywords(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT[]);

CREATE FUNCTION public.count_watch_keywords(
  p_account_id UUID,
  p_from       TIMESTAMPTZ,
  p_to         TIMESTAMPTZ,
  p_terms      TEXT[],
  p_patterns   TEXT[]
)
RETURNS TABLE (
  term                  TEXT,
  sessions              INTEGER,
  complaint_sessions    INTEGER,
  other_sessions        INTEGER,
  unclassified_sessions INTEGER
)
LANGUAGE sql
STABLE
AS $$
  WITH terms AS (
    SELECT t.term, p.pattern
    FROM unnest(p_terms) WITH ORDINALITY AS t(term, i)
    JOIN unnest(p_patterns) WITH ORDINALITY AS p(pattern, i) USING (i)
  ),
  hits AS (
    SELECT DISTINCT
      terms.term,
      s.id AS session_id,
      c.is_complaint
    FROM terms
    JOIN public.chat_sessions s
      ON s.account_id = p_account_id
     AND s.created_at >= p_from
     AND s.created_at <  p_to
    JOIN public.chat_messages m
      ON m.session_id = s.id
     AND m.role = 'user'
     AND m.content ~ terms.pattern
    LEFT JOIN public.conversation_classifications c
      ON c.session_id = s.id
  )
  SELECT
    terms.term,
    COALESCE(COUNT(hits.session_id), 0)::INTEGER,
    COALESCE(COUNT(hits.session_id) FILTER (WHERE hits.is_complaint IS TRUE), 0)::INTEGER,
    COALESCE(COUNT(hits.session_id) FILTER (WHERE hits.is_complaint IS FALSE), 0)::INTEGER,
    COALESCE(COUNT(hits.session_id) FILTER (WHERE hits.is_complaint IS NULL), 0)::INTEGER
  FROM terms
  LEFT JOIN hits ON hits.term = terms.term
  GROUP BY terms.term
  ORDER BY 2 DESC, terms.term;
$$;

COMMENT ON FUNCTION public.count_watch_keywords IS
  'Watch-keyword counts over conversation text, split into complaint / not-complaint / not-yet-classified. Unknown is reported as unknown, never folded into zero. Patterns are built in TS (keyword-watch.ts) so Hebrew prefix/suffix/final-form handling has one home and unit tests.';

REVOKE ALL ON FUNCTION public.count_watch_keywords FROM PUBLIC, anon, authenticated;
