# Bestie as a Customer-Service Engine — Design

**Date:** 2026-08-12
**Status:** Approved, not built
**Supersedes:** `2026-08-09-multi-channel-cs-brain-design.md` (its identity/trust core is
absorbed here unchanged; that spec's WhatsApp+IG scope becomes milestones 1 and 3 of this one)

**Goal:** Bestie shifts from "persona chatbot with a CS side-channel" to a
**customer-service engine**. One brain (`runCsTurn`, generalized) serves every surface —
WhatsApp, Instagram DM, the site widget, and the main chat page. Every surface opens with
a channel-appropriate choice: **customer service** or **talk about the content**. The
choice is context for the one brain, never a route to a different brain.

## Background — verified 2026-08-12

Four surfaces, two brains, and only one surface gets the brain with hands:

| Surface | UI | API | Brain today |
|---|---|---|---|
| WhatsApp | — | webhook → `wa-cs-worker.ts:32` | `runCsTurn` (10 tools) |
| Instagram DM | — | `dm-handler.ts` | `processSandwichMessageWithMetadata` (no tools) |
| Site widget | `public/widget.js` | `POST /api/widget/chat` → `widget-chat-handler.ts:356` | sandwich (no tools) |
| Main chat page | `src/app/chat/[username]/page.tsx` | `/api/chat/stream`, `/api/chat/sandwich` | sandwich (no tools) |

The only "customer service" on web surfaces is a **static ticket form with no brain**:
`SupportTab.tsx` on the chat page (default tab `page.tsx:153`) and the widget support
module (`config.widget.modules.support.enabled`, OFF for every account today) — both post
to `/api/support`. There is no initial CS-vs-content screen anywhere; the closest thing is
the chat page's complaint-regex + `uiDirectives.openSupportTab` redirects
(`page.tsx:920-980`) that yank a user out of the content brain into the dead form.

The CS brain is a superset on **brand** knowledge (`cs-context.ts` loads
`buildPersonalityFromDB` + brand RAG) but **not** on content knowledge: content
conversations use the sandwich pipeline's retrieval over posts, transcriptions, and
highlights, which the CS brain cannot reach. True unification therefore means content
retrieval becomes a *tool* of the CS brain — not that the CS brain already knows enough.

Operational reality that sets the build order: Meta approved Instagram messaging on
2026-08-08; WhatsApp CS is live in production (Argania + Studio Pasha) on the shared
number and must not regress; the main chat content experience is the product's showcase
and must not regress either.

## Decisions (from brainstorming)

1. **One brain for everything.** No edge router picking between two brains; the initial
   choice is context injected into the one brain.
2. **The opening choice appears on every channel, in the channel's language**, and never
   blocks: free text skips it and the brain infers the mode.
3. **All account archetypes are served.** "Customer service" takes its meaning from
   `config.archetype`; unavailable tools are cut in code, not prompt.
4. **CS conversations render structured screens inside the chat** (order card, details
   form, ticket confirmation) on surfaces that can; the static ticket form retires.
5. **Migration is incremental — CS first, content after proof.** Content conversations
   stay on the sandwich bot until the unified brain demonstrably matches it, then flip
   per-channel behind a flag.

## Design

### 1. Identity as a parameter, with a trust level

Carried unchanged from the superseded spec, extended with the two web channels:

```ts
type CsIdentity =
  | { channel: 'whatsapp';  waId: string;                       trust: 'channel_verified' }
  | { channel: 'instagram'; igsid: string;     phone?: string;  trust: 'unverified' | 'phone_claimed' }
  | { channel: 'widget';    visitorId: string; phone?: string;  trust: 'unverified' | 'phone_claimed' }
  | { channel: 'web_chat';  sessionId: string; phone?: string;  trust: 'unverified' | 'phone_claimed' }
```

`trust` is the load-bearing field. Meta verifies WhatsApp senders — `channel_verified`.
Everything a web visitor or IG user types is a *claim* — `phone_claimed` at best. Tools
branch on `trust`, never on `channel`, so a future channel declares its trust level
instead of adding a special case.

`CsToolCtx.senderPhone: string` becomes `CsToolCtx.identity: CsIdentity`. `runCsTurn` has
exactly one caller today (`wa-cs-worker.ts:32`), so the refactor is contained.

### 2. Order verification (the security core — unchanged)

`lookupOrder` (`src/lib/orders/lookup.ts:117`) treats the sender's phone as
*authorization*; `phoneMatches` (`src/lib/orders/phone-verify.ts:6`) is
reveal-when-absent: an order with no phone is revealed to whoever knows its number. Safe
only because WhatsApp verifies senders.

**Rule: reveal-when-absent applies only to `trust: 'channel_verified'`.**

- `phone_claimed`: the order must carry a phone **and** it must match the claim; a
  no-phone order escalates to a human instead of revealing.
- `unverified`: both order tools refuse and signal "collect phone + order number first".

The check lives in `lookupOrder`, never in the prompt. A model that can be talked out of
verifying is not an access control. The context digest tells the brain which identity
state the session is in, so it asks for a phone once, not every turn.

**New finding this spec must close:** `POST /api/widget/order-lookup`
(`widget.js:3093`, Shopify) is a standing order-lookup path that bypasses all of the
above. It is brought under the same verification rule or removed in favor of the brain's
`lookup_order` tool. One leak surface, not two.

### 3. Conversation mode as context

`runCsTurn` gains `mode: 'cs' | 'content'` in its context, set by the opening choice (or
inferred from the first free-text message when the user skips the choice). Mode is
phrasing and emphasis, not a wall: a content question mid-CS is answered (or the brain
offers to switch), and a complaint mid-content moves the brain into CS behavior — replacing
today's client-side complaint-regex stream-cancel hack (`page.tsx:920-941`), which retires
with the static form.

### 4. Archetype-aware tool registry

The tool list (`src/lib/cs/tools/index.ts`, single `TOOLS` array) becomes a registry
filtered by `config.archetype` + account config:

| Archetype | CS means | Tools |
|---|---|---|
| brand | orders, returns, tickets, products | full set (order tools only if an orders provider is configured) |
| service_provider | inquiries, leads, bookings | tickets, escalation, lead capture; **no order tools** |
| government_ministry | rights, referrals | RAG answers, escalation only |
| influencer / others | audience questions | tickets, escalation |

`resolve_brand` / `bind_brand` remain WhatsApp-only (shared-number problem); on every
other channel the account *is* the brand. An account without an orders provider never has
order tools in its definition list — enforced at registry build, not in the prompt.

### 5. The opening screen, per channel

- **Widget + main chat page:** a real opening screen with two choices — "שירות לקוחות" /
  "לדבר על ___" (wording derives from archetype and account language). Existing smart
  chips stay beneath it. On the chat page this replaces the default support tab's role;
  `NavTabs` keeps working for accounts that configure content tabs.
- **WhatsApp:** first-contact text menu. **Instagram:** quick replies — the CS brain
  already emits `<<SUGGESTIONS>>…<</SUGGESTIONS>>`; `stripSuggestions` (`cs-context.ts:8`)
  strips it for WhatsApp, `dm-handler.ts:468` already parses that exact marker into IG
  quick replies. The adapter parses where WhatsApp strips.
- **The first starter is always a support starter — on every channel.** Wherever starters
  are offered (widget chips, chat-page chips, the WhatsApp opening menu, Instagram quick
  replies), a support/problem starter (e.g. "יש לי בעיה עם הזמנה" — wording per archetype)
  appears **first**, ahead of all content starters. Selecting it opens the CS conversation
  directly, same as choosing the CS option on the opening screen.
  **Web-surface refinement (Ido, 2026-08-13):** where the opening choice screen itself is
  visible, the CS choice button IS the first support entry — no duplicate starter pill
  beneath it, and the widget shows content chips only AFTER the visitor picks "chat"
  (the cold-start panel must never stack choice buttons + a pile of chips).
- **Never blocking:** free text bypasses the screen; the brain infers mode.

### 6. Structured CS screens inside the conversation

`runCsTurn` returns `{ reply, phase, cards }` today. The envelope gains typed UI payloads:

- `order_status_card` — order lookup result (status, items, tracking link)
- `details_form` — inline mini-form for phone + order number (identity collection)
- `ticket_confirmation` — ticket opened/attached, with reference
- `escalation_notice` — handed to a human, expectations set

Rendering per channel mirrors how product cards already work: widget and main chat render
components; WhatsApp renders a text projection; Instagram renders text + quick replies.
A channel adapter that doesn't recognize a payload falls back to the text projection —
payloads are additive, never load-bearing for the reply.

Where the new mode is enabled, the static `SupportTab` form and the widget support-form
views retire. `/api/support` itself stays — it is the ticket store the brain's
`open_or_attach_ticket` writes to.

### 7. Identity collection is lazy

A visitor asking "how much is this?" is never interrogated. Only when a question requires
identity does the brain present the `details_form` (web) or ask in text (WA/IG). Once
supplied, the phone is stored on the session permanently; cross-channel recognition falls
out of the stored phone (`list_open_threads` finds the same person's tickets from any
channel). No identity-mapping table.

### 8. Data model

Two non-destructive migrations on `whatsapp_cs_sessions` (68 live rows, `wa_id NOT NULL`):

1. Add `channel` (default `'whatsapp'`) and `channel_user_id`; backfill from `wa_id`;
   unique index on `(channel, channel_user_id)`. Code reads/writes the new columns;
   `wa_id` keeps being populated.
2. Only after the new path has run in production: drop `NOT NULL`, then the column.

`channel_user_id` per channel: `waId` / IGSID / widget visitor id (the widget's existing
persistent visitor identifier) / chat-page session id. `support_requests.source` gains
`instagram_cs`, `widget_cs`, `web_cs`; `list_open_threads` generalizes from
`source='whatsapp_cs'` + phone match to the resolved customer identity.

### 9. Content retrieval as a tool (milestone 4)

A `search_content` tool wraps the sandwich pipeline's retrieval (posts, transcriptions,
highlights — the hybrid-retrieval indexes) so the one brain can hold content
conversations. Content mode flips from sandwich to the unified brain **per channel,
behind a flag, only after a side-by-side quality comparison** on a fixed question set
(see Testing). Until then, content mode on each channel keeps calling the sandwich bot —
the opening screen and CS mode do not wait for this.

