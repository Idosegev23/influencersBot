# Email deliverability: catching a dead address before we send to it

**Date:** 2026-08-31
**Status:** Approved, not built
**Trigger:** Ticket `99bb08a1` (Argania, 2026-08-31 09:55, `source: widget_support`).
לילי לוי left `lililevy42@gmail.com.il`. The reply bounced:
`Address not found — the domain gmail.com.il couldn't be found.`

---

## 1. The problem, stated correctly

`lililevy42@gmail.com.il` is **syntactically valid**. `.il` is a real TLD. Every one
of the seven regexes in this repo accepts it:

| Location | Pattern |
|---|---|
| `src/lib/support/contact.ts:42` | `/^[^\s@,;]+@[^\s@,;]+\.[a-zA-Z]{2,}$/` |
| `src/app/api/support/route.ts:78` | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `public/widget.js` ×5 (4816, 5269, 5499, +2) | same, inline, duplicated |
| `src/lib/support/reply-address.ts:19` | same |
| `src/engines/escalation/lead-capture.ts:300` | same |
| `src/app/api/agent/{settings,onboarding}/profile/route.ts:11` | same |
| `src/app/api/data-deletion/route.ts:22` | same |

**What broke is the existence of the domain, not the shape of the address.**
No regex can fix this. Tightening the regex is not the work.

### 1.1 The bounce already reaches our code — and we bin it

`/api/cron/poll-gmail` runs every 10 minutes (`vercel.json`) against the Bestie
mailbox and is demonstrably alive (385 rows in `inbound_email_routing`, most
recent today). It received the bounce for this exact ticket:

```
inbound_email_routing
  created_at  2026-08-31 10:01:05     ← 6 minutes after the ticket
  sender      mailer-daemon@googlemail.com
  subject     Delivery Status Notification (Failure)
  outcome     not_a_customer_reply
  note        "automated sender or auto-reply subject"
```

`isAutomated()` in `src/lib/support/inbound-email.ts:88` correctly refuses to
forward a bounce to a brand as if a customer wrote it — and then drops it on the
floor. Two earlier ones went the same way (2026-08-27 Failure, 2026-08-20 Delay).

**The ground-truth signal already arrives, on a cron that already runs, into a
function that already identifies it. Nothing listens.**

### 1.2 She was reachable the whole time

The same ticket carries `customer_phone: 0526936571` — dialable by
`realPhoneOrNull`. The support inbox rendered the dead email as if it were a
contact route and said nothing about the phone.

---

## 2. Evidence from production data

Every number below is from a query against the live database on 2026-08-31, and
every domain verdict from an actual `dns.resolveMx` run.

### 2.1 Scale on surfaces we control

`support_requests` by source:

| source | tickets | with email | unusual domain | dialable phone |
|---|---|---|---|---|
| `widget_support` | 435 | 435 | 33 | 399 |
| `widget_support_urgent` | 306 | 306 | 17 | 274 |
| `widget_lead` | 18 | 6 | 1 | 7 |
| `auto_escalation` | 792 | 42 | 1 | 443 |

**759 tickets came through a widget form where email is a required field.**
~36 of them have an email and **no** dialable phone — for those, a dead address
means the customer is unreachable, full stop.

### 2.2 The four distinct failure classes

MX was resolved for all 41 unusual domains found in production. The results
partition cleanly, and **no single layer covers more than one partition**:

| Class | Real examples from the DB | MX verdict | Caught only by |
|---|---|---|---|
| Invisible bidi/zero-width suffix | `gmail.com‬` ×3 | n/a — shape passes, DNS fails | **normalization** |
| Live typosquat | `gamil.com` (`mail.gamil.com`), `gnail.com` (`mx2.oweb.cn`, CN), `gmail.co.il` (markmonitor sinkhole), `gmail.co` | ✅ **has MX** | **typo dictionary** |
| Dead domain | `gmail.com.il`, `gmail.con`, `gmai.con`, `gmail.cim`, `ail.com`, `gmal.com`, `gmali.com`, `triroars.com`, `zev-ev.com` | ❌ none | **MX probe** |
| Valid domain, wrong mailbox | (undetectable pre-send) | ✅ has MX | **bounce ingest** |

This table is the justification for the layered design. Dropping any layer
leaves a class of real, observed failures uncaught.

### 2.3 Two traps that kill naive designs

