-- ==================================================
-- 🔍 בדיקה: מה כבר קיים במערכת?
-- ==================================================
-- הרץ את זה בSQL Editor כדי לראות מה כבר בנוי

-- ==================================================
-- 1. כל הטבלאות הקיימות
-- ==================================================

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '🔍 בודק מה כבר קיים במערכת...'; RAISE NOTICE '===================================='; RAISE NOTICE ''; END $$;

DO $$ BEGIN RAISE NOTICE '📋 טבלאות קיימות:'; END $$;

SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN tablename IN ('accounts', 'events', 'session_locks', 'idempotency_keys', 'decision_rules', 'cost_tracking') THEN '← מ-004'
    WHEN tablename IN ('partnerships', 'tasks', 'contracts', 'invoices', 'calendar_events', 'notifications') THEN '← מ-006'
    WHEN tablename IN ('coupons', 'coupon_usages', 'roi_tracking') THEN '← מ-012'
    WHEN tablename IN ('coupon_copies') THEN '← מ-016'
    WHEN tablename IN ('satisfaction_surveys') THEN '← מ-017'
    WHEN tablename IN ('notification_rules', 'follow_ups', 'in_app_notifications') THEN '← מ-011'
    WHEN tablename IN ('brand_communications', 'communication_messages', 'communication_alerts', 'communication_templates') THEN '← מ-013'
    WHEN tablename IN ('calendar_connections', 'calendar_sync_log') THEN '← מ-014'
    WHEN tablename LIKE 'chatbot%' THEN '← מ-015'
    WHEN tablename LIKE 'social_listening%' THEN '← מ-015'
    WHEN tablename = 'influencers' THEN '← טבלה בסיסית'
    WHEN tablename = 'users' THEN '← טבלה בסיסית'
    WHEN tablename LIKE 'chat%' THEN '← מערכת צאט'
    ELSE ''
  END as source
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '===================================='; RAISE NOTICE ''; END $$;

-- ==================================================
-- 2. ספירה לפי מיגרציות
-- ==================================================

DO $$
DECLARE
  v_count INT;
  v_total INT := 0;
BEGIN
  RAISE NOTICE '📊 ספירה לפי מיגרציות:';
  RAISE NOTICE '';
  
  -- 004: v2 Engines
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('accounts', 'events', 'session_locks', 'idempotency_keys', 'decision_rules', 'cost_tracking');
  v_total := v_total + v_count;
  RAISE NOTICE '[004] v2 Engines: % / 6 טבלאות', v_count;
  
  -- 006: Influencer OS
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('partnerships', 'tasks', 'contracts', 'invoices', 'calendar_events', 'notifications');
  v_total := v_total + v_count;
  RAISE NOTICE '[006] Influencer OS: % / 6 טבלאות', v_count;
  
  -- 011: Notification Engine
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('notification_rules', 'follow_ups', 'in_app_notifications');
  v_total := v_total + v_count;
  RAISE NOTICE '[011] Notification Engine: % / 3 טבלאות', v_count;
  
  -- 012: Coupons & ROI
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('coupons', 'coupon_usages', 'roi_tracking');
  v_total := v_total + v_count;
  RAISE NOTICE '[012] Coupons & ROI: % / 3 טבלאות', v_count;
  
  -- 013: Brand Communications
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('brand_communications', 'communication_messages', 'communication_alerts', 'communication_templates');
  v_total := v_total + v_count;
  RAISE NOTICE '[013] Brand Communications: % / 4 טבלאות', v_count;
  
  -- 014: Calendar Integration
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('calendar_connections', 'calendar_sync_log');
  v_total := v_total + v_count;
  RAISE NOTICE '[014] Calendar Integration: % / 2 טבלאות (+ calendar_events)', v_count;
  
  -- 015: Chatbot
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name LIKE 'chatbot%';
  v_total := v_total + v_count;
  RAISE NOTICE '[015] Chatbot: % טבלאות', v_count;
  
  -- 015: Social Listening
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name LIKE 'social_listening%';
  v_total := v_total + v_count;
  RAISE NOTICE '[015] Social Listening: % טבלאות', v_count;
  
  -- 016: Copy Tracking
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'coupon_copies';
  v_total := v_total + v_count;
  RAISE NOTICE '[016] Copy Tracking: % / 1 טבלה', v_count;
  
  -- 017: Satisfaction Surveys
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'satisfaction_surveys';
  v_total := v_total + v_count;
  RAISE NOTICE '[017] Satisfaction Surveys: % / 1 טבלה', v_count;
  
  RAISE NOTICE '';
  RAISE NOTICE '📊 סה"כ טבלאות ממיגרציות: %', v_total;
  RAISE NOTICE '';
  RAISE NOTICE '====================================';
  RAISE NOTICE '';
