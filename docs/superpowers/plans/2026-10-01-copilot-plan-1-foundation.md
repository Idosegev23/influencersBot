# Co-Pilot Plan 1: Partner Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give influencerbot a partner layer (Multiview), tenant resolution by host, visitor profiles with identity merge, structured interaction events, and the first four partner API endpoints, so the white-label app (Plan 3) has a backend to talk to.

**Architecture:** New tables in Supabase (migration 150) and a new module `src/lib/copilot/` holding pure, unit-tested logic (keys, signatures, identity precedence) plus thin data helpers. Routes live under `src/app/api/partner/v1/`. Every route authenticates with a partner API key plus an `X-Tenant-Host` header resolved through `tenant_domains`. The AMS is an interface with a stub adapter; the real adapter comes in Plan 5 once ABA's AMS is known.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Supabase (service-role client `supabase` from `@/lib/supabase`), Supabase Vault for secrets, Vitest (`npx vitest run`), Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-09-29-multiview-association-copilot-design.md` (sections 3 and 4).

**Plan series:** 1 Foundation (this) · 2 Association chat turn · 3 White-label app (separate repo) · 4 Console + reporting API · 5 ABA go-live + AMS adapter. Security prerequisites (spec §7 step 0) run as their own track.

## Global Constraints

- Migration number is **150** (`supabase/migrations/150_copilot_partner_foundation.sql`). Numbers 095 to 140 are taken on main or on open branches.
- All new tables: RLS enabled, `revoke all ... from anon, authenticated`. Only the service role touches them.
- No partner-facing response may contain the strings `bestie`, `influencerbot`, `ldrs` or `imai` (case-insensitive). Error codes are neutral snake_case.
- Partner API keys have the prefix `cpk_`; only the SHA-256 hex hash is stored.
- Identity strength: `ams_login` > `newsletter` > `ams_email` > `email_domain` > `external`. A weaker source never overwrites a stronger one.
- `identify` signatures: HMAC-SHA256 hex over `memberId|email|ts` (email empty string when absent), rejected when `|now - ts| > 10 minutes`.
- Interaction events never break a request: write failures are logged with `console.error('[copilot/events]', ...)` and swallowed.
- Run tests with `npx vitest run <path>` (not `npm test`, which starts watch mode).
- Commit to `main` and push after each task (Ido's standing instruction). Stage only the task's files.

## Review Focus

1. **A key for partner A with a host belonging to partner B** must get 403, never data. Pinned in Task 3.
2. **The same member identifying from two devices** (two anonymous visitors, same `memberId`) must end with one profile owning both histories, and a second identify of an already merged visitor must not create a loop. Pinned in Tasks 5 and 8.
3. **A replayed or stale identify payload** (old `ts`, or a signature for a different email) must be refused and leave the visitor anonymous. Pinned in Tasks 4 and 8.
4. **A consumer email** (`john@gmail.com`, also US ISPs such as `comcast.net`) must never become a company called "Gmail". Pinned in Task 5.
5. **A malformed or oversized client event batch** must be rejected or trimmed without writing junk rows, and an event type the browser is not allowed to send (`identified`, `escalated`) must be refused. Pinned in Task 9.

---

### Task 1: Migration 150, partner foundation schema

**Files:**
- Create: `supabase/migrations/150_copilot_partner_foundation.sql`

**Interfaces:**
- Produces tables `partners`, `partner_api_keys`, `tenant_domains`, `console_users`, `console_login_codes`, `visitors`, `interaction_events`; columns `accounts.partner_id`, `chat_sessions.visitor_id`, `chat_sessions.identified_at`; functions `copilot_store_secret(text) returns uuid`, `copilot_read_secret(uuid) returns text`, `copilot_merge_visitor(p_from uuid, p_into uuid) returns void`.

- [ ] **Step 1: Write the migration**

```sql
-- ==================================================
-- Migration 150: Co-Pilot partner foundation
-- ==================================================
-- Multiview resells the assistant to associations under its own brand.
-- A partner owns associations (ordinary `accounts` rows), hosts map to a
-- partner or an association, visitors carry a profile that merges when they
-- identify, and every interaction is an append-only structured event so
-- Multiview's Intent Exchange can aggregate across associations later.
-- Service role only: RLS on, no anon/authenticated grants.
-- ==================================================

create table public.partners (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null,
  branding    jsonb not null default '{}'::jsonb,
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.partner_api_keys (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners(id) on delete cascade,
  key_hash      text not null unique,
  label         text not null default '',
  status        text not null default 'active' check (status in ('active','revoked')),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create table public.tenant_domains (
  host         text primary key check (host = lower(host)),
  partner_id   uuid not null references public.partners(id) on delete cascade,
  account_id   uuid references public.accounts(id) on delete cascade,
  kind         text not null default 'subdomain' check (kind in ('subdomain','custom')),
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index tenant_domains_account_idx on public.tenant_domains(account_id);

create table public.console_users (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners(id) on delete cascade,
  account_id     uuid references public.accounts(id) on delete cascade,
  email          text not null check (email = lower(email)),
  name           text not null default '',
  role           text not null default 'viewer' check (role in ('owner','admin','viewer')),
  status         text not null default 'active' check (status in ('active','disabled')),
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  unique (partner_id, email)
);

create table public.console_login_codes (
  id               uuid primary key default gen_random_uuid(),
  console_user_id  uuid not null references public.console_users(id) on delete cascade,
  code_hash        text not null,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  attempts         int not null default 0,
  created_at       timestamptz not null default now()
);
create index console_login_codes_user_idx on public.console_login_codes(console_user_id, created_at desc);

create table public.visitors (
  id                    uuid primary key default gen_random_uuid(),
  partner_id            uuid not null references public.partners(id) on delete cascade,
  account_id            uuid not null references public.accounts(id) on delete cascade,
  anon_id               text not null,
  member_ref            text,
  email                 text,
  name                  text,
  company               text,
  company_domain        text,
  identity_source       text check (identity_source in ('ams_login','newsletter','ams_email','email_domain','external')),
  identity_resolved_at  timestamptz,
  membership            jsonb,
  first_seen            timestamptz not null default now(),
  last_seen             timestamptz not null default now(),
  merged_into           uuid references public.visitors(id),
  unique (account_id, anon_id)
);
create unique index visitors_member_uidx on public.visitors(account_id, member_ref)
  where member_ref is not null and merged_into is null;
create index visitors_partner_idx on public.visitors(partner_id, last_seen desc);

create table public.interaction_events (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partners(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  visitor_id   uuid not null references public.visitors(id) on delete cascade,
  session_id   uuid references public.chat_sessions(id) on delete set null,
  message_id   uuid,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  industry     text,
  occurred_at  timestamptz not null default now()
);
create index interaction_events_account_idx on public.interaction_events(account_id, occurred_at desc);
create index interaction_events_visitor_idx on public.interaction_events(visitor_id, occurred_at desc);
create index interaction_events_partner_type_idx on public.interaction_events(partner_id, type, occurred_at desc);

alter table public.accounts add column partner_id uuid references public.partners(id);
alter table public.chat_sessions add column visitor_id uuid references public.visitors(id);
alter table public.chat_sessions add column identified_at timestamptz;
create index chat_sessions_visitor_idx on public.chat_sessions(visitor_id) where visitor_id is not null;

-- RLS: service role only
do $$
declare t text;
begin
  foreach t in array array['partners','partner_api_keys','tenant_domains','console_users',
                           'console_login_codes','visitors','interaction_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Vault wrappers (same pattern as 075 wa_channel_*)
create or replace function public.copilot_store_secret(p_secret text)
returns uuid language plpgsql security definer
set search_path = public, vault, extensions as $$
declare v_id uuid;
begin
  select vault.create_secret(p_secret, 'copilot_' || gen_random_uuid()::text,
                             'Co-Pilot association secret') into v_id;
  return v_id;
end; $$;

create or replace function public.copilot_read_secret(p_secret_id uuid)
returns text language plpgsql security definer
set search_path = public, vault, extensions as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = p_secret_id;
  return v_secret;
end; $$;

-- Atomic merge: move everything owned by p_from to p_into, then mark p_from merged.
create or replace function public.copilot_merge_visitor(p_from uuid, p_into uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_from = p_into then return; end if;
  update public.chat_sessions      set visitor_id = p_into where visitor_id = p_from;
  update public.interaction_events set visitor_id = p_into where visitor_id = p_from;
  update public.visitors set merged_into = p_into where merged_into = p_from;            -- re-point earlier merges
  update public.visitors
     set merged_into = p_into,
         member_ref  = null,
         last_seen   = now()
   where id = p_from;
  update public.visitors v
     set first_seen = least(v.first_seen, f.first_seen),
         last_seen  = now()
    from public.visitors f
   where v.id = p_into and f.id = p_from;
end; $$;

revoke all on function public.copilot_store_secret(text)          from public, anon, authenticated;
revoke all on function public.copilot_read_secret(uuid)           from public, anon, authenticated;
revoke all on function public.copilot_merge_visitor(uuid, uuid)   from public, anon, authenticated;
grant execute on function public.copilot_store_secret(text)        to service_role;
grant execute on function public.copilot_read_secret(uuid)         to service_role;
grant execute on function public.copilot_merge_visitor(uuid, uuid) to service_role;
```

- [ ] **Step 2: Apply to production**

Apply with the Supabase MCP `apply_migration` (name `150_copilot_partner_foundation`, query = file contents). The new tables are empty and nothing reads them yet, so this is safe on production.

- [ ] **Step 3: Verify**

Run via `execute_sql`:

```sql
select table_name, (select relrowsecurity from pg_class where relname = table_name) as rls
from information_schema.tables
where table_schema='public' and table_name in
 ('partners','partner_api_keys','tenant_domains','console_users','console_login_codes','visitors','interaction_events');
select has_table_privilege('anon','public.visitors','select') as anon_select,
       has_table_privilege('authenticated','public.visitors','select') as auth_select,
       has_function_privilege('anon','public.copilot_read_secret(uuid)','execute') as anon_exec;
```

Expected: seven rows all `rls = true`; `anon_select`, `auth_select`, `anon_exec` all `false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/150_copilot_partner_foundation.sql
git commit -m "feat(copilot): partner foundation schema (migration 150)"
git push origin HEAD:main
```

---

### Task 2: Partner keys and host normalisation

**Files:**
- Create: `src/lib/copilot/keys.ts`
- Test: `tests/unit/copilot/keys.test.ts`

**Interfaces:**
- Produces: `KEY_PREFIX = 'cpk_'`; `generatePartnerKey(): { plaintext: string; hash: string }`; `hashPartnerKey(key: string): string`; `bearerToken(header: string | null): string | null`; `normalizeHost(raw: string | null): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { generatePartnerKey, hashPartnerKey, bearerToken, normalizeHost, KEY_PREFIX } from '@/lib/copilot/keys';

describe('partner keys', () => {
  it('generates a prefixed key whose hash matches hashPartnerKey', () => {
    const { plaintext, hash } = generatePartnerKey();
    expect(plaintext.startsWith(KEY_PREFIX)).toBe(true);
    expect(plaintext.length).toBeGreaterThan(40);
    expect(hash).toBe(hashPartnerKey(plaintext));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('never generates the same key twice', () => {
    expect(generatePartnerKey().plaintext).not.toBe(generatePartnerKey().plaintext);
  });
});

describe('bearerToken', () => {
  it('extracts a cpk_ bearer token', () => {
    expect(bearerToken('Bearer cpk_abc123')).toBe('cpk_abc123');
    expect(bearerToken('bearer   cpk_abc123 ')).toBe('cpk_abc123');
  });
  it('rejects missing, foreign or malformed tokens', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('Bearer sk_live_123')).toBeNull();
    expect(bearerToken('cpk_abc123')).toBeNull();
    expect(bearerToken('Bearer cpk_a b')).toBeNull();
  });
});

describe('normalizeHost', () => {
  it('lowercases and strips port and trailing dot', () => {
    expect(normalizeHost('ABA.Copilot.Example.com:443')).toBe('aba.copilot.example.com');
    expect(normalizeHost('copilot.buses.org.')).toBe('copilot.buses.org');
    expect(normalizeHost('localhost:3001')).toBe('localhost');
  });
  it('rejects junk', () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('evil.com/path')).toBeNull();
    expect(normalizeHost('nodot')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/keys.test.ts`
Expected: FAIL, cannot resolve `@/lib/copilot/keys`.

- [ ] **Step 3: Implement**

```ts
/**
 * Partner API keys and tenant host handling for the Co-Pilot partner API.
 * Keys are shown once at creation; only the SHA-256 hash is stored.
 */
import crypto from 'node:crypto';

export const KEY_PREFIX = 'cpk_';

export function hashPartnerKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generatePartnerKey(): { plaintext: string; hash: string } {
  const plaintext = KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { plaintext, hash: hashPartnerKey(plaintext) };
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  return m[1].startsWith(KEY_PREFIX) ? m[1] : null;
}

export function normalizeHost(raw: string | null): string | null {
  if (!raw) return null;
  const h = raw.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(h)) return null;
  if (h === 'localhost') return h;
  return h.includes('.') ? h : null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/copilot/keys.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/keys.ts tests/unit/copilot/keys.test.ts
git commit -m "feat(copilot): partner API keys and host normalisation"
git push origin HEAD:main
```

---

### Task 3: Tenant resolution and the route guard

**Files:**
- Create: `src/lib/copilot/tenant.ts`
- Create: `src/lib/copilot/auth.ts`
- Test: `tests/unit/copilot/tenant.test.ts`

**Interfaces:**
- Consumes: `hashPartnerKey`, `bearerToken`, `normalizeHost` (Task 2).
- Produces:
  - `interface Tenant { partnerId: string; accountId: string | null; host: string }`
  - `resolveTenant(keyHash: string, host: string): Promise<{ ok: true; tenant: Tenant } | { ok: false; status: 401 | 403 | 404; error: string }>`
  - `requireTenant(req: Request, opts: { association: boolean }): Promise<Tenant | Response>` (returns a `Response` on refusal; callers do `if (t instanceof Response) return t;`)
  - `interface AssociationTenant extends Tenant { accountId: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Record<string, any> = {};
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: rows[table]?.[v] ?? null }) }),
      }),
      update: () => ({ eq: () => ({ then: (fn: any) => fn() }) }),
    }),
  },
}));

import { resolveTenant } from '@/lib/copilot/tenant';
import { requireTenant } from '@/lib/copilot/auth';
import { hashPartnerKey } from '@/lib/copilot/keys';

const KEY_A = 'cpk_partnerA';
beforeEach(() => {
  rows.partner_api_keys = {
    [hashPartnerKey(KEY_A)]: { id: 'k1', partner_id: 'pA', status: 'active' },
    [hashPartnerKey('cpk_revoked')]: { id: 'k2', partner_id: 'pA', status: 'revoked' },
  };
  rows.tenant_domains = {
    'aba.copilot.test': { host: 'aba.copilot.test', partner_id: 'pA', account_id: 'acc-aba' },
    'copilot.test': { host: 'copilot.test', partner_id: 'pA', account_id: null },
    'other.partner.test': { host: 'other.partner.test', partner_id: 'pB', account_id: 'acc-x' },
  };
});

function req(headers: Record<string, string>) {
  return new Request('http://x/api/partner/v1/session', { headers });
}

describe('resolveTenant', () => {
  it('resolves an association host owned by the key partner', async () => {
    const r = await resolveTenant(hashPartnerKey(KEY_A), 'aba.copilot.test');
    expect(r).toEqual({ ok: true, tenant: { partnerId: 'pA', accountId: 'acc-aba', host: 'aba.copilot.test' } });
  });
  it('refuses a host owned by another partner with 403', async () => {
    const r = await resolveTenant(hashPartnerKey(KEY_A), 'other.partner.test');
    expect(r).toEqual({ ok: false, status: 403, error: 'host_not_owned' });
  });
  it('refuses unknown keys, revoked keys and unknown hosts', async () => {
    expect(await resolveTenant(hashPartnerKey('cpk_nope'), 'aba.copilot.test')).toMatchObject({ ok: false, status: 401 });
    expect(await resolveTenant(hashPartnerKey('cpk_revoked'), 'aba.copilot.test')).toMatchObject({ ok: false, status: 401 });
    expect(await resolveTenant(hashPartnerKey(KEY_A), 'missing.test')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('requireTenant', () => {
  it('returns the tenant for a valid association request', async () => {
    const t = await requireTenant(req({ authorization: `Bearer ${KEY_A}`, 'x-tenant-host': 'ABA.copilot.test' }), { association: true });
    expect(t).toEqual({ partnerId: 'pA', accountId: 'acc-aba', host: 'aba.copilot.test' });
  });
  it('requires an association host when asked', async () => {
    const t = await requireTenant(req({ authorization: `Bearer ${KEY_A}`, 'x-tenant-host': 'copilot.test' }), { association: true });
    expect(t).toBeInstanceOf(Response);
    expect((t as Response).status).toBe(400);
  });
  it('returns 401 without a key and 400 without a host', async () => {
    expect(((await requireTenant(req({ 'x-tenant-host': 'aba.copilot.test' }), { association: true })) as Response).status).toBe(401);
    expect(((await requireTenant(req({ authorization: `Bearer ${KEY_A}` }), { association: true })) as Response).status).toBe(400);
  });
  it('refusal bodies carry no vendor names', async () => {
    const t = (await requireTenant(req({ authorization: `Bearer ${KEY_A}`, 'x-tenant-host': 'other.partner.test' }), { association: true })) as Response;
    const body = await t.text();
    expect(body).toContain('host_not_owned');
    expect(body).not.toMatch(/bestie|influencerbot|ldrs|imai/i);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/tenant.test.ts`
Expected: FAIL, cannot resolve `@/lib/copilot/tenant`.

- [ ] **Step 3: Implement `tenant.ts`**

```ts
/**
 * Tenant isolation for the partner API: the one place that decides which
 * partner and association a request may act for.
 */
import { supabase } from '@/lib/supabase';

export interface Tenant { partnerId: string; accountId: string | null; host: string }
export interface AssociationTenant extends Tenant { accountId: string }

export type TenantResult =
  | { ok: true; tenant: Tenant }
  | { ok: false; status: 401 | 403 | 404; error: string };

export async function resolveTenant(keyHash: string, host: string): Promise<TenantResult> {
  const { data: key } = await supabase
    .from('partner_api_keys').select('id, partner_id, status').eq('key_hash', keyHash).maybeSingle();
  if (!key || key.status !== 'active') return { ok: false, status: 401, error: 'invalid_key' };

  const { data: dom } = await supabase
    .from('tenant_domains').select('host, partner_id, account_id').eq('host', host).maybeSingle();
  if (!dom) return { ok: false, status: 404, error: 'unknown_host' };
  if (dom.partner_id !== key.partner_id) return { ok: false, status: 403, error: 'host_not_owned' };

  supabase.from('partner_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)
    .then(() => {}, (e: unknown) => console.error('[copilot/tenant] last_used_at', e));

  return { ok: true, tenant: { partnerId: key.partner_id, accountId: dom.account_id, host } };
}
```

- [ ] **Step 4: Implement `auth.ts`**

```ts
import { bearerToken, hashPartnerKey, normalizeHost } from './keys';
import { resolveTenant, type Tenant } from './tenant';

function refuse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function requireTenant(req: Request, opts: { association: boolean }): Promise<Tenant | Response> {
  const token = bearerToken(req.headers.get('authorization'));
  if (!token) return refuse(401, 'missing_key');
  const host = normalizeHost(req.headers.get('x-tenant-host'));
  if (!host) return refuse(400, 'missing_host');
  const r = await resolveTenant(hashPartnerKey(token), host);
  if (!r.ok) return refuse(r.status, r.error);
  if (opts.association && !r.tenant.accountId) return refuse(400, 'association_host_required');
  return r.tenant;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/copilot/tenant.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/copilot/tenant.ts src/lib/copilot/auth.ts tests/unit/copilot/tenant.test.ts
git commit -m "feat(copilot): tenant resolution and partner route guard"
git push origin HEAD:main
```

---

### Task 4: Identify signatures, newsletter tokens and association secrets

**Files:**
- Create: `src/lib/copilot/signature.ts`
- Create: `src/lib/copilot/secrets.ts`
- Test: `tests/unit/copilot/signature.test.ts`

**Interfaces:**
- Produces:
  - `IDENTIFY_MAX_AGE_MS = 600_000`
  - `interface IdentifyClaims { memberId: string; email: string | null; ts: number }`
  - `signIdentify(secret: string, c: IdentifyClaims): string`
  - `verifyIdentify(secret: string, c: IdentifyClaims, signature: string, now?: number): 'ok' | 'bad_signature' | 'expired' | 'malformed'`
  - `interface NewsletterClaims { memberId: string; email: string | null; expiresAt: number }`
  - `signNewsletterToken(secret: string, c: NewsletterClaims): string`
  - `verifyNewsletterToken(secret: string, token: string, now?: number): NewsletterClaims | null`
  - `getIdentifySecret(accountId: string): Promise<string | null>` (reads `accounts.config.copilot.identify_secret_ref`, then `copilot_read_secret`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  signIdentify, verifyIdentify, signNewsletterToken, verifyNewsletterToken, IDENTIFY_MAX_AGE_MS,
} from '@/lib/copilot/signature';

const S = 'assoc-secret';
const NOW = 1_800_000_000_000;

describe('identify signature', () => {
  const c = { memberId: 'M-1001', email: 'jane@greyhound.com', ts: NOW };
  it('accepts a fresh, correct signature', () => {
    expect(verifyIdentify(S, c, signIdentify(S, c), NOW)).toBe('ok');
  });
  it('accepts a null email signed as empty', () => {
    const n = { ...c, email: null };
    expect(verifyIdentify(S, n, signIdentify(S, n), NOW)).toBe('ok');
  });
  it('rejects a signature for different claims or another secret', () => {
    const sig = signIdentify(S, c);
    expect(verifyIdentify(S, { ...c, email: 'other@x.com' }, sig, NOW)).toBe('bad_signature');
    expect(verifyIdentify(S, { ...c, memberId: 'M-1002' }, sig, NOW)).toBe('bad_signature');
    expect(verifyIdentify('other', c, sig, NOW)).toBe('bad_signature');
  });
  it('rejects stale and far-future timestamps', () => {
    const old = { ...c, ts: NOW - IDENTIFY_MAX_AGE_MS - 1 };
    const fut = { ...c, ts: NOW + IDENTIFY_MAX_AGE_MS + 1 };
    expect(verifyIdentify(S, old, signIdentify(S, old), NOW)).toBe('expired');
    expect(verifyIdentify(S, fut, signIdentify(S, fut), NOW)).toBe('expired');
  });
  it('rejects malformed input', () => {
    expect(verifyIdentify(S, { ...c, memberId: '' }, 'ab', NOW)).toBe('malformed');
    expect(verifyIdentify(S, c, 'not-hex', NOW)).toBe('malformed');
    expect(verifyIdentify(S, { ...c, memberId: 'a|b' }, signIdentify(S, c), NOW)).toBe('malformed');
  });
});

describe('newsletter token', () => {
  const c = { memberId: 'M-7', email: null, expiresAt: NOW + 1000 };
  it('round-trips', () => {
    expect(verifyNewsletterToken(S, signNewsletterToken(S, c), NOW)).toEqual(c);
  });
  it('rejects expired, tampered and foreign tokens', () => {
    const t = signNewsletterToken(S, c);
    expect(verifyNewsletterToken(S, t, NOW + 2000)).toBeNull();
    expect(verifyNewsletterToken('other', t, NOW)).toBeNull();
    const [p, s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ m: 'M-8', e: null, x: NOW + 1000 })).toString('base64url');
    expect(verifyNewsletterToken(S, `${forged}.${s}`, NOW)).toBeNull();
    expect(verifyNewsletterToken(S, p, NOW)).toBeNull();
    expect(verifyNewsletterToken(S, '', NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/signature.test.ts`
Expected: FAIL, cannot resolve `@/lib/copilot/signature`.

- [ ] **Step 3: Implement `signature.ts`**

```ts
/**
 * Signed identity from the association's own site.
 *
 * identify: the association's server signs memberId|email|ts with the
 * association secret; the browser passes it through. We never trust a member
 * id the browser made up.
 *
 * newsletter: a long-lived token in links from member emails, so a member who
 * clicks through arrives identified without logging in.
 */
import crypto from 'node:crypto';

export const IDENTIFY_MAX_AGE_MS = 10 * 60 * 1000;

export interface IdentifyClaims { memberId: string; email: string | null; ts: number }
export interface NewsletterClaims { memberId: string; email: string | null; expiresAt: number }

function hmac(secret: string, msg: string): Buffer {
  return crypto.createHmac('sha256', secret).update(msg).digest();
}

function claimsValid(memberId: string, email: string | null): boolean {
  if (!memberId || memberId.length > 128 || memberId.includes('|')) return false;
  if (email !== null && (email.length > 254 || email.includes('|'))) return false;
  return true;
}

function identifyMessage(c: IdentifyClaims): string {
  return `${c.memberId}|${c.email ?? ''}|${c.ts}`;
}

export function signIdentify(secret: string, c: IdentifyClaims): string {
  return hmac(secret, identifyMessage(c)).toString('hex');
}

export function verifyIdentify(
  secret: string, c: IdentifyClaims, signature: string, now: number = Date.now(),
): 'ok' | 'bad_signature' | 'expired' | 'malformed' {
  if (!claimsValid(c.memberId, c.email) || !Number.isFinite(c.ts)) return 'malformed';
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return 'malformed';
  if (Math.abs(now - c.ts) > IDENTIFY_MAX_AGE_MS) return 'expired';
  const expected = hmac(secret, identifyMessage(c));
  const given = Buffer.from(signature, 'hex');
  return crypto.timingSafeEqual(expected, given) ? 'ok' : 'bad_signature';
}

export function signNewsletterToken(secret: string, c: NewsletterClaims): string {
  const payload = Buffer.from(JSON.stringify({ m: c.memberId, e: c.email, x: c.expiresAt })).toString('base64url');
  return `${payload}.${hmac(secret, payload).toString('base64url')}`;
}

export function verifyNewsletterToken(secret: string, token: string, now: number = Date.now()): NewsletterClaims | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = hmac(secret, payload);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(expected, given)) return null;
  let parsed: { m?: unknown; e?: unknown; x?: unknown };
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  const memberId = typeof parsed.m === 'string' ? parsed.m : '';
  const email = typeof parsed.e === 'string' ? parsed.e : null;
  const expiresAt = typeof parsed.x === 'number' ? parsed.x : 0;
  if (!claimsValid(memberId, email) || expiresAt <= now) return null;
  return { memberId, email, expiresAt };
}
```

- [ ] **Step 4: Implement `secrets.ts`**

```ts
import { supabase } from '@/lib/supabase';

/** The association's identify/newsletter secret, from Vault. Null when not configured. */
export async function getIdentifySecret(accountId: string): Promise<string | null> {
  const { data: acc } = await supabase.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const ref = (acc?.config as any)?.copilot?.identify_secret_ref;
  if (typeof ref !== 'string' || !ref) return null;
  const { data, error } = await supabase.rpc('copilot_read_secret', { p_secret_id: ref });
  if (error) {
    console.error('[copilot/secrets] read failed', accountId, error.message);
    return null;
  }
  return typeof data === 'string' && data ? data : null;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/copilot/signature.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/copilot/signature.ts src/lib/copilot/secrets.ts tests/unit/copilot/signature.test.ts
git commit -m "feat(copilot): signed identify, newsletter tokens, Vault-backed secrets"
git push origin HEAD:main
```

---

### Task 5: Identity rules, email identity and the AMS interface

**Files:**
- Create: `src/lib/copilot/identity.ts`
- Create: `src/lib/copilot/ams/types.ts`
- Create: `src/lib/copilot/ams/stub.ts`
- Create: `src/lib/copilot/ams/index.ts`
- Modify: `src/lib/support/email-deliverability.ts` (export the consumer-provider check)
- Test: `tests/unit/copilot/identity.test.ts`

**Interfaces:**
- Produces in `ams/types.ts`:
  - `interface MemberSnapshot { memberRef: string; email: string | null; name: string | null; company: string | null; status: 'active' | 'lapsed' | 'non_member' | 'unknown'; type: string | null; renewalDate: string | null; registrations: Array<{ eventId: string; title: string; date: string | null }>; fetchedAt: string }`
  - `interface AmsAdapter { readonly provider: string; getMember(memberRef: string): Promise<MemberSnapshot | null>; findMemberByEmail(email: string): Promise<MemberSnapshot | null> }`
  - `class AmsUnavailableError extends Error`
- Produces in `ams/index.ts`: `getAmsAdapter(config: unknown): AmsAdapter | null`
- Produces in `identity.ts`:
  - `type IdentitySource = 'ams_login' | 'newsletter' | 'ams_email' | 'email_domain' | 'external'`
  - `IDENTITY_RANK: Record<IdentitySource, number>`
  - `interface IdentityUpdate { source: IdentitySource; memberRef?: string | null; email?: string | null; name?: string | null; company?: string | null; companyDomain?: string | null; membership?: MemberSnapshot | null }`
  - `interface VisitorIdentity { identity_source: IdentitySource | null; member_ref: string | null; email: string | null; name: string | null; company: string | null; company_domain: string | null; membership: unknown }`
  - `planIdentityPatch(current: VisitorIdentity, upd: IdentityUpdate, nowIso: string): Record<string, unknown> | null`
  - `companyFromEmail(email: string): { domain: string; company: string } | null`
  - `identityFromEmail(email: string, ams: AmsAdapter | null): Promise<{ update: IdentityUpdate | null; amsUnavailable: boolean }>`
- Produces in `email-deliverability.ts`: `isConsumerMailDomain(domain: string): boolean`

- [ ] **Step 1: Export the consumer-provider check**

In `src/lib/support/email-deliverability.ts`, directly below `const PROVIDER_SET = new Set(PROVIDERS);`, add:

```ts
/** True for consumer mailbox providers (gmail.com, outlook.com, ...). */
export function isConsumerMailDomain(domain: string): boolean {
  return PROVIDER_SET.has(domain.toLowerCase());
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { planIdentityPatch, companyFromEmail, identityFromEmail, type VisitorIdentity } from '@/lib/copilot/identity';
import { StubAmsAdapter } from '@/lib/copilot/ams/stub';
import { AmsUnavailableError, type AmsAdapter } from '@/lib/copilot/ams/types';

const NOW = '2026-10-01T10:00:00.000Z';
const anon: VisitorIdentity = { identity_source: null, member_ref: null, email: null, name: null, company: null, company_domain: null, membership: null };

describe('planIdentityPatch', () => {
  it('applies any source to an anonymous visitor', () => {
    expect(planIdentityPatch(anon, { source: 'email_domain', email: 'a@acme.com', company: 'Acme', companyDomain: 'acme.com' }, NOW))
      .toEqual({ identity_source: 'email_domain', identity_resolved_at: NOW, email: 'a@acme.com', company: 'Acme', company_domain: 'acme.com' });
  });
  it('lets a stronger source replace a weaker one', () => {
    const cur = { ...anon, identity_source: 'email_domain' as const, company: 'Acme' };
    const p = planIdentityPatch(cur, { source: 'ams_login', memberRef: 'M1', company: 'Acme Coaches' }, NOW);
    expect(p).toMatchObject({ identity_source: 'ams_login', member_ref: 'M1', company: 'Acme Coaches' });
  });
  it('never lets a weaker source overwrite a stronger one, only fill gaps', () => {
    const cur = { ...anon, identity_source: 'ams_login' as const, member_ref: 'M1', company: 'Acme Coaches', email: null };
    const p = planIdentityPatch(cur, { source: 'external', company: 'Some ISP', email: 'x@y.com' }, NOW);
    expect(p).toEqual({ email: 'x@y.com' });
  });
  it('returns null when nothing would change', () => {
    const cur = { ...anon, identity_source: 'ams_login' as const, company: 'Acme' };
    expect(planIdentityPatch(cur, { source: 'external', company: 'Other' }, NOW)).toBeNull();
  });
});

describe('companyFromEmail', () => {
  it('derives a company from a business domain', () => {
    expect(companyFromEmail('Jane@Greyhound.com')).toEqual({ domain: 'greyhound.com', company: 'Greyhound' });
    expect(companyFromEmail('a@coach-usa.com')).toEqual({ domain: 'coach-usa.com', company: 'Coach Usa' });
    expect(companyFromEmail('a@mail.nationalexpress.co.uk')).toEqual({ domain: 'mail.nationalexpress.co.uk', company: 'Nationalexpress' });
  });
  it('returns null for consumer mail, US ISPs and junk', () => {
    expect(companyFromEmail('john@gmail.com')).toBeNull();
    expect(companyFromEmail('john@comcast.net')).toBeNull();
    expect(companyFromEmail('john@sbcglobal.net')).toBeNull();
    expect(companyFromEmail('not-an-email')).toBeNull();
  });
});

describe('identityFromEmail', () => {
  const ams = new StubAmsAdapter([{ memberRef: 'M9', email: 'pat@acme.com', name: 'Pat', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: '2027-01-01', registrations: [] }]);
  it('identifies a member through the AMS', async () => {
    const r = await identityFromEmail('PAT@acme.com', ams);
    expect(r.amsUnavailable).toBe(false);
    expect(r.update).toMatchObject({ source: 'ams_email', memberRef: 'M9', company: 'Acme Coaches', email: 'pat@acme.com' });
  });
  it('falls back to the email domain for a non-member', async () => {
    const r = await identityFromEmail('lee@greyhound.com', ams);
    expect(r.update).toMatchObject({ source: 'email_domain', company: 'Greyhound', companyDomain: 'greyhound.com' });
  });
  it('gives no identity for a consumer email that is not a member', async () => {
    expect((await identityFromEmail('lee@gmail.com', ams)).update).toBeNull();
  });
  it('reports an AMS outage and still uses the domain', async () => {
    const down: AmsAdapter = { provider: 'x', getMember: async () => { throw new AmsUnavailableError('down'); }, findMemberByEmail: async () => { throw new AmsUnavailableError('down'); } };
    const r = await identityFromEmail('lee@greyhound.com', down);
    expect(r.amsUnavailable).toBe(true);
    expect(r.update?.source).toBe('email_domain');
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/identity.test.ts`
Expected: FAIL, cannot resolve `@/lib/copilot/identity`.

- [ ] **Step 4: Implement `ams/types.ts`**

```ts
export interface MemberSnapshot {
  memberRef: string;
  email: string | null;
  name: string | null;
  company: string | null;
  status: 'active' | 'lapsed' | 'non_member' | 'unknown';
  type: string | null;
  renewalDate: string | null;
  registrations: Array<{ eventId: string; title: string; date: string | null }>;
  fetchedAt: string;
}

export interface AmsAdapter {
  readonly provider: string;
  getMember(memberRef: string): Promise<MemberSnapshot | null>;
  findMemberByEmail(email: string): Promise<MemberSnapshot | null>;
}

/** Thrown when the AMS cannot be reached. Callers continue without member data. */
export class AmsUnavailableError extends Error {}
```

- [ ] **Step 5: Implement `ams/stub.ts`**

```ts
import type { AmsAdapter, MemberSnapshot } from './types';

type StubMember = Omit<MemberSnapshot, 'fetchedAt'>;

/** In-memory AMS for development and tests, configured via config.copilot.ams.stub_members. */
export class StubAmsAdapter implements AmsAdapter {
  readonly provider = 'stub';
  constructor(private readonly members: StubMember[]) {}

  private snap(m: StubMember | undefined): MemberSnapshot | null {
    return m ? { ...m, fetchedAt: new Date().toISOString() } : null;
  }
  async getMember(memberRef: string) {
    return this.snap(this.members.find((m) => m.memberRef === memberRef));
  }
  async findMemberByEmail(email: string) {
    const e = email.toLowerCase();
    return this.snap(this.members.find((m) => m.email?.toLowerCase() === e));
  }
}
```

- [ ] **Step 6: Implement `ams/index.ts`**

```ts
import type { AmsAdapter } from './types';
import { StubAmsAdapter } from './stub';

/** Adapter for an association, from accounts.config. Null when no AMS is configured. */
export function getAmsAdapter(config: unknown): AmsAdapter | null {
  const ams = (config as any)?.copilot?.ams;
  if (!ams || typeof ams.provider !== 'string') return null;
  if (ams.provider === 'stub') return new StubAmsAdapter(Array.isArray(ams.stub_members) ? ams.stub_members : []);
  console.error('[copilot/ams] unknown provider', ams.provider);
  return null;
}
```

- [ ] **Step 7: Implement `identity.ts`**

```ts
/**
 * Visitor identity rules. Multiview's Intent Exchange needs company identity
 * on as many interactions as possible, but only identity the visitor gave us:
 * login, a signed newsletter link, or an email typed into the chat.
 */
import { isConsumerMailDomain, normalizeEmail, domainOf } from '@/lib/support/email-deliverability';
import { AmsUnavailableError, type AmsAdapter, type MemberSnapshot } from './ams/types';

export type IdentitySource = 'ams_login' | 'newsletter' | 'ams_email' | 'email_domain' | 'external';

export const IDENTITY_RANK: Record<IdentitySource, number> = {
  ams_login: 5, newsletter: 4, ams_email: 3, email_domain: 2, external: 1,
};

export interface IdentityUpdate {
  source: IdentitySource;
  memberRef?: string | null;
  email?: string | null;
  name?: string | null;
  company?: string | null;
  companyDomain?: string | null;
  membership?: MemberSnapshot | null;
}

export interface VisitorIdentity {
  identity_source: IdentitySource | null;
  member_ref: string | null;
  email: string | null;
  name: string | null;
  company: string | null;
  company_domain: string | null;
  membership: unknown;
}

const FIELDS: Array<[keyof IdentityUpdate, keyof VisitorIdentity]> = [
  ['memberRef', 'member_ref'], ['email', 'email'], ['name', 'name'],
  ['company', 'company'], ['companyDomain', 'company_domain'], ['membership', 'membership'],
];

/** The columns to write, or null when the update changes nothing. */
export function planIdentityPatch(cur: VisitorIdentity, upd: IdentityUpdate, nowIso: string): Record<string, unknown> | null {
  const stronger = cur.identity_source === null || IDENTITY_RANK[upd.source] >= IDENTITY_RANK[cur.identity_source];
  const patch: Record<string, unknown> = {};
  for (const [from, to] of FIELDS) {
    const v = upd[from];
    if (v === undefined || v === null || v === '') continue;
    if (stronger ? cur[to] !== v : cur[to] === null) patch[to] = v;
  }
  if (stronger && cur.identity_source !== upd.source) patch.identity_source = upd.source;
  if (Object.keys(patch).length === 0) return null;
  if (stronger) { patch.identity_source = upd.source; patch.identity_resolved_at = nowIso; }
  return patch;
}

const US_ISP_DOMAINS = new Set([
  'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'bellsouth.net', 'cox.net',
  'charter.net', 'earthlink.net', 'optonline.net', 'frontier.com', 'windstream.net', 'rocketmail.com',
]);
const TWO_PART_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.il', 'com.br', 'co.nz', 'co.za', 'com.mx']);

export function companyFromEmail(email: string): { domain: string; company: string } | null {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  const domain = domainOf(norm);
  if (isConsumerMailDomain(domain) || US_ISP_DOMAINS.has(domain)) return null;
  const labels = domain.split('.');
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join('.');
  const nameLabel = TWO_PART_SUFFIXES.has(lastTwo) ? labels[labels.length - 3] : labels[labels.length - 2];
  if (!nameLabel) return null;
  const company = nameLabel.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return { domain, company };
}

export async function identityFromEmail(
  email: string, ams: AmsAdapter | null,
): Promise<{ update: IdentityUpdate | null; amsUnavailable: boolean }> {
  const norm = normalizeEmail(email)?.toLowerCase() ?? null;
  if (!norm) return { update: null, amsUnavailable: false };
  let amsUnavailable = false;
  if (ams) {
    try {
      const m = await ams.findMemberByEmail(norm);
      if (m) {
        return {
          update: { source: 'ams_email', memberRef: m.memberRef, email: norm, name: m.name, company: m.company, membership: m },
          amsUnavailable: false,
        };
      }
    } catch (e) {
      if (!(e instanceof AmsUnavailableError)) throw e;
      amsUnavailable = true;
    }
  }
  const co = companyFromEmail(norm);
  if (!co) return { update: null, amsUnavailable };
  return { update: { source: 'email_domain', email: norm, company: co.company, companyDomain: co.domain }, amsUnavailable };
}
```

`normalizeEmail(raw: unknown): string | null` (trims, strips invisible characters, does not lowercase) and `domainOf(email: string): string` (lowercases) are already exported from `email-deliverability.ts`.

- [ ] **Step 8: Run tests**

Run: `npx vitest run tests/unit/copilot/identity.test.ts tests/unit/email-deliverability*.test.ts`
Expected: PASS. The existing deliverability tests still pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/copilot/identity.ts src/lib/copilot/ams src/lib/support/email-deliverability.ts tests/unit/copilot/identity.test.ts
git commit -m "feat(copilot): identity precedence, email identity, AMS interface with stub"
git push origin HEAD:main
```

---

### Task 6: Visitors and interaction events

**Files:**
- Create: `src/lib/copilot/visitors.ts`
- Create: `src/lib/copilot/events.ts`
- Test: `tests/unit/copilot/visitors.test.ts`

**Interfaces:**
- Consumes: `planIdentityPatch`, `IdentityUpdate`, `VisitorIdentity` (Task 5); `AssociationTenant` (Task 3).
- Produces in `visitors.ts`:
  - `interface VisitorRow extends VisitorIdentity { id: string; partner_id: string; account_id: string; anon_id: string; merged_into: string | null; identity_resolved_at: string | null }`
  - `isValidAnonId(v: unknown): v is string` (`/^[A-Za-z0-9_-]{16,64}$/`)
  - `getOrCreateVisitor(t: AssociationTenant, anonId: string): Promise<VisitorRow>`
  - `getVisitor(t: AssociationTenant, visitorId: string): Promise<VisitorRow | null>` (follows `merged_into`, refuses other accounts)
  - `applyIdentity(t: AssociationTenant, v: VisitorRow, upd: IdentityUpdate): Promise<{ visitor: VisitorRow; merged: boolean }>`
- Produces in `events.ts`:
  - `const SERVER_EVENT_TYPES` and `const CLIENT_EVENT_TYPES = ['page_view', 'link_clicked'] as const`
  - `type InteractionEventType`
  - `interface InteractionEventInput { type: InteractionEventType; sessionId?: string | null; messageId?: string | null; payload?: Record<string, unknown>; occurredAt?: string }`
  - `recordEvents(ctx: { partnerId: string; accountId: string; visitorId: string; industry: string | null }, events: InteractionEventInput[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db: { visitors: any[]; rpc: any[]; inserts: any[] } = { visitors: [], rpc: [], inserts: [] };

function q(table: string) {
  const filters: Record<string, unknown> = {};
  const api: any = {
    select: () => api,
    eq: (c: string, v: unknown) => { filters[c] = v; return api; },
    is: (c: string, v: unknown) => { filters[c] = v; return api; },
    neq: (c: string, v: unknown) => { filters['!' + c] = v; return api; },
    maybeSingle: async () => ({ data: db.visitors.find((r) => Object.entries(filters).every(([k, v]) => k.startsWith('!') ? r[k.slice(1)] !== v : r[k] === v)) ?? null }),
    single: async () => api.maybeSingle(),
    upsert: (row: any) => { if (!db.visitors.find((r) => r.account_id === row.account_id && r.anon_id === row.anon_id)) db.visitors.push({ id: `v${db.visitors.length + 1}`, merged_into: null, identity_source: null, member_ref: null, email: null, name: null, company: null, company_domain: null, membership: null, identity_resolved_at: null, ...row }); return { then: (f: any) => f({ error: null }) }; },
    update: (patch: any) => ({ eq: async (_c: string, id: string) => { Object.assign(db.visitors.find((r) => r.id === id), patch); return { error: null }; } }),
    insert: async (rows: any) => { db.inserts.push(...rows); return { error: null }; },
  };
  return api;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => q(t),
    rpc: async (name: string, args: any) => {
      db.rpc.push({ name, args });
      if (name === 'copilot_merge_visitor') {
        const from = db.visitors.find((r) => r.id === args.p_from);
        from.merged_into = args.p_into; from.member_ref = null;
      }
      return { error: null };
    },
  },
}));

import { getOrCreateVisitor, getVisitor, applyIdentity, isValidAnonId } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const ANON1 = 'anon_aaaaaaaaaaaaaaaa';
const ANON2 = 'anon_bbbbbbbbbbbbbbbb';

beforeEach(() => { db.visitors = []; db.rpc = []; db.inserts = []; });

describe('visitors', () => {
  it('validates anon ids', () => {
    expect(isValidAnonId(ANON1)).toBe(true);
    expect(isValidAnonId('short')).toBe(false);
    expect(isValidAnonId('has space aaaaaaaaaaaa')).toBe(false);
  });

  it('creates once and returns the same visitor for the same anon id', async () => {
    const a = await getOrCreateVisitor(T, ANON1);
    const b = await getOrCreateVisitor(T, ANON1);
    expect(a.id).toBe(b.id);
    expect(db.visitors).toHaveLength(1);
  });

  it('merges a second device into the existing member profile', async () => {
    const first = await getOrCreateVisitor(T, ANON1);
    await applyIdentity(T, first, { source: 'ams_login', memberRef: 'M1', company: 'Acme' });
    const second = await getOrCreateVisitor(T, ANON2);
    const r = await applyIdentity(T, second, { source: 'ams_login', memberRef: 'M1' });
    expect(r.merged).toBe(true);
    expect(r.visitor.id).toBe(first.id);
    expect(db.rpc).toContainEqual({ name: 'copilot_merge_visitor', args: { p_from: second.id, p_into: first.id } });
    // The merged device now resolves to the member profile.
    expect((await getOrCreateVisitor(T, ANON2)).id).toBe(first.id);
  });

  it('identifying an already merged visitor again does not merge into itself', async () => {
    const first = await getOrCreateVisitor(T, ANON1);
    await applyIdentity(T, first, { source: 'ams_login', memberRef: 'M1' });
    const again = await applyIdentity(T, (await getVisitor(T, first.id))!, { source: 'ams_login', memberRef: 'M1' });
    expect(again.merged).toBe(false);
    expect(db.rpc.filter((r) => r.name === 'copilot_merge_visitor')).toHaveLength(0);
  });

  it('getVisitor refuses a visitor from another account', async () => {
    const v = await getOrCreateVisitor(T, ANON1);
    expect(await getVisitor({ ...T, accountId: 'other' }, v.id)).toBeNull();
  });
});

describe('recordEvents', () => {
  it('writes rows with tenant context', async () => {
    await recordEvents({ partnerId: 'pA', accountId: 'acc', visitorId: 'v1', industry: 'motorcoach' }, [{ type: 'session_started', sessionId: 's1' }]);
    expect(db.inserts[0]).toMatchObject({ partner_id: 'pA', account_id: 'acc', visitor_id: 'v1', session_id: 's1', type: 'session_started', industry: 'motorcoach', payload: {} });
  });
  it('does nothing for an empty batch', async () => {
    await recordEvents({ partnerId: 'pA', accountId: 'acc', visitorId: 'v1', industry: null }, []);
    expect(db.inserts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/visitors.test.ts`
Expected: FAIL, cannot resolve `@/lib/copilot/visitors`.

- [ ] **Step 3: Implement `visitors.ts`**

```ts
/**
 * Visitor profiles. One profile per visitor from the first visit; identities
 * from the same member on two devices merge into one profile, so Multiview
 * sees one journey per person.
 */
import { supabase } from '@/lib/supabase';
import { planIdentityPatch, type IdentityUpdate, type VisitorIdentity } from './identity';
import type { AssociationTenant } from './tenant';

export interface VisitorRow extends VisitorIdentity {
  id: string;
  partner_id: string;
  account_id: string;
  anon_id: string;
  merged_into: string | null;
  identity_resolved_at: string | null;
}

const COLS = 'id, partner_id, account_id, anon_id, member_ref, email, name, company, company_domain, identity_source, identity_resolved_at, membership, merged_into';
const MAX_HOPS = 5;

export function isValidAnonId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}

async function byId(id: string): Promise<VisitorRow | null> {
  const { data } = await supabase.from('visitors').select(COLS).eq('id', id).maybeSingle();
  return (data as VisitorRow) ?? null;
}

async function followMerges(v: VisitorRow | null): Promise<VisitorRow | null> {
  let cur = v;
  for (let i = 0; cur?.merged_into && i < MAX_HOPS; i++) cur = await byId(cur.merged_into);
  return cur;
}

export async function getVisitor(t: AssociationTenant, visitorId: string): Promise<VisitorRow | null> {
  const v = await followMerges(await byId(visitorId));
  return v && v.account_id === t.accountId ? v : null;
}

export async function getOrCreateVisitor(t: AssociationTenant, anonId: string): Promise<VisitorRow> {
  await supabase.from('visitors').upsert(
    { partner_id: t.partnerId, account_id: t.accountId, anon_id: anonId },
    { onConflict: 'account_id,anon_id', ignoreDuplicates: true },
  );
  const { data } = await supabase.from('visitors').select(COLS)
    .eq('account_id', t.accountId).eq('anon_id', anonId).maybeSingle();
  const v = await followMerges(data as VisitorRow);
  if (!v) throw new Error('visitor upsert returned nothing');
  await supabase.from('visitors').update({ last_seen: new Date().toISOString() }).eq('id', v.id);
  return v;
}

export async function applyIdentity(
  t: AssociationTenant, v: VisitorRow, upd: IdentityUpdate,
): Promise<{ visitor: VisitorRow; merged: boolean }> {
  let target = v;
  let merged = false;

  if (upd.memberRef) {
    const { data: owner } = await supabase.from('visitors').select(COLS)
      .eq('account_id', t.accountId).eq('member_ref', upd.memberRef).is('merged_into', null)
      .neq('id', v.id).maybeSingle();
    if (owner) {
      const { error } = await supabase.rpc('copilot_merge_visitor', { p_from: v.id, p_into: (owner as VisitorRow).id });
      if (error) throw new Error(`merge failed: ${error.message}`);
      target = owner as VisitorRow;
      merged = true;
    }
  }

  const patch = planIdentityPatch(target, upd, new Date().toISOString());
  if (patch) {
    const { error } = await supabase.from('visitors').update(patch).eq('id', target.id);
    if (error) throw new Error(`identity update failed: ${error.message}`);
    target = { ...target, ...patch } as VisitorRow;
  }
  return { visitor: target, merged };
}
```

- [ ] **Step 4: Implement `events.ts`**

```ts
/**
 * Append-only interaction records: the structured data Multiview's reporting
 * and Intent Exchange read. Never let a write failure break the request.
 */
import { supabase } from '@/lib/supabase';

export const SERVER_EVENT_TYPES = [
  'session_started', 'question', 'topic_classified', 'resource_shown', 'related_item_shown',
  'event_suggested', 'membership_prompted', 'renewal_prompted', 'contact_requested',
  'contact_captured', 'identified', 'escalated', 'recap_sent', 'ams_unavailable',
] as const;
export const CLIENT_EVENT_TYPES = ['page_view', 'link_clicked'] as const;

export type InteractionEventType = (typeof SERVER_EVENT_TYPES)[number] | (typeof CLIENT_EVENT_TYPES)[number];

export interface InteractionEventInput {
  type: InteractionEventType;
  sessionId?: string | null;
  messageId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export async function recordEvents(
  ctx: { partnerId: string; accountId: string; visitorId: string; industry: string | null },
  events: InteractionEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => ({
    partner_id: ctx.partnerId,
    account_id: ctx.accountId,
    visitor_id: ctx.visitorId,
    session_id: e.sessionId ?? null,
    message_id: e.messageId ?? null,
    type: e.type,
    payload: e.payload ?? {},
    industry: ctx.industry,
    ...(e.occurredAt ? { occurred_at: e.occurredAt } : {}),
  }));
  try {
    const { error } = await supabase.from('interaction_events').insert(rows);
    if (error) console.error('[copilot/events] insert failed', ctx.accountId, error.message);
  } catch (e) {
    console.error('[copilot/events] insert threw', ctx.accountId, e);
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/copilot/visitors.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/copilot/visitors.ts src/lib/copilot/events.ts tests/unit/copilot/visitors.test.ts
git commit -m "feat(copilot): visitor profiles with merge, interaction event writer"
git push origin HEAD:main
```

---

### Task 7: `POST /api/partner/v1/session`

**Files:**
- Create: `src/lib/copilot/association.ts`
- Create: `src/app/api/partner/v1/session/route.ts`
- Test: `tests/unit/copilot/session-route.test.ts`

**Interfaces:**
- Consumes: `requireTenant`, `AssociationTenant`, `getOrCreateVisitor`, `isValidAnonId`, `recordEvents`.
- Produces in `association.ts`:
  - `interface AssociationContext { accountId: string; partnerId: string; industry: string | null; branding: Record<string, unknown>; openingQuestions: string[]; config: Record<string, unknown> }`
  - `loadAssociation(t: AssociationTenant): Promise<AssociationContext | null>`
- Produces the route: request `{ anonId: string; sessionId?: string }`; response `{ visitorId, sessionId, resumed: boolean, branding, openingQuestions, identity: { identified: boolean; source: IdentitySource | null } }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const requireTenant = vi.fn();
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: (...a: any[]) => requireTenant(...a) }));
const getOrCreateVisitor = vi.fn();
vi.mock('@/lib/copilot/visitors', async (orig) => ({ ...(await orig<any>()), getOrCreateVisitor: (...a: any[]) => getOrCreateVisitor(...a) }));
const recordEvents = vi.fn();
vi.mock('@/lib/copilot/events', () => ({ recordEvents: (...a: any[]) => recordEvents(...a) }));
vi.mock('@/lib/copilot/association', () => ({
  loadAssociation: async () => ({ accountId: 'acc', partnerId: 'pA', industry: 'motorcoach', branding: { primary: '#0b2a4a' }, openingQuestions: ['How do I join?'], config: {} }),
}));

const sessions: any[] = [];
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: sessions.find((s) => s.id === id) ?? null }) }) }),
      insert: (row: any) => ({ select: () => ({ single: async () => { const s = { id: `s${sessions.length + 1}`, ...row }; sessions.push(s); return { data: s, error: null }; } }) }),
    }),
  },
}));

import { POST } from '@/app/api/partner/v1/session/route';

function req(body: any) {
  return new Request('http://x/api/partner/v1/session', { method: 'POST', body: JSON.stringify(body) }) as any;
}

beforeEach(() => {
  sessions.length = 0;
  requireTenant.mockResolvedValue(T);
  getOrCreateVisitor.mockResolvedValue({ id: 'v1', identity_source: null });
  recordEvents.mockClear();
});

describe('POST /session', () => {
  it('opens a new session and records session_started', async () => {
    const res = await POST(req({ anonId: 'anon_aaaaaaaaaaaaaaaa' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ visitorId: 'v1', sessionId: 's1', resumed: false, openingQuestions: ['How do I join?'], identity: { identified: false, source: null } });
    expect(sessions[0]).toMatchObject({ account_id: 'acc', visitor_id: 'v1', anon_id: 'anon_aaaaaaaaaaaaaaaa', ref_source: 'copilot' });
    expect(recordEvents).toHaveBeenCalledWith(expect.objectContaining({ visitorId: 'v1' }), [expect.objectContaining({ type: 'session_started', sessionId: 's1' })]);
  });

  it('resumes a session that belongs to the same visitor', async () => {
    sessions.push({ id: 'old', account_id: 'acc', visitor_id: 'v1' });
    const body = await (await POST(req({ anonId: 'anon_aaaaaaaaaaaaaaaa', sessionId: 'old' }))).json();
    expect(body).toMatchObject({ sessionId: 'old', resumed: true });
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('opens a new session instead of resuming someone else’s', async () => {
    sessions.push({ id: 'theirs', account_id: 'acc', visitor_id: 'v999' });
    const body = await (await POST(req({ anonId: 'anon_aaaaaaaaaaaaaaaa', sessionId: 'theirs' }))).json();
    expect(body.sessionId).not.toBe('theirs');
    expect(body.resumed).toBe(false);
  });

  it('rejects a bad anon id with 400', async () => {
    expect((await POST(req({ anonId: 'x' }))).status).toBe(400);
  });

  it('passes through a tenant refusal', async () => {
    requireTenant.mockResolvedValue(Response.json({ error: 'host_not_owned' }, { status: 403 }));
    expect((await POST(req({ anonId: 'anon_aaaaaaaaaaaaaaaa' }))).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/session-route.test.ts`
Expected: FAIL, cannot resolve the route module.

- [ ] **Step 3: Implement `association.ts`**

```ts
import { supabase } from '@/lib/supabase';
import type { AssociationTenant } from './tenant';

export interface AssociationContext {
  accountId: string;
  partnerId: string;
  industry: string | null;
  branding: Record<string, unknown>;
  openingQuestions: string[];
  config: Record<string, unknown>;
}

export async function loadAssociation(t: AssociationTenant): Promise<AssociationContext | null> {
  const { data } = await supabase.from('accounts').select('id, partner_id, config').eq('id', t.accountId).maybeSingle();
  if (!data || data.partner_id !== t.partnerId) return null;
  const config = (data.config ?? {}) as Record<string, any>;
  const cp = (config.copilot ?? {}) as Record<string, any>;
  return {
    accountId: data.id,
    partnerId: t.partnerId,
    industry: typeof cp.industry === 'string' ? cp.industry : null,
    branding: (cp.branding ?? {}) as Record<string, unknown>,
    openingQuestions: Array.isArray(cp.opening_questions) ? cp.opening_questions.filter((q: unknown) => typeof q === 'string').slice(0, 6) : [],
    config,
  };
}
```

- [ ] **Step 4: Implement the route**

```ts
import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getOrCreateVisitor, isValidAnonId } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const body = await req.json().catch(() => null);
  if (!body || !isValidAnonId(body.anonId)) return Response.json({ error: 'invalid_anon_id' }, { status: 400 });

  const assoc = await loadAssociation(tenant);
  if (!assoc) return Response.json({ error: 'association_unavailable' }, { status: 404 });

  const visitor = await getOrCreateVisitor(tenant, body.anonId);

  let sessionId: string | null = null;
  let resumed = false;
  if (typeof body.sessionId === 'string') {
    const { data: s } = await supabase.from('chat_sessions').select('id, account_id, visitor_id').eq('id', body.sessionId).maybeSingle();
    if (s && s.account_id === tenant.accountId && s.visitor_id === visitor.id) { sessionId = s.id; resumed = true; }
  }
  if (!sessionId) {
    const { data: s, error } = await supabase.from('chat_sessions')
      .insert({ account_id: tenant.accountId, visitor_id: visitor.id, anon_id: body.anonId, ref_source: 'copilot' })
      .select('id').single();
    if (error || !s) return Response.json({ error: 'session_unavailable' }, { status: 500 });
    sessionId = s.id;
    await recordEvents(
      { partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: visitor.id, industry: assoc.industry },
      [{ type: 'session_started', sessionId }],
    );
  }

  return Response.json({
    visitorId: visitor.id,
    sessionId,
    resumed,
    branding: assoc.branding,
    openingQuestions: assoc.openingQuestions,
    identity: { identified: visitor.identity_source !== null, source: visitor.identity_source },
  });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/copilot/session-route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/copilot/association.ts src/app/api/partner/v1/session/route.ts tests/unit/copilot/session-route.test.ts
git commit -m "feat(copilot): partner API POST /session"
git push origin HEAD:main
```

---

### Task 8: `POST /api/partner/v1/identify`

**Files:**
- Create: `src/app/api/partner/v1/identify/route.ts`
- Test: `tests/unit/copilot/identify-route.test.ts`

**Interfaces:**
- Consumes: `requireTenant`, `loadAssociation`, `getVisitor`, `applyIdentity`, `recordEvents`, `getIdentifySecret`, `verifyIdentify`, `verifyNewsletterToken`, `getAmsAdapter`, `AmsUnavailableError`.
- Request, one of:
  - `{ visitorId, sessionId?, memberId, email?, ts, signature }` (site login, source `ams_login`)
  - `{ visitorId, sessionId?, newsletterToken }` (source `newsletter`)
- Response: `{ visitorId, merged: boolean, identified: true, membership: { status, renewalDate } | null }`. Errors: 400 `invalid_request`, 401 `invalid_signature` / `expired_signature`, 404 `unknown_visitor`, 409 `identify_not_configured`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signIdentify, signNewsletterToken } from '@/lib/copilot/signature';

const SECRET = 'aba-secret';
const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const visitor = { id: 'v1', account_id: 'acc', identity_source: null, member_ref: null, email: null, name: null, company: null, company_domain: null, membership: null, merged_into: null };

vi.mock('@/lib/copilot/auth', () => ({ requireTenant: async () => T }));
vi.mock('@/lib/copilot/association', () => ({ loadAssociation: async () => ({ accountId: 'acc', partnerId: 'pA', industry: 'motorcoach', branding: {}, openingQuestions: [], config: { copilot: { ams: { provider: 'stub', stub_members: [{ memberRef: 'M1', email: 'jane@acme.com', name: 'Jane', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: '2026-11-15', registrations: [] }] } } } }) }));
const getSecret = vi.fn(async () => SECRET as string | null);
vi.mock('@/lib/copilot/secrets', () => ({ getIdentifySecret: () => getSecret() }));
const getVisitor = vi.fn(async () => visitor as any);
const applyIdentity = vi.fn(async (_t: any, v: any, upd: any) => ({ visitor: { ...v, identity_source: upd.source }, merged: false }));
vi.mock('@/lib/copilot/visitors', () => ({ getVisitor: (...a: any[]) => getVisitor(...(a as [])), applyIdentity: (...a: any[]) => applyIdentity(...(a as [any, any, any])) }));
const recordEvents = vi.fn();
vi.mock('@/lib/copilot/events', () => ({ recordEvents: (...a: any[]) => recordEvents(...a) }));
const sessionUpdates: any[] = [];
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ update: (p: any) => ({ eq: () => ({ eq: async () => { sessionUpdates.push(p); return { error: null }; } }) }) }) } }));

import { POST } from '@/app/api/partner/v1/identify/route';

const req = (b: any) => new Request('http://x/api/partner/v1/identify', { method: 'POST', body: JSON.stringify(b) }) as any;

beforeEach(() => { applyIdentity.mockClear(); recordEvents.mockClear(); getSecret.mockResolvedValue(SECRET); getVisitor.mockResolvedValue(visitor); sessionUpdates.length = 0; });

describe('POST /identify', () => {
  it('identifies a signed-in member and pulls the AMS snapshot', async () => {
    const ts = Date.now();
    const sig = signIdentify(SECRET, { memberId: 'M1', email: 'jane@acme.com', ts });
    const res = await POST(req({ visitorId: 'v1', sessionId: 's1', memberId: 'M1', email: 'jane@acme.com', ts, signature: sig }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ visitorId: 'v1', identified: true, membership: { status: 'active', renewalDate: '2026-11-15' } });
    expect(applyIdentity).toHaveBeenCalledWith(T, visitor, expect.objectContaining({ source: 'ams_login', memberRef: 'M1', company: 'Acme Coaches' }));
    expect(recordEvents).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ type: 'identified', sessionId: 's1', payload: { source: 'ams_login', merged: false } })]);
    expect(sessionUpdates[0]).toHaveProperty('identified_at');
  });

  it('identifies from a newsletter token', async () => {
    const tok = signNewsletterToken(SECRET, { memberId: 'M1', email: null, expiresAt: Date.now() + 60_000 });
    const res = await POST(req({ visitorId: 'v1', newsletterToken: tok }));
    expect(res.status).toBe(200);
    expect(applyIdentity).toHaveBeenCalledWith(T, visitor, expect.objectContaining({ source: 'newsletter', memberRef: 'M1' }));
  });

  it('refuses a forged signature and leaves the visitor alone', async () => {
    const ts = Date.now();
    const sig = signIdentify('wrong', { memberId: 'M1', email: null, ts });
    const res = await POST(req({ visitorId: 'v1', memberId: 'M1', ts, signature: sig }));
    expect(res.status).toBe(401);
    expect(applyIdentity).not.toHaveBeenCalled();
  });

  it('refuses a stale signature', async () => {
    const ts = Date.now() - 11 * 60 * 1000;
    const res = await POST(req({ visitorId: 'v1', memberId: 'M1', ts, signature: signIdentify(SECRET, { memberId: 'M1', email: null, ts }) }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('expired_signature');
  });

  it('409 when the association has no secret, 404 for a foreign visitor, 400 for junk', async () => {
    getSecret.mockResolvedValueOnce(null);
    expect((await POST(req({ visitorId: 'v1', memberId: 'M1', ts: Date.now(), signature: 'a'.repeat(64) }))).status).toBe(409);
    getVisitor.mockResolvedValueOnce(null);
    expect((await POST(req({ visitorId: 'vX', memberId: 'M1', ts: Date.now(), signature: 'a'.repeat(64) }))).status).toBe(404);
    expect((await POST(req({ visitorId: 'v1' }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/identify-route.test.ts`
Expected: FAIL, cannot resolve the route module.

- [ ] **Step 3: Implement the route**

```ts
import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor, applyIdentity } from '@/lib/copilot/visitors';
import { recordEvents, type InteractionEventInput } from '@/lib/copilot/events';
import { getIdentifySecret } from '@/lib/copilot/secrets';
import { verifyIdentify, verifyNewsletterToken } from '@/lib/copilot/signature';
import { getAmsAdapter } from '@/lib/copilot/ams';
import { AmsUnavailableError, type MemberSnapshot } from '@/lib/copilot/ams/types';
import type { IdentitySource } from '@/lib/copilot/identity';
import type { AssociationTenant } from '@/lib/copilot/tenant';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const bad = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const body = await req.json().catch(() => null);
  const viaLogin = body && typeof body.memberId === 'string' && typeof body.signature === 'string' && typeof body.ts === 'number';
  const viaNewsletter = body && typeof body.newsletterToken === 'string';
  if (!body || typeof body.visitorId !== 'string' || (!viaLogin && !viaNewsletter)) return bad(400, 'invalid_request');

  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return bad(404, 'unknown_visitor');

  const secret = await getIdentifySecret(tenant.accountId);
  if (!secret) return bad(409, 'identify_not_configured');

  let memberRef: string;
  let email: string | null;
  let source: IdentitySource;
  if (viaLogin) {
    const email0 = typeof body.email === 'string' && body.email ? body.email : null;
    const v = verifyIdentify(secret, { memberId: body.memberId, email: email0, ts: body.ts }, body.signature);
    if (v === 'expired') return bad(401, 'expired_signature');
    if (v !== 'ok') return bad(401, 'invalid_signature');
    memberRef = body.memberId; email = email0; source = 'ams_login';
  } else {
    const c = verifyNewsletterToken(secret, body.newsletterToken);
    if (!c) return bad(401, 'invalid_signature');
    memberRef = c.memberId; email = c.email; source = 'newsletter';
  }

  const assoc = await loadAssociation(tenant);
  const ams = getAmsAdapter(assoc?.config);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
  const events: InteractionEventInput[] = [];
  let member: MemberSnapshot | null = null;
  if (ams) {
    try { member = await ams.getMember(memberRef); }
    catch (e) {
      if (!(e instanceof AmsUnavailableError)) throw e;
      events.push({ type: 'ams_unavailable', sessionId, payload: { during: 'identify' } });
    }
  }

  const { visitor: v, merged } = await applyIdentity(tenant, visitor, {
    source, memberRef,
    email: email ?? member?.email ?? null,
    name: member?.name ?? null,
    company: member?.company ?? null,
    membership: member,
  });

  if (sessionId) {
    await supabase.from('chat_sessions').update({ identified_at: new Date().toISOString(), visitor_id: v.id })
      .eq('id', sessionId).eq('account_id', tenant.accountId);
  }
  events.push({ type: 'identified', sessionId, payload: { source, merged } });
  await recordEvents({ partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: v.id, industry: assoc?.industry ?? null }, events);

  return Response.json({
    visitorId: v.id,
    merged,
    identified: true,
    membership: member ? { status: member.status, renewalDate: member.renewalDate } : null,
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/copilot/identify-route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/partner/v1/identify/route.ts tests/unit/copilot/identify-route.test.ts
git commit -m "feat(copilot): partner API POST /identify (site login + newsletter token)"
git push origin HEAD:main
```

---

### Task 9: `POST /events` and `POST /visitors/[id]/company`

**Files:**
- Create: `src/lib/copilot/client-events.ts`
- Create: `src/app/api/partner/v1/events/route.ts`
- Create: `src/app/api/partner/v1/visitors/[id]/company/route.ts`
- Test: `tests/unit/copilot/client-events.test.ts`

**Interfaces:**
- Consumes: `CLIENT_EVENT_TYPES`, `recordEvents`, `getVisitor`, `applyIdentity`, `requireTenant`, `loadAssociation`.
- Produces in `client-events.ts`: `sanitizeClientEvents(raw: unknown): { events: InteractionEventInput[]; rejected: number }`. Rules: array only; at most 20 events kept; type must be in `CLIENT_EVENT_TYPES`; payload keys kept: `url`, `path`, `title`, `referrer`, `target`, each a string truncated to 500 characters; `sessionId` kept when a string; anything else dropped.
- `/events` request `{ visitorId, events: [...] }` → `{ accepted: number, rejected: number }`.
- `/visitors/[id]/company` request `{ company: string, companyDomain?: string, provider: string }` → `{ applied: boolean }` (source `external`; `applied` is false when a stronger identity already exists).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeClientEvents } from '@/lib/copilot/client-events';

describe('sanitizeClientEvents', () => {
  it('keeps allowed client events with whitelisted payload keys', () => {
    const r = sanitizeClientEvents([{ type: 'page_view', sessionId: 's1', payload: { url: 'https://buses.org/events', title: 'Events', secret: 'x' } }]);
    expect(r).toEqual({ events: [{ type: 'page_view', sessionId: 's1', payload: { url: 'https://buses.org/events', title: 'Events' } }], rejected: 0 });
  });
  it('refuses server-only types', () => {
    const r = sanitizeClientEvents([{ type: 'identified' }, { type: 'escalated' }, { type: 'link_clicked', payload: { target: 'https://x' } }]);
    expect(r.events.map((e) => e.type)).toEqual(['link_clicked']);
    expect(r.rejected).toBe(2);
  });
  it('caps the batch at 20 and truncates long strings', () => {
    const many = Array.from({ length: 25 }, () => ({ type: 'page_view', payload: { url: 'u'.repeat(900) } }));
    const r = sanitizeClientEvents(many);
    expect(r.events).toHaveLength(20);
    expect(r.rejected).toBe(5);
    expect((r.events[0].payload!.url as string).length).toBe(500);
  });
  it('treats non-arrays and junk entries as rejected', () => {
    expect(sanitizeClientEvents('nope')).toEqual({ events: [], rejected: 0 });
    expect(sanitizeClientEvents([null, 5, { payload: {} }]).rejected).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/client-events.test.ts`
Expected: FAIL, cannot resolve `@/lib/copilot/client-events`.

- [ ] **Step 3: Implement `client-events.ts`**

```ts
import { CLIENT_EVENT_TYPES, type InteractionEventInput } from './events';

const MAX_EVENTS = 20;
const MAX_LEN = 500;
const PAYLOAD_KEYS = ['url', 'path', 'title', 'referrer', 'target'] as const;
const ALLOWED = new Set<string>(CLIENT_EVENT_TYPES);

/** The browser may only report page views and link clicks, with a small, bounded payload. */
export function sanitizeClientEvents(raw: unknown): { events: InteractionEventInput[]; rejected: number } {
  if (!Array.isArray(raw)) return { events: [], rejected: 0 };
  const events: InteractionEventInput[] = [];
  let rejected = 0;
  for (const item of raw) {
    if (events.length >= MAX_EVENTS || !item || typeof item !== 'object' || !ALLOWED.has((item as any).type)) {
      rejected++;
      continue;
    }
    const src = ((item as any).payload ?? {}) as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const k of PAYLOAD_KEYS) if (typeof src[k] === 'string') payload[k] = (src[k] as string).slice(0, MAX_LEN);
    const ev: InteractionEventInput = { type: (item as any).type, payload };
    if (typeof (item as any).sessionId === 'string') ev.sessionId = (item as any).sessionId;
    events.push(ev);
  }
  return { events, rejected };
}
```

- [ ] **Step 4: Implement `/events/route.ts`**

```ts
import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor } from '@/lib/copilot/visitors';
import { recordEvents } from '@/lib/copilot/events';
import { sanitizeClientEvents } from '@/lib/copilot/client-events';
import type { AssociationTenant } from '@/lib/copilot/tenant';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.visitorId !== 'string') return Response.json({ error: 'invalid_request' }, { status: 400 });
  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return Response.json({ error: 'unknown_visitor' }, { status: 404 });
  const { events, rejected } = sanitizeClientEvents(body.events);
  const assoc = await loadAssociation(tenant);
  await recordEvents({ partnerId: tenant.partnerId, accountId: tenant.accountId, visitorId: visitor.id, industry: assoc?.industry ?? null }, events);
  return Response.json({ accepted: events.length, rejected });
}
```

- [ ] **Step 5: Implement `/visitors/[id]/company/route.ts`**

```ts
import { requireTenant } from '@/lib/copilot/auth';
import { getVisitor, applyIdentity } from '@/lib/copilot/visitors';
import type { AssociationTenant } from '@/lib/copilot/tenant';

export const dynamic = 'force-dynamic';

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const company = clean(body?.company, 200);
  if (!company || !clean(body?.provider, 60)) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const visitor = await getVisitor(tenant, id);
  if (!visitor) return Response.json({ error: 'unknown_visitor' }, { status: 404 });
  const { visitor: v } = await applyIdentity(tenant, visitor, {
    source: 'external', company, companyDomain: clean(body?.companyDomain, 253)?.toLowerCase() ?? null,
  });
  return Response.json({ applied: v.company !== visitor.company || v.company_domain !== visitor.company_domain });
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/copilot/client-events.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/copilot/client-events.ts src/app/api/partner/v1/events src/app/api/partner/v1/visitors tests/unit/copilot/client-events.test.ts
git commit -m "feat(copilot): partner API POST /events and external company identity"
git push origin HEAD:main
```

---

### Task 10: Tenant setup script and end-to-end smoke test

**Files:**
- Create: `scripts/copilot-setup-tenant.ts`
- Create: `scripts/copilot-smoke.ts`

**Interfaces:**
- Consumes: `generatePartnerKey`, `signIdentify`, the routes from Tasks 7 to 9.
- `copilot-setup-tenant.ts` flags: `--partner <slug> --partner-name <name> [--account <uuid> --host <host> --industry <text>] [--partner-host <host>] [--new-key <label>] [--new-identify-secret] [--stub-ams]`. Idempotent: re-running links rather than duplicates. Prints a new key or secret once.
- `copilot-smoke.ts` env: `COPILOT_BASE_URL`, `COPILOT_KEY`, `COPILOT_HOST`, `COPILOT_IDENTIFY_SECRET`. Exits non-zero on the first failed check.

- [ ] **Step 1: Write `copilot-setup-tenant.ts`**

```ts
/**
 * Set up a Co-Pilot partner and link an association to it.
 *
 *   npx tsx scripts/copilot-setup-tenant.ts --partner multiview --partner-name "Multiview" \
 *     --partner-host copilot.example.com \
 *     --account e7302108-b12f-4e3e-b8d4-a1f75cfbef41 --host aba.copilot.example.com --industry motorcoach \
 *     --new-key "white-label app" --new-identify-secret --stub-ams
 */
import { config as loadEnv } from 'dotenv';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { generatePartnerKey, normalizeHost } from '../src/lib/copilot/keys';

loadEnv({ path: '.env.local' });

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1]?.startsWith('--') ? '' : args[i + 1] ?? '') : null; };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, { auth: { persistSession: false } });

async function main() {
  const slug = flag('partner');
  const name = flag('partner-name');
  if (!slug || !name) throw new Error('--partner and --partner-name are required');

  const { data: partner, error: pErr } = await sb.from('partners').upsert({ slug, name }, { onConflict: 'slug' }).select('id').single();
  if (pErr || !partner) throw new Error(`partner: ${pErr?.message}`);
  console.log('partner', slug, partner.id);

  const partnerHost = normalizeHost(flag('partner-host'));
  if (partnerHost) {
    await sb.from('tenant_domains').upsert({ host: partnerHost, partner_id: partner.id, account_id: null, kind: 'subdomain' });
    console.log('partner host', partnerHost);
  }

  const accountId = flag('account');
  if (accountId) {
    const host = normalizeHost(flag('host'));
    if (!host) throw new Error('--host is required with --account');
    const { data: acc } = await sb.from('accounts').select('id, config, partner_id').eq('id', accountId).single();
    if (!acc) throw new Error('account not found');
    if (acc.partner_id && acc.partner_id !== partner.id) throw new Error('account belongs to another partner');

    const config = { ...(acc.config ?? {}) } as Record<string, any>;
    const copilot = { ...(config.copilot ?? {}) };
    const industry = flag('industry');
    if (industry) copilot.industry = industry;
    if (flag('stub-ams') !== null && !copilot.ams) copilot.ams = { provider: 'stub', stub_members: [] };

    let newSecret: string | null = null;
    if (flag('new-identify-secret') !== null) {
      newSecret = crypto.randomBytes(32).toString('hex');
      const { data: ref, error } = await sb.rpc('copilot_store_secret', { p_secret: newSecret });
      if (error) throw new Error(`secret: ${error.message}`);
      copilot.identify_secret_ref = ref;
    }
    config.copilot = copilot;
    const { error: uErr } = await sb.from('accounts').update({ partner_id: partner.id, config }).eq('id', accountId);
    if (uErr) throw new Error(`account: ${uErr.message}`);
    await sb.from('tenant_domains').upsert({ host, partner_id: partner.id, account_id: accountId, kind: 'subdomain' });
    console.log('association', accountId, 'on', host);
    if (newSecret) console.log('\nIDENTIFY SECRET (shown once, give to the association developer):\n' + newSecret + '\n');
  }

  const label = flag('new-key');
  if (label !== null) {
    const { plaintext, hash } = generatePartnerKey();
    const { error } = await sb.from('partner_api_keys').insert({ partner_id: partner.id, key_hash: hash, label: label || 'default' });
    if (error) throw new Error(`key: ${error.message}`);
    console.log('\nPARTNER API KEY (shown once, store in the white-label app env):\n' + plaintext + '\n');
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

Note: `config` is re-read and written in one update. The config-wipe race known from re-scans (Lenovo, Studio Pasha) applies: do not run this while a scan of the same account is in progress.

- [ ] **Step 2: Write `copilot-smoke.ts`**

```ts
/**
 * End-to-end check of the partner API against a running server.
 *   COPILOT_BASE_URL=http://localhost:3000 COPILOT_KEY=cpk_... COPILOT_HOST=aba.copilot.example.com \
 *   COPILOT_IDENTIFY_SECRET=... npx tsx scripts/copilot-smoke.ts
 */
import crypto from 'node:crypto';
import { signIdentify } from '../src/lib/copilot/signature';

const base = process.env.COPILOT_BASE_URL!;
const headers = { 'content-type': 'application/json', authorization: `Bearer ${process.env.COPILOT_KEY}`, 'x-tenant-host': process.env.COPILOT_HOST! };

async function call(path: string, body: unknown) {
  const res = await fetch(`${base}/api/partner/v1${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, text: JSON.stringify(json) };
}
function check(name: string, ok: boolean, detail: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.error(detail); process.exit(1); }
}

async function main() {
  const anon1 = 'smoke_' + crypto.randomBytes(12).toString('hex');
  const anon2 = 'smoke_' + crypto.randomBytes(12).toString('hex');

  const s1 = await call('/session', { anonId: anon1 });
  check('session opens', s1.status === 200 && !!s1.json.sessionId, s1);
  check('session body has no vendor names', !/bestie|influencerbot|ldrs|imai/i.test(s1.text), s1.text);

  const s1b = await call('/session', { anonId: anon1, sessionId: s1.json.sessionId });
  check('session resumes', s1b.json.resumed === true && s1b.json.sessionId === s1.json.sessionId, s1b);

  const ev = await call('/events', { visitorId: s1.json.visitorId, events: [{ type: 'page_view', sessionId: s1.json.sessionId, payload: { url: 'https://buses.org/' } }, { type: 'identified' }] });
  check('events accept page_view and reject identified', ev.json.accepted === 1 && ev.json.rejected === 1, ev);

  const wrongHost = await fetch(`${base}/api/partner/v1/session`, { method: 'POST', headers: { ...headers, 'x-tenant-host': 'not-ours.example.org' }, body: JSON.stringify({ anonId: anon1 }) });
  check('unknown host refused', wrongHost.status === 404 || wrongHost.status === 403, wrongHost.status);

  const memberId = 'SMOKE-' + crypto.randomBytes(4).toString('hex');
  const ts = Date.now();
  const sig = signIdentify(process.env.COPILOT_IDENTIFY_SECRET!, { memberId, email: null, ts });
  const id1 = await call('/identify', { visitorId: s1.json.visitorId, sessionId: s1.json.sessionId, memberId, ts, signature: sig });
  check('identify device 1', id1.status === 200 && id1.json.merged === false, id1);

  const s2 = await call('/session', { anonId: anon2 });
  const ts2 = Date.now();
  const id2 = await call('/identify', { visitorId: s2.json.visitorId, memberId, ts: ts2, signature: signIdentify(process.env.COPILOT_IDENTIFY_SECRET!, { memberId, email: null, ts: ts2 }) });
  check('identify device 2 merges into device 1', id2.status === 200 && id2.json.merged === true && id2.json.visitorId === s1.json.visitorId, id2);

  const forged = await call('/identify', { visitorId: s2.json.visitorId, memberId, ts: Date.now(), signature: 'a'.repeat(64) });
  check('forged signature refused', forged.status === 401, forged);

  console.log('\nAll checks passed. Smoke rows use anon ids starting with "smoke_" and member ids starting with "SMOKE-".');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Set up the Multiview partner and ABA on a temporary host**

Pick a neutral temporary host pair until Multiview names its domain, for example `copilot-dev.test` and `aba.copilot-dev.test` (they only need to exist in `tenant_domains`; the smoke test sends them as a header).

Run:
```bash
npx tsx scripts/copilot-setup-tenant.ts --partner multiview --partner-name "Multiview" \
  --partner-host copilot-dev.test \
  --account e7302108-b12f-4e3e-b8d4-a1f75cfbef41 --host aba.copilot-dev.test --industry motorcoach \
  --new-key "dev" --new-identify-secret --stub-ams
```
Expected: prints the partner id, the association line, an IDENTIFY SECRET and a PARTNER API KEY. Store both in the session scratchpad only, never in the repo.

- [ ] **Step 4: Run the smoke test against a local server**

Run in one terminal: `npm run dev`
Run in another:
```bash
COPILOT_BASE_URL=http://localhost:3000 COPILOT_KEY=<key> COPILOT_HOST=aba.copilot-dev.test \
COPILOT_IDENTIFY_SECRET=<secret> npx tsx scripts/copilot-smoke.ts
```
Expected: eight `PASS` lines and "All checks passed".

- [ ] **Step 5: Verify the rows in the database**

Run via `execute_sql`:
```sql
select type, count(*) from interaction_events
 where account_id = 'e7302108-b12f-4e3e-b8d4-a1f75cfbef41' group by type order by type;
select count(*) filter (where merged_into is not null) as merged,
       count(*) filter (where identity_source = 'ams_login') as identified
  from visitors where account_id = 'e7302108-b12f-4e3e-b8d4-a1f75cfbef41' and anon_id like 'smoke_%';
```
Expected: `session_started` 2, `page_view` 1, `identified` 2; `merged` 1, `identified` 1.

- [ ] **Step 6: Run the full copilot test suite and type-check**

Run: `npx vitest run tests/unit/copilot && npm run type-check`
Expected: all copilot tests PASS; no new type errors in `src/lib/copilot` or `src/app/api/partner`.

- [ ] **Step 7: Commit**

```bash
git add scripts/copilot-setup-tenant.ts scripts/copilot-smoke.ts
git commit -m "feat(copilot): tenant setup script and partner API smoke test"
git push origin HEAD:main
```

---

## What Plan 1 deliberately leaves out

- `/chat`, contact capture, recap (Plan 2).
- Console auth and reporting endpoints (Plan 4). `console_users` and `console_login_codes` exist from migration 150 so Plan 4 adds no schema.
- Rate limiting on `/chat` (Plan 2, where the cost lives). `/session`, `/identify` and `/events` are cheap and key-authenticated.
- The real AMS adapter (Plan 5).
