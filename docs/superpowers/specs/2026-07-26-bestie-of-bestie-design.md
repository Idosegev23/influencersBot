# Bestie of Bestie — Design Spec

**Date:** 2026-07-26
**Author:** Ido + Claude
**Status:** Approved (design), pending implementation plan
**Area:** New `bestie` account → one brain → two surfaces (Meta-lead WhatsApp sales, in-dashboard support widget)

---

## 1. Context & Problem

Meta ads promoting Bestie are running now. Leads fill an instant form and land in Make, and from
there nothing happens automatically — no message goes out, no conversation starts, no one is
notified until a human looks. Every hour between form-fill and first contact is a lead cooling off.

At the same time, brands already inside their Bestie dashboard have no one to ask. "Where do I
change the bot's personality?" has no answer inside the product; it becomes a WhatsApp message
to Ido.

Both problems are the same missing asset: **Bestie has no Bestie.** Every brand on the platform
gets an account with a persona and a knowledge base. Bestie itself does not have one. It cannot,
by the normal path — the scan pipeline builds accounts by scraping a website and an Instagram
profile, and Bestie the product has no digital assets to scrape.

So the asset has to be authored rather than harvested. Once it exists, it serves both surfaces.

## 2. Scope

**In scope**

- A first-class `bestie` account: archetype, persona, knowledge base, all hand-authored.
- **Surface A** — Meta lead → WhatsApp conversation → qualification → handoff to a human.
- **Surface B** — a widget inside the brand's dashboard that answers questions about Bestie and
  routes the user to the right screen and button.

**Out of scope**

- Calendar booking. The bot does not schedule meetings (Ido, explicitly — may expand later).
- Auto-generated demos. The `quote` scan mode exists and would fit here, but is deferred.
- Per-customer WhatsApp numbers. One number: Bestie's own.
- Surface B taking actions. v1 points; it does not change settings. See §8.
- The internal `/admin/*` screens. Surface B covers the 25 customer screens under
  `src/app/influencer/` only.

**Note on scope size.** This spec covers three subsystems that could each stand alone. That was
raised during design and Ido chose a single spec deliberately. It is therefore written in phases
(§12) so the implementation plan can land them in sequence rather than as one drop.

## 3. Decisions

Recorded so implementation does not re-litigate them.

| Decision | Choice |
|---|---|
| Surface A's terminal state | Handoff to a human. No booking, no demo. |
| Lead ingestion | Lead Ad → Make → our HTTP endpoint. Not a direct Meta `leadgen` webhook. |
| WhatsApp number | Bestie's own, shared with existing CS/notification traffic. |
| Handoff mechanism | Bot thanks and closes; email to five recipients. |
| Surface B capability | Explains and links. Does not act. |
| Surface B location | The brand's dashboard (`/influencer/[username]/*`). |
| Knowledge refresh trigger | Manual (`npm run bestie:kb`). |
| Consent gate | **None.** See §3.1. |

### 3.1 Accepted risks

Two design positions carry known downside. Both are Ido's call, made after the risk was stated.
They are recorded here as decisions, not as open questions.

**No opt-in check before messaging.** Meta's WhatsApp Business policy expects explicit opt-in
before a template message. Enforcement is indirect: recipients who block or report drive the
number's quality rating down, and a degraded rating reduces messaging limits or restricts the
number. That number also carries brand customer service and every notification template in the
system, so a quality hit is not contained to this feature. Ido accepted this ("שחרר את ההסכמה").
The engine sends to every lead in the form.

**Manual knowledge refresh.** Nothing forces `npm run bestie:kb` to run. If the dashboard UI
changes and the script is not run, Bestie will confidently direct a customer to a screen or button
that no longer exists — and will sound exactly as certain as when it is right. The mitigation that
survives this choice is the link assertion in §11, which at least prevents dead routes from
reaching a user.

## 4. The `bestie` account

