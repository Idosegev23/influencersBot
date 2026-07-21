# WhatsApp Customer Service (Bestie CS) — Design Spec

**Date:** 2026-07-21
**Author:** Ido + Claude
**Status:** Approved (design), pending implementation plan
**Area:** New brand-facing product — full customer service over WhatsApp, powered by the Bestie brain
**First implementation:** Argania (QuickShop). LA BEAUTÉ (Shopify) deferred until its Admin API token is available.

---

## 1. Context & Vision

Bestie runs on **one shared WhatsApp business number** (Meta Cloud API). Today that number
already serves three audiences via `src/app/api/webhooks/whatsapp/route.ts`: a personal handoff
(Itamar), the **agent CRM** (voice→quote), and **support-ticket** replies. A message from an
**unknown number** currently dead-ends — it is stored in `whatsapp_messages` and never answered.

This feature fills that open slot with a **customer-service bot for brands**. A shopper messages
the Bestie number, Bestie recognises them as a customer (not an agent, not a known ticket), and:

1. asks **who** they are (name — once, remembered forever),
2. asks **which brand** they want (native WhatsApp list + confirmation),
3. hands the conversation to **that brand's Bestie engine** — full service: look up the shopper's
   **order** and its **line items**, answer product / how-to-use questions from the brand's RAG,
   report **shipping status**, open a **support inquiry**, and **escalate to a human** when needed.

Everything happens inside WhatsApp.

### Ground truth (verified 2026-07-21)

| Brand | Platform | Orders API | Shipping | First? |
|---|---|---|---|---|
| **Argania** | **QuickShop** | ✅ `qs_live_…` key (auto-identifies shop) | Focus (same provider as LA BEAUTÉ) — pending Argania master-customer-id | ✅ **v1** |
| LA BEAUTÉ | Shopify | Needs Admin API token (not yet available) | Focus (live, master `10038`, `lookup_mode:p2`) | deferred |
| Studio Pasha | QuickShop | Has key (not yet supplied) | — | after Argania |

No brand currently has any order integration wired; the Shopify order-lookup code exists but is
provisioned for nobody. Argania is the first brand we can build **end-to-end today**.

---

## 2. Goals & Non-Goals

### Goals
- A WhatsApp CS bot that is **multi-tenant and config-driven**, architected for **10,000 brands**.
- **Reuse** the production Bestie brain (SandwichBot), the WhatsApp queue/worker, the Shopify &
  Focus clients, the support-ticket system, and the approved human-handoff spec. Minimal net-new.
- **Order lookup** unified behind one interface across heterogeneous store platforms.
- **Full human handoff** (bot pause + notify brand + human reply in Bestie inbox + resume).
- Ship **Argania** first with real order + product + shipping + escalation.

### Non-Goals (v1)
- **The bot performs no write actions** on the store (no cancel/refund/address-change). It reads,
  advises, and escalates. Writes are a human's job via handoff. (QuickShop *has* write endpoints —
  `/fulfill`, `/cancel`, `/edit-items` — we deliberately do not call them.)
- **No per-brand WhatsApp numbers.** One shared Bestie number; tenancy at the conversation layer.
- **No self-serve OAuth onboarding wizard** in v1 — provisioning is manual (paste key / token).
  The scalable provisioning path is documented as target architecture (§12) and built later.
- **No identity verification beyond best-effort phone match** (§8).
- **No timer-based auto-resume** of a paused bot (inherited from the handoff spec).

---

## 3. Locked Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Scale posture | Multi-tenant, config-driven, no hardcoding. Runtime scalable now; provisioning scalable later. |
| D2 | Order data | Unified internal store `brand_orders` fed by per-platform **connectors** (pull + webhook). Read-only. |
| D3 | Brand routing | **Always ask** "who are you?" + "which brand?" (original vision). Scalable via fuzzy match over **CS-enabled brands only** + WhatsApp interactive list + explicit confirm + returning-customer memory. |
| D4 | Verification | **Best-effort phone match**: verify when the order carries a phone; allow when it does not. No email step. |
| D5 | Bot action scope | **Read + advise + escalate.** No store writes by the bot. |
| D6 | Handoff | **Full takeover**, built on the approved handoff spec (`bot_paused` on `chat_sessions`, `config.escalation`, `detectHandoff`). |
| D7 | Tickets | **Every** CS conversation opens a `support_request` (documentation); **escalation only on triggers**. |
| D8 | Brain | Reuse **SandwichBot** with a new `mode:'whatsapp'`, UI envelopes stripped. **Not** the stubbed Engine v2. |
| D9 | Threads | Identity = `wa_id`. A "thread" = a `support_request` (brand × inquiry). Adaptive re-entry; warm session (< 45 min) continues silently. |

