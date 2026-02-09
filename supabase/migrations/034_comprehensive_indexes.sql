-- Migration 034: Comprehensive Indexes
-- אינדקסים מקיפים לכל הטבלאות - שליפה מהירה וחדה!

-- ============================================
-- 1. B-Tree Indexes על Foreign Keys
-- ============================================
-- אינדקסים על account_id בכל הטבלאות (מהירות אופטימלית!)

CREATE INDEX IF NOT EXISTS idx_instagram_posts_account_id 
ON instagram_posts(account_id);

CREATE INDEX IF NOT EXISTS idx_instagram_transcriptions_account_id 
ON instagram_transcriptions(account_id);

CREATE INDEX IF NOT EXISTS idx_instagram_highlights_account_id 
ON instagram_highlights(account_id);

CREATE INDEX IF NOT EXISTS idx_partnerships_account_id 
ON partnerships(account_id);

CREATE INDEX IF NOT EXISTS idx_coupons_account_id 
ON coupons(account_id);

CREATE INDEX IF NOT EXISTS idx_chatbot_persona_account_id 
ON chatbot_persona(account_id);

-- ============================================
-- 2. Compound Indexes - שאילתות מורכבות
-- ============================================

-- Posts: חיפוש לפי account + type
CREATE INDEX IF NOT EXISTS idx_posts_account_type 
ON instagram_posts(account_id, type);

-- Posts: חיפוש לפי account + תאריך
CREATE INDEX IF NOT EXISTS idx_posts_account_date 
ON instagram_posts(account_id, posted_at DESC);

-- Transcriptions: חיפוש לפי account + status
CREATE INDEX IF NOT EXISTS idx_trans_account_status 
ON instagram_transcriptions(account_id, processing_status);

-- Transcriptions: חיפוש לפי account + source_type
CREATE INDEX IF NOT EXISTS idx_trans_account_source 
ON instagram_transcriptions(account_id, source_type, source_id);

-- ============================================
-- 3. FTS על Partnerships (מותגים)
-- ============================================

-- הוספת search_vector אם לא קיים
ALTER TABLE partnerships 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Index GIN מהיר
CREATE INDEX IF NOT EXISTS idx_partnerships_search 
ON partnerships USING gin(search_vector);

-- פונקציה לעדכון אוטומטי
CREATE OR REPLACE FUNCTION update_partnerships_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.brand_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.brief, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.category, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger אוטומטי
DROP TRIGGER IF EXISTS partnerships_search_vector_update ON partnerships;
CREATE TRIGGER partnerships_search_vector_update
  BEFORE INSERT OR UPDATE OF brand_name, brief, category
  ON partnerships
  FOR EACH ROW
  EXECUTE FUNCTION update_partnerships_search_vector();

