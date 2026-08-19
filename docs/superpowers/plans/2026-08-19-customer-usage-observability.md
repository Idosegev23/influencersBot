# Customer Usage Observability (L0 + L1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Know, for every paying customer, whether each channel we sold them is actually installed and working — and see it on one screen.

**Architecture:** Persist the `Origin` header that `/api/widget/config` already receives and currently discards (an install signal independent of `ANALYTICS_WIDGET_SECRET`); route client-side widget errors through the existing `widget_events` buffer → drain → partition pipeline; add a manually-maintained `account_contracts` table as the source of truth for who pays and what was sold; roll all of it nightly into a durable `account_health_daily` table that a new `/admin/health` board reads.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase Postgres · Upstash Redis · Vitest · Tailwind 4

**Spec:** `docs/superpowers/specs/2026-08-19-customer-usage-observability-design.md`

## Global Constraints

- **Customers take no action.** The embed snippet is unversioned and `/widget.js` is served `Cache-Control: public, max-age=0, must-revalidate` (`next.config.ts:171`). Never introduce a change that requires a customer to re-paste, re-configure, or whitelist anything.
- **Never break the host page.** Every new line in `public/widget.js` goes inside `try/catch`. The widget must degrade silently on any failure of our own code.
- **Never 500 the widget.** Public widget routes always resolve — `/api/widget/events` returns 204 even on internal failure. New public routes follow that rule.
- **Never store end-user message text** in diagnostics or install rows. No cookies, no localStorage contents, no chat text.
- **Aggregate in Postgres.** PostgREST caps a row fetch at 1000. Any count over a potentially-large set goes through an RPC, never a JS `.length`.
- **`Vary: Origin`** on every CORS response whose headers echo the request origin. Omitting it lets a shared cache serve one customer's origin to another.
- Run tests with `npx vitest run <path>`. `npm run test` enters watch mode and hangs.
- Migrations are numbered sequentially in `supabase/migrations/`; the next free number is **078**.
- Commit straight to `main` and push. Stage only the files belonging to the task.

---

### Task 1: Migration 078 — the three new tables

**Files:**
- Create: `supabase/migrations/078_customer_health.sql`
- Test: verification query (run against the live DB after applying)

**Interfaces:**
- Consumes: nothing
- Produces: tables `account_contracts`, `install_pings`, `account_health_daily`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 078: Customer usage observability — install detection + health board.
-- Spec: docs/superpowers/specs/2026-08-19-customer-usage-observability-design.md §3
-- Plan: docs/superpowers/plans/2026-08-19-customer-usage-observability.md Task 1
--
-- NOTE ON account_contracts: this is the FIRST reliable record of who pays us.
-- accounts.plan is 'free' for every account except two demos marked 'pro', and
-- config.isDemo is inconsistent ('true' / 'false' / absent — the three most
-- active real customers all have it absent). Do not "fix" this by inferring
-- from config; inference is what produced that mess. Rows are added by hand.

create table if not exists public.account_contracts (
  account_id        uuid primary key references public.accounts(id) on delete cascade,
  is_paying         boolean not null default true,
  expected_channels text[] not null default '{}',
  contract_start    date,
  contract_end      date,
  trial_end         date,
  owner             text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint account_contracts_channels_valid check (
    expected_channels <@ array['widget','chat_page','whatsapp','instagram']::text[]
  )
);

-- One row per account + origin + DAY. Not per page view.
-- active_minutes is deliberately NOT called "hits": the 60s Redis dedupe window
-- means it counts minutes in which the widget loaded at least once. It saturates
-- at 1440 and says nothing about traffic volume. Traffic comes from
-- widget_events.widget_loaded. Never render this column as traffic.
create table if not exists public.install_pings (
  account_id     uuid not null references public.accounts(id) on delete cascade,
  origin         text not null,
  day            date not null,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  active_minutes int  not null default 1,
  widget_version text,
  sample_path    text,
  primary key (account_id, origin, day)
);

create index if not exists install_pings_acct_day on public.install_pings (account_id, day desc);

-- One row per account per CHANNEL per day — that is what lets a customer be
-- green on WhatsApp and red on the widget at the same time, which is the normal
-- case and the entire reason the checklist is per-channel.
create table if not exists public.account_health_daily (
  account_id       uuid not null references public.accounts(id) on delete cascade,
  date             date not null,
  channel          text not null check (channel in ('widget','chat_page','whatsapp','instagram')),
  status           text not null check (status in ('never_installed','silent','erroring','dormant','live')),
  active_minutes   int not null default 0,
  distinct_origins int not null default 0,
  loads            int not null default 0,
  opens            int not null default 0,
  messages         int not null default 0,
  sessions         int not null default 0,
  leads            int not null default 0,
  errors           int not null default 0,
  cost_usd         numeric(10,4) not null default 0,
  computed_at      timestamptz not null default now(),
  primary key (account_id, date, channel)
);

create index if not exists account_health_daily_date on public.account_health_daily (date desc);
```

- [ ] **Step 2: Apply it**

Apply via the Supabase MCP `apply_migration` tool with name `078_customer_health`, or `psql` against the project.

- [ ] **Step 3: Verify the tables exist with the right shape**

Run this query; all three names must come back, and `install_pings` must show `active_minutes` (NOT `hits`):

```sql
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema = 'public'
  and table_name in ('account_contracts','install_pings','account_health_daily')
group by table_name;
```

- [ ] **Step 4: Verify the channel constraint rejects garbage**

```sql
-- Must FAIL with a check-constraint violation:
insert into account_contracts (account_id, expected_channels)
values ((select id from accounts limit 1), array['telegram']);
```

Expected: `ERROR: new row violates check constraint "account_contracts_channels_valid"`. If it succeeds, the constraint is wrong — fix it before continuing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/078_customer_health.sql
git commit -m "feat(health): migration 078 — account_contracts, install_pings, account_health_daily"
```

---

### Task 2: Install-ping recorder

**Files:**
- Create: `src/lib/telemetry/install-ping.ts`
- Test: `tests/unit/telemetry/install-ping.test.ts`

**Interfaces:**
- Consumes: `redisSetNx`, `isRedisAvailable` from `@/lib/redis`; `supabase` from `@/lib/supabase`
- Produces:
  - `normalizeOrigin(originHeader: string | null, refererHeader: string | null): string | null`
  - `recordInstallPing(input: { accountId: string; origin: string | null; referer: string | null; path: string | null; widgetVersion: string | null }): Promise<'written' | 'deduped' | 'skipped'>`

**The trap this task exists to avoid:** `redisSetNx` returns `false` both when the key already exists *and* when Redis is unavailable (`src/lib/redis.ts:323` — every error path returns `false`). A naive `if (!gotLock) return;` would skip **every** write during a Redis outage, losing install detection exactly when we need it. Correctness must not depend on Redis: use `isRedisAvailable()` to tell the two cases apart, and write unconditionally when Redis is down. The upsert is idempotent on `(account_id, origin, day)`, so the cost is write volume, never data.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = { redisSetNx: vi.fn(), isRedisAvailable: vi.fn() };
const rpcMock = vi.fn();
vi.mock('@/lib/redis', () => redisMock);
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => rpcMock(...a) } }));

import { normalizeOrigin, recordInstallPing } from '@/lib/telemetry/install-ping';

describe('normalizeOrigin', () => {
  it('keeps scheme + host, drops path and port-less noise', () => {
    expect(normalizeOrigin('https://argania-oil.co.il', null)).toBe('https://argania-oil.co.il');
  });

  it('lowercases the host', () => {
    expect(normalizeOrigin('https://Argania-Oil.CO.IL', null)).toBe('https://argania-oil.co.il');
  });

  it('falls back to the Referer host when Origin is absent', () => {
    expect(normalizeOrigin(null, 'https://studiopasha.co.il/products/x?utm=1'))
      .toBe('https://studiopasha.co.il');
  });

  it('prefers Origin over Referer when both are present', () => {
    expect(normalizeOrigin('https://a.com', 'https://b.com/x')).toBe('https://a.com');
  });

  it('rejects the literal "null" origin sent by sandboxed iframes', () => {
    expect(normalizeOrigin('null', null)).toBeNull();
  });

  it('rejects non-http schemes', () => {
    expect(normalizeOrigin('file://', null)).toBeNull();
  });

  it('returns null when both headers are missing', () => {
    expect(normalizeOrigin(null, null)).toBeNull();
  });
});

