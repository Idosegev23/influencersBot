-- Migration 033: Hebrew Full Text Search Support
-- תמיכה בחיפוש בעברית!

-- ============================================
-- 1. Update Posts Index for Hebrew
-- ============================================

-- Drop old trigger
DROP TRIGGER IF EXISTS posts_search_vector_update ON instagram_posts;
DROP FUNCTION IF EXISTS update_posts_search_vector();

-- New function with simple config (works for Hebrew!)
CREATE OR REPLACE FUNCTION update_posts_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.caption, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.hashtags, ' '), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create trigger
CREATE TRIGGER posts_search_vector_update
  BEFORE INSERT OR UPDATE OF caption, hashtags
  ON instagram_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_posts_search_vector();

-- Re-index ALL posts with 'simple' config
UPDATE instagram_posts SET search_vector = 
  setweight(to_tsvector('simple', coalesce(caption, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(array_to_string(hashtags, ' '), '')), 'B');

-- ============================================
-- 2. Update Transcriptions Index for Hebrew  
-- ============================================

DROP TRIGGER IF EXISTS transcriptions_search_vector_update ON instagram_transcriptions;
DROP FUNCTION IF EXISTS update_transcriptions_search_vector();

CREATE OR REPLACE FUNCTION update_transcriptions_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.transcription_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transcriptions_search_vector_update
  BEFORE INSERT OR UPDATE OF transcription_text
  ON instagram_transcriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_transcriptions_search_vector();

-- Re-index transcriptions
UPDATE instagram_transcriptions SET search_vector = 
  to_tsvector('simple', coalesce(transcription_text, ''));

-- ============================================
-- 3. Hebrew-Friendly Search Functions
-- ============================================

-- Search posts (Hebrew + English!)
CREATE OR REPLACE FUNCTION search_posts(
  p_account_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  caption TEXT,
  hashtags TEXT[],
  type TEXT,
  posted_at TIMESTAMPTZ,
  relevance REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    p.id,
    p.caption,
    p.hashtags,
    p.type,
    p.posted_at,
    ts_rank(p.search_vector, plainto_tsquery('simple', p_query)) AS relevance
  FROM instagram_posts p
  WHERE p.account_id = p_account_id
    AND p.search_vector @@ plainto_tsquery('simple', p_query)
  ORDER BY relevance DESC, p.posted_at DESC
  LIMIT p_limit;
$$;

-- Search transcriptions (Hebrew + English!)
CREATE OR REPLACE FUNCTION search_transcriptions(
  p_account_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  transcription_text TEXT,
  source_id TEXT,
  created_at TIMESTAMPTZ,
  relevance REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    t.id,
    t.transcription_text,
    t.source_id,
    t.created_at,
    ts_rank(t.search_vector, plainto_tsquery('simple', p_query)) AS relevance
  FROM instagram_transcriptions t
  WHERE t.account_id = p_account_id
    AND t.search_vector @@ plainto_tsquery('simple', p_query)
  ORDER BY relevance DESC, t.created_at DESC
  LIMIT p_limit;
$$;

-- Search ALL content (Hebrew + English!)
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
      'post'::TEXT as content_type,
      p.caption as content_text,
      p.posted_at as created_at,
      ts_rank(p.search_vector, plainto_tsquery('simple', p_query)) AS relevance
    FROM instagram_posts p
    WHERE p.account_id = p_account_id
      AND p.search_vector @@ plainto_tsquery('simple', p_query)
  )
  UNION ALL
  (
    SELECT 
      t.id,
      'transcription'::TEXT as content_type,
      t.transcription_text as content_text,
      t.created_at,
      ts_rank(t.search_vector, plainto_tsquery('simple', p_query)) AS relevance
    FROM instagram_transcriptions t
    WHERE t.account_id = p_account_id
      AND t.search_vector @@ plainto_tsquery('simple', p_query)
  )
  ORDER BY relevance DESC, created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION search_posts IS 'חיפוש פוסטים - תומך בעברית ואנגלית!';
COMMENT ON FUNCTION search_transcriptions IS 'חיפוש תמלולים - תומך בעברית ואנגלית!';
COMMENT ON FUNCTION search_all_content IS 'חיפוש בכל התוכן - עברית + אנגלית!';
