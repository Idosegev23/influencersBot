# CS Engine — Milestone 2: Widget + Main Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site widget and the main chat page get a customer-service mode powered by `runCsTurnCore` — opening choice screen, support starter first, structured in-chat CS screens — and `/api/widget/order-lookup` is brought under control. All of it gated per account by `config.cs_web.enabled`; accounts without the flag are byte-identical to today.

**Architecture:** Spec: `docs/superpowers/specs/2026-08-12-bestie-cs-engine-design.md` (§3, §5, §6, §7, milestone 2), building on the M1 core (`runCsTurnCore`, `CsIdentity`, trust-gated lookups, migration 074). A shared web adapter (`src/lib/cs/web-adapter.ts`) builds the identity, runs the core, and returns `{text, suggestions, payloads}` — suggestions are **parsed** (web renders quick-reply chips), payloads are typed UI blocks collected by the core loop from tool results. Each existing route (`/api/widget/chat`, `/api/chat/stream`) gains a CS branch that emits the adapter result through its existing NDJSON envelope (new event type `payload`; both clients ignore unknown event types today, so this is non-breaking by construction).

**Tech Stack:** Next.js 16 / TS (type-check mandatory), vanilla-JS widget (`public/widget.js`, no framework, no tests), React chat page, Vitest for all server/lib logic.

## Global Constraints

- Gate everything on `accounts.config.cs_web?.enabled === true`. Flag off → every surface behaves exactly as today (the widget parity anchor is: config payload unchanged except an ignored extra field).
- WhatsApp parity holds: core changes are additive (`payloads` field ignored by `wa-cs-worker.ts`); CS suites must pass unchanged.
- Test with `npx vitest run <files>` — NEVER `npm run test` (bare `vitest` = watch mode, never exits).
- All user-facing copy respects account language (`he` default, `en` supported): widget copy goes in its `LOCALES`/server `WIDGET_LOCALES`, chat-page copy in `CHAT_PAGE_STRINGS`, brain-level language via the system prompt (Task 2).
- The verification rule stays in `src/lib/orders/*`; nothing in this milestone re-opens it.
- Path alias `@/*`; no new npm dependencies; commit per task to `main`, push at the end.
- `public/widget.js` has no test harness — keep edits surgical, follow its existing idioms (`formShell`, flat `view` state machine, `window.__ibot*` handlers), and verify with `node --check public/widget.js` after every edit.

## File Structure

- `src/lib/cs/payloads.ts` (new) — `CsUiPayload` union + `derivePayload(toolName, result)` pure mapper.
- `src/lib/cs/cs-agent.ts` — collect payloads in the loop; `CsTurnInput.boundAccountId` auto-bind; claimed-phone persistence.
- `src/lib/cs/cs-ticket.ts`, `src/lib/cs/tools/index.ts`, `cs-agent.ts` — channel-aware ticket `source`.
- `src/lib/cs/web-adapter.ts` (new) — `runWebCsTurn` (identity assembly, suggestions parsing, wire shape).
- `src/app/api/widget/chat/route.ts` — CS branch; `src/app/api/widget/config/route.ts` — `customerService` module flag; `src/app/api/widget/order-lookup/route.ts` — origin gate + CS-account 410.
- `src/app/api/chat/stream/route.ts` — CS branch + `payload` event type.
- `public/widget.js` — opening screen, support starter, mode state, payload rendering.
- `src/app/chat/[username]/page.tsx` + `src/hooks/useStreamChat.ts` + `src/components/chat/CsPayloadBlocks.tsx` (new) — opening choice, mode state, payload rendering, regex-redirect swap.

---

### Task 1: `CsUiPayload` + payload collection in the core loop

**Files:**
- Create: `src/lib/cs/payloads.ts`
- Modify: `src/lib/cs/cs-agent.ts` (tool-dispatch loop + `CsTurnResult`)
- Test: `tests/unit/cs-payloads.test.ts` (new), `tests/unit/cs-agent.test.ts` (extend)