## Non-goals

- **No OTP.** Phone + order number is the agreed bar (superseded spec's reasoning holds).
- **No IG-username → customer matching.** A misidentification in a service context is a
  data leak.
- **No comment-to-DM** (`manage_comments` rejected by App Review; resubmission is a
  separate track).
- **No WhatsApp behavior change in milestone 1.** Existing CS tests are the gate.
- **No rewrite of the sandwich bot.** It keeps serving content mode until milestone 4
  proves the replacement, channel by channel.
- **No new identity-mapping table.**

## Testing

- **WhatsApp parity** — existing CS tests pass unchanged; primary gate on milestone 1.
- **Verification matrix** — `trust` × (order has phone / hasn't) × (matches / doesn't):
  assert found vs. refuse vs. escalate. Named test for the guest-checkout leak **from the
  widget** (the new channel most exposed to it).
- **Registry** — per archetype, assert the tool definition list: no order tools without
  an orders provider; government gets RAG + escalation only.
- **Adapters** — one CS turn with `<<SUGGESTIONS>>` + an `order_status_card`: widget/web
  render the card, WhatsApp gets stripped text projection, IG gets quick replies.
- **Migration** — the 68 existing rows resolve identically through
  `(channel, channel_user_id)`.
- **Content parity (milestone 4 gate)** — fixed question set answered by both brains,
  compared side by side before any channel flips.

## Milestones

| | Deliverable | Risk |
|---|---|---|
| 1 | Channel-agnostic core: `CsIdentity` + trust, archetype tool registry, migration step 1. WhatsApp identical to today. | The only step touching live production |
| 2 | Widget + main chat: opening screen, CS mode via `runCsTurn`, structured screens, `/api/widget/order-lookup` closed, static forms retired where enabled. | New surface — nothing existing breaks |
| 3 | Instagram DM adapter (Meta approval already granted 2026-08-08). | No live DM traffic |
| 4 | `search_content` tool; content mode flips to the one brain per channel, behind a flag, after the quality comparison. | The showcase — hence last and gated |

Each milestone gets its own implementation plan; milestone 1 must ship before 2 or 3
start (both depend on the identity core), while 2 and 3 are independent of each other.

## Operational prerequisites (outside this spec)

For Instagram on a real brand (e.g., Argania): Business verification, Professional
account, "Allow access to messages" enabled, `config.dm_bot_enabled` on. Argania's
connection is the first real test of Advanced Access — LDRS doesn't prove it (app tester
with stale grants).
