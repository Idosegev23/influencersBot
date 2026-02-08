-- ==================================================
-- Migration 029: Personality Wrapper Fields
-- ==================================================
-- תיאור: הוספת שדות לשכבת האישיות (Layer 1)
-- תאריך: 2026-02-03
-- ==================================================

-- ============================================
-- Add fields to chatbot_persona
-- ============================================

ALTER TABLE public.chatbot_persona 
ADD COLUMN IF NOT EXISTS narrative_perspective TEXT DEFAULT 'sidekick-professional' 
  CHECK (narrative_perspective IN ('sidekick-professional', 'sidekick-personal', 'direct')),

ADD COLUMN IF NOT EXISTS sass_level INTEGER DEFAULT 5 
  CHECK (sass_level >= 0 AND sass_level <= 10),

ADD COLUMN IF NOT EXISTS life_context_injection BOOLEAN DEFAULT true,

ADD COLUMN IF NOT EXISTS current_location TEXT,

ADD COLUMN IF NOT EXISTS current_activity TEXT,

ADD COLUMN IF NOT EXISTS storytelling_mode TEXT DEFAULT 'balanced'
  CHECK (storytelling_mode IN ('anecdotal', 'concise', 'balanced')),

ADD COLUMN IF NOT EXISTS slang_map JSONB DEFAULT '{
  "amazing": "מדהים",
  "love": "אוהבת",
  "recommend": "ממליצה",
  "favorite": "האהובה",
  "always": "תמיד"
}'::jsonb,

ADD COLUMN IF NOT EXISTS emoji_types TEXT[] DEFAULT ARRAY['✨', '💕', '🌟', '👌', '💪', '🔥']::TEXT[],

ADD COLUMN IF NOT EXISTS message_structure TEXT DEFAULT 'whatsapp'
  CHECK (message_structure IN ('whatsapp', 'formal', 'chat')),

ADD COLUMN IF NOT EXISTS common_phrases TEXT[] DEFAULT ARRAY[
  'בדיוק כמו שהיא תמיד אומרת',
  'זה הסוד שלה',
  'היא מקפידה על זה'
]::TEXT[],

ADD COLUMN IF NOT EXISTS signature_style TEXT;

-- ============================================
-- Comments
-- ============================================

COMMENT ON COLUMN public.chatbot_persona.narrative_perspective IS 'זווית הדיבור: sidekick-professional (היא/אנחנו), sidekick-personal (אנחנו), direct (אני)';
COMMENT ON COLUMN public.chatbot_persona.sass_level IS 'רמת עוקצנות/ציניות (0=פורמלי מאוד, 10=עוקצני מאוד)';
COMMENT ON COLUMN public.chatbot_persona.life_context_injection IS 'האם להזריק "עוגני מציאות" מהסטוריז ("היא עכשיו בפריז")';
COMMENT ON COLUMN public.chatbot_persona.storytelling_mode IS 'סגנון סיפור: anecdotal (סיפורי), concise (קצר), balanced (מאוזן)';
COMMENT ON COLUMN public.chatbot_persona.slang_map IS 'מילון מונחים למותג (JSON object)';
COMMENT ON COLUMN public.chatbot_persona.message_structure IS 'מבנה הודעה: whatsapp (פסקאות קצרות), formal (מובנה), chat (שיחתי)';
COMMENT ON COLUMN public.chatbot_persona.common_phrases IS 'ביטויים נפוצים של המשפיענית';
