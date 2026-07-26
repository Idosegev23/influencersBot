# Value-Proof Report — Argania & Studio Pasha

**Measured:** 2026-07-26 · **Accounts:** Argania `c68ef2bd` (live since 2026-03-05), Studio Pasha `36705ad6` (live since 2026-06-08)
**Against:** Yoav Bogin's 10-metric list, 2026-07-24
**Method:** every number below comes from production data (`brand_orders`, `chat_sessions`, `chat_messages`, `support_requests`, `widget_*`) or a live QuickShop API pull. Nothing is modeled or estimated. Metrics with no data source say **NOT MEASURED** — they do not say zero.

---

## Scoreboard

| # | Metric | Argania | Studio Pasha |
|---|---|---|---|
| 1 | Revenue in conversations | **₪26,899** / 161 orders | **₪2,713** / 17 orders |
| 2 | Conversation conversion rate | **9.5%** (161 / 1,703) | **22.4%** (17 / 76) ⚠ n small |
| 3 | AOV with vs without chat | **−4.8%** (₪165.0 vs ₪173.3) | **−21.2%** (₪159.6 vs ₪202.5) ⚠ n=17 |
| 4 | Abandoned carts recovered | 21.1% recovered; **Bestie touched 20 of them** | 33.1% recovered; **Bestie touched 0** |
| 5 | Deflection | **82.0%** (1,487 / 1,813); ₪ NOT MEASURED | **87.0%** (100 / 115); ₪ NOT MEASURED |
| 6 | Time to first response / to close | first response **NOT MEASURED**; close median **55.9h** | first response **NOT MEASURED**; close **NOT MEASURED** (0 resolved) |
| 7 | Escalation rate | bot gave up **0.2%**; any human touch **25.0%**; reasons **NOT MEASURED** | **2.6%** / **20.0%**; reasons **NOT MEASURED** |
| 8 | Answer accuracy | **NOT MEASURED** — no sampling process exists | **NOT MEASURED** |
| 9 | Setup time | **1 day** to first answered message; staff-hours NOT MEASURED | **0 days**; staff-hours NOT MEASURED |
| 10 | Client's own usage | **NOT MEASURED** — no login/visit log exists | **NOT MEASURED** |

**Four of ten are fully measured. Three are partially measured. Three cannot be measured at all today.**

---

## Baseline volumes

| | Argania | Studio Pasha |
|---|---|---|
| Orders on record | 26,060 (2026-01-07 → 2026-07-26) | 6,023 (2025-07-30 → 2026-07-26) |
| Total revenue | ₪4,194,150 | ₪1,425,145 |
| AOV (all orders, all time) | ₪160.9 | ₪236.6 |
| Conversations (≥1 user message) | 1,813 | 115 |
| Support tickets | 453 (386 resolved) | 23 (0 resolved) |
| Abandoned carts | 7,993 · ₪2,297,225 at risk | 6,423 · ₪2,643,296 at risk |

---

## 1. Revenue generated inside conversations

Attribution is reported in three separate tiers. They are never summed into a single headline without this breakdown, because each tier means something different.

| Tier | What it proves | Argania | Pasha |
|---|---|---|---|
| `direct` — order carries `utm_source=bestie` | The bot produced the click that led to the order | **149 orders · ₪24,579 · AOV ₪165.0** (since 2026-06-12) | **17 orders · ₪2,713 · AOV ₪159.6** (since 2026-07-23) |
| `influenced` — customer's phone/email touched a conversation ≤7d before ordering | Bestie was in the loop, not necessarily the cause | **12 orders · ₪2,320 · AOV ₪193.3** | 0 |
| `assisted` — same `anon_id` conversed then ordered ≤24h | Talked, then bought without clicking a bot link | **NOT MEASURED** | **NOT MEASURED** |

**Why `assisted` is empty:** it needs the visitor's anonymous id to appear on the order, which requires the Bestie snippet to fire on the store's thank-you page. Every widget page-view we have recorded on Argania is `/`, `/products`, `/product/…`, `/pages/…`, `/shops/argania` — **no checkout or thank-you path at all**. The most valuable version of this metric is the one we currently cannot see.