**Interfaces:**
- Produces:
  - `type CsUiPayload = { kind: 'order_status_card'; order: { orderNumber?: string; status?: string; placedAt?: string; total?: string; itemSummary?: string; trackingUrl?: string; shipmentText?: string } } | { kind: 'details_form'; need: 'phone_and_order' | 'phone' } | { kind: 'ticket_confirmation'; ticketId: string } | { kind: 'escalation_notice' }`
  - `derivePayload(toolName: string, result: CsToolResult): CsUiPayload | null` (pure).
  - `CsTurnResult.payloads?: CsUiPayload[]` — appended in dispatch order, deduped by `kind` (last wins). WhatsApp worker ignores it (additive).

Mapping rules (all read `result.data`):
- `lookup_order` + `data.kind === 'found'` → `order_status_card` (fields from the outcome incl. `shipment?.statusText` → `shipmentText`, `trackingUrls?.[0]` → `trackingUrl`).
- `lookup_order`/`lookup_orders_by_phone` + `data.kind === 'identity_required'` → `details_form` (`need: 'phone_and_order'` for lookup_order, `'phone'` for by-phone).
- `open_or_attach_ticket`/`bind_brand` with `data.ticketId` → `ticket_confirmation`.
- `escalate_to_human` with `result.escalated` → `escalation_notice`.
- Anything else → `null`.

- [ ] **Step 1: Write failing tests** — `tests/unit/cs-payloads.test.ts` covering every rule above plus null cases; extend `cs-agent.test.ts` with one loop test: a mocked `lookup_order` handler returning `{ok:true, data:{kind:'found', orderNumber:'1042', status:'shipped'}}` → `runCsTurn` result carries `payloads: [{kind:'order_status_card', ...}]`.
- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/cs-payloads.test.ts tests/unit/cs-agent.test.ts`.
- [ ] **Step 3: Implement** — `payloads.ts` pure mapper; in `cs-agent.ts` dispatch loop (after the `result.cards` line): `const p = derivePayload(tc.name, result); if (p) payloads.set(p.kind, p);` and return `...(payloads.size ? { payloads: [...payloads.values()] } : {})`.
- [ ] **Step 4: Re-run + type-check** — same command + `npm run type-check` (no new errors vs the 68 baseline).
- [ ] **Step 5: Commit** — `feat(cs): structured UI payloads derived from tool results (spec §6)`.

---

### Task 2: Core web-readiness — auto-bind, claimed phone, ticket source, language

**Files:**
- Modify: `src/lib/cs/cs-agent.ts`, `src/lib/cs/cs-ticket.ts`, `src/lib/cs/tools/index.ts`, `src/lib/cs/cs-context.ts`
- Test: `tests/unit/cs-agent.test.ts`, `tests/unit/cs-ticket.test.ts` (extend)

**Interfaces:**
- `CsTurnInput` gains `boundAccountId?: string` (web channels: the account IS the brand) and `claimedPhone?: string` (a phone the visitor just typed into the details form).
- Produces in `runCsTurnCore`:
  1. **Auto-bind:** after session load, if `input.boundAccountId` and `session.active_account_id !== input.boundAccountId` → reuse the existing `applyBind(session, ctx, { accountId })` path (skipping the `whatsapp_cs.enabled` gate — that gate is about the shared-number roster; on web the account already chose to enable `cs_web`). ctx must exist before bind → build ctx first, bind second (reorder is contained).
  2. **Claimed phone persistence (spec §7):** effective claimed phone = `input.claimedPhone ?? session.context.claimedPhone`; when `input.claimedPhone` arrives it is persisted into `session.context.claimedPhone` with the end-of-turn context save. The identity handed to tools is rebuilt: for non-WhatsApp channels, `identity.phone = effectivePhone` and `trust = effectivePhone ? 'phone_claimed' : 'unverified'`. WhatsApp identities pass through untouched.
  3. **Ticket source:** `openOrAttachCsTicket` gains `source?: string` (default `'whatsapp_cs'`); cs-agent/tools thread `channel === 'widget' ? 'widget_cs' : channel === 'web_chat' ? 'web_cs' : 'whatsapp_cs'` via a new `ctx`-derived helper `ticketSourceFor(identity)` exported from `payloads.ts` or `identity.ts` (put it in `identity.ts`). `openCsThreads`/`previouslyEngagedAccountIds`/`loadOpenThreads` queries generalize `.eq('source','whatsapp_cs')` → `.in('source', ['whatsapp_cs','widget_cs','web_cs','instagram_cs'])`.
  4. **Language:** `buildCsSystemPrompt` already loads the account config — when the account's `language === 'en'` (accounts.language column, threaded via a new optional `language` field on the digest built in `buildContextDigest` from a param `runCsTurnCore` passes: `input.language`), append one line: `Reply in English — this brand's audience is English-speaking.` Default: no line (Hebrew stays).
