# BYO WhatsApp — Channel Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every WhatsApp send and every inbound route through an explicit channel record, so Bestie's own number becomes one row among many — with byte-identical behaviour for existing traffic.

**Architecture:** A new `whatsapp_channels` table holds one row per business WhatsApp number (WABA id, phone number id, Vault-encrypted token). A resolver module turns an `accountId` or an inbound `phone_number_id` into a `WaChannel`. The 9 send functions in `client.ts` take that channel as a **required** parameter — no env fallback, so a missing channel is a loud error and never a silent send from Bestie's number. The CS session key, Redis keys and QStash dedup ids all gain the channel id. Bestie's number is seeded as an ordinary row and uses the identical code path — there is no special case anywhere.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + `supabase_vault` 0.3.1), Upstash Redis + QStash, Vitest, Meta Graph API v23.0.

**Spec:** `docs/superpowers/specs/2026-08-06-byo-whatsapp-number-tech-provider-design.md`

**Scope:** This plan covers spec §2, §3, §6 and §9 steps 1–3 — the foundation. Customer onboarding (§4 connect flow, §5 provisioning, §7 coexistence pause, §8 admin surface) is **Plan B**, written after this lands. Plan A ends with a system that would route a second channel correctly, but has no way to create one yet except by hand.

## Global Constraints

- **Migration number is `075`** — `074_cs_sessions_channel.sql` is the current head.
- **Migrations follow 073's posture:** no `anon` / `authenticated` grants, RLS enabled, explicit `revoke`.
- **Two different things are called "channel". Never conflate them:**
  - `whatsapp_cs_sessions.channel` = the **medium** (`whatsapp | instagram | widget | web_chat`), shipped in migration 074, owned by `src/lib/cs/identity.ts`. **Do not touch it.**
  - `wa_channel_id` = **which business WhatsApp number**, `whatsapp_channels.id`. New in this plan.
  - The TypeScript type is `WaChannel`, never `Channel`.
- **No raw token column, ever.** `whatsapp_channels.token_secret_id uuid` points at a Vault secret. Tokens reach the app only through `SECURITY DEFINER` wrappers granted to `service_role` alone.
- **Graph version:** read from `process.env.WHATSAPP_GRAPH_VERSION`, default `'v23.0'` (raise from the current `v21.0` default in the same commit as Task 3).
- **QStash `deduplicationId` MUST NOT contain `:`** — use `_` separators only (existing constraint, `wa-cs-publish.ts`).
- **Redis keys MAY contain `:`.**
- **Behaviour-neutrality is the acceptance bar for this whole plan.** Bestie's live traffic (Argania, Studio Pasha, מאוחדת, CRM notifies, pipeline alerts) must behave identically at the end of every task.
- Run a single test file with `npx vitest run <path>` — `npm run test` is watch mode.

---

### Task 1: Channel table, Vault token storage, and Bestie's seed row

**Files:**
- Create: `supabase/migrations/075_whatsapp_channels.sql`
- Create: `src/lib/whatsapp-cloud/channel-tokens.ts`
- Create: `scripts/seed-bestie-channel.ts`
- Test: `tests/unit/wa-channel-tokens.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - SQL: table `public.whatsapp_channels`; columns `wa_channel_id` on `whatsapp_cs_sessions`; functions `public.wa_channel_store_token(p_token text) returns uuid`, `public.wa_channel_read_token(p_secret_id uuid) returns text`, `public.wa_channel_delete_token(p_secret_id uuid) returns void`.
  - TS: `storeToken(token: string): Promise<string>`, `readToken(secretId: string): Promise<string>`, `deleteToken(secretId: string): Promise<void>` from `@/lib/whatsapp-cloud/channel-tokens`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/075_whatsapp_channels.sql`:

```sql
-- Migration 075: BYO WhatsApp — one row per business WhatsApp number.
-- Spec: docs/superpowers/specs/2026-08-06-byo-whatsapp-number-tech-provider-design.md §2
--
-- NOTE ON NAMING: whatsapp_cs_sessions.channel (migration 074) is the MEDIUM
-- (whatsapp|instagram|widget|web_chat). wa_channel_id below is WHICH BUSINESS NUMBER.
-- They are orthogonal. Do not merge them.

create table if not exists public.whatsapp_channels (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null unique references public.accounts(id) on delete cascade,
  waba_id               text not null,
  phone_number_id       text not null unique,
  display_phone_number  text,
  verified_name         text,
  token_secret_id       uuid,
  onboarding_mode       text not null default 'coexistence'
                          check (onboarding_mode in ('coexistence','full_api')),
  status                text not null default 'pending'
                          check (status in ('pending','active','suspended','disconnected')),
  payment_ready         boolean not null default false,
  sync_initiated_at     timestamptz,
  templates             jsonb not null default '{}'::jsonb,
  provision_state       jsonb not null default '{}'::jsonb,
  connected_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_wa_channels_account on public.whatsapp_channels(account_id);
create index if not exists idx_wa_channels_status  on public.whatsapp_channels(status);

-- 073 posture: RLS on, zero anon/authenticated grants. Server-side service_role only.
alter table public.whatsapp_channels enable row level security;
revoke all on public.whatsapp_channels from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_channels to service_role;

-- --------------------------------------------------------------------------
-- Sessions gain the number they arrived on.
-- --------------------------------------------------------------------------
alter table public.whatsapp_cs_sessions
  add column if not exists wa_channel_id uuid references public.whatsapp_channels(id) on delete set null;

-- Migration 074's index assumed one number. Replace it with two partial indexes so
-- the same shopper talking to two different business numbers gets two sessions,
-- while non-WhatsApp media (and pre-backfill rows) keep the original key.
drop index if exists uq_cs_sessions_channel_user;

create unique index if not exists uq_cs_sessions_channel_user_nochan
  on public.whatsapp_cs_sessions(channel, channel_user_id)
  where wa_channel_id is null;

create unique index if not exists uq_cs_sessions_channel_user_chan
  on public.whatsapp_cs_sessions(channel, channel_user_id, wa_channel_id)
  where wa_channel_id is not null;

create index if not exists idx_cs_sessions_wa_channel
  on public.whatsapp_cs_sessions(wa_channel_id);

comment on column public.whatsapp_cs_sessions.wa_channel_id is
  'Which business WhatsApp number this session arrived on (whatsapp_channels.id). NULL for non-WhatsApp media.';

-- --------------------------------------------------------------------------
-- Vault wrappers. PostgREST only exposes `public`, and the vault schema must not be
-- exposed directly — these three SECURITY DEFINER functions are the entire surface.
-- --------------------------------------------------------------------------
create or replace function public.wa_channel_store_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare v_id uuid;
begin
  select vault.create_secret(p_token, 'wa_channel_' || gen_random_uuid()::text,
                             'BYO WhatsApp channel access token') into v_id;
  return v_id;
end;
$$;

create or replace function public.wa_channel_read_token(p_secret_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where id = p_secret_id;
  return v_secret;
end;
$$;

create or replace function public.wa_channel_delete_token(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  delete from vault.secrets where id = p_secret_id;
end;
$$;

revoke all on function public.wa_channel_store_token(text)  from public, anon, authenticated;
revoke all on function public.wa_channel_read_token(uuid)   from public, anon, authenticated;
revoke all on function public.wa_channel_delete_token(uuid) from public, anon, authenticated;
grant execute on function public.wa_channel_store_token(text)  to service_role;
grant execute on function public.wa_channel_read_token(uuid)   to service_role;
grant execute on function public.wa_channel_delete_token(uuid) to service_role;
```

