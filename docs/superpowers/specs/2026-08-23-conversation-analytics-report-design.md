# Conversation Analytics & Weekly Retro Report — Design Spec

**Date:** 2026-08-23
**Author:** Ido + Claude
**Status:** Approved (design), pending implementation plan
**Area:** Brand dashboard → Analytics → Conversations
**Driver:** Argania Group (`c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1`) asked for a weekly, retroactive,
detailed breakdown of what customers actually talk about — classified by product, inquiry type,
problem and slice-keywords — as a page inside analytics with export, plus surfaced insights.

---

## 1. Context & Problem

Argania's ask, verbatim:

> "אחת לשבוע ורטרו — להוציא את הפירוט תלונות ולסווג אותם לכדי מוצר וסוג פנייה ומה הבעיה ומילות
> חיתוך דוח אנליטיקה מפורט. שיהיה עמוד בתוך האנליטקס + לייבא. גם ניתוח שיחות כללי מדויק
> ואנליטיקה מפורטת. כולל להציף תובנות."

Scope confirmed with Ido: **all channels** (widget, chat page, WhatsApp, Instagram DM) — not just
support tickets.

### 1.1 What already exists

| Asset | State |
|---|---|
| `daily-support-report` cron (968 lines) | Builds xlsx with problem-type / brand / category breakdowns, cross-tab pivots, trend, embedded charts. **Ticket-shaped, daily, email-only. Argania has `support_report_enabled` = null — they never receive it.** |
| `chat_messages.intent` jsonb | Already stores `{stage, topic, objection, confidence}` in Hebrew per turn. **Web only.** Nothing surfaces it. |
| `conversation_insights` + `conversation_analysis_runs` (mig 028) | Tables exist. **0 rows platform-wide.** |
| `analyze-conversations` cron (daily 06:00 UTC) | **Dead — see 1.3.** |
| IG DM → `chat_sessions` / `chat_messages` → `runEscalationCheck` → `support_requests` | Wired and generic (`src/lib/instagram-graph/dm-handler.ts`). |

### 1.2 Ground truth — Argania, 30 days

| Channel | Sessions | User messages | Messages with `intent` |
|---|---|---|---|
| web (widget + chat page) | 1,473 | 3,573 | 3,470 |
| whatsapp | 228 | 1,208 | **0** |
| legacy (null `anon_id`) | 304 | 745 | **0** |
| instagram | **0 — not connected** | 0 | 0 |

Session shape: 2,007 total → 10 empty, 823 single-message, 1,174 with 2+. Mean 2.77 user messages
when engaged. Full history: 3,592 sessions since 2026-03-05.

Support requests, 90 days: **936 total, of which 17 carry a `product_id`** (469 have an order
number, 336 a brand). Catalog is healthy: 128 `widget_products`, all categorised.

Platform-wide (active, non-demo): 4 accounts, 1,178 sessions/week, 3,915 user messages/week.

### 1.3 Two confirmed defects in the existing pipeline

1. `src/app/api/cron/analyze-conversations/route.ts:33` selects `accounts.instagram_username` —
   **a column that does not exist**. The query errors, the handler throws, the cron has returned
   500 every day since it was added.
2. Even if it ran, `src/lib/chatbot/conversation-learner.ts:91` reads `chatbot_conversations_v2` /
   `chatbot_messages_v2` — **both empty (0 rows platform-wide)**. Real traffic is in
   `chat_sessions` / `chat_messages`.

Consequence: `conversation_analysis_runs` has **0 rows for every account since migration 028**.
The old pipeline is replaced, not repaired.

### 1.4 The actual gap

Classification signal is not missing — it is **partial (web only), unaggregated, and unsurfaced**.
`chat_messages.intent` covers ~2/3 of one channel and none of WhatsApp, so it is a bootstrap and a
cross-check, **never the source of truth**. The report needs its own uniform pass over all channels.

### 1.5 Cost is not a constraint

`gpt-5.6-luna` = $0.20/M input, $1.20/M output (`src/lib/costs/pricing.ts`).

| Workload | Estimate |
|---|---|
| Argania, weekly (449 sessions) | ~$0.19 |
| Argania, full-history retro (3,592 sessions) | ~$1.50 one-off |
| Entire platform, weekly | ~$0.50 |