describe('recordInstallPing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
  });

  it('writes when it wins the Redis dedupe window', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(true);
    const r = await recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null,
      path: '/products', widgetVersion: '4.0',
    });
    expect(r).toBe('written');
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it('skips the write when another request already claimed this minute', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(false);
    const r = await recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null, path: '/', widgetVersion: '4.0',
    });
    expect(r).toBe('deduped');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('STILL WRITES when Redis is unavailable — setNx also returns false there', async () => {
    redisMock.isRedisAvailable.mockReturnValue(false);
    redisMock.redisSetNx.mockResolvedValue(false);
    const r = await recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null, path: '/', widgetVersion: '4.0',
    });
    expect(r).toBe('written');
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it('skips entirely when no usable origin can be derived', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(true);
    const r = await recordInstallPing({
      accountId: 'acc-1', origin: null, referer: null, path: '/', widgetVersion: null,
    });
    expect(r).toBe('skipped');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('strips the query string from the sample path', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(true);
    await recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null,
      path: '/checkout?email=someone@example.com', widgetVersion: '4.0',
    });
    expect(rpcMock.mock.calls[0][1].p_sample_path).toBe('/checkout');
  });

  it('never throws when the database write fails', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(true);
    rpcMock.mockRejectedValue(new Error('db down'));
    await expect(recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null, path: '/', widgetVersion: '4.0',
    })).resolves.toBe('skipped');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/telemetry/install-ping.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/telemetry/install-ping"`

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Install-ping recorder.
 *
 * /api/widget/config receives the real Origin of every site embedding us and,
 * until now, threw it away. That header is the cheapest and most reliable proof
 * that a customer actually pasted the snippet — and unlike widget_events it does
 * not depend on ANALYTICS_WIDGET_SECRET being set, the env var whose absence
 * once caused a total widget-analytics blackout.
 */

import { redisSetNx, isRedisAvailable } from '@/lib/redis';
import { supabase } from '@/lib/supabase';

/** Scheme + lowercased host, or null when no usable origin exists. */
export function normalizeOrigin(
  originHeader: string | null,
  refererHeader: string | null,
): string | null {
  const candidate = originHeader && originHeader !== 'null' && originHeader !== '*'
    ? originHeader
    : refererHeader;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host.toLowerCase()}`;
  } catch {
    return null;
  }
}

function cleanPath(p: string | null): string | null {
  if (!p) return null;
  return p.split('?')[0].slice(0, 512);
}

export async function recordInstallPing(input: {
  accountId: string;
  origin: string | null;
  referer: string | null;
  path: string | null;
  widgetVersion: string | null;
}): Promise<'written' | 'deduped' | 'skipped'> {
  const origin = normalizeOrigin(input.origin, input.referer);
  if (!origin) return 'skipped';

  // One write per account+origin per minute. redisSetNx returns false BOTH when
  // the key exists AND when Redis is unavailable, so we must ask isRedisAvailable()
  // to tell those apart — otherwise a Redis outage silently disables install
  // detection. The upsert is idempotent on (account_id, origin, day), so writing
  // during an outage costs volume, never correctness.
  const minute = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  const claimed = await redisSetNx(`wping:${input.accountId}:${origin}:${minute}`, '1', 60);
  if (!claimed && isRedisAvailable()) return 'deduped';

  try {
    const { error } = await supabase.rpc('upsert_install_ping', {
      p_account_id: input.accountId,
      p_origin: origin,
      p_widget_version: input.widgetVersion,
      p_sample_path: cleanPath(input.path),
    });
    if (error) {
      console.error('[install-ping] upsert failed:', error.message);
      return 'skipped';
    }
    return 'written';
  } catch (e: any) {
    console.error('[install-ping] upsert threw:', e?.message);
    return 'skipped';
  }
}
```

- [ ] **Step 4: Add the `upsert_install_ping` RPC**

Append to `supabase/migrations/078_customer_health.sql` and re-apply:

```sql
create or replace function public.upsert_install_ping(
  p_account_id uuid,
  p_origin text,
  p_widget_version text,
  p_sample_path text
) returns void language plpgsql security definer as $$
begin
  insert into public.install_pings
    (account_id, origin, day, first_seen_at, last_seen_at, active_minutes, widget_version, sample_path)
  values
    (p_account_id, p_origin, current_date, now(), now(), 1, p_widget_version, p_sample_path)
  on conflict (account_id, origin, day) do update set
    last_seen_at   = now(),
    active_minutes = public.install_pings.active_minutes + 1,
    widget_version = coalesce(excluded.widget_version, public.install_pings.widget_version),
    sample_path    = coalesce(public.install_pings.sample_path, excluded.sample_path);
end $$;
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/telemetry/install-ping.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/telemetry/install-ping.ts tests/unit/telemetry/install-ping.test.ts supabase/migrations/078_customer_health.sql
git commit -m "feat(health): install-ping recorder with Redis-outage-safe dedupe"
```

---

### Task 3: Wire the beacon into `/api/widget/config`

**Files:**
- Modify: `src/app/api/widget/config/route.ts`
- Test: `tests/unit/telemetry/config-beacon.test.ts`

**Interfaces:**
- Consumes: `recordInstallPing` from Task 2
- Produces: nothing new — the config response is byte-identical

The ping runs inside `after()` from `next/server` (already used in this repo, e.g. `src/app/api/chat/init/route.ts:151`) so it adds zero latency to the request a customer's visitor is waiting on.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const pingMock = vi.fn().mockResolvedValue('written');
vi.mock('@/lib/telemetry/install-ping', () => ({ recordInstallPing: pingMock }));

// after() runs its callback immediately in tests so we can assert on it.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server');
  return { ...actual, after: (fn: any) => fn() };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'acc-1', config: {} } }) }) }),
    }),
  }),
}));

import { GET } from '@/app/api/widget/config/route';

describe('widget/config install beacon', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a ping carrying the request Origin', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/config?accountId=acc-1', {
      headers: { origin: 'https://argania-oil.co.il', referer: 'https://argania-oil.co.il/shop' },
    });
    await GET(req);
    expect(pingMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1', origin: 'https://argania-oil.co.il' }),
    );
  });

  it('still returns 200 when the ping throws', async () => {
    pingMock.mockRejectedValueOnce(new Error('boom'));
    const req = new NextRequest('https://bestie.app/api/widget/config?accountId=acc-1', {
      headers: { origin: 'https://argania-oil.co.il' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('does not ping when accountId is missing', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/config');
    await GET(req);
    expect(pingMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/telemetry/config-beacon.test.ts`
Expected: FAIL — the ping is never called.

- [ ] **Step 3: Wire it in**

In `src/app/api/widget/config/route.ts`, extend the import on line 6 and add the beacon immediately before the successful `NextResponse.json(...)` return:

```typescript
import { NextRequest, NextResponse, after } from 'next/server';
import { recordInstallPing } from '@/lib/telemetry/install-ping';
```

```typescript
    // Install beacon. Runs after the response is sent so it costs the visitor
    // nothing, and is wrapped so a telemetry failure can never affect the widget.
    after(async () => {
      try {
        await recordInstallPing({
          accountId,
          origin: req.headers.get('origin'),
          referer: req.headers.get('referer'),
          path: (() => {
            const r = req.headers.get('referer');
            if (!r) return null;
            try { return new URL(r).pathname; } catch { return null; }
          })(),
          widgetVersion: req.nextUrl.searchParams.get('v'),
        });
      } catch (e: any) {
        console.error('[widget/config] install beacon failed:', e?.message);
      }
    });
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/telemetry/config-beacon.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Confirm nothing else in the config route regressed**

Run: `npx vitest run tests/unit/widget/`
Expected: PASS, no new failures

- [ ] **Step 6: Commit**

```bash
git add src/app/api/widget/config/route.ts tests/unit/telemetry/config-beacon.test.ts
git commit -m "feat(health): record an install ping from every widget config request"
```

---

### Task 4: Diagnostics ingest endpoint

**Files:**
- Modify: `src/lib/analytics/widget-events.ts:1-9` (extend `WIDGET_EVENT_TYPES`)
- Create: `src/lib/telemetry/diagnostics.ts`
- Create: `src/app/api/widget/diagnostics/route.ts`
- Modify: `middleware.ts:21-26` and `middleware.ts:206-230` (dedicated rate-limit bucket)
- Test: `tests/unit/telemetry/diagnostics.test.ts`

**Interfaces:**
- Consumes: `normalizeWidgetEvents`, `bufferKey` from `@/lib/analytics/widget-events`; `redisRPush` from `@/lib/redis`
- Produces: `sanitizeDiagnostic(raw: unknown): { type: string; payload: Record<string, unknown> } | null`

**Why this endpoint is unauthenticated, on purpose:** when `/api/widget/config` fails, the widget never receives an analytics token, so it *cannot* report that failure through the token-gated `/api/widget/events`. The single most important failure to catch is structurally unreportable by the existing pipeline. The compensating controls are the narrow rate limit, the account-existence check, and the 2KB payload cap.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const rpushMock = vi.fn().mockResolvedValue(1);
vi.mock('@/lib/redis', () => ({ redisRPush: rpushMock }));

const maybeSingleMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }) },
}));

import { sanitizeDiagnostic } from '@/lib/telemetry/diagnostics';
import { POST, OPTIONS } from '@/app/api/widget/diagnostics/route';
import { WIDGET_EVENT_TYPES } from '@/lib/analytics/widget-events';

describe('WIDGET_EVENT_TYPES', () => {
  it('accepts the three diagnostic types so they ride the existing drain', () => {
    expect(WIDGET_EVENT_TYPES.has('client_error')).toBe(true);
    expect(WIDGET_EVENT_TYPES.has('config_load_failed')).toBe(true);
    expect(WIDGET_EVENT_TYPES.has('csp_blocked')).toBe(true);
  });
});

describe('sanitizeDiagnostic', () => {
  it('keeps a well-formed report', () => {
    const out = sanitizeDiagnostic({
      type: 'client_error', message: 'x is not a function',
      stack: 'a\nb\nc\nd\ne', filename: 'https://bestie.app/widget.js',
      line: 42, widgetVersion: '4.0',
    });
    expect(out?.type).toBe('client_error');
    expect(out?.payload.message).toBe('x is not a function');
  });

  it('trims the stack to three frames', () => {
    const out = sanitizeDiagnostic({ type: 'client_error', message: 'm', stack: 'a\nb\nc\nd\ne' });
    expect(out?.payload.stack).toBe('a\nb\nc');
  });

  it('truncates a long message', () => {
    const out = sanitizeDiagnostic({ type: 'client_error', message: 'z'.repeat(5000) });
    expect((out?.payload.message as string).length).toBe(500);
  });

  it('rejects an unknown diagnostic type', () => {
    expect(sanitizeDiagnostic({ type: 'widget_opened', message: 'm' })).toBeNull();
  });

  it('rejects a report with no message', () => {
    expect(sanitizeDiagnostic({ type: 'client_error' })).toBeNull();
  });

  it('drops any field we did not ask for — no user text can smuggle through', () => {
    const out = sanitizeDiagnostic({
      type: 'client_error', message: 'm',
      chatText: 'my credit card is 4111 1111 1111 1111', cookie: 'session=abc',
    });
    expect(Object.keys(out!.payload).sort())
      .toEqual(['filename', 'line', 'message', 'stack', 'ua', 'widgetVersion'].sort());
  });
});

describe('POST /api/widget/diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingleMock.mockResolvedValue({ data: { id: 'acc-1' } });
  });

  it('buffers a valid report and returns 204', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'POST',
      headers: { origin: 'https://argania-oil.co.il', 'content-type': 'text/plain' },
      body: JSON.stringify({ accountId: 'acc-1', type: 'client_error', message: 'boom' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(rpushMock).toHaveBeenCalledOnce();
  });

  it('rejects an unknown accountId without writing', async () => {
    maybeSingleMock.mockResolvedValue({ data: null });
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ accountId: 'nope', type: 'client_error', message: 'boom' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(204);          // never leak existence, never 500 the widget
    expect(rpushMock).not.toHaveBeenCalled();
  });

  it('rejects a payload over 2KB without writing', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ accountId: 'acc-1', type: 'client_error', message: 'z'.repeat(4000) }),
    });
    await POST(req);
    expect(rpushMock).not.toHaveBeenCalled();
  });

  it('returns 204 rather than 500 on malformed JSON', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'not json',
    });
    expect((await POST(req)).status).toBe(204);
  });

  it('echoes the origin and sets Vary', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/diagnostics', {
      method: 'OPTIONS', headers: { origin: 'https://argania-oil.co.il' },
    });
    const res = await OPTIONS(req);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://argania-oil.co.il');
    expect(res.headers.get('vary')).toBe('Origin');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/telemetry/diagnostics.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Extend the accepted event types**

