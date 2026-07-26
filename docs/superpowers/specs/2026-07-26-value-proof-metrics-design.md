# Value-Proof Metrics — Design Spec

**Date:** 2026-07-26
**Author:** Ido + Claude
**Status:** Approved (design), pending implementation plan
**Area:** Measurement — turn Yoav's 10 value-proof metrics into a measurable product surface
**First accounts:** Argania (`c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1`) and Studio Pasha (`36705ad6-4f82-46af-95e1-fb5ea6f4a44f`) — both QuickShop

---

## 1. Context

On 2026-07-24 Yoav Bogin (LEADRS) sent a list of 10 metrics that constitute proof of value for
Bestie, grouped as **proof of revenue** (1–4), **proof of quality** (5–8), and **proof of product**
(9–10), with the instruction: *measure all of this on Argania / Pasha.*

Three deliverables were requested: (a) the metrics inside **admin analytics**, (b) **closing the
collection gaps**, (c) a **one-off measurable report**. A fourth requirement was added during
design: the **brand must also see these in its own dashboard**.

### 1.1 What the data actually looks like today (verified 2026-07-26)

| Asset | Argania | Studio Pasha |
|---|---|---|
| `brand_orders` | 26,056 orders, ₪4,193,537, AOV ₪160.9 (from 2026-01-07) | 6,023 (from 2025-07-30) |
| `chat_sessions` | 1,806 | 115 |
| `support_requests` | 452 (~380 with `resolved_at`) | 23 |
| `widget_events` / `widget_sessions` | 506 / 52 (only since 2026-07-06) | 136 / 34 (since 2026-07-22) |
| `chat_handoffs` | **0 rows — feature never built** | 0 |
| `analytics_daily_rollup` | exists, 882 rows | — |
| `cost_tracking` | **0 rows** | 0 |
| `widget_sessions.cart_max_value` | **0 across all 86 sessions — no cart signal** | — |

`brand_orders` is fed both by a live webhook (`/api/webhooks/quickshop/[accountToken]`) and by
`/api/cron/quickshop-order-sync`, so order truth is near-real-time.

### 1.2 Two findings that shaped the design

