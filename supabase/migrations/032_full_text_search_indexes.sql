-- Migration 032: Full Text Search Indexes
-- אינדקס על כל התוכן כדי שה-AI יוכל לחפש ביעילות

-- ============================================
-- 1. Full Text Search על פוסטים
-- ============================================

-- הוספת עמודת search vector
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- יצירת index GIN (מהיר מאוד!)
CREATE INDEX IF NOT EXISTS idx_posts_search 
ON instagram_posts USING gin(search_vector);

-- פונקציה לעדכון אוטומטי של search_vector
CREATE OR REPLACE FUNCTION update_posts_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', coalesce(NEW.caption, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.hashtags, ' '), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger שמעדכן אוטומטית
DROP TRIGGER IF EXISTS posts_search_vector_update ON instagram_posts;
CREATE TRIGGER posts_search_vector_update
  BEFORE INSERT OR UPDATE OF caption, hashtags
  ON instagram_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_posts_search_vector();

-- עדכון כל הפוסטים הקיימים
UPDATE instagram_posts SET search_vector = 
  setweight(to_tsvector('english', coalesce(caption, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(array_to_string(hashtags, ' '), '')), 'B')
WHERE search_vector IS NULL;

-- ============================================
-- 2. Full Text Search על תמלולים
-- ============================================

ALTER TABLE instagram_transcriptions
ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_transcriptions_search
ON instagram_transcriptions USING gin(search_vector);

CREATE OR REPLACE FUNCTION update_transcriptions_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.transcription_text, ''));
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
  to_tsvector('english', coalesce(transcription_text, ''))
WHERE search_vector IS NULL;

-- ============================================
-- 3. Search Functions - AI יכול לקרוא לזה!
-- ============================================

-- חיפוש פוסטים רלוונטיים
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
    ts_rank(p.search_vector, plainto_tsquery('english', p_query)) AS relevance
  FROM instagram_posts p
  WHERE p.account_id = p_account_id
    AND p.search_vector @@ plainto_tsquery('english', p_query)
  ORDER BY relevance DESC, p.posted_at DESC
  LIMIT p_limit;
$$;

-- חיפוש תמלולים רלוונטיים
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
    ts_rank(t.search_vector, plainto_tsquery('english', p_query)) AS relevance
  FROM instagram_transcriptions t
  WHERE t.account_id = p_account_id
    AND t.search_vector @@ plainto_tsquery('english', p_query)
  ORDER BY relevance DESC, t.created_at DESC
  LIMIT p_limit;
$$;

-- חיפוש כללי (פוסטים + תמלולים)
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
      ts_rank(p.search_vector, plainto_tsquery('english', p_query)) AS relevance
    FROM instagram_posts p
    WHERE p.account_id = p_account_id
      AND p.search_vector @@ plainto_tsquery('english', p_query)
  )
  UNION ALL
  (
    SELECT 
      t.id,
      'transcription'::TEXT as content_type,
      t.transcription_text as content_text,
      t.created_at,
      ts_rank(t.search_vector, plainto_tsquery('english', p_query)) AS relevance
    FROM instagram_transcriptions t
    WHERE t.account_id = p_account_id
      AND t.search_vector @@ plainto_tsquery('english', p_query)
  )
  ORDER BY relevance DESC, created_at DESC
  LIMIT p_limit;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_posts(UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_transcriptions(UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_all_content(UUID, TEXT, INTEGER) TO authenticated, anon;

-- ============================================
-- 4. Stats Function - כמה תוכן יש?
-- ============================================

CREATE OR REPLACE FUNCTION get_content_stats(p_account_id UUID)
RETURNS TABLE (
  total_posts BIGINT,
  total_transcriptions BIGINT,
  total_highlights BIGINT,
  total_stories BIGINT,
  indexed_posts BIGINT,
  indexed_transcriptions BIGINT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    (SELECT COUNT(*) FROM instagram_posts WHERE account_id = p_account_id),
    (SELECT COUNT(*) FROM instagram_transcriptions WHERE account_id = p_account_id),
    (SELECT COUNT(*) FROM instagram_highlights WHERE account_id = p_account_id),
    (SELECT COUNT(*) FROM instagram_stories WHERE account_id = p_account_id AND posted_at > NOW() - INTERVAL '24 hours'),
    (SELECT COUNT(*) FROM instagram_posts WHERE account_id = p_account_id AND search_vector IS NOT NULL),
    (SELECT COUNT(*) FROM instagram_transcriptions WHERE account_id = p_account_id AND search_vector IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION get_content_stats(UUID) TO authenticated, anon;

COMMENT ON FUNCTION search_posts IS 'חיפוש פוסטים רלוונטיים עם Full Text Search - מאונדקס!';
COMMENT ON FUNCTION search_transcriptions IS 'חיפוש תמלולים רלוונטיים - כל התוכן נגיש!';
COMMENT ON FUNCTION search_all_content IS 'חיפוש כללי בכל התוכן - אינדקס מלא!';
