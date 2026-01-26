-- ==================================================
-- 🔍 בדיקה: כל ה-Policies הקיימים
-- ==================================================

-- כל ה-policies שיש לך (קבוצה לפי טבלה)
SELECT 
  tablename,
  policyname,
  cmd as פעולה,
  CASE 
    WHEN tablename IN ('accounts', 'events', 'session_locks', 'idempotency_keys', 'decision_rules', 'cost_tracking') THEN 'מ-004'
    WHEN tablename IN ('partnerships', 'tasks', 'contracts', 'invoices', 'calendar_events', 'notifications') THEN 'מ-006'
    ELSE 'אחר'
  END as מקור
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