A new row in `accounts` with a new archetype: **`saas_product`**.

A new archetype rather than reusing `service_provider` because Bestie differs at the existing
branch points, not in labelling: no scan sources (so the daily scan crons never touch it), no
product catalog, no recommendations, and `config.coupons_disabled: true` — Bestie has no coupons
or promotions, and a bot that invents one creates an obligation someone has to honour.

This is *not* the existing `LDRS GROUP` account (`de38eac6-d2fb-46a7-ac09-5ec860147ca0`). That is
the agency. Bestie is the product, and conflating them would put agency-service knowledge into a
bot answering questions about a SaaS product.

`chatbot_persona` is authored by hand. An account without one is a half-account: the persona is
what makes the answers sound like Bestie rather than like a generic assistant.

## 5. The knowledge base

### 5.1 The boundary

Ido's constraint, and the single most important rule in this spec:

> Bestie answers about **Bestie**. Not about clients, not about internals.

Operationally: **Bestie knows the product's surface, not its engine.** Screens, buttons, flows,
what a feature does and what it costs — yes. Code, database, architecture, security work, other
accounts' names or data — no.

The line is enforced twice, because a single point of enforcement fails silently:

1. **At ingest** — a redaction filter rejects content matching internal markers (other account
   names, infrastructure identifiers, security-fix language) before it becomes a chunk.
2. **At generation** — a system-prompt rule refusing anything outside Bestie's own surface.

### 5.2 Two bodies of knowledge

**Commercial** (primarily Surface A): what Bestie is, who it is for, what it costs, what a
customer gets, what is needed to start, typical results, and the objections that actually come up.

**Product surface** (primarily Surface B): one entry per customer screen — its route, what it is
for, when you would go there, and the two or three most common tasks with the button that does
each one.

Both are markdown under `content/bestie-kb/`, ingested into `document_chunks` with
`entity_type = 'knowledge_base'` and a `metadata.source = 'bestie_kb'` discriminator.
`entity_type` has a CHECK constraint that blocks new values, so the discriminator goes in
`metadata`, not in a new entity type.

### 5.3 Seeding and refresh

The product-surface knowledge has a natural spine already in the repo: `src/lib/i18n/dashboard/`
is 20 files and 2,468 lines covering the dashboard **screen by screen**, near 1:1 with the route
tree, in Hebrew and English, including button labels. It is maintained by whoever ships a feature,
because a feature without labels does not ship.

That gives structure — route, title, sections, button names — for free, and it is what makes
button-level answers possible at all. What it cannot give is *why* you would use a screen, *when*,
and what to do when something looks wrong. That is authored once per screen and then only
maintained.

`npm run bestie:kb` diffs the catalog against the current knowledge, drafts entries for what is
new in customer-facing language, and writes them into `content/bestie-kb/`. Drafts land in the
working tree, so they appear in the diff before they are committed — that is the review, and it is
the only one (§3.1).

## 6. The brain

`src/lib/bestie/` with `runBestieTurn`, modelled directly on `runCsTurn`
(`src/lib/cs/cs-agent.ts`, 238 lines): a brain-led tool loop, not a state machine. The model calls
tools, receives results, and repeats until it produces final text. No button or menu trees.

One brain serves both surfaces. What differs is the tool set and what the brain is told about who
it is talking to.

| | Surface A (lead) | Surface B (customer) |
|---|---|---|
| Who is speaking | A stranger, identified only by phone | An authenticated account, known |
| Tools | `search_bestie_knowledge`, `note_lead_detail`, `handoff_to_sales` | `search_bestie_knowledge`, `route_to_screen` |
| Context injected | Form fields, campaign, what has been learned so far | Account, plan, **the screen they are currently on** |

### 6.1 When Bestie does not know

She says so, and offers a human. She does not guess.