---

## 4. Architecture Overview

The whole feature hangs off a **fourth branch** in the existing inbound webhook — precisely the
unknown-sender slot that dead-ends today (`processWebhook`, `route.ts:154–284`).

```
Shopper → Bestie WhatsApp number
  │
  ▼  EXISTING webhook: signature verify, dedup, whatsapp_contacts/conversations, 24h window
  ├─ Itamar?          → personal handoff            (exists)
  ├─ registered agent?→ agent CRM engine            (exists)
  ├─ open ticket?     → routeInboundToTicket        (exists)
  └─ none  → ✳️ NEW: routeInboundToCustomerService
        │
        ▼  EXISTING pattern: Redis FIFO queue + QStash drain worker  (per wa_id)
        ▼
   ┌──────────────── CS Orchestrator — FSM (whatsapp_cs_sessions) ────────────────┐
   │ greeting → awaiting_name → awaiting_brand → brand_confirm → in_service        │
   │            (returning customer → adaptive re-entry menu, §6)                  │
   │   brand resolved → open/attach support_request (thread) → bind chat_session   │
   └───────────────────────────────┬──────────────────────────────────────────────┘
                                    ▼
   ┌───────────── Bestie brain: SandwichBot(mode='whatsapp') + order intent ───────┐
   │  • general Q&A  → persona + RAG (product info, how-to-use)                     │
   │  • order intent → lookupOrder(accountId, orderNumber, senderPhone)            │
   │       → connector (QuickShop / Shopify) → brand_orders → phone verify         │
   │       → items + status + tracking (+ Focus enrichment if configured)          │
   │  • handoff trigger → detectHandoff → bot_paused + notify brand recipients      │
   └───────────────────────────────┬──────────────────────────────────────────────┘
                                    ▼  strip <<PRODUCTS/INTENT/ACTION/SUGGESTIONS>>
                                    ▼  sendText (interactive list/buttons where useful)
                                 Shopper
```

**Net-new components** (everything else is reuse):
1. `routeInboundToCustomerService` — the 4th branch.
2. **CS Orchestrator FSM** + table `whatsapp_cs_sessions`.
3. **Brand resolver** (fuzzy match over CS-enabled brands + interactive disambiguation).
4. **Order layer** — `brand_orders` store, connector registry, QuickShop adapter, Shopify adapter
   (thin wrapper over existing `lookupShopifyOrder`), `lookupOrder()` facade.
5. **QuickShop order webhook** receiver + **backfill/sync** job.
6. **WhatsApp interactive-message** send support in the Cloud client.
7. **`lookup_order` capability** wired into the CS service turn.
8. **WA channel binding** into the handoff pause mechanism (Bestie inbox reply → out same number).

---

## 5. Message Processing & Queue

Reuse the agent engine's proven async pattern (`src/lib/crm/wa-agent-queue.ts`, `wa-queue.ts`,
`wa-worker.ts`, `wa-locks.ts`; QStash `/api/crm/wa-worker`; sweep cron `/api/cron/wa-drain-sweep`):

- On CS-branch match: instant `sendReaction('👀')` + `sendTyping`, then enqueue onto a per-shopper
  FIFO list `cs:wa:<waId>:q` and `publishDrain`.
- Worker acquires a per-`waId` lock `cs:wa:<waId>:lock`, pops FIFO one-by-one, runs one CS turn,
  replies with `sendText` (3 retries), stamps `✅/⚠️`.
- Per-`wamid` SETNX dedup guards (`cs:wa:<wamid>:queued`, `…:done`) — mirror the agent guards.
- A sweep cron recovers orphaned queues (reuse the existing sweep, generalised to CS keys).

Rationale: same at-least-once delivery, ordering, burst-coalescing, and crash recovery the agent
engine already relies on — no new infra.

