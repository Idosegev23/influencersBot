-- ============================================
-- Migration 037: Website Scraping Enhancements
-- הרחבת תשתית לסריקת אתרים + FTS + Widget
-- ============================================

-- 1. הוספת עמודות חדשות ל-instagram_bio_websites
ALTER TABLE instagram_bio_websites
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS meta_tags JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS structured_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS crawl_session_id TEXT,
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'bio_link'
  CHECK (source_type IN ('bio_link', 'standalone')),
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. GIN index for FTS
CREATE INDEX IF NOT EXISTS idx_websites_search
ON instagram_bio_websites USING gin(search_vector);

-- 3. Auto-update search_vector trigger
CREATE OR REPLACE FUNCTION update_websites_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.page_title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.page_description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.page_content, '')), 'C');
  NEW.word_count := coalesce(array_length(regexp_split_to_array(coalesce(NEW.page_content, ''), '\s+'), 1), 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS websites_search_vector_update ON instagram_bio_websites;
CREATE TRIGGER websites_search_vector_update
  BEFORE INSERT OR UPDATE OF page_title, page_description, page_content
  ON instagram_bio_websites
  FOR EACH ROW
  EXECUTE FUNCTION update_websites_search_vector();

-- 4. search_website_content RPC
CREATE OR REPLACE FUNCTION search_website_content(
  p_account_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  url TEXT,
  page_title TEXT,
  page_content TEXT,
  image_urls TEXT[],
  relevance REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    w.id,
    w.url,
    w.page_title,
    w.page_content,
    w.image_urls,
    ts_rank(w.search_vector, safe_tsquery('simple', p_query)) AS relevance
  FROM instagram_bio_websites w
  WHERE w.account_id = p_account_id
    AND w.processing_status = 'completed'
    AND w.search_vector @@ safe_tsquery('simple', p_query)
  ORDER BY relevance DESC, w.scraped_at DESC
  LIMIT p_limit;
$$;

-- 5. הרחבת scan_jobs platform לכלול website
ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_platform_check;
ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_platform_check
  CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'website'));

-- 6. Backfill search vectors for existing website data
UPDATE instagram_bio_websites SET search_vector =
  setweight(to_tsvector('simple', coalesce(page_title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(page_description, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(page_content, '')), 'C')
WHERE search_vector IS NULL;

ANALYZE instagram_bio_websites;

-- ============================================
COMMENT ON COLUMN instagram_bio_websites.source_type IS 'bio_link = מביו של משפיען, standalone = סריקת אתר עצמאית';
COMMENT ON COLUMN instagram_bio_websites.image_urls IS 'URLs של תמונות שנמצאו בדף';
COMMENT ON COLUMN instagram_bio_websites.search_vector IS 'FTS vector: title(A) + description(B) + content(C)';
