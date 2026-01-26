-- ============================================
-- FIX for Migration 004: Drop existing policies first
-- ============================================
-- הרץ את זה לפני 004 אם קיבלת שגיאת "policy already exists"

-- Drop all existing policies for 004 tables
DO $$ 
BEGIN
    -- Events policies
    DROP POLICY IF EXISTS "Anyone can insert events" ON events;
    DROP POLICY IF EXISTS "Service role can read events" ON events;
    
    -- Session locks policies
    DROP POLICY IF EXISTS "Service role manages locks" ON session_locks;
    
    -- Idempotency keys policies
    DROP POLICY IF EXISTS "Service role manages idempotency" ON idempotency_keys;
    
    -- Decision rules policies
    DROP POLICY IF EXISTS "Anyone can read enabled rules" ON decision_rules;
    DROP POLICY IF EXISTS "Service role manages rules" ON decision_rules;
    
    -- Cost tracking policies
    DROP POLICY IF EXISTS "Service role manages costs" ON cost_tracking;
    
    -- Accounts policies
    DROP POLICY IF EXISTS "Anyone can read active accounts" ON accounts;
    DROP POLICY IF EXISTS "Service role manages accounts" ON accounts;
    
    RAISE NOTICE '✅ כל הפוליסים של 004 נמחקו - עכשיו אפשר להריץ 004 מחדש';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE '⚠️  אחת הטבלאות עדיין לא קיימת - זה בסדר, פשוט הרץ 004';
    WHEN undefined_object THEN
        RAISE NOTICE '⚠️  אחד הפוליסים לא קיים - זה בסדר, פשוט הרץ 004';
END $$;
