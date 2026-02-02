-- Migration 025: Add metadata column to chatbot_persona
-- הוספת עמודה לאחסון מוצרים, קופונים ומותגים שGemini מזהה

ALTER TABLE chatbot_persona 
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- הוספת comment להבהרה
COMMENT ON COLUMN chatbot_persona.metadata IS 'Commerce data extracted by Gemini: products, coupons, brands';

-- יצירת index לחיפוש מהיר
CREATE INDEX IF NOT EXISTS idx_chatbot_persona_metadata ON chatbot_persona USING gin(metadata);
