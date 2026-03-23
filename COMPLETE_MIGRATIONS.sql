-- ==================================================
-- 🚀 כל המיגרציות המלאות - גרסה מאוחדת
-- ==================================================
-- תאריך: 2026-01-19
-- 
-- הוראות הרצה:
-- 1. פתח את Supabase Dashboard: https://supabase.com/dashboard
-- 2. SQL Editor → + New Query
-- 3. העתק והדבק את כל התוכן
-- 4. לחץ Run
-- 5. המתן 30-60 שניות (זה גדול!)
-- 6. בדוק שכל ההודעות ✅ הופיעו
--
-- ⚠️  הקובץ הזה כולל 13 מיגרציות!
-- ==================================================

\echo ''
\echo '🚀 מתחיל הרצת 13 מיגרציות...'
\echo '===================================='
\echo ''

-- ==================================================
-- Migration 001: Add Personalization Fields
-- ==================================================

\echo '▶️  [001] Personalization fields...'

ALTER TABLE influencers ADD COLUMN IF NOT EXISTS greeting_message TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS suggested_questions JSONB DEFAULT '[]';
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS hide_branding BOOLEAN DEFAULT false;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS custom_logo_url TEXT;

COMMENT ON COLUMN influencers.greeting_message IS 'Custom greeting message for chat, AI-generated during onboarding';
COMMENT ON COLUMN influencers.suggested_questions IS 'Array of suggested questions for chat UI, AI-generated during onboarding';
COMMENT ON COLUMN influencers.hide_branding IS 'White label: hide "Powered by bestieAI" branding';
COMMENT ON COLUMN influencers.custom_logo_url IS 'White label: custom logo URL';

CREATE INDEX IF NOT EXISTS idx_influencers_username ON influencers(username);
CREATE INDEX IF NOT EXISTS idx_influencers_subdomain ON influencers(subdomain);

\echo '   ✅ [001] הושלם!'

-- ==================================================
-- Migration 002: Add Scrape Settings
-- ==================================================

\echo '▶️  [002] Scrape settings...'

ALTER TABLE influencers
ADD COLUMN IF NOT EXISTS scrape_settings JSONB DEFAULT '{
  "posts_limit": 50,
  "content_types": ["image", "video", "reel", "carousel"],
  "include_comments": false,
  "include_hashtags": true
}'::jsonb;

COMMENT ON COLUMN influencers.scrape_settings IS 'JSON object containing scrape preferences: posts_limit (10-100), content_types (array), include_comments (bool), include_hashtags (bool)';

\echo '   ✅ [002] הושלם!'

-- ==================================================
-- Migration 003: Add Phone and WhatsApp
-- ==================================================

\echo '▶️  [003] Phone and WhatsApp...'

ALTER TABLE influencers
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_influencers_phone ON influencers(phone_number);

COMMENT ON COLUMN influencers.phone_number IS 'Influencer phone number for WhatsApp notifications (format: 0541234567)';
COMMENT ON COLUMN influencers.whatsapp_enabled IS 'Whether WhatsApp notifications are enabled for this influencer';

\echo '   ✅ [003] הושלם!'

\echo ''
\echo '📦 מיגרציות בסיסיות (001-003) הושלמו!'
\echo '▶️  עובר למיגרציות מתקדמות...'
\echo ''

-- ==================================================
-- המשך בהודעה הבאה עקב הגבלת אורך...
-- ==================================================
-- הקובץ המלא גדול מדי לכתיבה אחת.
-- בואו נפצל אותו למספר חלקים.
-- ==================================================
