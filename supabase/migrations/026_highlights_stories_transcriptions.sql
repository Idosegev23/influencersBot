-- Migration 026: Highlights, Stories, Transcriptions & Bio Websites
-- מערכת גריפת מידע משופרת למשפיענים

-- ============================================
-- 1. instagram_highlights - הילייטס של המשפיען
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Instagram identifiers
  highlight_id TEXT NOT NULL,
  title TEXT,
  
  -- Media
  cover_image_url TEXT,
  items_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(account_id, highlight_id)
);

-- Indexes
CREATE INDEX idx_instagram_highlights_account ON instagram_highlights(account_id);
CREATE INDEX idx_instagram_highlights_scraped ON instagram_highlights(scraped_at DESC);

-- ============================================
-- 2. instagram_highlight_items - פריטים בתוך הילייט
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_highlight_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id UUID REFERENCES instagram_highlights(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Item identifiers
  item_id TEXT,
  item_index INTEGER, -- סדר בתוך ההילייט
  
  -- Content type
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT,
  thumbnail_url TEXT,
  
  -- Video specific
  video_duration NUMERIC, -- seconds
  
  -- Timestamps
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Processing status
  transcription_status TEXT DEFAULT 'pending' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed', 'not_applicable')),
  
  -- Constraints
  UNIQUE(highlight_id, item_id)
);

-- Indexes
CREATE INDEX idx_instagram_highlight_items_highlight ON instagram_highlight_items(highlight_id);
CREATE INDEX idx_instagram_highlight_items_account ON instagram_highlight_items(account_id);
CREATE INDEX idx_instagram_highlight_items_type ON instagram_highlight_items(media_type);
CREATE INDEX idx_instagram_highlight_items_transcription ON instagram_highlight_items(transcription_status) WHERE media_type = 'video';

-- ============================================
-- 3. instagram_stories - סטוריז פעילים
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Instagram identifiers
  story_id TEXT NOT NULL,
  
  -- Content
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT,
  thumbnail_url TEXT,
  
  -- Video specific
  video_duration NUMERIC, -- seconds
  
  -- Story metadata
  has_audio BOOLEAN DEFAULT FALSE,
  mentioned_users TEXT[] DEFAULT ARRAY[]::TEXT[],
  hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Timestamps
  posted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- Stories expire after 24h
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Processing status
  transcription_status TEXT DEFAULT 'pending' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed', 'not_applicable')),
  
  -- Constraints
  UNIQUE(account_id, story_id)
);

-- Indexes
CREATE INDEX idx_instagram_stories_account ON instagram_stories(account_id);
CREATE INDEX idx_instagram_stories_expires ON instagram_stories(expires_at);
CREATE INDEX idx_instagram_stories_type ON instagram_stories(media_type);
CREATE INDEX idx_instagram_stories_transcription ON instagram_stories(transcription_status) WHERE media_type = 'video';

-- ============================================
-- 4. instagram_transcriptions - תמלולים מרכזי
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Source reference
  source_type TEXT NOT NULL CHECK (source_type IN ('highlight_item', 'story', 'reel', 'post')),
  source_id UUID NOT NULL, -- Reference to the source table
  
  -- Video info
  video_url TEXT,
  video_duration NUMERIC, -- seconds
  
  -- Transcription result
  transcription_text TEXT,
  language TEXT DEFAULT 'he', -- Detected language
  on_screen_text TEXT[], -- Text appearing on screen
  speakers JSONB DEFAULT '[]'::jsonb, -- Speaker segments if multiple
  
  -- Processing metadata
  gemini_model_used TEXT DEFAULT 'gemini-3-pro-preview',
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  tokens_used INTEGER,
  processing_cost NUMERIC(10,6),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(source_type, source_id)
);

-- Indexes
CREATE INDEX idx_instagram_transcriptions_account ON instagram_transcriptions(account_id);
CREATE INDEX idx_instagram_transcriptions_source ON instagram_transcriptions(source_type, source_id);
CREATE INDEX idx_instagram_transcriptions_status ON instagram_transcriptions(processing_status);
CREATE INDEX idx_instagram_transcriptions_pending ON instagram_transcriptions(created_at) WHERE processing_status = 'pending';

