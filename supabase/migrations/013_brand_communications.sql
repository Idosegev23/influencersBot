-- ==================================================
-- Migration 013: Brand Communications Hub
-- ==================================================
-- תיאור: Hub מרכזי לכל התקשורת עם מותגים
-- תאריך: 2026-01-18
-- קטגוריות: פיננסי, משפטי, בעיות
-- ==================================================

-- Table: brand_communications
-- Thread של שיחה עם מותג (כולל כל ההודעות)
CREATE TABLE IF NOT EXISTS public.brand_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  partnership_id UUID REFERENCES public.partnerships(id) ON DELETE SET NULL,
  
  -- Subject & Category
  subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('financial', 'legal', 'issues', 'general')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Brand Info
  brand_name TEXT NOT NULL,
  brand_contact_name TEXT,
  brand_contact_email TEXT,
  brand_contact_phone TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_response', 'waiting_payment', 'resolved', 'closed')),
  
  -- SLA & Tracking
  due_date TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_by TEXT, -- 'influencer' or 'brand' or 'agent'
  
  -- Counters
  message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  
  -- Tags & Metadata
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}',
  
  -- Related Entities
  related_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  related_document_id UUID REFERENCES public.partnership_documents(id) ON DELETE SET NULL,
  related_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Table: communication_messages
-- הודעות בתוך thread
CREATE TABLE IF NOT EXISTS public.communication_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES public.brand_communications(id) ON DELETE CASCADE,
  
  -- Message Content
  sender_type TEXT NOT NULL CHECK (sender_type IN ('influencer', 'brand', 'agent', 'system')),
  sender_name TEXT,
  sender_email TEXT,
  
  -- Content
  message_text TEXT NOT NULL,
  message_html TEXT,
  
  -- Attachments
  attachments JSONB DEFAULT '[]', -- Array of {name, url, size, type}
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Table: communication_alerts
-- התראות אוטומטיות לתקשורת (משולב עם Notification Engine)
CREATE TABLE IF NOT EXISTS public.communication_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES public.brand_communications(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Alert Type
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'no_response_3_days',
    'no_response_7_days',
    'payment_overdue',
    'contract_not_signed',
    'issue_unresolved',
    'sla_breach'
  )),
  
  -- Alert Details
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed', 'resolved')),
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================
-- Indexes for Performance
-- ==================================================

CREATE INDEX idx_brand_communications_account ON public.brand_communications(account_id);
CREATE INDEX idx_brand_communications_partnership ON public.brand_communications(partnership_id);
CREATE INDEX idx_brand_communications_status ON public.brand_communications(status);
CREATE INDEX idx_brand_communications_category ON public.brand_communications(category);
CREATE INDEX idx_brand_communications_due_date ON public.brand_communications(due_date) 
  WHERE status IN ('open', 'waiting_response', 'waiting_payment');
CREATE INDEX idx_brand_communications_last_message ON public.brand_communications(last_message_at DESC);

CREATE INDEX idx_communication_messages_communication ON public.communication_messages(communication_id);
CREATE INDEX idx_communication_messages_created ON public.communication_messages(created_at DESC);
CREATE INDEX idx_communication_messages_unread ON public.communication_messages(communication_id, is_read) 
  WHERE is_read = false;

CREATE INDEX idx_communication_alerts_communication ON public.communication_alerts(communication_id);
CREATE INDEX idx_communication_alerts_account ON public.communication_alerts(account_id);
CREATE INDEX idx_communication_alerts_status ON public.communication_alerts(status);
CREATE INDEX idx_communication_alerts_pending ON public.communication_alerts(triggered_at) 
  WHERE status = 'pending';

-- ==================================================
-- RLS Policies
-- ==================================================

-- brand_communications: Users see their own
ALTER TABLE public.brand_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their communications"
ON public.brand_communications
FOR SELECT
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
  OR
  -- Agent sees assigned influencer comms
  account_id IN (
    SELECT ai.influencer_account_id
    FROM public.agent_influencers ai
    WHERE ai.agent_id = auth.uid()
  )
  OR
  -- Admin sees all
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "Users can insert their communications"
ON public.brand_communications
FOR INSERT
TO authenticated
WITH CHECK (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their communications"
ON public.brand_communications
FOR UPDATE
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
  OR
  account_id IN (
    SELECT ai.influencer_account_id
    FROM public.agent_influencers ai
    WHERE ai.agent_id = auth.uid()
  )
);

