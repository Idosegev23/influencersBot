-- Migration 035: Search Highlights RPC + Index Improvements
-- 1. search_highlights FTS function
-- 2. Missing indexes for chat tables
-- 3. Safe websearch_to_tsquery wrapper
-- 4. Drop redundant indexes

-- ============================================
-- 1. FTS on instagram_highlights (title)
-- ============================================

ALTER TABLE instagram_highlights
ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_highlights_search
ON instagram_highlights USING gin(search_vector);

CREATE OR REPLACE FUNCTION update_highlights_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS highlights_search_vector_update ON instagram_highlights;
CREATE TRIGGER highlights_search_vector_update
  BEFORE INSERT OR UPDATE OF title
  ON instagram_highlights
  FOR EACH ROW
  EXECUTE FUNCTION update_highlights_search_vector();

-- Backfill existing rows
UPDATE instagram_highlights SET search_vector =
  setweight(to_tsvector('simple', coalesce(title, '')), 'A')
WHERE search_vector IS NULL;

-- search_highlights RPC
CREATE OR REPLACE FUNCTION search_highlights(
  p_account_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  items_count INTEGER,
  cover_image_url TEXT,
  scraped_at TIMESTAMPTZ,
  relevance REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    h.id,
    h.title,
    h.items_count,
    h.cover_image_url,
    h.scraped_at,
    ts_rank(h.search_vector, plainto_tsquery('simple', p_query)) AS relevance
  FROM instagram_highlights h
  WHERE h.account_id = p_account_id
    AND h.search_vector @@ plainto_tsquery('simple', p_query)
  ORDER BY relevance DESC, h.scraped_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_highlights(UUID, TEXT, INTEGER) TO authenticated, anon;

-- ============================================
-- 2. Missing Indexes for Chat Tables
-- ============================================

-- chat_messages: fetched by session_id + ordered by created_at
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_date
ON chat_messages(session_id, created_at DESC);

-- chat_sessions: fetched by account_id
CREATE INDEX IF NOT EXISTS idx_chat_sessions_account_id
ON chat_sessions(account_id);

-- ============================================
-- 3. Safe websearch_to_tsquery wrapper
-- ============================================
-- websearch_to_tsquery supports quoted phrases and OR operators
-- but can fail on malformed input — this wrapper falls back safely

CREATE OR REPLACE FUNCTION safe_tsquery(p_config TEXT, p_query TEXT)
RETURNS tsquery
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Try websearch_to_tsquery first (supports quotes, OR, -)
  RETURN websearch_to_tsquery(p_config, p_query);
EXCEPTION WHEN OTHERS THEN
  -- Fallback to simple plainto_tsquery
  RETURN plainto_tsquery(p_config, p_query);
END;
$$;

-- Update all search RPCs to use safe_tsquery

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
    ts_rank(p.search_vector, safe_tsquery('simple', p_query)) AS relevance
  FROM instagram_posts p
  WHERE p.account_id = p_account_id
    AND p.search_vector @@ safe_tsquery('simple', p_query)
  ORDER BY relevance DESC, p.posted_at DESC
  LIMIT p_limit;
$$;

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
    ts_rank(t.search_vector, safe_tsquery('simple', p_query)) AS relevance
  FROM instagram_transcriptions t
  WHERE t.account_id = p_account_id
    AND t.search_vector @@ safe_tsquery('simple', p_query)
  ORDER BY relevance DESC, t.created_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION search_coupons(
  p_account_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  brand_name TEXT,
  description TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  relevance REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    c.id,
    c.code,
    c.brand_name,
    c.description,
    c.discount_type,
    c.discount_value,
    ts_rank(c.search_vector, safe_tsquery('simple', p_query)) AS relevance
  FROM coupons c
  WHERE c.account_id = p_account_id
    AND c.is_active = true
    AND c.search_vector @@ safe_tsquery('simple', p_query)
  ORDER BY relevance DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION search_partnerships(
  p_account_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  brand_name TEXT,
  category TEXT,
  brief TEXT,
  link TEXT,
  relevance REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    p.id,
    p.brand_name,
    p.category,
    p.brief,
    p.link,
    ts_rank(p.search_vector, safe_tsquery('simple', p_query)) AS relevance
  FROM partnerships p
  WHERE p.account_id = p_account_id
    AND p.is_active = true
    AND p.search_vector @@ safe_tsquery('simple', p_query)
  ORDER BY relevance DESC
  LIMIT p_limit;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION search_posts(UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_transcriptions(UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_coupons(UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_partnerships(UUID, TEXT, INTEGER) TO authenticated, anon;

-- ============================================
-- 4. Drop Redundant Indexes
-- ============================================
-- idx_instagram_highlights_account (from 026) is superseded by
-- idx_highlights_account_date (from 034) which is a compound index
-- on (account_id, scraped_at DESC) — it covers account_id lookups too.
--
-- idx_instagram_highlights_account_id (from 034) is also redundant
-- with the compound index.

DROP INDEX IF EXISTS idx_instagram_highlights_account;
DROP INDEX IF EXISTS idx_instagram_highlights_account_id;

-- idx_instagram_highlights_scraped (from 026) is superseded by
-- idx_highlights_account_date (account_id, scraped_at DESC)
DROP INDEX IF EXISTS idx_instagram_highlights_scraped;

-- ============================================
-- 5. Analyze updated tables
-- ============================================

ANALYZE instagram_highlights;
ANALYZE chat_messages;
ANALYZE chat_sessions;

COMMENT ON FUNCTION search_highlights IS 'FTS search on highlight titles';
COMMENT ON FUNCTION safe_tsquery IS 'Safe tsquery wrapper — tries websearch_to_tsquery, falls back to plainto_tsquery';
