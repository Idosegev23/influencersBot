# BYO WhatsApp Number — Tech Provider / Embedded Signup

**Date:** 2026-08-06 · **Status:** approved design, pending implementation plan

Customers connect **their own WhatsApp number** to Bestie via Meta Embedded Signup
(Tech Provider track). The customer keeps using the WhatsApp Business app on their phone
(**Coexistence**); our CS brain answers on the same number, and Meta bills the customer's
own card directly — we never touch payment.

## Decisions (all confirmed with Ido)

| # | Decision |
|---|---|
| D1 | Customer self-connects inside the existing `/onboard/[token]` wizard (new step, optional like other sources) |
| D2 | **Coexistence** mode: customer keeps the WhatsApp Business app; full-API migration is out of scope |
| D3 | Argania + Studio Pasha stay on Bestie's shared number for now; migration later, nothing here may block it |
| D4 | Send path: **explicit `channel` parameter** on every send function; no env fallback — missing channel throws |
| D5 | Customer access tokens stored in **Supabase Vault** (verified working end-to-end); table holds `token_secret_id` only |
| D6 | Coexistence history/contacts sync: **initiate (mandatory), ACK, discard payloads** — we store a counter, never other people's chat history |
| D7 | Bot pause on human reply (echo), **auto-resume after 6h of human silence** (`config.whatsapp_cs.human_idle_resume_hours`, default 6). Manual pause never expires |
| D8 | Payment: customer's card on customer's WABA, billed by Meta directly. **Mandatory wizard step**, verified by a real welcome-template send (billing probe) |
| D9 | Template provisioning: minimal set of 3 CS templates injected into the customer's WABA at connect time |
| D10 | Tech Provider designation goes on the **existing** `LeadersInfluencers` app (1297141655644794) — verified that a failed Access Verification is resubmittable and does not kill own-business traffic |

## 1. Meta prerequisites (manual, Ido) — re-verified against current docs 2026-08-08

Meta's official order: Business Verification (✅ done) → **App Review** → Tech Provider
onboarding (App Dashboard → **Use cases → Customize**). Access Verification is triggered
during program onboarding (60-day window) — prepare documents, submit when prompted.

1. **App Review — submit NOW, needs nothing built.** Advanced Access for
   `whatsapp_business_management` + `whatsapp_business_messaging`. Evidence = **two
   videos**: (a) a message sent from our system landing in a WhatsApp client — the live
   CS bot does this daily; a cURL send recording is also accepted; (b) template creation
   — our template scripts / WhatsApp Manager. Review latency runs in parallel with dev.
2. **2FA on the Business Manager** — program requirement, verify it's on
3. **Facebook Login for Business** configuration — create from the "WhatsApp Embedded
   Signup Configuration" template → yields `config_id`
4. **Embedded Signup Builder** (App Dashboard → WhatsApp) — v4 snippet. v2 dies
   2026-10-15; we build on v4 only
5. **Tech Provider onboarding** (Use cases → Customize; irreversible) — after review
6. **Access Verification** (business documents) — when prompted during onboarding
7. System-user token with `business_management` added (current token lacks it — Graph
   calls on the business object 403)
8. Data Use Checkup: privacy-policy URL + deletion URL (`/api/influencer/request-deletion` exists)

Onboarding cap until review+verification complete: 10 customers / rolling 7 days. After: 200.
The §9 pilot recording is no longer needed for App Review — keep it as internal QA evidence.

## 2. Data model

### New table `whatsapp_channels`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK → accounts, **unique** | one number per account in v1 |
| `waba_id` | text | customer's WABA |
| `phone_number_id` | text **unique** | inbound routing key |
| `display_phone_number` | text | |
| `verified_name` | text | |
| `token_secret_id` | uuid | Vault secret id — **never** a raw token column |
| `onboarding_mode` | text | `'coexistence' \| 'full_api'` (v1 only creates coexistence) |
| `status` | text | `pending \| active \| suspended \| disconnected` |
| `payment_ready` | boolean | flips via billing probe / error 131042 |
| `sync_initiated_at` | timestamptz | Coexistence 24h-deadline tracking |
| `templates` | jsonb | per-template approval status |
| `provision_state` | jsonb | idempotent-chain progress (§5) |
| `connected_at` | timestamptz | |