**Trap A — an allowlist of "known good" domains rejects real people.**
These are all genuine correspondents in `support_requests`, all with valid MX:
`jerusalem.muni.il`, `sviva.gov.il`, `akko.muni.il`, `egged.co.il`,
`clalit.org.il`, `zutacore.com`, `bmc.com`, `orian.com`, `haviv-adv.co.il`,
`hfs.school`, `elishevaph.org`, `mvav.org`, `vatel.co.il`, `ern.co.il`,
`kerencohen.co.il`, `shir-ben.co.il`, `ay-adir.co.il`, `dalitkatzir.com`,
`tzlev.com`, `ldrsgroup.com`, `triroars.co.il`.
An allowlist, a TLD whitelist, or "looks unusual" heuristics all reject these.

**Trap B — DNS failure is not domain failure.** Measured, from this machine:

```
elishevaph.org    ETIMEOUT after 49,730 ms   ← real domain
windowslive.com   ETIMEOUT after 52,732 ms   ← real domain (Microsoft legacy)
clalit.org.il     timed out under a 1.5s cap ← real domain (HMO)
```

Meanwhile the true negatives answer fast: `gmail.com.il` NXDOMAIN in 103 ms,
`gmail.con` in 160 ms, `gmail.cim` in 126 ms.

**Therefore: an inconclusive probe must never block.** Only a definitive
NXDOMAIN / ENODATA counts as "no".

**Trap C — do not "correct" a deliverable domain.** `outlook.co.il` (15+5
occurrences) resolves to `eur.olc.protection.outlook.com`, and `windowslive.com`
(17+6) is genuine Microsoft. Both look like typos and are not. Every dictionary
entry must be MX-verified dead, or a documented squat, before it is added.

### 2.4 Imported merchant data (out of scope, recorded for context)

`brand_orders` and `brand_abandoned_carts` hold far more damage —
`gmail.con` ×88 and ×46, `gmai.com` ×15, `gmail.co` ×18, plus 21 rows whose
domain is bare `gmail` with no dot at all. These are synced from the merchant
(QuickShop), not typed into our forms, and no outbound mail path sends to them.
They are out of scope; `email_deliverability` is keyed by address, so a later
sweep can cover them without schema change.

---

## 3. Decisions taken

| # | Decision | Rationale |
|---|---|---|
| D1 | Scope = customer-facing capture points **+ brand escalation recipients** | A typo in a brand recipient silently kills every escalation for that brand — the failure mode of `project_contact_route_integrity`, three times over |
| D2 | Customers: **suggest, and bypass when a dialable phone exists** | Never lose a ticket. But never let the 36 email-only cases through with a dead address |
| D2a | **Only `undeliverable` ever blocks. A `typo` verdict never does** | A suggestion is a guess; MX absence is a fact. Blocking on a guess is how `mail.com` customers get turned away |
| D3 | Brand recipients: **hard block** | No phone fallback exists there; a silent typo has no recovery path |
| D4 | Retroactive: **MX-sweep stored addresses and mark them in the inbox** | Agents stop wasting replies on dead addresses. No unsolicited outreach to customers |
| D5 | **No third-party validation service** | Costs per check, adds a vendor and a secret, ships customer addresses to a third party — and still misses `gamil.com`, which is deliverable |
| D6 | Inconclusive DNS ⇒ **pass** | §2.3 Trap B |
| D7 | Store what was typed, **verbatim, always** | Mirrors the existing rule in `api/support/route.ts:74-77`: "junk value" and "never gave one" must not look the same |

---

## 4. Architecture

### 4.1 New module — `src/lib/support/email-deliverability.ts`

Sits **beside** `src/lib/support/contact.ts`, does not replace it.
`realEmailOrNull` stays exactly as-is: a synchronous shape guard with many
callers. This module adds the async layer above it.

```ts
export type EmailVerdict =
  | { status: 'ok';            email: string }
  | { status: 'typo';          email: string; suggestion: string }
  | { status: 'undeliverable'; email: string; reason: 'no_mx' | 'nxdomain' | 'bounced';
                               suggestion?: string }
  | { status: 'unknown';       email: string };   // treat as 'ok' at every call site
```

`undeliverable` carries an optional `suggestion` because the two signals are
independent: `gmail.com.il` is both dead **and** repairable, and the shopper
should see the fix, not just the rejection.

**L0 `normalizeEmail(raw): string | null`** — synchronous, no network.
Strips `U+200B–U+200F`, `U+202A–U+202E`, `U+2066–U+2069`, `U+FEFF`; trims;
lowercases; removes a trailing `.`. Returns `null` if the shape is invalid
(delegates to `realEmailOrNull`). Closes the `gmail.com‬` class outright.

**L1 `suggestDomain(domain): string | null`** — synchronous, no network.

The ordering here is load-bearing and was corrected during spec review. A naive
"Levenshtein ≤ 2 against a provider list" detector is **unsafe**: measured,

```
email.com  → gmail.com   distance 1     ymail.com → gmail.com  distance 1
mail.com   → gmail.com   distance 1
```