In `src/lib/analytics/widget-events.ts`, add to the `WIDGET_EVENT_TYPES` set (after the existing widget funnel line) and export it:

```typescript
export const WIDGET_EVENT_TYPES = new Set<string>([
  'page_view','session_start','session_end',
  'scroll_depth','time_on_page','exit_intent','tab_visibility',
  'product_view','cart_state','cart_change','checkout_reached','purchase',
  'click','internal_nav','external_link_click',
  // existing funnel events also flow here now
  'widget_loaded','widget_opened','widget_closed','widget_message_sent','widget_message_received',
  // diagnostics (migration 078 / Task 4) — these ride the same buffer → drain →
  // partition path, so client errors inherit the 90-day retention for free.
  'client_error','config_load_failed','csp_blocked',
]);
```

- [ ] **Step 4: Write the sanitizer**

```typescript
/**
 * Diagnostics payload sanitizer.
 *
 * This endpoint is unauthenticated by necessity (see the route), so the payload
 * is untrusted. Allow-list, never deny-list: we build the stored object from a
 * fixed set of known keys so nothing a caller invents — chat text, cookies, form
 * values — can reach our database.
 */

const DIAGNOSTIC_TYPES = new Set(['client_error', 'config_load_failed', 'csp_blocked']);
const MAX_MESSAGE = 500;
const MAX_STACK_FRAMES = 3;

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v ? v.slice(0, max) : null;
}

export function sanitizeDiagnostic(
  raw: unknown,
): { type: string; payload: Record<string, unknown> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const type = typeof r.type === 'string' ? r.type : '';
  if (!DIAGNOSTIC_TYPES.has(type)) return null;

  const message = str(r.message, MAX_MESSAGE);
  if (!message) return null;

  const stack = typeof r.stack === 'string'
    ? r.stack.split('\n').slice(0, MAX_STACK_FRAMES).join('\n').slice(0, 1000)
    : null;

  return {
    type,
    payload: {
      message,
      stack,
      filename: str(r.filename, 300),
      line: typeof r.line === 'number' && Number.isFinite(r.line) ? r.line : null,
      widgetVersion: str(r.widgetVersion, 20),
      ua: str(r.ua, 300),
    },
  };
}
```

- [ ] **Step 5: Write the route**

```typescript
/**
 * Widget Diagnostics — POST /api/widget/diagnostics
 *
 * Deliberately UNAUTHENTICATED. When /api/widget/config fails, the widget never
 * receives an analytics token and therefore cannot report that failure through
 * the token-gated /api/widget/events. The most important failure to catch is the
 * one the existing pipeline structurally cannot report.
 *
 * Compensating controls: a narrow rate-limit bucket in middleware.ts, an
 * account-existence check, a 2KB body cap, and an allow-list sanitizer.
 *
 * Like every public widget route, this never 500s and never reveals whether an
 * account exists — all outcomes are 204.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redisRPush } from '@/lib/redis';
import { bufferKey } from '@/lib/analytics/widget-events';
import { sanitizeDiagnostic } from '@/lib/telemetry/diagnostics';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 2048;

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin') || '*');
  try {
    // sendBeacon defaults to text/plain, so read as text and parse ourselves.
    const text = await req.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      return new Response(null, { status: 204, headers });
    }

    const body = JSON.parse(text) as Record<string, unknown>;
    const accountId = typeof body.accountId === 'string' ? body.accountId : '';
    if (!accountId) return new Response(null, { status: 204, headers });

    const clean = sanitizeDiagnostic(body);
    if (!clean) return new Response(null, { status: 204, headers });

    const { data } = await supabase.from('accounts').select('id').eq('id', accountId).maybeSingle();
    if (!data) return new Response(null, { status: 204, headers });

    await redisRPush(bufferKey(), [JSON.stringify({
      account_id: accountId,
      anon_id: null,
      session_id: null,
      event_uid: null,
      type: clean.type,
      path: typeof body.path === 'string' ? body.path.split('?')[0].slice(0, 512) : null,
      payload: clean.payload,
      created_at: new Date().toISOString(),
    })]);

    return new Response(null, { status: 204, headers });
  } catch {
    // Never 500 the widget — diagnostics is best-effort by definition.
    return new Response(null, { status: 204, headers });
  }
}
```

- [ ] **Step 6: Add the narrow rate-limit bucket**

In `middleware.ts`, add to `RATE_LIMITS` (around line 26):

```typescript
  // Unauthenticated write path — far tighter than the general widget bucket.
  widgetDiagnostics: { windowMs: 60 * 1000, maxRequests: 20 },
```

and in the path dispatch (around line 212), **before** the general `/api/widget` branch so it is not shadowed:

```typescript
    if (pathname.startsWith('/api/widget/diagnostics')) {
      config = RATE_LIMITS.widgetDiagnostics;
    } else if (pathname.startsWith('/api/widget')) {
      config = RATE_LIMITS.widget;
    }
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/telemetry/diagnostics.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 8: Confirm the drain still accepts the wider type set**

Run: `npx vitest run tests/unit/widget/widget-events-validate.test.ts`
Expected: PASS

- [ ] **Step 9: Verify the GDPR deletion path (spec §7)**

The spec's analysis says `gdpr/delete-data` needs no change, because diagnostics rows carry no token and therefore no `anon_id`, and `install_pings` holds domains rather than personal data. **The spec explicitly requires verifying that against the route rather than trusting the analysis.** Read `src/app/api/gdpr/delete-data/route.ts` and confirm:

1. It deletes from `widget_events` by `anon_id` — and that our diagnostic rows have `anon_id: null`, so a subject-deletion request cannot be expected to match them (nothing personal to match on).
2. It does not need a new clause for `install_pings`.

If either assumption is false, add the missing deletion clause **in this task** and record what changed. Do not defer it.

- [ ] **Step 10: Commit**

```bash
git add src/lib/telemetry/diagnostics.ts src/app/api/widget/diagnostics/route.ts src/lib/analytics/widget-events.ts middleware.ts tests/unit/telemetry/diagnostics.test.ts
git commit -m "feat(health): unauthenticated widget diagnostics ingest with allow-list sanitizer"
```

---

### Task 5: Widget-side error reporting and version stamp

**Files:**
- Modify: `public/widget.js` (add reporter near the top of the IIFE; stamp version at the `widget_loaded` call, `public/widget.js:1161`; add explicit reports at the config fetch, `public/widget.js:1097`)

**Interfaces:**
- Consumes: `POST /api/widget/diagnostics` from Task 4
- Produces: nothing consumed by later tasks

**On testing, honestly:** `public/widget.js` is a standalone IIFE served as a static asset. It is not importable, and there is no precedent in `tests/unit/widget/` for evaluating it — every existing test there covers server-side libraries. Building a jsdom harness that `eval`s a 4,000-line file with stubbed globals would be brittle enough to produce false confidence. This task is therefore verified **manually**, with exact steps below. The server side that receives these reports is fully covered by Task 4.

- [ ] **Step 1: Add the reporter near the top of the IIFE**

Place immediately after `ACCOUNT_ID` and `BASE_URL` are resolved:

```javascript
  // ---- Diagnostics reporter -------------------------------------------------
  // widget.js swallows every error on purpose (we must never break the host
  // page), which historically left us totally blind to failures at the customer.
  // This reports them out-of-band. Capped and deduped so a render loop cannot
  // flood us, and it can never itself throw.
  var DIAG_CAP = 5;
  var diagSent = 0;
  var diagSeen = {};

  function report(type, detail) {
    try {
      if (diagSent >= DIAG_CAP) return;
      var msg = String((detail && detail.message) || detail || '').slice(0, 500);
      if (!msg) return;
      if (diagSeen[msg]) return;
      diagSeen[msg] = 1;
      diagSent++;
      var body = JSON.stringify({
        accountId: ACCOUNT_ID,
        type: type,
        message: msg,
        stack: (detail && detail.stack) || null,
        filename: (detail && detail.filename) || null,
        line: (detail && detail.line) || null,
        widgetVersion: WIDGET_VERSION,
        ua: navigator.userAgent,
        path: location.pathname
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BASE_URL + '/api/widget/diagnostics', body);
      } else {
        fetch(BASE_URL + '/api/widget/diagnostics', {
          method: 'POST', body: body, keepalive: true
        }).catch(function () { /* fire-and-forget */ });
      }
    } catch (e) { /* diagnostics must never break anything, including itself */ }
  }

  // Only OUR script. Without this filter we would collect the host page's own
  // exceptions — their code, and potentially their users' data.
  try {
    window.addEventListener('error', function (ev) {
      try {
        if (!ev || !ev.filename || ev.filename.indexOf('/widget.js') === -1) return;
        report('client_error', {
          message: ev.message, filename: ev.filename, line: ev.lineno,
          stack: ev.error && ev.error.stack
        });
      } catch (e) { /* */ }
    });
    window.addEventListener('unhandledrejection', function (ev) {
      try {
        var r = ev && ev.reason;
        if (!r || !r.stack || r.stack.indexOf('/widget.js') === -1) return;
        report('client_error', { message: r.message || String(r), stack: r.stack });
      } catch (e) { /* */ }
    });
  } catch (e) { /* */ }
```

- [ ] **Step 2: Promote the version to a constant and stamp it**

`public/widget.js:541` currently inlines `widget_version: '4.0'`. Hoist it to a single constant declared beside `DIAG_CAP`:

```javascript
  var WIDGET_VERSION = '4.0';
```

Replace the literal at line 541 with `WIDGET_VERSION`, and add it to the `widget_loaded` payload at line 1161 so the rollup can break traffic down by snippet version:

```javascript
      widgetTrack('widget_loaded', { modules: modules, widget_version: WIDGET_VERSION });
```

- [ ] **Step 3: Report the config-fetch failure explicitly**

At `public/widget.js:1097`, attach handlers to the config fetch. This is the case the token-gated pipeline can never report, so it must be reported here:

```javascript
  fetch(BASE_URL + '/api/widget/config?accountId=' + ACCOUNT_ID + '&v=' + WIDGET_VERSION)
    .then(function (r) {
      if (!r.ok) report('config_load_failed', { message: 'config HTTP ' + r.status });
      return r;
    })
    .catch(function (e) {
      report('config_load_failed', { message: (e && e.message) || 'config fetch failed' });
      throw e;
    })
```

Note the added `&v=` — Task 3 reads `widgetVersion` from that query parameter.

- [ ] **Step 4: Verify manually against a real preview**

1. `npm run dev`
2. Open `/api/widget/preview/<accountId>` for any account (this route injects the widget tag — `src/app/api/widget/preview/[accountId]/route.ts:156`).
3. In DevTools → Network, confirm the config request now carries `&v=4.0`.
4. In the console run `throw new Error('diag smoke test')` **from within widget.js scope** — simplest reliable trigger: temporarily add `setTimeout(function(){ null.x; }, 2000)` inside the IIFE, reload, then remove it.
5. Confirm a `POST /api/widget/diagnostics` fires and returns 204.
6. Confirm the row lands: wait one minute for `widget-events-drain`, then
   `select type, payload->>'message' from widget_events where type = 'client_error' order by created_at desc limit 5;`
7. Reload 10 times with the error still in place and confirm **at most 5** reports per load and no duplicate messages within a load.

- [ ] **Step 5: Verify the host page is unaffected**

On the preview page, confirm zero uncaught errors originating from `widget.js` in the console, and that the page renders identically with the widget script removed.

- [ ] **Step 6: Commit**

```bash
git add public/widget.js
git commit -m "feat(widget): report our own client-side errors out-of-band, stamp script version"
```

---

### Task 6: Bot give-up events

**Files:**
- Modify: `src/lib/chatbot/sandwich-bot-hybrid.ts` (call sites determined in Step 1)
- Create: `src/lib/telemetry/bot-quality.ts`
- Test: `tests/unit/telemetry/bot-quality.test.ts`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase`
- Produces: `recordBotGaveUp(input: { accountId: string; sessionId: string | null; surface: 'widget' | 'chat'; reason: BotGiveUpReason }): Promise<void>` where `type BotGiveUpReason = 'no_knowledge' | 'empty_response' | 'tool_failure' | 'llm_error'`

**This task begins with a survey, deliberately.** The spec did not enumerate the give-up sites because guessing them would have been dishonest. The fallbacks in `complaint-classifier.ts` and `knowledge-retrieval.ts` are *retrieval* degradations — the bot still answers something reasonable — and instrumenting those would produce noise, not signal.

- [ ] **Step 1: Survey the real give-up sites**

Read `src/lib/chatbot/sandwich-bot-hybrid.ts` end to end and list every point where the bot returns a response it did not actually derive from knowledge. Search aids:

```bash
grep -n "return\s*{" src/lib/chatbot/sandwich-bot-hybrid.ts | head -40
grep -rn "catch" src/lib/chatbot/sandwich-bot-hybrid.ts
```

Classify each into exactly one of the four `BotGiveUpReason` values. Write the list into this plan file under this step before writing any code — a later reviewer needs to see what was instrumented and what was consciously left alone.

- [ ] **Step 2: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ insert: insertMock }) } }));

import { recordBotGaveUp } from '@/lib/telemetry/bot-quality';

