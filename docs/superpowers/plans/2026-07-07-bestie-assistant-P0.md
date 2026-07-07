
# P0 — Foundations & tenancy — TDD implementation plan

Foundation for the whole Bestie Assistant. Delivers: multi-agency tenancy (`agency_id` + backfill + RLS + `assertAgentOwns` choke-point), the audit/idempotency ledger (`assistant_actions` + `assistant_turns` + business-key UNIQUE index), pure idempotency-key helpers, CRM money/exclusivity/credentials additions, and phone→agent provisioning. Everything later phases depend on.

**Invariants honored:** money math stays in `computeTotals` (untouched); grounding≠authz≠freshness (authz layer = `assertAgentOwns`); untrusted content never authorizes (provisioning verifies phone at onboarding, not by inbound); log-before-reply (ledger tables exist before P1 Executor writes them).

**Conventions (verified in-repo):** vitest (`describe/it/expect`, `import { … } from '@/lib/...'`), tests under `tests/unit/assistant/*.test.ts`, migrations are numbered `.sql` files under `supabase/migrations/` applied via the Supabase MCP `apply_migration` tool (`name`, `query`=file contents). Pure/testable helpers live separate from DB calls (pattern: `wa-interpret.ts` pure vs `wa-conversation.ts` DB). Commit straight to `main` (per repo working style), atomic, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

Run all P0 tests at any point with: `npx vitest run tests/unit/assistant/`.

---

## Task 1 — Idempotency key helpers (pure, tested)

Business-level + request-level idempotency keys per spec §3.2. Pure, dependency-light (only `crypto`), tested first.

**Files**
- create `src/lib/assistant/idempotency.ts`
- create `tests/unit/assistant/idempotency.test.ts`

**Interfaces (produces)**
- `businessKey(input: BusinessKeyInput): string` — `sha256(agentId + briefId + accountId + sorted(line_items) + amount)`; order-independent over line items; amount in agorot to avoid float drift.
- `requestKey(channel: string, waMessageId: string): string`

### 1a. Write failing test
`tests/unit/assistant/idempotency.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { businessKey, requestKey } from '@/lib/assistant/idempotency';

const base = {
  agentId: 'agent-1',
  briefId: 'brief-1',
  accountId: 'acct-1',
  amount: 20000,
  lineItems: [
    { deliverable_type: 'reel', platform: 'instagram', qty: 1, unit_price: 8000 },
    { deliverable_type: 'story', platform: 'instagram', qty: 3, unit_price: 4000 },
  ],
};

describe('businessKey', () => {
  it('is deterministic for identical input', () => {
    expect(businessKey(base)).toBe(businessKey(base));
  });
  it('is a 64-char hex sha256 digest', () => {
    expect(businessKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is independent of line-item ordering', () => {
    const reordered = { ...base, lineItems: [base.lineItems[1], base.lineItems[0]] };
    expect(businessKey(reordered)).toBe(businessKey(base));
  });
  it('changes when the amount changes (a re-price is a new business action)', () => {
    expect(businessKey({ ...base, amount: 25000 })).not.toBe(businessKey(base));
  });
  it('changes when a line unit_price changes', () => {
    const bumped = { ...base, lineItems: [{ ...base.lineItems[0], unit_price: 9000 }, base.lineItems[1]] };
    expect(businessKey(bumped)).not.toBe(businessKey(base));
  });
  it('is stable when optional fields are omitted', () => {
    const a = businessKey({ agentId: 'a', lineItems: [] });
    const b = businessKey({ agentId: 'a', briefId: null, accountId: null, amount: null, lineItems: [] });
    expect(a).toBe(b);
  });
});

describe('requestKey', () => {
  it('binds channel + wa_message_id', () => {
    expect(requestKey('whatsapp', 'wamid.X')).toBe(requestKey('whatsapp', 'wamid.X'));
    expect(requestKey('whatsapp', 'wamid.X')).not.toBe(requestKey('whatsapp', 'wamid.Y'));
  });
});
```

### 1b. Run to fail
`npx vitest run tests/unit/assistant/idempotency.test.ts` → fails (module missing).

### 1c. Minimal impl
`src/lib/assistant/idempotency.ts`:
```ts
/**
 * Idempotency keys for the assistant (spec §3.2), two scopes:
 *   • business-level: hash(agent + brief + account + sorted line items + amount)
 *     → UNIQUE partial index on assistant_actions.business_key blocks a re-built
 *       quote across multiple turns/redeliveries.
 *   • request-level: hash(channel + wa_message_id) → dedups Meta at-least-once
 *     webhook redelivery of the same inbound message.
 * Pure + dependency-free (crypto only) so it is unit-testable and reusable.
 */
import { createHash } from 'crypto';

export interface BusinessKeyLine {
  deliverable_type?: string | null;
  platform?: string | null;
  qty?: number | null;
  unit_price?: number | null;
}
export interface BusinessKeyInput {
  agentId: string;
  briefId?: string | null;
  accountId?: string | null;
  amount?: number | null;
  lineItems?: BusinessKeyLine[];
}

function normLine(li: BusinessKeyLine): string {
  const qty = Math.max(1, Math.round(Number(li?.qty) || 1));
  const price = Math.max(0, Math.round((Number(li?.unit_price) || 0) * 100)); // agorot
  const kind = [li?.deliverable_type || '', li?.platform || ''].join('|').toLowerCase().trim();
  return `${kind}:${qty}x${price}`;
}

export function businessKey(input: BusinessKeyInput): string {
  const lines = (input.lineItems || []).map(normLine).sort();
  const amount = input.amount == null ? '' : String(Math.round(Number(input.amount) * 100));
  const material = [
    input.agentId || '',
    input.briefId || '',
    input.accountId || '',
    lines.join(','),
    amount,
  ].join('§'); // § — a separator that can't appear in a UUID/number
  return createHash('sha256').update(material).digest('hex');
}

export function requestKey(channel: string, waMessageId: string): string {
  return createHash('sha256').update(`${channel}§${waMessageId}`).digest('hex');
}
```

