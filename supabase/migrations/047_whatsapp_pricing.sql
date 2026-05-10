-- WhatsApp pricing capture per outbound message.
--
-- Meta sends a `pricing` object on every status event (sent / delivered):
--   { type: 'regular', billable: true, category: 'utility', pricing_model: 'PMP' }
--
-- We capture all four fields so the admin cost dashboard can break down
-- spend by category (marketing / utility / authentication / service) and
-- detect when Meta switches a message between PMP (per-message) and
-- CBP (conversation-based) pricing — the rate sheet differs.
--
-- The full pricing object is also persisted as jsonb for forward-compat
-- (Meta occasionally adds fields like volume_tier).

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS pricing_billable boolean,
  ADD COLUMN IF NOT EXISTS pricing_category text,
  ADD COLUMN IF NOT EXISTS pricing_model text,
  ADD COLUMN IF NOT EXISTS pricing_type text,
  ADD COLUMN IF NOT EXISTS pricing jsonb;

CREATE INDEX IF NOT EXISTS whatsapp_messages_pricing_category_idx
  ON whatsapp_messages(pricing_category)
  WHERE pricing_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_messages_template_pricing_idx
  ON whatsapp_messages(template_name, pricing_category)
  WHERE template_name IS NOT NULL;