END $$;

-- ==================================================
-- 3. Policies קיימים (הבעיה שלך!)
-- ==================================================

DO $$ BEGIN RAISE NOTICE '🔐 Policies קיימים לטבלאות הבעייתיות:'; RAISE NOTICE ''; END $$;

-- Policies על partnerships
SELECT 
  'partnerships' as table_name,
  policyname,
  cmd as command,
  CASE WHEN policyname LIKE '%insert%' THEN '← הבעיה שלך!' ELSE '' END as note
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'partnerships'
ORDER BY policyname;

-- Policies על tasks
SELECT 
  'tasks' as table_name,
  policyname,
  cmd as command
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'tasks'
ORDER BY policyname;

-- Policies על accounts
SELECT 
  'accounts' as table_name,
  policyname,
  cmd as command
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'accounts'
ORDER BY policyname;

-- Policies על events
SELECT 
  'events' as table_name,
  policyname,
  cmd as command
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'events'
ORDER BY policyname;

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '===================================='; RAISE NOTICE ''; END $$;

-- ==================================================
-- 4. עמודות חסרות? (בדיקה למיגרציות 001-003)
-- ==================================================

DO $$ BEGIN RAISE NOTICE '📋 בדיקת עמודות במיגרציות 001-003:'; END $$;

DO $$
BEGIN
  -- Check if influencers table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'influencers') THEN
    RAISE NOTICE '✅ טבלת influencers קיימת';
    
    -- Check 001 columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'influencers' AND column_name = 'greeting_message') THEN
      RAISE NOTICE '  ✅ [001] greeting_message קיים';
    ELSE
      RAISE NOTICE '  ❌ [001] greeting_message חסר - צריך להריץ 001!';
    END IF;
    
    -- Check 002 columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'influencers' AND column_name = 'scrape_settings') THEN
      RAISE NOTICE '  ✅ [002] scrape_settings קיים';
    ELSE
      RAISE NOTICE '  ❌ [002] scrape_settings חסר - צריך להריץ 002!';
    END IF;
    
    -- Check 003 columns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'influencers' AND column_name = 'phone_number') THEN
      RAISE NOTICE '  ✅ [003] phone_number קיים';
    ELSE
      RAISE NOTICE '  ❌ [003] phone_number חסר - צריך להריץ 003!';
    END IF;
  ELSE
    RAISE NOTICE '❌ טבלת influencers לא קיימת!';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '===================================='; RAISE NOTICE ''; END $$;

-- ==================================================
-- 5. סיכום - מה צריך לעשות?
-- ==================================================

DO $$
DECLARE
  v_has_accounts BOOLEAN;
  v_has_partnerships BOOLEAN;
  v_has_coupons BOOLEAN;
  v_has_chatbot BOOLEAN;
BEGIN
  RAISE NOTICE '🎯 סיכום והמלצות:';
  
  -- Check key tables
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') INTO v_has_accounts;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'partnerships') INTO v_has_partnerships;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coupons') INTO v_has_coupons;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chatbot_persona') INTO v_has_chatbot;
  
  RAISE NOTICE '';
  
  IF NOT v_has_accounts THEN
    RAISE NOTICE '❌ אין accounts - צריך להריץ 004!';
  ELSIF NOT v_has_partnerships THEN
    RAISE NOTICE '⚠️  יש accounts אבל אין partnerships - צריך להריץ 006!';
  ELSIF NOT v_has_coupons THEN
    RAISE NOTICE '⚠️  יש partnerships אבל אין coupons - צריך להריץ 010-012!';
  ELSIF NOT v_has_chatbot THEN
    RAISE NOTICE '⚠️  יש coupons אבל אין chatbot - צריך להריץ 013-015!';
  ELSE
    RAISE NOTICE '✅ כל הטבלאות העיקריות קיימות!';
    RAISE NOTICE '';
    RAISE NOTICE '💡 אבל יש לך שגיאות policies - צריך להריץ FIX!';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '====================================';
  RAISE NOTICE '✅ בדיקה הושלמה!';
  RAISE NOTICE '====================================';
END $$;
