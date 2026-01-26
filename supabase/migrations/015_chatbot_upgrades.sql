-- ==================================================
-- Migration 015: Chatbot Upgrades
-- ==================================================
-- תיאור: שדרוגים לצ'אטבוט - Persona, Data access, Directives
-- תאריך: 2026-01-18
-- ==================================================

-- Table: chatbot_persona
-- פרסונה ייחודית לכל משפיען
CREATE TABLE IF NOT EXISTS public.chatbot_persona (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Persona Details
  name TEXT NOT NULL,
  tone TEXT DEFAULT 'friendly' CHECK (tone IN ('friendly', 'professional', 'casual', 'formal', 'enthusiastic')),
  language TEXT DEFAULT 'he' CHECK (language IN ('he', 'en', 'ar', 'ru')),
  
  -- Bio & Description (from Instagram)
  bio TEXT,
  description TEXT,
  interests TEXT[],
  topics TEXT[],
  
  -- Behavior
  response_style TEXT DEFAULT 'helpful', -- helpful, funny, serious, etc.
  emoji_usage TEXT DEFAULT 'moderate' CHECK (emoji_usage IN ('none', 'minimal', 'moderate', 'heavy')),
  greeting_message TEXT,
  
  -- Knowledge Base
  faq JSONB DEFAULT '[]', -- Array of {question, answer}
  custom_responses JSONB DEFAULT '{}', -- Key-value pairs
  
  -- Instagram Data (cached)
  instagram_username TEXT,
  instagram_followers INTEGER,
  instagram_following INTEGER,
  instagram_posts_count INTEGER,
  instagram_engagement_rate NUMERIC(5,2),
  instagram_data JSONB DEFAULT '{}',
  instagram_last_synced TIMESTAMPTZ,
  
  -- IMAI Data (cached)
  imai_data JSONB DEFAULT '{}',
  imai_last_synced TIMESTAMPTZ,
  
  -- Directives (מהמשפיען)
  directives TEXT[], -- הנחיות ספציפיות: "תמיד תציע קופון", "אל תדבר על X"
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: chatbot_knowledge_base
-- מאגר ידע דינמי לצ'אטבוט (גישה לדאטה)
CREATE TABLE IF NOT EXISTS public.chatbot_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Knowledge Type
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN (
    'active_partnership',
    'coupon',
    'product',
    'faq',
    'brand_info',
    'custom'
  )),
  
  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[],
  
  -- Source
  source_type TEXT, -- 'partnership', 'coupon', 'manual', etc.
  source_id UUID,
  
  -- Settings
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher priority = shown first
  
  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: chatbot_conversations (upgraded)
-- שדרוג לטבלה קיימת - מעקב מפורט יותר
CREATE TABLE IF NOT EXISTS public.chatbot_conversations_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- User Info
  user_identifier TEXT NOT NULL, -- phone, email, or anonymous ID
  user_name TEXT,
  user_email TEXT,
  user_phone TEXT,
  is_follower BOOLEAN DEFAULT false,
  
  -- Conversation
  platform TEXT DEFAULT 'whatsapp' CHECK (platform IN ('whatsapp', 'web', 'instagram', 'facebook')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  
  -- Tracking
  message_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  
  -- Analytics
  satisfaction_score INTEGER CHECK (satisfaction_score BETWEEN 1 AND 5),
  converted_to_follower BOOLEAN DEFAULT false,
  coupon_shared BOOLEAN DEFAULT false,
  coupon_used BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: chatbot_messages_v2 (upgraded)
-- הודעות בשיחה
CREATE TABLE IF NOT EXISTS public.chatbot_messages_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chatbot_conversations_v2(id) ON DELETE CASCADE,
  
  -- Message
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'bot', 'system')),
  message_text TEXT NOT NULL,
  
  -- Bot Response Details
  intent TEXT, -- What user wanted: 'ask_about_partnership', 'request_coupon', 'ask_question'
  confidence NUMERIC(3,2), -- Confidence score 0-1
  knowledge_used UUID REFERENCES public.chatbot_knowledge_base(id),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: chatbot_data_collection
-- איסוף דאטה מעוקבים (GDPR compliant)
CREATE TABLE IF NOT EXISTS public.chatbot_data_collection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.chatbot_conversations_v2(id) ON DELETE SET NULL,
  
  -- Data Type
  data_type TEXT NOT NULL CHECK (data_type IN ('behavioral', 'explicit', 'survey')),
  
  -- Consent
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_given_at TIMESTAMPTZ,
  consent_type TEXT, -- 'implicit', 'explicit', 'survey'
  
  -- Collected Data
  data_key TEXT NOT NULL, -- 'age', 'location', 'interests', 'purchase_intent', etc.
  data_value TEXT,
  data_json JSONB, -- For complex data
  
  -- Source
  source TEXT NOT NULL, -- 'chat', 'form', 'survey', 'behavior'
  
  -- Privacy
  anonymized BOOLEAN DEFAULT false,
  can_be_used_for_marketing BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================
