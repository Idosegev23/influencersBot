# Multi-Channel CS Brain — Design

**Date:** 2026-08-09
**Status:** Superseded by `2026-08-12-bestie-cs-engine-design.md` (identity/trust core absorbed there unchanged)
**Goal:** One brain serves a brand across WhatsApp and Instagram DM. A shopper who asks
"where is my order" gets the same answer, in the same voice, from the same ticket queue,
whichever channel they use.

## Background

Two brains answer for the same brand today.

**WhatsApp CS** (`src/lib/cs/cs-agent.ts`) — a brain-led tool loop with 10 tools: brand
resolution, order lookup, ticket open/attach, escalation, product search and cards. It
loads the brand persona (`buildPersonalityFromDB`) and injects brand RAG.

**Instagram DM** (`src/lib/instagram-graph/dm-handler.ts`) — `processSandwichMessageWithMetadata`,
the persona chatbot. It knows the brand's content and voice but has no tools: it cannot
look up an order, open a ticket, or escalate.

The CS brain is already a superset on knowledge — same persona source, plus RAG, plus
tools. Instagram is missing the tools, not the personality.

### Why this is not a wiring job

The CS brain assumes a phone number in every layer: `whatsapp_cs_sessions.wa_id`,
`whatsapp_contacts`, `phoneVariants()`, `support_requests.customer_phone`,
`source='whatsapp_cs'`. Two of its ten tools (`resolve_brand`, `bind_brand`) exist only
because one WhatsApp number serves many brands.

On Instagram both assumptions invert:

| | WhatsApp | Instagram DM |
|---|---|---|
| Which brand | must be resolved (shared number) | already known — the account *is* the brand |
| Who the customer is | phone number, verified by Meta | IGSID; **no phone at all** |

### Current state (verified 2026-08-08)

- Only LDRS has ever connected Instagram. Argania (`c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1`,
  `argania_group`, archetype `brand`) has zero connections.
- `dm_bot_enabled` is off for **every** account, LDRS included. **There is no live
  Instagram DM traffic to break.**
- `whatsapp_cs_sessions` holds 68 live sessions; `support_requests` holds 39 `whatsapp_cs`
  tickets. WhatsApp traffic is live and must not regress.

## Design

### 1. Identity as a parameter, with a trust level

`runCsTurn` takes an explicit identity instead of assuming a phone:

```ts
type CsIdentity =
  | { channel: 'whatsapp';  waId: string;  trust: 'channel_verified' }
  | { channel: 'instagram'; igsid: string; phone?: string; trust: 'unverified' | 'phone_claimed' }
```

`trust` is the load-bearing field, not `channel`. On WhatsApp, Meta guarantees the sender
controls the number — `channel_verified`. On Instagram, a phone the customer types is a
*claim*: anyone can type anyone's number. Tools branch on `trust`, so a future channel
declares its trust level rather than adding another special case.

`CsToolCtx.senderPhone: string` becomes `CsToolCtx.identity: CsIdentity`. `runCsTurn` has
exactly one caller (`wa-cs-worker.ts:32`), so the refactor is contained.

### 2. Order verification (the security core)

`lookupOrder` treats the sender's phone as *authorization*, not as a search key
(`src/lib/orders/lookup.ts:117`). `phoneMatches` is deliberately "reveal-when-absent"
(`src/lib/orders/phone-verify.ts:6`): an order carrying no phone is revealed to anyone who
knows its number.

That is safe only because WhatsApp verifies the sender. Wiring Instagram into these tools
with an empty phone would leak every guest-checkout order to anyone who guesses an order
number.

**Rule:** reveal-when-absent applies **only** to `trust: 'channel_verified'`.

For `phone_claimed`:
- the order must carry a phone **and** it must match the claimed one;
- an order with no phone is **not** revealed — the brain escalates to a human instead.

At `unverified` (nothing claimed yet) **both** order tools refuse and return a signal that
means "ask for a phone and an order number first". There is nothing to match against, so
neither tool can produce a safe answer.

This inverts the current default for untrusted channels, on purpose.

**The check lives in `lookupOrder`, never in the prompt.** A model that can be talked out
of verifying is not an access control. The prompt's only job is phrasing the request for
identity; the refusal happens whether or not the model cooperates.

The context digest tells the brain which identity state it is in, so it asks for a phone
once rather than re-asking after it already has one.

### 3. Identity collection is lazy

A DM asking "how much is this?" needs no identity and must never be interrogated. Only
when a question requires identity does the brain ask for a phone and order number. Once
supplied, the phone is stored on the session and the link is permanent — the customer is
asked once, not once per conversation.