-- communication_messages: Nested under communications
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their communications"
ON public.communication_messages
FOR SELECT
TO authenticated
USING (
  communication_id IN (
    SELECT id FROM public.brand_communications
    WHERE account_id IN (
      SELECT id FROM public.accounts
      WHERE owner_user_id = auth.uid()
    )
    OR account_id IN (
      SELECT ai.influencer_account_id
      FROM public.agent_influencers ai
      WHERE ai.agent_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  )
);

CREATE POLICY "Users can insert messages in their communications"
ON public.communication_messages
FOR INSERT
TO authenticated
WITH CHECK (
  communication_id IN (
    SELECT id FROM public.brand_communications
    WHERE account_id IN (
      SELECT id FROM public.accounts
      WHERE owner_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update their messages"
ON public.communication_messages
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
);

-- communication_alerts: Users see their own
ALTER TABLE public.communication_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their alerts"
ON public.communication_alerts
FOR SELECT
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "Users can update their alerts"
ON public.communication_alerts
FOR UPDATE
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

CREATE POLICY "System can insert alerts"
ON public.communication_alerts
FOR INSERT
TO authenticated
WITH CHECK (true); -- API handles authorization

-- ==================================================
-- Helper Functions
-- ==================================================

-- Function: Update communication counters
CREATE OR REPLACE FUNCTION public.update_communication_counters()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update message count and last message timestamp
  UPDATE public.brand_communications
  SET 
    message_count = message_count + 1,
    last_message_at = NEW.created_at,
    last_message_by = NEW.sender_type,
    updated_at = NOW()
  WHERE id = NEW.communication_id;
  
  -- If message is from brand, increment unread count
  IF NEW.sender_type = 'brand' THEN
    UPDATE public.brand_communications
    SET unread_count = unread_count + 1
    WHERE id = NEW.communication_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger: Auto-update counters on new message
CREATE TRIGGER trigger_update_communication_counters
AFTER INSERT ON public.communication_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_communication_counters();

-- Function: Mark message as read
CREATE OR REPLACE FUNCTION public.mark_message_as_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Decrement unread count if marking as read
  IF OLD.is_read = false AND NEW.is_read = true THEN
    UPDATE public.brand_communications
    SET unread_count = GREATEST(unread_count - 1, 0)
    WHERE id = NEW.communication_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger: Auto-decrement unread on mark as read
CREATE TRIGGER trigger_mark_message_as_read
AFTER UPDATE OF is_read ON public.communication_messages
FOR EACH ROW
WHEN (OLD.is_read IS DISTINCT FROM NEW.is_read)
EXECUTE FUNCTION public.mark_message_as_read();

-- Function: Create alerts for stale communications
CREATE OR REPLACE FUNCTION public.create_communication_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_count INTEGER := 0;
  v_comm RECORD;
BEGIN
  -- Alert: No response in 3 days (financial/legal)
  FOR v_comm IN
    SELECT * FROM public.brand_communications
    WHERE status IN ('open', 'waiting_response')
    AND category IN ('financial', 'legal')
    AND last_message_by != 'brand'
    AND last_message_at < NOW() - INTERVAL '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.communication_alerts
      WHERE communication_id = brand_communications.id
      AND alert_type = 'no_response_3_days'
      AND status IN ('pending', 'sent')
    )
  LOOP
    INSERT INTO public.communication_alerts (
      communication_id,
      account_id,
      alert_type,
      title,
      message,
      severity
    ) VALUES (
      v_comm.id,
      v_comm.account_id,
      'no_response_3_days',
      'אין תגובה מהמותג כבר 3 ימים',
      format('השיחה "%s" עם %s ממתינה לתגובה 3 ימים', v_comm.subject, v_comm.brand_name),
      'medium'
    );
    v_alert_count := v_alert_count + 1;
  END LOOP;
  
  -- Alert: No response in 7 days (escalate)
  FOR v_comm IN
    SELECT * FROM public.brand_communications
    WHERE status IN ('open', 'waiting_response')
    AND last_message_by != 'brand'
    AND last_message_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.communication_alerts
      WHERE communication_id = brand_communications.id
      AND alert_type = 'no_response_7_days'
      AND status IN ('pending', 'sent')
    )
  LOOP
    INSERT INTO public.communication_alerts (
      communication_id,
      account_id,
      alert_type,
      title,
      message,
      severity
    ) VALUES (
      v_comm.id,
      v_comm.account_id,
      'no_response_7_days',
      '⚠️ אין תגובה מהמותג כבר שבוע!',
      format('השיחה "%s" עם %s ממתינה לתגובה שבוע שלם - מומלץ לעקוב', v_comm.subject, v_comm.brand_name),
      'high'
    );
    v_alert_count := v_alert_count + 1;
  END LOOP;
  
  -- Alert: Payment overdue
  FOR v_comm IN
    SELECT * FROM public.brand_communications
    WHERE category = 'financial'
    AND status = 'waiting_payment'
    AND due_date < NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.communication_alerts
      WHERE communication_id = brand_communications.id
      AND alert_type = 'payment_overdue'
      AND status IN ('pending', 'sent')
    )
  LOOP
    INSERT INTO public.communication_alerts (
      communication_id,
      account_id,
      alert_type,
      title,
      message,
      severity
    ) VALUES (
      v_comm.id,
      v_comm.account_id,
      'payment_overdue',
      '💰 תשלום באיחור!',
      format('תשלום מ-%s באיחור של %s ימים', v_comm.brand_name, EXTRACT(DAY FROM NOW() - v_comm.due_date)),
      'critical'
    );
    v_alert_count := v_alert_count + 1;
  END LOOP;
  
  -- Alert: Contract not signed (legal)
  FOR v_comm IN
    SELECT * FROM public.brand_communications
    WHERE category = 'legal'
    AND status = 'waiting_response'
    AND subject ILIKE '%חוזה%' OR subject ILIKE '%contract%'
    AND created_at < NOW() - INTERVAL '5 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.communication_alerts
      WHERE communication_id = brand_communications.id
      AND alert_type = 'contract_not_signed'
      AND status IN ('pending', 'sent')
    )
  LOOP
    INSERT INTO public.communication_alerts (
      communication_id,
      account_id,
      alert_type,
      title,
      message,
      severity
    ) VALUES (
      v_comm.id,
      v_comm.account_id,
      'contract_not_signed',
      '⚖️ חוזה טרם נחתם',
      format('החוזה עם %s ממתין לחתימה כבר 5 ימים', v_comm.brand_name),
      'high'
    );
    v_alert_count := v_alert_count + 1;
  END LOOP;
  
  RETURN v_alert_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_communication_alerts TO authenticated;

