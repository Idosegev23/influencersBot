# Bestie in the Dashboard — Design Spec (Surface B)

**Date:** 2026-07-26
**Author:** Ido + Claude
**Status:** Approved (design), pending implementation plan
**Area:** Brand-facing assistant inside `/influencer/[username]/*`

**Supersedes** §8 of [2026-07-26-bestie-of-bestie-design.md](2026-07-26-bestie-of-bestie-design.md), which scoped this surface to guidance only.

---

## 1. Context & Problem

The dashboard is where the value goes to die.

There are 66 active accounts, 4,754 conversations and 2,131 support tickets in the system. The
analytics screen holds real findings — 82% of Argania's conversations closed without a human, and a
ranked list of what customers actually ask about. Almost none of it is ever read. The value-proof
report could not even measure metric 10, "the client's own usage", because **no login or visit log
exists** — there is no way to know how often a brand opens the product they pay for.

Meanwhile the same brands have no one to ask inside the product. "Where do I change the bot's
personality?" becomes a WhatsApp message to Ido.

The original design answered only the second problem: a help widget that says where to click. That
serves whoever already showed up. This spec expands it to the first problem too — an assistant that
**reads the account and says something worth coming back for.**

## 2. Scope

**In scope — four capabilities, one brain, zero writes:**

| Capability | What it does |
|---|---|
| **Guidance** | Where to click, which screen, which button. Uses the 25 screen entries from Phase 1. |
| **Account narration** | What changed this week, from this account's own conversations and tickets. |
| **Knowledge gaps** | Questions the bot failed to answer, grouped by topic, with a drafted answer and a link to where it goes. |
| **Health check** | Expired coupons still live, Instagram disconnected, empty catalog, tickets stale for days. |

**Out of scope**

- **Writing anything.** Not knowledge, not settings, not content. Bestie shows and points; the human
  acts. See §4.
- **Ghost-writing** persona text, welcome messages, or product descriptions. Considered and dropped.
- **Any delivery outside the widget** — no WhatsApp digest, no email, no in-product badge. See §7.
- The internal `/admin/*` screens.

## 3. Decisions

| Decision | Choice |
|---|---|
| Capabilities | Guidance + narration + knowledge gaps + health check |
| Writes | **None.** Points at everything, including knowledge. |
| Delivery | **Widget only.** No push, no badge. |
| Location | The brand's dashboard, `/influencer/[username]/*` |
| Context | Authenticated account **and the screen they are on right now** |

### 3.1 Accepted risks

**Pointing rather than writing weakens the knowledge-gap loop.** "14 people asked about returns —
go to bot content and add it" is a to-do item, and to-do items join everything else nobody does. The
value was in Bestie closing the loop herself. Ido chose pointing for every capability, so the design
compensates by making the hand-off as close to frictionless as it can be without writing: the full
drafted text on screen, one-tap copy, and a deep link to the exact screen and field. See §5.3.

**Widget-only delivery means the insights reach only those who log in — which is the problem this
surface exists to solve.** Nothing here reaches a brand that never opens the dashboard. The
infrastructure to push (`/api/cron/weekly-digest`, the `influencer_weekly_digest_v2` template)
already exists and is deliberately not used. Ido's call; recorded so a later "why does nobody see
this?" has an answer.

## 4. The boundary, restated

Phase 1 set the rule: *Bestie knows the product's surface, not its engine.* This surface extends it
by exactly one clause:

> Bestie knows the product's **surface**, plus **this one account's own data**.
> She does not know any other account's data, and she does not know the engine.

"Their own data" is not a hole in the original boundary — it is theirs, and they are authenticated.
What it does introduce is a failure mode the lead funnel never had: **cross-account leakage.**

### 4.1 Account scoping is structural, not prompted

Every read tool is scoped by an `accountId` taken from the **authenticated session** and injected
into the tool context by the server.

**No tool accepts `accountId`, `username`, or any other account selector as a parameter.**

This is the single most important implementation constraint in this spec. If the model can express
"read account X", then one prompt injection in a customer conversation — text the brand's own
customers wrote, which Bestie will be summarising — can read another brand's data. Making the
parameter absent means the request cannot be formed at all. A system-prompt instruction not to do it
is not equivalent and is not acceptable here.

Verified with two real accounts in the same test, not asserted in review.

## 5. The four capabilities

### 5.1 Guidance

