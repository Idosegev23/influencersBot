# Demo Expiry & Usage Visibility — Design

**Date:** 2026-08-18
**Author:** Ido + Claude
**Status:** Approved (design), pending implementation plan
**Area:** Demo lifecycle — public demo surfaces, sales notifications

Follows on from [2026-08-12-widget-demo-link-on-scan-design.md](2026-08-12-widget-demo-link-on-scan-design.md),
which made demo-scan completion send both demo links. This spec gives those links a life span
and makes the team see what happens inside them.

---

## 1. Context & Problem

When a demo scan finishes, `sendDemoReady` WhatsApps the team two URL buttons:
`/chat/<username>` and `/demo/<accountId>`. Both are **completely unauthenticated**, by design
and in writing:

- `src/app/demo/[id]/page.tsx:8-12` — *"Public Demo Page … No auth required. Sharable link for clients."*
- `src/app/api/influencer/profile/route.ts:12-15` — *"Unauthenticated on purpose: the public chat page renders for anonymous visitors."*

`config.isDemo` controls scan depth and cron participation only. It grants nothing and blocks
nothing. The result is two problems:

1. **A demo never ends.** A prospect plays with a full-fidelity product forever and never has a
   reason to call us back. The link also outlives the sales conversation it was made for.
2. **A demo is invisible.** Sessions and messages are written to `chat_sessions` / `chat_messages`,
   but nobody on the sales side ever sees them. We cannot tell an opened demo from an ignored one,
   and we never learn what the bot actually answered a brand we are trying to close.

## 2. Goals

- A demo scanned from now on stays open for **7 days**, then locks behind a "talk to LDRS" screen.
- The remaining time is visible to the visitor while the demo is live.
- Pressing the lock screen's single button produces a **hot lead** to the five sales recipients,
  carrying the prospect's own demo transcripts.
- The team gets **WhatsApp at the moments that matter** and a **daily email with full transcripts**.

## 3. Non-Goals

Explicitly out of scope, and why:

- **Signed/HMAC demo links, `noindex`, guessable-`accountId` hardening.** Real gaps (`/chat` and
  `/demo` are absent from `robots.ts` `PRIVATE_PATHS`), but not what was asked. Server-side locking
  covers the business need. Tracked separately.
- **Retroactive expiry.** Existing demo accounts stay open forever — see §4.3.
- **Any change to paying accounts.** Danielle, Argania, Meuhedet, Studio Pasha, Hamania and every
  other live account must be provably unaffected.
- **Self-serve renewal or payment.** The lock screen produces a lead; a human closes it.

---

## 4. Design

### 4.1 State: a new `config.demo` object

```jsonc
accounts.config.demo = {
  "starts_at":     "2026-08-18T09:14:00Z",  // scan completion
  "ends_at":       "2026-08-25T09:14:00Z",  // starts_at + 7d, never rewritten
  "extended_to":   null,                    // admin "extend a week" writes here
                                            // effective end = extended_to ?? ends_at
  "first_open_at": null,                    // stamped once by the watch cron
  "first_chat_at": null,                    // stamped once by the watch cron
  "locked_at":     null,                    // stamped once by the watch cron
  "lead_sent_at":  null                     // stamped when the contact form is submitted
}
```

**Why not reuse `config.trial`.** The existing trial object is tempting — it already carries
`starts_at` / `ends_at` and has a working reminder cron. It must not be reused. The
`trial-reminders` cron selects `.not('config->trial','is',null)`
(`src/app/api/cron/trial-reminders/route.ts:49`) and WhatsApps the account contact *"תקופת הנסיון
החינמית … מסתיימת"*. Writing `trial` onto every demo account would send subscription-renewal
notices to prospects who never bought anything. Two objects, no overlap, no shared cron.

### 4.2 Where it is written

`src/lib/pipeline/steps/finalize.ts`, in the same read-modify-write MERGE block that already
registers `widget.domain` and `widget.coverImage`. Guarded on `config.isDemo === true`.

The write is **create-only**: if `config.demo` already exists it is left alone, so a re-scan of a
demo account cannot silently restart or extend its clock. (Re-scans reverting config is a known
recurring hazard in this repo — see the Lenovo and Studio Pasha notes.)

### 4.3 Absence means open

`resolveDemoAccess` returns `open` for any account without `config.demo`. This single rule is what
makes the feature safe to deploy:

- Every existing demo (Inter Miami, Lenovo, Meuhedet, Bara, TerminalX, …) has no `config.demo` and
  stays open — Ido's explicit decision, so no in-flight sales conversation breaks on deploy day.
