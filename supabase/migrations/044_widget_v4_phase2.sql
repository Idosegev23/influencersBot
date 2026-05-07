-- Widget v4 Phase 2: intent envelope persistence
-- Adds an optional intent JSONB column to chat_messages so the widget can
-- persist the structured journey-stage envelope the LLM emits as <<INTENT>>.
-- Shape: { stage, confidence, objection, topic }
--   stage:     'browsing' | 'comparing' | 'ready_to_buy' | 'needs_routine' | 'hesitating' | 'support'
--   objection: 'price' | 'fit' | 'ingredients' | 'shipping' | 'trust' | 'none'
--   topic:     short Hebrew slug (e.g. "שמפו לשיער יבש")
--
-- Bestie does NOT emit <<INTENT>> (gated by mode === 'widget' in baseArchetype),
-- so this column is always NULL for non-widget conversations. No reads from
-- Bestie code paths.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS intent jsonb;
