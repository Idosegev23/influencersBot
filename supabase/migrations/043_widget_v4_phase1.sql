-- Widget v4 Phase 1: structured product cards + social proof
-- Adds an optional social_proof JSONB column to widget_products so the widget
-- card UI can render rating/review/purchase signal lines.
-- Shape (any subset is fine): {
--   rating: number,           -- 0-5
--   review_count: number,
--   top_review: { text, author, rating },
--   purchase_signal: string   -- e.g. "47 קנו השבוע"
-- }
-- Bestie does not read this column; widget-only.

ALTER TABLE widget_products
  ADD COLUMN IF NOT EXISTS social_proof jsonb;