-- Indexes for Performance
-- ==================================================

CREATE INDEX idx_chatbot_persona_account ON public.chatbot_persona(account_id);

CREATE INDEX idx_chatbot_knowledge_account ON public.chatbot_knowledge_base(account_id);
CREATE INDEX idx_chatbot_knowledge_type ON public.chatbot_knowledge_base(knowledge_type);
CREATE INDEX idx_chatbot_knowledge_active ON public.chatbot_knowledge_base(is_active) WHERE is_active = true;
CREATE INDEX idx_chatbot_knowledge_keywords ON public.chatbot_knowledge_base USING gin(keywords);

CREATE INDEX idx_chatbot_conv_v2_account ON public.chatbot_conversations_v2(account_id);
CREATE INDEX idx_chatbot_conv_v2_user ON public.chatbot_conversations_v2(user_identifier);
CREATE INDEX idx_chatbot_conv_v2_status ON public.chatbot_conversations_v2(status);
CREATE INDEX idx_chatbot_conv_v2_last_message ON public.chatbot_conversations_v2(last_message_at DESC);

CREATE INDEX idx_chatbot_msg_v2_conversation ON public.chatbot_messages_v2(conversation_id);
CREATE INDEX idx_chatbot_msg_v2_created ON public.chatbot_messages_v2(created_at DESC);

CREATE INDEX idx_chatbot_data_account ON public.chatbot_data_collection(account_id);
CREATE INDEX idx_chatbot_data_conversation ON public.chatbot_data_collection(conversation_id);
CREATE INDEX idx_chatbot_data_type ON public.chatbot_data_collection(data_type);
CREATE INDEX idx_chatbot_data_key ON public.chatbot_data_collection(data_key);

-- ==================================================
-- RLS Policies
-- ==================================================

-- chatbot_persona: Account owners only
ALTER TABLE public.chatbot_persona ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners can manage persona"
ON public.chatbot_persona
FOR ALL
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

-- chatbot_knowledge_base: Account owners only
ALTER TABLE public.chatbot_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners can manage knowledge"
ON public.chatbot_knowledge_base
FOR ALL
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

-- chatbot_conversations_v2: Account owners only
ALTER TABLE public.chatbot_conversations_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners can view conversations"
ON public.chatbot_conversations_v2
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

-- chatbot_messages_v2: Nested under conversations
ALTER TABLE public.chatbot_messages_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their conversations"
ON public.chatbot_messages_v2
FOR SELECT
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM public.chatbot_conversations_v2
    WHERE account_id IN (
      SELECT id FROM public.accounts
      WHERE owner_user_id = auth.uid()
    )
  )
);

-- chatbot_data_collection: Account owners + GDPR compliant
ALTER TABLE public.chatbot_data_collection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners can view collected data"
ON public.chatbot_data_collection
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

CREATE POLICY "System can insert collected data"
ON public.chatbot_data_collection
FOR INSERT
TO authenticated
WITH CHECK (true); -- API handles authorization + consent

-- ==================================================
-- Helper Functions
-- ==================================================

-- Function: Update knowledge base from active partnerships
CREATE OR REPLACE FUNCTION public.sync_chatbot_knowledge_from_partnerships()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
  v_partnership RECORD;
BEGIN
  -- Get all active partnerships
  FOR v_partnership IN
    SELECT 
      p.id,
      p.account_id,
      p.brand_name,
      p.campaign_name,
      p.description,
      c.code as coupon_code,
      c.discount_value,
      c.discount_type
    FROM public.partnerships p
    LEFT JOIN public.coupons c ON c.partnership_id = p.id AND c.is_active = true
    WHERE p.status = 'active'
  LOOP
    -- Upsert knowledge entry
    INSERT INTO public.chatbot_knowledge_base (
      account_id,
      knowledge_type,
      title,
      content,
      keywords,
      source_type,
      source_id,
      is_active,
      priority
    ) VALUES (
      v_partnership.account_id,
      'active_partnership',
      format('שת"פ עם %s - %s', v_partnership.brand_name, v_partnership.campaign_name),
      format('שת"פ פעיל עם %s. %s. קוד קופון: %s (%s%%)', 
        v_partnership.brand_name,
        v_partnership.description,
        v_partnership.coupon_code,
        v_partnership.discount_value
      ),
      ARRAY[v_partnership.brand_name, v_partnership.campaign_name, 'שת"פ', 'קופון'],
      'partnership',
      v_partnership.id,
      true,
      10
    )
    ON CONFLICT (account_id, source_type, source_id)
    WHERE source_type = 'active_partnership'
    DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      keywords = EXCLUDED.keywords,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.sync_chatbot_knowledge_from_partnerships TO authenticated;

