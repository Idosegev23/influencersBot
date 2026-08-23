-- ==================================================
-- Migration 080: Conversation Analytics
-- ==================================================
-- One immutable classification row per chat_session, canonical topic
-- clusters per account, and frozen weekly report snapshots.
--
-- Replaces the migration-028 learner pipeline, which never produced a single
-- insight for any account: its cron selected accounts.instagram_username (a
-- column that does not exist) and the learner behind it read
-- chatbot_conversations_v2 / chatbot_messages_v2, both empty platform-wide.
-- See docs/superpowers/specs/2026-08-23-conversation-analytics-report-design.md
-- ==================================================

-- ============================================
-- 1. conversation_topics — canonical L2 clusters, per account
-- Created FIRST: conversation_classifications carries an FK to it.
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversation_topics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  aliases       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  session_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (account_id, label)
);

CREATE INDEX IF NOT EXISTS idx_conversation_topics_account
  ON public.conversation_topics(account_id, session_count DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_topics_aliases
  ON public.conversation_topics USING GIN (aliases);

-- ============================================
-- 2. conversation_classifications — one row per classified session
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversation_classifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  session_id          UUID NOT NULL UNIQUE REFERENCES public.chat_sessions(id) ON DELETE CASCADE,

  channel             TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  user_message_count  INTEGER NOT NULL DEFAULT 0,

  inquiry_type        TEXT,
  topic_raw           TEXT,
  topic_id            UUID REFERENCES public.conversation_topics(id) ON DELETE SET NULL,

  is_complaint        BOOLEAN NOT NULL DEFAULT FALSE,
  complaint_kind      TEXT,
  sentiment           TEXT,
  urgency             TEXT,
  outcome             TEXT,

  product_id          UUID REFERENCES public.widget_products(id) ON DELETE SET NULL,
  product_mention_raw TEXT,
  product_category    TEXT,

  keywords            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  summary             TEXT,
  confidence          NUMERIC(3,2),

  status              TEXT NOT NULL DEFAULT 'ok',
  error_message       TEXT,
  attempts            INTEGER NOT NULL DEFAULT 1,

  model               TEXT,
  tokens_in           INTEGER,
  tokens_out          INTEGER,
  cost_usd            NUMERIC(10,6),
  classified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT conversation_classifications_status_check
    CHECK (status IN ('ok', 'failed', 'needs_review')),
  CONSTRAINT conversation_classifications_inquiry_type_check
    CHECK (inquiry_type IS NULL OR inquiry_type IN (
      'complaint','order_status','return_refund','product_question',
      'recommendation','pricing_promo','availability','technical','other'))
);

CREATE INDEX IF NOT EXISTS idx_conv_class_account_time
  ON public.conversation_classifications(account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_class_account_type
  ON public.conversation_classifications(account_id, inquiry_type);
CREATE INDEX IF NOT EXISTS idx_conv_class_complaints
  ON public.conversation_classifications(account_id, started_at DESC) WHERE is_complaint;
CREATE INDEX IF NOT EXISTS idx_conv_class_product
  ON public.conversation_classifications(account_id, product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_class_topic
  ON public.conversation_classifications(account_id, topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_class_keywords
  ON public.conversation_classifications USING GIN (keywords);
-- Retry sweep: find failed rows still under the attempt cap.
CREATE INDEX IF NOT EXISTS idx_conv_class_retry
  ON public.conversation_classifications(account_id, attempts) WHERE status = 'failed';

-- ============================================
-- 3. conversation_report_snapshots — the frozen weekly issue
-- Guarantees the pushed email and the live page cannot disagree.
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversation_report_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_conv_snapshots_account
  ON public.conversation_report_snapshots(account_id, period_start DESC);

-- ============================================
-- 4. Widen the reused conversation_insights enum
-- ============================================
ALTER TABLE public.conversation_insights
  DROP CONSTRAINT IF EXISTS conversation_insights_insight_type_check;

ALTER TABLE public.conversation_insights
  ADD CONSTRAINT conversation_insights_insight_type_check
  CHECK (insight_type IN (
    'faq','topic_interest','pain_point','feedback','objection','successful_pitch',
    'language_pattern','sentiment','product_inquiry','coupon_request',
    'rising_topic','complaint_cluster','product_risk','unanswered','channel_shift'
  ));

-- ============================================
-- 5. RLS — same shape as migration 028
-- ============================================
ALTER TABLE public.conversation_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_report_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own topics" ON public.conversation_topics;
CREATE POLICY "Owners view own topics"
  ON public.conversation_topics FOR SELECT
  USING (account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners view own classifications" ON public.conversation_classifications;
CREATE POLICY "Owners view own classifications"
  ON public.conversation_classifications FOR SELECT
  USING (account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners view own snapshots" ON public.conversation_report_snapshots;
CREATE POLICY "Owners view own snapshots"
  ON public.conversation_report_snapshots FOR SELECT
  USING (account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "Service role manages topics" ON public.conversation_topics;
CREATE POLICY "Service role manages topics"
  ON public.conversation_topics FOR ALL USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Service role manages classifications" ON public.conversation_classifications;
CREATE POLICY "Service role manages classifications"
  ON public.conversation_classifications FOR ALL USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Service role manages snapshots" ON public.conversation_report_snapshots;
CREATE POLICY "Service role manages snapshots"
  ON public.conversation_report_snapshots FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- No `authenticated` write grants on any of these three tables.
REVOKE INSERT, UPDATE, DELETE ON public.conversation_topics FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_classifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_report_snapshots FROM authenticated;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE public.conversation_classifications IS
  'One immutable classification per chat_session. UNIQUE(session_id) is the idempotency guarantee: a re-run skips rather than duplicating or re-billing.';
COMMENT ON TABLE public.conversation_topics IS
  'Canonical L2 topic clusters per account; aliases map raw variants without an LLM call.';
COMMENT ON TABLE public.conversation_report_snapshots IS
  'Frozen weekly aggregation so the pushed email and the live page cannot disagree.';
COMMENT ON COLUMN public.conversation_classifications.is_complaint IS
  'Orthogonal to inquiry_type: a shipping complaint is both order_status and a complaint.';
COMMENT ON COLUMN public.conversation_classifications.product_id IS
  'Resolved in code by exact/alias match only — never chosen by the model.';
