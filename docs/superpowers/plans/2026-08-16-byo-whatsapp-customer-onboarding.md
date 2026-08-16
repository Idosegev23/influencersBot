# BYO WhatsApp — Customer Onboarding Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer connect their own WhatsApp number through the onboarding wizard, and have our CS brain answer on it — without ever seeing another tenant's data.

**Architecture:** Plan A made every send channel-scoped and every inbound channel-routed. Plan B adds the way a channel gets *created*: an Embedded Signup v4 popup returns a short-lived code, the server exchanges it, proves the customer owns the claimed WABA, and runs an idempotent provisioning chain (Vault → webhook subscribe → channel row → coexistence sync → 3 CS templates). A billing probe confirms the customer's card. Coexistence echoes pause the bot when a human replies from the phone. The first task hardens the tools so a customer channel structurally cannot read across tenants.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + Vault), Meta Graph API v23.0, Facebook Login for Business (ES v4), Upstash Redis + QStash.

**Spec:** `docs/superpowers/specs/2026-08-06-byo-whatsapp-number-tech-provider-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-15-byo-whatsapp-channel-foundation.md` (Plan A) — **merged and deployed**, with its inbound acceptance test passed. Do not start Plan B until that is true.

## Global Constraints

- **Migration number is `076`** — `075_whatsapp_channels.sql` is the current head.
- `whatsapp_cs_sessions.channel` = the **MEDIUM**. `wa_channel_id` = **WHICH NUMBER**. The TS type is `WaChannel`. Never conflate.
- **Never accept an `accountId` from the browser.** The onboarding token resolves it server-side — same anti-IDOR pattern as `src/app/api/onboard/[token]/connect/route.ts`.
- **The ES code lives ~30 seconds.** Exchange it synchronously in the request that receives it; never defer to a queue.
- **Meta's token is the source of truth for ownership, not the browser.** `debug_token` → `granular_scopes.target_ids` must contain the claimed `waba_id`.
- **Coexistence history/contacts: ACK and discard.** Store a counter, never another business's chat history (D6).
- **The coexistence sync has a 24-hour hard deadline** — miss it and Meta offboards the customer.
- Tokens go to Vault via `storeToken` / `readToken` / `deleteToken`. **No raw token column, ever.** Disconnect DELETES the secret.
- Run one test file with `npx vitest run <path>`. **Node 22 required** (`nvm use 22`) — Supabase Realtime needs native WebSocket.
- Scripts need `dotenv` **and dynamic `await import()`** — ES imports hoist above `loadEnv()`, and `src/lib/supabase.ts` throws at module scope.
- **Verification standard is parity, not zero:** `main` currently has 11 type errors and 3 unit failures (`scans-list`, `agent-tools`, `crm-wa-worker`). Do not exceed those counts.

## Unverified at plan time (spec §"Verify during build")

These are flagged, not assumed. Confirm each against live Meta behaviour during the task that needs it, and correct the plan inline rather than forcing the code to match a guess:

1. **ES v4 popup payload shape** (Task 7) — the generic flow is confirmed (`event: 'FINISH'` / `FINISH_ONLY_WABA` carrying `phone_number_id` + `waba_id` + `business_id`; `CANCEL` carrying `current_step` / `error_code`). The **Coexistence-specific `extras` / `featureType` values** in `FB.login` are NOT confirmed.
2. **Whether creating a template on the customer's WABA needs any permission beyond the exchanged token's `whatsapp_business_management`** (Task 4).
3. **Coexistence eligibility errors** the popup can return (app-tenure / quality gates on the customer's side) — Task 7 must surface a readable Hebrew message rather than a raw code.

---

### Task 1: Tenant-scoped toolset (security gate — do this first)

**Files:**
- Modify: `src/lib/cs/tools/registry.ts`
- Modify: `src/lib/cs/tools/index.ts:21-31` (`openCsThreads`), `:92-101` (`listOpenThreadsTool`)
- Modify: `src/lib/cs/tools/types.ts` (tool context gains the bound account)
- Test: `tests/unit/cs-tenant-scoping.test.ts`

**Interfaces:**
- Consumes: `buildCsToolset({ channel, account })` as it exists today.
- Produces:
  - `buildCsToolset(opts: { channel: CsChannel; account: {...} | null; preBoundAccountId?: string | null })`
  - `openCsThreads(phone: string, accountId?: string | null)` — scoped when an id is given.

**Why first:** `openCsThreads` queries `support_requests` by phone across **every** account and returns brand display names. On a customer channel that hands Brand A's bot a list of the shopper's open tickets with Brands B and C. `resolve_brand` / `bind_brand` are gated on `channel !== 'whatsapp'` — but a customer channel *is* whatsapp, so today they would still be exposed and could rebind the conversation to any account.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cs-tenant-scoping.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildCsToolset } from '@/lib/cs/tools/registry';

const ACCOUNT = { archetype: 'brand', config: { integrations: {} } };

function names(opts: any) {
  return buildCsToolset(opts).defs.map((d) => d.function.name);
}

