-- Migration 020: Instagram Raw Data Storage
-- יצירת 4 טבלאות לאחסון מידע גולמי מ-Instagram

-- ============================================
-- 1. instagram_posts - אחסון פוסטים ורילסים
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Instagram identifiers
  shortcode TEXT NOT NULL,
  post_id TEXT,
  post_url TEXT,
  
  -- Content
  type TEXT NOT NULL CHECK (type IN ('post', 'reel', 'carousel', 'video')),
  caption TEXT,
  hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
  mentions TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Media
  media_urls JSONB DEFAULT '[]'::jsonb,
  thumbnail_url TEXT,
  video_duration INTEGER, -- seconds
  
  -- Metrics
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2), -- calculated: (likes + comments) / followers * 100
  
  -- Timestamps
  posted_at TIMESTAMPTZ NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  location TEXT,
  is_sponsored BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(account_id, shortcode)
);

-- Indexes for instagram_posts
CREATE INDEX idx_instagram_posts_account ON instagram_posts(account_id);
CREATE INDEX idx_instagram_posts_posted_at ON instagram_posts(posted_at DESC);
CREATE INDEX idx_instagram_posts_engagement ON instagram_posts(engagement_rate DESC);
CREATE INDEX idx_instagram_posts_type ON instagram_posts(type);
CREATE INDEX idx_instagram_posts_scraped_at ON instagram_posts(scraped_at DESC);

-- ============================================
-- 2. instagram_comments - תגובות על פוסטים
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES instagram_posts(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Comment data
  comment_id TEXT,
  text TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_profile_pic TEXT,
  
  -- Owner interaction
  is_owner_reply BOOLEAN DEFAULT FALSE,
  parent_comment_id UUID REFERENCES instagram_comments(id) ON DELETE CASCADE,
  
  -- Metrics
  likes_count INTEGER DEFAULT 0,
  
  -- Timestamps
  commented_at TIMESTAMPTZ NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(post_id, comment_id)
);

-- Indexes for instagram_comments
CREATE INDEX idx_instagram_comments_post ON instagram_comments(post_id);
CREATE INDEX idx_instagram_comments_account ON instagram_comments(account_id);
CREATE INDEX idx_instagram_comments_owner_reply ON instagram_comments(is_owner_reply) WHERE is_owner_reply = TRUE;
CREATE INDEX idx_instagram_comments_commented_at ON instagram_comments(commented_at DESC);
CREATE INDEX idx_instagram_comments_author ON instagram_comments(author_username);

-- ============================================
-- 3. instagram_hashtags - מעקב אחר האשטגים
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Hashtag data
  hashtag TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  
  -- Context
  context_posts UUID[] DEFAULT ARRAY[]::UUID[], -- post IDs where this hashtag appears
  related_hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Metadata from hashtag scraping
  total_posts_in_hashtag BIGINT, -- how many posts exist with this hashtag on Instagram
  avg_engagement DECIMAL(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(account_id, hashtag)
);

-- Indexes for instagram_hashtags
CREATE INDEX idx_instagram_hashtags_account ON instagram_hashtags(account_id);
CREATE INDEX idx_instagram_hashtags_frequency ON instagram_hashtags(frequency DESC);
CREATE INDEX idx_instagram_hashtags_last_seen ON instagram_hashtags(last_seen DESC);
CREATE INDEX idx_instagram_hashtags_hashtag ON instagram_hashtags(hashtag);

-- ============================================
-- 4. instagram_profile_history - היסטוריית פרופיל
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_profile_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Profile data snapshot
  username TEXT NOT NULL,
  full_name TEXT,
  bio TEXT,
  bio_links JSONB DEFAULT '[]'::jsonb,
  
  -- Counts
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  
  -- Profile metadata
  category TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  is_business_account BOOLEAN DEFAULT FALSE,
  profile_pic_url TEXT,
  
  -- Search positioning data (from Actor 5)
  search_results JSONB DEFAULT '{}'::jsonb, -- results from search actor
  
  -- Snapshot timestamp
  snapshot_date TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for instagram_profile_history
CREATE INDEX idx_instagram_profile_history_account ON instagram_profile_history(account_id);
CREATE INDEX idx_instagram_profile_history_snapshot ON instagram_profile_history(snapshot_date DESC);
CREATE INDEX idx_instagram_profile_history_followers ON instagram_profile_history(followers_count DESC);

-- ============================================
-- Helper function to calculate engagement rate
-- ============================================
CREATE OR REPLACE FUNCTION calculate_engagement_rate(
  p_likes INTEGER,
  p_comments INTEGER,
  p_followers INTEGER
) RETURNS DECIMAL(5,2) AS $$
BEGIN
  IF p_followers = 0 THEN
    RETURN 0;
  END IF;
  
  RETURN ROUND(((p_likes + p_comments)::DECIMAL / p_followers * 100)::NUMERIC, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- Trigger to update engagement_rate automatically
-- ============================================
CREATE OR REPLACE FUNCTION update_post_engagement_rate()
RETURNS TRIGGER AS $$
DECLARE
  v_followers_count INTEGER;
BEGIN
  -- Get latest follower count
  SELECT followers_count INTO v_followers_count
  FROM instagram_profile_history
  WHERE account_id = NEW.account_id
  ORDER BY snapshot_date DESC
  LIMIT 1;
  
  IF v_followers_count IS NOT NULL AND v_followers_count > 0 THEN
    NEW.engagement_rate := calculate_engagement_rate(
      NEW.likes_count,
      NEW.comments_count,
      v_followers_count
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_post_engagement
BEFORE INSERT OR UPDATE ON instagram_posts
FOR EACH ROW
EXECUTE FUNCTION update_post_engagement_rate();

-- ============================================
-- Enable RLS (Row Level Security)
-- ============================================
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_profile_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies - influencers can only see their own data
CREATE POLICY "Influencers can view their own Instagram posts"
  ON instagram_posts FOR SELECT
  USING (account_id IN (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid()
  ));

CREATE POLICY "Influencers can view their own Instagram comments"
  ON instagram_comments FOR SELECT
  USING (account_id IN (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid()
  ));

CREATE POLICY "Influencers can view their own Instagram hashtags"
  ON instagram_hashtags FOR SELECT
  USING (account_id IN (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid()
  ));

CREATE POLICY "Influencers can view their own Instagram profile history"
  ON instagram_profile_history FOR SELECT
  USING (account_id IN (
    SELECT id FROM accounts WHERE owner_user_id = auth.uid()
  ));

-- Service role can do everything (for backend scraping)
CREATE POLICY "Service role can manage all Instagram posts"
  ON instagram_posts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage all Instagram comments"
  ON instagram_comments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage all Instagram hashtags"
  ON instagram_hashtags FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage all Instagram profile history"
  ON instagram_profile_history FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE instagram_posts IS 'אחסון פוסטים ורילסים גולמיים מ-Instagram (עד 500 אחרונים)';
COMMENT ON TABLE instagram_comments IS 'תגובות על פוסטים (עד 50 למעלה לכל פוסט)';
COMMENT ON TABLE instagram_hashtags IS 'מעקב אחר שימוש בהאשטגים ותדירות';
COMMENT ON TABLE instagram_profile_history IS 'היסטוריית snapshots של הפרופיל';
