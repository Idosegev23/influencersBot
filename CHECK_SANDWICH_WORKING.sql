-- ============================================
-- בדיקה מהירה: האם מערכת Sandwich פעילה?
-- ============================================
-- הרץ את זה ב-Supabase SQL Editor לבדוק שיש נתונים

-- 1️⃣ בדוק שיש accounts
SELECT 
  id, 
  instagram_username, 
  status,
  created_at
FROM accounts
WHERE account_type = 'influencer'
ORDER BY created_at DESC
LIMIT 5;

-- 2️⃣ בדוק שיש פוסטים (מה-scan)
SELECT 
  account_id,
  COUNT(*) as posts_count,
  MAX(posted_at) as last_post
FROM instagram_posts
GROUP BY account_id;

-- 3️⃣ בדוק שיש highlights
SELECT 
  account_id,
  COUNT(*) as highlights_count,
  MAX(scraped_at) as last_scraped
FROM instagram_highlights
GROUP BY account_id;

-- 4️⃣ בדוק שיש קופונים
SELECT 
  account_id,
  COUNT(*) as coupons_count,
  STRING_AGG(brand_name, ', ') as brands
FROM partnerships
WHERE status = 'active' 
  AND coupon_code IS NOT NULL
GROUP BY account_id;

-- 5️⃣ בדוק שיש אתרים סרוקים
SELECT 
  account_id,
  COUNT(*) as websites_count,
  MAX(scraped_at) as last_scraped
FROM scraped_websites
GROUP BY account_id;

-- 6️⃣ בדוק שיש תמלולים
SELECT 
  account_id,
  COUNT(*) as transcriptions_count,
  COUNT(*) FILTER (WHERE processing_status = 'completed') as completed,
  COUNT(*) FILTER (WHERE processing_status = 'failed') as failed
FROM instagram_transcriptions
GROUP BY account_id;

-- 7️⃣ בדוק שיש תובנות
SELECT 
  account_id,
  COUNT(*) as insights_count,
  STRING_AGG(DISTINCT archetype, ', ') as archetypes
FROM conversation_insights
WHERE is_active = true
GROUP BY account_id;

-- 8️⃣ בדוק שיש persona
SELECT 
  p.account_id,
  a.instagram_username,
  p.name,
  p.tone,
  p.language,
  ARRAY_LENGTH(p.topics, 1) as topics_count,
  ARRAY_LENGTH(p.interests, 1) as interests_count
FROM chatbot_persona p
JOIN accounts a ON p.account_id = a.id
ORDER BY p.created_at DESC;

-- 9️⃣ בדוק שיש שיחות (chat sessions)
SELECT 
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as sessions_last_7_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as sessions_today
FROM chat_sessions;

-- 🔟 בדוק שיש scan jobs שהצליחו
SELECT 
  account_id,
  status,
  COUNT(*) as jobs_count,
  MAX(started_at) as last_job,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
FROM scan_jobs
WHERE status IN ('succeeded', 'failed')
GROUP BY account_id, status
ORDER BY account_id, status;

-- ============================================
-- תוצאות מצופות:
-- ============================================
-- ✅ אם יש נתונים בכל הטבלאות → המערכת פעילה!
-- ⚠️ אם חסר משהו → צריך להריץ scan job
-- ❌ אם אין accounts → צריך להוסיף influencer

-- להרצת scan:
-- POST /api/scan/start
-- { "username": "the_dekel", "accountId": "[ACCOUNT_ID]" }