**A trap that was caught while measuring:** the naive `influenced` match returned 132 orders for Argania. 120 of them had `total = ₪0` and 122 carried `utm_source=pos` — in-store/point-of-sale and replacement records, not sales. Counting them would have inflated the order count 11× while adding ₪0 of revenue. The tier excludes ₪0 and POS orders.

## 2. Conversation conversion rate

- **Argania: 9.5%** — 161 attributed orders against 1,703 conversations in the matched window (from 2026-06-12).
- **Pasha: 22.4%** — 17 against 76 conversations (from 2026-07-23). n is small; treat as directional only.

**Caveat that matters:** numerator and denominator come from different sources. A `direct` order proves a click but does not require a recorded chat session, and widget session recording only began 2026-07-06. So this ratio is a reasonable order of magnitude, not a precise rate.

## 3. AOV with chat vs without

Compared inside the same window in which Bestie was live, so the effect measured is Bestie's and not the campaign calendar's.

| | Bestie orders | All other orders | Delta |
|---|---|---|---|
| Argania (from 2026-06-12) | ₪165.0 (n=149) | ₪173.3 (n=8,996) | **−4.8%** |
| Pasha (from 2026-07-23) | ₪159.6 (n=17) | ₪202.5 (n=26) | **−21.2%** |

**The upsell claim does not hold on this data — it currently trends the other way.** Argania's −4.8% is small enough to be noise; Pasha's −21.2% rests on 17 orders and cannot carry weight either. But neither points up.

Worth knowing: an earlier read of this compared bestie AOV against **all-time** site AOV and produced **+2.5%** for Argania. That comparison was invalid — the Bestie window starts 2026-06-12. The flattering number is the one you get by default here, which is why the build enforces period-matched comparison in code.

## 4. Abandoned carts recovered

QuickShop's `/abandoned-carts` endpoint returns 7,993 carts for Argania and 6,423 for Pasha. **`recovered_at` is null on all 14,416 rows and `reminder_count ≥ 1` on 99.9% of them** — the endpoint appears to serve only unrecovered carts. So the platform's own recovery baseline is **not obtainable from the API**, contrary to what the design assumed.

Recovery was therefore derived independently: a cart counts as recovered if the same email placed a paid, non-POS order after the cart was created.

| Window | Argania | Pasha |
|---|---|---|
| ≤24h | 10.9% (864 carts, ₪249,673) | 28.2% (1,809, ₪741,906) |
| **≤7d** | **21.1% (1,676, ₪507,356)** | **33.1% (2,123, ₪856,675)** |
| ≤30d | 29.1% (2,313, ₪695,058) | 38.1% (2,443, ₪1,011,599) |

**Bestie's share of that: 20 recovered carts on Argania, 0 on Pasha.** Roughly 1% of Argania's recovered carts had a Bestie touch near the abandonment. QuickShop's own reminder emails go to essentially every cart, so the recovery above is the platform's, not ours.

This is the metric Yoav called the easiest to explain and the easiest to prove. Right now it proves that **Bestie is not yet in the cart-recovery loop at all** — which is an opportunity, not a result.

## 5. Deflection — closed without a human

| | Argania | Pasha |
|---|---|---|
| Conversations | 1,813 | 115 |
| Produced a support ticket | 326 | 15 |
| **Closed with no human** | **1,487 = 82.0%** | **100 = 87.0%** |

**In ₪: NOT MEASURED.** Cost per ticket has no source in any API and must come from the brands. Once supplied, Argania's 1,487 deflections multiply directly against it.

**Upper bound, not exact:** `chat_handoffs` has 0 rows because the handoff/takeover feature was never built. Any conversation a human quietly picked up outside the ticket flow is currently counted as deflected.

## 6. Time to first response and time to close

**First response: NOT MEASURED, and this is a real instrumentation gap.** `chat_messages` timestamps are *write* times, not send times: of 1,354 Argania sessions with a user→assistant pair, **1,022 (75%) show the assistant message written less than one second after the user's** — impossible for a real model response. The remaining spread (30s–548s) is most likely later turns, not latency. Bot response latency needs explicit instrumentation before any number here is honest.

