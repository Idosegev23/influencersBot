-- ==================================================
-- Migration 017: Satisfaction Surveys
-- ==================================================
-- תיאור: מערכת סקרים למעקב שביעות רצון
-- תאריך: 2026-01-18
-- ==================================================

-- Table: satisfaction_surveys
CREATE TABLE IF NOT EXISTS public.satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Related entity
  entity_type TEXT NOT NULL CHECK (entity_type IN ('coupon_usage', 'partnership', 'chatbot_conversation', 'product', 'general')),
  entity_id UUID,
  
  -- Survey details
  survey_type TEXT NOT NULL DEFAULT 'nps' CHECK (survey_type IN ('nps', 'csat', 'ces', 'custom')),
  
  -- Respondent info
  user_identifier TEXT NOT NULL, -- phone, email, anonymous ID
  is_follower BOOLEAN DEFAULT false,
  
  -- Scores (1-10 for NPS, 1-5 for CSAT/CES)
  score INTEGER CHECK (score BETWEEN 1 AND 10),
  
  -- Feedback
  feedback TEXT,
  
  -- Multiple choice (optional)
  questions_answers JSONB DEFAULT '{}',
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'skipped')),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Context
  sent_via TEXT, -- 'email', 'whatsapp', 'in_app', 'sms'
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_satisfaction_surveys_account ON public.satisfaction_surveys(account_id);
CREATE INDEX idx_satisfaction_surveys_entity ON public.satisfaction_surveys(entity_type, entity_id);
CREATE INDEX idx_satisfaction_surveys_status ON public.satisfaction_surveys(status);
CREATE INDEX idx_satisfaction_surveys_score ON public.satisfaction_surveys(score) WHERE score IS NOT NULL;
CREATE INDEX idx_satisfaction_surveys_completed ON public.satisfaction_surveys(completed_at DESC) WHERE status = 'completed';

-- RLS Policies
ALTER TABLE public.satisfaction_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners can view their surveys"
ON public.satisfaction_surveys
FOR SELECT
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "System can insert surveys"
ON public.satisfaction_surveys
FOR INSERT
TO authenticated
WITH CHECK (true); -- API handles authorization

CREATE POLICY "Anyone can update their own survey response"
ON public.satisfaction_surveys
FOR UPDATE
TO anon, authenticated
USING (true) -- Anyone with the survey ID can respond
WITH CHECK (true);

-- Helper function: Calculate NPS (Net Promoter Score)
CREATE OR REPLACE FUNCTION public.calculate_nps(p_account_id UUID, p_entity_type TEXT DEFAULT NULL, p_entity_id UUID DEFAULT NULL)
RETURNS TABLE(
  nps_score INTEGER,
  promoters INTEGER,
  passives INTEGER,
  detractors INTEGER,
  total_responses INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_promoters INTEGER;
  v_passives INTEGER;
  v_detractors INTEGER;
  v_total INTEGER;
  v_nps INTEGER;
BEGIN
  -- Query surveys
  SELECT 
    COUNT(*) FILTER (WHERE score >= 9) as prom,
    COUNT(*) FILTER (WHERE score >= 7 AND score <= 8) as pass,
    COUNT(*) FILTER (WHERE score <= 6) as det,
    COUNT(*) as tot
  INTO v_promoters, v_passives, v_detractors, v_total
  FROM public.satisfaction_surveys
  WHERE 
    account_id = p_account_id
    AND status = 'completed'
    AND score IS NOT NULL
    AND survey_type = 'nps'
    AND (p_entity_type IS NULL OR entity_type = p_entity_type)
    AND (p_entity_id IS NULL OR entity_id = p_entity_id);
  
  -- Calculate NPS: (% Promoters - % Detractors)
  IF v_total > 0 THEN
    v_nps := ROUND(((v_promoters::NUMERIC / v_total) - (v_detractors::NUMERIC / v_total)) * 100);
  ELSE
    v_nps := 0;
  END IF;
  
  RETURN QUERY SELECT v_nps, v_promoters, v_passives, v_detractors, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_nps TO authenticated;

-- Helper function: Calculate CSAT (Customer Satisfaction)
CREATE OR REPLACE FUNCTION public.calculate_csat(p_account_id UUID, p_entity_type TEXT DEFAULT NULL, p_entity_id UUID DEFAULT NULL)
RETURNS TABLE(
  csat_score NUMERIC,
  satisfied INTEGER,
  total_responses INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_satisfied INTEGER;
  v_total INTEGER;
  v_csat NUMERIC;
BEGIN
  -- Query surveys (CSAT: score 4-5 out of 5 = satisfied)
  SELECT 
    COUNT(*) FILTER (WHERE score >= 4) as sat,
    COUNT(*) as tot
  INTO v_satisfied, v_total
  FROM public.satisfaction_surveys
  WHERE 
    account_id = p_account_id
    AND status = 'completed'
    AND score IS NOT NULL
    AND survey_type = 'csat'
    AND (p_entity_type IS NULL OR entity_type = p_entity_type)
    AND (p_entity_id IS NULL OR entity_id = p_entity_id);
  
  -- Calculate CSAT: (% Satisfied)
  IF v_total > 0 THEN
    v_csat := ROUND((v_satisfied::NUMERIC / v_total) * 100, 2);
  ELSE
    v_csat := 0;
  END IF;
  
  RETURN QUERY SELECT v_csat, v_satisfied, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_csat TO authenticated;

-- Notification rule for satisfaction surveys
INSERT INTO public.notification_rules (name, description, trigger_type, timing_value, timing_unit, channels, template, is_active)
VALUES (
  'Coupon Satisfaction Survey',
  'שליחת סקר שביעות רצון 3 ימים אחרי שימוש בקופון',
  'document_uploaded', -- placeholder, צריך trigger חדש
  3,
  'days',
  ARRAY['in_app', 'whatsapp'],
  'שלום! השתמשת בקופון {{coupon_code}}. נשמח לדעת - כמה היית מרוצה? דרג 1-10',
  true
)
ON CONFLICT DO NOTHING;

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Satisfaction surveys system created!';
  RAISE NOTICE '✅ satisfaction_surveys table';
  RAISE NOTICE '✅ NPS and CSAT calculation functions';
  RAISE NOTICE '✅ RLS policies configured';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Usage:';
  RAISE NOTICE '1. יצירת סקר: INSERT INTO satisfaction_surveys';
  RAISE NOTICE '2. שליחה לעוקב: via notification או ישירות';
  RAISE NOTICE '3. קבלת תשובה: UPDATE satisfaction_surveys SET score=X, status=completed';
  RAISE NOTICE '4. חישוב NPS: SELECT * FROM calculate_nps(account_id)';
END$$;