---

## 6. Identity, Threads & Re-entry (the service core)

**Identity is permanent and keyed on `wa_id`.** The shopper's **name is asked once** and stored on
`whatsapp_contacts`. A **thread = a `support_request`** (brand × inquiry). A shopper may have
several open threads across several brands simultaneously. No new "threads" table — the ticket *is*
the thread.

**Adaptive re-entry** — when a returning shopper sends a message, the orchestrator picks the
lightest correct prompt:

| Shopper state | Bestie behaviour |
|---|---|
| **Warm** (last msg < 45 min, same thread) | Continue silently — never interrogate mid-conversation. |
| **0 open threads** | `היי דנה 👋 לאיזה מותג הפעם?` (skips the name step) |
| **1 open thread** | `היי דנה 👋 ממשיכים עם LA BEAUTÉ – מוצר פגום? [כן, ממשיכים] [משהו אחר]` |
| **≥2 open threads** | Interactive list: `במה נמשיך?` → `Argania · שאלה על מוצר` / `LA BEAUTÉ · מוצר פגום` / `➕ פנייה חדשה` |

**Same brand, same vs new inquiry:** if an open ticket exists for `(contact, brand)`, Bestie offers
to continue it (default yes); "זה משהו אחר" opens a new thread/ticket for the same brand. Closed
tickets → a new message starts a new thread, but Bestie still knows the history.

**Mid-conversation brand switch:** the shopper can say "רגע, שאלה על ארגניה" at any time; the
orchestrator detects switch intent, keeps the current thread open, confirms the switch
(`[עוברים לארגניה]`), and rebinds `active_account_id`. Nothing is lost.

### Brand resolution (scalable "always ask which brand")

The resolvable set is **only brands with `config.whatsapp_cs.enabled = true`** — a small, slowly
growing set, not all 10k accounts. Resolution order:

1. **Returning memory** — brands this contact already engaged (`whatsapp_contacts` memory / open
   threads) offered first.
2. **Fuzzy match** — Postgres `pg_trgm` similarity over a per-account search vocabulary:
   `config.username`, `config.display_name`, `config.whatsapp_cs.aliases[]`, and the widget domain.
   (Hebrew + English + common misspellings.)
3. **Disambiguate** — 0 matches → ask for the brand name or site; 1 strong match → confirm with a
   Yes/No button; 2–N → a WhatsApp **interactive list** of the top matches (never a wall of text).
4. **Confirm before binding** — `מדובר ב-Argania (argania-oil.co.il)?` guards against wrong-brand
   data leakage.

---

## 7. Order Data Layer

### 7.1 Principle — one internal store, many feeders

The bot never queries a store live in the hot path per platform's quirks. There is **one internal
table `brand_orders`**, fed by each platform's **connector** in whichever mode it supports, and a
single facade:

```ts
// src/lib/orders/lookup.ts
async function lookupOrder(accountId: string, orderNumber: string, senderPhone: string):
  Promise<OrderLookupResult | { status: 'not_found' | 'ambiguous' | 'unverified' }>
// 1. resolve (accountId, orderNumber) from brand_orders            → row (has id + customer_phone)
// 2. refresh that one order live via connector.pull(id)            → items, status, tracking
// 3. best-effort phone verification (§8)
// 4. shipping enrichment: if config.shipment_provider → Focus live status
```

### 7.2 Connector interface + registry

```ts
// src/lib/orders/connectors/types.ts
interface OrderConnector {
  platform: 'quickshop' | 'shopify' | 'woocommerce' | 'magento';
  installMode: 'manual_token' | 'oauth' | 'platform_partner' | 'snippet';
  supportsDirectLookup: boolean;   // Shopify true (by name); QuickShop false → needs store
  pull(creds, ref: { id?: string; orderNumber?: string }): Promise<NormalizedOrder | null>;
  list?(creds, cursor): Promise<{ orders: NormalizedOrder[]; next?: string }>;  // backfill/sync
  normalizeWebhook?(payload): NormalizedOrder;    // push feeders
  registerWebhooks?(creds, url, secret): Promise<void>;
}
```

Adding a platform = one adapter file. Registry keyed by `config.integrations.<platform>`.