Migration follows 073's posture: no anon/authenticated grants, RLS enabled.
**Bestie's own number becomes a seeded row** (script `scripts/seed-bestie-channel.ts`
reading current env); after step 2 of rollout, env is seed-only.

### Changed

- `whatsapp_cs_sessions`: key `wa_id` → **`(channel_id, wa_id)`**; backfill existing 68
  rows to the Bestie channel. Add `human_last_reply_at timestamptz` (echo timestamps for D7).
- Vault module `src/lib/whatsapp-cloud/channel-tokens.ts`: `storeToken / readToken / deleteToken`.
  Disconnect **deletes** the secret, not just flags the row.

## 3. Send path (`src/lib/whatsapp-cloud/`)

- New `channels.ts`: `resolveChannelByAccount(accountId)` (throws if none) and
  `resolveChannelByPhoneNumberId(pnid)` (null if unknown). Redis cache, short TTL;
  token decrypted once per cache fill.
- `client.ts`: all 9 send/mark/typing functions take `channel: Channel` as a required
  param. `getConfig()` and the ignored `phoneNumberIdOverride` stub are deleted.
  No default. Missing channel = loud dev-time error, never a silent send from Bestie's number.
- `WHATSAPP_APP_SECRET` / webhook verify token stay global — one Meta app, one endpoint.

## 4. Connect flow (wizard + server)

### Wizard (`OnboardWizard.tsx`, mirrors the IG-connect card)

```
[1] "חבר וואטסאפ" → FB SDK popup (NEXT_PUBLIC_FB_APP_ID + NEXT_PUBLIC_WA_ES_CONFIG_ID, ES v4)
[2] "חבר אמצעי תשלום" → deep link to the WABA's WhatsApp Manager billing page
[3] automatic billing probe → green check / "ממתין לאישור תבנית" / retry
```

The WhatsApp step as a whole is optional (D1); steps 2–3 are mandatory *within* it — a
channel is not marked fully connected without a verified card. The probe depends on a
template being approved (§5); until then the wizard shows a pending state, not failure.

### Server `POST /api/onboard/[token]/whatsapp`

Body: `{ code, waba_id, phone_number_id }` — **no accountId, ever** (token → account
server-side, same anti-IDOR pattern as the IG connect route).

1. Exchange `code` → business-integration system-user token. **The code lives 30
   seconds** — exchange happens synchronously in this route, never deferred to a queue
2. **Ownership check**: `debug_token` → `granular_scopes.target_ids` must contain the
   claimed `waba_id`, else 403 and nothing is written. The token from Meta is the source
   of truth, not the browser
3. Proceed to provisioning chain (§5)

## 5. Provisioning chain (idempotent, progress on `provision_state`)

| # | step | on failure |
|---|---|---|
| 1 | token → Vault | halt |
| 2 | ownership check (above) | 403, halt |
| 3 | `POST /{waba_id}/subscribed_apps` | halt |
| 4 | insert channel row (`status='pending'`) | halt |
| 5 | initiate Coexistence sync — `POST /{phone_number_id}/smb_app_data` ×2 (`smb_app_state_sync`, `history`) | retry + alert us; **24h hard deadline** or Meta offboards the customer |
| 6 | create 3 CS templates on the WABA | continue (bot works reply-only without them) |

Runs inline (seconds), no QStash. "Retry" resumes from the first incomplete step.

**Templates (D9):** `cs_followup`, `cs_order_update`, `cs_human_reply` — utility, brand
name as body param, language from `accounts.language`. Approval status lands in
`whatsapp_channels.templates` via the `message_template_status_update` webhook.
Our 17 internal templates are NOT copied.

**Billing probe (D8):** once a template is approved, send the welcome/`cs_followup`
template to the connected number itself. Delivered → `payment_ready=true`, wizard green.
Error `131042` → "card not connected yet" + retry. Runtime: any send failing with 131042
flips `payment_ready=false` + admin badge + alert (catches cards that expire later).

## 6. Inbound routing inversion (`/api/webhooks/whatsapp`)

First decision moves from *sender* to *number*:

```
value.metadata.phone_number_id → resolveChannelByPhoneNumberId()
├─ Bestie channel   → existing 5-branch routing, unchanged
├─ customer channel → single-tenant CS path, account pre-bound
└─ unknown          → log + 200 (Meta retries forever otherwise)
```