### 1d. Run to pass
`npx vitest run tests/unit/assistant/idempotency.test.ts` → green.

### 1e. Commit
`git add src/lib/assistant/idempotency.ts tests/unit/assistant/idempotency.test.ts && git commit` — message: `feat(assistant): business + request idempotency key helpers (P0 §3.2)`.

---

## Task 2 — Ownership authorization predicate (pure, tested)

Spec Principle 2 + §9: authorization is a separate check from grounding. Pure predicate first; DB wrapper comes in Task 7 after the tenancy columns exist.

**Files**
- create `src/lib/assistant/authz.ts` (predicate + `AuthzError` only for now; `assertAgentOwns` DB wrapper added in Task 7)
- create `tests/unit/assistant/authz.test.ts`

**Interfaces (produces)**
- `authorizeOwnership(caller: Caller, resource: OwnedResource): { ok: boolean; reason?: string }`
- `class AuthzError extends Error`

### 2a. Write failing test
`tests/unit/assistant/authz.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { authorizeOwnership } from '@/lib/assistant/authz';

const employee = { id: 'u-emp', agency_id: 'ag-1', agency_role: 'employee' as const };
const owner = { id: 'u-own', agency_id: 'ag-1', agency_role: 'owner' as const };

describe('authorizeOwnership', () => {
  it('allows the agent who owns the resource directly', () => {
    expect(authorizeOwnership(employee, { agent_id: 'u-emp', agency_id: 'ag-1' }).ok).toBe(true);
  });
  it('denies an employee acting on a peer’s resource', () => {
    const r = authorizeOwnership(employee, { agent_id: 'u-peer', agency_id: 'ag-1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_owner');
  });
  it('allows an owner to act on any resource in their agency', () => {
    expect(authorizeOwnership(owner, { agent_id: 'u-peer', agency_id: 'ag-1' }).ok).toBe(true);
  });
  it('denies an owner acting on another agency’s resource (cross-tenant)', () => {
    expect(authorizeOwnership(owner, { agent_id: 'u-x', agency_id: 'ag-2' }).ok).toBe(false);
  });
  it('denies when the caller is missing', () => {
    expect(authorizeOwnership(null as any, { agent_id: 'u-emp' }).ok).toBe(false);
  });
  it('denies when the resource has no owning agent and caller is not agency-owner', () => {
    expect(authorizeOwnership(employee, { agent_id: null, agency_id: 'ag-1' }).ok).toBe(false);
  });
});
```

### 2b. Run to fail
`npx vitest run tests/unit/assistant/authz.test.ts` → fails.

### 2c. Minimal impl
`src/lib/assistant/authz.ts`:
```ts
/**
 * Ownership authorization (spec Principle 2 + §9). Grounding (does the ID exist)
 * and freshness (does the DB still permit it) are SEPARATE checks done elsewhere.
 * authz = caller.id === resource.agent_id OR caller is the OWNER of the same agency.
 * Pure predicate + a DB-backed choke-point (assertAgentOwns, added once tenancy
 * columns land) that every mutating tool calls before touching a row.
 */
export interface Caller {
  id: string;
  agency_id?: string | null;
  agency_role?: 'owner' | 'employee' | null;
}
export interface OwnedResource {
  agent_id?: string | null;
  agency_id?: string | null;
}

export class AuthzError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`authorization denied: ${reason}`);
    this.name = 'AuthzError';
    this.reason = reason;
  }
}

export function authorizeOwnership(caller: Caller, resource: OwnedResource): { ok: boolean; reason?: string } {
  if (!caller?.id) return { ok: false, reason: 'no_caller' };
  if (resource?.agent_id && resource.agent_id === caller.id) return { ok: true };
  if (
    caller.agency_role === 'owner' &&
    caller.agency_id &&
    resource?.agency_id &&
    resource.agency_id === caller.agency_id
  ) {
    return { ok: true };
  }
  return { ok: false, reason: 'not_owner' };
}
```

### 2d. Run to pass
`npx vitest run tests/unit/assistant/authz.test.ts` → green.

### 2e. Commit
`feat(assistant): pure ownership-authorization predicate + AuthzError (P0 §9)`.

---

## Task 3 — Provisioning helpers (pure parts, tested)

Spec §8.7: phone→agent binding at web onboarding with verification. Pure helpers (phone normalization reusing `toWaId`, verification code) tested; DB wrapper thin and added at the end of this task.

**Files**
- create `src/lib/assistant/provisioning.ts`
- create `tests/unit/assistant/provisioning.test.ts`

**Interfaces (produces)**
- `normalizeAgentPhone(raw: string): string | null` — E.164 digits (no `+`), IL-normalized; null if too short.
- `generateVerificationCode(): string` — 6-digit zero-padded.
- `provisionAgentPhone(args): Promise<{ ok: boolean; verificationCode?: string; reason?: string }>` — DB wrapper: rejects a phone already claimed by a *different* active user; writes `whatsapp`, `gender`, `address_style`, and issues a verification code.