Unchanged from the original design and already supported: the 25 screen entries in
`content/bestie-kb/` carry route, purpose, and button names. `route_to_screen` returns a route plus
the section and button, and the route is validated against the real route tree before it is emitted
(`listCustomerScreens` / `findDeadRoutes`, built in Phase 1).

Knowing the current screen is what makes this feel different from documentation. "The switch you
want is on this screen, second tab" beats "go to bot settings" — same fact, a different product.

### 5.2 Account narration

Reads this account's conversations, tickets and widget activity and says what changed. Volume, what
customers asked about most, what moved relative to the previous period, and what the bot could not
handle.

The point is not a dashboard rendered as prose. It is the two or three things that are **different
this week**, because that is what a person would have noticed if they had looked.

### 5.3 Knowledge gaps

The capability with the highest ceiling, because Bestie is the only party who knows where she
failed.

Sources of a gap, all already in the database: conversations that produced a support ticket,
conversations that hit `auto_escalation`, and answers where the bot said it did not know.

The flow: group failures into topics, show how many customers hit each one, draft the answer that
would have worked, and hand it over — full text, one-tap copy, deep link to the field it belongs in.

**She does not write it.** §3.1 covers why, and why the friction reduction above is the design's
response to that constraint.

### 5.4 Health check

A short audit of things that are silently wrong: coupons past their end date still offered,
Instagram disconnected, an empty product catalog, documents that failed to parse, tickets sitting
unanswered for days.

Cheap to build and useful from the first day, because it needs no history — only the current state.

## 6. Architecture

The widget mounts inside the brand dashboard and posts to an authenticated endpoint. The server
resolves the account from the session (`requireInfluencerAuth` / `requireAccountAccess` in
`src/lib/auth/`), builds the tool context, and runs the existing brain.

`runBestieTurn` (Phase 2) is reused unchanged in shape. What differs is the tool set and the context
digest — the lead funnel's brain talks to a stranger it must qualify; this one talks to a known
customer it must inform.

| | Lead funnel (Phase 2) | Dashboard (this spec) |
|---|---|---|
| Who is speaking | A stranger, identified by phone | An authenticated account |
| Context injected | Form fields, what has been learned | Account, plan, **current screen** |
| Tools | knowledge, note detail, handoff | knowledge, `route_to_screen`, `read_account_pulse`, `find_knowledge_gaps`, `run_health_check` |
| Writes | Qualification only | **None** |

All five tools are read-only. There is no write path in this surface at all — a property worth
asserting in a test rather than maintaining by discipline.

### 6.1 Reused from Phase 1

- The knowledge base — 32 entries, 25 of them screens with routes.
- `listCustomerScreens` / `findDeadRoutes` — link validation.
- `findRedactionViolations` — still applies to anything drawn from the knowledge base.
- `runBestieTurn` — the loop, the iteration bound, the tool-result plumbing.

## 7. What is deliberately absent

No WhatsApp digest. No email. No badge or unread indicator. Nothing leaves the widget.

This is recorded because the infrastructure exists and the omission will look like an oversight
later: `/api/cron/weekly-digest` is scheduled and `sendInfluencerWeeklyDigest` is written. Both are
available the day the decision changes.

## 8. Acceptance

1. **No cross-account read.** With two real accounts live in the same test, neither can surface the
   other's conversations, tickets or metrics — and no tool exposes an account selector to the model.
2. **Every emitted link resolves.** Routes are asserted against the real route tree; a link to a
   deleted screen fails the build, not the customer.
3. **No write path exists.** No tool mutates any table. Asserted, not assumed.
4. **Knowledge gaps are real.** Every gap traces to actual failed conversations for that account —
   never invented, never borrowed from another account.
5. **The boundary holds.** Questions about other clients or how the system is built are refused.
6. **Health checks are true.** Each finding is reproducible from current account state.

## 9. Open

**Where does an escalation from this surface go?** The lead funnel emails five salespeople. A brand
stuck inside the product is not a sales lead and must not land in that inbox. This needs a
destination — a support ticket on their own account, a different recipient list, or the existing
handoff flow — and it is the one decision still outstanding. It does not block the plan's early
tasks, but it does block shipping.

---

Related: [Bestie of Bestie](2026-07-26-bestie-of-bestie-design.md) (the core and the lead funnel),
[value-proof metrics](2026-07-26-value-proof-metrics-design.md) (the measurement work that supplies
much of what §5.2 narrates).
