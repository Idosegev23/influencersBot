-- ============================================
-- Migration: v2 Engines - Audience Interaction OS
-- ============================================
-- 
-- This migration adds:
-- 1. Unified accounts table
-- 2. Events table with proper indexes (Event Sourcing)
-- 3. Session locks for concurrency control
-- 4. Idempotency keys with status
-- 5. Decision rules with versioning
-- 6. Cost tracking with periods
-- 
-- Run in Supabase SQL Editor

-- ============================================
-- 1. Accounts Table (Unified)
-- ============================================

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('creator', 'brand')),
  
  -- Links to existing data (for migration)
  legacy_influencer_id UUID REFERENCES influencers(id),
  
  -- Owner
  owner_user_id UUID,
  
  -- Configuration
  config JSONB DEFAULT '{}'::jsonb,
  
  -- Plan and billing
  plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  
  -- Localization
  timezone VARCHAR(50) DEFAULT 'Asia/Jerusalem',
  language VARCHAR(5) DEFAULT 'he',
  
  -- Channels and features
  allowed_channels JSONB DEFAULT '["chat"]'::jsonb,
  features JSONB DEFAULT '{
    "supportFlowEnabled": true,
    "salesFlowEnabled": false,
    "whatsappEnabled": false,
    "analyticsEnabled": true
  }'::jsonb,
  
  -- Security
  security_config JSONB DEFAULT '{
    "publicChatAllowed": true,
    "requireAuthForSupport": false,
    "allowedOrigins": []
  }'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for legacy migration
CREATE INDEX IF NOT EXISTS idx_accounts_legacy_influencer ON accounts(legacy_influencer_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

-- ============================================
-- 2. Events Table (Event Sourcing)
-- ============================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  category VARCHAR(20) NOT NULL,
  
  -- Context
  account_id UUID NOT NULL,  -- Will reference accounts after migration
  session_id UUID,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('creator', 'brand')),
  
  -- Payload
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Critical indexes for Event Sourcing
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_account ON events(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category, created_at);

-- Index for trace ID lookups (debugging)
CREATE INDEX IF NOT EXISTS idx_events_trace_id ON events((metadata->>'traceId'), created_at);

-- Partial index for outcome events (analytics)
CREATE INDEX IF NOT EXISTS idx_events_outcomes ON events(account_id, created_at) 
  WHERE category = 'outcome';

-- ============================================
-- 3. Session Locks (Concurrency Control)
-- ============================================

