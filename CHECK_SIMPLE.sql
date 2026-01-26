-- ==================================================
-- 🔍 בדיקה פשוטה: מה כבר קיים?
-- ==================================================

-- 1️⃣ כל הטבלאות שלך
SELECT 
  tablename,
  CASE 
    WHEN tablename IN ('accounts', 'events', 'session_locks', 'idempotency_keys', 'decision_rules', 'cost_tracking') THEN 'מ-004'
    WHEN tablename IN ('partnerships', 'tasks', 'contracts', 'invoices', 'calendar_events', 'notifications') THEN 'מ-006'
    WHEN tablename IN ('notification_rules', 'follow_ups', 'in_app_notifications') THEN 'מ-011'
    WHEN tablename IN ('coupons', 'coupon_usages', 'roi_tracking') THEN 'מ-012'
    WHEN tablename IN ('brand_communications', 'communication_messages', 'communication_alerts', 'communication_templates') THEN 'מ-013'
    WHEN tablename IN ('user_google_calendars', 'google_calendar_events') THEN 'מ-014'
    WHEN tablename LIKE 'chatbot%' OR tablename LIKE 'social_listening%' THEN 'מ-015'
    WHEN tablename IN ('coupon_copies') THEN 'מ-016'
    WHEN tablename IN ('satisfaction_surveys') THEN 'מ-017'
    ELSE 'אחר'
  END as מקור
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