This removes cost as a design constraint and justifies classifying **all** history rather than a
limited window.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Unit of analysis = **one `chat_session`**, all channels | Channels already converge into one table. One report, one query surface. |
| D2 | Classify **once per session, immutably**; aggregate on read | Gives arbitrary date ranges, drill-down and week-over-week from the same rows; paid for once. |
| D3 | Two-level taxonomy: **closed L1 inquiry type + AI-discovered L2 topic** | L1 makes trends comparable across weeks and accounts; L2 is where the insights live. |
| D4 | "Complaint" is an **orthogonal axis**, not an L1 value | A shipping complaint is both "order status" and a complaint. Forcing one category loses either the complaint breakdown or the general picture — both were requested. |
| D5 | Product matching happens **in code**, exact/alias only — never by the model | The `brand_logos` lesson (Panda ≠ Pandora). A silent wrong match is worse than "unidentified". |
| D6 | Coverage percentages are **always displayed** | 17/936 tickets carry a product today. Without the number, a partial sample reads as complete. |
| D7 | Retro = the same stage-1 job with a wider window | No separate backfill code path. |
| D8 | Page **and** weekly push; the push carries aggregates + link, not raw conversations | Requested delivery; keeps PII out of routine email. |
| D9 | Ship behind a per-account config flag, Argania first | Reel-banner lesson: a rule generalised from one account broke things twice. |
| D10 | Absent data is labelled absent | Instagram renders "not connected" for Argania, never "0". |

---

## 3. Taxonomy

### 3.1 Axis 1 — inquiry type (closed, shared across all accounts)

`complaint` · `order_status` · `return_refund` · `product_question` · `recommendation` ·
`pricing_promo` · `availability` · `technical` · `other`

Hebrew labels: תלונה · סטטוס הזמנה ומשלוח · החזרה/החלפה/זיכוי · שאלה על מוצר · בקשת המלצה והתאמה ·
מחיר/מבצע/קופון · זמינות ומלאי · בעיה טכנית ותשלום · אחר

Chosen to fit cosmetics e-commerce, fashion, and a service provider (HMO) alike — deliberately not
derived from Argania alone.

### 3.2 Axis 2 — topic (free, AI-discovered, per account)

Hebrew free text as the customer framed it: "נשירת שיער", "אלרגיה לבישום", "תוקף מתנה בהזמנה".
A weekly clustering pass merges variants into canonical topics with aliases.

### 3.3 Per-session flags

- `is_complaint` (bool) + `complaint_kind` — `defective` | `wrong_item` | `shipping` | `quality` |
  `service` | `billing` | `null`
- `sentiment` — `negative` | `neutral` | `positive`
- `urgency` — `low` | `normal` | `high`
- `outcome` — `resolved_by_bot` | `escalated` | `abandoned` | `unknown`
- product: `product_mention_raw`, `product_id`, `product_category`
- `keywords text[]` — the "מילות חיתוך" slicing dimension

---

## 4. Data Model

> Migration order: `conversation_topics` (4.2) must be created **before**
> `conversation_classifications` (4.1), which carries an FK to it.

### 4.1 `conversation_classifications` — one row per session

