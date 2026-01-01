-- Add phone number and WhatsApp settings to influencers table
ALTER TABLE influencers
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false;

-- Add index for phone lookup
CREATE INDEX IF NOT EXISTS idx_influencers_phone ON influencers(phone_number);

-- Comment for documentation
COMMENT ON COLUMN influencers.phone_number IS 'Influencer phone number for WhatsApp notifications (format: 0541234567)';
COMMENT ON COLUMN influencers.whatsapp_enabled IS 'Whether WhatsApp notifications are enabled for this influencer';