describe('recordBotGaveUp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes one events row with the surface as mode', async () => {
    await recordBotGaveUp({
      accountId: 'acc-1', sessionId: 'sess-1', surface: 'widget', reason: 'no_knowledge',
    });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      account_id: 'acc-1', session_id: 'sess-1', type: 'bot_no_answer', mode: 'widget',
    }));
  });

  it('carries the reason in the payload, never any user text', async () => {
    await recordBotGaveUp({
      accountId: 'acc-1', sessionId: null, surface: 'chat', reason: 'tool_failure',
    });
    const row = insertMock.mock.calls[0][0];
    expect(row.payload).toEqual({ reason: 'tool_failure' });
  });

  it('never throws when the insert fails — telemetry must not break a reply', async () => {
    insertMock.mockRejectedValueOnce(new Error('db down'));
    await expect(recordBotGaveUp({
      accountId: 'acc-1', sessionId: null, surface: 'chat', reason: 'llm_error',
    })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/telemetry/bot-quality.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```typescript
/**
 * Bot give-up telemetry.
 *
 * Records the points where the bot returned a reply it did not derive from
 * knowledge. This is an early churn signal: a customer whose bot disappoints
 * stops using it long before they say anything.
 *
 * Deliberately NOT wired into the retrieval fallbacks in knowledge-retrieval.ts
 * or complaint-classifier.ts — those degrade retrieval but still answer well,
 * and instrumenting them would bury the real signal in noise.
 */

import { supabase } from '@/lib/supabase';

export type BotGiveUpReason = 'no_knowledge' | 'empty_response' | 'tool_failure' | 'llm_error';

export async function recordBotGaveUp(input: {
  accountId: string;
  sessionId: string | null;
  surface: 'widget' | 'chat';
  reason: BotGiveUpReason;
}): Promise<void> {
  try {
    await supabase.from('events').insert({
      account_id: input.accountId,
      session_id: input.sessionId,
      type: 'bot_no_answer',
      category: 'quality',
      mode: input.surface,
      payload: { reason: input.reason },
    });
  } catch (e: any) {
    console.error('[bot-quality] insert failed:', e?.message);
  }
}
```

- [ ] **Step 5: Wire the call sites found in Step 1**

At each site, `await recordBotGaveUp({...})` before returning. Never inside the response-critical path in a way that can throw — the function already swallows its own errors.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/telemetry/bot-quality.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 7: Confirm the chatbot suite still passes**

Run: `npx vitest run tests/unit/`
Expected: no new failures versus the pre-task baseline

- [ ] **Step 8: Commit**

```bash
git add src/lib/telemetry/bot-quality.ts src/lib/chatbot/sandwich-bot-hybrid.ts tests/unit/telemetry/bot-quality.test.ts
git commit -m "feat(health): record where the bot gives up as a churn signal"
```

---

### Task 7: Channel status derivation

**Files:**
- Create: `src/lib/health/status.ts`
- Test: `tests/unit/health/status.test.ts`

**Interfaces:**
- Consumes: nothing — pure, no I/O
- Produces:
  - `type ChannelStatus = 'never_installed' | 'silent' | 'erroring' | 'dormant' | 'live'`
  - `interface ChannelFacts { everPinged: boolean; hoursSinceLastPing: number | null; opensLast7d: number; errorsLast24h: number; loadsLast24h: number }`
  - `interface StatusThresholds { liveHours: number; silentDays: number; dormantDays: number; errorCount: number; errorRatio: number }`
  - `DEFAULT_THRESHOLDS: StatusThresholds`
  - `deriveChannelStatus(facts: ChannelFacts, t?: StatusThresholds): ChannelStatus`

This function is pure specifically so it can be exhaustively table-tested. It is the one piece of this subsystem where a subtle mistake silently misinforms every decision made from the board.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { deriveChannelStatus, DEFAULT_THRESHOLDS } from '@/lib/health/status';
import type { ChannelFacts } from '@/lib/health/status';

const facts = (o: Partial<ChannelFacts> = {}): ChannelFacts => ({
  everPinged: true, hoursSinceLastPing: 1, opensLast7d: 10,
  errorsLast24h: 0, loadsLast24h: 100, ...o,
});

describe('deriveChannelStatus', () => {
  it('never_installed when there has never been a ping', () => {
    expect(deriveChannelStatus(facts({ everPinged: false, hoursSinceLastPing: null })))
      .toBe('never_installed');
  });

  it('live when pinged within 24h and otherwise healthy', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 23 }))).toBe('live');
  });

  it('silent after 3 days with no ping', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 73 }))).toBe('silent');
  });

  it('still live at exactly 24h — the boundary is inclusive', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 24 }))).toBe('live');
  });

  it('not yet silent at exactly 72h', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 72 }))).toBe('live');
  });

  it('erroring needs BOTH a raw count and a ratio', () => {
    expect(deriveChannelStatus(facts({ errorsLast24h: 25, loadsLast24h: 100 }))).toBe('erroring');
  });

  it('is not erroring on a high count at low ratio — a busy account would drown in noise', () => {
    expect(deriveChannelStatus(facts({ errorsLast24h: 25, loadsLast24h: 100000 }))).toBe('live');
  });

  it('is not erroring on a high ratio at trivial volume', () => {
    expect(deriveChannelStatus(facts({ errorsLast24h: 1, loadsLast24h: 3 }))).toBe('live');
  });

  it('dormant when running for 7 days with zero opens', () => {
    expect(deriveChannelStatus(facts({ opensLast7d: 0 }))).toBe('dormant');
  });

  it('PRECEDENCE: never_installed beats everything', () => {
    expect(deriveChannelStatus(facts({
      everPinged: false, hoursSinceLastPing: null, opensLast7d: 0,
      errorsLast24h: 999, loadsLast24h: 1000,
    }))).toBe('never_installed');
  });

  it('PRECEDENCE: silent beats erroring', () => {
    expect(deriveChannelStatus(facts({
      hoursSinceLastPing: 100, errorsLast24h: 50, loadsLast24h: 100,
    }))).toBe('silent');
  });

  it('PRECEDENCE: erroring beats dormant — the errors are usually the CAUSE of the dormancy', () => {
    expect(deriveChannelStatus(facts({
      opensLast7d: 0, errorsLast24h: 50, loadsLast24h: 100,
    }))).toBe('erroring');
  });

  it('treats a null hoursSinceLastPing with everPinged=true as silent, not live', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: null }))).toBe('silent');
  });

  it('honours overridden thresholds', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 30 }),
      { ...DEFAULT_THRESHOLDS, liveHours: 12, silentDays: 1 })).toBe('silent');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/health/status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Channel health status derivation. Pure — no I/O — so every transition can be
 * table-tested. A subtle mistake here silently misinforms every decision made
 * from the health board.
 */

export type ChannelStatus = 'never_installed' | 'silent' | 'erroring' | 'dormant' | 'live';

export interface ChannelFacts {
  everPinged: boolean;
  hoursSinceLastPing: number | null;
  opensLast7d: number;
  errorsLast24h: number;
  loadsLast24h: number;
}

export interface StatusThresholds {
  liveHours: number;
  silentDays: number;
  dormantDays: number;
  errorCount: number;
  errorRatio: number;
}

export const DEFAULT_THRESHOLDS: StatusThresholds = {
  liveHours: 24,
  silentDays: 3,
  dormantDays: 7,
  errorCount: 20,
  errorRatio: 0.05,
};

/**
 * Precedence — first match wins:
 *   never_installed → silent → erroring → dormant → live
 *
 * Absence beats brokenness: there is nothing to fix if it was never installed.
 * Brokenness beats disuse: `erroring` is very often the CAUSE of `dormant`
 * (a widget that throws on open records loads but no opens), and reporting the
 * symptom would hide the reason.
 */
