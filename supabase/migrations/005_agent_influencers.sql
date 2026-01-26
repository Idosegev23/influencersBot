-- ==================================================
-- Migration 005: Agent-Influencer Relationships
-- ==================================================
-- תיאור: טבלה לקישור בין סוכנים למשפיענים שהם מנהלים
-- תאריך: 2026-01-19
--
-- דרישות: צריך להריץ אחרי 004 (accounts) ולפני 010 (storage)
-- ==================================================

BEGIN;

-- ==================================================
-- טבלת agent_influencers
-- ==================================================

CREATE TABLE IF NOT EXISTS public.agent_influencers (
  -- Primary columns
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  influencer_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Permissions
  can_view_analytics boolean DEFAULT true,
  can_edit_partnerships boolean DEFAULT true,
  can_manage_tasks boolean DEFAULT true,
  can_access_documents boolean DEFAULT true,
  
  -- Metadata
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id),
  notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  UNIQUE(agent_id, influencer_account_id) -- כל סוכן יכול להיות מוקצה פעם אחת לכל משפיען
);

-- ==================================================
-- Indexes
-- ==================================================

-- מהיר למצוא את כל המשפיענים של סוכן
CREATE INDEX idx_agent_influencers_agent_id 
ON public.agent_influencers(agent_id);

-- מהיר למצוא את כל הסוכנים של משפיען
CREATE INDEX idx_agent_influencers_influencer_account_id 
ON public.agent_influencers(influencer_account_id);

-- ==================================================
-- RLS Policies
-- ==================================================

ALTER TABLE public.agent_influencers ENABLE ROW LEVEL SECURITY;

-- Policy 1: Admins רואים הכל
CREATE POLICY "Admins can view all agent-influencer relationships"
ON public.agent_influencers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy 2: Agents רואים רק את המשפיענים שלהם
CREATE POLICY "Agents can view their assigned influencers"
ON public.agent_influencers FOR SELECT
USING (
  agent_id = auth.uid()
);

-- Policy 3: Influencers רואים מי הסוכנים שלהם
CREATE POLICY "Influencers can view their assigned agents"
ON public.agent_influencers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.accounts 
    WHERE 
      id = influencer_account_id AND 
      owner_user_id = auth.uid()
  )
);

-- Policy 4: רק Admins יכולים להוסיף/לעדכן/למחוק
CREATE POLICY "Admins can manage agent-influencer relationships"
ON public.agent_influencers FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ==================================================
-- Trigger: Update updated_at
-- ==================================================

CREATE TRIGGER update_agent_influencers_updated_at
BEFORE UPDATE ON public.agent_influencers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ==================================================
-- Helper Functions
-- ==================================================

-- פונקציה: האם סוכן מנהל משפיען מסוים?
CREATE OR REPLACE FUNCTION public.is_agent_managing_influencer(
  p_agent_id uuid,
  p_influencer_account_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM agent_influencers 
    WHERE 
      agent_id = p_agent_id AND 
      influencer_account_id = p_influencer_account_id
  );
$$;

-- פונקציה: קבל את כל המשפיענים של סוכן
CREATE OR REPLACE FUNCTION public.get_agent_influencers(p_agent_id uuid)
RETURNS TABLE (
  account_id uuid,
  account_name text,
  influencer_username text,
  assigned_at timestamptz,
  can_view_analytics boolean,
  can_edit_partnerships boolean,
  can_manage_tasks boolean,
  can_access_documents boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    a.id as account_id,
    a.name as account_name,
    i.username as influencer_username,
    ai.assigned_at,
    ai.can_view_analytics,
    ai.can_edit_partnerships,
    ai.can_manage_tasks,
    ai.can_access_documents
  FROM agent_influencers ai
  JOIN accounts a ON a.id = ai.influencer_account_id
  JOIN influencers i ON i.account_id = a.id
  WHERE ai.agent_id = p_agent_id
  ORDER BY ai.assigned_at DESC;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.is_agent_managing_influencer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_influencers(uuid) TO authenticated;

COMMIT;

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ טבלת agent_influencers נוצרה בהצלחה!';
  RAISE NOTICE '✅ RLS policies הוגדרו';
  RAISE NOTICE '✅ פונקציות עזר נוצרו';
  RAISE NOTICE '';
  RAISE NOTICE '📋 עכשיו אפשר להריץ את 010_storage_setup.sql';
  RAISE NOTICE '';
END$$;
