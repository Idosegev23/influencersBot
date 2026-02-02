-- Migration 021: Enhance Chatbot Persona Fields
-- הרחבת טבלת chatbot_persona עם שדות חדשים לפרסונה מתקדמת

-- ============================================
-- Add new JSONB fields for enhanced persona
-- ============================================

-- Voice rules - קול וסגנון מפורט
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS voice_rules JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chatbot_persona.voice_rules IS 'קול וסגנון: טון, מבנה תשובה, אורך, ביטויים חוזרים';

-- Knowledge map - מפת ידע מובנית
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS knowledge_map JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chatbot_persona.knowledge_map IS 'מפת ידע מובנית: נושאים מרכזיים, תתי נושאים, טענות, דוגמאות';

-- Boundaries - גבולות
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS boundaries JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chatbot_persona.boundaries IS 'גבולות: נושאים שנידונו/לא נידונו, שאלות לא נענו, אזורים של חוסר מידע';

-- Evolution - התפתחות לאורך זמן
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS evolution JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chatbot_persona.evolution IS 'התפתחות: שינויי טון, שינויי נושאים, הבדלים בין תקופות';

-- Response policy - מדיניות תשובה
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS response_policy JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chatbot_persona.response_policy IS 'מדיניות תשובה: מתי לענות בביטחון/זהירות/סירוב';

-- Preprocessing data - נתונים מעובדים
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS preprocessing_data JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chatbot_persona.preprocessing_data IS 'נתונים מעובדים: סטטיסטיקות, top terms, topics, timeline, FAQ candidates';

-- Gemini raw output - פלט גולמי מ-Gemini
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS gemini_raw_output JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chatbot_persona.gemini_raw_output IS 'פלט גולמי מלא מ-Gemini Pro לשימוש debug';

-- Last full scrape timestamp
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS last_full_scrape_at TIMESTAMPTZ;

COMMENT ON COLUMN chatbot_persona.last_full_scrape_at IS 'מתי בוצעה סריקה מלאה אחרונה (500 posts + כל ה-actors)';

-- Scrape statistics
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS scrape_stats JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chatbot_persona.scrape_stats IS 'סטטיסטיקות סריקה: כמה posts, comments, hashtags נסרקו';

-- Instagram last synced (for daily updates)
ALTER TABLE chatbot_persona 
ADD COLUMN IF NOT EXISTS instagram_last_synced TIMESTAMPTZ;

COMMENT ON COLUMN chatbot_persona.instagram_last_synced IS 'מתי בוצע עדכון יומי אחרון (רק פוסטים חדשים)';

-- ============================================
-- Add indexes for better query performance
-- ============================================

-- Index for finding personas that need daily update
CREATE INDEX IF NOT EXISTS idx_chatbot_persona_last_synced 
ON chatbot_persona(instagram_last_synced) 
WHERE instagram_last_synced IS NOT NULL;

-- Index for finding stale personas (haven't been scraped in a while)
CREATE INDEX IF NOT EXISTS idx_chatbot_persona_last_scrape 
ON chatbot_persona(last_full_scrape_at) 
WHERE last_full_scrape_at IS NOT NULL;

-- ============================================
-- Example data structure (commented out - for reference)
-- ============================================

/*
Example voice_rules structure:
{
  "tone": "ידידותי, מקצועי, חם",
  "responseStructure": "מתחיל בברכה, עונה ישירות, מסיים בהמלצה",
  "avgLength": "2-3 משפטים",
  "firstPerson": true,
  "recurringPhrases": ["אני ממליצה", "מהניסיון שלי", "זה תלוי ב..."],
  "avoidedWords": ["בטוח", "תמיד", "אף פעם"]
}

Example knowledge_map structure:
{
  "coreTopics": [
    {
      "name": "טיפוח עור",
      "subtopics": ["ניקוי", "לחות", "הגנה"],
      "keyPoints": ["SPF חובה", "ניקוי כפול בערב"],
      "examples": ["אני משתמשת ב-Cerave..."]
    }
  ]
}

Example boundaries structure:
{
  "discussed": ["מסקרה", "איפור עיניים", "טיפוח עור"],
  "notDiscussed": ["ניתוחים פלסטיים", "תרופות מרשם"],
  "unansweredQuestions": ["איזה קרם אנטי אייג'ינג הכי טוב?"],
  "uncertainAreas": ["מוצרים לעור רגיש מאוד"]
}

Example response_policy structure:
{
  "highConfidence": ["מוצרים שהמשפיען התייחס אליהם ב-3+ פוסטים"],
  "cautious": ["נושאים שהוזכרו פעם אחת בלבד"],
  "refuse": ["שאלות רפואיות", "נושאים שלא נידונו כלל"]
}

Example preprocessing_data structure:
{
  "stats": {
    "totalPosts": 487,
    "timeRange": {"start": "2024-01-01", "end": "2026-02-01"},
    "avgEngagement": 4.5
  },
  "topTerms": ["מסקרה", "איפור", "טיפוח", ...],
  "topics": [
    {"name": "איפור עיניים", "posts": 120, "frequency": 0.25}
  ],
  "faqCandidates": [
    {"question": "איזו מסקרה את ממליצה?", "askedCount": 45}
  ]
}

Example scrape_stats structure:
{
  "postsScraped": 487,
  "commentsScraped": 7234,
  "hashtagsTracked": 18,
  "topicsIdentified": 12,
  "scrapeDuration": 1850,
  "actorResults": {
    "posts": {"count": 487, "duration": 580},
    "comments": {"count": 7234, "duration": 620},
    "profile": {"duration": 45},
    "hashtags": {"count": 18, "duration": 180},
    "search": {"duration": 120}
  }
}
*/

-- ============================================
-- Helper function to check if persona is stale
-- ============================================

CREATE OR REPLACE FUNCTION is_persona_stale(p_account_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_scrape TIMESTAMPTZ;
  v_stale_threshold INTERVAL := '7 days';
BEGIN
  SELECT last_full_scrape_at INTO v_last_scrape
  FROM chatbot_persona
  WHERE account_id = p_account_id;
  
  IF v_last_scrape IS NULL THEN
    RETURN TRUE; -- Never scraped
  END IF;
  
  RETURN (NOW() - v_last_scrape) > v_stale_threshold;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_persona_stale IS 'בודק האם פרסונה זקוקה לעדכון (לא נסרקה ב-7 ימים)';

-- ============================================
-- Helper function to check if needs daily update
-- ============================================

CREATE OR REPLACE FUNCTION needs_daily_update(p_account_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_synced TIMESTAMPTZ;
BEGIN
  SELECT instagram_last_synced INTO v_last_synced
  FROM chatbot_persona
  WHERE account_id = p_account_id;
  
  IF v_last_synced IS NULL THEN
    RETURN TRUE; -- Never synced
  END IF;
  
  -- Check if more than 24 hours passed
  RETURN (NOW() - v_last_synced) > INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION needs_daily_update IS 'בודק האם פרסונה זקוקה לעדכון יומי (עבר יותר מ-24 שעות)';