- `CsTurnInput.language?: 'he' | 'en'`.

- [ ] **Step 1: Failing tests** — (a) `runCsTurnCore` with `boundAccountId` on a fresh widget session → session saved with `active_account_id` set and a chat_session created (assert via the existing store mock); (b) turn with `claimedPhone:'0501234567'` → tools receive identity `{channel:'widget', phone:'0501234567', trust:'phone_claimed'}` (capture ctx in a mocked handler) and next turn WITHOUT claimedPhone still gets it (from `session.context`); (c) `openOrAttachCsTicket` insert carries `source:'widget_cs'` when called with that source (extend cs-ticket.test.ts to its existing mock pattern).
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** exactly as the interface block above.
- [ ] **Step 4: Run** `npx vitest run tests/unit/cs-agent.test.ts tests/unit/cs-ticket.test.ts tests/unit/cs-tools.test.ts tests/unit/cs-context.test.ts` + type-check.
- [ ] **Step 5: Commit** — `feat(cs): web-channel core — auto-bind, lazy claimed phone, channel ticket sources, language hint (spec §5, §7)`.

---

### Task 3: Shared web adapter — `runWebCsTurn`

**Files:**
- Create: `src/lib/cs/web-adapter.ts`
- Test: `tests/unit/cs-web-adapter.test.ts`

**Interfaces:**
- Consumes: `runCsTurnCore`, `CsTurnInput` (Tasks 1–2).
- Produces:

```ts
export interface WebCsTurnParams {
  channel: 'widget' | 'web_chat';
  accountId: string;
  channelUserId: string;          // widget ANON_ID / chat-page persistent anon id
  text: string;
  claimedPhone?: string;          // from the details form
  mode?: 'cs' | 'content';        // forwarded to the core digest
  language?: 'he' | 'en';
}
export interface WebCsTurnResult {
  text: string;                   // suggestion-free reply text
  suggestions: string[];          // parsed from <<SUGGESTIONS>>a|b|c<</SUGGESTIONS>> — web RENDERS them (spec §5: parse where WhatsApp strips)
  payloads: CsUiPayload[];
}
export async function runWebCsTurn(p: WebCsTurnParams): Promise<WebCsTurnResult>
```

Implementation: build identity (`{channel, visitorId|sessionId: channelUserId, trust:'unverified'}` — the core upgrades trust from the stored/claimed phone), call `runCsTurnCore({identity, text, boundAccountId: accountId, claimedPhone, mode: p.mode ?? 'cs', language})`. Parse suggestions from the RAW reply — note `runCsTurnCore` strips them via `stripSuggestions` before returning, so the core must return them: add `suggestions?: string[]` to `CsTurnResult`, populated in the core right before stripping (parse `<<SUGGESTIONS>>(.*?)<</SUGGESTIONS>>` split on `|`, max 4, trimmed). WhatsApp worker ignores the field.

- [ ] **Step 1: Failing tests** — mock `cs-agent`'s `runCsTurnCore`; assert identity/boundAccountId/mode threading, suggestion pass-through, payload pass-through, and `kind:'none'` reply → `text:''`.
- [ ] **Step 2–4:** fail → implement (incl. the `CsTurnResult.suggestions` core addition + a cs-agent test that a reply containing the marker yields both stripped body AND parsed suggestions) → `npx vitest run tests/unit/cs-web-adapter.test.ts tests/unit/cs-agent.test.ts` + type-check.
- [ ] **Step 5: Commit** — `feat(cs): web adapter — suggestions parsed not stripped, payloads on the wire (spec §5)`.

---

### Task 4: Widget server — CS branch, config flag, order-lookup gate

