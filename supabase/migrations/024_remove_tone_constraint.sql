-- Migration 024: Remove tone constraint
-- הסרת constraint על tone כדי לאפשר פלט חופשי מGemini

-- הסרת constraint הישן
ALTER TABLE chatbot_persona 
  DROP CONSTRAINT IF EXISTS chatbot_persona_tone_check;

-- עדכון comment להבהרה
COMMENT ON COLUMN chatbot_persona.tone IS 'Free-text tone description from Gemini (no constraints)';