Customer path: session born with `active_account_id` fixed; no `resolve_brand`, no
cross-account returning-memory. Scoping is **structural** (no tool exposes an account
selector — the Bestie-dashboard pattern). `list_open_threads` / `getEngagedAccountIds`
take a required `accountId` on this path — closes the cross-tenant ticket leak.

**Redis keys** become per-channel (`channelId` = `whatsapp_channels.id`):
`cs:${channelId}:wa:${waId}:{q,lock}`, drain-dedup
`csdrain_${channelId}_${waId}_${bucket}`; drain payload carries `channelId`. Bestie's
channel uses the same scheme (no special case). Brief in-flight-queue window during
deploy is acceptable; the sweep cron covers stragglers.

## 7. Coexistence webhooks + bot pause

New webhook fields: `smb_message_echoes`, `smb_app_state_sync`, `history`.

- **`smb_message_echoes`** (human replied from the phone):
  `(phone_number_id, recipient wa_id)` → session → `active_chat_session_id` →
  `pauseBot(sessionId, 'human_reply')` (existing `src/lib/handoff/bot-pause.ts`,
  migration 069 columns) + update `human_last_reply_at`.
- Worker checks `isBotPaused` **twice**: at dequeue and again after `runCsTurn` before
  send (echo can arrive mid-turn; same pattern as `wa-lead-worker.ts`).
- **Auto-resume (D7):** paused with reason `human_reply` and
  `now − human_last_reply_at > human_idle_resume_hours` (default 6) → clear pause, answer.
  `manual_takeover` never expires.
- **`history` / `smb_app_state_sync`:** ACK 200, increment a counter, discard payloads.
  Data minimization — what we don't store can't leak. Revisit only as an explicit
  future decision with encryption.

## 8. Admin surface

Block on the existing account page: number, verified name, channel status,
`payment_ready` badge, 3 template statuses, disconnect button.
**Disconnect** = `DELETE /{waba_id}/subscribed_apps` + Vault secret delete +
`status='disconnected'`. No new dashboard.

## 9. Rollout (no breaking moment)

1. Migration + `seed-bestie-channel.ts` (table exists, Bestie is a row)
2. One mechanical commit: send path → explicit channel everywhere
3. Regression gate on the existing channel: `cs:products-e2e`, `bestie:e2e`, CRM flow — identical behavior required before continuing
4. Routing inversion + echoes/pause + wizard step
5. Pilot customer through the full flow, **recorded → that recording is the App Review screencast**

## 10. Testing

- **Unit:** pnid→channel resolution (incl. unknown→200), per-channel Redis keys,
  pause TTL matrix (fresh echo pauses / 6h releases / manual never), foreign-WABA 403.
- **Integration = scripts, not vitest** (`tests/setup.ts` mocks `global.fetch`; green
  vitest against Meta is an illusion): `scripts/wa-channel-verify.ts` in the
  `bestie:dashboard-verify` mold.
- **Dedicated edge case:** shopper with an open thread on Bestie's channel messages a
  customer channel — assert zero leakage between paths.

## Out of scope (explicit)

- Migrating Argania/Studio Pasha off the shared number (D3 — later)
- Full-API (non-coexistence) onboarding; multiple numbers per account
- WhatsApp inbox UI (Coexistence keeps the customer's app as their inbox)
- Encrypting `ig_graph_connections.access_token` (separate task, same treatment deserved)
- The handoff spec's settings UI / new triggers — only the minimal pause slice here

## Verify during build (flagged, not assumed)

1. Exact ES v4 popup event payload shape — generic flow confirmed (`event: 'FINISH'` /
   `FINISH_ONLY_WABA`, `phone_number_id` + `waba_id` + `business_id`; `CANCEL` carries
   `current_step` / `error_code`); the Coexistence-specific `extras`/`featureType`
   values in `FB.login` still need confirmation
2. Whether template creation on the customer's WABA needs any extra permission beyond
   the exchanged token's `whatsapp_business_management`
3. The 2026-10-01 "service messages become chargeable" date (third-party blogs, not a
   Meta doc — affects messaging cost messaging to customers, not this design)
4. Coexistence eligibility errors in the popup (app-tenure/quality gates on the
   customer's side) — surface a readable Hebrew error in the wizard