describe('a pre-bound customer channel cannot reach across tenants', () => {
  it('drops resolve_brand and bind_brand even though the medium is whatsapp', () => {
    const n = names({ channel: 'whatsapp', account: ACCOUNT, preBoundAccountId: 'acc-customer' });
    expect(n).not.toContain('resolve_brand');
    expect(n).not.toContain('bind_brand');
  });

  it('Bestie’s shared number keeps them — that is the whole point of the shared number', () => {
    const n = names({ channel: 'whatsapp', account: null, preBoundAccountId: null });
    expect(n).toContain('resolve_brand');
    expect(n).toContain('bind_brand');
  });

  it('non-whatsapp media are unchanged', () => {
    const n = names({ channel: 'widget', account: ACCOUNT });
    expect(n).not.toContain('resolve_brand');
  });
});

describe('openCsThreads is scoped when an account is bound', () => {
  it('filters by account_id when one is supplied', async () => {
    const eq = vi.fn().mockReturnThis();
    const chain: any = {
      select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), eq,
      order: vi.fn().mockReturnThis(), limit: vi.fn(async () => ({ data: [] })),
    };
    vi.doMock('@/lib/supabase', () => ({ supabase: { from: () => chain } }));
    const { openCsThreads } = await import('@/lib/cs/tools/index');
    await openCsThreads('972500000000', 'acc-customer');
    expect(eq).toHaveBeenCalledWith('account_id', 'acc-customer');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/cs-tenant-scoping.test.ts`
Expected: FAIL — `resolve_brand` is still present, and `openCsThreads` is not exported.

- [ ] **Step 3: Scope the thread listing**

In `src/lib/cs/tools/index.ts`, export `openCsThreads` and give it an optional account filter:

```typescript
export async function openCsThreads(
  waId: string,
  accountId?: string | null,
): Promise<Array<{ ticketId: string; brand: string; topic: string; status: string }>> {
  let q = supabaseAdmin
    .from('support_requests')
    .select('id, account_id, status, message, metadata, accounts(config)')
    .in('source', CS_TICKET_SOURCES)
    .in('customer_phone', phoneVariants(waId));
  // On a customer channel the account is fixed; listing another brand's threads would be
  // a cross-tenant leak, so the filter is structural rather than a caller's choice.
  if (accountId) q = q.eq('account_id', accountId);
  const { data } = await q.order('updated_at', { ascending: false }).limit(10);
  return ((data as any[]) || []).filter((r) => !TERMINAL_TICKET.has(r.status)).map((r) => ({
    ticketId: r.id,
    brand: r.accounts?.config?.display_name || r.accounts?.config?.username || 'המותג',
    topic: r.metadata?.topic || r.message || 'פנייה',
    status: r.status,
  }));
}
```

And pass the bound account from the tool context:

```typescript
const listOpenThreadsTool: CsTool = {
  def: { type: 'function', function: {
    name: 'list_open_threads',
    description: "List the shopper's open support threads so you can offer to continue one (adaptive re-entry).",
    parameters: { type: 'object', properties: {} },
  } },
  async handler(_args, ctx) {
    return { ok: true, data: { threads: await openCsThreads(identityPhone(ctx.identity) ?? ctx.waId, ctx.boundAccountId ?? null) } };
  },
};
```

Add `boundAccountId?: string | null` to the tool context type in `src/lib/cs/tools/types.ts`.

- [ ] **Step 4: Gate the brand-switching tools**

In `src/lib/cs/tools/registry.ts`:

```typescript
export interface CsToolsetOpts {
  channel: CsChannel;
  account: { archetype?: string | null; config?: any } | null;
  /** Set on a customer channel: the account is fixed by the NUMBER, not chosen in-conversation. */
  preBoundAccountId?: string | null;
}
```

and inside the filter, immediately after the `WHATSAPP_ONLY` line:

```typescript
    // A customer channel's account is decided by which number the message arrived on.
    // Exposing resolve_brand / bind_brand there would let the conversation be rebound to
    // another tenant — the leak is closed by never offering the tool, not by checking args.
    if (opts.preBoundAccountId && WHATSAPP_ONLY.has(name)) return false;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/cs-tenant-scoping.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Pass the bound account at the call site**

In `src/lib/cs/cs-agent.ts`, where `buildCsToolset` is called, thread `preBoundAccountId` from the CS turn input (it comes from `classifyInbound`'s `boundAccountId`, carried on the session as `active_account_id` for a customer channel). Set `ctx.boundAccountId` to the same value.

- [ ] **Step 7: Verify parity and commit**

Run: `npm run type-check && npx vitest run`
Expected: 11 type errors, 3 unit failures — no more than baseline.

```bash
git add src/lib/cs/tools tests/unit/cs-tenant-scoping.test.ts src/lib/cs/cs-agent.ts
git commit -m "fix(cs)!: customer channels cannot list or bind another tenant

openCsThreads searched support_requests by phone across every account and
returned brand names — on a customer channel that leaks the shopper's tickets
with other brands. resolve_brand/bind_brand were gated on the medium, but a
customer channel IS whatsapp, so they stayed reachable and could rebind the
conversation to any account. Both are now closed structurally."
```

---

### Task 2: Connect route — code exchange and ownership check

**Files:**
- Create: `src/app/api/onboard/[token]/whatsapp/route.ts`
- Create: `src/lib/whatsapp-cloud/provisioning.ts`
- Test: `tests/unit/wa-connect-route.test.ts`

**Interfaces:**
- Consumes: `resolveDraftByToken` from `@/lib/onboarding/resolve`; `storeToken` (Plan A).
- Produces:
  - `exchangeEsCode(code: string): Promise<string>` — returns the business-integration system-user token.
  - `assertWabaOwnership(token: string, wabaId: string): Promise<void>` — throws on mismatch.
  - `POST /api/onboard/[token]/whatsapp` accepting `{ code, waba_id, phone_number_id }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/wa-connect-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertWabaOwnership } from '@/lib/whatsapp-cloud/provisioning';

function mockDebugToken(targetIds: string[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ data: { granular_scopes: [
      { scope: 'whatsapp_business_management', target_ids: targetIds },
    ] } }),
    text: async () => '',
  })));
}

beforeEach(() => vi.unstubAllGlobals());

describe('WABA ownership is proved by Meta, not claimed by the browser', () => {
  it('accepts a waba_id present in granular_scopes.target_ids', async () => {
    mockDebugToken(['1458477285751402']);
    await expect(assertWabaOwnership('TOK', '1458477285751402')).resolves.toBeUndefined();
  });

  it('THROWS for a waba_id the token does not cover', async () => {
    mockDebugToken(['1458477285751402']);
    await expect(assertWabaOwnership('TOK', '9999999999')).rejects.toThrow(/does not grant access/i);
  });

  it('THROWS when granular_scopes is absent entirely', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ data: {} }), text: async () => '',
    })));
    await expect(assertWabaOwnership('TOK', '1458477285751402')).rejects.toThrow(/does not grant access/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/wa-connect-route.test.ts`
Expected: FAIL — `@/lib/whatsapp-cloud/provisioning` does not exist.

- [ ] **Step 3: Implement exchange + ownership**

Create `src/lib/whatsapp-cloud/provisioning.ts`:

```typescript
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}`;

/**
 * Exchange the Embedded Signup code for a business-integration system-user token.
 * The code lives ~30 seconds — call this synchronously in the request that received it.
 */
export async function exchangeEsCode(code: string): Promise<string> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('client_id', process.env.NEXT_PUBLIC_FB_APP_ID!);
  url.searchParams.set('client_secret', process.env.WHATSAPP_APP_SECRET!);
  url.searchParams.set('code', code);
  const res = await fetch(url, { method: 'GET' });
  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(`ES code exchange failed: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.access_token as string;
}

/**
 * Prove the customer actually owns the WABA they claim. The browser supplies waba_id, so it
 * is untrusted input; Meta's own view of the token is the only acceptable source of truth.
 */
export async function assertWabaOwnership(token: string, wabaId: string): Promise<void> {
  const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json();
  const granted: string[] = (data?.data?.granular_scopes ?? [])
    .flatMap((g: any) => g?.target_ids ?? []);
  if (!granted.includes(wabaId)) {
    throw new Error(`token does not grant access to WABA ${wabaId}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/wa-connect-route.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the route**

Create `src/app/api/onboard/[token]/whatsapp/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { exchangeEsCode, assertWabaOwnership, runProvisioningChain } from '@/lib/whatsapp-cloud/provisioning';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // The onboarding token decides the account. The body NEVER carries an accountId.
  const draft = await resolveDraftByToken(token);
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }
  const { code, waba_id: wabaId, phone_number_id: phoneNumberId } = body ?? {};
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ error: 'code, waba_id and phone_number_id are required' }, { status: 400 });
  }

  let accessToken: string;
  try { accessToken = await exchangeEsCode(String(code)); }
  catch (e) { console.error('[wa-connect] exchange failed', e); return NextResponse.json({ error: 'exchange_failed' }, { status: 400 }); }

  try { await assertWabaOwnership(accessToken, String(wabaId)); }
  catch (e) { console.warn('[wa-connect] ownership rejected', e); return NextResponse.json({ error: 'waba_not_owned' }, { status: 403 }); }

  const result = await runProvisioningChain({
    accountId: draft.id, accessToken, wabaId: String(wabaId), phoneNumberId: String(phoneNumberId),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/onboard/[token]/whatsapp src/lib/whatsapp-cloud/provisioning.ts tests/unit/wa-connect-route.test.ts
git commit -m "feat(wa): onboarding connect route — ES code exchange + WABA ownership proof

The browser supplies waba_id, so it is untrusted: debug_token's
granular_scopes.target_ids is the only accepted proof. No accountId ever
crosses the wire — the onboarding token resolves it server-side."
```

---

### Task 3: Provisioning chain (idempotent, resumable)

**Files:**
- Modify: `src/lib/whatsapp-cloud/provisioning.ts`
- Test: `tests/unit/wa-provisioning-chain.test.ts`

**Interfaces:**
- Produces: `runProvisioningChain(args: { accountId: string; accessToken: string; wabaId: string; phoneNumberId: string }): Promise<{ ok: boolean; channelId?: string; state: Record<string, boolean>; failedStep?: string }>`

Chain (spec §5), progress recorded on `whatsapp_channels.provision_state`, resuming at the first incomplete step:

| # | step | on failure |
|---|---|---|
| 1 | token → Vault | halt |
| 2 | `POST /{waba_id}/subscribed_apps` | halt |
| 3 | insert channel row (`status='pending'`) | halt |
| 4 | coexistence sync ×2 (`smb_app_state_sync`, `history`) | retry + alert; **24h deadline** |
| 5 | create 3 CS templates | continue (bot works reply-only without them) |

- [ ] **Step 1: Write the failing test**

Create `tests/unit/wa-provisioning-chain.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
vi.mock('@/lib/whatsapp-cloud/channel-tokens', () => ({
  storeToken: vi.fn(async () => { calls.push('vault'); return 'sec-1'; }),
}));
const upsert = vi.fn(async () => ({ data: { id: 'ch-new' }, error: null }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ upsert: () => ({ select: () => ({ single: upsert }) }),
                            update: () => ({ eq: async () => ({ error: null }) }),
                            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
}));

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    calls.push(String(url).includes('subscribed_apps') ? 'subscribe'
             : String(url).includes('smb_app_data') ? 'sync'
             : String(url).includes('message_templates') ? 'template' : 'other');
    return { ok: true, status: 200, json: async () => ({ success: true, id: 't1' }), text: async () => '' };
  }));
});

describe('provisioning chain', () => {
  it('runs Vault → subscribe → row → sync → templates, in that order', async () => {
    const { runProvisioningChain } = await import('@/lib/whatsapp-cloud/provisioning');
    const r = await runProvisioningChain({ accountId: 'acc-1', accessToken: 'TOK', wabaId: 'W', phoneNumberId: 'P' });
    expect(r.ok).toBe(true);
    expect(calls[0]).toBe('vault');
    expect(calls[1]).toBe('subscribe');
    expect(calls.filter((c) => c === 'sync')).toHaveLength(2);   // state sync + history
    expect(calls.filter((c) => c === 'template')).toHaveLength(3);
  });

  it('halts without creating a row when webhook subscription fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400, json: async () => ({ error: { message: 'nope' } }), text: async () => '',
    })));
    const { runProvisioningChain } = await import('@/lib/whatsapp-cloud/provisioning');
    const r = await runProvisioningChain({ accountId: 'acc-1', accessToken: 'TOK', wabaId: 'W', phoneNumberId: 'P' });
    expect(r.ok).toBe(false);
    expect(r.failedStep).toBe('subscribed_apps');
  });

  it('still succeeds when only template creation fails — the bot works reply-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const isTemplate = String(url).includes('message_templates');
      return { ok: !isTemplate, status: isTemplate ? 400 : 200,
               json: async () => (isTemplate ? { error: { message: 'rejected' } } : { success: true }),
               text: async () => '' };
    }));
    const { runProvisioningChain } = await import('@/lib/whatsapp-cloud/provisioning');
    const r = await runProvisioningChain({ accountId: 'acc-1', accessToken: 'TOK', wabaId: 'W', phoneNumberId: 'P' });
    expect(r.ok).toBe(true);
    expect(r.state.templates).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/wa-provisioning-chain.test.ts`
Expected: FAIL — `runProvisioningChain` is not exported.

- [ ] **Step 3: Implement the chain**

Append to `src/lib/whatsapp-cloud/provisioning.ts`:

```typescript
import { supabase } from '@/lib/supabase';
import { storeToken } from '@/lib/whatsapp-cloud/channel-tokens';

export interface ProvisionResult {
  ok: boolean;
  channelId?: string;
  state: Record<string, boolean>;
  failedStep?: string;
}

async function graph(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

export async function runProvisioningChain(args: {
  accountId: string; accessToken: string; wabaId: string; phoneNumberId: string;
}): Promise<ProvisionResult> {
  const { accountId, accessToken, wabaId, phoneNumberId } = args;
  const state: Record<string, boolean> = {};

  // 1. token → Vault
  let secretId: string;
  try { secretId = await storeToken(accessToken); state.vault = true; }
  catch (e) { console.error('[provision] vault failed', e); return { ok: false, state, failedStep: 'vault' }; }

  // 2. subscribe our webhook to THEIR WABA — without this no inbound ever arrives
  const sub = await graph(`/${wabaId}/subscribed_apps`, accessToken, { method: 'POST' });
  state.subscribed_apps = sub.ok;
  if (!sub.ok) { console.error('[provision] subscribe failed', sub.data); return { ok: false, state, failedStep: 'subscribed_apps' }; }

  // 3. channel row — pending until the billing probe clears it
  const { data: row, error } = await supabase
    .from('whatsapp_channels')
    .upsert({
      account_id: accountId, waba_id: wabaId, phone_number_id: phoneNumberId,
      token_secret_id: secretId, onboarding_mode: 'coexistence', status: 'pending',
      connected_at: new Date().toISOString(), provision_state: state,
    }, { onConflict: 'account_id' })
    .select('id')
    .single();
  if (error || !row) { console.error('[provision] row insert failed', error); return { ok: false, state, failedStep: 'channel_row' }; }
  state.channel_row = true;

  // 4. Coexistence sync — MANDATORY and time-boxed: Meta offboards the customer if the
  //    business does not initiate within 24h. Payloads are ACKed and discarded (D6).
  const syncs = await Promise.all([
    graph(`/${phoneNumberId}/smb_app_data`, accessToken, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' }) }),
    graph(`/${phoneNumberId}/smb_app_data`, accessToken, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'history' }) }),
  ]);
  state.coexistence_sync = syncs.every((s) => s.ok);
  await supabase.from('whatsapp_channels')
    .update({ sync_initiated_at: state.coexistence_sync ? new Date().toISOString() : null, provision_state: state })
    .eq('id', row.id);

  // 5. templates — best effort; a channel without them still answers inside the 24h window
  state.templates = await createCsTemplates(accessToken, wabaId, accountId);

  await supabase.from('whatsapp_channels').update({ provision_state: state }).eq('id', row.id);
  return { ok: true, channelId: row.id, state };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/wa-provisioning-chain.test.ts`
Expected: PASS, 3 tests (after Task 4 supplies `createCsTemplates`; stub it as `async () => true` here and replace it in Task 4).

- [ ] **Step 5: Alert us when the coexistence sync fails**

The 24h deadline is unforgiving, so a failed sync must reach a human, not just a log. In the failure branch call the existing ops notifier:

```typescript
  if (!state.coexistence_sync) {
    const { notifyOps } = await import('@/lib/whatsapp-notify');
    await notifyOps(`Coexistence sync FAILED for account ${accountId} (${phoneNumberId}). 24h deadline — fix or Meta offboards them.`).catch(() => {});
  }
```

Check the exact exported name in `src/lib/whatsapp-notify.ts` and use it; do not invent one.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp-cloud/provisioning.ts tests/unit/wa-provisioning-chain.test.ts
git commit -m "feat(wa): idempotent provisioning chain with progress on provision_state"
```

---

### Task 4: The 3 CS templates

**Files:**
- Create: `src/lib/whatsapp-cloud/cs-templates.ts`
- Modify: `src/lib/whatsapp-cloud/provisioning.ts` (replace the stub)
- Test: `tests/unit/wa-cs-templates.test.ts`

**Interfaces:**
- Produces: `CS_TEMPLATES` (3 definitions) and `createCsTemplates(token: string, wabaId: string, accountId: string): Promise<boolean>`

**Copy rules — these decide whether the customer pays.** All three are `UTILITY`. Meta reclassifies anything that reads as promotional to `MARKETING`, which costs money and requires opt-in. Keep the wording strictly transactional: no offers, no adjectives, no calls to browse.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { CS_TEMPLATES } from '@/lib/whatsapp-cloud/cs-templates';

describe('CS templates stay UTILITY', () => {
  it('has exactly the three the spec names', () => {
    expect(CS_TEMPLATES.map((t) => t.name).sort())
      .toEqual(['cs_followup', 'cs_human_reply', 'cs_order_update']);
  });

  it('every template is UTILITY with lowercase snake_case names', () => {
    for (const t of CS_TEMPLATES) {
      expect(t.category).toBe('UTILITY');
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('carries no promotional vocabulary that would get it reclassified', () => {
    const banned = /(מבצע|הנחה|חינם|קנ[הי]|עכשיו בלבד|sale|discount|free|buy now|shop)/i;
    for (const t of CS_TEMPLATES) {
      const body = t.components.find((c) => c.type === 'BODY')!.text;
      expect(body).not.toMatch(banned);
    }
  });

  it('every {{n}} placeholder has a matching example value', () => {
    for (const t of CS_TEMPLATES) {
      const body = t.components.find((c) => c.type === 'BODY')!;
      const count = (body.text.match(/\{\{\d+\}\}/g) ?? []).length;
      expect(body.example.body_text[0]).toHaveLength(count);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/wa-cs-templates.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/lib/whatsapp-cloud/cs-templates.ts`:

```typescript
/**
 * The minimal CS set injected into a customer's WABA at connect time (spec D9).
 * Our 17 internal templates are NOT copied — they are Bestie's own business templates.
 *
 * Everything here is UTILITY and deliberately dry. Meta reclassifies promotional-sounding
 * copy to MARKETING, which makes the customer pay per message and requires opt-in.
 */
export interface CsTemplateDef {
  name: string;
  category: 'UTILITY';
  components: Array<{ type: 'BODY'; text: string; example: { body_text: string[][] } }>;
}

export const CS_TEMPLATES: CsTemplateDef[] = [
  {
    name: 'cs_followup',
    category: 'UTILITY',
    components: [{ type: 'BODY',
      text: 'שלום {{1}}, פנייתך אל {{2}} עודכנה. נשמח להמשיך מכאן.',
      example: { body_text: [['דנה', 'המותג']] } }],
  },
  {
    name: 'cs_order_update',
    category: 'UTILITY',
    components: [{ type: 'BODY',
      text: 'שלום {{1}}, הזמנה {{2}} אצל {{3}} עודכנה. הסטטוס הנוכחי: {{4}}.',
      example: { body_text: [['דנה', '10432', 'המותג', 'נשלחה']] } }],
  },
  {
    name: 'cs_human_reply',
    category: 'UTILITY',
    components: [{ type: 'BODY',
      text: 'שלום {{1}}, נציג/ה מ{{2}} השיב/ה לפנייתך.',
      example: { body_text: [['דנה', 'המותג']] } }],
  },
];

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}`;

export async function createCsTemplates(token: string, wabaId: string, accountId: string): Promise<boolean> {
  const { supabase } = await import('@/lib/supabase');
  const { data: acct } = await supabase.from('accounts').select('language').eq('id', accountId).maybeSingle();
  const language = (acct as any)?.language === 'en' ? 'en_US' : 'he';

  const results = await Promise.all(CS_TEMPLATES.map(async (t) => {
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: t.name, language, category: t.category, components: t.components }),
    });
    if (!res.ok) console.warn('[cs-templates] create failed', t.name, await res.text().catch(() => ''));
    return res.ok;
  }));
  return results.every(Boolean);
}
```

⚠️ The Hebrew copy above uses `{{2}}` as the brand name. If `accounts.language` is `en`, the Hebrew body will be submitted under `en_US` and Meta will reject it — add an English variant per template before shipping, or gate to Hebrew-only accounts in v1 and say so.

- [ ] **Step 4: Verify against a real WABA**

Run the creation against Bestie's own WABA once and confirm Meta accepts the category:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx tsx -e "import('./src/lib/whatsapp-cloud/cs-templates').then(m => console.log(m.CS_TEMPLATES.length))"
```

Then create one by hand via the Graph API and check `status` and `category` on the response. **If Meta returns `category: MARKETING`, the copy failed — rewrite it before continuing.** This is the "verify during build" item #2.

- [ ] **Step 5: Wire template status from the webhook**

Add a `message_template_status_update` branch to `src/app/api/webhooks/whatsapp/route.ts` that writes into `whatsapp_channels.templates`:

```typescript
      if (change.field === 'message_template_status_update') {
        const v = change.value ?? {};
        const ch = await resolveChannelByPhoneNumberId(value?.metadata?.phone_number_id ?? '');
        if (ch) {
          const { data: cur } = await supabase.from('whatsapp_channels').select('templates').eq('id', ch.id).maybeSingle();
          const templates = { ...((cur as any)?.templates ?? {}), [v.message_template_name]: v.event };
          await supabase.from('whatsapp_channels').update({ templates }).eq('id', ch.id);
        }
        continue;
      }
```

Note: this webhook arrives on the **WABA**, so `value.metadata.phone_number_id` may be absent — check the live payload and fall back to matching `entry.id` against `waba_id`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp-cloud/cs-templates.ts src/app/api/webhooks/whatsapp/route.ts tests/unit/wa-cs-templates.test.ts
git commit -m "feat(wa): 3 UTILITY CS templates provisioned per customer WABA + status webhook"
```

---

### Task 5: Billing probe

**Files:**
- Create: `src/lib/whatsapp-cloud/billing-probe.ts`
- Modify: `src/lib/whatsapp-cloud/client.ts` (surface error code 131042 to callers)
- Test: `tests/unit/wa-billing-probe.test.ts`

**Interfaces:**
- Produces: `runBillingProbe(channelId: string): Promise<{ paymentReady: boolean; reason?: 'no_card' | 'template_pending' | 'send_failed' }>`
- Produces: `isNoCardError(result: WhatsAppSendResult): boolean` — matches Meta error `131042`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { isNoCardError } from '@/lib/whatsapp-cloud/billing-probe';

describe('billing probe error classification', () => {
  it('131042 means the customer has not attached a card', () => {
    expect(isNoCardError({ success: false, error: { code: 131042, message: 'payment' } } as any)).toBe(true);
  });
  it('other failures are not a billing problem', () => {
    expect(isNoCardError({ success: false, error: { code: 131026, message: 'undeliverable' } } as any)).toBe(false);
  });
  it('a success is never a billing problem', () => {
    expect(isNoCardError({ success: true } as any)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it → FAIL. Then implement**

Create `src/lib/whatsapp-cloud/billing-probe.ts`:

```typescript
import type { WhatsAppSendResult } from '@/lib/whatsapp-cloud/client';

/** Meta returns 131042 when the WABA has no valid payment method attached. */
export const NO_CARD_ERROR_CODE = 131042;

export function isNoCardError(result: WhatsAppSendResult): boolean {
  return !result.success && result.error?.code === NO_CARD_ERROR_CODE;
}

/**
 * Verify the customer's card by actually sending a template to their own number.
 * Nothing short of a real delivered message proves billing works (D8).
 */
export async function runBillingProbe(channelId: string): Promise<{ paymentReady: boolean; reason?: string }> {
  const { resolveWaChannelById } = await import('@/lib/whatsapp-cloud/channels');
  const { sendTemplate } = await import('@/lib/whatsapp-cloud/client');
  const { supabase } = await import('@/lib/supabase');

  const channel = await resolveWaChannelById(channelId);
  const { data: row } = await supabase.from('whatsapp_channels').select('templates').eq('id', channelId).maybeSingle();
  if ((row as any)?.templates?.cs_followup !== 'APPROVED') {
    return { paymentReady: false, reason: 'template_pending' };
  }

  const to = (channel.displayPhoneNumber ?? '').replace(/\D/g, '');
  const res = await sendTemplate({
    to, templateName: 'cs_followup', languageCode: 'he',
    components: [{ type: 'body', parameters: [
      { type: 'text', text: channel.verifiedName ?? 'שלום' },
      { type: 'text', text: channel.verifiedName ?? 'העסק' },
    ] }],
    channel,
  });

  const paymentReady = res.success;
  await supabase.from('whatsapp_channels')
    .update({ payment_ready: paymentReady, status: paymentReady ? 'active' : 'pending' })
    .eq('id', channelId);

  if (isNoCardError(res)) return { paymentReady: false, reason: 'no_card' };
  return { paymentReady, reason: paymentReady ? undefined : 'send_failed' };
}
```

- [ ] **Step 3: Catch cards that expire later**

In `src/lib/cs/wa-cs-worker.ts`, after every send attempt, flip the flag when Meta reports 131042 at runtime:

```typescript
    if (isNoCardError(sent as any)) {
      await supabase.from('whatsapp_channels').update({ payment_ready: false }).eq('id', job.waChannelId);
      const { notifyOps } = await import('@/lib/whatsapp-notify');
      await notifyOps(`WhatsApp channel ${job.waChannelId} lost its payment method (131042).`).catch(() => {});
    }
```

- [ ] **Step 4: Verify parity and commit**

Run: `npm run type-check && npx vitest run` → no worse than baseline.

```bash
git add src/lib/whatsapp-cloud/billing-probe.ts src/lib/cs/wa-cs-worker.ts tests/unit/wa-billing-probe.test.ts
git commit -m "feat(wa): billing probe — a channel is only active once a real template lands"
```

---

### Task 6: Coexistence echoes → bot pause and auto-resume

**Files:**
- Create: `supabase/migrations/076_cs_sessions_human_reply.sql`
- Modify: `src/app/api/webhooks/whatsapp/route.ts` (new webhook fields)
- Create: `src/lib/handoff/auto-resume.ts`
- Modify: `src/lib/cs/wa-cs-worker.ts` (double pause check)
- Test: `tests/unit/wa-bot-pause-matrix.test.ts`

**Interfaces:**
- Produces: `shouldAutoResume(row: { bot_paused_reason: string | null; human_last_reply_at: string | null }, idleHours: number, now?: number): boolean`

- [ ] **Step 1: Migration**

```sql
-- Migration 076: coexistence echo timestamps for the 6h auto-resume (spec D7).
alter table public.whatsapp_cs_sessions
  add column if not exists human_last_reply_at timestamptz;

comment on column public.whatsapp_cs_sessions.human_last_reply_at is
  'Last time a human replied from the WhatsApp Business app (smb_message_echoes). Drives auto-resume.';
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { shouldAutoResume } from '@/lib/handoff/auto-resume';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('pause TTL matrix (spec D7)', () => {
  it('a fresh human reply keeps the bot paused', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: iso(1 * HOUR) }, 6, NOW)).toBe(false);
  });

  it('6h of human silence releases it', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: iso(7 * HOUR) }, 6, NOW)).toBe(true);
  });

  it('exactly at the threshold does NOT resume — strictly greater', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: iso(6 * HOUR) }, 6, NOW)).toBe(false);
  });

  it('a manual takeover NEVER auto-resumes, however long the silence', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'manual_takeover', human_last_reply_at: iso(500 * HOUR) }, 6, NOW)).toBe(false);
  });

  it('a paused session with no recorded reply does not resume on a guess', () => {
    expect(shouldAutoResume({ bot_paused_reason: 'human_reply', human_last_reply_at: null }, 6, NOW)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it → FAIL. Then implement**

Create `src/lib/handoff/auto-resume.ts`:

```typescript
/**
 * Spec D7: a pause caused by a human replying from the phone expires after N hours of
 * human silence. A deliberate manual takeover never expires — only a person undoes it.
 */
export function shouldAutoResume(
  row: { bot_paused_reason: string | null; human_last_reply_at: string | null },
  idleHours: number,
  now: number = Date.now(),
): boolean {
  if (row.bot_paused_reason !== 'human_reply') return false;
  if (!row.human_last_reply_at) return false;
  return now - Date.parse(row.human_last_reply_at) > idleHours * 3_600_000;
}
```

- [ ] **Step 4: Handle the three new webhook fields**

In `processWebhook`, before the `messages` handling:

```typescript
      // Coexistence: a human replied from the WhatsApp Business app on the phone.
      if (change.field === 'smb_message_echoes') {
        for (const echo of (change.value?.message_echoes ?? [])) {
          const waId = echo?.to;
          if (!waId || !waChannel) continue;
          const session = await loadCsSessionByChannel('whatsapp', waId, waChannel.id);
          if (!session) continue;
          await supabase.from('whatsapp_cs_sessions')
            .update({ human_last_reply_at: new Date().toISOString() })
            .eq('wa_id', session.wa_id);
          if (session.active_chat_session_id) await pauseBot(session.active_chat_session_id, 'human_reply');
        }
        continue;
      }

      // Coexistence history + contact sync: ACK and DISCARD. We store a counter, never
      // another business's chat history — what we don't keep can't leak (D6).
      if (change.field === 'history' || change.field === 'smb_app_state_sync') {
        console.log('[whatsapp webhook] coexistence sync payload received and discarded', { field: change.field });
        continue;
      }
```

- [ ] **Step 5: Check the pause twice in the worker**

An echo can land mid-turn, so `src/lib/cs/wa-cs-worker.ts` checks at dequeue **and** again after `runCsTurn`, immediately before sending — the same pattern as `wa-lead-worker.ts`. Apply `shouldAutoResume` at the first check so an expired pause clears itself.

- [ ] **Step 6: Run the tests and commit**

```bash
npx vitest run tests/unit/wa-bot-pause-matrix.test.ts
git add supabase/migrations/076_cs_sessions_human_reply.sql src/lib/handoff/auto-resume.ts src/lib/cs src/app/api/webhooks/whatsapp/route.ts tests/unit/wa-bot-pause-matrix.test.ts
git commit -m "feat(wa): coexistence echoes pause the bot, 6h of human silence resumes it"
```

---

### Task 7: Wizard connect step (Embedded Signup v4)

**Files:**
- Modify: `src/app/onboard/[token]/OnboardWizard.tsx`
- Create: `src/components/onboard/WhatsAppConnectCard.tsx`
- Test: manual — the ES popup cannot be unit tested meaningfully.

⚠️ **Verify-during-build item #1.** The generic v4 flow is confirmed; the Coexistence-specific `extras` / `featureType` values are not. Build against Meta's live Embedded Signup Builder output, not from memory. **v2 dies 2026-10-15 — v4 only.**

- [ ] **Step 1: Add the env vars**

`NEXT_PUBLIC_FB_APP_ID` and `NEXT_PUBLIC_WA_ES_CONFIG_ID` (the `config_id` produced by the Facebook Login for Business configuration). Add both to `scripts/check-env.ts` as required, and to Vercel.

- [ ] **Step 2: Build the card**

Three states, mirroring the existing Instagram connect card:

```
[1] "חבר וואטסאפ"          → FB.login popup (ES v4) → POST /api/onboard/[token]/whatsapp
[2] "חבר אמצעי תשלום"      → deep link to the WABA's WhatsApp Manager billing page
[3] automatic billing probe → ✅ / "ממתין לאישור תבנית" / retry
```

The WhatsApp step as a whole is **optional** like the other sources (D1); steps 2–3 are **mandatory within it** — the channel is not fully connected without a verified card. While the template is still pending, show a waiting state, **not a failure**.

- [ ] **Step 3: Surface eligibility errors in Hebrew**

The popup's `CANCEL` event carries `current_step` and `error_code`. Coexistence has customer-side gates (WhatsApp Business app tenure, account quality). Map the codes you actually observe to readable Hebrew; never render a raw code. This is verify-during-build item #3 — record the real codes as you hit them.

- [ ] **Step 4: Manual verification**

Run the wizard end to end against a real test business. Confirm: popup opens → returns a code → the route 200s → a `whatsapp_channels` row appears with `provision_state` fully true → the billing step deep-links correctly.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboard src/components/onboard/WhatsAppConnectCard.tsx scripts/check-env.ts
git commit -m "feat(onboard): Embedded Signup v4 WhatsApp connect step"
```

---

### Task 8: Admin surface and disconnect

**Files:**
- Modify: the existing admin account page (find it with `grep -rn "Instagram" src/app/admin --include=*.tsx | head`)
- Create: `src/app/api/admin/whatsapp-channel/[id]/route.ts` (DELETE)
- Modify: `src/lib/whatsapp-cloud/provisioning.ts`
- Test: `tests/unit/wa-disconnect.test.ts`

**Interfaces:**
- Consumes: `deleteToken` (Plan A), `resolveWaChannelById` (Plan A).
- Produces: `disconnectChannel(channelId: string): Promise<void>` — exported from `provisioning.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';

const deleteToken = vi.fn(async () => {});
vi.mock('@/lib/whatsapp-cloud/channel-tokens', () => ({ deleteToken }));

describe('disconnect', () => {
  it('unsubscribes, DELETES the vault secret, and marks the row disconnected', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    const { disconnectChannel } = await import('@/lib/whatsapp-cloud/provisioning');
    await disconnectChannel('ch-1');
    expect(String(fetchMock.mock.calls[0][0])).toContain('subscribed_apps');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(deleteToken).toHaveBeenCalled();   // flagging the row is NOT enough
  });
});
```

- [ ] **Step 2: Implement `disconnectChannel`**

`DELETE /{waba_id}/subscribed_apps` → `deleteToken(secretId)` → `status='disconnected'`, `token_secret_id=null`. **Delete the secret, never just flag the row** (spec §2).

- [ ] **Step 3: Admin block**

On the existing account page: number, verified name, channel status, `payment_ready` badge, the 3 template statuses, and a disconnect button. **No new dashboard** (spec §8).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin src/app/api/admin/whatsapp-channel tests/unit/wa-disconnect.test.ts src/lib/whatsapp-cloud/provisioning.ts
git commit -m "feat(admin): WhatsApp channel block + disconnect that deletes the Vault secret"
```

---

### Task 9: Cross-tenant leak test (spec §10) — the release gate

**Files:**
- Create: `scripts/wa-tenant-isolation-verify.ts`

This is the test Plan A could not write, because it needs two channels to exist.

- [ ] **Step 1: Write the script**

Seed a shopper with an open ticket on **Bestie's** channel, then deliver a synthetic inbound from the same phone on a **customer** channel, and assert:

1. Two distinct `whatsapp_cs_sessions` rows exist — same `channel_user_id`, different `wa_channel_id`.
2. The customer-channel toolset contains **no** `resolve_brand` / `bind_brand`.
3. `list_open_threads` on the customer channel returns **only** that account's threads — the Bestie-channel ticket is absent.
4. Redis keys for the two do not collide.

- [ ] **Step 2: Run it**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx tsx scripts/wa-tenant-isolation-verify.ts
```
Expected: all ✅. **Any ❌ blocks the first customer going live** — this is the gate, not a nice-to-have.

- [ ] **Step 3: Commit**

```bash
git add scripts/wa-tenant-isolation-verify.ts
git commit -m "test(wa): cross-tenant isolation gate (spec §10)"
```

---

## Still out of scope after Plan B

Unchanged from the spec's own exclusions:

- Migrating Argania / Studio Pasha off the shared number (D3 — later, and nothing here blocks it)
- Full-API (non-coexistence) onboarding; multiple numbers per account
- A WhatsApp inbox UI — coexistence keeps the customer's own app as their inbox
- Encrypting `ig_graph_connections.access_token` (deserves the same Vault treatment, separate task)
- The handoff spec's settings UI and extra triggers — only the minimal pause slice lands here