- [ ] **Step 2: Apply the migration and verify the grants took**

Run:
```bash
npx supabase db push
```

Then verify no non-service role can reach the token functions:
```sql
select p.proname, r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(p.proacl) a on true
left join pg_roles r on r.oid = a.grantee
where n.nspname = 'public' and p.proname like 'wa_channel_%token%';
```
Expected: only `service_role` appears. If `anon` or `authenticated` shows up, the `revoke` did not take — stop and fix before continuing.

- [ ] **Step 3: Write the failing test for the token module**

Create `tests/unit/wa-channel-tokens.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }));

import { storeToken, readToken, deleteToken } from '@/lib/whatsapp-cloud/channel-tokens';

beforeEach(() => rpc.mockReset());

describe('channel token vault wrappers', () => {
  it('storeToken returns the new secret id', async () => {
    rpc.mockResolvedValue({ data: 'a3f1e2d4-0000-4000-8000-000000000001', error: null });
    await expect(storeToken('EAAG...')).resolves.toBe('a3f1e2d4-0000-4000-8000-000000000001');
    expect(rpc).toHaveBeenCalledWith('wa_channel_store_token', { p_token: 'EAAG...' });
  });

  it('storeToken throws on an RPC error rather than returning undefined', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(storeToken('EAAG...')).rejects.toThrow(/permission denied/);
  });

  it('readToken throws when the secret is missing — never returns empty', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(readToken('a3f1e2d4-0000-4000-8000-000000000001')).rejects.toThrow(/not found/i);
  });

  it('deleteToken is a no-op for a null secret id', async () => {
    await deleteToken(null as unknown as string);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/unit/wa-channel-tokens.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/whatsapp-cloud/channel-tokens"`.

- [ ] **Step 5: Implement the token module**

Create `src/lib/whatsapp-cloud/channel-tokens.ts`:

```typescript
import { supabase } from '@/lib/supabase';

/**
 * Access tokens for BYO WhatsApp channels live in Supabase Vault, never in a table column.
 * These three wrappers are the only way in or out — the underlying SECURITY DEFINER
 * functions are granted to service_role alone (migration 075).
 */

export async function storeToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('wa_channel_store_token', { p_token: token });
  if (error) throw new Error(`wa_channel_store_token failed: ${error.message}`);
  if (!data) throw new Error('wa_channel_store_token returned no secret id');
  return data as string;
}

export async function readToken(secretId: string): Promise<string> {
  const { data, error } = await supabase.rpc('wa_channel_read_token', { p_secret_id: secretId });
  if (error) throw new Error(`wa_channel_read_token failed: ${error.message}`);
  if (!data) throw new Error(`WhatsApp channel token not found for secret ${secretId}`);
  return data as string;
}

/** Disconnect DELETES the secret — flagging the row is not enough (spec §2). */
export async function deleteToken(secretId: string): Promise<void> {
  if (!secretId) return;
  const { error } = await supabase.rpc('wa_channel_delete_token', { p_secret_id: secretId });
  if (error) throw new Error(`wa_channel_delete_token failed: ${error.message}`);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/unit/wa-channel-tokens.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Write the seed script**

Create `scripts/seed-bestie-channel.ts`:

```typescript
/**
 * Seed Bestie's own WhatsApp number as an ordinary whatsapp_channels row.
 * After this, env vars are seed-only — the running code reads the table.
 *
 * Usage: npx tsx scripts/seed-bestie-channel.ts <bestie-account-id>
 */
import { supabase } from '../src/lib/supabase';
import { storeToken } from '../src/lib/whatsapp-cloud/channel-tokens';

async function main() {
  const accountId = process.argv[2];
  if (!accountId) throw new Error('usage: seed-bestie-channel.ts <bestie-account-id>');

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !phoneNumberId || !wabaId) {
    throw new Error('WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_BUSINESS_ACCOUNT_ID required');
  }

  const { data: existing } = await supabase
    .from('whatsapp_channels').select('id, token_secret_id')
    .eq('phone_number_id', phoneNumberId).maybeSingle();
  if (existing) {
    console.log(`[seed] channel already exists: ${existing.id} — nothing to do`);
    return;
  }

  // Read live metadata so display_phone_number / verified_name are real, not guessed.
  const res = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}/${phoneNumberId}` +
    `?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const meta = await res.json();
  if (!res.ok) throw new Error(`Graph lookup failed: ${JSON.stringify(meta)}`);

  const secretId = await storeToken(token);

  const { data, error } = await supabase
    .from('whatsapp_channels')
    .insert({
      account_id: accountId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: meta.display_phone_number ?? null,
      verified_name: meta.verified_name ?? null,
      token_secret_id: secretId,
      onboarding_mode: 'full_api',   // Bestie owns this WABA outright
      status: 'active',
      payment_ready: true,           // billed on our own card already
      connected_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`insert failed: ${error.message}`);

  console.log(`[seed] Bestie channel created: ${data.id} (${meta.display_phone_number})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 8: Run the seed and verify the round-trip**

Find the Bestie account id, then:
```bash
npx tsx scripts/seed-bestie-channel.ts <bestie-account-id>
npx tsx scripts/seed-bestie-channel.ts <bestie-account-id>   # second run must say "already exists"
```

Verify the token decrypts back to the same value:
```sql
select c.display_phone_number, c.status,
       public.wa_channel_read_token(c.token_secret_id) = current_setting('x.tok', true) as token_ok
from public.whatsapp_channels c;
```
Simpler check — confirm it is non-empty and starts correctly:
```sql
select left(public.wa_channel_read_token(token_secret_id), 4) from public.whatsapp_channels;
```
Expected: `EAAG` (or whatever your token's prefix is). Empty or null means the Vault wrapper is broken — stop.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/075_whatsapp_channels.sql \
        src/lib/whatsapp-cloud/channel-tokens.ts \
        scripts/seed-bestie-channel.ts \
        tests/unit/wa-channel-tokens.test.ts
git commit -m "feat(wa): whatsapp_channels table + Vault-backed tokens + Bestie seed row"
```

---

### Task 2: Channel resolver with Redis cache

**Files:**
- Create: `src/lib/whatsapp-cloud/channels.ts`
- Test: `tests/unit/wa-channel-resolve.test.ts`

**Interfaces:**
- Consumes: `readToken` from `@/lib/whatsapp-cloud/channel-tokens` (Task 1).
- Produces:
  - `interface WaChannel { id: string; accountId: string; wabaId: string; phoneNumberId: string; displayPhoneNumber: string | null; verifiedName: string | null; token: string; status: string; paymentReady: boolean; }`
  - `resolveChannelByAccount(accountId: string): Promise<WaChannel>` — **throws** if none.
  - `resolveChannelByPhoneNumberId(pnid: string): Promise<WaChannel | null>` — null if unknown.
  - `getBestieChannel(): Promise<WaChannel>` — resolves via `BESTIE_ACCOUNT_ID` env, throws if unset/missing.
  - `invalidateChannelCache(channel: { accountId: string; phoneNumberId: string }): Promise<void>` — both cache keys are dropped together, so callers pass the channel, not an id.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/wa-channel-resolve.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: any[]) => from(...a) } }));