### 3a. Write failing test (pure parts only — DB wrapper is exercised via MCP in Task 8/verification)
`tests/unit/assistant/provisioning.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeAgentPhone, generateVerificationCode } from '@/lib/assistant/provisioning';

describe('normalizeAgentPhone', () => {
  it('normalizes an IL national number to 972 E.164 digits', () => {
    expect(normalizeAgentPhone('054-1234567')).toBe('972541234567');
  });
  it('accepts +972 international form', () => {
    expect(normalizeAgentPhone('+972 54 123 4567')).toBe('972541234567');
  });
  it('rejects a too-short string', () => {
    expect(normalizeAgentPhone('12345')).toBeNull();
    expect(normalizeAgentPhone('')).toBeNull();
  });
});

describe('generateVerificationCode', () => {
  it('is always a 6-digit string', () => {
    for (let i = 0; i < 50; i++) expect(generateVerificationCode()).toMatch(/^\d{6}$/);
  });
});
```

### 3b. Run to fail
`npx vitest run tests/unit/assistant/provisioning.test.ts` → fails.

### 3c. Minimal impl
`src/lib/assistant/provisioning.ts`:
```ts
/**
 * Phone→agent provisioning (spec §8.7). Binding is created at web onboarding by
 * the owner (or self-serve with verification), storing gender/address-style. The
 * waId is auth-sensitive (recycled numbers must not route a stranger into an
 * agent's scope) — never a stable PK, so a re-link requires re-verification.
 * Pure helpers (normalize/verify code) are separate from the DB write.
 */
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import { randomInt } from 'crypto';

export function normalizeAgentPhone(raw: string): string | null {
  if (!raw) return null;
  const wa = toWaId(raw);
  return wa.length >= 11 ? wa : null; // 972 + 9 IL digits
}

export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export interface ProvisionArgs {
  userId: string;
  rawPhone: string;
  gender?: 'male' | 'female' | 'other' | null;
  addressStyle?: string | null;
}

export async function provisionAgentPhone(
  args: ProvisionArgs
): Promise<{ ok: boolean; verificationCode?: string; reason?: string }> {
  const wa = normalizeAgentPhone(args.rawPhone);
  if (!wa) return { ok: false, reason: 'invalid_phone' };

  // Reject a number already claimed by a DIFFERENT active user (recycled-number guard).
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, status')
    .eq('whatsapp', wa)
    .neq('id', args.userId)
    .maybeSingle();
  if (existing && (existing as any).status === 'active') {
    return { ok: false, reason: 'phone_taken' };
  }

  const code = generateVerificationCode();
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      whatsapp: wa,
      gender: args.gender ?? null,
      address_style: args.addressStyle ?? null,
      wa_verification_code: code,
      wa_verified: false,
    })
    .eq('id', args.userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, verificationCode: code };
}
```
> Note: `wa_verification_code` / `wa_verified` columns are added in Task 4's migration. If preferred, gate the DB wrapper's columns behind that migration; the pure helpers under test have no such dependency.

### 3d. Run to pass
`npx vitest run tests/unit/assistant/provisioning.test.ts` → green (pure parts; DB wrapper compiles).

### 3e. Commit
`feat(assistant): phone→agent provisioning helpers + verification code (P0 §8.7)`.

---

## Task 4 — Migration 061: agency tenancy + backfill

Spec §8.1. The highest-leverage schema change (multi-agency is structurally impossible today: `matchAgent` matches any user by phone across all tenants).

**Files**
- create `supabase/migrations/061_agency_tenancy.sql`

**Produces:** `public.agencies`; `users.agency_id/agency_role/gender/address_style/wa_verification_code/wa_verified`; `accounts.agency_id`; `partnerships.agency_id`; indexes; backfill (one agency per existing agent = that agent as owner).

### 4a. Red — prove the columns are absent
Via Supabase MCP `execute_sql`:
```sql
select agency_id from public.users limit 1;
```
→ errors `column users.agency_id does not exist`. (This is the failing "test" for a schema task.)

### 4b. Write migration
`supabase/migrations/061_agency_tenancy.sql`:
```sql
-- Migration 061: multi-agency tenancy (spec §8.1).
-- Adds a first-class agency grouping + owner|employee role + Hebrew-agreement
-- fields, and backfills every existing agent as the owner of their own agency.
-- users.role stays the 4-tier RBAC value ('agent'); owner|employee lives in the
-- NEW users.agency_role column (do not repurpose users.role).

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Agency',
  owner_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.users
  add column if not exists agency_id uuid references public.agencies(id),
  add column if not exists agency_role text
    check (agency_role in ('owner','employee')),
  add column if not exists gender text
    check (gender in ('male','female','other')),
  add column if not exists address_style text,
  add column if not exists wa_verification_code text,
  add column if not exists wa_verified boolean not null default false;

alter table public.accounts
  add column if not exists agency_id uuid references public.agencies(id);

alter table public.partnerships
  add column if not exists agency_id uuid references public.agencies(id);

-- Backfill: one agency per existing agent, that agent as owner. ------------------
do $$
declare r record;
declare new_agency uuid;
begin
  for r in select id, full_name, agency, managed_account_ids
           from public.users where role = 'agent' and agency_id is null loop
    insert into public.agencies (name, owner_user_id)
      values (coalesce(nullif(r.agency->>'name',''), r.full_name, 'Agency'), r.id)
      returning id into new_agency;

    update public.users
      set agency_id = new_agency, agency_role = 'owner'
      where id = r.id;

    -- the agent's roster accounts inherit the agency
    if r.managed_account_ids is not null then
      update public.accounts
        set agency_id = new_agency
        where id = any(r.managed_account_ids) and agency_id is null;
    end if;
  end loop;
end $$;

-- partnerships inherit their pricing agent's agency
update public.partnerships p
  set agency_id = u.agency_id
  from public.users u
  where p.agent_id = u.id and p.agency_id is null;

create index if not exists users_agency_idx on public.users (agency_id);
create index if not exists accounts_agency_idx on public.accounts (agency_id);
create index if not exists partnerships_agency_idx on public.partnerships (agency_id);
create index if not exists agencies_owner_idx on public.agencies (owner_user_id);

comment on column public.users.agency_role is 'owner | employee within the agency. Distinct from users.role (4-tier RBAC = agent).';
comment on column public.users.wa_verification_code is 'One-time code for phone re-link verification (§8.7).';
```