This matters most for price. A sales bot that invents a number creates a commitment a person then
has to honour or walk back, and the customer heard it from the company. Any price not present in
the knowledge base is not spoken — the answer is that a person will confirm it.

## 7. Surface A — Meta leads to WhatsApp

### 7.1 Flow

```
Meta instant form
  → Make (HTTP module)
  → POST /api/leads/meta-ads          ← exists today as capture-only
  → normalise + persist lead
  → send approved opening template (quick-reply button)
  → lead taps / replies                ← this opens the 24h window
  → WhatsApp webhook, 5th branch
  → runBestieTurn (sales tools)
  → qualification conversation
  → handoff_to_sales → email to five, bot goes silent
```

### 7.2 The opening message is a template, not a message

After a form fill there is no open conversation — the lead has never written to us. Meta permits
opening one **only with a pre-approved template**. Free-form conversation begins only once the
lead replies; their reply opens a 24-hour window in which the bot can say anything.

This shapes the opening move rather than blocking it. The template is designed to *earn a reply*:
short, personal, referencing the form they just filled, with a quick-reply button beneath it. The
tap is itself an inbound message. The template is the door, not the conversation.

**Lead-time dependency:** template approval takes hours to days and is outside our control.
The opening template and both nudge templates (§7.5) must be submitted on day one of
implementation or they become the critical path. Template parameters have formatting restrictions
(no newlines, tabs, or runs of 5+ spaces) — the sanitiser in `runTemplate()`
(`src/lib/whatsapp-notify.ts`) already handles this.

### 7.3 Payload

Confirmed against a real Meta test lead on 2026-07-26 (Make → endpoint → DB, verified working):

```json
{ "form_id": "1816400769736719", "leadgen_id": "...", "created_time": "...",
  "full_name": "...", "phone_number": "...", "email": "...",
  "ad_id": "", "adset_id": "", "campaign_id": "" }
```

Observations that constrain implementation:

- The form's questions are named `שם_מלא` and `מספר_טלפון` (revealed by Meta's test-lead
  placeholders, which read `dummy data for <field name>`).
- `ad_id` / `adset_id` / `campaign_id` come back **empty on test leads** and populate only in
  production. The engine must treat them as optional; nothing may depend on their presence.
- Phone format from production leads is still unobserved — the test tool returns a placeholder
  rather than a number. Normalisation must handle Israeli local formats (`050-1234567`,
  `0501234567`) as well as E.164, converting a leading `0` to `+972`.
- `form_id` is the campaign discriminator. Routing keys off it so that a second form for a
  different campaign can behave differently rather than being treated as the same lead type.

### 7.4 The fifth webhook branch

`src/app/api/webhooks/whatsapp/route.ts` currently routes an inbound through four branches in
order: Itamar handoff → registered agent → open support ticket → customer-service bot.

Bestie leads insert **before the CS branch**. Both branches see an unknown sender, so the
discriminator is explicit: *does this `wa_id` have an active Bestie lead session?* A lead asking
about Bestie is not a shopper asking about a brand, and must not reach the CS brain.

Ordering is a correctness property, not a detail — see §11.

### 7.5 No reply

One nudge at 24 hours, one at 72 hours, then an "unresponsive lead" email and stop. Both nudges
need their own approved templates, because the 24-hour window has closed by then.

### 7.6 Handoff

`handoff_to_sales` sends one email to `kfir@`, `roei@`, `itamar@`, `cto@`, `yoav@ldrsgroup.com`
containing the summary, the qualification detail gathered, and the full transcript.

The bot then **goes silent on that conversation**. A salesperson picking up a thread the bot is
still working is worse than no automation at all.

## 8. Surface B — the dashboard widget

Lives in the brand's dashboard (`/influencer/[username]/*`), authenticated, so it knows which
account is asking, their plan and state, and **which screen they are on right now**. That last one
is what makes the difference between "the toggle is in bot settings somewhere" and "it is on this
screen, second tab".

