-- Migration 089: make search_all_content answer QUESTIONS, not just keywords.
--
-- 088 repopulated the vectors and a one-word query started working. A real one still did not:
--
--   plainto_tsquery('simple','יש לכם משהו לשיער יבש?')  ->  'יש' & 'לכם' & 'משהו' & 'לשיער' & 'יבש'
--
-- Every lexeme ANDed, and 'simple' deliberately has no stopword list, so "יש" / "לכם" / "משהו" all
-- had to appear in the same caption. Measured on ARGANIA after 088: that question returned 0 hits
-- while the bare word "שיער" returned 50. Shoppers type sentences, so retrieval was still dead for
-- real traffic — 088 alone would have looked fixed on a keyword probe and stayed broken in
-- production. (This is why `search_posts` grew a `safe_tsquery` + ILIKE fallback back in
-- 2026-02-18's `hebrew_search_improvements`; search_all_content never got the same treatment.)
--
-- OR the lexemes and let ts_rank narrow instead: a caption matching more of the question ranks
-- higher, and ORDER BY relevance + LIMIT keeps the head of the list clean. Verified on the same
-- question — 37 candidates, and the top three are the dry-hair products.
--
-- The rewrite is textual, on plainto_tsquery's OWN output, which is already sanitised: that output
-- contains only quoted lexemes joined by '&', so swapping the operator cannot inject anything.

CREATE OR REPLACE FUNCTION any_word_tsquery(p_query TEXT)
RETURNS tsquery
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(replace(plainto_tsquery('simple', p_query)::text, '&', '|'), '')::tsquery,
    ''::tsquery
  );
$$;

COMMENT ON FUNCTION any_word_tsquery IS
  'plainto_tsquery with OR instead of AND, so a full sentence retrieves. Ranking, not matching, narrows.';

CREATE OR REPLACE FUNCTION search_all_content(
  p_account_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  content_type TEXT,
  content_text TEXT,
  created_at TIMESTAMPTZ,
  relevance REAL
)
LANGUAGE SQL
STABLE
AS $$
  (
    SELECT
      p.id,
      'post'::TEXT AS content_type,
      p.caption AS content_text,
      p.posted_at AS created_at,
      ts_rank(p.search_vector, any_word_tsquery(p_query)) AS relevance
    FROM instagram_posts p
    WHERE p.account_id = p_account_id
      AND p.search_vector @@ any_word_tsquery(p_query)
  )
  UNION ALL
  (
    SELECT
      t.id,
      'transcription'::TEXT AS content_type,
      t.transcription_text AS content_text,
      t.created_at,
      ts_rank(t.search_vector, any_word_tsquery(p_query)) AS relevance
    FROM instagram_transcriptions t
    WHERE t.account_id = p_account_id
      AND t.search_vector @@ any_word_tsquery(p_query)
  )
  ORDER BY relevance DESC, created_at DESC
  LIMIT p_limit;
$$;

-- STILL NOT COVERED: document_chunks (site pages, uploaded docs) — LA BEAUTÉ 1,479, ARGANIA 1,137,
-- STUDIO PASHA 685 rows that search_all_content never touches. Shipping and returns questions live
-- there, which is why they retrieve nothing from captions. Separate piece of work.
