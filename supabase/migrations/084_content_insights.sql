-- ==================================================
-- Migration 084: Content Insights
-- ==================================================
-- Insights derived from an account's SCANNED CONTENT, as opposed to
-- `conversation_insights`, which is derived from chat traffic.
--
-- Why both exist: the owner dashboard is built from leads, support tickets,
-- conversations, partnerships and promotions, and a freshly scanned account has
-- none of those. `conversation_insights` is equally empty until the weekly
-- analytics job has traffic to chew on. So on day one — exactly when a new
-- customer is looking hardest — the dashboard has nothing to show. These rows
-- are what it shows instead, and they exist the moment the scan finishes.
--
-- THE EVIDENCE RULE: every row carries `evidence`, and a row with no evidence is
-- not written. An insight nobody can check is decoration, and a dashboard full of
-- unfalsifiable AI prose is worse than an empty one.
--
-- See docs/superpowers/specs/2026-08-26-aba-association-demo-design.md
-- ==================================================

CREATE TABLE IF NOT EXISTS public.content_insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- top_performers — what earns engagement, and what the winners have in common
  -- content_gaps   — questions the content cannot answer
  -- topic_map      — what this account actually talks about, by weight
  -- cadence        — posting rhythm and timing, measured against performance
  insight_type  TEXT NOT NULL CHECK (insight_type IN
                  ('top_performers', 'content_gaps', 'topic_map', 'cadence')),

  title         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  -- Display order within a type; 0 first.
  rank          INTEGER NOT NULL DEFAULT 0,

  -- The numbers behind the claim, e.g. {"avgReactions": 8.4, "sampleSize": 41}.
  metrics       JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- What makes the claim checkable:
  -- [{ "kind": "post", "platform": "facebook", "url": "...", "excerpt": "...",
  --    "metric": "reactions", "value": 20 }]
  evidence      JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Groups every row produced by one generator pass. The generator inserts a new
  -- run and only then deletes the previous one, so a failed regeneration leaves
  -- the last good insights standing rather than blanking the dashboard.
  run_id        UUID NOT NULL,
  scan_job_id   UUID,

  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_insights_account
  ON public.content_insights(account_id, insight_type, rank);
CREATE INDEX IF NOT EXISTS idx_content_insights_run
  ON public.content_insights(account_id, run_id);

-- ============================================
-- RLS — same shape as migration 080
-- ============================================
ALTER TABLE public.content_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own content insights" ON public.content_insights;
CREATE POLICY "Owners view own content insights"
  ON public.content_insights FOR SELECT
  USING (account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "Service role manages content insights" ON public.content_insights;
CREATE POLICY "Service role manages content insights"
  ON public.content_insights FOR ALL USING (TRUE) WITH CHECK (TRUE);

COMMENT ON TABLE public.content_insights IS
  'Insights derived from scanned content (posts, website, comments) rather than from chat traffic. Every row must carry evidence.';
