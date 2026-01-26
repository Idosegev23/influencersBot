-- ==================================================
-- 🔍 בדיקה: ספירה לפי מיגרציות
-- ==================================================

SELECT 
  'סה"כ טבלאות' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public'

UNION ALL

SELECT 
  '004 - v2 Engines' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename IN ('accounts', 'events', 'session_locks', 'idempotency_keys', 'decision_rules', 'cost_tracking')

UNION ALL

SELECT 
  '006 - Influencer OS' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename IN ('partnerships', 'tasks', 'contracts', 'invoices', 'calendar_events', 'notifications')

UNION ALL

SELECT 
  '011 - Notifications' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename IN ('notification_rules', 'follow_ups', 'in_app_notifications')

UNION ALL

SELECT 
  '012 - Coupons' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename IN ('coupons', 'coupon_usages', 'roi_tracking')

UNION ALL

SELECT 
  '013 - Communications' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename IN ('brand_communications', 'communication_messages', 'communication_alerts', 'communication_templates')

UNION ALL

SELECT 
  '014 - Calendar' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename IN ('user_google_calendars', 'google_calendar_events')

UNION ALL

SELECT 
  '015 - Chatbot' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND (tablename LIKE 'chatbot%' OR tablename LIKE 'social_listening%')

UNION ALL

SELECT 
  '016 - Copy Tracking' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'coupon_copies'

UNION ALL

SELECT 
  '017 - Surveys' as סטטוס,
  COUNT(*) as כמות
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'satisfaction_surveys';