-- ============================================
-- 5. instagram_bio_websites - אתרים מהביו
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_bio_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- URL info
  url TEXT NOT NULL,
  parent_url TEXT, -- NULL for root pages
  crawl_depth INTEGER DEFAULT 0, -- 0 = homepage, 1 = linked page
  
  -- Page content
  page_title TEXT,
  page_description TEXT,
  page_content TEXT, -- Full text content
  
  -- Extracted structured data
  extracted_data JSONB DEFAULT '{}'::jsonb,
  -- Example: { "products": [...], "coupons": [...], "contact": {...} }
  
  -- Crawl metadata
  http_status INTEGER,
  content_type TEXT,
  
  -- Processing status
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Timestamps
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(account_id, url)
);

-- Indexes
CREATE INDEX idx_instagram_bio_websites_account ON instagram_bio_websites(account_id);
CREATE INDEX idx_instagram_bio_websites_parent ON instagram_bio_websites(parent_url);
CREATE INDEX idx_instagram_bio_websites_depth ON instagram_bio_websites(crawl_depth);
CREATE INDEX idx_instagram_bio_websites_status ON instagram_bio_websites(processing_status);

-- ============================================
-- 6. influencer_raw_data - אחסון גולמי מאוחד
-- ============================================
CREATE TABLE IF NOT EXISTS influencer_raw_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Data categorization
  data_type TEXT NOT NULL CHECK (data_type IN (
    'posts', 'comments', 'highlights', 'highlight_items', 
    'stories', 'bio', 'website', 'reels', 'profile'
  )),
  
  -- Raw data storage
  raw_json JSONB NOT NULL,
  
  -- Scraping metadata
  source_actor TEXT, -- Apify actor used
  scrape_session_id TEXT, -- Group related scrapes
  
  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  -- Timestamps
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for querying
  CONSTRAINT unique_raw_data UNIQUE(account_id, data_type, scraped_at)
);

-- Indexes
CREATE INDEX idx_influencer_raw_data_account ON influencer_raw_data(account_id);
CREATE INDEX idx_influencer_raw_data_type ON influencer_raw_data(data_type);
CREATE INDEX idx_influencer_raw_data_processed ON influencer_raw_data(processed) WHERE processed = FALSE;
CREATE INDEX idx_influencer_raw_data_session ON influencer_raw_data(scrape_session_id);
CREATE INDEX idx_influencer_raw_data_scraped ON influencer_raw_data(scraped_at DESC);

-- GIN index for JSONB queries
CREATE INDEX idx_influencer_raw_data_json ON influencer_raw_data USING GIN (raw_json);

-- ============================================
-- 7. influencer_processed_data - מידע מעובד מאוחד
-- ============================================
CREATE TABLE IF NOT EXISTS influencer_processed_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Processed data categories
  coupons JSONB DEFAULT '[]'::jsonb,
  -- Example: [{ "code": "SALE20", "brand": "Nike", "source": "highlight" }]
  
  partnerships JSONB DEFAULT '[]'::jsonb,
  -- Example: [{ "brand": "Nike", "type": "sponsored", "mentions": 5 }]
  
  speaking_style JSONB DEFAULT '{}'::jsonb,
  -- Example: { "tone": "friendly", "common_phrases": [...], "emoji_usage": "high" }
  
  response_style JSONB DEFAULT '{}'::jsonb,
  -- Example: { "avg_length": "short", "uses_questions": true, "response_time": "fast" }
  
  topics JSONB DEFAULT '[]'::jsonb,
  -- Example: [{ "name": "fitness", "frequency": 0.3, "engagement": "high" }]
  
  recommended_products JSONB DEFAULT '[]'::jsonb,
  -- Example: [{ "name": "...", "brand": "...", "category": "..." }]
  
  values_and_approach JSONB DEFAULT '{}'::jsonb,
  -- Example: { "values": ["health", "family"], "approach": "educational" }
  
  -- Processing metadata
  gemini_model_used TEXT DEFAULT 'gemini-3-pro-preview',
  raw_data_sources UUID[] DEFAULT ARRAY[]::UUID[], -- References to influencer_raw_data
  
  -- Timestamps
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_influencer_processed_data_account ON influencer_processed_data(account_id);
CREATE INDEX idx_influencer_processed_data_processed ON influencer_processed_data(processed_at DESC);