Cross-channel recognition falls out of this: a stored phone lets `list_open_threads` find
that person's WhatsApp tickets. **No separate identity-mapping table.**

### 4. Brain selection

`config.archetype === 'brand'` → CS brain. Otherwise → sandwich bot.

LDRS is `service_provider` with no `whatsapp_cs`: a lead-generation account, correctly
served by the persona brain. The routing derives from existing config, adding no flag to
remember on every new account.

### 5. Quick replies work on Instagram — for free

The CS brain **already** emits `<<SUGGESTIONS>>…<</SUGGESTIONS>>` in its reply text;
`stripSuggestions` (`src/lib/cs/cs-context.ts:8`) removes it because a WhatsApp text
message cannot carry it. The Instagram handler already parses that exact marker into quick
reply buttons (`dm-handler.ts:468`).

The Instagram adapter **parses** where WhatsApp **strips**. One line of divergence; the
brain needs no channel-specific prompt.

Instagram ends up the richer channel: the same brain, plus buttons WhatsApp cannot render.

This is unrelated to `reply.kind: 'buttons'`, the WhatsApp interactive-message type that is
deliberately unreachable (`tools/index.ts:287`). That decision is about picking one brand
out of ~10,000 on a shared number — a problem Instagram does not have.

### 6. Data model

`whatsapp_cs_sessions.wa_id` is `NOT NULL` under 68 live sessions. Two non-destructive
migrations:

1. Add `channel` (default `'whatsapp'`) and `channel_user_id`; backfill `channel_user_id`
   from `wa_id`; unique index on `(channel, channel_user_id)`. Code reads and writes the
   new columns. `wa_id` stays and keeps being populated.
2. **Only after the new path has run in production** — drop `NOT NULL`, then the column.

Instagram sessions carry `channel='instagram'`, `channel_user_id=<IGSID>`, and the claimed
phone once collected.

### 7. Instagram adapter

`runCsTurn` returns `{ reply, phase, cards }`. The adapter maps it to Instagram:

- `reply.kind: 'text'` → parse `<<SUGGESTIONS>>` → `sendLongInstagramDMWithQuickReplies`,
  or `sendLongInstagramDM` when there are none
- `cards` → the existing Instagram card sender
- the ❤️ reaction and `claimDmMessage` dedup guard stay exactly as they are

`reply.kind: 'buttons' | 'list'` are unreachable from the loop and need no Instagram path.

### 8. Ticket unification

`support_requests` gains an `instagram_cs` source. `list_open_threads` currently filters
`source='whatsapp_cs'` and matches on `customer_phone`; it generalizes to match on the
resolved customer identity, so one person sees one thread list across both channels.

## Non-goals

- **No OTP.** Considered and rejected: WhatsApp template cost plus a step that loses real
  customers. Phone + order number is the agreed bar.
- **No IG-username → customer matching.** Low hit rate, and a misidentification in a
  service context is a data leak.
- **No comment-to-DM.** `instagram_business_manage_comments` was rejected by App Review.
- **No change to WhatsApp behaviour.** After the refactor it must be identical; the
  existing CS tests are the check.

## Testing

- **WhatsApp parity** — existing CS tests must pass unchanged. This is the primary gate
  on the refactor.
- **Verification matrix** — for each `trust` level × (order has phone / no phone) ×
  (phone matches / does not): assert `found` vs `unverified` vs escalation. The
  guest-checkout-on-Instagram case gets an explicit named test, since it is the leak this
  design exists to prevent.
- **Adapter** — a CS turn carrying `<<SUGGESTIONS>>` produces Instagram quick replies;
  the same turn on WhatsApp produces stripped text.
- **Migration** — the 68 existing rows resolve identically through the new
  `(channel, channel_user_id)` path.

## Milestones

| | Deliverable |
|---|---|
| 1 | Channel-agnostic core + migration step 1. WhatsApp behaves exactly as before. |
| 2 | Instagram adapter + trust model. Argania answers service questions in DM. |
| 3 | `instagram_cs` in the support inbox + cross-channel `list_open_threads`. |

## Operational prerequisites (outside this spec)

Argania must actually connect Instagram first, which needs: the Meta app in Live mode,
business verification, `argania_group` as a Professional account, "Allow access to
messages" enabled in Instagram settings, and `config.dm_bot_enabled` turned on. Argania's
connection will be the first real test of Advanced Access — LDRS does not prove it, since
LDRS is an app tester and its stored grants include permissions App Review rejected.
