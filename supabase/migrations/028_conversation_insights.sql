-- ==================================================
-- Migration 028: Conversation Insights & Learning
-- ==================================================
-- תיאור: מערכת למידה מהשיחות - תובנות לשיפור הבוט
-- תאריך: 2026-02-03
-- ==================================================

-- ============================================
-- 1. conversation_insights - תובנות מהשיחות
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversation_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Insight Type
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'faq',              -- שאלה נפוצה והתשובה
    'topic_interest',   -- נושא שמעניין את הקהל
    'pain_point',       -- בעיה שהקהל מתמודד איתה
    'feedback',         -- פידבק על המשפיען/מוצר
    'objection',        -- התנגדות נפוצה
    'successful_pitch', -- פיץ' שעבד טוב
    'language_pattern', -- דפוס שפה של הקהל
    'sentiment',        -- רגש נפוץ
    'product_inquiry',  -- שאלות על מוצרים
    'coupon_request'    -- בקשות לקופונים
  )),
  
  -- Insight Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  examples JSONB DEFAULT '[]'::jsonb, -- מערך של דוגמאות מהשיחות
  
  -- Metadata
  occurrence_count INTEGER DEFAULT 1, -- כמה פעמים זה קרה
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  source_conversations UUID[] DEFAULT ARRAY[]::UUID[], -- IDs של שיחות מקור
  
  -- Tags & Categories
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  archetype TEXT, -- איזה ארכיטיפ רלוונטי (skincare, fashion, etc.)
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE, -- האם התובנה עדיין רלוונטית
  reviewed_by_influencer BOOLEAN DEFAULT FALSE,
  
  -- Action Items
  suggested_response TEXT, -- תגובה מוצעת לשאלה
  suggested_kb_entry BOOLEAN DEFAULT FALSE, -- האם להוסיף ל-KB
  
  -- Timing
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. conversation_analysis_runs - ריצות ניתוח
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversation_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Analysis Scope
  analyzed_from TIMESTAMPTZ NOT NULL,
  analyzed_to TIMESTAMPTZ NOT NULL,
  conversations_analyzed INTEGER DEFAULT 0,
  messages_analyzed INTEGER DEFAULT 0,
  
  -- Results
  insights_created INTEGER DEFAULT 0,
  insights_updated INTEGER DEFAULT 0,
  
  -- Processing
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  gemini_model_used TEXT DEFAULT 'gemini-3-pro-preview',
  tokens_used INTEGER,
  processing_cost NUMERIC(10,6),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- Indexes
-- ============================================

-- Query insights by account and type
CREATE INDEX idx_conversation_insights_account_type 
  ON public.conversation_insights(account_id, insight_type);

-- Get top insights by occurrence
CREATE INDEX idx_conversation_insights_occurrence 
  ON public.conversation_insights(account_id, occurrence_count DESC)
  WHERE is_active = TRUE;

-- Find insights by archetype
CREATE INDEX idx_conversation_insights_archetype 
  ON public.conversation_insights(account_id, archetype)
  WHERE archetype IS NOT NULL;

-- Find unreviewed insights
CREATE INDEX idx_conversation_insights_unreviewed 
  ON public.conversation_insights(account_id, created_at DESC)
  WHERE reviewed_by_influencer = FALSE;

-- GIN index for examples search
CREATE INDEX idx_conversation_insights_examples 
  ON public.conversation_insights USING GIN (examples);

-- Analysis runs by account
CREATE INDEX idx_conversation_analysis_runs_account 
  ON public.conversation_analysis_runs(account_id, created_at DESC);

-- ============================================
-- Helper Functions
-- ============================================

