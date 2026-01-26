-- ==================================================
-- Migration 011: Notification Engine
-- ==================================================
-- תיאור: מערכת התראות חכמה עם כללים דינמיים
-- תאריך: 2026-01-18
-- ==================================================

-- Table: notification_rules
-- תבלה לשמירת כללי התראה (למשל: "3 ימים לפני deadline", "משימה באיחור")
CREATE TABLE IF NOT EXISTS public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'task_deadline_approaching',
    'task_overdue',
    'partnership_start_soon',
    'partnership_ending_soon',
    'invoice_due',
    'milestone_completed',
    'document_uploaded',
    'message_received'
  )),
  timing_value INTEGER, -- כמה ימים לפני/אחרי
  timing_unit TEXT CHECK (timing_unit IN ('minutes', 'hours', 'days', 'weeks')),
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'], -- ['email', 'whatsapp', 'in_app']
  template TEXT, -- תבנית הודעה עם placeholders
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: follow_ups
-- תבלה לשמירת התראות ספציפיות שנוצרו לפי הכללים
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.notification_rules(id) ON DELETE SET NULL,
  
  -- Reference to related entity
  partnership_id UUID REFERENCES public.partnerships(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  -- Notification details
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'in_app', 'push')),
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'sent',
    'failed',
    'cancelled'
  )),
  
  -- Metadata
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: in_app_notifications
-- התראות שמוצגות בממשק
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  follow_up_id UUID REFERENCES public.follow_ups(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  
  -- Action link
  action_url TEXT,
  action_label TEXT,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================
-- Indexes for Performance
-- ==================================================

CREATE INDEX idx_follow_ups_scheduled FOR public.follow_ups USING btree (scheduled_for)
  WHERE status = 'pending';

CREATE INDEX idx_follow_ups_account ON public.follow_ups(account_id);
CREATE INDEX idx_follow_ups_user ON public.follow_ups(user_id);
CREATE INDEX idx_follow_ups_status ON public.follow_ups(status);

CREATE INDEX idx_in_app_notifications_user_unread 
  ON public.in_app_notifications(user_id, is_read) 
  WHERE is_read = false;

CREATE INDEX idx_in_app_notifications_account ON public.in_app_notifications(account_id);
CREATE INDEX idx_in_app_notifications_created ON public.in_app_notifications(created_at DESC);

-- ==================================================
-- RLS Policies
-- ==================================================

-- notification_rules: Admin only
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage notification rules"
ON public.notification_rules
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "All users can view active rules"
ON public.notification_rules
FOR SELECT
TO authenticated
USING (is_active = true);

-- follow_ups: Users see their own
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their follow_ups"
ON public.follow_ups
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "System can insert follow_ups"
ON public.follow_ups
FOR INSERT
TO authenticated
WITH CHECK (true); -- API will handle authorization

CREATE POLICY "System can update follow_ups"
ON public.follow_ups
FOR UPDATE
TO authenticated
USING (true); -- API will handle authorization

-- in_app_notifications: Users see their own
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications"
ON public.in_app_notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their notifications (mark as read)"
ON public.in_app_notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
ON public.in_app_notifications
FOR INSERT
TO authenticated
WITH CHECK (true); -- API will handle authorization

-- ==================================================
-- Default Notification Rules
-- ==================================================

INSERT INTO public.notification_rules (name, description, trigger_type, timing_value, timing_unit, channels, template) VALUES
('Task Deadline - 3 Days', 'התראה 3 ימים לפני deadline של משימה', 'task_deadline_approaching', 3, 'days', ARRAY['in_app', 'email'], 'המשימה "{{task_name}}" מגיעה לדדליין בעוד {{days}} ימים'),
('Task Deadline - 1 Day', 'התראה יום לפני deadline של משימה', 'task_deadline_approaching', 1, 'days', ARRAY['in_app', 'whatsapp'], 'תזכורת! המשימה "{{task_name}}" מגיעה לדדליין מחר'),
('Task Overdue', 'התראה על משימה באיחור', 'task_overdue', 0, 'days', ARRAY['in_app', 'email'], 'המשימה "{{task_name}}" באיחור של {{days}} ימים'),
('Partnership Starting Soon', 'התראה על שת"פ שמתחיל בקרוב', 'partnership_start_soon', 7, 'days', ARRAY['in_app', 'email'], 'שת"פ "{{partnership_name}}" מתחיל בעוד שבוע'),
('Partnership Ending Soon', 'התראה על שת"פ שמסתיים בקרוב', 'partnership_ending_soon', 7, 'days', ARRAY['in_app', 'email'], 'שת"פ "{{partnership_name}}" מסתיים בעוד שבוע'),
('Invoice Due Soon', 'התראה על חשבונית שמגיעה לתאריך', 'invoice_due', 3, 'days', ARRAY['in_app', 'email'], 'חשבונית "{{invoice_number}}" אמורה להתקבל בעוד {{days}} ימים'),
('Milestone Completed', 'התראה על השלמת אבן דרך', 'milestone_completed', 0, 'days', ARRAY['in_app'], 'אבן הדרך "{{milestone_name}}" הושלמה!'),
('Document Uploaded', 'התראה על העלאת מסמך חדש', 'document_uploaded', 0, 'minutes', ARRAY['in_app'], 'מסמך חדש הועלה: {{document_name}}');

-- ==================================================
-- Helper Functions
-- ==================================================

-- Function to create follow-ups from rules
CREATE OR REPLACE FUNCTION public.create_follow_up_from_rule(
  p_account_id UUID,
  p_user_id UUID,
  p_rule_id UUID,
  p_partnership_id UUID DEFAULT NULL,
  p_task_id UUID DEFAULT NULL,
  p_invoice_id UUID DEFAULT NULL,
  p_title TEXT,
  p_message TEXT,
  p_scheduled_for TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follow_up_id UUID;
  v_rule_channels TEXT[];
  v_channel TEXT;
BEGIN
  -- Get channels from rule
  SELECT channels INTO v_rule_channels
  FROM notification_rules
  WHERE id = p_rule_id;

  -- Create a follow-up for each channel
  FOREACH v_channel IN ARRAY v_rule_channels
  LOOP
    INSERT INTO follow_ups (
      account_id,
      user_id,
      rule_id,
      partnership_id,
      task_id,
      invoice_id,
      title,
      message,
      channel,
      scheduled_for,
      status
    ) VALUES (
      p_account_id,
      p_user_id,
      p_rule_id,
      p_partnership_id,
      p_task_id,
      p_invoice_id,
      p_title,
      p_message,
      v_channel,
      p_scheduled_for,
      'pending'
    ) RETURNING id INTO v_follow_up_id;
  END LOOP;

  RETURN v_follow_up_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_follow_up_from_rule TO authenticated;

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Notification Engine tables created!';
  RAISE NOTICE '✅ notification_rules: % rules inserted', (SELECT COUNT(*) FROM public.notification_rules);
  RAISE NOTICE '✅ RLS policies configured';
  RAISE NOTICE '✅ Helper functions created';
END$$;