const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();
vi.mock('@/lib/redis', () => ({
  redisGet: (...a: any[]) => redisGet(...a),
  redisSet: (...a: any[]) => redisSet(...a),
  redisDel: (...a: any[]) => redisDel(...a),
}));

vi.mock('@/lib/whatsapp-cloud/channel-tokens', () => ({
  readToken: vi.fn(async () => 'EAAG-decrypted'),
}));

import {
  resolveChannelByAccount,
  resolveChannelByPhoneNumberId,
} from '@/lib/whatsapp-cloud/channels';

const ROW = {
  id: 'ch-1', account_id: 'acc-1', waba_id: '1458477285751402',
  phone_number_id: '1056971817508262', display_phone_number: '+972 54-390-2030',
  verified_name: 'Bestie', token_secret_id: 'sec-1', status: 'active', payment_ready: true,
};

beforeEach(() => {
  [maybeSingle, eq, select, from, redisGet, redisSet, redisDel].forEach((m) => m.mockClear());
  redisGet.mockResolvedValue(null);
});

describe('channel resolution', () => {
  it('resolves by account and decrypts the token', async () => {
    maybeSingle.mockResolvedValue({ data: ROW, error: null });
    const ch = await resolveChannelByAccount('acc-1');
    expect(ch.phoneNumberId).toBe('1056971817508262');
    expect(ch.token).toBe('EAAG-decrypted');
  });

  it('THROWS when an account has no channel — never falls back to env', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(resolveChannelByAccount('acc-none')).rejects.toThrow(/no WhatsApp channel/i);
  });

  it('returns null for an unknown phone_number_id (webhook must still 200)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(resolveChannelByPhoneNumberId('999')).resolves.toBeNull();
  });

  it('never caches the decrypted token — cache payload has no token field', async () => {
    maybeSingle.mockResolvedValue({ data: ROW, error: null });
    await resolveChannelByPhoneNumberId('1056971817508262');
    const cached = JSON.parse(redisSet.mock.calls[0][1]);
    expect(cached.token).toBeUndefined();
    expect(cached.token_secret_id).toBeUndefined();
  });

  it('a disconnected channel does not resolve', async () => {
    maybeSingle.mockResolvedValue({ data: { ...ROW, status: 'disconnected' }, error: null });
    await expect(resolveChannelByPhoneNumberId('1056971817508262')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/wa-channel-resolve.test.ts`
Expected: FAIL — cannot resolve `@/lib/whatsapp-cloud/channels`.

- [ ] **Step 3: Implement the resolver**

Create `src/lib/whatsapp-cloud/channels.ts`:

```typescript
import { supabase } from '@/lib/supabase';
import { redisGet, redisSet, redisDel } from '@/lib/redis';
import { readToken } from '@/lib/whatsapp-cloud/channel-tokens';

/**
 * A business WhatsApp number. NOT to be confused with whatsapp_cs_sessions.channel,
 * which is the MEDIUM (whatsapp|instagram|widget|web_chat).
 */
export interface WaChannel {
  id: string;
  accountId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  token: string;
  status: string;
  paymentReady: boolean;
}

/** What we put in Redis: everything EXCEPT the token and the secret id. */
type CachedChannel = Omit<WaChannel, 'token'> & { tokenSecretId: string };

const TTL_SECONDS = 60;
const cacheKey = (kind: 'acct' | 'pnid', v: string) => `wa:chan:${kind}:${v}`;
const RESOLVABLE = new Set(['active', 'pending']);

function toCached(row: any): CachedChannel {
  return {
    id: row.id,
    accountId: row.account_id,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number ?? null,
    verifiedName: row.verified_name ?? null,
    tokenSecretId: row.token_secret_id,
    status: row.status,
    paymentReady: Boolean(row.payment_ready),
  };
}

async function hydrate(cached: CachedChannel): Promise<WaChannel> {
  const { tokenSecretId, ...rest } = cached;
  return { ...rest, token: await readToken(tokenSecretId) };
}

async function lookup(kind: 'acct' | 'pnid', column: string, value: string): Promise<WaChannel | null> {
  const key = cacheKey(kind, value);

  const hit = await redisGet<string>(key).catch(() => null);
  if (hit) {
    try { return await hydrate(JSON.parse(hit) as CachedChannel); } catch { /* fall through */ }
  }

  const { data, error } = await supabase
    .from('whatsapp_channels')
    .select('id, account_id, waba_id, phone_number_id, display_phone_number, verified_name, token_secret_id, status, payment_ready')
    .eq(column, value)
    .maybeSingle();
  if (error) throw new Error(`channel lookup failed (${column}=${value}): ${error.message}`);
  if (!data) return null;
  if (!RESOLVABLE.has(data.status)) return null;

  const cached = toCached(data);
  // The token is deliberately absent from the cached payload — it is decrypted per read.
  await redisSet(key, JSON.stringify(cached), TTL_SECONDS).catch(() => {});
  return hydrate(cached);
}

/** Outbound sends for a known account. THROWS — a missing channel must never silently
 *  become a send from Bestie's number (spec D4). */
export async function resolveChannelByAccount(accountId: string): Promise<WaChannel> {
  const ch = await lookup('acct', 'account_id', accountId);
  if (!ch) throw new Error(`no WhatsApp channel for account ${accountId}`);
  return ch;
}

/** Inbound routing. Null for an unknown number — the webhook logs and still returns 200. */
export async function resolveChannelByPhoneNumberId(pnid: string): Promise<WaChannel | null> {
  if (!pnid) return null;
  return lookup('pnid', 'phone_number_id', pnid);
}

/**
 * Bestie's own number. Internal ops (CRM notifies, pipeline alerts, trial reminders)
 * call this explicitly at the send site — explicit, but not threaded through call stacks
 * that have no tenant concept.
 */
export async function getBestieChannel(): Promise<WaChannel> {
  const accountId = process.env.BESTIE_ACCOUNT_ID;
  if (!accountId) throw new Error('BESTIE_ACCOUNT_ID is not set — cannot resolve Bestie WhatsApp channel');
  return resolveChannelByAccount(accountId);
}

export async function invalidateChannelCache(channel: { accountId: string; phoneNumberId: string }): Promise<void> {
  await redisDel(cacheKey('acct', channel.accountId), cacheKey('pnid', channel.phoneNumberId)).catch(() => {});
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/wa-channel-resolve.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add `BESTIE_ACCOUNT_ID` to the env checker**

Modify `scripts/check-env.ts` (or whatever `npm run check:env` runs) — add `BESTIE_ACCOUNT_ID` to the required list, then set it in `.env.local` and in Vercel to the account id used in Task 1 Step 8.

Run: `npm run check:env`
Expected: passes with the new variable present.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp-cloud/channels.ts tests/unit/wa-channel-resolve.test.ts scripts/check-env.ts
git commit -m "feat(wa): channel resolver by account / phone_number_id with short-TTL cache"
```

---

### Task 3: Send path takes an explicit channel

**Files:**
- Modify: `src/lib/whatsapp-cloud/client.ts` (delete `getConfig()` at :62-73; add `channel` to 9 exported functions)
- Modify: 33 caller files (full list in Step 4)
- Test: `tests/unit/wa-client-channel.test.ts`

**Interfaces:**
- Consumes: `WaChannel`, `getBestieChannel` from `@/lib/whatsapp-cloud/channels` (Task 2).
- Produces: every send/mark/typing/media function in `client.ts` gains a **required** `channel: WaChannel` field in its params object. `getConfig()` no longer exists.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/wa-client-channel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendText, sendTemplate, markAsRead } from '@/lib/whatsapp-cloud/client';
import type { WaChannel } from '@/lib/whatsapp-cloud/channels';

const CH: WaChannel = {
  id: 'ch-9', accountId: 'acc-9', wabaId: 'waba-9', phoneNumberId: 'PNID_CUSTOMER',
  displayPhoneNumber: '+972 50-000-0000', verifiedName: 'Customer', token: 'TOK_CUSTOMER',
  status: 'active', paymentReady: true,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ messages: [{ id: 'wamid.X' }], contacts: [{ wa_id: '972500000000' }] }),
    text: async () => '',
  })));
  process.env.WHATSAPP_ACCESS_TOKEN = 'TOK_BESTIE';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PNID_BESTIE';
});

function lastCall() {
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  return { url: String(f.mock.calls[0][0]), init: f.mock.calls[0][1] as RequestInit };
}

describe('send path is channel-scoped', () => {
  it('sendText posts to the CHANNEL phone number id, not the env one', async () => {
    await sendText({ to: '972500000000', body: 'hi', channel: CH });
    const { url, init } = lastCall();
    expect(url).toContain('/PNID_CUSTOMER/messages');
    expect(url).not.toContain('PNID_BESTIE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOK_CUSTOMER');
  });

  it('sendTemplate uses the channel token', async () => {
    await sendTemplate({ to: '972500000000', templateName: 'cs_followup', languageCode: 'he', channel: CH });
    const { init } = lastCall();
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOK_CUSTOMER');
  });

  it('markAsRead is channel-scoped too', async () => {
    await markAsRead('wamid.IN', CH);
    expect(lastCall().url).toContain('/PNID_CUSTOMER/messages');
  });

  it('a missing channel throws loudly instead of falling back to env', async () => {
    // @ts-expect-error deliberately omitting the required channel
    await expect(sendText({ to: '972500000000', body: 'hi' })).rejects.toThrow(/channel/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/wa-client-channel.test.ts`
Expected: FAIL — sends still go to `PNID_BESTIE` from `getConfig()`.

- [ ] **Step 3: Rewrite `client.ts`'s config plumbing**

In `src/lib/whatsapp-cloud/client.ts`:

Raise the default Graph version (line 19):
```typescript
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
```

Delete `getConfig()` (lines 62-73) entirely and replace it with:

```typescript
import type { WaChannel } from '@/lib/whatsapp-cloud/channels';

/**
 * Every send is scoped to a channel. There is NO env fallback: a missing channel is a
 * programming error, and silently sending from Bestie's number on a customer's behalf
 * is the exact failure this design exists to prevent (spec D4).
 */
function channelConfig(channel: WaChannel | undefined): { token: string; phoneNumberId: string } {
  if (!channel?.token || !channel?.phoneNumberId) {
    throw new Error(
      'WhatsApp send called without a channel. Pass channel: WaChannel — ' +
      'use getBestieChannel() for Bestie-owned operations.',
    );
  }
  return { token: channel.token, phoneNumberId: channel.phoneNumberId };
}
```

Then in each of the 9 exported functions, add `channel: WaChannel` to the params object type and swap the config call. For `sendText` (line 126) the change is:

```typescript
export async function sendText(params: {
  to: string;
  body: string;
  previewUrl?: boolean;
  channel: WaChannel;            // ← added, required
}): Promise<WhatsAppSendResult> {
  const { token, phoneNumberId } = channelConfig(params.channel);   // ← was getConfig()
  // ...rest unchanged
}
```

Six more take a params object, so each is the same literal two-line change — add `channel: WaChannel;` to the params type, swap `getConfig()` for `channelConfig(params.channel)`, touch nothing else: `sendTemplate` (:159), `sendMediaByLink` (:189), `sendInteractiveButtons` (:229), `sendInteractiveList` (:267), `sendInteractiveCtaUrl` (:317), `downloadMedia` (:414). `getMediaUrl` (:409) takes a positional `mediaId` — give it a trailing `channel: WaChannel` like `markAsRead` below.

While in this file, also delete the dead override stub at lines 77-80 — `init: RequestInit & { phoneNumberIdOverride?: string }` and the `const { phoneNumberIdOverride: _ignored, ...rest } = init;` that throws it away. It was the half-built version of this feature; leaving it invites someone to "fix" it back into a second, silent routing path. `WHATSAPP_APP_SECRET` and the webhook verify token stay global — one Meta app, one endpoint (spec §3).

`markAsRead` (:356), `sendReaction` (:372) and `sendTyping` (:392) take positional args today — give them a trailing required channel:

```typescript
export async function markAsRead(waMessageId: string, channel: WaChannel): Promise<boolean> {
  const { token, phoneNumberId } = channelConfig(channel);
  // ...rest unchanged
}

export async function sendReaction(params: {
  to: string; messageId: string; emoji: string; channel: WaChannel;
}): Promise<boolean> {
  const { token, phoneNumberId } = channelConfig(params.channel);
  // ...rest unchanged
}

export async function sendTyping(waMessageId: string, channel: WaChannel): Promise<boolean> {
  const { token, phoneNumberId } = channelConfig(channel);
  // ...rest unchanged
}
```

- [ ] **Step 4: Update every call site**

Get the exact list — 34 imports across 33 files:
```bash
grep -rn "from '@/lib/whatsapp-cloud/client'" src scripts
```

There are exactly **two** patterns. No call site should invent a third.

**Pattern A — multi-tenant CS path.** The channel is already known from the inbound. Thread it:
```typescript
// src/lib/cs/cs-agent.ts, cs-media.ts, cs-product-cards.ts, cs-ticket.ts,
// route-inbound-cs.ts, tools/index.ts, wa-cs-worker.ts
await sendText({ to: waId, body: reply, channel });
```

**Pattern B — Bestie's own operations.** Resolve Bestie's channel at the call site:
```typescript
// src/lib/crm/notify.ts, pipeline/notify.ts, whatsapp-notify.ts, and every other
// file in the list below
import { getBestieChannel } from '@/lib/whatsapp-cloud/channels';

await sendTemplate({
  to, templateName, languageCode, components,
  channel: await getBestieChannel(),
});
```

Pattern B files (all of these send as Bestie and always will):
```
src/app/api/admin/onboarding/create/route.ts
src/app/api/agent/clients/[id]/route.ts
src/app/api/agent/clients/route.ts
src/app/api/agent/onboarding/profile/route.ts
src/app/api/agent/settings/profile/route.ts
src/app/api/cron/agent-digest/route.ts
src/app/api/cron/trial-reminders/route.ts
src/app/api/influencer/[username]/support-tickets/[id]/send-image/route.ts
src/app/api/influencer/[username]/support-tickets/[id]/send-text/route.ts
src/lib/analytics/value-proof/identity.ts
src/lib/bestie/route-inbound-lead.ts
src/lib/bestie/wa-lead-worker.ts
src/lib/crm/match-influencer.ts
src/lib/crm/notify.ts
src/lib/crm/quote-ingest.ts
src/lib/crm/wa-worker.ts
src/lib/handoff/forward-to-itamar.ts
src/lib/orders/brand-orders.ts
src/lib/orders/lookup.ts
src/lib/orders/phone-verify.ts
src/lib/pipeline/notify-helpers.ts
src/lib/pipeline/notify.ts
src/lib/support/route-inbound.ts
src/lib/support/service-window.ts
src/lib/whatsapp-notify.ts
```

Pattern A files (channel threaded from the inbound — these gain a `channel: WaChannel` parameter on the functions that reach a send):
```
src/app/api/cs/reply/route.ts
src/app/api/webhooks/whatsapp/route.ts
src/lib/cs/cs-agent.ts
src/lib/cs/cs-media.ts
src/lib/cs/cs-product-cards.ts
src/lib/cs/cs-ticket.ts
src/lib/cs/route-inbound-cs.ts
src/lib/cs/tools/index.ts
src/lib/cs/wa-cs-worker.ts
```

For Pattern A in this task, pass `await getBestieChannel()` at the top of each entry point as a **temporary** stand-in — Task 5 replaces it with the real resolved channel. This keeps every intermediate commit shippable.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: zero errors. `typescript.ignoreBuildErrors` is on in `next.config.ts`, so this is the only thing that catches a missed call site — do not skip it.

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS, including the new `wa-client-channel.test.ts`. Any pre-existing test that calls a send function needs the channel added — fix those, do not skip them.

- [ ] **Step 7: Commit**

```bash
git add -A src/lib/whatsapp-cloud src/lib src/app tests/unit/wa-client-channel.test.ts
git commit -m "refactor(wa)!: every send takes an explicit channel — no env fallback

getConfig() is gone. A send without a channel now throws instead of silently
going out from Bestie's number. Internal ops call getBestieChannel() at the
send site; the CS path threads the resolved channel (real resolution in the
next commit). Graph default raised v21.0 -> v23.0."
```

---

### Task 4: Regression gate on the existing channel

**Files:**
- Create: `scripts/wa-channel-verify.ts`
- Test: none — this task's deliverable *is* the verification.

**Interfaces:**
- Consumes: `resolveChannelByAccount`, `resolveChannelByPhoneNumberId`, `getBestieChannel` (Task 2).
- Produces: `npx tsx scripts/wa-channel-verify.ts` exits 0 on a healthy channel, 1 with a printed reason otherwise.

This is spec §9 step 3 and spec §10's "integration = scripts, not vitest" — `tests/setup.ts` mocks `global.fetch`, so a green vitest against Meta is an illusion.

- [ ] **Step 1: Write the verification script**

Create `scripts/wa-channel-verify.ts`:

```typescript
/**
 * Live verification that the channel abstraction resolves to a working number.
 * Runs against the real Graph API — deliberately NOT a vitest (tests/setup.ts mocks fetch).
 *
 * Usage: npx tsx scripts/wa-channel-verify.ts [--send <e164-digits>]
 */
import { getBestieChannel, resolveChannelByPhoneNumberId } from '../src/lib/whatsapp-cloud/channels';
import { sendText } from '../src/lib/whatsapp-cloud/client';

const checks: Array<[string, boolean, string]> = [];
function check(name: string, ok: boolean, detail = '') { checks.push([name, ok, detail]); }

async function main() {
  const ch = await getBestieChannel();
  check('getBestieChannel resolves', Boolean(ch.id), ch.id);
  check('token decrypted', ch.token.length > 50, `len=${ch.token.length}`);
  check('status active', ch.status === 'active', ch.status);

  const byPnid = await resolveChannelByPhoneNumberId(ch.phoneNumberId);
  check('pnid resolves to the same channel', byPnid?.id === ch.id, String(byPnid?.id));

  const unknown = await resolveChannelByPhoneNumberId('000000000000000');
  check('unknown pnid returns null (webhook must still 200)', unknown === null, String(unknown));

  const res = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}/${ch.phoneNumberId}` +
    `?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${ch.token}` } },
  );
  const meta = await res.json();
  check('channel token authenticates against Graph', res.ok, JSON.stringify(meta).slice(0, 160));
  check('number matches the stored one',
        meta.display_phone_number === ch.displayPhoneNumber,
        `graph=${meta.display_phone_number} db=${ch.displayPhoneNumber}`);

  const sendTo = process.argv.includes('--send') ? process.argv[process.argv.indexOf('--send') + 1] : null;
  if (sendTo) {
    const out = await sendText({ to: sendTo, body: 'channel-verify ✅', channel: ch });
    check('live send through the channel', out.success, out.error?.message ?? out.wa_message_id ?? '');
  }

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `  — ${detail}` : ''}`);
    if (!ok) failed++;
  }
  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nAll channel checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it without sending**

Run: `npx tsx scripts/wa-channel-verify.ts`
Expected: all ✅, exit 0. A ❌ on "token decrypted" means Task 1's Vault wrapper is broken; a ❌ on "number matches" means the seed row drifted from Graph.

- [ ] **Step 3: Run it with a live send to your own number**

Run: `npx tsx scripts/wa-channel-verify.ts --send 972547667775`
Expected: all ✅ and the message actually arrives on your phone. **This is the proof that the refactor did not break real sending** — do not proceed to Task 5 until it lands.

- [ ] **Step 4: Run the existing regression suites named in spec §9 step 3**

```bash
npm run cs:products-e2e     # npx tsx --tsconfig tsconfig.json scripts/cs-products-e2e.ts
npm run bestie:e2e          # npx tsx scripts/bestie-lead-e2e.ts
```
Expected: identical output to a run from before Task 3. If any behaviour differs, the refactor changed something it shouldn't have — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add scripts/wa-channel-verify.ts
git commit -m "test(wa): live channel verification script (spec §10 — scripts, not vitest)"
```