**Finding A — live revenue attribution already exists and nobody reads it.**
`brand_orders.raw` carries QuickShop's `utm_source / utm_medium / utm_campaign / utm_term /
utm_content` plus `discount_code`. Because `bestieTag()` stamps `utm_source=bestie&utm_medium=chat`
on links the bot emits, orders originating from a bot link are **already tagged**:

- Argania: **149 orders** since 2026-06-12, AOV ₪165.0, ≈₪24,579
- Studio Pasha: **17 orders** since 2026-07-23, AOV ₪159.6, ≈₪2,713

**Finding B — QuickShop exposes abandoned carts, including its own recovery baseline.**
`GET /api/v1/abandoned-carts` returns 200 (undocumented in our notes until now). Argania: **7,991
carts**, each row `{ id, email, items[], subtotal, checkout_step, reminder_count,
reminder_sent_at, recovered_at, created_at, updated_at }`. `recovered_at` + `reminder_count` give
us the brand's *own* baseline recovery rate for free — the "vs baseline, vs control" Yoav asked
for, with nothing to request from the brand.

`GET /api/v1/analytics` also returns shop-wide period totals (Argania last 30d: 2,126 orders,
₪294,976, AOV ₪138.75, 16,282 customers, top products) — the store-level denominator for metric 2.

### 1.3 The finding that must not be repeated

An early read of Finding A compared bestie AOV (₪165.0) against **all-time** site AOV (₪160.9) and
concluded **+2.5%**. That comparison is invalid: the bestie window starts 2026-06-12. Matched to
the same window:

| | Bestie orders | All other orders | Delta |
|---|---|---|---|
| Argania (from 2026-06-12) | ₪165.0 (n=149) | ₪173.3 (n=8,992) | **−4.8%** |
| Studio Pasha (from 2026-07-23) | ₪159.6 (n=17) | ₪202.5 (n=26) | **−21%** (n tiny) |

So metric 3's upsell claim currently trends **negative**, not positive. Per Yoav: better to know
now. Architecturally the lesson is stronger — **period-matched comparison must be enforced in
code**, because the flattering number is the one you get by default.

---

## 2. Goals / Non-Goals

**Goals**

1. One precise operational definition per metric, with its data source and its known gaps.
2. Retroactive coverage: every conversation and order already in the DB gets attributed the day
   this ships — no "measurement starts now".
3. Admin surface (all 10) and brand surface (7 of 10).
4. A repeatable one-off report for Argania and Pasha.
5. Honesty enforced by code: a metric with no source reports "not measured", never 0.

**Non-Goals**

- **Metric 8 (answer accuracy)** — a human sampling process plus rating UI, not a metrics engine.
  Separate spec. Pulling it in would delay the other nine.
- Rebuilding `chat_handoffs` / bot-takeover — that has its own approved spec
  (`2026-07-19-human-handoff-and-bot-takeover-design.md`). This spec only *reports* on it, and
  reports it as unmeasured while the table is empty.
- Cross-account or portfolio-level rollups. Per-account only.

---

## 3. The 10 metrics

| # | Metric | Operational definition | Source | Gap |
|---|---|---|---|---|
| 1 | Revenue in conversations | Order ≤24h after a bestie touch, touch strictly precedes order | `brand_orders` × touch ledger | `anon_id` beacon (tier `assisted` only) |
| 2 | Conversation conversion rate | Metric 1 order count ÷ conversations with ≥1 user message | `chat_sessions` + `widget_sessions` | — |
| 3 | AOV with vs without | Attributed AOV vs AOV of all other orders, **period- and source-matched** | `brand_orders` | — |
| 4 | Abandoned carts recovered | `recovered_at` with a bestie touch, vs `recovered_at` from reminders only, vs never recovered | QuickShop `/abandoned-carts` | sync to local table |
| 5 | Deflection | Conversations with ≥1 user message that produced no `support_request` and no handoff — in % and ₪ | `chat_sessions` ⟂ `support_requests` | ₪ per ticket (brand-supplied) |
| 6 | Time to first response / to close | user→assistant gap from `chat_messages`; `created_at`→`resolved_at` on tickets | existing | pre-Bestie baseline |
| 7 | Escalation rate **and on what** | Escalations ÷ conversations, broken down by reason | `support_requests.source` | **reason taxonomy** |
| 8 | Answer accuracy | 100 conversations/month sampled; wrong / misleading / partial / correct | `chat_messages` | rating tool — **out of scope** |
| 9 | Setup time | `accounts.created_at` → first answered message, in days | existing | staff-hours (manual) |
| 10 | Client's own usage | Unique brand-user dashboard visits per week | — | **no login log exists** |

### 3.1 Three frozen decisions

**D1 — A "touch" is a three-tier taxonomy, never one number.**

| Tier | Key | Window | Status |
|---|---|---|---|
| `direct` | order carries `utm_source=bestie` | n/a | Live; 166 orders already collected |
| `assisted` | same `anon_id` on a conversation and on the order | touch → order ≤24h | Needs thank-you-page beacon |
| `influenced` | normalized phone or email match | touch → order ≤7d | Possible today |

First tier that matches wins. Every metric reports per tier. Merging them produces a headline
number that will not survive a customer's scrutiny.

`direct` requires **no** touch record: the UTM stamp is itself the evidence that the bot produced
the click, and the visitor's session may not have been recorded (widget analytics only began
2026-07-06). The "touch must precede the order" rule therefore applies to `assisted` and
`influenced` only.

**"A conversation"** — the shared denominator for metrics 2, 5 and 7 — means a session with **≥1
user-authored message**: a `chat_sessions` row having at least one `chat_messages` row with
`role='user'`, or a `widget_sessions` row with `sent_message = true`. Sessions that only loaded or
opened the widget are not conversations and are excluded from every denominator.

**D2 — Every comparison is period-matched and traffic-source-matched.** Otherwise the measured
effect belongs to the campaign, not to Bestie. See §1.3.

**D3 — Unmeasurable is rendered "not measured", never 0.** `chat_handoffs` being empty means the
feature was never built; it does not mean 0% escalation.

---

## 4. Architecture

Principle: **minimum new capture, maximum derived layer**, so all 1,921 existing conversations and
32,079 existing orders are attributed retroactively on day one.

### 4.1 New capture — 2 tables, 1 column, 1 event type

1. **`brand_abandoned_carts`** — mirror of QuickShop `/abandoned-carts`. New cron
   `/api/cron/quickshop-cart-sync`, modeled on the existing `/api/cron/quickshop-order-sync`.
   Upsert on QuickShop `id`. Columns: `account_id, external_id, email, items jsonb, subtotal
   numeric, checkout_step, reminder_count int, reminder_sent_at, recovered_at, created_at,
   updated_at, synced_at`. Backfill all 7,991 Argania rows on first run.
2. **`widget_order_beacons(account_id, order_number, anon_id, seen_at)`** — written by a new
   `POST /api/widget/conversion` when `widget.js` detects a thank-you page. This is the **only**
   new client-side capture, and the only one at risk (§4.4).
3. **`support_requests.escalation_reason text`** — metric 7's "on what". The escalation detector
   already classifies; it simply never persists the classification.
4. **`dashboard_visit`** event type added to `EVENT_CATALOG`
   (`src/lib/analytics/event-catalog.ts`, category `session`, surface `shared`), written
   server-side from the brand dashboard layout → metric 10. No new table.

### 4.2 Derived layer — zero new writes, fully backfillable

5. **`bestie_conversation_touches`** (view) — UNION over `chat_sessions`, `widget_sessions`,
   `support_requests`, `whatsapp_cs_sessions`, projecting
   `(account_id, touch_at, surface, session_id, anon_id, phone_norm, email_norm)`. This is the
   spine: it makes every past conversation attributable without having captured anything new.
6. **`bestie_order_attribution`** and **`bestie_cart_attribution`** — computed tables
   `(account_id, subject_id, tier, touch_at, lag_sec, computed_at)`. Refreshed nightly and
   on demand. Tier resolution order per D1.
7. **RPC `value_proof_summary(p_account_id uuid, p_since timestamptz, p_until timestamptz)`**
   returning one jsonb document with all metric blocks. Same pattern as the existing
   `widget_analytics_summary` RPC, which was written specifically to dodge PostgREST's 1,000-row
   fetch cap — the same cap would silently truncate 26K orders here.

### 4.3 Identity normalization

`src/lib/orders/phone-verify.ts` exposes `phoneMatches(a, b)` — a **comparator**, not a normalizer.
A view cannot join on a comparator, and an indexed join is required across 26K orders. So:

- Extract the normalization already implicit inside `phoneMatches` into an exported
  `normalizePhone(raw): string | null`, and have `phoneMatches` delegate to it. Behavior of the
  existing order-lookup path must not change — this is a refactor with the current tests as its
  guard, not a rewrite.
- Mirror the same rules in a SQL immutable function `bestie_normalize_phone(text)` so
  `bestie_conversation_touches.phone_norm` and `brand_orders` can be joined and indexed. The unit
  tests assert the TS and SQL implementations agree on a shared fixture set (Israeli local `05…`,
  `+972…`, `972…`, spaces/dashes, invalid input → null).
- Email = lowercase + trim, both sides.

No new phone-parsing *rules* are invented; only the existing ones are made addressable.

### 4.4 Known risk: the thank-you page

Every `path` the widget has reported on Argania is `/`, `/products`, `/product/…`, `/pages/…`,
`/shops/argania`, `/host.html` — **zero checkout or thank-you paths**. The evidence suggests the
widget is not loaded in QuickShop's purchase flow.

Decision: **build the beacon anyway** (the endpoint is small and was already specced on
2026-06-11), but no metric depends on it. Add an explicit verification task: check whether the
Bestie snippet exists in QuickShop's checkout template for these two stores. If it does not,
`assisted` renders "not measured" and metrics 1–2 stand on `direct` + `influenced`.

---

## 5. Surfaces

### 5.1 Metric visibility split

Three of the ten are **our** product metrics, not the brand's value metrics:

| # | Admin | Brand | Why |
|---|---|---|---|
| 1–4 | ✅ | ✅ | The brand's revenue story |
| 5–6 | ✅ | ✅ | The brand's operational saving |
| 7 | ✅ | ✅ | The honesty metric — showing it builds trust |
| 8 | ✅ | ❌ | Separate spec; and an error rate without context misleads |
| 9 | ✅ | ❌ | Product metric (service vs product), not the brand's business |
| 10 | ✅ | ❌ | Telling a brand "you logged in twice this month" works against us |

### 5.2 Placement — existing pages only, no new pages

- **Admin:** new `הוכחת ערך` tab in `/admin/influencers/[id]/analytics` beside the existing
  `WidgetTab.tsx` → `ValueProofTab.tsx`, fed by
  `GET /api/admin/analytics/value-proof?accountId=&days=`.
- **Brand:** a block inside the existing `/influencer/[username]/analytics`, fed by
  `GET /api/influencer/analytics/value-proof`. **Account scope comes from the session cookie
  only, never from a query parameter** — an IDOR of exactly this shape was found and fixed on
  `dm-settings`. New i18n keys in `src/lib/i18n/dashboard/` for both `he` and `en`.
- **Report:** `scripts/value-proof-report.ts <accountId> [--since] [--until]` emitting markdown.
  Run for Argania and Pasha.

### 5.3 Cost per ticket as a brand-owned field

Metric 5's ₪ figure is the one input with no API source. It becomes an **editable field in the
brand's own settings** ("עלות טיפול בפנייה"). The number is then theirs — not ours to defend — and
it gives the brand a reason to open the dashboard, which is itself metric 10.

---

## 6. Honesty guardrails (enforced in code)

The real failure mode here is not a crash; it is reporting a flattering number that was never
measured. Therefore:

1. Every metric returns `{ value, n, tier, basis, measured }`. `measured: false` renders as
   **"לא נמדד"**. Zero never substitutes for missing — empty `chat_handoffs` returns `null`.
2. Every comparison returns the window it used. A comparison that cannot match periods returns
   `measured: false`. This makes the §1.3 error impossible to reproduce in code.
3. `n < 30` sets `lowConfidence: true`, and the UI prints `n` next to every percentage. Pasha's
   n=17 will render that way.
4. The three attribution tiers are never summed into a headline number without the per-tier
   breakdown displayed alongside it.

---

## 7. Testing

TDD — tests written before implementation, Vitest under `tests/unit/`.

**`value-proof-attribution.test.ts`**
- tier resolution order: `direct` beats `assisted` beats `influenced`
- 24h boundary: 23:59 attributed, 24:01 not
- **touch must strictly precede the order**: order at T with touch at T+1min → not attributed
- 7-day `influenced` window boundary
- a `direct` order with **no** touch record is still attributed (the UTM is the evidence)
- `normalizePhone` TS and `bestie_normalize_phone` SQL agree on a shared fixture set; `phoneMatches`
  behavior is unchanged after the extraction; email compared lowercased

**`value-proof-metrics.test.ts`**
- deflection negation: session with ≥1 user message, no ticket, no handoff → deflected
- an unmatched-period comparison is rejected (`measured: false`)
- `measured: false` is distinguishable from `value: 0`
- `lowConfidence` set at n<30

**`quickshop-cart-sync.test.ts`**
- pagination under the 100 req/min limit
- upsert idempotency (re-running does not duplicate)
- `recovered_at` transition from null to a timestamp is picked up

**Acceptance test:** run `value-proof-report.ts` for Argania and Pasha; every number in the report
must reconcile against an independently written SQL query. A report that does not reconcile fails.

---

## 8. Open items carried into the plan

1. **Verify** whether the Bestie snippet exists in QuickShop's checkout/thank-you template for
   Argania and Pasha. Determines whether the `assisted` tier can ever be populated.
2. **Cost per ticket** must be supplied by Argania and Pasha before metric 5 reports ₪ (the %
   figure works without it).
3. **Staff-hours** for metric 9 has no source. Days-to-first-answer is computed; hours are
   recorded manually per account or left unmeasured.
4. **Pre-Bestie baselines** for metric 6 come only from what the API can yield. Order history
   predates Bestie on both accounts (Argania from 2026-01-07, Pasha from 2025-07-30), so
   order-derived baselines are real; response-time baselines are not available and report as
   unmeasured.

---

## 9. Related

- `2026-06-11-widget-conversion-attribution-design.md` — the original anon_id/thank-you attribution
  spec. **Never migrated**; `widget_conversions` does not exist in production. This spec supersedes
  its scope and revives only the beacon.
- `2026-07-19-human-handoff-and-bot-takeover-design.md` — will populate `chat_handoffs`, which
  metric 5 and 7 read.
- `2026-07-21-whatsapp-customer-service-design.md` — WhatsApp CS carries a phone number on every
  conversation, making the `influenced` tier 100% joinable once live.
- `reference_quickshop_api.md` (memory) — needs updating with `/abandoned-carts` and `/analytics`.
