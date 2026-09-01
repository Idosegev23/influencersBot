-- Let a customer add a URL as knowledge, and choose whether we keep it fresh.
--
-- Until now the only way a page entered the knowledge base was the automated
-- crawl of the account's own website. There was no way to point at a single
-- page, a document hosted elsewhere, or a third-party site.
--
-- refresh_daily is the customer's own answer to "does this page change?".
-- Default false: a link is read once unless someone says otherwise, so we never
-- spend a daily fetch on a page that will never differ.

ALTER TABLE chatbot_knowledge_base
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS refresh_daily boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS fetch_error text;

-- The refresh job asks exactly one question: which rows are due?
CREATE INDEX IF NOT EXISTS idx_ckb_refresh_due
  ON chatbot_knowledge_base (refresh_daily, last_fetched_at)
  WHERE refresh_daily = true AND is_active = true;

COMMENT ON COLUMN chatbot_knowledge_base.source_url IS
  'Set when this entry was created from a link rather than typed by hand.';
COMMENT ON COLUMN chatbot_knowledge_base.refresh_daily IS
  'Customer said this page changes, so re-read it daily. False = read once.';
