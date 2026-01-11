-- ============================================
-- Migration 006: Influencer OS Tables
-- ============================================
-- 
-- This migration adds tables for the Influencer Management OS:
-- 1. Partnerships (שת"פים)
-- 2. Tasks (משימות)
-- 3. Contracts (חוזים)
-- 4. Invoices (חשבוניות)
-- 5. Calendar Events (לו"ז)
-- 6. Notifications (התראות)
-- 
-- All tables include RLS policies for multi-tenant isolation

-- ============================================
-- 1. Partnerships (שת"פים)
-- ============================================

CREATE TABLE IF NOT EXISTS partnerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  
  -- Brand information
  brand_name VARCHAR(255) NOT NULL,
  brand_contact_name VARCHAR(255),
  brand_contact_email VARCHAR(255),
  brand_contact_phone VARCHAR(50),
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'lead' CHECK (status IN (
    'lead',          -- Initial contact
    'proposal',      -- Proposal sent
    'negotiation',   -- In negotiation
    'contract',      -- Contract stage
    'active',        -- Active partnership
    'completed',     -- Completed successfully
    'cancelled'      -- Cancelled
  )),
  
  -- Financial details
  proposal_amount DECIMAL(10,2),
  contract_amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'ILS',
  
  -- Partnership details
  brief TEXT,
  deliverables JSONB DEFAULT '[]'::jsonb,
  
  -- Dates
  proposal_date DATE,
  contract_signed_date DATE,
  start_date DATE,
  end_date DATE,
  
  -- Metadata
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partnerships_account ON partnerships(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partnerships_status ON partnerships(account_id, status);
CREATE INDEX IF NOT EXISTS idx_partnerships_dates ON partnerships(account_id, start_date, end_date);

-- RLS Policies
ALTER TABLE partnerships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own partnerships"
  ON partnerships FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own partnerships"
  ON partnerships FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own partnerships"
  ON partnerships FOR UPDATE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own partnerships"
  ON partnerships FOR DELETE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

-- ============================================
-- 2. Tasks (משימות)
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  partnership_id UUID REFERENCES partnerships(id) ON DELETE CASCADE,
  
  -- Task details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Task type
  type VARCHAR(50) NOT NULL DEFAULT 'general' CHECK (type IN (
    'general',
    'content_creation',
    'market_research',
    'coupon_check',
    'media_ads',
    'email_marketing',
    'ai_video',
    'ugc',
    'cro',
    'contract_review',
    'invoice_creation',
    'meeting'
  )),
  
  -- Status and priority
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'cancelled',
    'blocked'
  )),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'low',
    'medium',
    'high',
    'urgent'
  )),
  
  -- Assignment
  assignee VARCHAR(100),
  
  -- Timing
  due_date TIMESTAMPTZ,
  estimated_hours DECIMAL(5,2),
  actual_hours DECIMAL(5,2),
  completed_at TIMESTAMPTZ,
  
  -- Subtasks
  checklist JSONB DEFAULT '[]'::jsonb,
  
  -- Attachments
  attachments JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_account ON tasks(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_partnership ON tasks(partnership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(account_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(account_id, due_date) WHERE status != 'completed';

-- RLS Policies
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tasks"
  ON tasks FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own tasks"
  ON tasks FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own tasks"
  ON tasks FOR UPDATE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own tasks"
  ON tasks FOR DELETE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

-- ============================================
-- 3. Contracts (חוזים)
-- ============================================

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  
  -- Contract details
  contract_type VARCHAR(50) NOT NULL DEFAULT 'standard' CHECK (contract_type IN (
    'standard',
    'nda',
    'exclusivity',
    'licensing',
    'ambassador'
  )),
  
  -- File storage
  contract_url VARCHAR(500),
  contract_filename VARCHAR(255),
  
  -- Contract terms
  terms JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'sent',
    'signed',
    'cancelled',
    'expired'
  )),
  
  -- Dates
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Signatures
  influencer_signed BOOLEAN DEFAULT FALSE,
  brand_signed BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contracts_partnership ON contracts(partnership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(partnership_id, status);

-- RLS Policies
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contracts"
  ON contracts FOR SELECT
  USING (
    partnership_id IN (
      SELECT id FROM partnerships WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert their own contracts"
  ON contracts FOR INSERT
  WITH CHECK (
    partnership_id IN (
      SELECT id FROM partnerships WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their own contracts"
  ON contracts FOR UPDATE
  USING (
    partnership_id IN (
      SELECT id FROM partnerships WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete their own contracts"
  ON contracts FOR DELETE
  USING (
    partnership_id IN (
      SELECT id FROM partnerships WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

-- ============================================
-- 4. Invoices (חשבוניות)
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  
  -- Invoice identification
  invoice_number VARCHAR(50) UNIQUE,
  
  -- Financial details
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'ILS',
  vat_rate DECIMAL(5,2) DEFAULT 17.00,
  vat_amount DECIMAL(10,2),
  total_amount DECIMAL(10,2) NOT NULL,
  
  -- Line items
  line_items JSONB DEFAULT '[]'::jsonb,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'sent',
    'paid',
    'overdue',
    'cancelled',
    'refunded'
  )),
  
  -- Dates
  issued_at DATE,
  due_date DATE,
  paid_at DATE,
  
  -- Payment details
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  
  -- File storage
  pdf_url VARCHAR(500),
  pdf_filename VARCHAR(255),
  
  -- Metadata
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_partnership ON invoices(partnership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(partnership_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(partnership_id, due_date) WHERE status IN ('sent', 'overdue');
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

-- RLS Policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoices"
  ON invoices FOR SELECT
  USING (
    partnership_id IN (
      SELECT id FROM partnerships WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert their own invoices"
  ON invoices FOR INSERT
  WITH CHECK (
    partnership_id IN (
      SELECT id FROM partnerships WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their own invoices"
  ON invoices FOR UPDATE
  USING (
    partnership_id IN (
      SELECT id FROM partnerships WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete their own invoices"
  ON invoices FOR DELETE
  USING (
    partnership_id IN (
      SELECT id FROM partnerships WHERE account_id IN (
        SELECT id FROM accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

-- ============================================
-- 5. Calendar Events (לו"ז)
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  partnership_id UUID REFERENCES partnerships(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  
  -- Event details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Event type
  event_type VARCHAR(50) NOT NULL DEFAULT 'general' CHECK (event_type IN (
    'general',
    'meeting',
    'deadline',
    'content_publish',
    'reminder',
    'call',
    'review',
    'follow_up'
  )),
  
  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  timezone VARCHAR(50) DEFAULT 'Asia/Jerusalem',
  
  -- Location
  location VARCHAR(255),
  meeting_link VARCHAR(500),
  
  -- Attendees
  attendees JSONB DEFAULT '[]'::jsonb,
  
  -- Reminders
  reminders JSONB DEFAULT '[]'::jsonb,
  
  -- Integration
  google_calendar_id VARCHAR(255),
  google_calendar_sync BOOLEAN DEFAULT FALSE,
  
  -- Recurrence
  recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'completed',
    'cancelled',
    'rescheduled'
  )),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calendar_account ON calendar_events(account_id, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_partnership ON calendar_events(partnership_id, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_task ON calendar_events(task_id);
CREATE INDEX IF NOT EXISTS idx_calendar_dates ON calendar_events(account_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_calendar_google ON calendar_events(google_calendar_id) WHERE google_calendar_id IS NOT NULL;

-- RLS Policies
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calendar events"
  ON calendar_events FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own calendar events"
  ON calendar_events FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own calendar events"
  ON calendar_events FOR UPDATE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own calendar events"
  ON calendar_events FOR DELETE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

-- ============================================
-- 6. Notifications (התראות)
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  
  -- Notification type
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'task_due',
    'task_overdue',
    'invoice_due',
    'invoice_overdue',
    'contract_expiring',
    'partnership_update',
    'payment_received',
    'meeting_reminder',
    'daily_digest',
    'system'
  )),
  
  -- Content
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Links
  link VARCHAR(500),
  entity_type VARCHAR(50),
  entity_id UUID,
  
  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Priority
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN (
    'low',
    'normal',
    'high',
    'urgent'
  )),
  
  -- Delivery
  delivered_via JSONB DEFAULT '[]'::jsonb, -- ['app', 'email', 'whatsapp']
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(account_id, read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(account_id, type, created_at DESC);

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (TRUE);

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_partnerships_updated_at BEFORE UPDATE ON partnerships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get upcoming tasks for an account
CREATE OR REPLACE FUNCTION get_upcoming_tasks(p_account_id UUID, p_days INT DEFAULT 7)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  due_date TIMESTAMPTZ,
  priority VARCHAR,
  partnership_name VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.title,
    t.due_date,
    t.priority,
    p.brand_name as partnership_name
  FROM tasks t
  LEFT JOIN partnerships p ON t.partnership_id = p.id
  WHERE t.account_id = p_account_id
    AND t.status != 'completed'
    AND t.due_date IS NOT NULL
    AND t.due_date <= NOW() + (p_days || ' days')::INTERVAL
  ORDER BY t.due_date ASC, t.priority DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get overdue invoices for an account
CREATE OR REPLACE FUNCTION get_overdue_invoices(p_account_id UUID)
RETURNS TABLE (
  id UUID,
  invoice_number VARCHAR,
  amount DECIMAL,
  due_date DATE,
  days_overdue INT,
  partnership_name VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.invoice_number,
    i.total_amount as amount,
    i.due_date,
    (CURRENT_DATE - i.due_date)::INT as days_overdue,
    p.brand_name as partnership_name
  FROM invoices i
  JOIN partnerships p ON i.partnership_id = p.id
  WHERE p.account_id = p_account_id
    AND i.status IN ('sent', 'overdue')
    AND i.due_date < CURRENT_DATE
  ORDER BY i.due_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE partnerships IS 'Influencer partnerships with brands';
COMMENT ON TABLE tasks IS 'Tasks and to-dos for partnerships';
COMMENT ON TABLE contracts IS 'Contracts and agreements';
COMMENT ON TABLE invoices IS 'Invoices and billing';
COMMENT ON TABLE calendar_events IS 'Calendar events and scheduling';
COMMENT ON TABLE notifications IS 'System notifications and reminders';