---

### Task 5: Per-channel CS sessions, Redis keys and queue

**Files:**
- Modify: `src/lib/cs/identity.ts` (whatsapp variant gains `waChannelId`)
- Modify: `src/lib/cs/cs-session.ts` (`loadCsSessionByChannel`, `createCsSession`, `CsSessionRow`)
- Modify: `src/lib/cs/wa-cs-locks.ts`, `src/lib/cs/wa-cs-queue.ts`, `src/lib/cs/wa-cs-publish.ts`
- Modify: `src/lib/cs/wa-cs-worker.ts`, `src/lib/cs/route-inbound-cs.ts`
- Test: `tests/unit/cs-channel-keys.test.ts`

**Interfaces:**
- Consumes: `WaChannel` (Task 2).
- Produces:
  - `CsIdentity` whatsapp variant: `{ channel: 'whatsapp'; waId: string; waChannelId: string; trust: 'channel_verified' }`
  - `whatsappIdentity(waId: string, waChannelId: string): CsIdentity`
  - `identityKey(id): { channel: CsChannel; channelUserId: string; waChannelId: string | null }`
  - `loadCsSessionByChannel(channel, channelUserId, waChannelId: string | null)`
  - `createCsSession(waId, contactId, channel, waChannelId: string | null)`
  - `CsJob` gains `waChannelId: string`
  - `acquireCsLock(waChannelId, waId, ttlSeconds?)` · `releaseCsLock(waChannelId, waId)` · `dequeueCsMessage(waChannelId, waId)` · `csQueueLength(waChannelId, waId)` · `publishCsDrain(waChannelId, waId, opts?)`
  - `routeInboundToCustomerService(input: { waChannelId: string; channel: WaChannel; waId: string; contactId: string | null; msg: any; textBody: string | null; boundAccountId: string | null }): Promise<{ claimed: boolean }>` — Task 6 calls this exact shape
  - Redis: `cs:${waChannelId}:wa:${waId}:{q,lock}` · dedup `cs:${waChannelId}:wa:${wamid}:queued` · QStash `csdrain_${waChannelId}_${waId}_${bucket}`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cs-channel-keys.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { whatsappIdentity, identityKey, identityPhone } from '@/lib/cs/identity';
