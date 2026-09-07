-- Migration 090: search the DOCUMENTS too.
--
-- 088 repopulated the vectors, 089 made a full sentence retrieve — and a service question still came
-- back with captions only, because search_all_content never looked at document_chunks. That is where
-- shipping, delivery times, returns and policy actually live; Instagram captions never discuss them.
-- Measured before this change, "כמה עולה המשלוח ותוך כמה זמן זה מגיע?" against document_chunks alone
-- returned 198 / 129 / 64 chunks for ARGANIA / LA BEAUTÉ / STUDIO PASHA, and the top-ranked chunk for
-- each is the authoritative "המשלוח מגיע עד 10 ימי עסקים" text.
--
-- document_chunks.fts is a GENERATED STORED column (to_tsvector('simple', chunk_text)) — 123,501 of
-- 123,501 rows populated, maintained by Postgres itself with nothing to forget to apply. That is what
-- instagram_posts should have had instead of the trigger nobody applied (see 088).
--
-- PER-SOURCE CAP: there are ~20x more chunks than posts, and one long policy page carries many
-- near-identical chunks. Without an inner LIMIT the documents branch fills the whole result and
-- pushes the posts out. Each branch is capped at p_limit first, then the outer ORDER BY relevance
-- picks the best across all three. Verified: ARGANIA returns 22 documents + 20 posts + 8
-- transcriptions for the shipping question, not 50 documents.
--
-- Callers must render the new content_type — see formatMetadataForAI in hybrid-retrieval.ts, which
-- renders by allow-list and silently drops anything it does not know.

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
  WITH ranked AS (
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
      ORDER BY relevance DESC, p.posted_at DESC
      LIMIT p_limit
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
      ORDER BY relevance DESC, t.created_at DESC
      LIMIT p_limit
    )
    UNION ALL
    (
      SELECT
        d.id,
        'document'::TEXT AS content_type,
        d.chunk_text AS content_text,
        d.created_at,
        ts_rank(d.fts, any_word_tsquery(p_query)) AS relevance
      FROM document_chunks d
      WHERE d.account_id = p_account_id
        AND d.fts @@ any_word_tsquery(p_query)
      ORDER BY relevance DESC, d.created_at DESC
      LIMIT p_limit
    )
  )
  SELECT r.id, r.content_type, r.content_text, r.created_at, r.relevance
  FROM ranked r
  ORDER BY r.relevance DESC, r.created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION search_all_content IS
  'Posts + transcriptions + document chunks, simple regconfig, OR semantics (any_word_tsquery) so a full question retrieves. Each source capped at p_limit before the final ranking so documents cannot crowd out posts. See migrations 088/089/090.';