**Files:**
- Modify: `src/app/api/widget/chat/route.ts`, `src/app/api/widget/config/route.ts`, `src/app/api/widget/order-lookup/route.ts`
- Test: `tests/unit/widget-cs-route.test.ts` (new — test the extracted branch helper, not the Next route plumbing)

**Interfaces:**
- Request additions to `/api/widget/chat` body: `mode?: 'cs'`, `csDetails?: { phone?: string; orderNumber?: string }`. When `mode === 'cs'` AND the account row's `config.cs_web?.enabled === true` (row already loaded at `route.ts:135-140`):
  - Skip `processWidgetMessage`; call `runWebCsTurn({channel:'widget', accountId, channelUserId: anonId, text: message (details submit synthesizes text `טלפון: <phone>, הזמנה: <orderNumber>` when message empty), claimedPhone: csDetails?.phone, language})`.
  - Emit through the SAME NDJSON stream: `meta` (unchanged) → `delta` with the full reply text (one event) → for each payload: `{type:'payload', payload}` → `{type:'suggestions', suggestions}` → `done` (sessionId = the cs session's chat session? — keep `sessionId` field absent in CS mode; the widget's CS state doesn't use chat_sessions restore).
  - `anonId` missing on a CS turn → 400 (identity is the session key).
- `/api/widget/config`: alongside `modules`, compute `customerService = { enabled: cfg.cs_web?.enabled === true }` and return it inside `modules`. Locale: add `cs` strings to `WIDGET_LOCALES` (he/en): `csChoice` ("שירות לקוחות"/"Customer service"), `contentChoice` ("לדבר על ___"→ use brandName: "לשוחח עם {brand}"/"Chat with {brand}"), `supportStarter` ("יש לי בעיה עם הזמנה"/"I have an issue with my order"), details-form labels.
- `/api/widget/order-lookup`: (1) add the SAME origin allow-list used by `/api/widget/chat` (`isOriginAllowed` — export it from a small shared module `src/app/api/widget/cors.ts` or duplicate the 15 lines; prefer extracting to `src/lib/widget/cors.ts` and importing from both routes); (2) when the account has `cs_web.enabled` → 410 `{code:'cs_mode'}` (widget in CS mode never calls it — belt and braces).

- [ ] **Step 1:** Extract the CS branch into a testable helper `handleWidgetCsTurn(args, deps)` in `src/lib/cs/web-adapter.ts` or the route file (export it); failing tests: event sequence for a turn with payloads+suggestions; 400 on missing anonId; non-CS accounts with `mode:'cs'` fall through to the sandwich path (flag off = parity).
- [ ] **Step 2–4:** fail → implement → run new test + type-check. Manually re-run `npx vitest run tests/unit` CS files.
- [ ] **Step 5: Commit** — `feat(widget): CS-mode server branch + cs_web config flag + order-lookup origin gate/410 (spec §5, §2)`.

---

### Task 5: Widget client — opening screen, support starter, CS conversation

**Files:**
- Modify: `public/widget.js`

No test harness — after EVERY edit run `node --check public/widget.js`. Follow the mapped idioms exactly.

Changes (all gated on `modules.customerService.enabled`, consumed from config at `widget.js:1027-1039`):

1. **State:** `var csMode = false;` + `var csDetailsPending = null;` near `var view` (`:61`). New-chat reset (`:1292-1294`) and the two other welcome-reset sites (`:1040`, `:1064`) reset `csMode = false`.
2. **Opening choice:** in `renderOpen()`'s chips block (`:1587-1589` — renders only pre-first-message), when CS enabled and no user message yet, render ABOVE the chips two large buttons (locale `csChoice` / `contentChoice`): CS button → `window.__ibotCsStart()` (sets `csMode = true`, pushes an assistant message with locale `csGreeting` — "היי! כאן שירות הלקוחות של {brand} 🙂 איך אפשר לעזור?" — and `render()`); content button → just focuses the input (dismisses nothing else; chips remain).
3. **Support starter first:** in `renderChipsRow` (`:1936`), when CS enabled, prepend locale `supportStarter` as chip 0 with a distinct class; its click handler enters CS mode AND sends the starter text as the first CS message (via the same send path).
4. **Send path:** in `sendMessage` body (`:1747-1755`) add `mode: csMode ? 'cs' : undefined` and `csDetails: csDetailsPending || undefined` (cleared after send).
5. **Stream events:** in the NDJSON reader add cases: `payload` → push pseudo-message `{role:'cs_payload', payload}`; `suggestions` → set `chips = data.suggestions` (reuse the chips row post-message in CS mode: relax the `no user message` condition when `csMode`).
6. **Payload rendering:** in the message loop (where `role:'cards'` is handled, `:1966` call site) add `role:'cs_payload'` → `renderCsPayload(p)`:
   - `order_status_card` → clone the `renderOrderResult` panel shape (`:3145`) inline in-chat (order number, status pill, total, itemSummary, tracking button).
   - `details_form` → inline mini-form (phone + optional order number inputs + submit button) using the `inputFieldHtml` builders; submit handler `window.__ibotCsDetails()` sets `csDetailsPending = {phone, orderNumber}` and calls `sendMessage()` with a synthetic message (locale `detailsSubmitted`: "שלחתי את הפרטים"). Render as already-submitted (disabled) once used.
   - `ticket_confirmation` → small confirmation card with the ticket ref (reuse `lastTicketRef` styling from `renderSupportSuccess`).
   - `escalation_notice` → notice card (locale `escalated`: "הפנייה הועברה לנציג/ה — נחזור אליך בהקדם 🙏").
7. **Retire-when-enabled:** when CS enabled, the header "?" support button (`:1281`) and the footer human-handoff link (`:1583-1590`) enter CS mode (`__ibotCsStart`) instead of `openSupportForm`; the `track_order` action confirm (`:2600-2666`) enters CS mode with the order question as message instead of `openOrderForm`. The `support_form` view itself stays in the file (non-CS accounts).

- [ ] **Step 1:** Implement 1–4; `node --check public/widget.js`.
- [ ] **Step 2:** Implement 5–7; `node --check public/widget.js`.
- [ ] **Step 3:** Smoke: `npm run dev` + open `/widget-preview?accountId=<demo>` with the flag toggled on a demo account (set `config.cs_web = {"enabled": true}` on the מאוחדת demo account via SQL, since it's `isDemo`), walk: opening screen → CS choice → "איפה ההזמנה שלי" → details form → submit → order card/escalation. Toggle flag off → widget identical to production behavior.
- [ ] **Step 4: Commit** — `feat(widget): CS mode — opening choice, support starter first, in-chat CS screens (spec §5, §6)`.

---

### Task 6: Chat-page server — CS branch in `/api/chat/stream`

**Files:**
- Modify: `src/app/api/chat/stream/route.ts`, `src/hooks/useStreamChat.ts`
- Test: `tests/unit/chat-stream-cs-branch.test.ts` (new, on an extracted helper)

**Interfaces:**
- Request additions: `mode?: 'cs'`, `csDetails?: {phone?, orderNumber?}`, `channelUserId?: string` (the page's persistent `anon_id_${username}`).
- Early in POST (after account load, before the sandwich path): if `mode === 'cs'` && `config.cs_web?.enabled === true` && `channelUserId` → emit `meta` (minimal: traceId/sessionId nulls ok) → `runWebCsTurn({channel:'web_chat', accountId, channelUserId, text: message, claimedPhone: csDetails?.phone, language})` → `delta` (full text) → `payload` events → `suggestions` inside `done`'s fullText path? No: emit `{type:'payload'}` events + reuse the EXISTING suggestions mechanism — append `<<SUGGESTIONS>>a|b<</SUGGESTIONS>>` back onto fullText in `done` so the page's existing `parseSuggestions` renders the pills with zero client change. `controller.close()`.
- `useStreamChat.ts`: add `payload` to the event union + an `onPayload` callback; unknown-event tolerance confirmed but the union is typed — add the case.

- [ ] **Step 1:** failing test on extracted `handleWebChatCsTurn` helper (event order, suggestions re-embedded in done.fullText, payload events).
- [ ] **Step 2–4:** implement → `npx vitest run tests/unit/chat-stream-cs-branch.test.ts` + type-check.
- [ ] **Step 5: Commit** — `feat(chat): CS-mode stream branch — web_chat identity via persistent anon id (spec §5)`.

---

### Task 7: Chat-page client — opening choice, mode state, payload rendering, redirect swap

**Files:**
- Create: `src/components/chat/CsPayloadBlocks.tsx`
- Modify: `src/app/chat/[username]/page.tsx`

All gated on `csWebEnabled = influencer?._rawConfig?.cs_web?.enabled === true`.

1. **Mode state:** `const [csMode, setCsMode] = useState(false)`; “new chat”/tab switches reset it.
2. **Persistent anon id → server:** thread the existing `anon_id_${username}` value (`page.tsx:324-331`) into every `sendStreamMessage` payload as `channelUserId` (extend the wrapper at `:634-639`), plus `mode: csMode ? 'cs' : undefined`, `csDetails` when a details form was submitted. Three send sites already funnel through the wrapper — verify all three.
3. **Opening choice:** in the empty state (where `StarterPills` renders, `:1750-1768`) when `csWebEnabled`: two prominent buttons above the pills — CS (`chatStrings`: he "שירות לקוחות" / en "Customer service") → `setCsMode(true)` + assistant greeting message appended locally; content ("לשוחח עם {displayName}") → no-op focus. **Support starter first:** prepend the support starter (he "יש לי בעיה עם הזמנה") to `quickReplies` before render; clicking it sets `csMode = true` and sends it as the message.
4. **Payload rendering:** `Message` type gains `csPayloads?: CsUiPayload[]` (append via `onPayload` during stream, attach in `onDone`). Render in the message loop OUTSIDE `DirectiveRenderer` (so cards persist in scrollback): `CsPayloadBlocks payloads={msg.csPayloads} language dir onDetailsSubmit` — a new component with the four blocks (order status card, details mini-form with phone+order inputs → `onDetailsSubmit({phone, orderNumber})` which sends a CS turn with `csDetails`, ticket confirmation, escalation notice). Tailwind, brandColor-aware, RTL/LTR via `dir` prop.
5. **Redirect swap (spec §3):** when `csWebEnabled`, the complaint-regex hit (`:918-941`) sets `csMode = true` and lets the message go to the CS branch **instead of** cancelling the stream and forcing `activeTab='support'`; the `showSupportModal`/`openSupportTab` directive handlers (`:945-980`) short-circuit to the same. When flag off — all current behavior preserved verbatim. (Server-side `stream/route.ts` support redirects stay for non-CS accounts; for CS accounts the client never sends them into that path because mode is already 'cs'. The server support-redirect branches gain a `!config.cs_web?.enabled` guard so a free-typed complaint on a CS account reaches the sandwich… no — free text with csMode false on a CS account: keep the server shipment/support redirects fenced off with the guard and let the client regex (which fires first) flip to CS. Guard both.)
6. **Strings:** add all new copy to `CHAT_PAGE_STRINGS` (he+en).

- [ ] **Step 1:** Implement `CsPayloadBlocks.tsx` + page wiring 1–4.
- [ ] **Step 2:** Implement 5–6. `npm run type-check`.
- [ ] **Step 3:** Smoke via `npm run dev` on the flagged demo account: opening buttons, support starter first, CS conversation with details form → order card, complaint mid-content flips to CS. Flag off → page behaves as production.
- [ ] **Step 4: Commit** — `feat(chat): CS mode on the main chat page — opening choice, support starter, payload blocks, regex swap (spec §3, §5, §6)`.

---

### Task 8: Milestone gate

- [ ] **Step 1:** `npx vitest run tests/unit --reporter=dot` — expect the same 4 pre-existing env failures only.
- [ ] **Step 2:** `npm run type-check` — no new errors vs baseline count (68).
- [ ] **Step 3:** `node --check public/widget.js`.
- [ ] **Step 4:** Enable `config.cs_web` on the מאוחדת demo account (or Argania if Ido prefers a commerce brand) and run the full widget + chat-page walkthrough once more against dev.
- [ ] **Step 5:** `git push`; update memory (M2 shipped, flag name, rollout state).