**`NormalizedOrder`** (the canonical shape stored in `brand_orders` / returned to the bot):
`orderNumber, externalId, status, financialStatus, fulfillmentStatus, customerName,
customerPhone, customerEmail, lineItems[{name, sku, quantity, price, total, imageUrl}],
trackingNumber, trackingUrl, total, currency, placedAt, raw`.

### 7.3 QuickShop adapter (Argania — v1)

Verified contract (full appendix §A):
- Base `https://my-quickshop.com/api/v1`, auth `X-API-Key: qs_live_…` (or `Bearer`); the key
  **auto-identifies the shop** — no shop id needed.
- `GET /orders` — list, **paginated** (`page`, `limit`; `meta.pagination.{page,limit,total,total_pages,has_next}`);
  **summary only, no line items.**
- `GET /orders/{id}` — **full detail**: `line_items[]`, `customer_phone`, `financial_status`,
  `fulfillment_status`, `status`, `tracking_number`, `tracking_url`, addresses, totals.
- **No server-side `order_number` filter** (the param is ignored — it returns the whole list). →
  order-number lookup **must** go through `brand_orders`.
- **Webhooks** — `POST /api/v1/webhooks` registers a URL; delivery body `{ event, timestamp, data }`
  (top field is `event`, e.g. `order.created`); optional secret → `X-Webhook-Signature: sha256=<hmac>`.
- **Rate limit** 100 req/min (`X-RateLimit-Remaining/Reset`); errors `401/403/404/400/429`.

QuickShop feeding strategy:
- **Backfill (one-off per store):** paginate `GET /orders` → upsert **summaries** into
  `brand_orders` (enough to resolve number→id and to phone-verify). ~25.4k orders for Argania ≈
  ~5 min at the rate limit. Line items are **not** backfilled.
- **Live detail (lazy):** on an actual shopper lookup, `GET /orders/{id}` for fresh items + status +
  tracking. One call, well within limits, always current.
- **Incremental (real-time):** register `order.created` / `order.updated` / `order.fulfilled`
  webhooks → HMAC-verified receiver upserts into `brand_orders`. Mirrors the existing shipping
  webhook (`src/app/api/webhooks/shipping/[accountToken]/route.ts`).
  - Registration needs the `webhooks:write` scope on the key, **or** paste our URL into the
    QuickShop dashboard webhook UI. Both supported; pick whichever the key allows.

### 7.4 Shopify adapter (LA BEAUTÉ — deferred)

Thin wrapper over the existing `lookupShopifyOrder` (`src/lib/shopify/order-lookup.ts:45`), which
already returns items + tracking in one call and supports **direct lookup by order name** →
`supportsDirectLookup = true`, no backfill required. Needs
`config.integrations.shopify.{shop_domain, admin_api_token, enabled}` with `read_orders`,
`read_customers`, `read_fulfillments`. Provisioned when the token arrives. **Reconcile the existing
key-name mismatch**: the admin form writes `api_token`, the lookup reads `admin_api_token` — settle
on one before relying on the admin UI.

### 7.5 Shipping

- **QuickShop (Argania):** the order's `tracking_number` / `tracking_url` give tracking immediately.
  **Focus enrichment (same provider as LA BEAUTÉ)** added when Argania's `master_customer_id` is
  supplied → set `config.shipment_provider = { type:'focus', host, enabled, lookup_mode,
  expected_master_customer_id }` and pass the order's `tracking_number` as the Focus reference into
  `getFocusShipmentStatus` (`src/lib/shipment/focus-client.ts:89`). No new code — pure config.
- **LA BEAUTÉ:** Focus already live.

---

## 8. Identity Verification (best-effort phone match)

When a shopper supplies an order number, before revealing any detail:

- If the resolved order carries a **phone** → require it to match the WhatsApp sender
  (`toWaId`-normalised, tolerant of `0`↔`+972`). Mismatch → do **not** reveal; offer handoff.
- If the order has **no phone** (guest checkout) → reveal without verification.

Zero added friction (the phone is already ours from WhatsApp), and where possible Bestie **proactively
finds the order by sender phone** so the shopper need not type a number at all.

**Residual risk (accepted, documented):** orders without a phone remain enumerable by order number.
QuickShop and Israeli D2C checkouts almost always capture a phone, so exposure is small. Recorded
here as a conscious product decision.

