-- Protect a customer's own persona edits from the next persona rebuild.
--
-- background-scraper.ts upserts `tone` and updates `greeting_message` every time
-- it regenerates a persona. With the dashboard editor now writing those same
-- fields, a scan would silently revert whatever the customer had written — the
-- worst kind of bug, because the edit appears to save and then quietly vanishes
-- hours later.
--
-- This column records which fields a human set. The rebuild skips them.
-- NULL / empty means "nothing was hand-edited", which is every existing account,
-- so behaviour is unchanged until someone edits something.

ALTER TABLE chatbot_persona
  ADD COLUMN IF NOT EXISTS user_edited_fields text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN chatbot_persona.user_edited_fields IS
  'Persona fields set by hand in the dashboard. A persona rebuild must not overwrite these.';
