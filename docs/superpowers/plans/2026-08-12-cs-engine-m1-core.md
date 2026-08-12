# CS Engine — Milestone 1: Channel-Agnostic Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `runCsTurn` channel-agnostic — identity with a trust level, trust-gated order verification, an archetype-aware tool registry, and the `(channel, channel_user_id)` session migration — while WhatsApp behaves **exactly** as today.

**Architecture:** Spec: `docs/superpowers/specs/2026-08-12-bestie-cs-engine-design.md` (§1, §2, §4, §8, milestone 1). A new `CsIdentity` discriminated union replaces `CsToolCtx.senderPhone`; order verification moves to a pure `verifyOrderAccess(orderPhone, identity)` trust matrix enforced inside `lookupOrder`/`lookupOrdersByPhone`; the flat `TOOLS` array becomes a registry filtered by channel + archetype + account config; `whatsapp_cs_sessions` gains `channel`/`channel_user_id` non-destructively. `runCsTurn` gets a channel-agnostic `CsTurnInput` entry with the existing `CsJob` path as a thin wrapper.

**Tech Stack:** Next.js 16 / TypeScript (strict:false — always run `npm run type-check`), Supabase (postgres), Vitest, OpenAI function-calling loop.

## Global Constraints

- WhatsApp parity is the gate: after every task `npx vitest run` on the touched CS test files must pass, and after the final task the FULL unit suite + `npm run type-check` must pass (build ignores TS errors, so type-check is mandatory).
- Path alias `@/*` → `./src/*` for all internal imports.
- No behavior change reachable from WhatsApp: `channel: 'whatsapp'` identities must produce byte-identical tool results for every case that exists today.
- The verification check lives in `src/lib/orders/*`, never in a prompt (spec §2).
- Commit each task to `main` (stage only that task's files); push once at the final task.
- No new npm dependencies.
- Migration is non-destructive step 1 only: add columns + backfill + unique index. `wa_id` stays populated and remains the PK. Dropping anything is milestone-2+ (spec §8 step 2).

---

### Task 1: `CsIdentity` type + helpers

**Files:**
- Create: `src/lib/cs/identity.ts`
- Test: `tests/unit/cs-identity.test.ts`

**Interfaces:**
- Produces: `CsIdentity` (union), `CsChannel`, `identityPhone(id: CsIdentity): string | null`, `identityKey(id: CsIdentity): { channel: CsChannel; channelUserId: string }`, `whatsappIdentity(waId: string): CsIdentity`. Every later task imports from `@/lib/cs/identity`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/cs-identity.test.ts
import { describe, it, expect } from 'vitest';
import { identityPhone, identityKey, whatsappIdentity, type CsIdentity } from '@/lib/cs/identity';

describe('CsIdentity helpers', () => {
  it('whatsappIdentity builds a channel_verified identity keyed on waId', () => {
    const id = whatsappIdentity('972501112222');
    expect(id).toEqual({ channel: 'whatsapp', waId: '972501112222', trust: 'channel_verified' });
  });

  it('identityPhone: whatsapp → waId; claimed channels → claimed phone or null', () => {
    expect(identityPhone(whatsappIdentity('972501112222'))).toBe('972501112222');
    const ig: CsIdentity = { channel: 'instagram', igsid: 'ig-1', trust: 'unverified' };
    expect(identityPhone(ig)).toBeNull();
    const widget: CsIdentity = { channel: 'widget', visitorId: 'v-1', phone: '0501112222', trust: 'phone_claimed' };
    expect(identityPhone(widget)).toBe('0501112222');
  });

  it('identityKey maps each channel to its (channel, channel_user_id) pair', () => {
    expect(identityKey(whatsappIdentity('972501112222'))).toEqual({ channel: 'whatsapp', channelUserId: '972501112222' });
    expect(identityKey({ channel: 'instagram', igsid: 'ig-1', trust: 'unverified' })).toEqual({ channel: 'instagram', channelUserId: 'ig-1' });
    expect(identityKey({ channel: 'widget', visitorId: 'v-1', trust: 'unverified' })).toEqual({ channel: 'widget', channelUserId: 'v-1' });
    expect(identityKey({ channel: 'web_chat', sessionId: 's-1', trust: 'unverified' })).toEqual({ channel: 'web_chat', channelUserId: 's-1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cs-identity.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cs/identity'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/cs/identity.ts
// Spec §1 (2026-08-12-bestie-cs-engine-design.md): identity as a parameter, with a trust level.
// `trust` is the load-bearing field — tools branch on trust, never on channel, so a future
// channel declares its trust level instead of adding a special case.
export type CsChannel = 'whatsapp' | 'instagram' | 'widget' | 'web_chat';

export type CsIdentity =
  | { channel: 'whatsapp';  waId: string;                       trust: 'channel_verified' }
  | { channel: 'instagram'; igsid: string;     phone?: string;  trust: 'unverified' | 'phone_claimed' }
  | { channel: 'widget';    visitorId: string; phone?: string;  trust: 'unverified' | 'phone_claimed' }
  | { channel: 'web_chat';  sessionId: string; phone?: string;  trust: 'unverified' | 'phone_claimed' };

/** The phone this identity is entitled to search/verify with. Meta-verified on WhatsApp; a CLAIM elsewhere. */
export function identityPhone(id: CsIdentity): string | null {
  if (id.channel === 'whatsapp') return id.waId;
  return id.phone?.trim() || null;
}

/** The (channel, channel_user_id) session key (spec §8). */
export function identityKey(id: CsIdentity): { channel: CsChannel; channelUserId: string } {
  switch (id.channel) {
    case 'whatsapp':  return { channel: 'whatsapp',  channelUserId: id.waId };
    case 'instagram': return { channel: 'instagram', channelUserId: id.igsid };
    case 'widget':    return { channel: 'widget',    channelUserId: id.visitorId };
    case 'web_chat':  return { channel: 'web_chat',  channelUserId: id.sessionId };
  }
}

export function whatsappIdentity(waId: string): CsIdentity {
  return { channel: 'whatsapp', waId, trust: 'channel_verified' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/cs-identity.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cs/identity.ts tests/unit/cs-identity.test.ts
git commit -m "feat(cs): CsIdentity — channel identity with trust level (CS engine M1, spec §1)"
```

---

### Task 2: `verifyOrderAccess` trust matrix

**Files:**
- Modify: `src/lib/orders/phone-verify.ts`
- Test: `tests/unit/phone-verify.test.ts` (append a new describe block; existing `phoneMatches` tests stay untouched)

**Interfaces:**
- Consumes: `CsIdentity`, `identityPhone` from Task 1.
- Produces: `verifyOrderAccess(orderPhone: string | null | undefined, identity: CsIdentity): OrderAccessVerdict` where `type OrderAccessVerdict = 'ok' | 'mismatch' | 'identity_required' | 'escalate'`. `phoneMatches` stays exported (still used by verified-path internals and other call sites).

The matrix (spec §2):

| trust | order has phone | phones match | verdict |
|---|---|---|---|
| `channel_verified` | no | — | `ok` (reveal-when-absent — WhatsApp only) |
| `channel_verified` | yes | yes | `ok` |
| `channel_verified` | yes | no | `mismatch` |
| `phone_claimed` | no | — | `escalate` (never reveal a guest-checkout order to a claim) |
| `phone_claimed` | yes | yes | `ok` |
| `phone_claimed` | yes | no | `mismatch` |
| `unverified` | — | — | `identity_required` (nothing to match against) |

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/phone-verify.test.ts
import { verifyOrderAccess } from '@/lib/orders/phone-verify';
import { whatsappIdentity, type CsIdentity } from '@/lib/cs/identity';

const claimed = (phone?: string): CsIdentity =>
  phone
    ? { channel: 'widget', visitorId: 'v-1', phone, trust: 'phone_claimed' }
    : { channel: 'widget', visitorId: 'v-1', trust: 'unverified' };

describe('verifyOrderAccess (trust matrix, spec §2)', () => {
  const wa = whatsappIdentity('972501234567');

  it('channel_verified: reveal-when-absent + match/mismatch', () => {
    expect(verifyOrderAccess(null, wa)).toBe('ok');
    expect(verifyOrderAccess('', wa)).toBe('ok');
    expect(verifyOrderAccess('0501234567', wa)).toBe('ok');
    expect(verifyOrderAccess('0509999999', wa)).toBe('mismatch');
  });

  it('phone_claimed: matching claim ok, mismatch rejected', () => {
    expect(verifyOrderAccess('0501234567', claimed('+972-50-123-4567'))).toBe('ok');
    expect(verifyOrderAccess('0509999999', claimed('0501234567'))).toBe('mismatch');
  });

  it('GUEST-CHECKOUT LEAK GUARD: a no-phone order is NEVER revealed to a claimed identity — it escalates', () => {
    // This is the leak the whole design exists to prevent (spec §2): a widget visitor who
    // guesses an order number must not see a guest-checkout order.
    expect(verifyOrderAccess(null, claimed('0501234567'))).toBe('escalate');
    expect(verifyOrderAccess('', claimed('0501234567'))).toBe('escalate');
  });

  it('unverified: both cases refuse with identity_required', () => {
    expect(verifyOrderAccess('0501234567', claimed(undefined))).toBe('identity_required');
    expect(verifyOrderAccess(null, claimed(undefined))).toBe('identity_required');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/phone-verify.test.ts`
Expected: FAIL — `verifyOrderAccess` is not exported

- [ ] **Step 3: Write the implementation**

```ts
// append to src/lib/orders/phone-verify.ts
import { identityPhone, type CsIdentity } from '@/lib/cs/identity';

export type OrderAccessVerdict = 'ok' | 'mismatch' | 'identity_required' | 'escalate';

/**
 * Trust-gated order access (spec §2 of the CS-engine design). Reveal-when-absent applies ONLY
 * to channel_verified (Meta vouches for the sender). A claimed phone must match a phone the
 * order actually carries; a no-phone order under a claim ESCALATES instead of revealing.
 * This is an access control, not a prompt suggestion — it runs whether or not the model cooperates.
 */
export function verifyOrderAccess(orderPhone: string | null | undefined, identity: CsIdentity): OrderAccessVerdict {
  const phone = identityPhone(identity);
  if (identity.trust === 'channel_verified') {
    return phoneMatches(orderPhone, phone!) ? 'ok' : 'mismatch';
  }
  if (!phone) return 'identity_required';
  if (!orderPhone || !orderPhone.trim()) return 'escalate';
  return phoneMatches(orderPhone, phone) ? 'ok' : 'mismatch';
}
```

(`phoneMatches` already implements reveal-when-absent + normalized comparison via `toWaId`; the verified branch reuses it verbatim, so WhatsApp behavior cannot drift.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/phone-verify.test.ts`
Expected: PASS (existing 4 `phoneMatches` tests + 4 new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/phone-verify.ts tests/unit/phone-verify.test.ts
git commit -m "feat(orders): verifyOrderAccess trust matrix — reveal-when-absent is channel_verified-only (spec §2)"
```

---

### Task 3: `CsToolCtx.identity` replaces `senderPhone`

**Files:**
- Modify: `src/lib/cs/tools/types.ts` (the `CsToolCtx` interface)
- Modify: `src/lib/cs/tools/index.ts` (every `ctx.senderPhone` read)
- Modify: `src/lib/cs/cs-agent.ts` (ctx construction, line ~209)
- Test: `tests/unit/cs-tools.test.ts` (the `ctx` helper + assertions on pass-through args)

**Interfaces:**
- Consumes: `CsIdentity`, `identityPhone`, `whatsappIdentity` from Task 1.
- Produces: `CsToolCtx.identity: CsIdentity` (replacing `senderPhone: string`; `waId: string` field stays — it is the WhatsApp send address and ticket key). Task 4 reads `ctx.identity` in the order tools; Task 6's registry and Task 7's core input rely on this shape.

In this task the LOOKUP layer is untouched: tools derive the phone via `identityPhone(ctx.identity)` and pass it to the existing string-typed `lookupOrder`/`lookupOrdersByPhone`/phone-variant helpers, so behavior is identical.

- [ ] **Step 1: Update the `ctx` test helper and add an identity-threading assertion**

In `tests/unit/cs-tools.test.ts`, change the `ctx` factory (top of file):

```ts
import { whatsappIdentity } from '@/lib/cs/identity';
const ctx = (over: any = {}) => ({
  waId: '972501112222', accountId: null, chatSessionId: null, ticketId: null,
  customerName: 'דנה', identity: whatsappIdentity('972501112222'), ...over,
} as any);
```

And add one test in the main describe block:

```ts
it('lookup_order derives its phone from ctx.identity (whatsapp → waId)', async () => {
  lookupOrder.mockResolvedValue({ kind: 'found', found: true, orderNumber: '1001' });
  const r = await (await tool('lookup_order')).handler({ orderNumber: '1001' }, ctx({ accountId: 'acc-1' }));
  expect(r.ok).toBe(true);
  expect(lookupOrder).toHaveBeenCalledWith('acc-1', '1001', '972501112222');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cs-tools.test.ts`
Expected: the new test FAILS (handler still reads `ctx.senderPhone`, which the helper no longer provides → `lookupOrder` called with `undefined`). Some existing tests that relied on `senderPhone` may also fail — that's the point; they pass again after Step 3.

- [ ] **Step 3: Implement the refactor**

`src/lib/cs/tools/types.ts` — replace the `senderPhone` line:

```ts
import type { CsIdentity } from '@/lib/cs/identity';

export interface CsToolCtx {
  waId: string;                  // WhatsApp send address / ticket key (still whatsapp-shaped in M1)
  accountId: string | null;
  chatSessionId: string | null;
  ticketId: string | null;
  customerName: string | null;
  identity: CsIdentity;          // WHO is asking + how much we trust it (spec §1). Replaces senderPhone.
  lastImageUrl?: string | null;
  productCandidates?: CsProductCard[];
}
```

`src/lib/cs/tools/index.ts` — mechanical replacement of every `ctx.senderPhone`:

```ts
import { identityPhone } from '@/lib/cs/identity';
// resolve_brand handler:        previouslyEngagedAccountIds(identityPhone(ctx.identity) ?? ctx.waId)
// lookup_order handler:         lookupOrder(ctx.accountId, orderNumber, identityPhone(ctx.identity) ?? '')
// lookup_orders_by_phone:       lookupOrdersByPhone(ctx.accountId, identityPhone(ctx.identity) ?? '')
// list_open_threads handler:    openCsThreads(identityPhone(ctx.identity) ?? ctx.waId)
// bind_brand handler:           customerPhone: identityPhone(ctx.identity) ?? ctx.waId
// open_or_attach_ticket:        customerPhone: identityPhone(ctx.identity) ?? ctx.waId
```

(For a WhatsApp identity `identityPhone` IS the waId, so every value is byte-identical to today. The `?? ctx.waId` fallbacks keep the ticket/thread keys non-empty for future claimed channels; the `?? ''` on the two order lookups is temporary — Task 4 replaces those call sites with the identity itself.)

`src/lib/cs/cs-agent.ts` — the ctx construction (step 5 comment, line ~209):

```ts
import { whatsappIdentity } from '@/lib/cs/identity';
const ctx: CsToolCtx = { waId, accountId: session.active_account_id, chatSessionId: session.active_chat_session_id, ticketId: session.active_ticket_id, customerName: session.customer_name, identity: whatsappIdentity(waId), lastImageUrl: img?.url ?? null };
```

Also update `phoneVariants(waId)` call sites in `cs-agent.ts` (`loadOpenThreads`) — unchanged, they already take a plain string.

- [ ] **Step 4: Run the touched suites + type-check**

Run: `npx vitest run tests/unit/cs-tools.test.ts tests/unit/cs-tools-products.test.ts tests/unit/cs-agent.test.ts && npm run type-check`
Expected: PASS. If `cs-agent.test.ts` or `cs-tools-products.test.ts` construct a ctx with `senderPhone`, update those constructions to `identity: whatsappIdentity(...)` the same way — assertions must NOT change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cs/tools/types.ts src/lib/cs/tools/index.ts src/lib/cs/cs-agent.ts tests/unit/cs-tools.test.ts tests/unit/cs-tools-products.test.ts tests/unit/cs-agent.test.ts
git commit -m "refactor(cs): CsToolCtx.identity replaces senderPhone — WhatsApp byte-identical (spec §1)"
```

---

### Task 4: Trust-gated `lookupOrder` / `lookupOrdersByPhone`

**Files:**
- Modify: `src/lib/orders/lookup.ts`
- Modify: `src/lib/cs/tools/index.ts` (the two order-tool handlers)
- Test: `tests/unit/lookup-order.test.ts` (+ `tests/unit/xphase-lookup-order.test.ts` if it constructs calls — update signatures only)

**Interfaces:**
- Consumes: `CsIdentity`, `whatsappIdentity`, `identityPhone` (Task 1); `verifyOrderAccess` (Task 2).
- Produces:
  - `lookupOrder(accountId: string, orderNumber: string, identity: CsIdentity): Promise<OrderLookupOutcome>` where `OrderLookupOutcome` gains two members: `{ kind: 'identity_required' }` and `{ kind: 'escalate' }` (existing `found | not_found | ambiguous | unverified` stay).
  - `lookupOrdersByPhone(accountId: string, identity: CsIdentity): Promise<{ kind: 'identity_required' } | { kind: 'found'; orders: OrderLookupResult[] }>`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/lookup-order.test.ts` already mocks the connector/brand-orders layers — follow its existing mock setup, change every call site to pass an identity, and add this describe block:

```ts
import { whatsappIdentity, type CsIdentity } from '@/lib/cs/identity';

const widgetClaim = (phone?: string): CsIdentity =>
  phone
    ? { channel: 'widget', visitorId: 'v-1', phone, trust: 'phone_claimed' }
    : { channel: 'widget', visitorId: 'v-1', trust: 'unverified' };

describe('lookupOrder trust gating (spec §2)', () => {
  it('unverified identity → identity_required BEFORE any connector pull (no data touched)', async () => {
    const out = await lookupOrder('acc-1', '1001', widgetClaim(undefined));
    expect(out.kind).toBe('identity_required');
    expect(pullMock).not.toHaveBeenCalled();
  });

  it('GUEST-CHECKOUT-ON-WIDGET: no-phone order + claimed phone → escalate, never found', async () => {
    setOrderRow({ order_number: '1001', customer_phone: null, source_platform: 'quickshop' });
    const out = await lookupOrder('acc-1', '1001', widgetClaim('0501234567'));
    expect(out.kind).toBe('escalate');
  });

  it('claimed phone matching the order phone → found', async () => {
    setOrderRow({ order_number: '1001', customer_phone: '0501234567', source_platform: 'quickshop' });
    const out = await lookupOrder('acc-1', '1001', widgetClaim('+972501234567'));
    expect(out.kind).toBe('found');
  });

  it('WhatsApp parity: no-phone order + verified sender → found (reveal-when-absent unchanged)', async () => {
    setOrderRow({ order_number: '1001', customer_phone: null, source_platform: 'quickshop' });
    const out = await lookupOrder('acc-1', '1001', whatsappIdentity('972501234567'));
    expect(out.kind).toBe('found');
  });

  it('lookupOrdersByPhone: unverified → identity_required; claimed → searches by the CLAIMED phone', async () => {
    expect((await lookupOrdersByPhone('acc-1', widgetClaim(undefined))).kind).toBe('identity_required');
    setOrdersByPhone([{ order_number: '1002', customer_phone: '0501234567' }]);
    const res = await lookupOrdersByPhone('acc-1', widgetClaim('0501234567'));
    expect(res.kind).toBe('found');
    expect(findByPhoneMock).toHaveBeenCalledWith('acc-1', '0501234567');
  });
});
```

(`pullMock` / `setOrderRow` / `setOrdersByPhone` / `findByPhoneMock` = whatever names that file's existing mocks use for `connector.pull`, `findBrandOrderByNumber`, `findBrandOrdersByPhone` — reuse them, don't invent parallel mocks.)

Also update the Task-3 assertion in `tests/unit/cs-tools.test.ts` — the handler now passes the identity object, so:

```ts
expect(lookupOrder).toHaveBeenCalledWith('acc-1', '1001',
  expect.objectContaining({ channel: 'whatsapp', waId: '972501112222', trust: 'channel_verified' }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lookup-order.test.ts`
Expected: FAIL — identity object flows into string-typed parameter; `identity_required`/`escalate` kinds don't exist.

- [ ] **Step 3: Implement**

`src/lib/orders/lookup.ts`:

```ts
import { verifyOrderAccess } from './phone-verify';
import { identityPhone, type CsIdentity } from '@/lib/cs/identity';

export type OrderLookupOutcome =
  | (OrderLookupResult & { kind: 'found'; lineItems?: NormalizedLineItem[]; shipment?: FocusCustomerStatusView | null })
  | { kind: 'not_found' }
  | { kind: 'ambiguous' }
  | { kind: 'unverified' }         // phone mismatch — ask the shopper to check the number
  | { kind: 'identity_required' }  // unverified identity — collect phone + order number first (spec §2)
  | { kind: 'escalate' };          // no-phone order under a CLAIMED identity — human, never reveal

export async function lookupOrder(accountId: string, orderNumber: string, identity: CsIdentity): Promise<OrderLookupOutcome> {
  if (identity.trust !== 'channel_verified' && !identityPhone(identity)) return { kind: 'identity_required' };
  const row = await findBrandOrderByNumber(accountId, orderNumber);
  if (!row || !row.source_platform) return { kind: 'not_found' };
  // ... (config load, connector pull, cache upsert — UNCHANGED) ...
  const orderPhone = fresh?.customerPhone ?? row.customer_phone;
  // Test-number QA bypass stays a WhatsApp-only affordance: the allowlist holds WA numbers.
  const bypass = identity.channel === 'whatsapp' && isTestNumber(config, identity.waId);
  if (!bypass) {
    const verdict = verifyOrderAccess(orderPhone, identity);
    if (verdict === 'identity_required') return { kind: 'identity_required' };
    if (verdict === 'escalate') return { kind: 'escalate' };
    if (verdict === 'mismatch') return { kind: 'unverified' };
  }
  // ... (normalized/result/focusEnrich/return — UNCHANGED) ...
}

export async function lookupOrdersByPhone(accountId: string, identity: CsIdentity): Promise<{ kind: 'identity_required' } | { kind: 'found'; orders: OrderLookupResult[] }> {
  const phone = identityPhone(identity);
  if (!phone) return { kind: 'identity_required' };
  const rows = await findBrandOrdersByPhone(accountId, phone);
  // ... (existing body over `rows`, using `phone` where it used senderPhone — UNCHANGED) ...
  return { kind: 'found', orders: /* the existing mapped array */ };
}
```

`src/lib/cs/tools/index.ts` — the two handlers pass the identity itself (removing Task 3's `?? ''` temporaries):

```ts
// lookup_order handler:
const outcome = await lookupOrder(ctx.accountId, String(args?.orderNumber || ''), ctx.identity);
return { ok: true, data: outcome };

// lookup_orders_by_phone handler:
const res = await lookupOrdersByPhone(ctx.accountId, ctx.identity);
if (res.kind === 'identity_required') return { ok: true, data: { kind: 'identity_required' } };
return { ok: true, data: { orders: res.orders.map((o) => ({ orderNumber: o.orderNumber, status: o.status, total: o.total, itemSummary: o.itemSummary, trackingUrl: o.trackingUrls?.[0] })) } };
```

Update the two tool descriptions to tell the brain what the new kinds mean (append one sentence each): `"kind:'identity_required' → ask for the phone number AND order number before retrying; kind:'escalate' → this order can only be handled by a human — call escalate_to_human."`

Check other `lookupOrder(`/`lookupOrdersByPhone(` call sites: `grep -rn "lookupOrder(\|lookupOrdersByPhone(" src --include='*.ts'` — any non-CS caller (e.g. order-status reply paths) that passes a raw phone string gets `whatsappIdentity(phone)` if it's a WhatsApp path; anything else gets flagged in the task report, NOT silently converted.

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run tests/unit/lookup-order.test.ts tests/unit/xphase-lookup-order.test.ts tests/unit/cs-tools.test.ts tests/unit/order-status-reply.test.ts && npm run type-check`
Expected: PASS (update any signature-only breakage in these files; assertions unchanged except the new block).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/lookup.ts src/lib/cs/tools/index.ts tests/unit/lookup-order.test.ts tests/unit/xphase-lookup-order.test.ts tests/unit/order-status-reply.test.ts
git commit -m "feat(orders): trust-gated lookupOrder/lookupOrdersByPhone — guest-checkout leak closed for claimed identities (spec §2)"
```

---

### Task 5: Migration 074 — `(channel, channel_user_id)` on cs sessions

**Files:**
- Create: `supabase/migrations/074_cs_sessions_channel.sql`
- Modify: `src/lib/cs/cs-session.ts`
- Test: `tests/unit/cs-session-store.test.ts` (extend)

**Interfaces:**
- Consumes: `CsChannel` (Task 1).
- Produces: `CsSessionRow` gains `channel: CsChannel; channel_user_id: string`; new `loadCsSessionByChannel(channel: CsChannel, channelUserId: string): Promise<CsSessionRow | null>`; `createCsSession(waId, contactId)` writes the new columns; `loadCsSession(waId)` delegates to the channel loader. Task 7's core uses the channel loader.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/074_cs_sessions_channel.sql
-- CS-engine M1 (spec §8, step 1 of 2 — NON-destructive): sessions become channel-keyed.
-- wa_id stays populated and remains the PK; step 2 (drop NOT NULL, then the column) ships
-- only after this path has run in production.
alter table public.whatsapp_cs_sessions
  add column if not exists channel text not null default 'whatsapp',
  add column if not exists channel_user_id text;

update public.whatsapp_cs_sessions set channel_user_id = wa_id where channel_user_id is null;

alter table public.whatsapp_cs_sessions
  alter column channel_user_id set not null;

create unique index if not exists uq_cs_sessions_channel_user
  on public.whatsapp_cs_sessions(channel, channel_user_id);

comment on column public.whatsapp_cs_sessions.channel is
  'whatsapp | instagram | widget | web_chat (spec 2026-08-12 §8). Default whatsapp for legacy rows.';
```

- [ ] **Step 2: Apply the migration**

Apply with the Supabase MCP tool: `mcp__supabase__apply_migration` with name `074_cs_sessions_channel` and the SQL above. Then verify:

Run (MCP `mcp__supabase__execute_sql`): `select count(*) as total, count(channel_user_id) as backfilled from whatsapp_cs_sessions;`
Expected: `total = backfilled` (all ~68 rows backfilled).

- [ ] **Step 3: Write the failing session-store test**

Append to `tests/unit/cs-session-store.test.ts` (reuse its existing supabase mock; extend the mock's captured-filter recording if needed):

```ts
it('loadCsSessionByChannel queries by (channel, channel_user_id); loadCsSession(waId) delegates to it', async () => {
  const { loadCsSessionByChannel, loadCsSession } = await import('@/lib/cs/cs-session');
  await loadCsSessionByChannel('whatsapp', '972501112222');
  expect(capturedFilters).toEqual(expect.arrayContaining([['channel', 'whatsapp'], ['channel_user_id', '972501112222']]));
  capturedFilters.length = 0;
  await loadCsSession('972501112222');
  expect(capturedFilters).toEqual(expect.arrayContaining([['channel', 'whatsapp'], ['channel_user_id', '972501112222']]));
});

it('createCsSession writes channel + channel_user_id alongside wa_id (migration step 1: wa_id keeps being populated)', async () => {
  const { createCsSession } = await import('@/lib/cs/cs-session');
  await createCsSession('972501112222', null);
  expect(capturedInsert).toMatchObject({ wa_id: '972501112222', channel: 'whatsapp', channel_user_id: '972501112222' });
});
```

(`capturedFilters` / `capturedInsert` = the file's existing mock-capture variables; if it doesn't record `.eq()` args yet, extend the mock to push `[col, val]` pairs.)

- [ ] **Step 4: Run test to verify it fails, implement, re-run**

Run: `npx vitest run tests/unit/cs-session-store.test.ts` → FAIL.

`src/lib/cs/cs-session.ts`:

```ts
import type { CsChannel } from '@/lib/cs/identity';

export interface CsSessionRow {
  wa_id: string;
  channel: CsChannel;
  channel_user_id: string;
  // ... existing fields unchanged ...
}

export async function loadCsSessionByChannel(channel: CsChannel, channelUserId: string): Promise<CsSessionRow | null> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cs_sessions').select('*')
    .eq('channel', channel).eq('channel_user_id', channelUserId)
    .maybeSingle();
  return (data as CsSessionRow) ?? null;
}

export async function loadCsSession(waId: string): Promise<CsSessionRow | null> {
  return loadCsSessionByChannel('whatsapp', waId);
}

// createCsSession: add `channel: 'whatsapp', channel_user_id: waId` to the insert object.
// saveCsSession: UNCHANGED (still keys on wa_id + version; wa_id is still the PK in step 1).
```

Run: `npx vitest run tests/unit/cs-session-store.test.ts tests/unit/xphase-cs-session-store.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/074_cs_sessions_channel.sql src/lib/cs/cs-session.ts tests/unit/cs-session-store.test.ts
git commit -m "feat(cs): sessions keyed on (channel, channel_user_id) — non-destructive migration 074 (spec §8 step 1)"
```

---

### Task 6: Archetype-aware tool registry

**Files:**
- Create: `src/lib/cs/tools/registry.ts`
- Modify: `src/lib/cs/tools/index.ts` (export the raw tools list for the registry; keep `getCsTools`/`CS_TOOL_DEFS` exports working)
- Modify: `src/lib/cs/cs-agent.ts` (use the registry per turn)
- Test: `tests/unit/cs-tool-registry.test.ts`

**Interfaces:**
- Consumes: `CsTool`, `OpenAIFunctionDef` from `tools/types`; `CsChannel` (Task 1).
- Produces: `buildCsToolset(opts: { channel: CsChannel; account: { archetype?: string | null; config?: any } | null }): { tools: CsTool[]; defs: OpenAIFunctionDef[] }`.

Rules (spec §4) — availability is decided at registry build, in code, not in the prompt:

- `account === null` (pre-bind — only possible on WhatsApp's shared number): the full toolset, exactly today's 10. **This is the WhatsApp-parity anchor.**
- `resolve_brand`, `bind_brand`: `channel === 'whatsapp'` only (shared-number problem; elsewhere the account IS the brand).
- `lookup_order`, `lookup_orders_by_phone`: only when an orders provider is configured — `config?.integrations?.shopify?.admin_api_token || config?.integrations?.quickshop?.api_key`.
- `search_products`, `show_products`: archetype `brand` only (the runtime `products_enabled` gate inside the tools stays as-is — defense in depth).
- archetype `government_ministry`: only `remember_name` + `escalate_to_human` (RAG answers come from the system prompt's brand RAG, not a tool).
- archetype `service_provider` and every other non-brand archetype: `remember_name`, `list_open_threads`, `open_or_attach_ticket`, `escalate_to_human`.
- archetype `brand` (and missing archetype — today's CS accounts are brands): everything the channel/config rules allow.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/cs-tool-registry.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/whatsapp-cloud/client', () => ({ toWaId: (s: string) => s.replace(/\D/g, '').replace(/^0/, '972') }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) } }));
import { buildCsToolset } from '@/lib/cs/tools/registry';

const names = (r: { defs: any[] }) => r.defs.map((d) => d.function.name).sort();
const QUICKSHOP = { integrations: { quickshop: { api_key: 'k' } } };

describe('buildCsToolset (archetype-aware registry, spec §4)', () => {
  it('WHATSAPP-PARITY ANCHOR: pre-bind whatsapp = exactly today’s 10 tools', () => {
    expect(names(buildCsToolset({ channel: 'whatsapp', account: null }))).toEqual([
      'bind_brand', 'escalate_to_human', 'list_open_threads', 'lookup_order', 'lookup_orders_by_phone',
      'open_or_attach_ticket', 'remember_name', 'resolve_brand', 'search_products', 'show_products',
    ]);
  });

  it('bound brand with an orders provider on whatsapp = the same full 10 (post-bind parity)', () => {
    expect(names(buildCsToolset({ channel: 'whatsapp', account: { archetype: 'brand', config: QUICKSHOP } }))).toHaveLength(10);
  });

  it('brand WITHOUT an orders provider loses ONLY the two order tools', () => {
    const n = names(buildCsToolset({ channel: 'whatsapp', account: { archetype: 'brand', config: {} } }));
    expect(n).not.toContain('lookup_order');
    expect(n).not.toContain('lookup_orders_by_phone');
    expect(n).toContain('search_products');
  });

  it('resolve/bind_brand are whatsapp-only: a widget brand account gets neither', () => {
    const n = names(buildCsToolset({ channel: 'widget', account: { archetype: 'brand', config: QUICKSHOP } }));
    expect(n).not.toContain('resolve_brand');
    expect(n).not.toContain('bind_brand');
    expect(n).toContain('lookup_order');
  });

  it('government_ministry = escalation + name only; service_provider = tickets + escalation, no orders/products', () => {
    expect(names(buildCsToolset({ channel: 'widget', account: { archetype: 'government_ministry', config: {} } })))
      .toEqual(['escalate_to_human', 'remember_name']);
    expect(names(buildCsToolset({ channel: 'widget', account: { archetype: 'service_provider', config: QUICKSHOP } })))
      .toEqual(['escalate_to_human', 'list_open_threads', 'open_or_attach_ticket', 'remember_name']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cs-tool-registry.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/cs/tools/registry.ts
// Archetype-aware tool availability (spec §4). Cut in code at registry build — an account
// without an orders provider NEVER has order tools in its definition list; the prompt can't
// be talked into calling what isn't there.
import { getCsTools } from './index';
import type { CsTool, OpenAIFunctionDef } from './types';
import type { CsChannel } from '@/lib/cs/identity';

export interface CsToolsetOpts {
  channel: CsChannel;
  account: { archetype?: string | null; config?: any } | null;
}

const WHATSAPP_ONLY = new Set(['resolve_brand', 'bind_brand']);
const ORDER_TOOLS = new Set(['lookup_order', 'lookup_orders_by_phone']);
const PRODUCT_TOOLS = new Set(['search_products', 'show_products']);
const GOV_ALLOWED = new Set(['remember_name', 'escalate_to_human']);
const NON_BRAND_ALLOWED = new Set(['remember_name', 'list_open_threads', 'open_or_attach_ticket', 'escalate_to_human']);

function hasOrdersProvider(config: any): boolean {
  const i = config?.integrations || {};
  return Boolean(i?.shopify?.admin_api_token || i?.quickshop?.api_key);
}

export function buildCsToolset(opts: CsToolsetOpts): { tools: CsTool[]; defs: OpenAIFunctionDef[] } {
  const all = getCsTools();
  const tools = all.filter((t) => {
    const name = t.def.function.name;
    if (WHATSAPP_ONLY.has(name) && opts.channel !== 'whatsapp') return false;
    if (!opts.account) return true; // pre-bind (shared WhatsApp number) — full set, today's behavior
    const archetype = opts.account.archetype || 'brand';
    if (archetype === 'government_ministry') return GOV_ALLOWED.has(name);
    if (archetype !== 'brand') return NON_BRAND_ALLOWED.has(name);
    if (ORDER_TOOLS.has(name)) return hasOrdersProvider(opts.account.config);
    if (PRODUCT_TOOLS.has(name)) return true; // brand — runtime products_enabled gate still applies inside
    return true;
  });
  return { tools, defs: tools.map((t) => t.def) };
}
```

`src/lib/cs/cs-agent.ts` — replace the constant toolset in the loop. At turn start (before step 5), after `escalationConfig` already fetched the account config, load archetype+config ONCE and build the set (reuse the same `accounts.config` fetch — extract a small `loadAccountMeta(accountId): Promise<{ archetype?: string; config?: any } | null>` that returns `null` for a null accountId, and have `escalationConfig` read from its result to avoid a second query):

```ts
const accountMeta = await loadAccountMeta(session.active_account_id);
const toolset = buildCsToolset({ channel: ctx.identity.channel, account: accountMeta ? { archetype: accountMeta.config?.archetype, config: accountMeta.config } : null });
const toolMap = new Map(toolset.tools.map((t) => [t.def.function.name, t]));
// in the loop:  deps.callModel({ system, messages, tools: toolset.defs })
```

- [ ] **Step 4: Run tests + parity suites**

Run: `npx vitest run tests/unit/cs-tool-registry.test.ts tests/unit/cs-agent.test.ts tests/unit/cs-tools.test.ts && npm run type-check`
Expected: PASS. `cs-agent.test.ts` mocks accounts with configs — if its mocked account rows lack `integrations`, the bound-brand turns would lose order tools and its assertions may fail; in that case add `integrations: { quickshop: { api_key: 'k' } }` to the mock account fixtures (fixture change, not assertion change).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cs/tools/registry.ts src/lib/cs/tools/index.ts src/lib/cs/cs-agent.ts tests/unit/cs-tool-registry.test.ts tests/unit/cs-agent.test.ts
git commit -m "feat(cs): archetype-aware tool registry — availability cut in code, whatsapp pre-bind unchanged (spec §4)"
```

---

### Task 7: Channel-agnostic `CsTurnInput` entry + mode context

**Files:**
- Modify: `src/lib/cs/cs-agent.ts`
- Modify: `src/lib/cs/cs-context.ts` (one digest line)
- Test: `tests/unit/cs-agent.test.ts` (extend)

**Interfaces:**
- Consumes: `CsIdentity`, `identityKey`, `whatsappIdentity` (Task 1); `loadCsSessionByChannel` (Task 5); `buildCsToolset` (Task 6).
- Produces:
  - `export interface CsTurnInput { identity: CsIdentity; text: string; image?: CsJob['image'] | null; contactId?: string | null; mode?: 'cs' | 'content' }`
  - `export async function runCsTurnCore(input: CsTurnInput, depsOverride?: Partial<CsAgentDeps>): Promise<CsTurnResult>` — the whole existing body, parameterized.
  - `runCsTurn(job: CsJob, depsOverride?)` becomes a thin wrapper: `runCsTurnCore({ identity: whatsappIdentity(job.waId), text: job.textBody || '', image: job.image, contactId: job.contactId }, depsOverride)`. `wa-cs-worker.ts` is NOT touched.
  - Milestone 2/3 adapters call `runCsTurnCore` directly with widget/web_chat/instagram identities.

Body changes inside `runCsTurnCore` (everything else moves verbatim):
- `const { channel, channelUserId } = identityKey(input.identity)`; session load becomes `loadCsSessionByChannel(channel, channelUserId)`; `createCsSession` keeps receiving `channelUserId` as its waId arg (M1: only WhatsApp reaches creation, and there `channelUserId === waId`).
- `ctx.identity = input.identity` (not re-derived); `ctx.waId = channelUserId` (same value on WhatsApp).
- `mode` (default `'cs'`) is threaded into `buildContextDigest` which appends exactly one line when mode is `'content'`: `שים לב: הלקוח/ה בחר/ה לשוחח על התוכן — זו שיחת תוכן, לא פניית שירות.` (unreachable in M1 — WhatsApp always passes `'cs'`; the parameter exists so milestone 2 doesn't reopen this file's contract).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/cs-agent.test.ts` (reuse its existing mock harness and `depsOverride.callModel` stub):

```ts
it('runCsTurnCore accepts a channel identity and loads the session by (channel, channel_user_id)', async () => {
  const { runCsTurnCore } = await import('@/lib/cs/cs-agent');
  const callModel = vi.fn().mockResolvedValue({ toolCalls: [], text: 'שלום!' });
  const res = await runCsTurnCore(
    { identity: { channel: 'whatsapp', waId: '972501112222', trust: 'channel_verified' }, text: 'היי' },
    { callModel },
  );
  expect(res.reply).toEqual({ kind: 'text', body: 'שלום!' });
  expect(sessionLoadCalls).toContainEqual(['whatsapp', '972501112222']);
});

it('runCsTurn(job) delegates to the core with a whatsapp identity (worker contract unchanged)', async () => {
  const { runCsTurn } = await import('@/lib/cs/cs-agent');
  const callModel = vi.fn().mockResolvedValue({ toolCalls: [], text: 'שלום!' });
  const res = await runCsTurn({ waId: '972501112222', textBody: 'היי', msg: { id: 'm1' } } as any, { callModel });
  expect(res.reply.kind).toBe('text');
});
```

(`sessionLoadCalls` = extend the file's cs-session mock to record `loadCsSessionByChannel` args; if the file mocks `loadCsSession` today, mock the new function alongside it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cs-agent.test.ts`
Expected: FAIL — `runCsTurnCore` not exported.

- [ ] **Step 3: Implement the split**

In `src/lib/cs/cs-agent.ts`: rename the existing function body to `runCsTurnCore(input, depsOverride)`, replacing at the top:

```ts
export interface CsTurnInput {
  identity: CsIdentity;
  text: string;
  image?: CsJob['image'] | null;
  contactId?: string | null;
  mode?: 'cs' | 'content';
}

export async function runCsTurnCore(input: CsTurnInput, depsOverride?: Partial<CsAgentDeps>): Promise<CsTurnResult> {
  const deps: CsAgentDeps = { callModel: depsOverride?.callModel ?? defaultCallModel };
  const { channel, channelUserId } = identityKey(input.identity);
  const img = input.image ?? null;
  const userMessage = (img ? (img.caption ? `[תמונה] ${img.caption}` : '[הלקוח/ה שלח/ה תמונה]') : (input.text || '')).trim();
  let session = (await loadCsSessionByChannel(channel, channelUserId)) || (await createCsSession(channelUserId, input.contactId ?? null));
  // ... rest of the existing body verbatim, with:
  //   - every bare `waId` → `channelUserId`
  //   - ctx: { waId: channelUserId, ..., identity: input.identity, ... }
  //   - digest: buildContextDigest(session, openThreads, input.mode ?? 'cs')
}

export async function runCsTurn(job: CsJob, depsOverride?: Partial<CsAgentDeps>): Promise<CsTurnResult> {
  return runCsTurnCore({ identity: whatsappIdentity(job.waId), text: job.textBody || '', image: job.image ?? null, contactId: job.contactId ?? null }, depsOverride);
}
```

In `src/lib/cs/cs-context.ts`, `buildContextDigest` gains an optional third parameter `mode: 'cs' | 'content' = 'cs'` and appends the one content-mode line only when `mode === 'content'`.

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run tests/unit/cs-agent.test.ts tests/unit/cs-context.test.ts tests/unit/cs-worker.test.ts tests/unit/cs-worker-dispatch.test.ts && npm run type-check`
Expected: PASS — the worker tests exercise `runCsTurn(job)` and must pass with zero changes (that's the wrapper's contract).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cs/cs-agent.ts src/lib/cs/cs-context.ts tests/unit/cs-agent.test.ts
git commit -m "feat(cs): runCsTurnCore — channel-agnostic entry with mode context; runCsTurn(job) is a thin WA wrapper"
```

---

### Task 8: Full parity gate

**Files:**
- No new files — this is the milestone gate (spec Testing: "existing CS tests pass unchanged; primary gate on milestone 1").

- [ ] **Step 1: Run the FULL unit suite**

Run: `npm run test`
Expected: PASS. Pre-existing failures unrelated to CS (check `reference_codebase_notes` memory for known suite state) are acceptable ONLY if `git stash && npm run test` reproduces them — verify before dismissing anything, and unstash.

- [ ] **Step 2: Type-check + lint the touched files**

Run: `npm run type-check && npx eslint src/lib/cs src/lib/orders --ext .ts`
Expected: clean (or only pre-existing warnings).

- [ ] **Step 3: Behavioral spot-check of the parity anchor**

Run: `npx vitest run tests/unit/cs-agent.test.ts tests/unit/cs-tools.test.ts tests/unit/cs-worker.test.ts tests/unit/lookup-order.test.ts tests/unit/phone-verify.test.ts tests/unit/cs-tool-registry.test.ts tests/unit/cs-session-store.test.ts tests/unit/cs-identity.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Push**

```bash
git push
```

- [ ] **Step 5: Report**

Summarize: what changed, the parity evidence (suite results), the migration verification query result, and that milestones 2 (widget+main chat) and 3 (IG) are now unblocked.
