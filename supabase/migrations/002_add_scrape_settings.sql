-- Add scrape_settings column to influencers table
-- This allows each influencer to customize their Instagram scraping preferences

ALTER TABLE influencers
ADD COLUMN IF NOT EXISTS scrape_settings JSONB DEFAULT '{
  "posts_limit": 50,
  "content_types": ["image", "video", "reel", "carousel"],
  "include_comments": false,
  "include_hashtags": true
}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN influencers.scrape_settings IS 'JSON object containing scrape preferences: posts_limit (10-100), content_types (array), include_comments (bool), include_hashtags (bool)';