`route_to_screen` returns a real route plus the section and button name, drawn from the knowledge
entry for that screen.

**v1 points; it does not act.** Asked to "turn off my bot", Bestie answers where the switch is and
links to it. She does not flip it. This keeps a misread instruction from changing settings on a
live customer account, and defers the permission design until real usage shows which actions are
worth the risk.

## 9. Data model

| Table | Change |
|---|---|
| `accounts` | One row: `bestie`, archetype `saas_product`, coupons disabled, no scan sources |
| `chatbot_persona` | One hand-authored row for that account |
| `document_chunks` | KB chunks, `entity_type='knowledge_base'`, `metadata.source='bestie_kb'` |
| `bestie_lead_sessions` | Per-`wa_id` conversation state, mirroring `whatsapp_cs_sessions` |
| `bestie_leads` | The lead record: form fields, `form_id`, campaign attribution, status, qualification, handoff timestamp |
| `meta_lead_captures` | Exists. Raw-payload debugging; already RLS-on with `expires_at` |

Embedding dimension must match what the column expects — a 1536/2000 mismatch has silently
produced zero-chunk ingests here before.

## 10. Reuse

Little of this is new machinery. What already exists and should be used rather than rebuilt:

- `runCsTurn` — the brain-led tool-loop shape (`src/lib/cs/cs-agent.ts`)
- `wa-cs-queue` / `wa-cs-worker` / `wa-cs-locks` — per-`wa_id` FIFO with redelivery guards
- `whatsapp_cs_sessions` — the session-row shape, including the warm-window idea
- `runTemplate` + the WhatsApp Cloud client — template send, parameter sanitising, cost tracking
- The RAG ingestion path — chunking and embedding
- `src/lib/i18n/dashboard/` — the screen/label spine (§5.3)

New: the lead intake, the sales and routing tools, the KB authoring pipeline, and the widget.

## 11. Acceptance

A bot that fails here fails quietly — it sounds confident either way. So the tests assert the
things that are invisible in a demo:

1. **No invented prices.** A price absent from the knowledge base is never stated. The reply
   defers to a person.
2. **Every emitted link resolves.** Routes returned by `route_to_screen` are asserted against the
   real route tree. A link to a deleted screen fails the build, not the customer.
3. **The boundary holds.** Questions about other clients, architecture, or internals are refused
   rather than answered from whatever the retrieval happened to surface.
4. **Handoff fires and carries the transcript.** The five recipients receive it; the bot stops
   talking on that conversation afterwards.
5. **The fifth branch swallows nothing.** Itamar handoff, registered agents, open support tickets,
   and CS traffic still route exactly as they do today. This protects production behaviour that
   works, and is the highest-value test in the list.
6. **Redelivery is a no-op.** Meta retries webhooks; the same lead or message must not produce two
   conversations or two emails.

## 12. Phasing

The plan should land these in order. Each is independently useful.

1. **Core** — account, archetype, persona, KB pipeline, seeded knowledge.
2. **Surface A** — lead intake upgrade, templates, fifth branch, sales tools, handoff, nudges.
3. **Surface B** — widget, routing tool, screen-context injection.

Surface A before B: the ads are live, and A exercises the knowledge base against real strangers
before it is put in front of paying customers.

## 13. Dependencies

- **Meta template approval** — submit on day one (§7.2).
- **`META_LEADS_WEBHOOK_SECRET`** — not yet set in Vercel. Until it is, captures land
  `verified=false`. Enforcement activates automatically once set; no Make-side change needed.
- **Production phone format** — unobserved (§7.3). The first real lead should be inspected before
  the normaliser is considered done.

---

## Appendix — what is already built

`POST /api/leads/meta-ads` is live as **capture-only**: it stores payloads verbatim in
`meta_lead_captures` and sends nothing to anyone. It exists so the spec could be written against
an observed payload rather than a guess, and it does not become the real intake until Phase 2.