and `email.com`, `mail.com` and `ymail.com` are all real, deliverable providers.
That detector tells a `mail.com` customer she mistyped her own address.

**So the distance check never decides that a domain is wrong. It only proposes a
repair for a domain already proven wrong.**

1. `EXPLICIT_SQUAT_MAP` — domains observed in production that are dead or are
   documented lookalikes (`gmail.con`, `gmail.com.il`, `gamil.com`, `gnail.com`,
   `gmali.com`, `gmal.com`, `gmail.cim`, `gmai.com`, `gmail.co`, `gmail.co.il`,
   …, seeded from §2.2). A domain in this map is repairable **even when it has
   MX** — that is the only way a live typosquat is caught.
2. Otherwise, a suggestion is produced **only after L2 has returned `no_mx`**:
   Levenshtein ≤ 2 against a ~40-entry consumer-provider list.
3. A domain with MX and no map entry gets **no suggestion, ever**. `email.com`,
   `mail.com`, `ymail.com`, `outlook.co.il` and `windowslive.com` are therefore
   safe by construction rather than by an exclusion list somebody must maintain.

Consequence, accepted deliberately: a live typosquat that is **not** in the map
is not caught until it bounces (L3). That is the correct trade — the alternative
misfires on real providers, and §3 D2 already guarantees a `typo` verdict alone
never blocks anyone.

**L2 `probeMx(domain): Promise<'has_mx' | 'no_mx' | 'unknown'>`**
- Redis via `redisGet`/`redisSet` (`src/lib/redis.ts`), key `email_mx:<domain>`,
  TTL 7 days positive / 1 day negative.
- `dns.promises.resolveMx` raced against a **1500 ms** timer.
- `ENOTFOUND` / `ENODATA` / empty array ⇒ `no_mx`.
- Timeout, `SERVFAIL`, anything else ⇒ `unknown`.
- Node runtime only. Every route touched already runs `nodejs`.

**L3 bounce ingest** — `src/lib/support/inbound-email.ts`.
`isAutomated()` keeps returning true (a bounce must still never be forwarded to
a brand). Before that return, when the sender is a mailer-daemon and the subject
is a Failure DSN, extract the failed recipient from `Final-Recipient: rfc822;…`
or the `X-Failed-Recipients` header, and record it. A `(Delay)` DSN is logged
but does **not** mark the address dead — a delay is not a failure.

### 4.2 New table — migration `085_email_deliverability.sql`

```sql
create table email_deliverability (
  address         text primary key,
  status          text not null check (status in ('ok','no_mx','bounced')),
  reason          text,
  checked_at      timestamptz not null default now(),
  bounce_count    int  not null default 0,
  last_bounce_at  timestamptz
);
create index on email_deliverability (status) where status <> 'ok';
```

Keyed by address, not by ticket, deliberately: "this address is dead" is a fact
about the address. The same address appears in `support_requests`,
`bestie_leads`, `service_briefs` and `client_contacts`. One probe serves every
surface, the backfill, and the inbox render without re-probing.

### 4.3 Wiring

| # | Site | Change |
|---|---|---|
| 1 | `public/widget.js` | One `checkEmail()` helper replacing **5 duplicated inline regexes** (4816, 5269, 5499, +2). Runs on blur, 400 ms debounce. Renders inline: *"התכוונת ל-lililevy42@gmail.com?"* with tap-to-fix |
| 2 | `POST /api/widget/validate-email` | New route. Inherits the existing `/api/widget` rate-limit bucket (`middleware.ts:221`) and the `/api/support` CORS pattern. Stateless — stores nothing |
| 3 | `src/app/api/support/route.ts` | Authoritative server-side re-check; the widget check is UX only. Stores verbatim (D7). Enforces D2: `undeliverable` **and** no dialable phone ⇒ 400 asking for either. Never on `typo` (D2a). The widget must re-render the form **with every field the shopper typed intact** — a 400 that empties the message box loses the ticket the rule exists to protect |
| 4 | `src/lib/cs/tools/index.ts:164` (`remember_contact`) | Same check; the bot asks the customer to re-read the address |
| 5 | `src/app/admin/influencers/[id]/EscalationContactsForm.tsx` | Brand recipients — hard block (D3) |
| 6 | `src/app/influencer/[username]/support/page.tsx:1206` | Dead email rendered struck-through with "לא נמסר · חייגי {phone}", **mirroring the undialable-phone pattern already in this file** |
| 7 | `scripts/verify-stored-emails.ts` | One-off, resumable MX sweep over `support_requests`, `bestie_leads`, `service_briefs`, `client_contacts`. Writes `email_deliverability`. Contacts nobody |

### 4.4 Data flow