export function deriveChannelStatus(
  facts: ChannelFacts,
  t: StatusThresholds = DEFAULT_THRESHOLDS,
): ChannelStatus {
  if (!facts.everPinged) return 'never_installed';

  const hours = facts.hoursSinceLastPing;
  // everPinged with an unknown last-ping time means the ping is older than our
  // lookback window — that is silence, not health.
  if (hours === null || hours > t.silentDays * 24) return 'silent';

  const ratio = facts.loadsLast24h > 0 ? facts.errorsLast24h / facts.loadsLast24h : 0;
  if (facts.errorsLast24h >= t.errorCount && ratio >= t.errorRatio) return 'erroring';

  if (facts.opensLast7d === 0) return 'dormant';

  return 'live';
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/health/status.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/health/status.ts tests/unit/health/status.test.ts
git commit -m "feat(health): pure channel status derivation with explicit precedence"
```

---

### Task 8: Nightly rollup cron and historical backfill

**Files:**
- Create: `src/lib/health/rollup.ts`
- Create: `src/app/api/cron/account-health-rollup/route.ts`
- Create: `scripts/backfill-install-history.ts`
- Modify: `vercel.json` (add the cron entry)
- Test: `tests/unit/health/rollup.test.ts`

**Interfaces:**
- Consumes: `deriveChannelStatus`, `DEFAULT_THRESHOLDS` from Task 7
- Produces: `rollupAccountHealth(day: string): Promise<{ accounts: number; rows: number }>`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const upsertMock = vi.fn().mockResolvedValue({ error: null });
const contractsMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: any[]) => rpcMock(...a),
    from: (table: string) => table === 'account_contracts'
      ? { select: () => ({ eq: contractsMock }) }
      : { upsert: upsertMock },
  },
}));

import { rollupAccountHealth } from '@/lib/health/rollup';

describe('rollupAccountHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contractsMock.mockResolvedValue({
      data: [{ account_id: 'acc-1', expected_channels: ['widget', 'whatsapp'] }],
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: { widget: { everPinged: true, hoursSinceLastPing: 2, opensLast7d: 5, errorsLast24h: 0, loadsLast24h: 100 },
              whatsapp: { everPinged: false, hoursSinceLastPing: null, opensLast7d: 0, errorsLast24h: 0, loadsLast24h: 0 } },
      error: null,
    });
  });

  it('writes one row per expected channel, not one per account', async () => {
    const r = await rollupAccountHealth('2026-08-19');
    expect(r).toEqual({ accounts: 1, rows: 2 });
    const rows = upsertMock.mock.calls[0][0];
    expect(rows.map((x: any) => x.channel).sort()).toEqual(['whatsapp', 'widget']);
  });

  it('derives a different status per channel for the same account', async () => {
    await rollupAccountHealth('2026-08-19');
    const rows = upsertMock.mock.calls[0][0];
    expect(rows.find((x: any) => x.channel === 'widget').status).toBe('live');
    expect(rows.find((x: any) => x.channel === 'whatsapp').status).toBe('never_installed');
  });

  it('ignores channels that were never sold', async () => {
    await rollupAccountHealth('2026-08-19');
    const rows = upsertMock.mock.calls[0][0];
    expect(rows.some((x: any) => x.channel === 'instagram')).toBe(false);
  });

  it('skips accounts with no contract row entirely', async () => {
    contractsMock.mockResolvedValue({ data: [], error: null });
    const r = await rollupAccountHealth('2026-08-19');
    expect(r).toEqual({ accounts: 0, rows: 0 });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('upserts on the composite key so a re-run is idempotent', async () => {
    await rollupAccountHealth('2026-08-19');
    expect(upsertMock.mock.calls[0][1]).toEqual({ onConflict: 'account_id,date,channel' });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/health/rollup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the facts RPC**

Append to `supabase/migrations/078_customer_health.sql` and re-apply. Aggregation happens in Postgres because PostgREST truncates a row fetch at 1000 — the bug that silently capped counts for high-volume accounts before:

```sql
-- Returns per-channel raw facts for one account and day, as a single jsonb
-- object keyed by channel. Aggregated in Postgres, never in JS.
create or replace function public.account_health_facts(p_account_id uuid, p_day date)
returns jsonb language sql stable as $$
  with ping as (
    select max(last_seen_at) as last_seen,
           bool_or(true)     as ever,
           count(distinct origin) as origins,
           coalesce(sum(active_minutes), 0) as minutes
    from public.install_pings
    where account_id = p_account_id and day <= p_day
  ),
  wev as (
    select count(*) filter (where type = 'widget_loaded'
             and created_at > (p_day + 1)::timestamptz - interval '24 hours') as loads_24h,
           count(*) filter (where type = 'widget_opened'
             and created_at > (p_day + 1)::timestamptz - interval '7 days')    as opens_7d,
           count(*) filter (where type in ('client_error','config_load_failed','csp_blocked')
             and created_at > (p_day + 1)::timestamptz - interval '24 hours') as errors_24h,
           count(*) filter (where type = 'widget_message_sent'
             and created_at::date = p_day)                                    as messages
    from public.widget_events
    where account_id = p_account_id and created_at > (p_day + 1)::timestamptz - interval '8 days'
  ),
  sess as (
    select count(*) as n from public.chat_sessions
    where account_id = p_account_id and created_at::date = p_day
  ),
  wa as (
    select count(*) as n, max(last_activity_at) as last_seen
    from public.whatsapp_cs_sessions
    where active_account_id = p_account_id and last_activity_at::date = p_day
  )
  select jsonb_build_object(
    'widget', jsonb_build_object(
      'everPinged', coalesce((select ever from ping), false),
      'hoursSinceLastPing', (select extract(epoch from (now() - last_seen)) / 3600 from ping),
      'opensLast7d', (select opens_7d from wev),
      'errorsLast24h', (select errors_24h from wev),
      'loadsLast24h', (select loads_24h from wev),
      'activeMinutes', (select minutes from ping),
      'distinctOrigins', (select origins from ping),
      'messages', (select messages from wev),
      'sessions', (select n from sess)
    ),
    'chat_page', jsonb_build_object(
      'everPinged', (select n from sess) > 0,
      'hoursSinceLastPing', case when (select n from sess) > 0 then 0 else null end,
      'opensLast7d', (select n from sess),
      'errorsLast24h', 0, 'loadsLast24h', (select n from sess),
      'activeMinutes', 0, 'distinctOrigins', 0, 'messages', 0,
      'sessions', (select n from sess)
    ),
    'whatsapp', jsonb_build_object(
      'everPinged', (select n from wa) > 0,
      'hoursSinceLastPing',
        (select extract(epoch from (now() - last_seen)) / 3600 from wa),
      'opensLast7d', (select n from wa),
      'errorsLast24h', 0, 'loadsLast24h', (select n from wa),
      'activeMinutes', 0, 'distinctOrigins', 0, 'messages', (select n from wa),
      'sessions', (select n from wa)
    ),
    'instagram', jsonb_build_object(
      'everPinged', false, 'hoursSinceLastPing', null,
      'opensLast7d', 0, 'errorsLast24h', 0, 'loadsLast24h', 0,
      'activeMinutes', 0, 'distinctOrigins', 0, 'messages', 0, 'sessions', 0
    )
  );
$$;
```

- [ ] **Step 4: Write the rollup**

```typescript
/**
 * Nightly health rollup. Iterates only accounts that have an account_contracts
 * row — which is how the 44 demo accounts stay off the board without having to
 * repair the inconsistent config.isDemo flag.
 *
 * One row per account PER CHANNEL: a customer can be green on WhatsApp and red
 * on the widget simultaneously, which is the normal case.
 */

import { supabase } from '@/lib/supabase';
import { deriveChannelStatus, DEFAULT_THRESHOLDS } from '@/lib/health/status';
import type { ChannelFacts } from '@/lib/health/status';

export async function rollupAccountHealth(day: string): Promise<{ accounts: number; rows: number }> {
  const { data: contracts, error } = await supabase
    .from('account_contracts')
    .select('account_id, expected_channels')
    .eq('is_paying', true);
  if (error) throw new Error(`contracts read failed: ${error.message}`);
  if (!contracts?.length) return { accounts: 0, rows: 0 };

  const rows: Record<string, unknown>[] = [];
  for (const c of contracts) {
    const { data: facts, error: factsErr } = await supabase.rpc('account_health_facts', {
      p_account_id: c.account_id,
      p_day: day,
    });
    if (factsErr) {
      console.error(`[health-rollup] facts failed for ${c.account_id}:`, factsErr.message);
      continue;
    }
    for (const channel of (c.expected_channels || []) as string[]) {
      const f = (facts as Record<string, any>)?.[channel];
      if (!f) continue;
      rows.push({
        account_id: c.account_id,
        date: day,
        channel,
        status: deriveChannelStatus(f as ChannelFacts, DEFAULT_THRESHOLDS),
        active_minutes: f.activeMinutes ?? 0,
        distinct_origins: f.distinctOrigins ?? 0,
        loads: f.loadsLast24h ?? 0,
        opens: f.opensLast7d ?? 0,
        messages: f.messages ?? 0,
        sessions: f.sessions ?? 0,
        // `leads` is reserved by the schema but NOT populated in v1 — lead
        // attribution per channel is its own piece of work. It stays 0, and the
        // board must not render it until something actually fills it. A column
        // showing a real-looking zero is worse than no column.
        leads: 0,
        errors: f.errorsLast24h ?? 0,
        computed_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length) {
    const { error: upErr } = await supabase
      .from('account_health_daily')
      .upsert(rows, { onConflict: 'account_id,date,channel' });
    if (upErr) throw new Error(`health upsert failed: ${upErr.message}`);
  }
  return { accounts: contracts.length, rows: rows.length };
}
```

- [ ] **Step 5: Write the cron route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { rollupAccountHealth } from '@/lib/health/rollup';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  return (req.headers.get('authorization') || '') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Default to today; ?day=YYYY-MM-DD lets us re-run a past day. The upsert is
  // keyed on (account_id, date, channel), so re-running is always safe.
  const day = req.nextUrl.searchParams.get('day')
    || new Date().toISOString().slice(0, 10);
  try {
    const result = await rollupAccountHealth(day);
    return NextResponse.json({ ok: true, day, ...result });
  } catch (e: any) {
    console.error('[cron/account-health-rollup]', e?.message);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Register the cron**

Add to the `crons` array in `vercel.json`. `15 3` runs after `analytics-rollup` at `0 3` so it reads settled data:

```json
    {
      "path": "/api/cron/account-health-rollup",
      "schedule": "15 3 * * *"
    },
```

- [ ] **Step 7: Write the backfill script**

```typescript
/**
 * One-time backfill: seed install_pings from the 90 days of widget_loaded events
 * already sitting in widget_events.
 *
 * Without this the board is born empty and every customer shows never_installed
 * on day one. Migration 057 in this repo carries the same warning about applying
 * a read-side change before its pipeline has data. A board that launches all-red
 * loses trust immediately and nobody opens it again.
 *
 * Caveat, stated plainly: widget_events has no host column, so historical rows
 * cannot tell us WHICH domain served them. Backfilled rows use the synthetic
 * origin 'backfill://widget_events' — enough to establish everPinged and a
 * last-seen date, not enough for the per-domain drill-down. Real origins start
 * accumulating from the day Task 3 ships.
 *
 * Run: npx tsx scripts/backfill-install-history.ts
 */

import { supabase } from '../src/lib/supabase';

async function main() {
  const { data, error } = await supabase.rpc('backfill_install_pings');
  if (error) throw new Error(error.message);
  console.log('backfilled rows:', data);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

with the RPC appended to migration 078:

```sql
create or replace function public.backfill_install_pings()
returns int language plpgsql as $$
declare n int;
begin
  insert into public.install_pings
    (account_id, origin, day, first_seen_at, last_seen_at, active_minutes, widget_version, sample_path)
  select account_id,
         'backfill://widget_events',
         created_at::date,
         min(created_at),
         max(created_at),
         count(*),
         null,
         null
  from public.widget_events
  where type = 'widget_loaded'
  group by account_id, created_at::date
  on conflict (account_id, origin, day) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/health/rollup.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 9: Verify idempotency against the live DB**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/account-health-rollup?day=2026-08-19"
```

Run it twice. Then confirm no duplicates and identical numbers:

```sql
select account_id, date, channel, count(*)
from account_health_daily group by 1,2,3 having count(*) > 1;
```

Expected: zero rows.

- [ ] **Step 10: Commit**

```bash
git add src/lib/health/rollup.ts src/app/api/cron/account-health-rollup/route.ts scripts/backfill-install-history.ts vercel.json supabase/migrations/078_customer_health.sql tests/unit/health/rollup.test.ts
git commit -m "feat(health): nightly per-channel health rollup + install history backfill"
```

---

### Task 9: Admin health API

**Files:**
- Create: `src/app/api/admin/health/route.ts`
- Create: `src/app/api/admin/health/[accountId]/route.ts`
- Test: `tests/unit/admin/health-api.test.ts`

**Interfaces:**
- Consumes: `requireAdminAuth` from `@/lib/auth/admin-auth`; `account_health_daily`, `install_pings`, `account_contracts`
- Produces: `GET /api/admin/health` → `{ rows: HealthRow[] }` where
  `HealthRow = { accountId: string; name: string; contractEnd: string | null; trialEnd: string | null; owner: string | null; channels: Array<{ channel: string; status: ChannelStatus; lastSeen: string | null; opens7d: number; loads7d: number; errors7d: number; spark: number[] }> }`
  and `GET /api/admin/health/[accountId]` → `{ origins: Array<{ origin: string; lastSeen: string; activeMinutes: number; samplePath: string | null }>; versions: Array<{ version: string; loads: number }>; errors: Array<{ type: string; message: string; stack: string | null; at: string }> }`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const denyMock = vi.fn();
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: denyMock }));

const rpcMock = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => rpcMock(...a) } }));

