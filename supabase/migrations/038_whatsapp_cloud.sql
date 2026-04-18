-- =====================================================================
-- WhatsApp Cloud API — schema for the official Meta integration.
--
-- Architecture:
--  • ONE central business phone number (Meta-hosted) talks to everyone:
--    influencers, brands, and followers.
--  • A `contact` represents a remote WhatsApp user identified by wa_id
--    (international digits, no + sign — e.g. "972547667775").
--  • A `conversation` is the thread between us and a single contact on a
--    single business phone_number_id.
--  • Every inbound/outbound message is stored in `whatsapp_messages`.
--  • Raw webhook payloads are kept in `whatsapp_webhook_events` for audit
--    and replay.
--
-- Multi-tenancy: tenancy is at the conversation level via optional FKs
-- (influencer_id / partnership_id / role). The business number itself is
-- shared across all tenants.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Contacts — remote WhatsApp users we've interacted with.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id             TEXT NOT NULL UNIQUE,          -- e.g. "972547667775"
  phone_e164        TEXT,                          -- "+972547667775"
  profile_name      TEXT,                          -- provided by WhatsApp
  role              TEXT CHECK (role IN ('influencer','brand','follower','unknown'))
                        DEFAULT 'unknown',
  influencer_id     UUID REFERENCES influencers(id) ON DELETE SET NULL,
  -- partnership_id linking to partnerships is added later to avoid a
  -- hard dependency if that table is missing in some envs.
  partnership_id    UUID,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_role         ON whatsapp_contacts(role);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_influencer   ON whatsapp_contacts(influencer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_partnership  ON whatsapp_contacts(partnership_id);

-- ---------------------------------------------------------------------
-- Conversations — one per (business number, contact) pair.
-- The 24h customer service window state is tracked here.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id         TEXT NOT NULL,           -- our business number id
  contact_id              UUID NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','archived','blocked')),
  last_inbound_at         TIMESTAMPTZ,
  last_outbound_at        TIMESTAMPTZ,
  -- Meta opens a free-form reply window for 24h after every inbound msg.
  service_window_expires_at TIMESTAMPTZ,
  unread_count            INTEGER NOT NULL DEFAULT 0,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (phone_number_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_contact  ON whatsapp_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_status   ON whatsapp_conversations(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_recent   ON whatsapp_conversations(last_inbound_at DESC NULLS LAST);

-- ---------------------------------------------------------------------
-- Messages — one row per message, inbound or outbound.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  direction          TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  -- Meta's wamid (e.g. "wamid.HBgM..."). Unique to avoid webhook-replay dupes.
  wa_message_id      TEXT UNIQUE,
  reply_to_wa_id     TEXT,                         -- wamid of the message being replied to
  message_type       TEXT NOT NULL
                        CHECK (message_type IN (
                          'text','image','audio','video','document','sticker',
                          'location','contacts','interactive','button','reaction',
                          'template','system','unknown'
                        )),
  text_body          TEXT,
  media_id           TEXT,
  media_mime_type    TEXT,
  media_sha256       TEXT,
  media_url          TEXT,                         -- populated lazily after media download
  template_name      TEXT,                         -- when type = template
  template_language  TEXT,
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- raw Meta message object
  -- Delivery lifecycle for outbound: sent → delivered → read (or failed)
  status             TEXT CHECK (status IN ('pending','sent','delivered','read','failed')),
  error_code         INTEGER,
  error_message      TEXT,
  sent_at            TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  read_at            TIMESTAMPTZ,
  failed_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction    ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status       ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id        ON whatsapp_messages(wa_message_id);

-- ---------------------------------------------------------------------
-- Webhook events — raw, append-only log of every payload Meta posts us.
-- Useful for debugging, replays, and compliance. TTL'd separately.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Meta sends an `entry[].id` (WABA id) and a per-change timestamp.
  waba_id          TEXT,
  phone_number_id  TEXT,
  event_type       TEXT,                          -- 'messages' | 'statuses' | ...
  signature_valid  BOOLEAN NOT NULL,
  payload          JSONB NOT NULL,
  processed_at     TIMESTAMPTZ,
  processing_error TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_received  ON whatsapp_webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_unprocessed
  ON whatsapp_webhook_events(received_at) WHERE processed_at IS NULL;

-- ---------------------------------------------------------------------
-- Templates — mirror of the approved templates registered in Meta.
-- Not strictly required, but useful to render / validate before sending.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id        TEXT NOT NULL,
  name           TEXT NOT NULL,
  language       TEXT NOT NULL,
  category       TEXT,                             -- MARKETING | UTILITY | AUTHENTICATION
  status         TEXT,                             -- APPROVED | PENDING | REJECTED
  components     JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (waba_id, name, language)
);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_contacts_updated      ON whatsapp_contacts;
CREATE TRIGGER trg_whatsapp_contacts_updated
  BEFORE UPDATE ON whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_conversations_updated ON whatsapp_conversations;
CREATE TRIGGER trg_whatsapp_conversations_updated
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — enable; server-side service-role bypasses. For now no permissive
-- policies are added (only service role writes). Tighten later when we
-- expose conversations to admin UIs.
-- ---------------------------------------------------------------------
ALTER TABLE whatsapp_contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates       ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_contacts       IS 'Remote WhatsApp users we exchange messages with.';
COMMENT ON TABLE whatsapp_conversations  IS 'One thread per (business phone_number_id, contact) pair.';
COMMENT ON TABLE whatsapp_messages       IS 'Inbound and outbound messages; mirrors Meta wamid.';
COMMENT ON TABLE whatsapp_webhook_events IS 'Raw audit log of every Meta webhook payload.';
COMMENT ON TABLE whatsapp_templates      IS 'Local cache of approved Meta templates.';