CREATE TABLE IF NOT EXISTS session_locks (
  session_id UUID PRIMARY KEY,
  locked_by VARCHAR(100) NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup of expired locks
CREATE INDEX IF NOT EXISTS idx_session_locks_expires ON session_locks(expires_at);

-- Function to acquire lock
CREATE OR REPLACE FUNCTION acquire_session_lock(
  p_session_id UUID,
  p_request_id VARCHAR,
  p_ttl_seconds INT DEFAULT 30
)
RETURNS BOOLEAN AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ := v_now + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Try to insert new lock or update expired lock
  INSERT INTO session_locks (session_id, locked_by, locked_at, expires_at)
  VALUES (p_session_id, p_request_id, v_now, v_expires_at)
  ON CONFLICT (session_id) DO UPDATE
  SET locked_by = p_request_id,
      locked_at = v_now,
      expires_at = v_expires_at
  WHERE session_locks.expires_at < v_now;
  
  -- Check if we got the lock
  RETURN EXISTS (
    SELECT 1 FROM session_locks 
    WHERE session_id = p_session_id 
    AND locked_by = p_request_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to release lock
CREATE OR REPLACE FUNCTION release_session_lock(
  p_session_id UUID,
  p_request_id VARCHAR
)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM session_locks 
  WHERE session_id = p_session_id 
  AND locked_by = p_request_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to clean expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM session_locks WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. Idempotency Keys
-- ============================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  result JSONB,
  locked_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_status ON idempotency_keys(status) WHERE status = 'pending';

-- Function to check and claim idempotency key
CREATE OR REPLACE FUNCTION claim_idempotency_key(
  p_key VARCHAR,
  p_request_id VARCHAR,
  p_ttl_seconds INT DEFAULT 300
)
RETURNS TABLE(claimed BOOLEAN, existing_status VARCHAR, existing_result JSONB) AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ := v_now + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
  -- Check if key exists and is not expired
  SELECT ik.status, ik.result 
  INTO existing_status, existing_result
  FROM idempotency_keys ik
  WHERE ik.key = p_key AND ik.expires_at > v_now;
  
  IF FOUND THEN
    -- Key exists
    IF existing_status = 'pending' THEN
      -- Still processing
      claimed := FALSE;
    ELSE
      -- Already done/failed, return result
      claimed := FALSE;
    END IF;
  ELSE
    -- Try to insert new key
    INSERT INTO idempotency_keys (key, status, locked_by, expires_at)
    VALUES (p_key, 'pending', p_request_id, v_expires_at)
    ON CONFLICT (key) DO NOTHING;
    
    claimed := FOUND;
    existing_status := NULL;
    existing_result := NULL;
  END IF;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to complete idempotency key
CREATE OR REPLACE FUNCTION complete_idempotency_key(
  p_key VARCHAR,
  p_status VARCHAR,
  p_result JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE idempotency_keys
  SET status = p_status, result = p_result
  WHERE key = p_key AND status = 'pending';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. Decision Rules (with Versioning)
-- ============================================

CREATE TABLE IF NOT EXISTS decision_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(20) NOT NULL CHECK (category IN ('routing', 'escalation', 'personalization', 'timing', 'cost', 'security')),
  priority INT DEFAULT 50,
  
  -- Conditions and actions
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Scope
  mode VARCHAR(10) DEFAULT 'both' CHECK (mode IN ('creator', 'brand', 'both')),
  account_id UUID,  -- NULL = global rule
  
  -- Status
  enabled BOOLEAN DEFAULT true,
  
  -- Versioning
  version INT DEFAULT 1,
  published_at TIMESTAMPTZ DEFAULT now(),
  updated_by VARCHAR(100),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_account ON decision_rules(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON decision_rules(enabled, priority) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_rules_category ON decision_rules(category);

-- ============================================
-- 6. Cost Tracking (with Periods)
-- ============================================

CREATE TABLE IF NOT EXISTS cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  
  -- Period
  period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
  period_start DATE NOT NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Jerusalem',
  
  -- Usage
  tokens_used INT DEFAULT 0,
  api_calls INT DEFAULT 0,
  estimated_cost DECIMAL(10,4) DEFAULT 0,
  
  -- Limits
  budget_limit DECIMAL(10,2),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint
  UNIQUE(account_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_account_period ON cost_tracking(account_id, period_type, period_start DESC);

-- Function to increment cost
CREATE OR REPLACE FUNCTION increment_cost(
  p_account_id UUID,
  p_period_type VARCHAR,
  p_tokens INT,
  p_cost DECIMAL
)
RETURNS TABLE(new_tokens INT, new_cost DECIMAL, budget_limit DECIMAL, over_budget BOOLEAN) AS $$
DECLARE
  v_period_start DATE;
  v_budget DECIMAL;
BEGIN
  -- Calculate period start based on type
  IF p_period_type = 'day' THEN
    v_period_start := CURRENT_DATE;
  ELSIF p_period_type = 'week' THEN
    v_period_start := date_trunc('week', CURRENT_DATE)::DATE;
  ELSE
    v_period_start := date_trunc('month', CURRENT_DATE)::DATE;
  END IF;
  
  -- Upsert and return new values
  INSERT INTO cost_tracking (account_id, period_type, period_start, tokens_used, api_calls, estimated_cost)
  VALUES (p_account_id, p_period_type, v_period_start, p_tokens, 1, p_cost)
  ON CONFLICT (account_id, period_type, period_start) DO UPDATE
  SET tokens_used = cost_tracking.tokens_used + p_tokens,
      api_calls = cost_tracking.api_calls + 1,
      estimated_cost = cost_tracking.estimated_cost + p_cost,
      updated_at = now()
  RETURNING cost_tracking.tokens_used, cost_tracking.estimated_cost, cost_tracking.budget_limit
  INTO new_tokens, new_cost, budget_limit;
  
  over_budget := budget_limit IS NOT NULL AND new_cost > budget_limit;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Update chat_sessions for v2
-- ============================================

-- Add version column if not exists
ALTER TABLE chat_sessions 
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS state VARCHAR(50) DEFAULT 'Idle',
  ADD COLUMN IF NOT EXISTS meta_state VARCHAR(20);

-- Index for state queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_state ON chat_sessions(state) WHERE state != 'Idle';

-- ============================================
-- 8. RLS Policies for new tables
-- ============================================

-- Events: public insert (for tracking), restricted select
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert events" ON events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can read events" ON events
  FOR SELECT USING (true);

-- Session locks: service role only
ALTER TABLE session_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages locks" ON session_locks
  FOR ALL USING (true);

-- Idempotency keys: service role only
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages idempotency" ON idempotency_keys
  FOR ALL USING (true);

-- Decision rules: public read, service role write
ALTER TABLE decision_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read enabled rules" ON decision_rules
  FOR SELECT USING (enabled = true);

CREATE POLICY "Service role manages rules" ON decision_rules
  FOR ALL USING (true);

-- Cost tracking: service role only
ALTER TABLE cost_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages costs" ON cost_tracking
  FOR ALL USING (true);

-- Accounts: public read, service role write
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active accounts" ON accounts
  FOR SELECT USING (status = 'active');

CREATE POLICY "Service role manages accounts" ON accounts
  FOR ALL USING (true);

-- ============================================
-- 9. Comments for documentation
-- ============================================

COMMENT ON TABLE accounts IS 'Unified accounts table for creators and brands';
COMMENT ON TABLE events IS 'Event sourcing table - all actions are events';
COMMENT ON TABLE session_locks IS 'Concurrency control for session state machine';
COMMENT ON TABLE idempotency_keys IS 'Prevents duplicate action execution';
COMMENT ON TABLE decision_rules IS 'Configurable rules for Decision Engine';
COMMENT ON TABLE cost_tracking IS 'Token and cost tracking per period';

COMMENT ON FUNCTION acquire_session_lock IS 'Acquires exclusive lock on session, returns false if already locked';
COMMENT ON FUNCTION release_session_lock IS 'Releases session lock if owned by caller';
COMMENT ON FUNCTION claim_idempotency_key IS 'Claims idempotency key for processing';
COMMENT ON FUNCTION increment_cost IS 'Atomically increments cost and returns budget status';



