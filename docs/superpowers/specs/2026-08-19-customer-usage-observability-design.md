# Customer Usage Observability — L0 (Collection) + L1 (Health Board) — Design Spec

**Date:** 2026-08-19
**Author:** Ido + Claude
**Status:** Approved (design), pending implementation plan
**Area:** Admin → customer success / install detection / product telemetry

---

## 1. Context & Problem

We cannot answer the most basic customer-success question: **is this paying customer
actually running our product?**

Measured live on 2026-08-19 (30-day window), across all non-`crmOnly` accounts:

| Account | Widget loads | Opens | Chat sessions | Messages | WA | Verdict |
|---|---|---|---|---|---|---|
| ARGANIA GROUP | 1,058 | 45 | 2,068 | 10,675 | 146 | Embedded, healthy |
| STUDIO PASHA | 1,011 | 27 | 1,296 | 6,790 | 142 | Embedded, healthy |
| LA BEAUTÉ | 1,431 | **4** | 1,231 | 5,836 | 36 | Embedded, **0.3% open rate** |
| LDRS GROUP | 3 | 0 | 5 | 62 | 0 | Barely loading |
| החמניה | 0 | 0 | 6 | 50 | 0 | **Not embedded** (trial ends 2026-09-12) |
| KUNI | 0 | 0 | 1 | 2 | 0 | **Not embedded** (`widget.domain` = `kuni.co.il`) |
| TriRoars | 0 | 0 | 1 | 8 | 0 | Not embedded |
| Influencer Marketing AI | 0 | 0 | 0 | 0 | 0 | Not embedded |

Two paying customers have no line of our code on their site, and nobody noticed. One
customer serves the widget 1,431 times to get 4 opens — either the launcher is hidden,
broken, or blocked — and nobody noticed that either.

### Why the existing screens don't answer this

- [`/admin/analytics`](../../../src/app/admin/analytics/page.tsx) reads `analytics_daily_rollup`,
  which knows nothing about `widget_loaded`. An account that never installed looks
  identical to an account that installed and has no traffic.
- The only place `widget_loaded` surfaces is the Widget tab of the per-account drill-down
  ([`WidgetTab.tsx`](../../../src/app/admin/influencers/[id]/analytics/WidgetTab.tsx)) — one
  account at a time, no roll-call.
- `widget_events` has **90-day retention** (migration 055), so "when exactly did they stop"
  is unanswerable past a quarter.

### Three blind spots in collection

1. **`/api/widget/config` sees the real `Origin` of every embedding site and persists
   nothing.** This is the cheapest, most reliable install signal we have, and unlike
   `widget_events` it does not depend on `ANALYTICS_WIDGET_SECRET` being set — the env var
   whose absence already caused a full widget-analytics blackout once.