-- עדכון הרשומות הקיימות
UPDATE partnerships SET search_vector = 
  setweight(to_tsvector('simple', coalesce(brand_name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(brief, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(category, '')), 'C')
WHERE search_vector IS NULL OR search_vector = '';

-- ============================================
-- 4. FTS על Coupons (קופונים)
-- ============================================

ALTER TABLE coupons 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_coupons_search 
ON coupons USING gin(search_vector);

CREATE OR REPLACE FUNCTION update_coupons_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.code, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.brand_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coupons_search_vector_update ON coupons;
CREATE TRIGGER coupons_search_vector_update
  BEFORE INSERT OR UPDATE OF code, brand_name, description
  ON coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_coupons_search_vector();

UPDATE coupons SET search_vector = 
  setweight(to_tsvector('simple', coalesce(code, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(brand_name, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'C')
WHERE search_vector IS NULL OR search_vector = '';

-- ============================================
-- 5. Indexes על Coupons Queries
-- ============================================

-- חיפוש מהיר לפי קוד
CREATE INDEX IF NOT EXISTS idx_coupons_code 
ON coupons(code);

-- חיפוש לפי מותג
CREATE INDEX IF NOT EXISTS idx_coupons_brand 
ON coupons(brand_name);

-- קופונים פעילים בלבד
CREATE INDEX IF NOT EXISTS idx_coupons_active 
ON coupons(account_id, is_active) 
WHERE is_active = true;

-- ============================================
-- 6. FTS על on_screen_text (מתוך transcriptions)
-- ============================================

-- Index GIN על on_screen_text JSONB array
CREATE INDEX IF NOT EXISTS idx_transcriptions_on_screen_text 
ON instagram_transcriptions USING gin(on_screen_text);

-- Index על language
CREATE INDEX IF NOT EXISTS idx_transcriptions_language 
ON instagram_transcriptions(language);

-- ============================================
-- 7. Index על Highlights
-- ============================================

-- חיפוש לפי title
CREATE INDEX IF NOT EXISTS idx_highlights_title 
ON instagram_highlights(title);

-- חיפוש לפי account + scraped_at
CREATE INDEX IF NOT EXISTS idx_highlights_account_date 
ON instagram_highlights(account_id, scraped_at DESC);

-- ============================================
-- 8. Partnerships Indexes
-- ============================================

-- חיפוש מהיר לפי brand_name
CREATE INDEX IF NOT EXISTS idx_partnerships_brand_name 
ON partnerships(brand_name);

-- חיפוש לפי category
CREATE INDEX IF NOT EXISTS idx_partnerships_category 
ON partnerships(category);

-- שותפויות פעילות בלבד
CREATE INDEX IF NOT EXISTS idx_partnerships_active 
ON partnerships(account_id, is_active) 
WHERE is_active = true;

-- ============================================
-- 9. Search Functions - מותגים וקופונים
-- ============================================

-- חיפוש מותגים
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
    ts_rank(p.search_vector, plainto_tsquery('simple', p_query)) AS relevance
  FROM partnerships p
  WHERE p.account_id = p_account_id
    AND p.is_active = true
    AND p.search_vector @@ plainto_tsquery('simple', p_query)
  ORDER BY relevance DESC
  LIMIT p_limit;
$$;

-- חיפוש קופונים
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
    ts_rank(c.search_vector, plainto_tsquery('simple', p_query)) AS relevance
  FROM coupons c
  WHERE c.account_id = p_account_id
    AND c.is_active = true
    AND c.search_vector @@ plainto_tsquery('simple', p_query)
  ORDER BY relevance DESC
  LIMIT p_limit;
$$;

-- חיפוש הכל (פוסטים + תמלולים + מותגים + קופונים)
CREATE OR REPLACE FUNCTION search_everything(
  p_account_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  content_type TEXT,
  content_text TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  relevance REAL
)
LANGUAGE SQL
STABLE
AS $$
  -- פוסטים
  (
    SELECT 
      p.id,
      'post'::TEXT as content_type,
      p.caption as content_text,
      jsonb_build_object(
        'type', p.type,
        'hashtags', p.hashtags,
        'likes', p.likes_count
      ) as metadata,
      p.posted_at as created_at,
      ts_rank(p.search_vector, plainto_tsquery('simple', p_query)) AS relevance
    FROM instagram_posts p
    WHERE p.account_id = p_account_id
      AND p.search_vector @@ plainto_tsquery('simple', p_query)
  )
  UNION ALL
  -- תמלולים
  (
    SELECT 
      t.id,
      'transcription'::TEXT as content_type,
      t.transcription_text as content_text,
      jsonb_build_object(
        'source_type', t.source_type,
        'language', t.language
      ) as metadata,
      t.created_at,
      ts_rank(t.search_vector, plainto_tsquery('simple', p_query)) AS relevance
    FROM instagram_transcriptions t
    WHERE t.account_id = p_account_id
      AND t.search_vector @@ plainto_tsquery('simple', p_query)
  )
  UNION ALL
  -- מותגים
  (
    SELECT 
      p.id,
      'partnership'::TEXT as content_type,
      p.brand_name || ' - ' || coalesce(p.brief, '') as content_text,
      jsonb_build_object(
        'brand_name', p.brand_name,
        'category', p.category,
        'link', p.link
      ) as metadata,
      p.created_at,
      ts_rank(p.search_vector, plainto_tsquery('simple', p_query)) AS relevance
    FROM partnerships p
    WHERE p.account_id = p_account_id
      AND p.is_active = true
      AND p.search_vector @@ plainto_tsquery('simple', p_query)
  )
  UNION ALL
  -- קופונים
  (
    SELECT 
      c.id,
      'coupon'::TEXT as content_type,
      c.code || ' - ' || coalesce(c.description, '') as content_text,
      jsonb_build_object(
        'code', c.code,
        'brand_name', c.brand_name,
        'discount_type', c.discount_type,
        'discount_value', c.discount_value
      ) as metadata,
      c.created_at,
      ts_rank(c.search_vector, plainto_tsquery('simple', p_query)) AS relevance
    FROM coupons c
    WHERE c.account_id = p_account_id
      AND c.is_active = true
      AND c.search_vector @@ plainto_tsquery('simple', p_query)
  )
  ORDER BY relevance DESC, created_at DESC
  LIMIT p_limit;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_partnerships(UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_coupons(UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_everything(UUID, TEXT, INTEGER) TO authenticated, anon;

-- ============================================
-- 10. Analyze Tables - אופטימיזציה
-- ============================================

-- עדכון סטטיסטיקות לאופטימיזציה
ANALYZE instagram_posts;
ANALYZE instagram_transcriptions;
ANALYZE instagram_highlights;
ANALYZE partnerships;
ANALYZE coupons;
ANALYZE chatbot_persona;

-- Comments
COMMENT ON FUNCTION search_partnerships IS 'חיפוש מותגים - מאונדקס מלא!';
COMMENT ON FUNCTION search_coupons IS 'חיפוש קופונים - מאונדקס מלא!';
COMMENT ON FUNCTION search_everything IS 'חיפוש בכל התוכן - פוסטים + תמלולים + מותגים + קופונים!';

-- ============================================
-- DONE! 🔥 כל התוכן מאונדקס בצורה מושלמת
-- ============================================