-- Function: Get top insights by type
CREATE OR REPLACE FUNCTION get_top_insights(
  p_account_id UUID,
  p_insight_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  insight_type TEXT,
  title TEXT,
  content TEXT,
  occurrence_count INTEGER,
  confidence_score NUMERIC,
  examples JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.id,
    ci.insight_type,
    ci.title,
    ci.content,
    ci.occurrence_count,
    ci.confidence_score,
    ci.examples
  FROM public.conversation_insights ci
  WHERE ci.account_id = p_account_id
    AND ci.is_active = TRUE
    AND (p_insight_type IS NULL OR ci.insight_type = p_insight_type)
  ORDER BY ci.occurrence_count DESC, ci.confidence_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Merge similar insights
CREATE OR REPLACE FUNCTION merge_insight(
  p_account_id UUID,
  p_insight_type TEXT,
  p_title TEXT,
  p_content TEXT,
  p_example TEXT,
  p_conversation_id UUID
)
RETURNS UUID AS $$
DECLARE
  existing_insight UUID;
  new_examples JSONB;
  new_sources UUID[];
BEGIN
  -- Try to find similar insight (by title similarity)
  SELECT id INTO existing_insight
  FROM public.conversation_insights
  WHERE account_id = p_account_id
    AND insight_type = p_insight_type
    AND is_active = TRUE
    AND (
      title ILIKE '%' || p_title || '%'
      OR p_title ILIKE '%' || title || '%'
    )
  LIMIT 1;
  
  IF existing_insight IS NOT NULL THEN
    -- Update existing insight
    SELECT examples INTO new_examples
    FROM public.conversation_insights
    WHERE id = existing_insight;
    
    -- Add new example
    new_examples := new_examples || jsonb_build_array(p_example);
    
    -- Add conversation to sources
    SELECT source_conversations INTO new_sources
    FROM public.conversation_insights
    WHERE id = existing_insight;
    
    IF p_conversation_id IS NOT NULL AND NOT (p_conversation_id = ANY(new_sources)) THEN
      new_sources := array_append(new_sources, p_conversation_id);
    END IF;
    
    -- Update
    UPDATE public.conversation_insights
    SET 
      occurrence_count = occurrence_count + 1,
      examples = new_examples,
      source_conversations = new_sources,
      last_seen_at = NOW(),
      updated_at = NOW()
    WHERE id = existing_insight;
    
    RETURN existing_insight;
  ELSE
    -- Create new insight
    INSERT INTO public.conversation_insights (
      account_id,
      insight_type,
      title,
      content,
      examples,
      occurrence_count,
      source_conversations
    ) VALUES (
      p_account_id,
      p_insight_type,
      p_title,
      p_content,
      jsonb_build_array(p_example),
      1,
      ARRAY[p_conversation_id]
    )
    RETURNING id INTO existing_insight;
    
    RETURN existing_insight;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Automatic Timestamp Updates
-- ============================================

CREATE OR REPLACE FUNCTION update_conversation_insights_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_conversation_insights_updated_at
BEFORE UPDATE ON public.conversation_insights
FOR EACH ROW
EXECUTE FUNCTION update_conversation_insights_timestamp();

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE public.conversation_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_analysis_runs ENABLE ROW LEVEL SECURITY;

-- Influencers can view their own insights
CREATE POLICY "Influencers view own insights"
  ON public.conversation_insights FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Influencers can update their insights (review, deactivate)
CREATE POLICY "Influencers update own insights"
  ON public.conversation_insights FOR UPDATE
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Influencers can view their analysis runs
CREATE POLICY "Influencers view own analysis runs"
  ON public.conversation_analysis_runs FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "Service role manages insights"
  ON public.conversation_insights FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role manages analysis runs"
  ON public.conversation_analysis_runs FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE public.conversation_insights IS 'תובנות שנלמדו מהשיחות עם הבוט - לשיפור מתמיד';
COMMENT ON TABLE public.conversation_analysis_runs IS 'מעקב אחרי ריצות ניתוח השיחות';
COMMENT ON COLUMN public.conversation_insights.occurrence_count IS 'כמה פעמים התובנה הזו הופיעה בשיחות';
COMMENT ON COLUMN public.conversation_insights.confidence_score IS 'רמת ביטחון (0-1) שהתובנה נכונה ורלוונטית';
COMMENT ON COLUMN public.conversation_insights.archetype IS 'איזה ארכיטיפ רלוונטי (skincare, fashion, cooking, וכו)';
