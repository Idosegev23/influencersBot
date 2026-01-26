-- ==================================================
-- 🔧 תיקון: מחיקת Policies קיימים מ-006
-- ==================================================
-- השתמש בזה אם קיבלת: "policy already exists" ב-006

-- רק עבור מיגרציה 006 - Influencer OS Tables

BEGIN;

-- ==================================================
-- מחיקת כל ה-RLS Policies של 006
-- ==================================================

-- 1. partnerships policies
DROP POLICY IF EXISTS "Users can view their partnerships" ON partnerships;
DROP POLICY IF EXISTS "Users can insert their own partnerships" ON partnerships;
DROP POLICY IF EXISTS "Users can update their own partnerships" ON partnerships;
DROP POLICY IF EXISTS "Service role has full access to partnerships" ON partnerships;

-- 2. tasks policies
DROP POLICY IF EXISTS "Users can view their tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update their own tasks" ON tasks;
DROP POLICY IF EXISTS "Service role has full access to tasks" ON tasks;

-- 3. contracts policies
DROP POLICY IF EXISTS "Users can view their contracts" ON contracts;
DROP POLICY IF EXISTS "Users can insert their own contracts" ON contracts;
DROP POLICY IF EXISTS "Users can update their own contracts" ON contracts;
DROP POLICY IF EXISTS "Service role has full access to contracts" ON contracts;

-- 4. invoices policies
DROP POLICY IF EXISTS "Users can view their invoices" ON invoices;
DROP POLICY IF EXISTS "Users can insert their own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update their own invoices" ON invoices;
DROP POLICY IF EXISTS "Service role has full access to invoices" ON invoices;

-- 5. calendar_events policies
DROP POLICY IF EXISTS "Users can view their calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can insert their own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can update their own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can delete their own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Service role has full access to calendar events" ON calendar_events;

-- 6. notifications policies
DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Service role has full access to notifications" ON notifications;

COMMIT;

-- ==================================================
-- ✅ תיקון הושלם
-- ==================================================
-- עכשיו אפשר להריץ את 006_influencer_os_tables.sql מחדש!