```
shopper types → [L0 normalize] → [L1 map hit?] → suggest inline, tap to fix
                                            ↓ (submitted anyway)
       POST /api/support → [L0] → [L1 map] → [L2 MX, ≤1.5s, cached]
                                            ↓
                          no_mx → now, and only now, propose nearest provider
                                            ↓
                        store verbatim + upsert email_deliverability
                                            ↓
                   undeliverable AND no dialable phone → 400, ask for one
                                            ↓ otherwise
                                      ticket created
                                            ↓
                          agent replies → bounces → poll-gmail (≤10 min)
                                            ↓
                    [L3] parse DSN → email_deliverability.status='bounced'
                                            ↓
                       inbox shows email struck through + the phone
```

---

## 5. Error handling

| Condition | Behaviour |
|---|---|
| Redis down | Skip cache, probe directly. `isRedisAvailable()` already guards this |
| DNS timeout / SERVFAIL | `unknown` ⇒ treated as `ok`. Never blocks (D6) |
| `/api/widget/validate-email` unreachable | Widget falls back to L0+L1 locally and submits. The server re-checks anyway |
| DSN with no parseable recipient | Log to `inbound_email_routing` with a note; mark nothing |
| `(Delay)` DSN | Logged, not marked. A delay is not a failure |
| Address in `email_deliverability` as `bounced`, then used successfully | Bounce wins until a successful send clears it. Manual clear via the inbox |

---

## 6. Testing

`feedback_absence_tests_pass_vacuously` is the governing constraint here: this
whole feature is a pile of assertions that something bad does **not** happen, and
that is exactly the shape that passes vacuously. **Every rejection assertion gets
a companion acceptance assertion, and no test is trusted until it has been
watched go red.**

| Layer | Rejection assertion | Companion acceptance assertion |
|---|---|---|
| L0 | `'a@gmail.com‬'` normalizes to `'a@gmail.com'` (assert the exact output) | `'a@gmail.com'` passes through byte-identical |
| L1 | `gmail.com.il` ⇒ suggestion is **exactly** `gmail.com` | `jerusalem.muni.il` ⇒ `status: 'ok'` — asserting the verdict, not merely "no suggestion" |
| L1 | `gamil.com`, `gnail.com`, `gmail.co`, `gmail.co.il` ⇒ suggested from the map even though they have MX | `outlook.co.il` and `windowslive.com` ⇒ **not** suggested (Trap C) |
| L1 | — | `email.com`, `mail.com`, `ymail.com` ⇒ `status: 'ok'` with **no** suggestion, despite being Levenshtein-1 from `gmail.com`. Assert the absent suggestion *and* the `ok` verdict — the absence alone passes vacuously if the function throws |
| D2a | `undeliverable` + no phone ⇒ 400 | `typo` + no phone ⇒ **201, ticket created** |
| L2 | mocked `ENOTFOUND` ⇒ `undeliverable` | mocked `ETIMEOUT` ⇒ `unknown`, **and** the address still reaches the ticket |
| L2 | — | Table test over the **21 real corporate domains listed in §2.3 Trap A**; all must return `ok` |
| L3 | A real Gmail Failure DSN body ⇒ the correct recipient extracted and marked | A `(Delay)` DSN ⇒ marked nothing; a genuine customer reply ⇒ still forwarded |
| D2 | undeliverable + no phone ⇒ 400 | undeliverable + dialable phone ⇒ **201, ticket created** |

Run with `npx vitest run` — `npm run test` is watch mode
(`project_bestie_cs_engine`).

---

## 7. Rollout

**Global immediately** — all additive, none can reject a submission:
L0 normalization, L1 suggestions, L3 bounce ingest, the inbox render, the backfill script.

**Gated per account** — `config.email_validation.enforce`, off by default,
enabled first on Argania: the D2 blocking rule (undeliverable + no phone ⇒ 400).

Absence means permissive: an account with no `config.email_validation` key
never blocks. This mirrors the safety property of `project_demo_expiry_and_visibility`.

---

## 8. Out of scope

- SMTP mailbox probing (`RCPT TO`) — gets us blocklisted, and D5 rules out
  paying a vendor to do it
- `brand_orders` / `brand_abandoned_carts` cleanup — imported merchant data,
  no outbound path (§2.4)
- Phone validation — `realPhoneOrNull` already covers it
- The remaining 5 duplicate regexes outside the wiring table
  (`reply-address.ts`, `lead-capture.ts`, agent profile routes, `data-deletion`)
  — consolidating them is follow-up work, not this change

---

## 9. Open questions

- `email_deliverability` needs a retention policy. Not blocking; MX results are
  cheap to re-derive and the table is small.
- Whether a `bounced` mark should ever expire. Starting with "never, until a
  successful send clears it", which is the conservative choice.
