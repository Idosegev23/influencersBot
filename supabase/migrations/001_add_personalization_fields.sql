-- Migration: Add personalization and white label fields to influencers table
-- Run this migration in your Supabase SQL editor

-- Add personalization fields
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS greeting_message TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS suggested_questions JSONB DEFAULT '[]';

-- Add white label fields
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS hide_branding BOOLEAN DEFAULT false;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS custom_logo_url TEXT;

-- Add comments
COMMENT ON COLUMN influencers.greeting_message IS 'Custom greeting message for chat, AI-generated during onboarding';
COMMENT ON COLUMN influencers.suggested_questions IS 'Array of suggested questions for chat UI, AI-generated during onboarding';
COMMENT ON COLUMN influencers.hide_branding IS 'White label: hide "Powered by InfluencerBot" branding';
COMMENT ON COLUMN influencers.custom_logo_url IS 'White label: custom logo URL';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_influencers_username ON influencers(username);
CREATE INDEX IF NOT EXISTS idx_influencers_subdomain ON influencers(subdomain);