-- ==================================================
-- Social Listening Tables
-- ==================================================

-- Table: social_listening_mentions
-- ניטור אזכורים ברשתות חברתיות
CREATE TABLE IF NOT EXISTS public.social_listening_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Platform & Type
  platform TEXT DEFAULT 'instagram' CHECK (platform IN ('instagram', 'facebook', 'twitter', 'tiktok')),
  mention_type TEXT CHECK (mention_type IN ('tag', 'hashtag', 'caption', 'comment')),
  
  -- Post Details
  post_url TEXT,
  post_id TEXT,
  author_username TEXT,
  author_followers INTEGER,
  
  -- Content
  content TEXT,
  image_url TEXT,
  
  -- Sentiment Analysis
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'unknown')),
  sentiment_score NUMERIC(3,2), -- -1 to 1
  
  -- Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  engagement_score INTEGER DEFAULT 0, -- Calculated: likes + comments*2 + shares*3
  
  -- Tracking
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT false,
  is_responded BOOLEAN DEFAULT false,
  response_notes TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: social_listening_alerts
-- התראות על אזכורים חשובים
CREATE TABLE IF NOT EXISTS public.social_listening_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  mention_id UUID REFERENCES public.social_listening_mentions(id) ON DELETE CASCADE,
  
  -- Alert Details
  alert_type TEXT NOT NULL CHECK (alert_type IN ('high_engagement', 'negative_sentiment', 'influencer_mention', 'viral_potential')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Message
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Status
  is_sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  is_dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================
-- Indexes for Social Listening
-- ==================================================

CREATE INDEX idx_social_mentions_account ON public.social_listening_mentions(account_id);
CREATE INDEX idx_social_mentions_platform ON public.social_listening_mentions(platform);
CREATE INDEX idx_social_mentions_sentiment ON public.social_listening_mentions(sentiment);
CREATE INDEX idx_social_mentions_detected ON public.social_listening_mentions(detected_at DESC);
CREATE INDEX idx_social_mentions_engagement ON public.social_listening_mentions(engagement_score DESC);
CREATE INDEX idx_social_mentions_unread ON public.social_listening_mentions(is_read) WHERE is_read = false;

CREATE INDEX idx_social_alerts_account ON public.social_listening_alerts(account_id);
CREATE INDEX idx_social_alerts_mention ON public.social_listening_alerts(mention_id);
CREATE INDEX idx_social_alerts_unsent ON public.social_listening_alerts(is_sent) WHERE is_sent = false;

-- ==================================================
-- RLS Policies for Social Listening
-- ==================================================

-- social_listening_mentions: Account owners only
ALTER TABLE public.social_listening_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners can view mentions"
ON public.social_listening_mentions
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

CREATE POLICY "System can insert mentions"
ON public.social_listening_mentions
FOR INSERT
TO authenticated
WITH CHECK (true); -- API handles authorization

CREATE POLICY "Account owners can update mentions"
ON public.social_listening_mentions
FOR UPDATE
TO authenticated
USING (
  account_id IN (
    SELECT id FROM public.accounts
    WHERE owner_user_id = auth.uid()
  )
);

-- social_listening_alerts: Account owners only
ALTER TABLE public.social_listening_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owners can view alerts"
ON public.social_listening_alerts
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

CREATE POLICY "System can manage alerts"
ON public.social_listening_alerts
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true); -- API handles authorization

-- ==================================================
-- Helper Functions for Social Listening
-- ==================================================

-- Function: Calculate engagement score
CREATE OR REPLACE FUNCTION public.calculate_engagement_score(
  p_likes INTEGER,
  p_comments INTEGER,
  p_shares INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN COALESCE(p_likes, 0) + (COALESCE(p_comments, 0) * 2) + (COALESCE(p_shares, 0) * 3);
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.calculate_engagement_score TO authenticated;

-- ==================================================
-- Success Message
-- ==================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Chatbot Upgrades tables created!';
  RAISE NOTICE '✅ 5 new tables: persona, knowledge_base, conversations_v2, messages_v2, data_collection';
  RAISE NOTICE '✅ 2 social listening tables: mentions, alerts';
  RAISE NOTICE '✅ RLS policies configured';
  RAISE NOTICE '✅ Helper functions created';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '1. Set up Instagram API integration';
  RAISE NOTICE '2. Set up IMAI API integration';
  RAISE NOTICE '3. Build persona generator';
  RAISE NOTICE '4. Upgrade chatbot logic with knowledge base';
  RAISE NOTICE '5. Implement social listening tracker';
END$$;