---

## 9. Tickets & Human Handoff

### 9.1 Tickets (every conversation)
When a brand is bound, open (or attach to) a `support_request` with `channel = 'whatsapp_cs'`,
`customer_phone`, `customer_name`, brand `account_id`, and a topic. Conversation turns append to
`support_ticket_history`. This documents **every** CS conversation and drives analytics. Reuses the
existing support schema and `routeInboundToTicket` matching so later shopper replies re-attach.

### 9.2 Handoff (only on triggers) — built on the approved spec
Reuse `2026-07-19-human-handoff-and-bot-takeover-design.md` verbatim where possible:
- **Pause state:** `chat_sessions.bot_paused / bot_paused_at / bot_paused_reason` (each thread binds
  a `chat_session`, so the per-conversation pause applies directly). Read on every bot turn via
  `isBotPaused()`.
- **Triggers:** `detectHandoff` (extends the escalation detector) — explicit human request, refund /
  return / defective-product intent, frustration/anger, legal, repeated failure, `low_confidence`.
  Each toggleable via `config.escalation.triggers`.
- **On trigger:** set `bot_paused = true`, open/flag the ticket, **notify the brand's configured
  recipients** (`config.escalation.recipients`) by email + in-app (WhatsApp recipient channel is
  reserved in that spec, still not wired).
- **Human reply → shopper:** the brand's rep replies inside the **Bestie inbox** (the WA channel
  becomes a new "conversation reply" surface for the pause mechanism); the reply is sent out over the
  **same Bestie number** via `sendText`. Writing a human message auto-sets
  `bot_paused_reason='human_reply'`.
- **Resume:** manual per-conversation toggle only (no auto-resume).
- **Gating:** behind `ESCALATION_ENABLED` + `config.escalation.enabled` (already exists).

---

## 10. State & Data Model

### 10.1 New table — `whatsapp_cs_sessions` (the FSM)
| column | type | meaning |
|---|---|---|
| `wa_id` | text pk | shopper WhatsApp id (E.164 digits) |
| `contact_id` | uuid fk → whatsapp_contacts | |
| `stage` | text | `greeting\|awaiting_name\|awaiting_brand\|brand_confirm\|in_service\|escalated\|paused` |
| `active_account_id` | uuid null | currently bound brand |
| `active_ticket_id` | uuid null → support_requests | current thread |
| `active_chat_session_id` | uuid null → chat_sessions | brain history + `bot_paused` |
| `customer_name` | text null | asked once |
| `context` | jsonb | scratch (pending disambiguation candidates, last order ref, etc.) |
| `last_activity_at` | timestamptz | warm/cold decision (45 min) |
| `version` | int | optimistic locking (mirror `crm_agent_wa_state`) |

### 10.2 New table — `brand_orders` (the unified store)
`account_id, external_id, order_number, customer_phone, customer_email, customer_name,
financial_status, fulfillment_status, status, tracking_number, tracking_url, total, currency,
line_items jsonb null, placed_at, source_platform, raw jsonb, updated_at`.
**Unique** `(account_id, order_number)`. Indexes on `(account_id, order_number)` and
`(account_id, customer_phone)` (proactive lookup). `line_items` nullable (lazy-filled).

### 10.3 Reused
`whatsapp_contacts` (+ store `profile_name`/asked name, brand memory), `whatsapp_conversations`,
`whatsapp_messages`, `chat_sessions` (+ `bot_paused*`), `chat_messages`, `support_requests`,
`support_ticket_history`, `chatbot_persona`, `accounts.config`.

### 10.4 Threads ↔ brain history
Each thread binds one `chat_session` (its `anon_id` derived from `wa_id`+`account_id`). CS turns
persist to `chat_messages` exactly like the widget (`widget-chat-handler.ts:399`), so SandwichBot
receives real history + rolling summary with no special-casing.

---

## 11. Config Schema (per account)