### 4c. Apply
Supabase MCP `apply_migration`: `name` = `061_agency_tenancy`, `query` = file contents.

### 4d. Green — verify columns + backfill
Via MCP `execute_sql`:
```sql
select
  (select count(*) from public.agencies) as agencies,
  (select count(*) from public.users where role='agent' and agency_id is null) as unbackfilled_agents,
  (select count(*) from public.partnerships where agent_id is not null and agency_id is null) as unscoped_deals;
```
Expect: `agencies` ≥ existing agent count, `unbackfilled_agents = 0`, `unscoped_deals = 0`.

### 4e. Type-check + commit
`npm run type-check` (guards the provisioning wrapper's new columns compile). Commit the migration file: `feat(db): migration 061 — agency tenancy + owner role + agent backfill (P0 §8.1)`.

---

## Task 5 — Migration 062: assistant_actions + assistant_turns ledger

Spec §8.2 + §3.2. The unified audit log **and** idempotency ledger — the source of truth actions are logged to before any reply is composed (Principle 7).

**Files**
- create `supabase/migrations/062_assistant_ledger.sql`

**Produces:** `assistant_actions` (with UNIQUE partial index on `business_key`), `assistant_turns` (with UNIQUE `wa_message_id` for request-level dedup).

### 5a. Red
MCP `execute_sql`: `select 1 from public.assistant_actions limit 1;` → errors (relation missing).

### 5b. Write migration
`supabase/migrations/062_assistant_ledger.sql`:
```sql
-- Migration 062: assistant audit log + idempotency ledger (spec §8.2, §3.2).
-- assistant_actions = one row per planned/executed tool action; powers the
-- dashboard AND blocks duplicates via a UNIQUE partial index on business_key.
-- assistant_turns = one row per inbound turn (debugging + memory-writer input),
-- kept OUT of the action table so actions stay a clean ledger; wa_message_id is
-- UNIQUE for request-level dedup of Meta's at-least-once redelivery.

create table if not exists public.assistant_turns (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.users(id) on delete set null,
  agency_id uuid references public.agencies(id),
  wa_message_id text,                 -- request-level idempotency key (Meta wamid)
  channel text not null default 'text' check (channel in ('text','voice')),
  raw_text text,
  transcript text,
  planner_json jsonb,
  reply_text text,
  model text,
  tokens_in integer,
  tokens_out integer,
  cached_tokens integer,
  latency_ms integer,
  cost numeric,
  created_at timestamptz not null default now()
);

create unique index if not exists assistant_turns_wamid_uq
  on public.assistant_turns (wa_message_id) where wa_message_id is not null;
create index if not exists assistant_turns_agent_idx on public.assistant_turns (agent_id);

create table if not exists public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.users(id) on delete set null,
  agency_id uuid references public.agencies(id),
  employee_id uuid references public.users(id),   -- snapshot of who acted (co-mgmt)
  turn_id uuid references public.assistant_turns(id) on delete set null,
  batch_id uuid,                                   -- N children of one voice note
  tool_name text not null,
  tool_version integer not null default 1,
  args jsonb not null default '{}'::jsonb,
  origin text not null default 'assistant_confirmed'
    check (origin in ('assistant_auto','assistant_confirmed','agent_manual')),
  status text not null default 'planned'
    check (status in ('planned','awaiting_confirm','executing','done','failed','cancelled','superseded')),
  business_key text,
  result jsonb,
  entity_type text,
  entity_id uuid,
  error_category text,
  superseded_by uuid references public.assistant_actions(id),
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  latency_ms integer,
  cost numeric
);

-- Business-level idempotency: one live action per business_key. A retried/redelivered
-- build_quote collapses onto the existing row instead of creating a duplicate deal.
create unique index if not exists assistant_actions_business_key_uq
  on public.assistant_actions (business_key)
  where business_key is not null and status not in ('failed','cancelled','superseded');

create index if not exists assistant_actions_agent_idx on public.assistant_actions (agent_id);
create index if not exists assistant_actions_batch_idx on public.assistant_actions (batch_id);
create index if not exists assistant_actions_entity_idx on public.assistant_actions (entity_type, entity_id);
```

### 5c. Apply
MCP `apply_migration`: `062_assistant_ledger`.

### 5d. Green — prove the UNIQUE partial index enforces business-level idempotency
MCP `execute_sql` (single statement, self-cleaning):
```sql
do $$
declare a1 uuid;
begin
  insert into public.assistant_actions (tool_name, business_key, status)
    values ('crm.build_quote','pg-test-key','planned') returning id into a1;
  begin
    insert into public.assistant_actions (tool_name, business_key, status)
      values ('crm.build_quote','pg-test-key','planned');
    raise exception 'DUPLICATE ALLOWED — index is broken';
  exception when unique_violation then
    raise notice 'OK: duplicate live business_key blocked';
  end;
  -- a superseded row with the same key IS allowed (re-price path)
  update public.assistant_actions set status='superseded' where id=a1;
  insert into public.assistant_actions (tool_name, business_key, status)
    values ('crm.build_quote','pg-test-key','planned');
  raise notice 'OK: superseding a business_key allows a fresh live row';
  delete from public.assistant_actions where business_key='pg-test-key';
end $$;
```
Expect both `OK:` notices, no exception.

### 5e. Commit
`feat(db): migration 062 — assistant_actions + assistant_turns ledger with business-key idempotency index (P0 §8.2/§3.2)`.

---

## Task 6 — Ledger write helpers

Thin DB wrappers over the two ledger tables, plus one pure row-builder that is unit-tested. Later phases (P1 Executor) consume these.

**Files**
- create `src/lib/assistant/ledger.ts`
- create `tests/unit/assistant/ledger.test.ts`

**Interfaces (produces)**
- `actionRowFromClaim(claim: ActionClaim): Record<string, any>` — **pure** mapping from a planned action to the `assistant_actions` insert row (status `planned`). Tested.
- `claimTurn(fields): Promise<{ claimed: boolean; turnId: string }>` — inserts an `assistant_turns` row; on `wa_message_id` conflict returns `{ claimed:false }` (request-level idempotency).
- `recordTurn(turnId, patch): Promise<void>` — fills planner_json/reply_text/tokens/cost after processing.
- `claimBusinessKey(claim): Promise<{ claimed: boolean; actionId: string; existing?: any }>` — inserts a planned action; on business_key conflict returns the existing live row.
- `recordExecution(actionId, result): Promise<void>` — sets status/result/error_category/executed_at/latency/cost.

### 6a. Write failing test (pure builder)
`tests/unit/assistant/ledger.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { actionRowFromClaim } from '@/lib/assistant/ledger';

describe('actionRowFromClaim', () => {
  it('maps a planned action to an assistant_actions insert row', () => {
    const row = actionRowFromClaim({
      agentId: 'a1', agencyId: 'ag1', turnId: 't1', batchId: 'b1',
      toolName: 'crm.build_quote', toolVersion: 2,
      args: { accountId: 'acc1' }, businessKey: 'bk1', origin: 'assistant_confirmed',
    });
    expect(row).toMatchObject({
      agent_id: 'a1', agency_id: 'ag1', turn_id: 't1', batch_id: 'b1',
      tool_name: 'crm.build_quote', tool_version: 2,
      args: { accountId: 'acc1' }, business_key: 'bk1',
      origin: 'assistant_confirmed', status: 'planned',
    });
  });
  it('defaults version to 1 and origin to assistant_confirmed', () => {
    const row = actionRowFromClaim({ agentId: 'a1', toolName: 'crm.status', args: {} });
    expect(row.tool_version).toBe(1);
    expect(row.origin).toBe('assistant_confirmed');
    expect(row.status).toBe('planned');
  });
});
```

### 6b. Run to fail
`npx vitest run tests/unit/assistant/ledger.test.ts` → fails.

### 6c. Minimal impl
`src/lib/assistant/ledger.ts`:
```ts
/**
 * Assistant ledger writers (spec §8.2, Principle 7 "log before reply").
 * A pure row-builder (actionRowFromClaim) is unit-tested; the DB wrappers rely on
 * migration 062's UNIQUE indexes for request-level (wa_message_id) and
 * business-level (business_key) idempotency.
 */
import { supabase as supabaseAdmin } from '@/lib/supabase';

export interface ActionClaim {
  agentId: string;
  agencyId?: string | null;
  employeeId?: string | null;
  turnId?: string | null;
  batchId?: string | null;
  toolName: string;
  toolVersion?: number;
  args: Record<string, any>;
  businessKey?: string | null;
  origin?: 'assistant_auto' | 'assistant_confirmed' | 'agent_manual';
  entityType?: string | null;
  entityId?: string | null;
}

export function actionRowFromClaim(claim: ActionClaim): Record<string, any> {
  return {
    agent_id: claim.agentId,
    agency_id: claim.agencyId ?? null,
    employee_id: claim.employeeId ?? null,
    turn_id: claim.turnId ?? null,
    batch_id: claim.batchId ?? null,
    tool_name: claim.toolName,
    tool_version: claim.toolVersion ?? 1,
    args: claim.args ?? {},
    business_key: claim.businessKey ?? null,
    origin: claim.origin ?? 'assistant_confirmed',
    entity_type: claim.entityType ?? null,
    entity_id: claim.entityId ?? null,
    status: 'planned',
  };
}

export async function claimTurn(fields: {
  agentId?: string | null;
  agencyId?: string | null;
  waMessageId?: string | null;
  channel?: 'text' | 'voice';
  rawText?: string | null;
  transcript?: string | null;
}): Promise<{ claimed: boolean; turnId: string }> {
  const { data, error } = await supabaseAdmin
    .from('assistant_turns')
    .insert({
      agent_id: fields.agentId ?? null,
      agency_id: fields.agencyId ?? null,
      wa_message_id: fields.waMessageId ?? null,
      channel: fields.channel ?? 'text',
      raw_text: fields.rawText ?? null,
      transcript: fields.transcript ?? null,
    })
    .select('id')
    .single();
  if (error) {
    // 23505 = unique_violation on wa_message_id → Meta redelivery, already handled.
    if ((error as any).code === '23505' && fields.waMessageId) {
      const { data: prior } = await supabaseAdmin
        .from('assistant_turns').select('id').eq('wa_message_id', fields.waMessageId).maybeSingle();
      return { claimed: false, turnId: prior?.id as string };
    }
    throw error;
  }
  return { claimed: true, turnId: data!.id };
}

export async function recordTurn(turnId: string, patch: Record<string, any>): Promise<void> {
  await supabaseAdmin.from('assistant_turns').update(patch).eq('id', turnId);
}

export async function claimBusinessKey(
  claim: ActionClaim
): Promise<{ claimed: boolean; actionId: string; existing?: any }> {
  const { data, error } = await supabaseAdmin
    .from('assistant_actions')
    .insert(actionRowFromClaim(claim))
    .select('id')
    .single();
  if (error) {
    if ((error as any).code === '23505' && claim.businessKey) {
      const { data: live } = await supabaseAdmin
        .from('assistant_actions')
        .select('*')
        .eq('business_key', claim.businessKey)
        .not('status', 'in', '(failed,cancelled,superseded)')
        .maybeSingle();
      return { claimed: false, actionId: live?.id as string, existing: live };
    }
    throw error;
  }
  return { claimed: true, actionId: data!.id };
}

export async function recordExecution(
  actionId: string,
  result: { status: 'done' | 'failed'; result?: any; errorCategory?: string | null; latencyMs?: number; cost?: number }
): Promise<void> {
  await supabaseAdmin
    .from('assistant_actions')
    .update({
      status: result.status,
      result: result.result ?? null,
      error_category: result.errorCategory ?? null,
      executed_at: new Date().toISOString(),
      latency_ms: result.latencyMs ?? null,
      cost: result.cost ?? null,
    })
    .eq('id', actionId);
}
```

### 6d. Run to pass
`npx vitest run tests/unit/assistant/ledger.test.ts` → green. `npm run type-check`.

### 6e. Commit
`feat(assistant): ledger writers (claimTurn/claimBusinessKey/recordExecution) + pure row builder (P0 §8.2)`.

---

## Task 7 — `assertAgentOwns` DB choke-point + wire it into the cross-tenant write

Spec §6.6 + §9: `assertAgentOwns` chokepoint every tool calls, and fix the flagged cross-tenant write in `buildQuoteFromBrief` (accepts `accountId` today without re-checking `managed_account_ids`).

**Files**
- modify `src/lib/assistant/authz.ts` (add `assertAgentOwns` DB wrapper)
- modify `src/lib/crm/wa-conversation.ts` (call `assertAgentOwns` before `buildQuoteFromBrief` mutates)
- create `tests/unit/assistant/assert-agent-owns.test.ts`

### 7a. Write failing test (mock the supabase admin client)
`tests/unit/assistant/assert-agent-owns.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the service-role client the wrapper reads through.
const mockAccount = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mockAccount(table) }),
      }),
    }),
  },
}));

import { assertAgentOwns, AuthzError } from '@/lib/assistant/authz';

const owner = { id: 'u1', agency_id: 'ag1', agency_role: 'owner' as const };

describe('assertAgentOwns', () => {
  beforeEach(() => mockAccount.mockReset());

  it('resolves when the account belongs to the caller’s agency', async () => {
    mockAccount.mockResolvedValue({ data: { id: 'acc1', agency_id: 'ag1' } });
    await expect(assertAgentOwns(owner, { accountId: 'acc1' })).resolves.toBeUndefined();
  });

  it('throws AuthzError on a cross-agency account (the §9 cross-tenant write)', async () => {
    mockAccount.mockResolvedValue({ data: { id: 'acc9', agency_id: 'ag2' } });
    await expect(assertAgentOwns(owner, { accountId: 'acc9' })).rejects.toBeInstanceOf(AuthzError);
  });

  it('throws when the referenced resource does not exist (grounding gap)', async () => {
    mockAccount.mockResolvedValue({ data: null });
    await expect(assertAgentOwns(owner, { accountId: 'ghost' })).rejects.toBeInstanceOf(AuthzError);
  });
});
```

### 7b. Run to fail
`npx vitest run tests/unit/assistant/assert-agent-owns.test.ts` → fails (`assertAgentOwns` not exported).

### 7c. Minimal impl — append to `src/lib/assistant/authz.ts`
```ts
import { supabase as supabaseAdmin } from '@/lib/supabase';

/**
 * DB choke-point every mutating tool calls before touching a row (spec §6.6/§9).
 * Resolves the referenced entity's owning agent/agency, then runs the pure
 * authorizeOwnership predicate. Throws AuthzError on grounding gap OR authz deny.
 */
export async function assertAgentOwns(
  caller: Caller,
  ref: { accountId?: string; dealId?: string; briefId?: string }
): Promise<void> {
  let resource: OwnedResource | null = null;

  if (ref.dealId) {
    const { data } = await supabaseAdmin
      .from('partnerships').select('agent_id, agency_id').eq('id', ref.dealId).maybeSingle();
    resource = data as any;
  } else if (ref.briefId) {
    const { data } = await supabaseAdmin
      .from('crm_inbound_messages').select('agent_id').eq('id', ref.briefId).maybeSingle();
    // brief agency is derived from its agent
    if (data?.agent_id) {
      const { data: u } = await supabaseAdmin
        .from('users').select('agency_id').eq('id', (data as any).agent_id).maybeSingle();
      resource = { agent_id: (data as any).agent_id, agency_id: (u as any)?.agency_id ?? null };
    }
  } else if (ref.accountId) {
    const { data } = await supabaseAdmin
      .from('accounts').select('id, agency_id').eq('id', ref.accountId).maybeSingle();
    // a talent has no agent_id column; ownership = same agency
    resource = data ? { agent_id: null, agency_id: (data as any).agency_id } : null;
  }

  if (!resource) throw new AuthzError('not_found');
  const res = authorizeOwnership(caller, resource);
  if (!res.ok) throw new AuthzError(res.reason || 'forbidden');
}
```

### 7d. Wire the choke-point into `wa-conversation.ts`
In `buildQuoteFromBrief` (currently mutates on `accountId` with no ownership check), add the assertion at the top. Change its signature to receive the full `WaAgent` (already does) and call:
```ts
import { assertAgentOwns } from '@/lib/assistant/authz';
// ...
async function buildQuoteFromBrief(agent: WaAgent, briefId: string, accountId: string, lineItems: LineItem[]) {
  await assertAgentOwns(
    { id: agent.id, agency_id: (agent as any).agency_id, agency_role: (agent as any).agency_role },
    { accountId }
  );
  // ...existing body unchanged...
}
```
Add `agency_id` + `agency_role` to the `WaAgent` interface and to the `users` select in the webhook (`maybeHandleAgentQuote`) and in `matchAgent` (quote-ingest) so the caller carries agency context:
- `src/app/api/webhooks/whatsapp/route.ts`: `.select('id, role, status, managed_account_ids, full_name, agency_id, agency_role')`.
- `src/lib/crm/wa-conversation.ts`: extend `WaAgent` with `agency_id?: string|null; agency_role?: 'owner'|'employee'|null;`.

### 7e. Run to pass
`npx vitest run tests/unit/assistant/assert-agent-owns.test.ts` → green.
Regression: `npx vitest run tests/unit/crm-wa-interpret.test.ts tests/unit/crm-pricing.test.ts` (still green — no behavior change to pure interpreters). `npm run type-check`.

### 7f. Commit
`fix(crm): assertAgentOwns choke-point on buildQuoteFromBrief — close the §9 cross-tenant write (P0 §6.6)`.

---

## Task 8 — Migration 063: CRM money / exclusivity / credentials

Spec §8.3. `talent_rate_cards` (versioned prices — the money-staleness fix), `exclusivity` (capture-at-sign data, unrecoverable if missed), `integration_credentials`, `partnerships.vat_rate`, `deal_line_items.currency`.

**Files**
- create `supabase/migrations/063_crm_money_exclusivity.sql`

### 8a. Red
MCP `execute_sql`: `select 1 from public.talent_rate_cards limit 1;` → errors.

### 8b. Write migration
`supabase/migrations/063_crm_money_exclusivity.sql`:
```sql
-- Migration 063: CRM money model + exclusivity capture + integration credentials
-- (spec §8.3). Prices live in the CRM (never memory) as a versioned rate card;
-- exclusivity DATA is captured at sign time even though detection is deferred;
-- vat_rate/currency are per-line/per-deal (foreign clients are zero-rated, §8.6).

create table if not exists public.talent_rate_cards (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.accounts(id) on delete cascade,
  agency_id uuid references public.agencies(id),
  deliverable_type text not null,
  platform text,
  price numeric not null,
  currency text not null default 'ILS',
  valid_from timestamptz not null default now(),
  valid_to timestamptz,                                  -- null = current
  source text not null default 'agent',                  -- 'agent' | 'signed_deal' | 'import'
  created_at timestamptz not null default now()
);
create index if not exists rate_cards_talent_idx on public.talent_rate_cards (talent_id);
create index if not exists rate_cards_current_idx
  on public.talent_rate_cards (talent_id, deliverable_type) where valid_to is null;

create table if not exists public.exclusivity (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.accounts(id) on delete cascade,
  agency_id uuid references public.agencies(id),
  deal_id uuid references public.partnerships(id) on delete set null,
  category_scope text,                                   -- e.g. 'cosmetics'
  brand_scope text,                                      -- e.g. 'L''Oréal'
  competitor_scope text,                                 -- who the talent may NOT work with
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);
create index if not exists exclusivity_talent_idx on public.exclusivity (talent_id);
create index if not exists exclusivity_deal_idx on public.exclusivity (deal_id);

create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users(id) on delete cascade,
  agency_id uuid references public.agencies(id),
  provider text not null,                                -- 'google.calendar' | 'google.gmail' | ...
  external_account_id text,
  scopes text[] not null default '{}',
  access_token text,                                     -- encrypted-at-rest wiring lands in P5
  refresh_token text,
  expires_at timestamptz,
  status text not null default 'connected'
    check (status in ('connected','expired','revoked')),
  created_at timestamptz not null default now(),
  unique (agent_id, provider)
);
create index if not exists integ_creds_agent_idx on public.integration_credentials (agent_id);

-- Per-deal VAT (deal_line_items already has per-line vat_rate; add per-line currency).
alter table public.partnerships
  add column if not exists vat_rate numeric not null default 0.18;
alter table public.deal_line_items
  add column if not exists currency text not null default 'ILS';

comment on table public.talent_rate_cards is 'Versioned talent prices (§4.3). Correction = new row + valid_to on the old; grounding guardrail validates against this, never memory.';
comment on table public.exclusivity is 'Exclusivity captured at contract-sign time (§8.3). Detection engine deferred; the data is unrecoverable if not captured now.';
```

### 8c. Apply
MCP `apply_migration`: `063_crm_money_exclusivity`.

### 8d. Green
MCP `execute_sql`:
```sql
select
  (select count(*) from public.talent_rate_cards) as rate_cards,
  (select column_name from information_schema.columns
     where table_name='partnerships' and column_name='vat_rate') as p_vat,
  (select column_name from information_schema.columns
     where table_name='deal_line_items' and column_name='currency') as li_ccy;
```
Expect non-null `p_vat`/`li_ccy`, `rate_cards=0`. Confirm `computeTotals` still passes: `npx vitest run tests/unit/crm-pricing.test.ts` (unchanged — it already honors per-line `vat_rate`).

### 8e. Commit
`feat(db): migration 063 — talent_rate_cards + exclusivity + integration_credentials + vat_rate/currency (P0 §8.3)`.

---

## Task 9 — Migration 064: re-enable RLS + agency-scoped policies

Spec §6.6. Defense-in-depth: service-role bypasses RLS (so `assertAgentOwns` is the real enforcer), but RLS denies any authenticated/anon leak. New assistant/CRM tables get RLS+deny; the shared tables get agency-scoped SELECT policies via a helper so authenticated agent sessions still read their own agency.

**Files**
- create `supabase/migrations/064_assistant_rls.sql`

### 9a. Red — prove RLS is off on the new tables
MCP `execute_sql`:
```sql
select relname, relrowsecurity from pg_class
where relname in ('assistant_actions','assistant_turns','talent_rate_cards','exclusivity','integration_credentials');
```
Expect `relrowsecurity=false` for all (failing state).

### 9b. Write migration
`supabase/migrations/064_assistant_rls.sql`:
```sql
-- Migration 064: re-enable RLS as defense-in-depth (spec §6.6).
-- Server tools use the service-role key (bypasses RLS) with assertAgentOwns as the
-- real choke-point; RLS here denies any anon/authenticated cross-agency access.

-- Helper: the agency of the currently-authenticated user (null for anon/service).
create or replace function public.current_agency_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select agency_id from public.users where auth_user_id = auth.uid() limit 1 $$;

-- New assistant/CRM tables: enable RLS with NO permissive policy
-- (= only service-role can touch them; zero app impact today).
alter table public.assistant_actions        enable row level security;
alter table public.assistant_turns           enable row level security;
alter table public.talent_rate_cards         enable row level security;
alter table public.exclusivity               enable row level security;
alter table public.integration_credentials   enable row level security;

-- Shared tables already reachable by authenticated sessions get an agency-scoped
-- SELECT policy (service-role still bypasses; authenticated users see only their
-- agency). WARNING: verify influencer/widget read paths on a preview branch first.
alter table public.partnerships          enable row level security;
alter table public.deal_line_items       enable row level security;
alter table public.invoices              enable row level security;

drop policy if exists partnerships_agency_read on public.partnerships;
create policy partnerships_agency_read on public.partnerships
  for select to authenticated
  using (agency_id is not null and agency_id = public.current_agency_id());

drop policy if exists line_items_agency_read on public.deal_line_items;
create policy line_items_agency_read on public.deal_line_items
  for select to authenticated
  using (exists (
    select 1 from public.partnerships p
    where p.id = deal_line_items.partnership_id
      and p.agency_id = public.current_agency_id()
  ));

drop policy if exists invoices_agency_read on public.invoices;
create policy invoices_agency_read on public.invoices
  for select to authenticated
  using (exists (
    select 1 from public.partnerships p
    where p.id = invoices.partnership_id
      and p.agency_id = public.current_agency_id()
  ));

comment on function public.current_agency_id is 'RLS helper: agency_id of the authenticated user (§6.6). SECURITY DEFINER to read public.users.';
```
> `crm_inbound_messages` already has RLS enabled (migration 052, deny-all) — left as-is.

### 9c. Apply
MCP `apply_migration`: `064_assistant_rls`.

### 9d. Green — negative cross-agency test on a preview branch
Preferred: run against a Supabase preview branch (MCP `create_branch`) so RLS is exercised without touching prod. Seed two agencies + one partnership each, then assert an authenticated session scoped to agency A cannot read agency B's deal:
```sql
-- as service role: seed
insert into public.agencies (id,name) values
  ('00000000-0000-0000-0000-0000000000a1','A'),
  ('00000000-0000-0000-0000-0000000000b2','B');
insert into public.partnerships (id, agent_id, agency_id, brand_name, status)
  values (gen_random_uuid(), null, '00000000-0000-0000-0000-0000000000b2','Bco','proposal');

-- simulate an authenticated user in agency A (RLS on):
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','<A-auth-user-uuid>')::text, true);
select count(*) from public.partnerships
  where agency_id = '00000000-0000-0000-0000-0000000000b2';  -- expect 0 (B hidden from A)
reset role;
```
Expect `0`. Also confirm `relrowsecurity=true` on all six tables (re-run 9a query). Merge the branch (MCP `merge_branch`) only after the influencer/widget read paths are regression-checked (see open question).

### 9e. Commit
`feat(db): migration 064 — re-enable RLS + agency-scoped policies + current_agency_id() (P0 §6.6)`.

---

## Task 10 — Full P0 green + type-check gate

**Steps**
1. `npx vitest run tests/unit/assistant/` → all P0 unit suites green (idempotency, authz, provisioning, ledger, assert-agent-owns).
2. `npx vitest run tests/unit/crm-pricing.test.ts tests/unit/crm-wa-interpret.test.ts tests/unit/crm-influencer-match.test.ts` → unchanged CRM suites still green (no regression from the `WaAgent`/webhook select changes).
3. `npm run type-check` → clean (strict:false; ignoreBuildErrors is on for `next build`, so this is the real TS gate).
4. MCP `list_migrations` → confirms 061–064 recorded.

**Commit (if any lint/type fixups):** `chore(assistant): P0 foundations green — tenancy + ledger + idempotency + RLS`.

---

## What P0 hands to later phases
- **P1 (registry/planner/executor):** `assistant_actions`/`assistant_turns` + `claimTurn`/`claimBusinessKey`/`recordExecution`/`recordTurn`; `businessKey`/`requestKey`; `assertAgentOwns` + `authorizeOwnership`; `Caller` shape carrying `agency_id`/`agency_role`. Executor keeps money math in `computeTotals`.
- **P2 (gate/confirmation):** creates `pending_actions` (not built here); binds to `assistant_actions.status='awaiting_confirm'`.
- **P3 (memory):** creates `assistant_memory`/`assistant_facts`/`entity_alias`; talent prices already promoted to `talent_rate_cards`.
- **P4 (proactivity):** creates `assistant_events`/`proactive_messages`/`assistant_nag_policy`/`assistant_reminders`; provisioning already captures phone/gender/address_style.
- **P5 (integrations):** `integration_credentials` shape exists; wires encryption-at-rest + `addressesExternalParty` gate.