import { GET } from '@/app/api/admin/health/route';

describe('GET /api/admin/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    denyMock.mockResolvedValue(null);
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it('401s without an admin session', async () => {
    const { NextResponse } = await import('next/server');
    denyMock.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(new NextRequest('https://x/api/admin/health'));
    expect(res.status).toBe(401);
  });

  it('sorts worst-first: never_installed above dormant above live', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { account_id: 'a', name: 'Healthy', channels: [{ channel: 'widget', status: 'live' }] },
        { account_id: 'b', name: 'Missing', channels: [{ channel: 'widget', status: 'never_installed' }] },
        { account_id: 'c', name: 'Quiet', channels: [{ channel: 'widget', status: 'dormant' }] },
      ],
      error: null,
    });
    const res = await GET(new NextRequest('https://x/api/admin/health'));
    const body = await res.json();
    expect(body.rows.map((r: any) => r.name)).toEqual(['Missing', 'Quiet', 'Healthy']);
  });

  it('ranks an account by its WORST channel', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { account_id: 'a', name: 'AllGood', channels: [{ channel: 'widget', status: 'live' }] },
        { account_id: 'b', name: 'OneBad', channels: [
          { channel: 'whatsapp', status: 'live' }, { channel: 'widget', status: 'never_installed' },
        ] },
      ],
      error: null,
    });
    const body = await (await GET(new NextRequest('https://x/api/admin/health'))).json();
    expect(body.rows[0].name).toBe('OneBad');
  });

  it('returns an empty list rather than 500 when no contracts exist yet', async () => {
    const res = await GET(new NextRequest('https://x/api/admin/health'));
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/admin/health-api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the board RPC**

Append to migration 078 and re-apply. It joins contracts, the last 14 days of `account_health_daily`, and today's live facts, returning one object per account:

```sql
create or replace function public.admin_health_board(p_days int default 14)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb) from (
    select jsonb_build_object(
      'account_id', c.account_id,
      'name', coalesce(a.config->>'display_name', a.config->>'username', left(c.account_id::text, 8)),
      'contractEnd', c.contract_end,
      'trialEnd', c.trial_end,
      'owner', c.owner,
      'channels', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'channel', ch.channel,
          'status',  ch.status,
          'lastSeen', ch.last_seen,
          'opens7d', ch.opens7d,
          'loads7d', ch.loads7d,
          'errors7d', ch.errors7d,
          'spark', ch.spark
        )), '[]'::jsonb)
        from (
          select h.channel,
                 (array_agg(h.status order by h.date desc))[1] as status,
                 max(h.computed_at) filter (where h.status <> 'never_installed') as last_seen,
                 sum(h.opens)  filter (where h.date > current_date - 7) as opens7d,
                 sum(h.loads)  filter (where h.date > current_date - 7) as loads7d,
                 sum(h.errors) filter (where h.date > current_date - 7) as errors7d,
                 array_agg(h.loads order by h.date) as spark
          from public.account_health_daily h
          where h.account_id = c.account_id
            and h.date > current_date - p_days
          group by h.channel
        ) ch
      )
    ) as row
    from public.account_contracts c
    join public.accounts a on a.id = c.account_id
    where c.is_paying = true
  ) t;
$$;
```

- [ ] **Step 4: Write the list route**

```typescript
/**
 * Admin health board. One row per paying customer, one chip per SOLD channel.
 * Sorted worst-first by the account's most severe channel — the whole point of
 * the screen is that the accounts needing a phone call are at the top.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

// Worst first. Mirrors the precedence in src/lib/health/status.ts.
const SEVERITY: Record<string, number> = {
  never_installed: 0, silent: 1, erroring: 2, dormant: 3, live: 4,
};

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '14', 10) || 14, 90);
  const { data, error } = await supabase.rpc('admin_health_board', { p_days: days });
  if (error) {
    console.error('[admin/health] rpc error:', error.message);
    return NextResponse.json({ error: 'aggregation_failed' }, { status: 500 });
  }

  const rows = ((data || []) as any[]).map((r) => ({
    accountId: r.account_id,
    name: r.name,
    contractEnd: r.contractEnd ?? null,
    trialEnd: r.trialEnd ?? null,
    owner: r.owner ?? null,
    channels: r.channels || [],
  }));

  const worst = (r: any) => Math.min(
    ...[...(r.channels || []).map((c: any) => SEVERITY[c.status] ?? 9), 9],
  );
  rows.sort((a, b) => worst(a) - worst(b) || a.name.localeCompare(b.name, 'he'));

  return NextResponse.json({ rows });
}
```

- [ ] **Step 5: Write the drill-down route**

```typescript
/**
 * Per-account drill-down: which origins and paths we actually run on, the
 * script-version breakdown, and the most recent client errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;
  const { accountId } = await params;

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [originsRes, errorsRes] = await Promise.all([
    supabase
      .from('install_pings')
      .select('origin, last_seen_at, active_minutes, sample_path, widget_version')
      .eq('account_id', accountId)
      .gte('day', since.slice(0, 10))
      .order('last_seen_at', { ascending: false })
      .limit(100),
    supabase
      .from('widget_events')
      .select('type, payload, created_at')
      .eq('account_id', accountId)
      .in('type', ['client_error', 'config_load_failed', 'csp_blocked'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const pings = originsRes.data || [];
  const versions = Object.entries(
    pings.reduce((acc: Record<string, number>, p: any) => {
      const v = p.widget_version || 'unknown';
      acc[v] = (acc[v] || 0) + (p.active_minutes || 0);
      return acc;
    }, {}),
  ).map(([version, loads]) => ({ version, loads }));

  return NextResponse.json({
    origins: pings.map((p: any) => ({
      origin: p.origin,
      lastSeen: p.last_seen_at,
      activeMinutes: p.active_minutes,
      samplePath: p.sample_path,
    })),
    versions,
    errors: (errorsRes.data || []).map((e: any) => ({
      type: e.type,
      message: e.payload?.message || '',
      stack: e.payload?.stack || null,
      at: e.created_at,
    })),
  });
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/admin/health-api.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/health tests/unit/admin/health-api.test.ts supabase/migrations/078_customer_health.sql
git commit -m "feat(health): admin health board API, worst-first, with per-account drill-down"
```

---

### Task 10: Admin health board page

**Files:**
- Create: `src/app/admin/health/page.tsx`
- Modify: `src/app/admin/analytics/page.tsx:80-95` (add a link across to the health board)

**Interfaces:**
- Consumes: `GET /api/admin/health` and `GET /api/admin/health/[accountId]` from Task 9
- Produces: nothing

Follow the existing admin page conventions exactly: `'use client'`, `dir="rtl"`, `bg-gray-50 p-6`, `max-w-6xl mx-auto`, the shared `Card` component, and Hebrew labels — see `src/app/admin/analytics/page.tsx` for the reference implementation.

- [ ] **Step 1: Build the page**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';

const STATUS_META: Record<string, { icon: string; label: string; cls: string }> = {
  never_installed: { icon: '⚪', label: 'לא הותקן', cls: 'bg-gray-100 text-gray-700' },
  silent:          { icon: '🔴', label: 'נדם',      cls: 'bg-red-100 text-red-800' },
  erroring:        { icon: '🟠', label: 'שגיאות',   cls: 'bg-orange-100 text-orange-800' },
  dormant:         { icon: '🟡', label: 'דועך',     cls: 'bg-amber-100 text-amber-800' },
  live:            { icon: '🟢', label: 'חי',       cls: 'bg-emerald-100 text-emerald-800' },
};

const CHANNEL_LABEL: Record<string, string> = {
  widget: 'ווידג׳ט', chat_page: 'עמוד צ׳אט', whatsapp: 'וואטסאפ', instagram: 'אינסטגרם',
};

export default function HealthPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/admin/health');
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j?.error || 'failed');
        setRows(j.rows || []);
      } catch (e: any) {
        if (alive) setError(e?.message || 'failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function toggle(accountId: string) {
    if (openId === accountId) { setOpenId(null); return; }
    setOpenId(accountId);
    if (detail[accountId]) return;
    const r = await fetch(`/api/admin/health/${accountId}`);
    if (r.ok) setDetail((d) => ({ ...d, [accountId]: await r.json() }));
  }

  const atRisk = useMemo(
    () => rows.filter((r) => r.channels.some((c: any) => c.status !== 'live')).length,
    [rows],
  );

  return (
    <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">בריאות לקוחות</h1>
            <p className="text-sm text-gray-500">
              {loading ? 'טוען…' : `${rows.length} לקוחות משלמים · ${atRisk} דורשים תשומת לב`}
            </p>
          </div>
          <Link href="/admin/analytics" className="text-blue-600 hover:underline text-sm">
            אנליטיקס →
          </Link>
        </header>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        {!loading && rows.length === 0 && (
          <Card className="p-6 text-center text-gray-500 text-sm">
            אין עדיין שורות ב־<code>account_contracts</code>. הוסיפו לקוחות משלמים כדי שהלוח יתמלא.
          </Card>
        )}

        {rows.map((r) => (
          <Card key={r.accountId} className="overflow-hidden">
            <button
              onClick={() => toggle(r.accountId)}
              className="w-full text-right p-4 hover:bg-gray-50 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-gray-500">
                  {r.owner || '—'}
                  {r.trialEnd && ` · טרייל עד ${r.trialEnd}`}
                  {r.contractEnd && ` · חוזה עד ${r.contractEnd}`}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {r.channels.map((c: any) => {
                  const m = STATUS_META[c.status] || STATUS_META.never_installed;
                  return (
                    <span key={c.channel} className={`px-2 py-1 rounded text-xs font-medium ${m.cls}`}>
                      {m.icon} {CHANNEL_LABEL[c.channel] || c.channel} · {m.label}
                      {c.status === 'dormant' && c.loads7d > 0 &&
                        ` (${((c.opens7d / c.loads7d) * 100).toFixed(1)}%)`}
                      {c.status === 'erroring' && ` (${c.errors7d})`}
                    </span>
                  );
                })}
              </div>
            </button>

            {openId === r.accountId && (
              <div className="border-t border-gray-100 p-4 bg-gray-50 text-sm space-y-4">
                {!detail[r.accountId] && <div className="text-gray-400">טוען פירוט…</div>}
                {detail[r.accountId] && (
                  <>
                    <section>
                      <h3 className="font-medium mb-2">איפה אנחנו רצים</h3>
                      {detail[r.accountId].origins.length === 0 && (
                        <div className="text-gray-400">אף פינג — הסניפט לא הודבק.</div>
                      )}
                      <ul className="space-y-1">
                        {detail[r.accountId].origins.map((o: any) => (
                          <li key={o.origin} className="flex justify-between gap-4">
                            <span className="font-mono text-xs">{o.origin}{o.samplePath}</span>
                            <span className="text-gray-500 text-xs">
                              {new Date(o.lastSeen).toLocaleString('he-IL')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section>
                      <h3 className="font-medium mb-2">גרסאות סקריפט</h3>
                      <div className="flex gap-2 flex-wrap">
                        {detail[r.accountId].versions.map((v: any) => (
                          <span key={v.version} className="px-2 py-1 rounded bg-white border text-xs">
                            {v.version}
                          </span>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3 className="font-medium mb-2">
                        שגיאות אחרונות ({detail[r.accountId].errors.length})
                      </h3>
                      {detail[r.accountId].errors.length === 0 && (
                        <div className="text-gray-400">אין שגיאות ב־30 הימים האחרונים.</div>
                      )}
                      <ul className="space-y-2">
                        {detail[r.accountId].errors.slice(0, 10).map((e: any, i: number) => (
                          <li key={i} className="bg-white border rounded p-2">
                            <div className="flex justify-between gap-2">
                              <span className="font-mono text-xs text-red-700">{e.type}</span>
                              <span className="text-gray-400 text-xs">
                                {new Date(e.at).toLocaleString('he-IL')}
                              </span>
                            </div>
                            <div className="text-xs mt-1">{e.message}</div>
                            {e.stack && (
                              <pre className="text-[10px] text-gray-500 mt-1 overflow-x-auto">{e.stack}</pre>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Link it from the analytics page**

In `src/app/admin/analytics/page.tsx`, beside the existing "עלויות WhatsApp" link in the header:

```tsx
            <Link
              href="/admin/health"
              className="px-3 py-1 rounded text-sm bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
            >
              בריאות לקוחות →
            </Link>
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors. (`typescript.ignoreBuildErrors` is on in `next.config.ts`, so the build will not catch these — this command is the only gate.)

- [ ] **Step 4: Verify in the browser**

1. `npm run dev`, sign in as admin, open `/admin/health`.
2. With `account_contracts` still empty, confirm the empty state renders rather than a crash.
3. Confirm the link from `/admin/analytics` works.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/health/page.tsx src/app/admin/analytics/page.tsx
git commit -m "feat(health): admin customer health board with per-account drill-down"
```

---

### Task 11: Populate contracts and verify end to end

**Files:**
- Create: `scripts/seed-account-contracts.sql` (a reviewable record of what was entered by hand)

**Interfaces:**
- Consumes: everything above
- Produces: a populated board

This is the rollout step the spec calls load-bearing. Collection has been live since Task 3, so real pings have been accumulating; the backfill covers the history before that.

- [ ] **Step 1: Run the backfill**

```bash
npx tsx scripts/backfill-install-history.ts
```

Verify it seeded history:

```sql
select count(*), min(day), max(day) from install_pings where origin = 'backfill://widget_events';
```

- [ ] **Step 2: Confirm real pings are arriving**

```sql
select account_id, origin, day, active_minutes, widget_version
from install_pings where origin <> 'backfill://widget_events'
order by last_seen_at desc limit 20;
```

Expected: real domains — `https://argania-oil.co.il`, `https://studiopasha.co.il`, `https://labeauteisrael.co.il`. If this is empty after Task 3 has been deployed for an hour, stop and debug before continuing; a board built on no data is the exact failure mode this ordering exists to prevent.

- [ ] **Step 3: Write the seed file**

Confirm each customer's sold channels with Ido before running this — the values below are the observed-traffic starting point, not a contract record.

```sql
-- Hand-entered customer contracts. This is the first reliable record of who pays
-- us; accounts.plan and config.isDemo are both unreliable (see migration 078).
-- Channels must be CONFIRMED with Ido, not inferred from traffic.

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page','whatsapp'], 'ido@triroars.com', 'confirmed 2026-08-19'
from accounts where config->>'username' = 'argania_group'
on conflict (account_id) do update set expected_channels = excluded.expected_channels;

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page','whatsapp'], 'ido@triroars.com', 'confirmed 2026-08-19'
from accounts where config->>'username' = 'studiopasha_fashion'
on conflict (account_id) do update set expected_channels = excluded.expected_channels;

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page','whatsapp'], 'ido@triroars.com', 'confirmed 2026-08-19'
from accounts where config->>'username' = 'labeaute.israel'
on conflict (account_id) do update set expected_channels = excluded.expected_channels;

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page'], 'ido@triroars.com', 'confirmed 2026-08-19'
from accounts where config->>'username' = 'ldrs_group'
on conflict (account_id) do update set expected_channels = excluded.expected_channels;

-- Trial, ends 2026-09-12 (see the trial-reminders cron)
insert into account_contracts (account_id, expected_channels, trial_end, owner, notes)
select id, array['widget','chat_page'], '2026-09-12', 'ido@triroars.com', 'trial'
from accounts where config->>'username' = 'hamania.israel'
on conflict (account_id) do update set expected_channels = excluded.expected_channels;

insert into account_contracts (account_id, expected_channels, owner, notes)
select id, array['widget','chat_page'], 'ido@triroars.com', 'confirmed 2026-08-19'
from accounts where config->>'username' = 'kuni_il'
on conflict (account_id) do update set expected_channels = excluded.expected_channels;
```

- [ ] **Step 4: Run the rollup for today**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/account-health-rollup"
```

- [ ] **Step 5: Verify the board tells the truth**

Open `/admin/health` and check it against what we already know to be true from the spec's §1 table:

- ARGANIA, STUDIO PASHA → widget 🟢 live
- LA BEAUTÉ → widget 🟡 dormant (or 🟠 erroring once client errors arrive — either is correct and more informative than what we have today)
- KUNI, החמניה → widget ⚪ never installed
- LDRS GROUP → widget 🔴 silent or ⚪ never installed

If any row contradicts the measured data, the rollup or the derivation is wrong — fix it before shipping. This step is the actual acceptance test for the whole subsystem.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-account-contracts.sql
git commit -m "chore(health): seed account contracts for paying customers"
```

---

## Rollout Note

Tasks 1–6 are collection and ship silently — no screen, no behaviour change visible to anyone. Tasks 7–10 build the read side. Task 11 turns it on. Do not reorder: launching the board before pings and the backfill exist shows every customer as never-installed, and a board that launches all-red loses trust on day one and nobody opens it again. Migration 057 in this repo carries the same warning for the same reason.