```jsonc
config.whatsapp_cs = {
  enabled: true,
  aliases: ["ארגניה", "argania", "argan"],       // seeds the fuzzy matcher (else derived)
  order_source: "quickshop",                       // which connector
  greeting: "…optional brand-specific opener…"
}
config.integrations.quickshop = {                  // secret, write-only from UI, never in git
  api_key: "qs_live_…",                            // auto-identifies the shop
  webhook_secret: "…",                             // HMAC for the inbound order webhook
  enabled: true
}
config.integrations.shopify = { shop_domain, admin_api_token, enabled }   // LA BEAUTÉ, later
config.shipment_provider = { type:'focus', host, enabled, lookup_mode, expected_master_customer_id }
config.escalation = { enabled, triggers:{…}, recipients:[{name,email,whatsapp?}], lowConfidenceThreshold }
```

Secrets stay in `accounts.config` (existing pattern: write-only, masked on read). Never committed.

---

## 12. Scalability & Target Provisioning Architecture

**Runtime is already scalable** (config-driven store + connectors + one shared number). Only
**provisioning** needs a scalable path, built later without touching the runtime — the manual v1
keys write the *same* `config.integrations` shape the automated flow will populate.

Three install modes, chosen per platform:
| mode | platforms | UX |
|---|---|---|
| `manual_token` | **QuickShop**, Magento | paste API key (QuickShop key self-identifies the shop → truly one-step) |
| `oauth` | Shopify, WooCommerce (plugin), BigCommerce | one-click install, auto-registers webhooks |
| `platform_partner` | QuickShop (vendor deal), Wix | one integration → *every* store on that platform |

**Strategic note:** two of the three launch brands are QuickShop. A single vendor-level QuickShop
integration (or the shared `manual_token` adapter) unlocks *all* QuickShop brands with zero new code
— the highest-leverage scaling move. The self-serve onboarding step plugs into the existing wizard
(`docs/superpowers/specs/2026-07-13-account-onboarding-wizard-design.md`).

---

## 13. Error Handling, Security, Cost

- **WhatsApp 24h window:** customer-initiated, so in-window replies are free-form (`sendText`);
  brand-facing notifications use approved templates; re-engaging a shopper after 24h needs a template.
- **QuickShop rate limit (100/min):** backfill respects `X-RateLimit-*` with backoff; live `/orders/{id}`
  is one call per lookup.
- **Webhook security:** HMAC-verify the QuickShop `X-Webhook-Signature` against the raw body (mirror
  the shipping webhook). Per-account `accountToken` in the path resolves the brand.
- **Wrong-brand isolation:** every `brand_orders` / RAG / ticket query scoped by `account_id`;
  brand-confirm step before binding; phone verification before order reveal.
- **PII:** order data (name/address/phone/items) only revealed after phone match where a phone
  exists; secrets masked & write-only; the Argania key used for design was live — **rotate after
  wiring**, and provide remaining brand secrets straight into config, not chat.
- **Cost:** chat ≈ $0.02/turn; the material cost driver remains scans, not CS chat. Queue/worker are
  horizontally scalable (existing QStash pattern).

---

## 14. Testing Strategy

- **Unit:** brand resolver (fuzzy match, 0/1/N disambiguation, alias + Hebrew/English); QuickShop
  adapter `normalizeWebhook` + `pull` mapping; `lookupOrder` phone-verify branches (phone present/
  match/mismatch/absent); FSM transitions incl. warm/cold re-entry & mid-brand switch;
  `detectHandoff` triggers (word-boundary safe).
- **Integration:** inbound webhook → CS branch → queue → worker → reply (mock WA client); QuickShop
  webhook HMAC verify → `brand_orders` upsert; handoff pause → Bestie-inbox reply → outbound.
- **Manual (Argania):** real order number → items + status + tracking; unknown number; escalation →
  human takeover → resume.

---

## 15. Inputs Needed From Ido

**To ship Argania (v1):**
1. ✅ Argania QuickShop `qs_live_…` key — **have it** (used for the contract; rotate after wiring).
2. **Handoff recipients for Argania** — name + email (+ optional WhatsApp) for escalation.
3. **Brand aliases** for Argania (else derived from display_name/domain).
4. **Where the Bestie number is published** for Argania shoppers (site / order confirmation / packaging).
5. Confirm the key has (or can get) **`webhooks:write`** scope — else register the webhook in the
   QuickShop dashboard manually.

**Argania shipping (fast-follow):**
6. Argania **Focus `master_customer_id`** (+ confirm `lookup_mode`) — same provider as LA BEAUTÉ, config only.

