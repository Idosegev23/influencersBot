-- ============================================
-- Respond.io Integration — Database Migrations
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Channel-to-Account mapping table
-- Maps Respond.io channels to InfluencerBot accounts
CREATE TABLE IF NOT EXISTS respondio_channel_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  respondio_channel_id INTEGER NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'instagram',    -- instagram, whatsapp, facebook, etc.
  channel_name TEXT,                                  -- Display name
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each Respond.io channel maps to exactly one account
  UNIQUE(respondio_channel_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_respondio_channel_account
  ON respondio_channel_mappings(respondio_channel_id, is_active);

-- RLS policy — only admins and the account owner can see mappings
ALTER TABLE respondio_channel_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to respondio mappings"
  ON respondio_channel_mappings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = respondio_channel_mappings.account_id
      AND accounts.role = 'admin'
    )
  );

CREATE POLICY "Account owner can view own mappings"
  ON respondio_channel_mappings
  FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE id = auth.uid()
    )
  );

-- 2. DM Activity log — tracks all DM interactions for analytics
CREATE TABLE IF NOT EXISTS respondio_dm_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  respondio_contact_id INTEGER NOT NULL,
  respondio_channel_id INTEGER,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_text TEXT,
  response_text TEXT,
  processing_time_ms INTEGER,
  bot_archetype TEXT,                                 -- From SandwichBot metadata
  bot_confidence FLOAT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_dm_log_account
  ON respondio_dm_log(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_log_contact
  ON respondio_dm_log(respondio_contact_id, created_at DESC);

-- RLS
ALTER TABLE respondio_dm_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owner can view own DM logs"
  ON respondio_dm_log
  FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE id = auth.uid()
    )
  );

-- 3. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_respondio_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER respondio_mapping_updated
  BEFORE UPDATE ON respondio_channel_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_respondio_mapping_timestamp();

-- ============================================
-- DONE! Now configure in Respond.io:
-- 1. Set webhook URL to: https://your-domain.vercel.app/api/webhooks/respondio
-- 2. Subscribe to event: message.created (or inbound_message)
-- 3. Copy the webhook secret to RESPONDIO_WEBHOOK_SECRET env var
-- ============================================