2. **`public/widget.js` swallows every error.** The pattern
   `catch (e) { /* never break the host page */ }` repeats dozens of times (e.g.
   [widget.js:552](../../../public/widget.js#L552)). Correct decision — we must never break a
   customer's site — but the cost is total blindness to client-side failure.
3. **There is no reliable "is this a paying customer" flag.** `accounts.plan` is `free` for
   *every* account except two demos marked `pro`; `config.isDemo` is inconsistent (`'true'`,
   `'false'`, and absent — the three most active real customers all have it absent).

### Scope of this spec

The full ask decomposes into five layers. This spec covers **L0 + L1 only**; they are
inseparable (there is no health board without collection).

| Layer | Scope | Status |
|---|---|---|
| **L0** | Collection: install pings, client errors, script version, bot-quality events | **This spec** |
| **L1** | Cross-account install & health board | **This spec** |
| L2 | Live log stream / forensic drill-down for CS | Later spec |
| L3 | Proactive push alerts | Later spec |
| L4 | Customer-facing value proof | Already exists (`value_proof_summary`, `value-proof-refresh` cron) |

### Hard constraint

**Customers must take no action.** Verified in code: the embed snippet is always
`<script src="{origin}/widget.js" data-account-id="...">` with no version pin
([install/page.tsx:126](../../../src/app/install/page.tsx#L126)), and
[next.config.ts:171](../../../next.config.ts#L171) serves `/widget.js` with
`Cache-Control: public, max-age=0, must-revalidate`. Every widget change revalidates on the
next page load and reaches every embedded site automatically. Everything else in this design
is server-side. The one pre-existing exception: accounts that never pasted the snippet still
need someone to paste it — this system *detects* that, it does not introduce it.

---

## 2. Approaches Considered

**A — Beacon + nightly fact table (chosen).** Persist the `Origin` from `/api/widget/config`;
route client errors through the existing `widget_events` pipeline; add a manual contract
table and a nightly rollup into a durable daily health table.
*For:* history survives the 90-day purge; the board is one fast query; no new infrastructure —
it reuses the drain, the partitions, and the cron pattern already in production.
*Against:* one more cron, and up to 24h staleness — mitigated by overlaying the current day
live, exactly as [`summary.ts`](../../../src/lib/analytics/summary.ts) already does.

**B — Query-time only.** Add collection, compute the board on the fly via RPC.
*For:* less to build, always current. *Against:* dies with the 90-day retention. "When did
they drop off" is precisely the churn question, and this approach cannot answer it.

**C — External observability (Sentry / PostHog).** *For:* a log explorer and error grouping
for free. *Against:* another vendor, cost, PII exposure that collides with
[`gdpr/delete-data`](../../../src/app/api/gdpr/delete-data/route.ts) — and it still has no idea
who is paying us, so L1 would have to be built anyway. Remains a viable optional layer for
L2 error grouping; rejected as the foundation.

---

## 3. Data Model

Four tables: two new sources of truth, one existing table extended, one aggregate.

| Table | Role | Written by | Retention |
|---|---|---|---|
| `account_contracts` | Manual source of truth: who pays, what was sold | Admin, by hand | Forever |
| `install_pings` | Where we actually run | `/api/widget/config` | Forever (tiny) |
| `widget_events` (existing) | + new event types for client errors | Existing pipeline | 90 days |
| `account_health_daily` | Daily health snapshot per account | Nightly cron | Forever |

### 3.1 `account_contracts`

One row per **paying** customer. No row = not on the board — which makes the 44 demo
accounts disappear without having to repair the broken `isDemo` flag.

```
account_id        uuid  PK REFERENCES accounts(id)
is_paying         boolean NOT NULL DEFAULT true
expected_channels text[]  NOT NULL   -- 'widget' | 'chat_page' | 'whatsapp' | 'instagram'
contract_start    date
contract_end      date
trial_end         date
owner             text                -- internal CSM email
notes             text
created_at        timestamptz NOT NULL DEFAULT now()
updated_at        timestamptz NOT NULL DEFAULT now()
```

`expected_channels` is the checklist: the board flags a channel red only when it was sold and
is not working. Populated manually for the ~8 paying accounts — deliberately not inferred,
because inference from `config` is what produced the current mess.

### 3.2 `install_pings`

One row per **account + origin + day** — not per page view.

```
account_id      uuid NOT NULL
origin          text NOT NULL       -- scheme+host, from Origin header (Referer host fallback)
day             date NOT NULL
first_seen_at   timestamptz NOT NULL
last_seen_at    timestamptz NOT NULL
active_minutes  int  NOT NULL DEFAULT 1   -- see note below: NOT a page-view count
widget_version  text
sample_path     text                -- pathname only, no query string
UNIQUE (account_id, origin, day)
```

Write volume is bounded by `redisSetNx` with a 60s TTL: at most 1,440 upserts per day per
origin regardless of traffic. Correctness does not depend on Redis — the write is an UPSERT on
the unique key, so a Redis outage costs write volume, never data.

**`active_minutes` is deliberately not named `hits`.** Because of the 60s dedupe window it
counts *minutes in which the widget loaded at least once*, not page views — it saturates at
1,440 and tells us nothing about volume. It answers "how continuously were we live today",
which is the install question. Traffic volume comes from `widget_events.widget_loaded`, and the
board must never present this column as traffic.

### 3.3 `widget_events` — new event types

Client-side failures ride the existing pipeline (buffer → `widget-events-drain` → monthly
partitions → 90-day purge). No new infrastructure.

- `client_error` — a JS exception thrown by *our* script
- `config_load_failed` — `/api/widget/config` unreachable or non-OK
- `csp_blocked` — a resource our widget requested was blocked by the host page's CSP

Payload: `message` (truncated), first 3 stack frames, `filename`, `line`, `widget_version`,
`ua`. **Never** end-user message text.

`widget_version` is also stamped onto the existing `widget_loaded` payload (a one-line change
near [widget.js:541](../../../public/widget.js#L541)) so the rollup can break traffic down by
snippet version and spot customers stuck on stale code.

### 3.4 `account_health_daily`

What the board reads. Survives the `widget_events` purge, which is the whole point.

```
account_id       uuid NOT NULL
date             date NOT NULL
channel          text NOT NULL   -- 'widget' | 'chat_page' | 'whatsapp' | 'instagram'
status           text NOT NULL   -- the §5.2 derivation
active_minutes   int  NOT NULL DEFAULT 0
distinct_origins int  NOT NULL DEFAULT 0
loads            int  NOT NULL DEFAULT 0
opens            int  NOT NULL DEFAULT 0
messages         int  NOT NULL DEFAULT 0
sessions         int  NOT NULL DEFAULT 0
leads            int  NOT NULL DEFAULT 0
errors           int  NOT NULL DEFAULT 0
cost_usd         numeric(10,4) NOT NULL DEFAULT 0
computed_at      timestamptz NOT NULL DEFAULT now()
PRIMARY KEY (account_id, date, channel)
```

One row per account **per channel** per day, not one row per account — that is what lets a
customer show green on WhatsApp and red on the widget simultaneously, which is the normal case
and the whole reason the checklist is per-channel. Counters that do not apply to a channel stay
zero (`active_minutes` and `distinct_origins` are widget-only).

---

## 4. L0 — Collection

### 4.1 Install beacon

Inside `/api/widget/config`, **after the response is sent**, using `after()` from
`next/server` (already used in this repo, e.g.
[chat/init:151](../../../src/app/api/chat/init/route.ts#L151)) so it adds zero latency to the
request the customer's visitor is waiting on:

1. Read `Origin`; fall back to the host parsed out of `Referer`.
2. `redisSetNx('wping:{accountId}:{origin}:{yyyymmddhhmm}', 60)` — skip if the key exists.
3. Upsert `install_pings` on (`account_id`, `origin`, `day`): bump `hits`, refresh
   `last_seen_at`, record `widget_version` and `sample_path`.

### 4.2 Client-side error capture

Added to `public/widget.js`:

- A `report(kind, detail)` helper — fire-and-forget POST, capped at **5 reports per page
  load**, deduped in-memory by message hash so a render loop cannot flood us.
- `window.addEventListener('error')` and `unhandledrejection`, **filtered to our own script by
  filename**. This filter is not a nicety: without it we would collect the host page's
  exceptions — their code, and potentially their data.
- Explicit `report()` calls at the known swallow points: config fetch failure, chat fetch
  failure, CSP block, missing analytics token.

### 4.3 `/api/widget/diagnostics`

Deliberately **unauthenticated** — that is the entire point. When `/api/widget/config` fails,
the widget never receives an analytics token and therefore cannot report the failure through
the token-gated ingest. The most important failure to catch is exactly the one the existing
pipeline structurally cannot report.

Guards, since it is an unauthenticated write path:

- A dedicated narrow rate-limit bucket. The middleware currently grants `/api/widget/*` 200
  req/min ([middleware.ts:212](../../../middleware.ts#L212)) — far too generous here.
- `accountId` must exist in `accounts`; unknown ids are rejected, not stored.
- Payload capped at 2KB; message truncated; stack trimmed to 3 frames.
- No cookies, no localStorage, no user text.

Rows land in `widget_events` with the types from §3.3.

### 4.4 Bot-quality events (open work)

Retrieval fallbacks exist in [`complaint-classifier.ts`](../../../src/lib/chatbot/complaint-classifier.ts)
and [`knowledge-retrieval.ts`](../../../src/lib/chatbot/knowledge-retrieval.ts), but those are
*retrieval* degradations — the bot still answers something reasonable. The real list of "the
bot gave up here" requires a pass through `sandwich-bot-hybrid.ts`.

**This is an explicit task in the implementation plan, not a guess in this spec.** The
deliverable is an enumerated list of give-up sites, each emitting an `events` row
(`bot_no_answer`) with the account, surface, and reason. The schema above is unaffected by
what that pass finds.

---

## 5. L1 — Health Board

### 5.1 Rollup

Cron `account-health-rollup` at `15 3 * * *` — after `analytics-rollup` (`0 3 * * *`) so it
reads settled data. It iterates only accounts with an `account_contracts` row, joins
`install_pings` · `widget_events` · `events` · `chat_sessions` · `whatsapp_cs_sessions` ·
`cost_tracking`, and writes `account_health_daily`. Idempotent per (account, day) — safe to
re-run.

The current day is overlaid live from the raw tables at read time, the same technique
[`summary.ts`](../../../src/lib/analytics/summary.ts) already uses, so the board never looks
stale.

### 5.2 Status derivation

A **pure function** — `deriveChannelStatus(channel, facts, thresholds) → status` — kept free of
I/O specifically so it can be exhaustively table-tested.

| Status | Condition | Meaning |
|---|---|---|
| ⚪ `never_installed` | no ping, ever | Sold and never pasted — make the call |
| 🟢 `live` | ping within 24h | Healthy |
| 🔴 `silent` | previously pinged, nothing for 3 days | Removed from the site, or the site is down |
| 🟡 `dormant` | pinging, but zero opens for 7 days | Displayed and untouched — the LA BEAUTÉ case |
| 🟠 `erroring` | ≥20 client errors in 24h **and** errors on ≥5% of loads | Broken at the customer and nobody knows |

`erroring` needs both halves of its condition: a raw count alone drowns a high-traffic account
in noise, a ratio alone fires on 1-error-out-of-3 days.

**Precedence, since a channel can satisfy several conditions at once** — evaluated in this
order, first match wins:

```
never_installed → silent → erroring → dormant → live
```

Absence beats brokenness (there is nothing to fix if it was never installed), and brokenness
beats disuse (`erroring` is very often the *cause* of `dormant` — LA BEAUTÉ's 0.3% open rate is
the leading hypothesis for exactly this, and surfacing it as "dormant" would hide the reason).

Thresholds (24h / 3d / 7d / 20 errors / 5%) are configuration, not constants baked into the
logic.

### 5.3 UI

New page `/admin/health`. One row per paying customer; one chip per **sold** channel; then
last-seen, 14-day trend, open rate, 7-day errors, contract/trial end, and cost. Sorted by
risk, worst first.

Expanding a row reveals: which origins and paths we actually run on, the script-version
breakdown, and recent errors with message and stack.

---

## 6. Failure Modes

| Failure | Behaviour |
|---|---|
| Redis unavailable | Writes go straight through; the UPSERT is idempotent; no data loss, only volume |
| Widget error loop | 5-per-page-load cap plus message-hash dedupe |
| Diagnostics endpoint abused | Narrow rate limit + `accountId` existence check + 2KB cap |
| Rollup cron fails | Idempotent per day, re-runnable; existing [`health-alerts`](../../../src/app/api/cron/health-alerts/route.ts) raises the alarm |
| PostgREST 1000-row cap | All aggregation happens in Postgres RPCs — the bug that silently truncated counts for high-volume accounts before |

---

## 7. Privacy

`install_pings` holds domains — a business fact about our customer, not personal data about
their visitors. Diagnostics rows carry no token and therefore no `anon_id`, and we never write
end-user message text into them. On that analysis
[`gdpr/delete-data`](../../../src/app/api/gdpr/delete-data/route.ts) needs no change — **to be
verified against the route during implementation rather than assumed from this spec.**

---

## 8. Testing

TDD throughout. Run with `npx vitest run` — `npm run test` enters watch mode and hangs.

- `deriveChannelStatus` — table-driven across every transition, including the awkward cases:
  installed today, contract ended yesterday, a channel sold and never pinged once.
- Ping dedupe and UPSERT idempotency, including the Redis-unavailable path.
- Diagnostics payload sanitizer: truncation, stack trimming, rejection of unknown accounts,
  and the guarantee that no user text survives.
- Rollup idempotency: running the same day twice yields one row and identical numbers.

No E2E. Final verification is manual: confirm a real ping from a real customer domain.

---

## 9. Rollout Order

This order is load-bearing, not bureaucracy.

1. Migrations.
2. Deploy **collection only** — silent, no screen.
3. Backfill in parallel: seed install history from the 90 days of `widget_loaded` already in
   `widget_events`, so the board is not born empty.
4. Fill `account_contracts` by hand for the ~8 paying accounts.
5. Ship the board.

Migration 057 in this repo carries an explicit warning about exactly this hazard: applying it
before its pipeline had data would have blanked the dashboard. A board that launches all-red
loses trust on day one and nobody opens it again.

---

## 10. Out of Scope

- L2 (live log stream), L3 (push alerts) — separate specs.
- L4 value proof — already exists.
- Customer-facing surfaces. This board is admin-only.
- Repairing `accounts.plan` / `config.isDemo`. `account_contracts` supersedes them for this
  purpose; a wider cleanup is its own task.