**Deferred (LA BEAUTÉ):**
7. Shopify **Admin API token** (`read_orders`, `read_customers`, `read_fulfillments`) + shop domain.

---

## 16. Reuse Map (files)

| Concern | Reuse | New |
|---|---|---|
| Inbound webhook | `src/app/api/webhooks/whatsapp/route.ts` (add 4th branch) | `routeInboundToCustomerService` |
| WA send | `src/lib/whatsapp-cloud/client.ts` | interactive list/button send |
| Queue/worker | `src/lib/crm/wa-agent-queue.ts`, `wa-queue.ts`, `wa-worker.ts`, `wa-locks.ts`, cron sweep | CS-keyed variants |
| Brain | `src/lib/chatbot/sandwichBot.ts`, `widget-chat-handler.ts` | `mode:'whatsapp'`, envelope strip, CS service turn |
| Orders | `src/lib/shopify/order-lookup.ts` | `src/lib/orders/*` (facade, registry, quickshop + shopify adapters, `brand_orders`) |
| Order webhook | `src/app/api/webhooks/shipping/[accountToken]/route.ts` (pattern) | `src/app/api/webhooks/quickshop/[accountToken]/route.ts` |
| Shipping | `src/lib/shipment/focus-client.ts`, `config.shipment_provider` | (config only) |
| Tickets | `support_requests`, `support_ticket_history`, `src/lib/support/route-inbound.ts` | `channel='whatsapp_cs'` |
| Handoff | `bot_paused` on `chat_sessions`, `config.escalation`, `detectHandoff`, `isBotPaused/pauseBot/resumeBot` | WA reply channel binding |
| Persona/RAG | `chatbot_persona`, `buildPersonalityFromDB` | — |

---

## Appendix A — QuickShop API contract (verified 2026-07-21)

**Auth:** `X-API-Key: qs_live_…` or `Authorization: Bearer qs_live_…`; key auto-identifies the shop.
**Base:** `https://my-quickshop.com/api/v1`

**Orders**
- `GET /orders` — list, paginated. Envelope `{ data: Order[], meta: { pagination:{page,limit,total,total_pages,has_next,has_prev} } }`. Summary fields only (no line items). No working `order_number`/`search` filter observed.
- `GET /orders/{id}` — detail: `id, order_number, customer_name, customer_email, customer_phone, customer_id, financial_status, fulfillment_status, status, line_items[{id,name,sku,quantity,price,total,image_url,product_id,variant_title,properties{addons,bundleComponents,addonTotal}}], tracking_number, tracking_url, payment_method, paid_at, shipping_method, shipping_amount, subtotal, tax_amount, discount_amount, discount_code, total, currency, billing_address{…,phone}, shipping_address{…,phone}, created_at, updated_at, note`.
- Write (NOT used): `PATCH /orders/{id}`, `POST /orders/{id}/edit-items`, `POST /orders/{id}/fulfill`, `POST /orders/{id}/cancel`.

**Other:** `GET /products`, `GET /products/{id}`, `GET /customers`, `GET /categories`, `GET /discounts`, `GET /analytics`, `PATCH /inventory/{id}`.

**Webhooks:** `GET/POST /webhooks`, `GET/PATCH/DELETE /webhooks/{id}`, `GET /webhooks/{id}/deliveries`. Delivery: `POST` `application/json`, body `{ event, timestamp, data }` (top field `event`, e.g. `order.created`). Optional secret → header `X-Webhook-Signature: sha256=<hmac(body)>`; test events add `X-Webhook-Event`, `X-Webhook-Test`. Scopes: `orders:read`, `customers:read`, `webhooks:read/write`, … (`403` if a scope is missing).

**Limits:** 100 req/min per key; `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Errors: `401 unauthorized`, `403 forbidden`, `404 not_found`, `400 invalid_request`, `429 rate_limited`.

---

## Appendix B — Out of scope / follow-ups
- Bot-performed store writes (cancel/refund/edit) — deliberately excluded (D5).
- Per-brand WhatsApp numbers (Meta Embedded Signup).
- Self-serve OAuth onboarding wizard (§12) — target architecture, later.
- WooCommerce / Magento connectors — interface ready, not built.
- WhatsApp as a handoff *notification* channel (reserved in the handoff spec).