**Time to close** (ticket created → resolved) is real:

| | Argania | Pasha |
|---|---|---|
| Resolved tickets | 386 | **0** |
| Mean | 91.4h | — |
| **Median** | **55.9h** | — |

Pasha has resolved no tickets since going live on 2026-06-08 — 23 open. That is an operational finding about the brand, not about Bestie.

**Pre-Bestie baseline: not available.** No response-time data exists from before Bestie for either brand, and the API cannot produce it.

## 7. Escalation rate — and on what

| | Argania | Pasha |
|---|---|---|
| Bot explicitly gave up (`auto_escalation`) | 4 = **0.2%** | 3 = **2.6%** |
| Any human touch (any ticket) | 453 = **25.0%** | 23 = **20.0%** |

Ticket sources — Argania: 220 legacy/unlabelled, 124 `widget_support_urgent`, 98 `widget_support`, 7 `whatsapp_cs`, 4 `auto_escalation`. Pasha: 9 `widget_support`, 8 urgent, 3 `auto_escalation`, 2 `whatsapp_cs`, 1 `widget_lead`.

**"On what" — NOT MEASURED.** The escalation detector classifies a reason at runtime and then discards it; `support_requests` has no reason column. Yoav called this the honesty metric and the most precise map of where to invest development. It is currently the least instrumented of the ten.

## 8. Answer accuracy

**NOT MEASURED.** No sampling process, rubric, or rating surface exists. The only signal in the database is `widget_message_feedback` — 21 volunteered thumb ratings across both accounts since 2026-06-10, which is self-selected feedback, not a sample of 100. Transcripts are all present in `chat_messages`, so the measurement is possible; the process is what's missing. Deliberately scoped out of the current build as a separate project.

## 9. Setup time

| | Argania | Pasha |
|---|---|---|
| Account created | 2026-03-04 | 2026-06-08 |
| First answered message | 2026-03-05 | 2026-06-08 |
| **Elapsed** | **1 day** | **0 days** |

**Staff-hours: NOT MEASURED** — never recorded anywhere. This is the half of metric 9 that decides whether Bestie is a product or a service, and it is the half we have no record of.

## 10. Client's own usage

**NOT MEASURED.** No login, session, or page-view log exists for brand users. There is no way to answer "how many times a week does someone from Argania open the system" from current data. Zero collection, not zero usage.

---

## What this report does not say

1. It does not say Bestie generated ₪26,899 of *incremental* revenue for Argania. It says ₪26,899 of orders are attributable to a Bestie touch. Some of those customers would have bought anyway; nothing here separates the two.
2. It does not say Bestie recovered carts. On Argania it touched 20 of 1,676 recovered carts; on Pasha, none.
3. It does not say the bot answers in N seconds. That number is not currently measurable.
4. It does not say the bot is accurate. That has not been measured at all.
5. Every percentage on Pasha rests on n ≤ 76 and several on n = 17.

## The three things that would change the picture most

1. **Get the Bestie snippet onto the QuickShop thank-you page.** It unlocks the `assisted` tier — the "talked, then bought" number that is the actual claim, and the only one currently invisible.
2. **Persist the escalation reason** (one column, the classifier already runs). It converts metric 7 from a bare rate into the development map Yoav described.
3. **Instrument real response latency.** One timestamp at send time turns metric 6 from unmeasurable into the metric with the most dramatic and least-measured improvement.

## Sources

- `brand_orders` — 32,083 rows pulled 2026-07-26 (26,060 Argania + 6,023 Pasha)
- QuickShop `GET /api/v1/abandoned-carts` — 14,416 rows, full pagination, both stores
- QuickShop `GET /api/v1/analytics` — shop-level 30-day totals (Argania: 2,126 orders, ₪294,976, AOV ₪138.75)
- `chat_sessions` / `chat_messages` / `widget_sessions` / `widget_events` / `support_requests` / `chat_handoffs` / `chat_leads` / `widget_message_feedback`
- Design spec: `docs/superpowers/specs/2026-07-26-value-proof-metrics-design.md`