-- GIN indexes for JSONB queries
CREATE INDEX idx_influencer_processed_coupons ON influencer_processed_data USING GIN (coupons);
CREATE INDEX idx_influencer_processed_partnerships ON influencer_processed_data USING GIN (partnerships);

-- ============================================
-- Helper Functions
-- ============================================

-- Function to mark video items for transcription
CREATE OR REPLACE FUNCTION mark_video_for_transcription()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.media_type = 'video' THEN
    NEW.transcription_status := 'pending';
  ELSE
    NEW.transcription_status := 'not_applicable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for highlight items
CREATE TRIGGER trigger_highlight_item_transcription
BEFORE INSERT ON instagram_highlight_items
FOR EACH ROW
EXECUTE FUNCTION mark_video_for_transcription();

-- Trigger for stories
CREATE TRIGGER trigger_story_transcription
BEFORE INSERT ON instagram_stories
FOR EACH ROW
EXECUTE FUNCTION mark_video_for_transcription();

-- Function to get pending transcriptions
CREATE OR REPLACE FUNCTION get_pending_transcriptions(p_account_id UUID, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  source_type TEXT,
  source_id UUID,
  video_url TEXT,
  video_duration NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  -- Highlight items
  SELECT 
    'highlight_item'::TEXT as source_type,
    hi.id as source_id,
    hi.media_url as video_url,
    hi.video_duration
  FROM instagram_highlight_items hi
  WHERE hi.account_id = p_account_id
    AND hi.media_type = 'video'
    AND hi.transcription_status = 'pending'
  
  UNION ALL
  
  -- Stories
  SELECT 
    'story'::TEXT as source_type,
    s.id as source_id,
    s.media_url as video_url,
    s.video_duration
  FROM instagram_stories s
  WHERE s.account_id = p_account_id
    AND s.media_type = 'video'
    AND s.transcription_status = 'pending'
  
  UNION ALL
  
  -- Reels (from instagram_posts)
  SELECT 
    'reel'::TEXT as source_type,
    p.id as source_id,
    (p.media_urls->0->>'url')::TEXT as video_url,
    p.video_duration
  FROM instagram_posts p
  LEFT JOIN instagram_transcriptions t ON t.source_id = p.id AND t.source_type = 'reel'
  WHERE p.account_id = p_account_id
    AND p.type = 'reel'
    AND t.id IS NULL -- No transcription yet
  
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE instagram_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_highlight_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_bio_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_raw_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_processed_data ENABLE ROW LEVEL SECURITY;

-- Policies for influencers (view own data)
CREATE POLICY "Influencers view own highlights"
  ON instagram_highlights FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Influencers view own highlight items"
  ON instagram_highlight_items FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Influencers view own stories"
  ON instagram_stories FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Influencers view own transcriptions"
  ON instagram_transcriptions FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Influencers view own bio websites"
  ON instagram_bio_websites FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Influencers view own raw data"
  ON influencer_raw_data FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Influencers view own processed data"
  ON influencer_processed_data FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid()));

-- Service role can do everything (for backend scraping)
CREATE POLICY "Service role manages highlights"
  ON instagram_highlights FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role manages highlight items"
  ON instagram_highlight_items FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role manages stories"
  ON instagram_stories FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role manages transcriptions"
  ON instagram_transcriptions FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role manages bio websites"
  ON instagram_bio_websites FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role manages raw data"
  ON influencer_raw_data FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role manages processed data"
  ON influencer_processed_data FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE instagram_highlights IS 'הילייטס של משפיענים - קבוצות של סטוריז שמורים';
COMMENT ON TABLE instagram_highlight_items IS 'פריטים בודדים בתוך הילייט (תמונות/סרטונים)';
COMMENT ON TABLE instagram_stories IS 'סטוריז פעילים (פג תוקף אחרי 24 שעות)';
COMMENT ON TABLE instagram_transcriptions IS 'תמלולים של סרטונים מכל המקורות';
COMMENT ON TABLE instagram_bio_websites IS 'אתרים שנסרקו מהביו של המשפיען';
COMMENT ON TABLE influencer_raw_data IS 'אחסון גולמי של כל המידע לפני עיבוד';
COMMENT ON TABLE influencer_processed_data IS 'מידע מעובד ומובנה מוכן לשימוש בצאטבוט';