```sql
CREATE TABLE public.conversation_classifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  session_id          UUID NOT NULL UNIQUE REFERENCES public.chat_sessions(id) ON DELETE CASCADE,

  channel             TEXT NOT NULL,          -- web | whatsapp | instagram | unknown
  started_at          TIMESTAMPTZ NOT NULL,   -- denormalised from chat_sessions for cheap filtering
  user_message_count  INTEGER NOT NULL DEFAULT 0,

  inquiry_type        TEXT,                   -- axis 1, closed enum (3.1)
  topic_raw           TEXT,                   -- axis 2, as the model returned it
  topic_id            UUID REFERENCES public.conversation_topics(id) ON DELETE SET NULL,

  is_complaint        BOOLEAN NOT NULL DEFAULT FALSE,
  complaint_kind      TEXT,
  sentiment           TEXT,
  urgency             TEXT,
  outcome             TEXT,

  product_id          UUID REFERENCES public.widget_products(id) ON DELETE SET NULL,
  product_mention_raw TEXT,
  product_category    TEXT,

  keywords            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  summary             TEXT,                   -- one sentence, Hebrew
  confidence          NUMERIC(3,2),

  status              TEXT NOT NULL DEFAULT 'ok',  -- ok | failed | needs_review
  error_message       TEXT,
  attempts            INTEGER NOT NULL DEFAULT 1,

  model               TEXT,
  tokens_in           INTEGER,
  tokens_out          INTEGER,
  cost_usd            NUMERIC(10,6),
  classified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Indexes: `(account_id, started_at DESC)`; `(account_id, inquiry_type)`;
`(account_id, is_complaint) WHERE is_complaint`; `(account_id, product_id)`;
`(account_id, topic_id)`; GIN on `keywords`.

`UNIQUE(session_id)` is the idempotency guarantee: a re-run skips rather than duplicating or
re-billing.

### 4.2 `conversation_topics` — canonical L2 clusters per account

```sql
CREATE TABLE public.conversation_topics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  aliases       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  session_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (account_id, label)
);
```

An alias hit maps next week's identical string with **no LLM call at all**.

### 4.3 `conversation_report_snapshots` — frozen weekly issue

```sql
CREATE TABLE public.conversation_report_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  payload       JSONB NOT NULL,     -- the full aggregation the page/email/xlsx all render
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, period_start, period_end)
);
```

Guarantees the weekly email and the page can never disagree about "last week".

### 4.4 `conversation_insights` — reused

Kept and finally populated, from stage 3 aggregates. Requires widening the `insight_type` CHECK to
add: `rising_topic`, `complaint_cluster`, `product_risk`, `unanswered`, `channel_shift`.
Every row must carry evidence in `examples` (counts + session ids) — **an insight without evidence
is not written**.

### 4.5 RLS

Same pattern as migration 028: brand SELECT via `accounts.owner_user_id = auth.uid()`, service role
full access. New tables carry no `authenticated` write grants.

---

## 5. Pipeline

### 5.1 Stage 1 — classify (`/api/cron/classify-conversations`, hourly)

Selection: account `status='active'`, `config.isDemo` not true, feature flag on;
`chat_sessions.last_turn_at < now() - interval '30 minutes'` (settled, so we never classify
mid-conversation); at least 1 user message; no existing `conversation_classifications` row, or an
existing row with `status='failed'` and `attempts < 3`.

- **One LLM call per session**, `gpt-5.6-luna`, structured outputs against a strict JSON schema.
  Not batched — batching 10 sessions per call introduces input/output misalignment, and at these
  volumes the saving does not pay for the error rate.
- **The product catalog goes in a stable system-message prefix** so it lands in the prompt cache:
  128 product names × 2,000 calls/week ≈ 2.4M tokens = $0.48 uncached vs **$0.05 cached**.
- **Product resolution runs in code**, not in the model. The model returns only
  `product_mention_raw` as the customer wrote it; matching to a `widget_products.id` is exact-key /
  alias only. No fuzzy matching (D5).
- Confidence `< 0.6` → one retry on `gpt-5.6-terra`; still low → `status='needs_review'`, excluded
  from coverage numerator.
- GPT-5.6 parameter rules enforced in the call site: **no custom `temperature`**,
  `max_completion_tokens` (not `max_tokens`) with headroom, explicit `reasoning_effort` — the
  omission that silently broke WA CS before.
- Per-run cost ceiling that aborts the run (the $205 uncapped-chain lesson). Usage recorded through
  `src/lib/costs/recorder.ts`.

`chat_messages.intent`, where present, is passed to the model as a hint and stored for cross-check —
never as the answer.

### 5.2 Stage 2 — topic clustering (`/api/cron/cluster-conversation-topics`, weekly)

New `topic_raw` values that miss every existing alias are sent, together with the account's current
canonical labels, in one call: merge into existing labels or open a new one. Writes `topic_id` back
onto the classification rows and updates `aliases` / `session_count` / `last_seen_at`.

### 5.3 Stage 3 — snapshot, insights, push (`/api/cron/weekly-conversation-report`, Sunday 06:00 UTC)

1. SQL aggregation for the closed week + the prior week (for deltas).
2. **One** LLM call over the **aggregates and movers** — never raw conversation text — returning
   3–6 insights, each with its supporting numbers and session ids → `conversation_insights`.
3. Freeze into `conversation_report_snapshots`.
4. Email the brand: aggregates + link to the page. WhatsApp notification where configured.

### 5.4 Retro / backfill

The same stage-1 handler with `?since=<iso>&limit=<n>`. Sequence for Argania: stage 1 over full
history (3,592 sessions, ~$1.50) → stage 2 over all topics → stage 3 replayed per past week so
week-over-week comparison works on day one.

### 5.5 Removal

`/api/cron/analyze-conversations` and `src/lib/chatbot/conversation-learner.ts` are deleted, and
the cron entry removed from `vercel.json`. Both are provably dead (§1.3). `chatbot_conversations_v2`
/ `chatbot_messages_v2` are left in place — out of scope here.

---

## 6. Surfaces

### 6.1 Page — `/influencer/[username]/analytics/conversations`

A tab within the existing analytics shell: same influencer-cookie auth + ownership check, same date
range control (7/14/30/90 + custom), plus filters for channel, inquiry type, and complaints-only.
New keys in `src/lib/i18n/dashboard/conversations.ts` (he + en; `accounts.language` drives it).

Order on screen — by the order the questions get asked, not by build difficulty:

1. **Coverage bar** — "1,997 שיחות בטווח · 98% סווגו · 41% מהתלונות שויכו למוצר".
2. **KPI row** — total inquiries · complaints · resolved by bot · escalated · negative sentiment,
   each with ▲▼ against the previous period of equal length.
3. **Insights** — 3–6 cards, placed high because they are the stated goal. Each card: the sentence,
   the number behind it, and "הצג את N השיחות" which filters the table below.
4. **What they talked about** — inquiry-type breakdown alongside top 15 topics with ▲▼; risers
   highlighted.
5. **Complaints zoom-in** — complaint-kind breakdown plus two cross-tabs: complaint × product and
   complaint × category.
6. **Products** — most-discussed, and most-complained. **Sorted by complaint rate (complaints ÷
   mentions), not by complaint count** — a bestseller accrues complaints by virtue of selling, and
   count-sorting points the brand at its hit product instead of its faulty one.
7. **Channels** — widget / WhatsApp / Instagram split + daily trend. Instagram → "לא מחובר".
8. **Keywords** — clickable, each one a filter.
9. **Full conversation table** — every session with every axis, honouring all active filters, linked
   to the conversation itself.

### 6.2 API

- `GET /api/influencer/[username]/analytics/conversations` — aggregation for a range + filters
- `GET /api/influencer/[username]/analytics/conversations/sessions` — paginated drill-down
- `GET /api/influencer/[username]/analytics/conversations/export?format=xlsx|pdf`
- Admin mirrors under `/api/admin/analytics/…`, same builder

### 6.3 Export

xlsx with one sheet per section plus embedded charts, built from the ExcelJS + quickchart.io code
extracted out of `daily-support-report/route.ts` into `src/lib/reports/` (shared by both). PDF via
the existing print template used by `analytics/report/page.tsx`.

**PII:** the full export contains real message bodies — names, phone numbers, order numbers. This is
data the brand already sees in its support queue, so there is no new exposure, but an xlsx travels
differently from a screen behind a login. Therefore: the message-body export is a **separate,
labelled button**, and the automated weekly push carries **aggregates + a link only**.

---

## 7. Rollout

Gated on `config.conversation_analytics.enabled`. Argania first; open to the rest only after one
real week has been reviewed (D9).

Argania-specific note: Instagram is not connected (`ig_graph_connections` empty,
`allowed_channels = ["chat"]`), so the IG channel is structurally empty for them. The DM →
`support_requests` path is already wired and generic — connecting IG is a separate task, not a
dependency of this one.

---

## 8. Testing

Unit (`npx vitest run` — note `npm run test` is watch mode):

- taxonomy validation: model output outside the closed L1 enum is coerced to `other`, not stored raw
- product resolution: exact and alias hits resolve; near-miss strings resolve to `null`
  (Panda ≠ Pandora); resolution never invents a `product_id`
- idempotency: re-running stage 1 over classified sessions issues zero LLM calls and writes zero rows
- coverage math: `needs_review` and `failed` rows are excluded from the classified numerator
- complaint-rate sort: a high-count / low-rate product ranks below a low-count / high-rate one
- snapshot determinism: page aggregation and frozen snapshot agree for a closed week
- absent-channel rendering: a channel with no connection renders "not connected", not `0`
- cost ceiling: a run that would exceed its budget aborts and records what it spent

Integration: full stage 1 → 2 → 3 on a seeded fixture account across all three channels.

Manual acceptance before rollout: run the retro on Argania, open the page for a known week, and
verify a sample of ~20 classifications by hand against the real conversations.

---

## 9. Out of scope

- Connecting Instagram for Argania
- Changing the bot to capture `product_id` at inquiry time (fixes the source going forward, does
  nothing for retro, and is a separate track)
- Retiring `chatbot_conversations_v2` / `chatbot_messages_v2`
- Retiring `daily-support-report` — it keeps running for accounts that use it; only its xlsx/chart
  helpers are extracted for reuse
