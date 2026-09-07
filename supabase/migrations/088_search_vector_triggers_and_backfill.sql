-- Migration 088: keep instagram_posts / instagram_transcriptions search vectors POPULATED
--
-- WHY THIS EXISTS
-- Hybrid retrieval returned 0 hits for every query on every account (measured 2026-09-07: 21/21
-- zero across ARGANIA GROUP, LA BEAUTÉ, STUDIO PASHA — including "שמן ארגן", "שמפו", "קרם").
-- The bot had been answering from persona + policy alone. Yoav's "חוסר שיקוף ידע" was literal.
--
-- WHAT ACTUALLY HAPPENED
--   * 032 and 033 in this repo define the columns AND the triggers that maintain them. Neither was
--     ever applied to production — the applied history jumps from 034 (comprehensive_indexes,
--     2026-02-09, which created the column, the indexes and search_all_content) straight on.
--   * 2026-02-18 someone hit the empty index and ran a ONE-TIME backfill
--     (migration `backfill_search_vectors_and_fix_rpc`: UPDATE … WHERE search_vector IS NULL).
--     It worked — and treated the symptom.
--   * With no trigger, every row written since arrives NULL. The scan re-upserts posts, so the
--     index decayed back to nothing within days. The arithmetic is exact: 6,062 posts, 295 with a
--     vector, and exactly 295 created before 2026-02-18. Transcriptions: 20,720 / 1,489.
--   * coupons, partnerships, instagram_highlights and instagram_bio_websites all DO have their
--     maintaining trigger. instagram_posts and instagram_transcriptions — the two tables 032/033
--     owned — are the only two without one.
--   * search_all_content is still its pre-033 form: 'english' regconfig (against vectors built with
--     'simple') and no transcriptions branch, even though the caller already maps content_type
--     'post' | 'transcription'.
--
-- Nothing here is new design: it is 033's trigger + RPC, plus the backfill, finally applied.
-- 'simple' is deliberate — it has no stemmer or stopword list, which is what makes it work for
-- Hebrew. It must match on both sides: a vector built with 'simple' and queried with 'english'
-- silently fails to match.

-- ============================================
-- 1. instagram_posts — trigger, then backfill
-- ============================================
CREATE OR REPLACE FUNCTION update_posts_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.caption, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.hashtags, ' '), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_search_vector_update ON instagram_posts;
CREATE TRIGGER posts_search_vector_update
  BEFORE INSERT OR UPDATE OF caption, hashtags
  ON instagram_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_posts_search_vector();

-- Backfill only the gaps. The trigger above is what stops this from being needed again.
UPDATE instagram_posts SET search_vector =
  setweight(to_tsvector('simple', coalesce(caption, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(array_to_string(hashtags, ' '), '')), 'B')
WHERE search_vector IS NULL;

-- ============================================
-- 2. instagram_transcriptions — trigger, then backfill
-- ============================================
CREATE OR REPLACE FUNCTION update_transcriptions_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.transcription_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transcriptions_search_vector_update ON instagram_transcriptions;
CREATE TRIGGER transcriptions_search_vector_update
  BEFORE INSERT OR UPDATE OF transcription_text
  ON instagram_transcriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_transcriptions_search_vector();

UPDATE instagram_transcriptions SET search_vector =
  to_tsvector('simple', coalesce(transcription_text, ''))
WHERE search_vector IS NULL;

-- ============================================
-- 3. search_all_content — 'simple', and actually search transcriptions
-- NOTE: migration 089 supersedes this function to OR the query terms. Kept here so a fresh
-- database still gets a working (if AND-only) function before 089 runs.
-- ============================================
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
      ts_rank(p.search_vector, plainto_tsquery('simple', p_query)) AS relevance
    FROM instagram_posts p
    WHERE p.account_id = p_account_id
      AND p.search_vector @@ plainto_tsquery('simple', p_query)
  )
  UNION ALL
  (
    SELECT
      t.id,
      'transcription'::TEXT AS content_type,
      t.transcription_text AS content_text,
      t.created_at,
      ts_rank(t.search_vector, plainto_tsquery('simple', p_query)) AS relevance
    FROM instagram_transcriptions t
    WHERE t.account_id = p_account_id
      AND t.search_vector @@ plainto_tsquery('simple', p_query)
  )
  ORDER BY relevance DESC, created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION search_all_content IS
  'Posts + transcriptions FTS, ''simple'' regconfig so Hebrew matches. Vectors are maintained by '
  'posts_search_vector_update / transcriptions_search_vector_update — do NOT rely on a one-off '
  'backfill again (see migration 088).';