-- ==================================================
-- Default Data
-- ==================================================

-- Communication templates (optional - can be used for quick replies)
CREATE TABLE IF NOT EXISTS public.communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('financial', 'legal', 'issues', 'general')),
  template_text TEXT NOT NULL,
  
  is_shared BOOLEAN DEFAULT false, -- Shared across all users
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their templates"
ON public.communication_templates
FOR SELECT
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
  OR is_shared = true
);

-- Insert default templates
INSERT INTO public.communication_templates (name, category, template_text, is_shared) VALUES
('בקשת עדכון תשלום', 'financial', 'שלום,

אשמח לקבל עדכון לגבי סטטוס התשלום עבור שת"פ [שם השת"פ].

לפי ההסכם, התשלום היה אמור להתקבל בתאריך [תאריך].

תודה,
[שם]', true),

('תזכורת לחתימה על חוזה', 'legal', 'שלום,

שלחתי אליכם את החוזה המעודכן לפני [מספר] ימים.

אשמח לקבל אישור או הערות בהקדם כדי שנוכל להתקדם.

תודה,
[שם]', true),

('דיווח על בעיה טכנית', 'issues', 'שלום,

רציתי לעדכן שיש בעיה עם [תיאור הבעיה].

זה משפיע על [השפעה].

אשמח לקבל תגובה מהרגע שאפשר.

תודה,
[שם]', true),

('בקשת פגישת סטטוס', 'general', 'שלום,

נשמח לקבוע פגישה קצרה לעדכן על התקדמות השת"פ.

האם מתאים לכם [תאריך ושעה]?

תודה,
[שם]', true);

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Brand Communications Hub tables created!';
  RAISE NOTICE '✅ 3 main tables: brand_communications, communication_messages, communication_alerts';
  RAISE NOTICE '✅ RLS policies configured';
  RAISE NOTICE '✅ Helper functions and triggers created';
  RAISE NOTICE '✅ 4 default templates inserted';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '1. Create API endpoints for CRUD operations';
  RAISE NOTICE '2. Build frontend Hub UI';
  RAISE NOTICE '3. Integrate with Notification Engine';
END$$;
