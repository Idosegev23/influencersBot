-- Clone a live account into an isolated TEST account (production-safe).
--
-- Why this is a script and not a few UPDATEs: an account row carries live credentials, and a naive
-- `INSERT ... SELECT config` inherits every one of them. Cloning ARGANIA GROUP unedited would have
-- handed the test account:
--   * integrations.quickshop.api_key = qs_live_…      → order lookups against the REAL store,
--                                                        returning real customers' real orders
--   * escalation.recipients                            → every test hand-off emails ARGANIA's CS
--                                                        team and WhatsApps +97235515559
--   * widget.managementToken, shipping_webhook.token   → live secrets, duplicated
--   * shipment_provider.expected_master_customer_id    → the real courier account
--   * widget.domain = argania-oil.co.il                → the test widget served on the real store's
--                                                        own origin
--   * owner_user_id                                    → a real dashboard user owning the clone
--
-- So the config is DENY-first: strip the whole key, then re-add only what is safe.
--
-- CONTENT is copied (that is the point — the bot must answer like the real brand), but the copy set
-- is an explicit ALLOW-LIST. 85 tables carry an account_id; everything not named below is excluded,
-- including brand_orders (31,796 real orders), support_requests (1,340), chat_sessions (4,603),
-- whatsapp_* , widget_events and users. Nothing that identifies a real person is cloned.
--
-- Foreign keys are REMAPPED, not carried: a copied row pointing back at the source account's row is
-- exactly the "connected to the real account" failure this is meant to avoid.
--   document_chunks.document_id     → remapped to the cloned document
--   instagram_highlight_items       → remapped to the cloned highlight
--   instagram_transcriptions.source_id → remapped to the cloned post OR highlight item. source_id is
--                                        NOT NULL and 548 of ARGANIA's 640 transcriptions hang off
--                                        highlight items, not posts — a posts-only remap fails the
--                                        constraint. A row whose source was not copied is SKIPPED
--                                        rather than left pointing at the source account.
--   documents.owner_id              → NULL   (do not inherit a real user)
--   widget_products.series_id       → NULL   (would point at the source's series)
--   widget_products.source_page_id  → NULL   (would point at the source's scraped pages)
--
-- Naming: the clone is deliberately NOT called "ARGANIA DEMO". It is on the shared Bestie WhatsApp
-- number, so its name sits in the brand roster every real shopper sees. Two brands both called
-- ARGANIA-something are genuinely ambiguous — a shopper typing "ארגניה" could be offered, or bound
-- to, the test account. A name nobody would ever type removes that by construction.
--
-- Run: psql "$DATABASE_URL" -f scripts/clone-account-for-testing.sql
-- Re-runnable: it aborts if the target username already exists.

DO $$
DECLARE
  v_src          uuid := 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1';  -- ARGANIA GROUP
  v_username     text := 'bestie_qa_demo';
  v_display      text := 'BESTIE QA — חשבון בדיקות';
  v_widget_host  text := 'qa-demo.bestie.test';                    -- never the source's real domain
  v_new          uuid := gen_random_uuid();
  v_cfg          jsonb;
  v_cols         text;
  v_sel          text;
  v_n            bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM accounts WHERE config->>'username' = v_username) THEN
    RAISE EXCEPTION 'username % already exists — delete it first or pick another', v_username;
  END IF;

  SELECT config INTO v_cfg FROM accounts WHERE id = v_src;
  IF v_cfg IS NULL THEN RAISE EXCEPTION 'source account % not found', v_src; END IF;

  -- ---- config: strip every credential-bearing key, then re-add only what is safe -------------
  v_cfg := v_cfg - 'integrations' - 'shipping_webhook' - 'shipment_provider' - 'support';
  v_cfg := jsonb_set(v_cfg, '{widget}', (v_cfg->'widget') - 'managementToken');
  v_cfg := jsonb_set(v_cfg, '{widget,domain}', to_jsonb(v_widget_host));
  v_cfg := v_cfg || jsonb_build_object(
    'display_name',            v_display,
    'username',                v_username,
    'isDemo',                  true,      -- gates the daily scan crons (cost)
    'isTestAccount',           true,
    'clonedFrom',              v_src::text,
    'clonedAt',                to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSZ'),
    'escalation',              jsonb_build_object('enabled', false),
    'conversation_analytics',  jsonb_build_object('enabled', false, 'visible', false),
    -- On the shared Bestie number, per the operator's decision. See the naming note above.
    'whatsapp_cs',             coalesce(v_cfg->'whatsapp_cs', '{}'::jsonb) || jsonb_build_object('enabled', true)
  );

  INSERT INTO accounts (id, type, owner_user_id, config, plan, status, timezone, language,
                        allowed_channels, features, security_config)
  SELECT v_new,
         'creator',   -- /chat/[username] 404s on any other type
         NULL,        -- never inherit the real owner
         v_cfg, a.plan, 'active', a.timezone, a.language,
         a.allowed_channels, a.features, a.security_config
  FROM accounts a WHERE a.id = v_src;
  RAISE NOTICE 'account % (%) created', v_new, v_username;

  -- ---- id maps, so foreign keys can be remapped instead of carried over ----------------------
  CREATE TEMP TABLE _m_posts      ON COMMIT DROP AS SELECT id AS old_id, gen_random_uuid() AS new_id FROM instagram_posts      WHERE account_id = v_src;
  CREATE TEMP TABLE _m_docs       ON COMMIT DROP AS SELECT id AS old_id, gen_random_uuid() AS new_id FROM documents            WHERE account_id = v_src;
  CREATE TEMP TABLE _m_highlights ON COMMIT DROP AS SELECT id AS old_id, gen_random_uuid() AS new_id FROM instagram_highlights      WHERE account_id = v_src;
  CREATE TEMP TABLE _m_hitems     ON COMMIT DROP AS SELECT id AS old_id, gen_random_uuid() AS new_id FROM instagram_highlight_items WHERE account_id = v_src;

  -- Column lists are discovered, not hardcoded, so a schema change cannot silently drop a column.
  -- Generated columns (document_chunks.fts) and trigger-maintained ones (search_vector) are skipped
  -- and recomputed on insert.
  CREATE TEMP TABLE _cols ON COMMIT DROP AS
    SELECT table_name, column_name, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' AND is_generated = 'NEVER'
      AND column_name NOT IN ('id', 'account_id', 'search_vector');

  -- posts -------------------------------------------------------------------------------------
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg('t.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel FROM _cols WHERE table_name = 'instagram_posts';
  EXECUTE format(
    'INSERT INTO instagram_posts (id, account_id, %s) SELECT m.new_id, %L, %s
       FROM instagram_posts t JOIN _m_posts m ON m.old_id = t.id', v_cols, v_new, v_sel);
  GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE '  instagram_posts: %', v_n;

  -- documents: owner_id dropped -----------------------------------------------------------------
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg(CASE WHEN column_name = 'owner_id' THEN 'NULL::uuid'
                         ELSE 't.' || quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel FROM _cols WHERE table_name = 'documents';
  EXECUTE format(
    'INSERT INTO documents (id, account_id, %s) SELECT m.new_id, %L, %s
       FROM documents t JOIN _m_docs m ON m.old_id = t.id', v_cols, v_new, v_sel);
  GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE '  documents: %', v_n;

  -- chunks: document_id remapped; fts is generated and recomputes itself ------------------------
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg(CASE WHEN column_name = 'document_id' THEN 'md.new_id'
                         ELSE 't.' || quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel FROM _cols WHERE table_name = 'document_chunks';
  EXECUTE format(
    'INSERT INTO document_chunks (id, account_id, %s) SELECT gen_random_uuid(), %L, %s
       FROM document_chunks t LEFT JOIN _m_docs md ON md.old_id = t.document_id
      WHERE t.account_id = %L', v_cols, v_new, v_sel, v_src);
  GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE '  document_chunks: %', v_n;

  -- products: both FKs dropped so nothing points back at the source ------------------------------
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg(CASE WHEN column_name IN ('series_id', 'source_page_id') THEN 'NULL::uuid'
                         ELSE 't.' || quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel FROM _cols WHERE table_name = 'widget_products';
  EXECUTE format(
    'INSERT INTO widget_products (id, account_id, %s) SELECT gen_random_uuid(), %L, %s
       FROM widget_products t WHERE t.account_id = %L', v_cols, v_new, v_sel, v_src);
  GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE '  widget_products: %', v_n;

  -- persona ---------------------------------------------------------------------------------------
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg('t.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel FROM _cols WHERE table_name = 'chatbot_persona';
  EXECUTE format(
    'INSERT INTO chatbot_persona (id, account_id, %s) SELECT gen_random_uuid(), %L, %s
       FROM chatbot_persona t WHERE t.account_id = %L', v_cols, v_new, v_sel, v_src);
  GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE '  chatbot_persona: %', v_n;

  -- highlights + their items (BEFORE transcriptions — 548 of them hang off a highlight item) ----
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg('t.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel FROM _cols WHERE table_name = 'instagram_highlights';
  EXECUTE format(
    'INSERT INTO instagram_highlights (id, account_id, %s) SELECT m.new_id, %L, %s
       FROM instagram_highlights t JOIN _m_highlights m ON m.old_id = t.id', v_cols, v_new, v_sel);
  GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE '  instagram_highlights: %', v_n;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg(CASE WHEN column_name = 'highlight_id' THEN 'mh.new_id'
                         ELSE 't.' || quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel FROM _cols WHERE table_name = 'instagram_highlight_items';
  EXECUTE format(
    'INSERT INTO instagram_highlight_items (id, account_id, %s) SELECT mi.new_id, %L, %s
       FROM instagram_highlight_items t
       JOIN _m_hitems mi ON mi.old_id = t.id
       JOIN _m_highlights mh ON mh.old_id = t.highlight_id', v_cols, v_new, v_sel);
  GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE '  instagram_highlight_items: %', v_n;

  -- transcriptions: source_id repointed at whichever cloned entity it belongs to. The join is an
  -- INNER filter, not a fallback — a transcription whose source was not cloned is dropped rather
  -- than left holding a pointer into the source account.
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg(CASE WHEN column_name = 'source_id' THEN 'coalesce(mp.new_id, mi.new_id)'
                         ELSE 't.' || quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel FROM _cols WHERE table_name = 'instagram_transcriptions';
  EXECUTE format(
    'INSERT INTO instagram_transcriptions (id, account_id, %s) SELECT gen_random_uuid(), %L, %s
       FROM instagram_transcriptions t
       LEFT JOIN _m_posts  mp ON mp.old_id = t.source_id
       LEFT JOIN _m_hitems mi ON mi.old_id = t.source_id
      WHERE t.account_id = %L AND coalesce(mp.new_id, mi.new_id) IS NOT NULL',
    v_cols, v_new, v_sel, v_src);
  GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE '  instagram_transcriptions: % (of %)', v_n,
    (SELECT count(*) FROM instagram_transcriptions WHERE account_id = v_src);

  RAISE NOTICE 'done — %', v_new;
END $$;