- Every paying customer has no `config.demo` and can never be locked, regardless of any bug in the
  date arithmetic.

### 4.4 Clock start — decision

`starts_at` = **scan completion**, not first open.

Rationale: it is deterministic, it matches the moment the WhatsApp link is sent, and it cannot leave
an unopened demo alive indefinitely. The cost is the case where a prospect opens the link on day 6
and gets one day — which is exactly what the admin **extend** button (§4.9) is for.

This is a one-line change if it proves wrong in practice.

### 4.5 Enforcement: one pure function, two layers

```ts
// src/lib/demo/access.ts
export type DemoState = 'open' | 'expiring' | 'locked';
export interface DemoAccess {
  state: DemoState;
  endsAt: string | null;   // ISO, null when not a timed demo
  daysLeft: number | null; // ceil, null when not a timed demo
}
export function resolveDemoAccess(account: { config?: any }, now?: Date): DemoAccess;
```

Rules: no `config.demo` → `open` with nulls. `now >= ends_at` (honouring `extended_to`) → `locked`.
Within 2 days of `ends_at` → `expiring`. Otherwise `open`.

**Layer 1 — UI.** `src/app/chat/[username]/layout.tsx` is already a server component that fetches
the account for `generateMetadata`; it renders the lock screen instead of `children` when locked.
`/demo/[id]` is a client component, so `/api/widget/config` carries `demo: { state, daysLeft, endsAt }`
and the page renders the same lock component.

**Layer 2 — API.** These return **403 `{ error: 'demo_expired' }`**:

| Route | Surface |
|---|---|
| `/api/chat/stream` | chat page (streaming path) |
| `/api/chat/sandwich` | chat page (non-streaming path) |
| `/api/chat/init` | chat page session bootstrap |
| `/api/widget/chat` | widget |
| `/api/widget/preview/[accountId]` | demo page site proxy |

Both layers are required. Without layer 2 the lock is decoration — anyone with devtools keeps
talking to the bot. Without layer 1 there is no sales screen. Each route already resolves its
account; the guard is one call to `resolveDemoAccess` on the object it already has.

`/api/influencer/profile` is deliberately **not** blocked: the lock screen itself needs the brand
name and avatar to render. It already runs through `sanitizeInfluencerForClient`.

### 4.6 What the visitor sees

**While open (`expiring` or `open` with a `config.demo`)** — a slim bar at the top of the chat page
and the demo page: `נותרו 5 ימים להתנסות`. In `expiring` state it turns amber. Not shown at all for
accounts without `config.demo`, so no paying customer ever sees a countdown.

**When locked** — the surface is replaced by `<DemoLockedScreen>`: the scanned brand's cover/avatar,
"ההתנסות שלך ב-Bestie הסתיימה", a one-line reminder of what they saw, and a single button —
**צרו איתי קשר**. No dismiss, no X, no way back. Bestie purple, per the rule that `/chat/*` is
Bestie's surface and not the account's brand colour.

### 4.7 The hot lead

The button opens a form: name · brand · phone · email · free-text message. On submit,
`POST /api/demo/lead`:

1. Inserts a `support_requests` row with `source: 'demo_expired_lead'`. The `source` column has no
   check constraint (only `status` does), so a new value is safe.
2. Stamps `config.demo.lead_sent_at` — the form is submit-once per demo; a second submit returns
   the thank-you state without re-notifying.
3. **Email to all five** via the existing `SALES_RECIPIENTS` in `src/lib/bestie/handoff-email.ts:13`
   (kfir, roei, itamar, cto, yoav). That list is pinned in code rather than env precisely so leads
   cannot be redirected into an unwatched inbox; this spec does not touch it.
4. **WhatsApp to the three team members whose numbers are verified** — Kfir, Yoav, Ido — via the
   approved `support_freeform_message` template, params sanitized for Meta error 132018. The numbers
   are not inlined here; they come from the same source `SCAN_NOTIFY_RECIPIENTS` already uses.
5. The email carries **the full transcript of that demo's week** — the prospect already told the bot
   what they need, and whoever calls them should not make them repeat it.

**Open item:** Itamar's and Roei's WhatsApp numbers are unknown. `ITAMAR_WHATSAPP_NUMBER` currently
holds Ido's number, so a send "to Itamar" reaches Ido. Until real numbers are supplied, WhatsApp
reaches three people and email reaches five. Adding them later is a constant change.

### 4.8 Usage visibility

**`/api/cron/demo-watch`, every 15 minutes.** Sweeps accounts with `config.demo` and no `locked_at`,
joins `chat_sessions` / `chat_messages` by `account_id`, and fires each moment **once**, stamped into
`config.demo` so a crash or a re-run cannot double-send:

| Trigger | Stamp | WhatsApp |
|---|---|---|
| First `chat_sessions` row ever | `first_open_at` | `🟡 הדמו של <brand> נפתח לראשונה` |
| First session reaching 3+ **user** messages | `first_chat_at` | `🟢 <brand> משוחח עם הבוט — N הודעות עד כה` |
| `now >= ends_at` | `locked_at` | `⏳ הדמו של <brand> ננעל. עכשיו הכדור אצלנו.` |

Deliberately a cron and not an inline hook in the chat path: adding a WhatsApp send inside a live
chat request adds latency to a prospect's reply and gives a Meta API failure a way to break it.
Locking itself needs no cron — `resolveDemoAccess` derives it from `ends_at` — the cron only
*notifies* and stamps.

**`/api/cron/demo-digest`, daily 08:00 Israel (`0 5 * * *` UTC).** One email to the five, covering
every account with an unlocked `config.demo`: sessions, messages, time on page, days remaining, and
then the **verbatim transcripts** of the last 24 hours — what they asked, what the bot answered.
This doubles as the only mechanism by which we would notice the bot answering badly on a brand we
are mid-negotiation with.

Both crons authenticate with `CRON_SECRET` bearer, matching every other cron in `vercel.json`.
Two new entries brings the project to 35 crons; Vercel Pro allows 40, so this fits but the headroom
is worth noting.

### 4.9 Admin

`/admin/accounts` gains a days-remaining indicator on demo rows and an **הארך בשבוע** action writing
`config.demo.extended_to`. Sales reality: a meeting lands on day 9 and the demo cannot die on day 7.
Extending a locked demo also clears `locked_at`, so the lock notification can fire again on the new
end date.

---

## 5. Data Flow

```
demo scan finishes
  └─ finalize.ts writes config.demo (isDemo only, create-only)
       │
       ├─ visitor opens link ──► layout/API call resolveDemoAccess
       │                            ├─ open      → countdown bar + normal chat
       │                            ├─ expiring  → amber countdown + normal chat
       │                            └─ locked    → DemoLockedScreen, APIs 403
       │
       ├─ cron/demo-watch (*/15) ──► first_open / first_chat / locked → WhatsApp ×3
       │
       ├─ cron/demo-digest (daily) ─► transcripts + counters → email ×5
       │
       └─ "צרו איתי קשר" ──► /api/demo/lead
                                ├─ support_requests row (demo_expired_lead)
                                ├─ email ×5  (SALES_RECIPIENTS + transcripts)
                                └─ WhatsApp ×3 (support_freeform_message)
```

## 6. Error Handling

- **`resolveDemoAccess` never throws.** A malformed or partial `config.demo` resolves to `open`.
  Failing open is correct here: the worst case of a bug is a demo that outlives its week, versus a
  paying customer's chat page replaced by a sales screen.
- **Lead delivery is not all-or-nothing.** The `support_requests` row is written first and the email
  and WhatsApp sends are independent; a Meta outage cannot lose the lead. If the email fails, fall
  back to `sendAdminAlert` — the same never-silent rule used by `lead-capture.ts`.
- **Cron failures are per-account.** One account's bad data must not abort the sweep, matching the
  existing best-effort-per-account pattern in `weekly-digest`.
- **Stamps are written only after a confirmed send**, per the rule established in `bestie-lead-nudge`:
  a failed send that stamped anyway silently skips that demo's entire remaining funnel.

## 7. Testing

Unit tests for `resolveDemoAccess` (pure, no I/O) covering:

- account with no `config` → `open`, nulls
- account with `config` but no `demo` → `open`, nulls — **the paying-customer guard**
- day 6 → `expiring`; day 3 → `open`; exactly `ends_at` → `locked`; day 8 → `locked`
- `extended_to` in the future overrides a past `ends_at`
- malformed `ends_at` (empty string, garbage, null) → `open`, no throw

Plus:

- `/api/demo/lead` — happy path, and second submit does not re-notify.
- `demo-watch` moment detection — each moment fires once across two consecutive runs.
- A route-level test asserting a locked demo's `/api/chat/stream` returns 403, and an account
  without `config.demo` returns 200.

Note: `npm run test` is watch mode in this repo — use `npx vitest run`.

## 8. Open Items

1. **Itamar's and Roei's WhatsApp numbers** — until supplied, WhatsApp reaches three of five (§4.7).
2. **Clock start** is set to scan completion (§4.4); revisit if prospects routinely open late.
3. The public-exposure hardening listed in §3 (signed links, `noindex`) remains unaddressed.