import { csQueueKey, csLockKey, csDedupKey, csDrainDedupId } from '@/lib/cs/wa-cs-keys';

describe('whatsapp identity carries the business number', () => {
  it('identityKey exposes waChannelId alongside the medium', () => {
    const id = whatsappIdentity('972500000000', 'ch-1');
    expect(identityKey(id)).toEqual({ channel: 'whatsapp', channelUserId: '972500000000', waChannelId: 'ch-1' });
  });

  it('identityPhone is unchanged — still the wa_id', () => {
    expect(identityPhone(whatsappIdentity('972500000000', 'ch-1'))).toBe('972500000000');
  });

  it('non-whatsapp media report a null waChannelId', () => {
    const id = { channel: 'widget', visitorId: 'aw_1', trust: 'unverified' } as const;
    expect(identityKey(id).waChannelId).toBeNull();
  });
});

describe('redis + qstash keys are channel-scoped', () => {
  it('the same shopper on two numbers gets two queues', () => {
    expect(csQueueKey('ch-1', '972500000000')).toBe('cs:ch-1:wa:972500000000:q');
    expect(csQueueKey('ch-2', '972500000000')).toBe('cs:ch-2:wa:972500000000:q');
    expect(csQueueKey('ch-1', '972500000000')).not.toBe(csQueueKey('ch-2', '972500000000'));
  });

  it('locks are per channel too', () => {
    expect(csLockKey('ch-1', '972500000000')).toBe('cs:ch-1:wa:972500000000:lock');
  });

  it('the wamid dedup guard is channel-scoped', () => {
    expect(csDedupKey('ch-1', 'wamid.ABC')).toBe('cs:ch-1:wa:wamid.ABC:queued');
  });

  it('the QStash dedup id contains no colon — QStash rejects them', () => {
    const id = csDrainDedupId('ch-1', '972500000000', 17_000_000);
    expect(id).toBe('csdrain_ch-1_972500000000_17000000');
    expect(id).not.toContain(':');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/cs-channel-keys.test.ts`
Expected: FAIL — `@/lib/cs/wa-cs-keys` does not exist and `whatsappIdentity` takes one argument.

- [ ] **Step 3: Create the key module**

Create `src/lib/cs/wa-cs-keys.ts`:

```typescript
/**
 * One place for every CS Redis / QStash key, so the channel scoping can't drift
 * between the queue, the lock and the drain publisher.
 *
 * Redis keys MAY contain ':'. QStash deduplicationIds MAY NOT — use '_' there.
 */
export const csQueueKey = (waChannelId: string, waId: string) => `cs:${waChannelId}:wa:${waId}:q`;
export const csLockKey  = (waChannelId: string, waId: string) => `cs:${waChannelId}:wa:${waId}:lock`;
export const csDedupKey = (waChannelId: string, wamid: string) => `cs:${waChannelId}:wa:${wamid}:queued`;

export const csDrainDedupId = (waChannelId: string, waId: string, bucket: number) =>
  `csdrain_${waChannelId}_${waId}_${bucket}`;
```

- [ ] **Step 4: Extend the identity module**

In `src/lib/cs/identity.ts`, change the whatsapp variant and the two functions that touch it:

```typescript
export type CsIdentity =
  | { channel: 'whatsapp';  waId: string; waChannelId: string;  trust: 'channel_verified' }
  | { channel: 'instagram'; igsid: string;     phone?: string;  trust: 'unverified' | 'phone_claimed' }
  | { channel: 'widget';    visitorId: string; phone?: string;  trust: 'unverified' | 'phone_claimed' }
  | { channel: 'web_chat';  sessionId: string; phone?: string;  trust: 'unverified' | 'phone_claimed' };

/** The (channel, channel_user_id, wa_channel_id) session key (spec §8 + migration 075). */
export function identityKey(id: CsIdentity): {
  channel: CsChannel; channelUserId: string; waChannelId: string | null;
} {
  switch (id.channel) {
    case 'whatsapp':  return { channel: 'whatsapp',  channelUserId: id.waId,      waChannelId: id.waChannelId };
    case 'instagram': return { channel: 'instagram', channelUserId: id.igsid,     waChannelId: null };
    case 'widget':    return { channel: 'widget',    channelUserId: id.visitorId, waChannelId: null };
    case 'web_chat':  return { channel: 'web_chat',  channelUserId: id.sessionId, waChannelId: null };
  }
}

export function whatsappIdentity(waId: string, waChannelId: string): CsIdentity {
  return { channel: 'whatsapp', waId, waChannelId, trust: 'channel_verified' };
}
```

`identityPhone`, `ticketSourceFor`, `CS_TICKET_SOURCES` and `withClaimedPhone` are unchanged.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/cs-channel-keys.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Thread `waChannelId` through session load/create**

In `src/lib/cs/cs-session.ts`:

```typescript
export interface CsSessionRow {
  wa_id: string;
  channel: CsChannel;
  channel_user_id: string;
  wa_channel_id: string | null;   // ← added
  // ...rest unchanged
}

export async function loadCsSessionByChannel(
  channel: CsChannel,
  channelUserId: string,
  waChannelId: string | null = null,
): Promise<CsSessionRow | null> {
  let q = supabaseAdmin
    .from('whatsapp_cs_sessions')
    .select('*')
    .eq('channel', channel)
    .eq('channel_user_id', channelUserId);
  q = waChannelId ? q.eq('wa_channel_id', waChannelId) : q.is('wa_channel_id', null);
  const { data } = await q.maybeSingle();
  return (data as CsSessionRow) ?? null;
}

export async function createCsSession(
  waId: string,
  contactId: string | null,
  channel: CsChannel = 'whatsapp',
  waChannelId: string | null = null,
): Promise<CsSessionRow> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cs_sessions')
    .insert({
      wa_id: waId,
      channel,
      channel_user_id: waId,
      wa_channel_id: waChannelId,   // ← added
      contact_id: contactId,
      phase: 'onboarding',
      context: {},
      version: 0,
      last_activity_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  return data as CsSessionRow;
}
```

Delete the `loadCsSession(waId)` one-arg convenience wrapper and update its callers to pass the channel explicitly — a WhatsApp session lookup without a channel id is exactly the bug this task exists to prevent.

`saveCsSession` keeps matching on `wa_id + version`; **`wa_id` is still the PK**, so optimistic concurrency is unaffected.

- [ ] **Step 7: Switch the queue, lock and publisher to the new keys**

`src/lib/cs/wa-cs-locks.ts`:
```typescript
import { redisSetNx, redisDel } from '@/lib/redis';
import { csLockKey } from './wa-cs-keys';

export async function acquireCsLock(waChannelId: string, waId: string, ttlSeconds = 300): Promise<boolean> {
  return redisSetNx(csLockKey(waChannelId, waId), '1', ttlSeconds);
}
export async function releaseCsLock(waChannelId: string, waId: string): Promise<void> {
  await redisDel(csLockKey(waChannelId, waId));
}
```

`src/lib/cs/wa-cs-queue.ts` — `CsJob` gains `waChannelId: string`, and the three key builders come from `wa-cs-keys`:
```typescript
import { csQueueKey, csDedupKey } from './wa-cs-keys';

export interface CsJob {
  waChannelId: string;      // ← added
  waId: string;
  msg: any;
  textBody: string | null;
  contactId?: string | null;
  attempt?: number;
  image?: CsImage;
}

export async function enqueueCsMessage(job: CsJob): Promise<{ enqueued: boolean; queueLen: number }> {
  const key = csQueueKey(job.waChannelId, job.waId);
  const wamid = String(job.msg?.id || '');
  if (wamid) {
    const fresh = await redisSetNx(csDedupKey(job.waChannelId, wamid), '1', 86_400);
    if (!fresh) return { enqueued: false, queueLen: await redisLLen(key) };
  }
  const queueLen = await redisRPush(key, [JSON.stringify(job)]);
  return { enqueued: true, queueLen };
}

export async function dequeueCsMessage(waChannelId: string, waId: string): Promise<CsJob | null> {
  const [raw] = await redisLPopCount(csQueueKey(waChannelId, waId), 1);
  if (!raw) return null;
  try { return JSON.parse(raw) as CsJob; } catch { return null; }
}

export async function csQueueLength(waChannelId: string, waId: string): Promise<number> {
  return redisLLen(csQueueKey(waChannelId, waId));
}
```

`src/lib/cs/wa-cs-publish.ts` — carry the channel in the body and the dedup id:
```typescript
import { csDrainDedupId } from './wa-cs-keys';

export async function publishCsDrain(
  waChannelId: string,
  waId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const bucket = Math.floor(Date.now() / 10_000);
  const deduplicationId = opts.force
    ? `csdrain_${waChannelId}_${waId}_f_${Date.now()}`
    : csDrainDedupId(waChannelId, waId, bucket);
  const payload = {
    url: `${BASE_URL}/api/cs/wa-worker`,
    body: { drain: true, waChannelId, waId },   // ← waChannelId added
    retries: 3,
    deduplicationId,
  };
  // ...retry loop unchanged
}
```

Update `src/lib/cs/wa-cs-worker.ts` to read `waChannelId` from the job body, resolve it via `resolveChannelByPhoneNumberId`/a direct id lookup, pass the real `WaChannel` to every send (replacing Task 3's temporary `getBestieChannel()`), and pass `waChannelId` to `acquireCsLock` / `dequeueCsMessage` / `releaseCsLock` / `publishCsDrain`. Update `route-inbound-cs.ts` the same way — it takes `waChannelId` and a `channel: WaChannel` and stops calling `getBestieChannel()`.

- [ ] **Step 8: Backfill existing sessions to Bestie's channel**

```sql
update public.whatsapp_cs_sessions s
set wa_channel_id = (select id from public.whatsapp_channels where status = 'active' limit 1)
where s.channel = 'whatsapp' and s.wa_channel_id is null;
```

Verify none were missed and non-WhatsApp rows were untouched:
```sql
select channel, count(*) filter (where wa_channel_id is null) as unscoped, count(*) as total
from public.whatsapp_cs_sessions group by channel;
```
Expected: `whatsapp` has `unscoped = 0`; every other medium has `unscoped = total`.

- [ ] **Step 9: Type-check and run the suite**

Run: `npm run type-check && npx vitest run`
Expected: zero type errors, all tests pass.

Note: in-flight Redis queue entries written under the old `cs:wa:*` keys are orphaned by this deploy. Spec §6 accepts this — the sweep cron picks up stragglers. Deploy at a quiet hour.

- [ ] **Step 10: Commit**

```bash
git add src/lib/cs tests/unit/cs-channel-keys.test.ts
git commit -m "feat(cs): sessions, locks, queues and drains are scoped to the business number

whatsapp_cs_sessions.channel stays the MEDIUM; the new wa_channel_id says WHICH
NUMBER. A shopper messaging two customer numbers now gets two sessions instead
of colliding into one."
```

---

### Task 6: Inbound routing inversion

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts` (`processWebhook`, from line 150)
- Test: `tests/unit/wa-webhook-routing.test.ts`

**Interfaces:**
- Consumes: `resolveChannelByPhoneNumberId` (Task 2), `whatsappIdentity` (Task 5), `routeInboundToCustomerService` (Task 5).
- Produces: `routeInbound(value, channel: WaChannel): Promise<void>` — the existing 5-branch routing, now taking a resolved channel.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/wa-webhook-routing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveByPnid = vi.fn();
vi.mock('@/lib/whatsapp-cloud/channels', () => ({
  resolveChannelByPhoneNumberId: (...a: any[]) => resolveByPnid(...a),
}));

import { classifyInbound } from '@/app/api/webhooks/whatsapp/routing';

const BESTIE   = { id: 'ch-bestie',   accountId: 'acc-bestie',   phoneNumberId: 'PNID_B', status: 'active' };
const CUSTOMER = { id: 'ch-customer', accountId: 'acc-customer', phoneNumberId: 'PNID_C', status: 'active' };

beforeEach(() => resolveByPnid.mockReset());

describe('inbound is classified by NUMBER, not by sender', () => {
  it('Bestie’s number takes the existing multi-tenant path', async () => {
    resolveByPnid.mockResolvedValue(BESTIE);
    const r = await classifyInbound('PNID_B', 'acc-bestie');
    expect(r.kind).toBe('bestie');
    expect(r.channel?.id).toBe('ch-bestie');
  });

  it('a customer number takes the single-tenant path with the account pre-bound', async () => {
    resolveByPnid.mockResolvedValue(CUSTOMER);
    const r = await classifyInbound('PNID_C', 'acc-bestie');
    expect(r.kind).toBe('customer');
    expect(r.boundAccountId).toBe('acc-customer');
  });

  it('an unknown number is dropped, not thrown — Meta retries forever on non-200', async () => {
    resolveByPnid.mockResolvedValue(null);
    const r = await classifyInbound('PNID_UNKNOWN', 'acc-bestie');
    expect(r.kind).toBe('unknown');
    expect(r.channel).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/wa-webhook-routing.test.ts`
Expected: FAIL — `@/app/api/webhooks/whatsapp/routing` does not exist.

- [ ] **Step 3: Extract the classifier**

Create `src/app/api/webhooks/whatsapp/routing.ts`:

```typescript
import { resolveChannelByPhoneNumberId, type WaChannel } from '@/lib/whatsapp-cloud/channels';

export type InboundClass =
  | { kind: 'bestie';   channel: WaChannel; boundAccountId: null }
  | { kind: 'customer'; channel: WaChannel; boundAccountId: string }
  | { kind: 'unknown';  channel: null;      boundAccountId: null };

/**
 * Spec §6 — the first decision moves from SENDER to NUMBER.
 *
 * Bestie's own number keeps the existing 5-branch routing (Itamar / agents / open
 * tickets / leads / CS). Any other known number is a single-tenant customer channel
 * whose account is bound structurally: no tool on that path exposes an account
 * selector, so cross-tenant leakage is impossible by construction rather than by check.
 */
export async function classifyInbound(
  phoneNumberId: string,
  bestieAccountId: string | undefined,
): Promise<InboundClass> {
  const channel = await resolveChannelByPhoneNumberId(phoneNumberId);
  if (!channel) return { kind: 'unknown', channel: null, boundAccountId: null };
  if (channel.accountId === bestieAccountId) return { kind: 'bestie', channel, boundAccountId: null };
  return { kind: 'customer', channel, boundAccountId: channel.accountId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/wa-webhook-routing.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire the classifier into `processWebhook`**

In `src/app/api/webhooks/whatsapp/route.ts`, inside the `for (const change ...)` loop, immediately after `if (!phoneNumberId) continue;` (line 151):

```typescript
const inbound = await classifyInbound(phoneNumberId, process.env.BESTIE_ACCOUNT_ID);
if (inbound.kind === 'unknown') {
  console.warn('[whatsapp webhook] inbound for unknown phone_number_id — dropping', { phoneNumberId });
  continue;   // the outer POST still returns 200; Meta retries forever otherwise
}
const channel = inbound.channel;
```

Then pass `channel` down through the message loop to every send and to `routeInboundToCustomerService`, and build the identity with the channel id:

```typescript
const identity = whatsappIdentity(waId, channel.id);
```

For `inbound.kind === 'customer'`, skip the Itamar / agent / open-ticket / lead branches entirely and go straight to the CS path with the account pre-bound:

```typescript
if (inbound.kind === 'customer') {
  await routeInboundToCustomerService({
    waChannelId: channel.id,
    channel,
    waId,
    contactId,
    msg,
    textBody,
    boundAccountId: inbound.boundAccountId,   // no resolve_brand on this path
  });
  continue;
}
```

- [ ] **Step 6: Type-check and run the suite**

Run: `npm run type-check && npx vitest run`
Expected: zero errors, all pass.

- [ ] **Step 7: Re-run the live gate**

Run: `npx tsx scripts/wa-channel-verify.ts --send 972547667775`
Expected: all ✅ and the message arrives.

Then send a real WhatsApp message to Bestie's number from your phone and confirm the bot answers exactly as before. **This is the acceptance test for the whole plan** — the routing now goes through the channel table, and nothing about Bestie's behaviour changed.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/webhooks/whatsapp tests/unit/wa-webhook-routing.test.ts
git commit -m "feat(wa): route inbound by phone_number_id, not by sender

Bestie's number keeps the existing 5-branch routing. A known customer number
goes single-tenant with its account bound structurally. An unknown number is
logged and dropped — the endpoint still returns 200 so Meta stops retrying."
```

---

## What this plan deliberately does NOT do

These are **Plan B**, written once this lands:

- `POST /api/onboard/[token]/whatsapp` — code exchange, ownership check, provisioning chain (spec §4, §5)
- The 3 CS templates and the billing probe (spec §5, D8, D9)
- Embedded Signup v4 wizard step (spec §4) — still carries open "verify during build" items on the popup payload shape
- Coexistence webhooks, `smb_message_echoes` → bot pause, 6h auto-resume (spec §7)
- Admin channel block and disconnect (spec §8)
- **The tool-level tenant scoping in spec §6** — `list_open_threads` / `getEngagedAccountIds` gaining a required `accountId` on the customer path. Task 6 binds the account *structurally* (the customer branch never calls `resolve_brand` and exposes no account selector), but the tools themselves are not yet hardened. This must land in Plan B **before** the first customer channel goes live, not after.
- **Spec §10's dedicated leak test** — shopper with an open thread on Bestie's channel messages a customer channel, assert zero crossover. It cannot be written until a second channel can exist.

At the end of Plan A there is still no way to create a customer channel except by hand — and that is the point. Every send is channel-scoped, every inbound is channel-routed, and Bestie's live traffic is provably unchanged before a single customer touches it.
