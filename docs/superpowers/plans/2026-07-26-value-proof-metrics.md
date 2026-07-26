# Value-Proof Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure Yoav's 10 value-proof metrics per account, retroactively over all existing data, and expose them in admin analytics (all 10) and the brand dashboard (7 of 10).

**Architecture:** A derived attribution layer computes, for every order and abandoned cart, which Bestie touch tier it belongs to (`direct` / `assisted` / `influenced` / `none`) and stores it in one table, `bestie_attribution`. Tier logic lives in **pure TypeScript** (`src/lib/analytics/value-proof/attribute.ts`) so it is unit-testable and exists exactly once; a Node refresh job applies it in batches. A SQL RPC aggregates the result, and a TS metric-envelope layer wraps every number in `{ value, n, measured, lowConfidence, basis }` so a metric with no data source reports "not measured" instead of 0.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), Vitest, QuickShop merchant REST API.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-value-proof-metrics-design.md`. Measured baseline report: `docs/reports/2026-07-26-value-proof-argania-pasha.md`.
- Accounts under test: Argania `c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1`, Studio Pasha `36705ad6-4f82-46af-95e1-fb5ea6f4a44f`. Both `config.integrations.quickshop.enabled = true`.
- Path alias: `@/*` → `./src/*`. Use it for every internal import.
- Migrations are numbered SQL files in `supabase/migrations/`; the next free number is **071**.
- `npm run type-check` must pass. `next.config.ts` sets `typescript.ignoreBuildErrors: true`, so the build will NOT catch type errors — always run type-check separately.
- Tests are pure unit tests under `tests/unit/`, Vitest, with `vi.mock('@/lib/supabase', …)`. Follow `tests/unit/brand-orders.test.ts` as the reference style. No test may touch the network or a real database.
- Phone normalization MUST delegate to the existing `toWaId` from `@/lib/whatsapp-cloud/client`. Do not write new phone-parsing rules.
- **Attribution excludes non-sales rows:** any order with `total = 0` or `raw->>'utm_source' = 'pos'` is never attributed and never counts in a denominator. Measured consequence of omitting this: the `influenced` tier reported 132 orders on Argania of which 120 were ₪0 and 122 were POS.
- **Three tiers are never summed into one number without the per-tier breakdown displayed alongside.**
- **Every comparison is period-matched.** A comparison whose windows cannot be matched returns `measured: false`, never a number.
- `n < 30` sets `lowConfidence: true`; the UI prints `n` next to every percentage.
- Commit after every task. Commit straight to `main` and push — no branch, no PR. Stage only the files the task touched.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `supabase/migrations/071_value_proof.sql` | `brand_abandoned_carts`, `bestie_attribution`, `support_requests.escalation_reason`, `bestie_wa_id()`, `bestie_conversation_touches` view, `value_proof_summary()` RPC |
| `src/lib/analytics/value-proof/types.ts` | `Tier`, `MatchKey`, `Metric<T>`, `TouchRecord`, `AttributableOrder`, `AttributableCart`, `Attribution`, window constants |
| `src/lib/analytics/value-proof/identity.ts` | `normalizePhone` (delegates `toWaId`), `normalizeEmail` |
| `src/lib/analytics/value-proof/attribute.ts` | Pure tier resolution — the single source of truth for attribution |
| `src/lib/analytics/value-proof/refresh.ts` | Loads touches + orders + carts, applies `attribute.ts`, upserts `bestie_attribution` |
| `src/lib/analytics/value-proof/metrics.ts` | Wraps raw aggregates in the honesty envelope; builds the 10-metric document |
| `src/lib/carts/brand-carts.ts` | `upsertBrandCarts` — mirrors `src/lib/orders/brand-orders.ts` |
| `src/lib/carts/backfill.ts` | `backfillAccountCarts` — paginates QuickShop carts under the rate limit |
| `src/app/api/cron/quickshop-cart-sync/route.ts` | Cron entry, `CRON_SECRET`-gated |
| `src/app/api/cron/value-proof-refresh/route.ts` | Cron entry that calls `refresh.ts` per account |
| `src/app/api/admin/analytics/value-proof/route.ts` | Admin read API (all 10 metrics) |
| `src/app/admin/influencers/[id]/analytics/ValueProofTab.tsx` | Admin tab UI |
| `src/app/api/influencer/[username]/analytics/value-proof/route.ts` | Brand read API (7 metrics) |
| `src/app/influencer/[username]/analytics/ValueProofBlock.tsx` | Brand-facing UI block |
| `scripts/value-proof-report.ts` | One-off markdown report generator |
| `tests/unit/value-proof-identity.test.ts` | |
| `tests/unit/value-proof-attribution.test.ts` | |
| `tests/unit/value-proof-metrics.test.ts` | |
| `tests/unit/quickshop-cart-sync.test.ts` | |
| `tests/unit/value-proof-latency.test.ts` | |

**Modified**

| File | Change |
|---|---|
| `src/lib/orders/connectors/quickshop.ts` | add `listAbandonedCarts(creds, cursor)` |
| `src/lib/chatbot/widget-chat-handler.ts:399-412` | explicit user `created_at` + `metadata.latency_ms` on the assistant row |
| `src/lib/analytics/event-catalog.ts` | add `dashboard_visit` |
| `public/widget.js` | thank-you detection → `widget_conversion_detected` with `order_number` |
| `src/app/admin/influencers/[id]/analytics/page.tsx:112,223-229` | third tab |
| `src/app/influencer/[username]/analytics/page.tsx` | render `ValueProofBlock` |
| `src/lib/i18n/dashboard/analytics.ts` | new `he` + `en` keys |
| `vercel.json` | schedule the two new crons |

---

## Task 1: Identity normalization, TS and SQL

**Files:**
- Create: `src/lib/analytics/value-proof/identity.ts`
- Create: `src/lib/analytics/value-proof/types.ts`
- Create: `supabase/migrations/071_value_proof.sql` (function only in this task)
- Test: `tests/unit/value-proof-identity.test.ts`

**Interfaces:**
- Consumes: `toWaId` from `@/lib/whatsapp-cloud/client`.
- Produces: `normalizePhone(raw: string | null | undefined): string | null`, `normalizeEmail(raw: string | null | undefined): string | null`, and SQL `bestie_wa_id(text) returns text`. Types `Tier`, `Metric<T>`, `TouchRecord`, `AttributableOrder`, `AttributableCart`.

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-identity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail } from '@/lib/analytics/value-proof/identity';

describe('value-proof identity normalization', () => {
  it('normalizes every Israeli phone spelling to one wa_id', () => {
    const want = '972501234567';
    for (const input of ['0501234567', '050-123-4567', '+972501234567', '972501234567', '00972501234567', '501234567']) {
      expect(normalizePhone(input)).toBe(want);
    }
  });

  it('returns null for empty or digitless input', () => {
    for (const input of [null, undefined, '', '   ', '---']) {
      expect(normalizePhone(input)).toBeNull();
    }
  });

  it('lowercases and trims emails, and rejects non-emails', () => {
    expect(normalizeEmail('  Dana@Example.COM ')).toBe('dana@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/value-proof-identity.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/analytics/value-proof/identity"`.

- [ ] **Step 3: Write the types**

`src/lib/analytics/value-proof/types.ts`:

```ts
/** Attribution tiers, in resolution order. First tier that matches wins. */
export type Tier = 'direct' | 'assisted' | 'influenced' | 'none';

/** Which key produced the match — reported so a number can be defended. */
export type MatchKey = 'utm' | 'anon_id' | 'phone' | 'email' | null;

/**
 * Every metric is wrapped in this envelope. `measured: false` means there is no
 * data source for it — it renders as "not measured" and NEVER as 0.
 * `basis` is a short human string naming what the value was computed from.
 */
export interface Metric<T = number> {
  value: T | null;
  n: number;
  measured: boolean;
  lowConfidence: boolean;
  basis: string;
}

/** One Bestie touch: a conversation event carrying at least one identity key. */
export interface TouchRecord {
  touchAt: number;            // epoch ms
  surface: 'chat' | 'widget' | 'support' | 'lead' | 'whatsapp_cs';
  anonId: string | null;
  phone: string | null;       // already normalized
  email: string | null;       // already normalized
}

export interface AttributableOrder {
  id: string;
  occurredAt: number;         // epoch ms — placed_at
  amount: number;
  utmSource: string | null;
  anonId: string | null;      // from the thank-you beacon, else null
  phone: string | null;       // already normalized
  email: string | null;       // already normalized
}

export interface AttributableCart {
  id: string;
  occurredAt: number;         // epoch ms — abandoned_at
  amount: number;
  email: string | null;       // already normalized
}

export interface Attribution {
  tier: Tier;
  matchKey: MatchKey;
  touchAt: number | null;
  lagSec: number | null;
}

export const LOW_CONFIDENCE_N = 30;
export const ASSISTED_WINDOW_MS = 24 * 60 * 60 * 1000;
export const INFLUENCED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
```

- [ ] **Step 4: Write the normalizers**

`src/lib/analytics/value-proof/identity.ts`:

```ts
/**
 * Identity keys used to join a conversation to an order or cart.
 *
 * Phone normalization is NOT reimplemented here — it delegates to `toWaId`,
 * the normalizer already used by order lookup via `phoneMatches`
 * (`src/lib/orders/phone-verify.ts`). One rule set, one place.
 */
import { toWaId } from '@/lib/whatsapp-cloud/client';

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!/\d/.test(raw)) return null;
  const waId = toWaId(raw);
  return waId ? waId : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/value-proof-identity.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the SQL mirror**

Create `supabase/migrations/071_value_proof.sql` with only the function for now. It mirrors `toWaId` step for step: strip non-digits → drop a leading `00` → a leading `0` becomes `972` → a bare 9-digit number gets `972`.

```sql
-- 071_value_proof.sql — value-proof metrics (see docs/superpowers/specs/2026-07-26-value-proof-metrics-design.md)

-- SQL mirror of toWaId() in src/lib/whatsapp-cloud/client.ts. Kept immutable so
-- it can be used in indexes and joins. Any change here must change toWaId too.
create or replace function bestie_wa_id(p text) returns text
language sql immutable as $$
  with d0 as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d),
       d1 as (select case when d like '00%' then substr(d, 3) else d end as d from d0),
       d2 as (select case when d like '0%'  then '972' || substr(d, 2) else d end as d from d1),
       d3 as (select case when length(d) = 9 then '972' || d else d end as d from d2)
  select nullif(d, '') from d3;
$$;

create or replace function bestie_email(p text) returns text
language sql immutable as $$
  select case when position('@' in lower(btrim(coalesce(p, '')))) > 1
              then lower(btrim(p)) else null end;
$$;
```

- [ ] **Step 7: Apply the migration and verify parity against the TS fixtures**

Apply with the Supabase MCP `apply_migration` tool (name: `value_proof_identity`), then run:

```sql
select bestie_wa_id('0501234567')      as a,  -- expect 972501234567
       bestie_wa_id('050-123-4567')    as b,  -- expect 972501234567
       bestie_wa_id('+972501234567')   as c,  -- expect 972501234567
       bestie_wa_id('00972501234567')  as d,  -- expect 972501234567
       bestie_wa_id('501234567')       as e,  -- expect 972501234567
       bestie_wa_id('---')             as f,  -- expect NULL
       bestie_email('  Dana@Example.COM ') as g, -- expect dana@example.com
       bestie_email('not-an-email')       as h;  -- expect NULL
```

Expected: `a`–`e` all `972501234567`, `f` and `h` null, `g` = `dana@example.com`. If any differ from the TS test's expectations, fix the SQL — the TS is canonical.

- [ ] **Step 8: Commit**

```bash
git add src/lib/analytics/value-proof/types.ts src/lib/analytics/value-proof/identity.ts supabase/migrations/071_value_proof.sql tests/unit/value-proof-identity.test.ts
git commit -m "feat(value-proof): identity normalization in TS and SQL, parity-tested"
```

---

## Task 2: Pure tier resolution

**Files:**
- Create: `src/lib/analytics/value-proof/attribute.ts`
- Test: `tests/unit/value-proof-attribution.test.ts`

**Interfaces:**
- Consumes: `Tier`, `MatchKey`, `TouchRecord`, `AttributableOrder`, `AttributableCart`, `Attribution`, `ASSISTED_WINDOW_MS`, `INFLUENCED_WINDOW_MS` from `./types`.
- Produces:
  - `buildTouchIndex(touches: TouchRecord[]): TouchIndex`
  - `attributeOrder(order: AttributableOrder, index: TouchIndex): Attribution`
  - `attributeCart(cart: AttributableCart, index: TouchIndex): Attribution`
  - `isAttributableOrder(o: { amount: number; utmSource: string | null }): boolean`
  - `export interface TouchIndex { byAnon: Map<string, number[]>; byPhone: Map<string, number[]>; byEmail: Map<string, number[]> }`

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-attribution.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTouchIndex, attributeOrder, attributeCart, isAttributableOrder } from '@/lib/analytics/value-proof/attribute';
import type { TouchRecord, AttributableOrder } from '@/lib/analytics/value-proof/types';

const T0 = Date.parse('2026-07-01T10:00:00Z');
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const touch = (over: Partial<TouchRecord> = {}): TouchRecord => ({
  touchAt: T0, surface: 'chat', anonId: null, phone: null, email: null, ...over,
});
const order = (over: Partial<AttributableOrder> = {}): AttributableOrder => ({
  id: 'o1', occurredAt: T0 + HOUR, amount: 200, utmSource: null, anonId: null, phone: null, email: null, ...over,
});

describe('attribution tiers', () => {
  it('direct wins over assisted and influenced, and needs no touch record', () => {
    const idx = buildTouchIndex([touch({ anonId: 'a1', phone: '972501234567' })]);
    const a = attributeOrder(order({ utmSource: 'bestie', anonId: 'a1', phone: '972501234567' }), idx);
    expect(a.tier).toBe('direct');
    expect(a.matchKey).toBe('utm');

    const bare = attributeOrder(order({ utmSource: 'bestie' }), buildTouchIndex([]));
    expect(bare.tier).toBe('direct');
  });

  it('assisted wins over influenced when both match', () => {
    const idx = buildTouchIndex([touch({ anonId: 'a1' }), touch({ phone: '972501234567' })]);
    const a = attributeOrder(order({ anonId: 'a1', phone: '972501234567' }), idx);
    expect(a.tier).toBe('assisted');
    expect(a.matchKey).toBe('anon_id');
  });

  it('assisted honours the 24h boundary', () => {
    const idx = buildTouchIndex([touch({ anonId: 'a1' })]);
    expect(attributeOrder(order({ anonId: 'a1', occurredAt: T0 + DAY - 60_000 }), idx).tier).toBe('assisted');
    expect(attributeOrder(order({ anonId: 'a1', occurredAt: T0 + DAY + 60_000 }), idx).tier).toBe('none');
  });

  it('influenced honours the 7-day boundary', () => {
    const idx = buildTouchIndex([touch({ email: 'dana@example.com' })]);
    expect(attributeOrder(order({ email: 'dana@example.com', occurredAt: T0 + 7 * DAY - HOUR }), idx).tier).toBe('influenced');
    expect(attributeOrder(order({ email: 'dana@example.com', occurredAt: T0 + 7 * DAY + HOUR }), idx).tier).toBe('none');
  });

  it('a touch AFTER the order never attributes it', () => {
    const idx = buildTouchIndex([touch({ touchAt: T0 + 2 * HOUR, anonId: 'a1', phone: '972501234567' })]);
    const a = attributeOrder(order({ occurredAt: T0 + HOUR, anonId: 'a1', phone: '972501234567' }), idx);
    expect(a.tier).toBe('none');
    expect(a.touchAt).toBeNull();
  });

  it('picks the LATEST qualifying touch and reports the lag', () => {
    const idx = buildTouchIndex([touch({ anonId: 'a1' }), touch({ touchAt: T0 + 30 * 60_000, anonId: 'a1' })]);
    const a = attributeOrder(order({ anonId: 'a1', occurredAt: T0 + HOUR }), idx);
    expect(a.touchAt).toBe(T0 + 30 * 60_000);
    expect(a.lagSec).toBe(1800);
  });

  it('excludes zero-value and POS orders from attribution entirely', () => {
    expect(isAttributableOrder({ amount: 0, utmSource: 'bestie' })).toBe(false);
    expect(isAttributableOrder({ amount: 120, utmSource: 'pos' })).toBe(false);
    expect(isAttributableOrder({ amount: 120, utmSource: 'bestie' })).toBe(true);
    expect(isAttributableOrder({ amount: 120, utmSource: null })).toBe(true);
  });

  it('carts attribute on email only, within the influenced window', () => {
    const idx = buildTouchIndex([touch({ email: 'dana@example.com' })]);
    expect(attributeCart({ id: 'c1', occurredAt: T0 + DAY, amount: 300, email: 'dana@example.com' }, idx).tier).toBe('influenced');
    expect(attributeCart({ id: 'c2', occurredAt: T0 + DAY, amount: 300, email: 'other@example.com' }, idx).tier).toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/value-proof-attribution.test.ts`
Expected: FAIL — cannot resolve `@/lib/analytics/value-proof/attribute`.

- [ ] **Step 3: Write the implementation**

`src/lib/analytics/value-proof/attribute.ts`:

```ts
/**
 * Tier resolution — the single source of truth for what "Bestie produced this
 * order" means. Pure: no DB, no clock, no I/O, so it is fully unit-testable and
 * the refresh job and the report script cannot disagree with each other.
 *
 * Resolution order is fixed: direct → assisted → influenced → none.
 *  - direct     the order carries utm_source=bestie. The UTM IS the evidence, so
 *              NO touch record is required — the visitor's session may never have
 *              been recorded (widget analytics only began 2026-07-06).
 *  - assisted   same anon_id conversed, then ordered within 24h.
 *  - influenced the customer's phone or email touched a conversation within 7d.
 *
 * For assisted and influenced the touch MUST strictly precede the order.
 */
import {
  ASSISTED_WINDOW_MS,
  INFLUENCED_WINDOW_MS,
  type Attribution,
  type AttributableCart,
  type AttributableOrder,
  type MatchKey,
  type TouchRecord,
} from './types';

export interface TouchIndex {
  byAnon: Map<string, number[]>;
  byPhone: Map<string, number[]>;
  byEmail: Map<string, number[]>;
}

const push = (m: Map<string, number[]>, key: string | null, at: number) => {
  if (!key) return;
  const list = m.get(key);
  if (list) list.push(at);
  else m.set(key, [at]);
};

export function buildTouchIndex(touches: TouchRecord[]): TouchIndex {
  const index: TouchIndex = { byAnon: new Map(), byPhone: new Map(), byEmail: new Map() };
  for (const t of touches) {
    push(index.byAnon, t.anonId, t.touchAt);
    push(index.byPhone, t.phone, t.touchAt);
    push(index.byEmail, t.email, t.touchAt);
  }
  return index;
}

/** Latest touch strictly before `at` and no older than `windowMs`. */
function latestTouch(times: number[] | undefined, at: number, windowMs: number): number | null {
  if (!times) return null;
  let best: number | null = null;
  for (const t of times) {
    if (t >= at) continue;                 // a touch after the order proves nothing
    if (at - t > windowMs) continue;
    if (best === null || t > best) best = t;
  }
  return best;
}

const resolved = (tier: Attribution['tier'], matchKey: MatchKey, touchAt: number | null, at: number): Attribution => ({
  tier,
  matchKey,
  touchAt,
  lagSec: touchAt === null ? null : Math.round((at - touchAt) / 1000),
});

const NONE: Attribution = { tier: 'none', matchKey: null, touchAt: null, lagSec: null };

/**
 * ₪0 rows and point-of-sale rows are not sales — they are in-store and
 * replacement records. Including them inflated the influenced tier 11x on
 * Argania (132 orders, of which 120 were ₪0) while adding ₪0 of revenue.
 */
export function isAttributableOrder(o: { amount: number; utmSource: string | null }): boolean {
  if (!(o.amount > 0)) return false;
  return (o.utmSource || '').trim().toLowerCase() !== 'pos';
}

export function attributeOrder(order: AttributableOrder, index: TouchIndex): Attribution {
  if (!isAttributableOrder(order)) return NONE;

  if ((order.utmSource || '').trim().toLowerCase() === 'bestie') {
    return resolved('direct', 'utm', null, order.occurredAt);
  }

  const assisted = latestTouch(index.byAnon.get(order.anonId || ''), order.occurredAt, ASSISTED_WINDOW_MS);
  if (assisted !== null) return resolved('assisted', 'anon_id', assisted, order.occurredAt);

  const byPhone = latestTouch(index.byPhone.get(order.phone || ''), order.occurredAt, INFLUENCED_WINDOW_MS);
  const byEmail = latestTouch(index.byEmail.get(order.email || ''), order.occurredAt, INFLUENCED_WINDOW_MS);
  if (byPhone !== null || byEmail !== null) {
    const best = Math.max(byPhone ?? -Infinity, byEmail ?? -Infinity);
    const key: MatchKey = best === byPhone ? 'phone' : 'email';
    return resolved('influenced', key, best, order.occurredAt);
  }

  return NONE;
}

/** Carts carry only an email, so they can only reach the influenced tier. */
export function attributeCart(cart: AttributableCart, index: TouchIndex): Attribution {
  const at = latestTouch(index.byEmail.get(cart.email || ''), cart.occurredAt, INFLUENCED_WINDOW_MS);
  return at === null ? NONE : resolved('influenced', 'email', at, cart.occurredAt);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/value-proof-attribution.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npm run type-check
git add src/lib/analytics/value-proof/attribute.ts tests/unit/value-proof-attribution.test.ts
git commit -m "feat(value-proof): pure tier resolution with 24h/7d windows and POS exclusion"
```

---

## Task 3: Schema — carts, attribution, escalation reason, touches view

**Files:**
- Modify: `supabase/migrations/071_value_proof.sql`

**Interfaces:**
- Consumes: `bestie_wa_id`, `bestie_email` from Task 1.
- Produces: tables `brand_abandoned_carts`, `bestie_attribution`; column `support_requests.escalation_reason`; view `bestie_conversation_touches(account_id, touch_at, surface, session_id, anon_id, phone, email)`.

- [ ] **Step 1: Append the schema to the migration**

Append to `supabase/migrations/071_value_proof.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Abandoned carts, mirrored from QuickShop GET /api/v1/abandoned-carts.
-- NOTE: recovered_at is null on every row QuickShop serves (14,416 checked
-- 2026-07-26) — the endpoint appears to return only unrecovered carts. The
-- column is kept because the API sends it, but recovery is DERIVED by us:
-- a cart is recovered when its email places a later paid, non-POS order.
-- ---------------------------------------------------------------------------
create table if not exists brand_abandoned_carts (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts(id) on delete cascade,
  external_id      text not null,
  email            text,
  email_norm       text,
  items            jsonb not null default '[]'::jsonb,
  subtotal         numeric,
  checkout_step    text,
  reminder_count   integer not null default 0,
  reminder_sent_at timestamptz,
  recovered_at     timestamptz,
  abandoned_at     timestamptz not null,
  raw              jsonb,
  synced_at        timestamptz not null default now(),
  unique (account_id, external_id)
);
create index if not exists brand_abandoned_carts_acct_time_idx on brand_abandoned_carts (account_id, abandoned_at desc);
create index if not exists brand_abandoned_carts_acct_email_idx on brand_abandoned_carts (account_id, email_norm);

-- ---------------------------------------------------------------------------
-- One row per attributed subject (order or cart). Written by
-- src/lib/analytics/value-proof/refresh.ts, which owns the tier logic.
-- ---------------------------------------------------------------------------
create table if not exists bestie_attribution (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('order', 'cart')),
  subject_id   uuid not null,
  tier         text not null check (tier in ('direct', 'assisted', 'influenced', 'none')),
  match_key    text check (match_key in ('utm', 'anon_id', 'phone', 'email')),
  touch_at     timestamptz,
  lag_sec      integer,
  amount       numeric,
  occurred_at  timestamptz not null,
  recovered_at timestamptz,          -- carts only: when the derived recovery order landed
  computed_at  timestamptz not null default now(),
  unique (account_id, subject_kind, subject_id)
);
create index if not exists bestie_attribution_lookup_idx
  on bestie_attribution (account_id, subject_kind, tier, occurred_at desc);

-- Metric 7's "on what". The escalation detector already classifies a reason at
-- runtime and then discards it; this is where it lands.
alter table support_requests add column if not exists escalation_reason text;
create index if not exists support_requests_reason_idx on support_requests (account_id, escalation_reason);

-- ---------------------------------------------------------------------------
-- The touch spine. A view, not a table, so every conversation already in the
-- database is attributable retroactively with nothing new captured.
-- A "conversation" requires >=1 user-authored message.
-- ---------------------------------------------------------------------------
create or replace view bestie_conversation_touches as
  select s.account_id, s.created_at as touch_at, 'chat'::text as surface,
         s.id as session_id, s.anon_id, null::text as phone, null::text as email
    from chat_sessions s
   where exists (select 1 from chat_messages m where m.session_id = s.id and m.role = 'user')
  union all
  select w.account_id, w.first_seen, 'widget', null::uuid, w.anon_id, null, null
    from widget_sessions w
   where w.sent_message
  union all
  select r.account_id, r.created_at, 'support', r.session_id, null,
         bestie_wa_id(r.customer_phone), bestie_email(r.customer_email)
    from support_requests r
  union all
  select l.account_id, l.created_at, 'lead', l.session_id, null,
         bestie_wa_id(l.phone), null
    from chat_leads l
  union all
  select c.active_account_id, c.created_at, 'whatsapp_cs', c.active_chat_session_id, null,
         bestie_wa_id(c.wa_id), null
    from whatsapp_cs_sessions c
   where c.active_account_id is not null;
```

- [ ] **Step 2: Apply the migration**

Apply with the Supabase MCP `apply_migration` tool, name `value_proof_schema`.

- [ ] **Step 3: Verify the view returns the expected shape and volume**

```sql
select surface, count(*) n,
       count(anon_id) w_anon, count(phone) w_phone, count(email) w_email
  from bestie_conversation_touches
 where account_id = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1'
 group by 1 order by 2 desc;
```

Expected: a `chat` row with roughly 1,800 touches, a `support` row with roughly 450 (nearly all with a phone), small `widget` / `lead` / `whatsapp_cs` rows. If `chat` returns 0, the `chat_messages` existence check is wrong — investigate before continuing.

- [ ] **Step 4: Verify the new tables are empty and correctly constrained**

```sql
select (select count(*) from brand_abandoned_carts) carts,
       (select count(*) from bestie_attribution) attribution;
-- expect 0, 0
insert into bestie_attribution (account_id, subject_kind, subject_id, tier, occurred_at)
values ('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1', 'nonsense', gen_random_uuid(), 'direct', now());
-- expect: ERROR violates check constraint
```

Then `delete from bestie_attribution;` to leave it empty.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/071_value_proof.sql
git commit -m "feat(value-proof): carts + attribution tables, escalation_reason, touch view"
```

---

## Task 4: QuickShop abandoned-cart sync

**Files:**
- Modify: `src/lib/orders/connectors/quickshop.ts`
- Create: `src/lib/carts/brand-carts.ts`
- Create: `src/lib/carts/backfill.ts`
- Create: `src/app/api/cron/quickshop-cart-sync/route.ts`
- Modify: `vercel.json`
- Test: `tests/unit/quickshop-cart-sync.test.ts`

**Interfaces:**
- Consumes: `qsFetch` pattern and `OrderConnectorCreds` from `./types` in the connector; `normalizeEmail` from Task 1.
- Produces:
  - `listAbandonedCarts(creds: OrderConnectorCreds, cursor?: string): Promise<{ carts: NormalizedCart[]; next?: string }>` exported from `@/lib/orders/connectors/quickshop`
  - `export interface NormalizedCart { externalId: string; email: string | null; items: unknown[]; subtotal: string | null; checkoutStep: string | null; reminderCount: number; reminderSentAt: string | null; recoveredAt: string | null; abandonedAt: string | null; raw: unknown }`
  - `upsertBrandCarts(accountId: string, carts: NormalizedCart[]): Promise<number>` from `@/lib/carts/brand-carts`
  - `backfillAccountCarts(accountId: string, opts?: { maxPages?: number }): Promise<{ imported: number; pages: number }>` from `@/lib/carts/backfill`

- [ ] **Step 1: Write the failing test**

`tests/unit/quickshop-cart-sync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { upserts: [], lastConflict: null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(_table: string) {
      const ctx: any = {};
      ctx.upsert = (rows: any, opts: any) => {
        state.upserts.push(...(Array.isArray(rows) ? rows : [rows]));
        state.lastConflict = opts?.onConflict ?? null;
        return Promise.resolve({ data: null, error: null });
      };
      return ctx;
    },
  },
}));

import { upsertBrandCarts } from '@/lib/carts/brand-carts';
import { listAbandonedCarts } from '@/lib/orders/connectors/quickshop';
import type { NormalizedCart } from '@/lib/orders/connectors/quickshop';

const wire = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  email: 'Dana@Example.COM',
  items: [{ name: 'Argan Oil', quantity: 1, price: 45.9 }],
  subtotal: 142.7,
  checkout_step: 'payment',
  reminder_count: 1,
  reminder_sent_at: '2026-07-26T15:26:48.054Z',
  recovered_at: null,
  created_at: '2026-07-26T14:01:02.746Z',
  updated_at: '2026-07-26T15:26:48.054Z',
  ...over,
});

describe('quickshop abandoned-cart sync', () => {
  beforeEach(() => { state.upserts = []; state.lastConflict = null; vi.restoreAllMocks(); });

  it('maps the wire payload and follows pagination via has_next', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      headers: new Headers({ 'X-RateLimit-Remaining': '50' }),
      json: async () => ({
        data: [wire(url.includes('page=2') ? 'c2' : 'c1')],
        meta: { pagination: { page: url.includes('page=2') ? 2 : 1, limit: 100, total: 2, total_pages: 2, has_next: !url.includes('page=2'), has_prev: false } },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const first = await listAbandonedCarts({ apiKey: 'qs_live_x' } as any);
    expect(first.carts).toHaveLength(1);
    expect(first.carts[0].externalId).toBe('c1');
    expect(first.carts[0].subtotal).toBe('142.7');
    expect(first.carts[0].reminderCount).toBe(1);
    expect(first.carts[0].abandonedAt).toBe('2026-07-26T14:01:02.746Z');
    expect(first.next).toBe('2');

    const second = await listAbandonedCarts({ apiKey: 'qs_live_x' } as any, '2');
    expect(second.carts[0].externalId).toBe('c2');
    expect(second.next).toBeUndefined();
  });

  it('waits for the rate-limit reset when the budget is exhausted', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '2' }),
      json: async () => ({ data: [wire('c1')], meta: { pagination: { has_next: false } } }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    const sleep = vi.spyOn(global, 'setTimeout');
    await listAbandonedCarts({ apiKey: 'qs_live_x' } as any);
    expect(sleep).toHaveBeenCalled();
  });

  it('upsert is idempotent on (account_id, external_id) and normalizes the email', async () => {
    const cart: NormalizedCart = {
      externalId: 'c1', email: '  Dana@Example.COM ', items: [], subtotal: '142.7',
      checkoutStep: 'payment', reminderCount: 1, reminderSentAt: null, recoveredAt: null,
      abandonedAt: '2026-07-26T14:01:02.746Z', raw: {},
    };
    const written = await upsertBrandCarts('acc-1', [cart, cart]);
    expect(written).toBe(2);
    expect(state.lastConflict).toBe('account_id,external_id');
    expect(state.upserts[0].email_norm).toBe('dana@example.com');
    expect(state.upserts[0].abandoned_at).toBe('2026-07-26T14:01:02.746Z');
  });

  it('skips carts with no created_at rather than writing a null abandoned_at', async () => {
    const bad: NormalizedCart = {
      externalId: 'c9', email: null, items: [], subtotal: null, checkoutStep: null,
      reminderCount: 0, reminderSentAt: null, recoveredAt: null, abandonedAt: null, raw: {},
    };
    const written = await upsertBrandCarts('acc-1', [bad]);
    expect(written).toBe(0);
    expect(state.upserts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/quickshop-cart-sync.test.ts`
Expected: FAIL — cannot resolve `@/lib/carts/brand-carts`.

- [ ] **Step 3: Add the connector method**

Append to `src/lib/orders/connectors/quickshop.ts`, above `registerConnector(quickShopConnector);`:

```ts
// ---- Abandoned carts ----
// GET /abandoned-carts is not part of the OrderConnector interface (only QuickShop
// exposes it), so it ships as a named export rather than a connector method.
// Observed 2026-07-26 across 14,416 rows on two stores: recovered_at is ALWAYS
// null and reminder_count >= 1 on 99.9% — the endpoint serves unrecovered carts
// only. Recovery is therefore derived downstream, not read from here.
export interface QuickShopAbandonedCart {
  id: string;
  email?: string | null;
  items?: unknown[] | null;
  subtotal?: string | number | null;
  checkout_step?: string | null;
  reminder_count?: number | null;
  reminder_sent_at?: string | null;
  recovered_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface NormalizedCart {
  externalId: string;
  email: string | null;
  items: unknown[];
  subtotal: string | null;
  checkoutStep: string | null;
  reminderCount: number;
  reminderSentAt: string | null;
  recoveredAt: string | null;
  abandonedAt: string | null;
  raw: unknown;
}

function mapCart(c: QuickShopAbandonedCart): NormalizedCart {
  return {
    externalId: String(c.id),
    email: c.email ?? null,
    items: Array.isArray(c.items) ? c.items : [],
    subtotal: asString(c.subtotal ?? null),
    checkoutStep: c.checkout_step ?? null,
    reminderCount: Number(c.reminder_count ?? 0) || 0,
    reminderSentAt: c.reminder_sent_at ?? null,
    recoveredAt: c.recovered_at ?? null,
    abandonedAt: c.created_at ?? null,
    raw: c,
  };
}

export async function listAbandonedCarts(
  creds: OrderConnectorCreds,
  cursor?: string
): Promise<{ carts: NormalizedCart[]; next?: string }> {
  const page = cursor ? parseInt(cursor, 10) : 1;
  const res = await qsFetch(creds, `/abandoned-carts?page=${page}&limit=100`);
  if (!res.ok) throw new Error(`quickshop abandoned-carts failed: ${res.status}`);

  // Same rate-limit courtesy as list(): 100 req/min per key, and a full Argania
  // backfill is ~80 pages.
  const remaining = Number(res.headers.get('X-RateLimit-Remaining') ?? '99');
  const resetSec = Number(res.headers.get('X-RateLimit-Reset') ?? '0');
  if (remaining <= 1 && resetSec > 0) {
    await new Promise((r) => setTimeout(r, Math.min(resetSec, 60) * 1000));
  }

  const body = (await res.json()) as QuickShopListResponse<QuickShopAbandonedCart>;
  const carts = (body.data || []).map(mapCart);
  const next = body.meta?.pagination?.has_next ? String(page + 1) : undefined;
  return { carts, next };
}
```

- [ ] **Step 4: Write the upsert**

`src/lib/carts/brand-carts.ts`:

```ts
/**
 * Persists abandoned carts. Mirrors src/lib/orders/brand-orders.ts:
 * idempotent upsert on (account_id, external_id) so a re-run of the sweep
 * refreshes reminder_count / recovered_at without duplicating rows.
 */
import { supabase } from '@/lib/supabase';
import { normalizeEmail } from '@/lib/analytics/value-proof/identity';
import type { NormalizedCart } from '@/lib/orders/connectors/quickshop';

export async function upsertBrandCarts(accountId: string, carts: NormalizedCart[]): Promise<number> {
  // abandoned_at is NOT NULL — a cart with no created_at is unusable for any
  // time-windowed metric, so drop it rather than fail the whole batch.
  const rows = carts
    .filter((c) => !!c.abandonedAt)
    .map((c) => ({
      account_id: accountId,
      external_id: c.externalId,
      email: c.email,
      email_norm: normalizeEmail(c.email),
      items: c.items,
      subtotal: c.subtotal,
      checkout_step: c.checkoutStep,
      reminder_count: c.reminderCount,
      reminder_sent_at: c.reminderSentAt,
      recovered_at: c.recoveredAt,
      abandoned_at: c.abandonedAt,
      raw: c.raw,
      synced_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('brand_abandoned_carts')
    .upsert(rows, { onConflict: 'account_id,external_id' });

  if (error) {
    console.error('[brand-carts] upsert failed:', error.message);
    return 0;
  }
  return rows.length;
}
```

- [ ] **Step 5: Write the backfill**

`src/lib/carts/backfill.ts`:

```ts
/**
 * Pages QuickShop's abandoned-cart list into brand_abandoned_carts.
 * Unbounded by default (first run imports the full history — ~80 pages for
 * Argania's 7,993 carts); the cron passes a bound for routine sweeps.
 */
import { supabase } from '@/lib/supabase';
import { listAbandonedCarts } from '@/lib/orders/connectors/quickshop';
import { upsertBrandCarts } from '@/lib/carts/brand-carts';

const HARD_PAGE_CAP = 500; // runaway backstop, not a business limit

export async function backfillAccountCarts(
  accountId: string,
  opts: { maxPages?: number } = {}
): Promise<{ imported: number; pages: number }> {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new Error(`account load failed: ${error.message}`);

  const qs = (account as any)?.config?.integrations?.quickshop;
  if (!qs?.enabled || !qs?.api_key) throw new Error('quickshop not configured for account');

  const cap = Math.min(opts.maxPages ?? HARD_PAGE_CAP, HARD_PAGE_CAP);
  let cursor: string | undefined;
  let imported = 0;
  let pages = 0;

  while (pages < cap) {
    const { carts, next } = await listAbandonedCarts({ apiKey: qs.api_key } as any, cursor);
    pages += 1;
    imported += await upsertBrandCarts(accountId, carts);
    if (!next) break;
    cursor = next;
  }

  // A bounded run that stopped early is not a complete history — say so rather
  // than let the caller assume full coverage.
  if (pages >= cap) console.warn('[carts/backfill] page cap reached for', accountId, 'pages:', pages);

  return { imported, pages };
}
```

- [ ] **Step 6: Write the cron route**

`src/app/api/cron/quickshop-cart-sync/route.ts`:

```ts
/**
 * QuickShop abandoned-cart sync. Mirrors /api/cron/quickshop-order-sync, but
 * scoped to QuickShop-integrated accounts only — cart metrics do not require
 * WhatsApp CS to be enabled, unlike order lookup.
 *
 * Auth: CRON_SECRET via Authorization: Bearer.
 * Schedule: hourly (vercel.json) — carts move far slower than orders.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { backfillAccountCarts } from '@/lib/carts/backfill';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_PAGES_PER_ACCOUNT = 20; // ~2,000 most-recent carts per hourly run

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || (req.headers.get('authorization') || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .filter('config->integrations->quickshop->>enabled', 'eq', 'true');

  if (error) {
    console.error('[cron/quickshop-cart-sync] account query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const synced: { accountId: string; imported: number; pages: number }[] = [];
  const errors: { accountId: string; error: string }[] = [];

  for (const row of accounts || []) {
    const accountId = (row as any).id as string;
    try {
      synced.push({ accountId, ...(await backfillAccountCarts(accountId, { maxPages: MAX_PAGES_PER_ACCOUNT })) });
    } catch (e) {
      const message = (e as Error)?.message || 'unknown error';
      console.error('[cron/quickshop-cart-sync] failed for', accountId, message);
      errors.push({ accountId, error: message });
    }
  }

  return NextResponse.json({ ok: true, accounts: (accounts || []).length, synced, errors });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/quickshop-cart-sync.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Schedule the cron**

In `vercel.json`, add to the `crons` array (match the existing entries' formatting exactly):

```json
{ "path": "/api/cron/quickshop-cart-sync", "schedule": "17 * * * *" }
```

- [ ] **Step 9: Backfill the two accounts and verify against the API's own totals**

Run the backfill once per account (unbounded) via a one-off node invocation or by hitting the cron route locally with `CRON_SECRET`, then:

```sql
select account_id::text, count(*) n, min(abandoned_at)::date lo, max(abandoned_at)::date hi,
       count(email_norm) w_email, round(sum(subtotal)) at_risk
  from brand_abandoned_carts group by 1;
```

Expected: Argania ≈ 7,993 rows from 2026-01-12, ≈₪2,297,225 at risk; Pasha ≈ 6,423 rows from 2025-08-05, ≈₪2,643,296. Counts drift upward with new carts — a materially LOWER count means pagination stopped early.

- [ ] **Step 10: Commit**

```bash
git add src/lib/orders/connectors/quickshop.ts src/lib/carts/brand-carts.ts src/lib/carts/backfill.ts src/app/api/cron/quickshop-cart-sync/route.ts vercel.json tests/unit/quickshop-cart-sync.test.ts
git commit -m "feat(value-proof): sync QuickShop abandoned carts into brand_abandoned_carts"
```

---

## Task 5: Attribution refresh job

**Files:**
- Create: `src/lib/analytics/value-proof/refresh.ts`
- Create: `src/app/api/cron/value-proof-refresh/route.ts`
- Modify: `vercel.json`
- Test: `tests/unit/value-proof-refresh.test.ts`

**Interfaces:**
- Consumes: `buildTouchIndex`, `attributeOrder`, `attributeCart`, `isAttributableOrder` (Task 2); `normalizePhone`, `normalizeEmail` (Task 1); `bestie_conversation_touches` view (Task 3).
- Produces: `refreshAccountAttribution(accountId: string): Promise<{ orders: number; carts: number; tiers: Record<Tier, number> }>` from `@/lib/analytics/value-proof/refresh`.

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-refresh.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: any = { touches: [], orders: [], carts: [], beacons: [], upserts: [] };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const ctx: any = { _table: table };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.gt = () => ctx;
      ctx.order = () => ctx;
      ctx.range = () => ctx;
      ctx.upsert = (r: any[], opts: any) => {
        rows.upserts.push(...r);
        rows.lastConflict = opts?.onConflict;
        return Promise.resolve({ error: null });
      };
      ctx.then = (resolve: any) => {
        const map: Record<string, any[]> = {
          bestie_conversation_touches: rows.touches,
          brand_orders: rows.orders,
          brand_abandoned_carts: rows.carts,
          widget_events: rows.beacons,
        };
        return resolve({ data: map[table] ?? [], error: null });
      };
      return ctx;
    },
  },
}));

import { refreshAccountAttribution } from '@/lib/analytics/value-proof/refresh';

describe('refreshAccountAttribution', () => {
  beforeEach(() => { rows.touches = []; rows.orders = []; rows.carts = []; rows.beacons = []; rows.upserts = []; });

  it('writes one attribution row per order with the resolved tier', async () => {
    rows.touches = [{ touch_at: '2026-07-01T10:00:00Z', surface: 'support', anon_id: null, phone: '972501234567', email: null }];
    rows.orders = [
      { id: 'o1', placed_at: '2026-07-01T12:00:00Z', total: '200', customer_phone: '0501234567', customer_email: null, raw: {} },
      { id: 'o2', placed_at: '2026-07-01T12:00:00Z', total: '150', customer_phone: null, customer_email: null, raw: { utm_source: 'bestie' } },
      { id: 'o3', placed_at: '2026-07-01T12:00:00Z', total: '0',   customer_phone: '0501234567', customer_email: null, raw: { utm_source: 'pos' } },
    ];

    const out = await refreshAccountAttribution('acc-1');
    expect(out.orders).toBe(3);
    expect(rows.lastConflict).toBe('account_id,subject_kind,subject_id');

    const byId = Object.fromEntries(rows.upserts.map((r: any) => [r.subject_id, r]));
    expect(byId.o1.tier).toBe('influenced');
    expect(byId.o1.match_key).toBe('phone');
    expect(byId.o2.tier).toBe('direct');
    expect(byId.o3.tier).toBe('none');   // ₪0 + POS is never attributed
    expect(out.tiers.direct).toBe(1);
    expect(out.tiers.influenced).toBe(1);
    expect(out.tiers.none).toBe(1);
  });

  it('uses the thank-you beacon anon_id to reach the assisted tier', async () => {
    rows.touches = [{ touch_at: '2026-07-01T10:00:00Z', surface: 'chat', anon_id: 'anon-9', phone: null, email: null }];
    rows.beacons = [{ anon_id: 'anon-9', payload: { order_number: '1042' } }];
    rows.orders = [{ id: 'o1', order_number: '1042', placed_at: '2026-07-01T12:00:00Z', total: '200', customer_phone: null, customer_email: null, raw: {} }];

    await refreshAccountAttribution('acc-1');
    expect(rows.upserts[0].tier).toBe('assisted');
    expect(rows.upserts[0].match_key).toBe('anon_id');
  });

  it('derives cart recovery from a later order by the same email', async () => {
    rows.touches = [];
    rows.carts = [{ id: 'c1', abandoned_at: '2026-07-01T10:00:00Z', subtotal: '300', email_norm: 'dana@example.com' }];
    rows.orders = [{ id: 'o1', placed_at: '2026-07-03T10:00:00Z', total: '310', customer_phone: null, customer_email: 'Dana@Example.com', raw: {} }];

    const out = await refreshAccountAttribution('acc-1');
    expect(out.carts).toBe(1);
    const cart = rows.upserts.find((r: any) => r.subject_kind === 'cart');
    expect(cart.recovered_at).toBe('2026-07-03T10:00:00.000Z');
  });

  it('does not treat an order BEFORE the cart as a recovery', async () => {
    rows.carts = [{ id: 'c1', abandoned_at: '2026-07-05T10:00:00Z', subtotal: '300', email_norm: 'dana@example.com' }];
    rows.orders = [{ id: 'o1', placed_at: '2026-07-01T10:00:00Z', total: '310', customer_phone: null, customer_email: 'dana@example.com', raw: {} }];

    await refreshAccountAttribution('acc-1');
    const cart = rows.upserts.find((r: any) => r.subject_kind === 'cart');
    expect(cart.recovered_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/value-proof-refresh.test.ts`
Expected: FAIL — cannot resolve `@/lib/analytics/value-proof/refresh`.

- [ ] **Step 3: Write the refresh job**

`src/lib/analytics/value-proof/refresh.ts`:

```ts
/**
 * Recomputes bestie_attribution for one account.
 *
 * Tier logic is NOT duplicated here — it comes from ./attribute, which is pure
 * and unit-tested. This module only loads inputs, applies it, and writes rows.
 *
 * Cart recovery is DERIVED (QuickShop never populates recovered_at): a cart is
 * recovered when the same email places a later paid, non-POS order. The 30-day
 * horizon is the reported outer bound; 24h and 7d are computed downstream from
 * the same recovered_at + abandoned_at pair.
 */
import { supabase } from '@/lib/supabase';
import { normalizeEmail, normalizePhone } from './identity';
import { attributeCart, attributeOrder, buildTouchIndex, isAttributableOrder } from './attribute';
import type { AttributableCart, AttributableOrder, Tier, TouchRecord } from './types';

const RECOVERY_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE = 1000; // PostgREST caps a fetch at 1000 rows — page explicitly

async function fetchAll<T>(table: string, columns: string, accountId: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq(table === 'bestie_conversation_touches' ? 'account_id' : 'account_id', accountId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} load failed: ${error.message}`);
    const batch = (data || []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

export async function refreshAccountAttribution(
  accountId: string
): Promise<{ orders: number; carts: number; tiers: Record<Tier, number> }> {
  const [touchRows, orderRows, cartRows, beaconRows] = await Promise.all([
    fetchAll<any>('bestie_conversation_touches', 'touch_at,surface,anon_id,phone,email', accountId),
    fetchAll<any>('brand_orders', 'id,order_number,placed_at,total,customer_phone,customer_email,raw', accountId),
    fetchAll<any>('brand_abandoned_carts', 'id,abandoned_at,subtotal,email_norm', accountId),
    fetchAll<any>('widget_events', 'anon_id,payload', accountId),
  ]);

  const touches: TouchRecord[] = touchRows
    .filter((t) => !!t.touch_at)
    .map((t) => ({
      touchAt: Date.parse(t.touch_at),
      surface: t.surface,
      anonId: t.anon_id || null,
      phone: t.phone || null,   // the view already normalizes via bestie_wa_id
      email: t.email || null,
    }));
  const index = buildTouchIndex(touches);

  // Thank-you beacons: order_number → anon_id. The beacon rides the existing
  // widget_events pipeline as `widget_conversion_detected`, so there is no
  // separate table to join.
  const anonByOrderNumber = new Map<string, string>();
  for (const b of beaconRows) {
    const num = String(b?.payload?.order_number || '').replace(/^#/, '').trim();
    if (num && b.anon_id) anonByOrderNumber.set(num, b.anon_id);
  }

  // Paid, non-POS orders keyed by email — the basis for derived cart recovery.
  const paidOrdersByEmail = new Map<string, number[]>();
  const orders: AttributableOrder[] = [];
  for (const o of orderRows) {
    if (!o.placed_at) continue;
    const amount = Number(o.total) || 0;
    const utmSource = (o.raw?.utm_source ?? null) as string | null;
    const email = normalizeEmail(o.customer_email);
    const occurredAt = Date.parse(o.placed_at);
    orders.push({
      id: o.id,
      occurredAt,
      amount,
      utmSource,
      anonId: anonByOrderNumber.get(String(o.order_number || '').replace(/^#/, '').trim()) || null,
      phone: normalizePhone(o.customer_phone),
      email,
    });
    if (email && isAttributableOrder({ amount, utmSource })) {
      const list = paidOrdersByEmail.get(email);
      if (list) list.push(occurredAt);
      else paidOrdersByEmail.set(email, [occurredAt]);
    }
  }

  const carts: AttributableCart[] = cartRows
    .filter((c) => !!c.abandoned_at)
    .map((c) => ({
      id: c.id,
      occurredAt: Date.parse(c.abandoned_at),
      amount: Number(c.subtotal) || 0,
      email: c.email_norm || null,
    }));

  const tiers: Record<Tier, number> = { direct: 0, assisted: 0, influenced: 0, none: 0 };
  const rows: any[] = [];

  for (const o of orders) {
    const a = attributeOrder(o, index);
    tiers[a.tier] += 1;
    rows.push({
      account_id: accountId,
      subject_kind: 'order',
      subject_id: o.id,
      tier: a.tier,
      match_key: a.matchKey,
      touch_at: a.touchAt === null ? null : new Date(a.touchAt).toISOString(),
      lag_sec: a.lagSec,
      amount: o.amount,
      occurred_at: new Date(o.occurredAt).toISOString(),
      recovered_at: null,
      computed_at: new Date().toISOString(),
    });
  }

  for (const c of carts) {
    const a = attributeCart(c, index);
    const candidates = (c.email ? paidOrdersByEmail.get(c.email) : undefined) || [];
    const recovery = candidates
      .filter((t) => t > c.occurredAt && t - c.occurredAt <= RECOVERY_HORIZON_MS)
      .sort((x, y) => x - y)[0];
    rows.push({
      account_id: accountId,
      subject_kind: 'cart',
      subject_id: c.id,
      tier: a.tier,
      match_key: a.matchKey,
      touch_at: a.touchAt === null ? null : new Date(a.touchAt).toISOString(),
      lag_sec: a.lagSec,
      amount: c.amount,
      occurred_at: new Date(c.occurredAt).toISOString(),
      recovered_at: recovery === undefined ? null : new Date(recovery).toISOString(),
      computed_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < rows.length; i += PAGE) {
    const { error } = await supabase
      .from('bestie_attribution')
      .upsert(rows.slice(i, i + PAGE), { onConflict: 'account_id,subject_kind,subject_id' });
    if (error) throw new Error(`attribution upsert failed: ${error.message}`);
  }

  return { orders: orders.length, carts: carts.length, tiers };
}
```

- [ ] **Step 4: Write the cron route**

`src/app/api/cron/value-proof-refresh/route.ts`:

```ts
/**
 * Nightly attribution refresh. Recomputes bestie_attribution for every
 * QuickShop-integrated account. Idempotent — a re-run overwrites in place.
 *
 * Auth: CRON_SECRET via Authorization: Bearer. Schedule: nightly (vercel.json).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { refreshAccountAttribution } from '@/lib/analytics/value-proof/refresh';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || (req.headers.get('authorization') || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .filter('config->integrations->quickshop->>enabled', 'eq', 'true');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const refreshed: any[] = [];
  const errors: { accountId: string; error: string }[] = [];
  for (const row of accounts || []) {
    const accountId = (row as any).id as string;
    try {
      refreshed.push({ accountId, ...(await refreshAccountAttribution(accountId)) });
    } catch (e) {
      errors.push({ accountId, error: (e as Error)?.message || 'unknown error' });
    }
  }
  return NextResponse.json({ ok: true, refreshed, errors });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/value-proof-refresh.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Schedule the cron**

Add to `vercel.json` `crons`:

```json
{ "path": "/api/cron/value-proof-refresh", "schedule": "40 2 * * *" }
```

- [ ] **Step 7: Run the refresh for both accounts and reconcile against the report**

After running it for Argania and Pasha:

```sql
select account_id::text, subject_kind, tier, count(*) n, round(sum(amount)) amount
  from bestie_attribution group by 1,2,3 order by 1,2,4 desc;
```

Expected for Argania orders: `direct` ≈ 149 rows / ≈₪24,579, `influenced` ≈ 12 rows / ≈₪2,320, `assisted` = 0 (no beacon data yet), the rest `none`. Pasha orders: `direct` ≈ 17 / ≈₪2,713, `influenced` 0. These are the numbers in `docs/reports/2026-07-26-value-proof-argania-pasha.md` — **a mismatch here means the job is wrong, not the report.** Counts drift upward with new orders; a mismatch in the *hundreds* is a bug.

Also check derived cart recovery:

```sql
select account_id::text,
       count(*) filter (where subject_kind='cart') carts,
       count(*) filter (where subject_kind='cart' and recovered_at is not null
                        and recovered_at - occurred_at <= interval '7 days') recovered_7d
  from bestie_attribution group by 1;
```

Expected: Argania ≈ 1,676 recovered within 7d of ≈7,959 carts with an email; Pasha ≈ 2,123 of ≈6,420.

- [ ] **Step 8: Commit**

```bash
git add src/lib/analytics/value-proof/refresh.ts src/app/api/cron/value-proof-refresh/route.ts vercel.json tests/unit/value-proof-refresh.test.ts
git commit -m "feat(value-proof): attribution refresh job with derived cart recovery"
```

---

## Task 6: The metric envelope and the summary RPC

**Files:**
- Modify: `supabase/migrations/071_value_proof.sql` (append the RPC)
- Create: `src/lib/analytics/value-proof/metrics.ts`
- Test: `tests/unit/value-proof-metrics.test.ts`

**Interfaces:**
- Consumes: `Metric`, `LOW_CONFIDENCE_N` from `./types`; `bestie_attribution` and the base tables.
- Produces:
  - SQL `value_proof_summary(p_account_id uuid, p_since timestamptz, p_until timestamptz) returns json`
  - `metric<T>(value: T | null, n: number, basis: string): Metric<T>`
  - `notMeasured(basis: string): Metric<never>`
  - `matchedComparison(a: { value: number; n: number; from: string }, b: { value: number; n: number; from: string }, basis: string): Metric<{ withChat: number; without: number; deltaPct: number }>`
  - `buildValueProof(raw: any, opts: { audience: 'admin' | 'brand'; costPerTicket: number | null }): ValueProofSummary`

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { metric, notMeasured, matchedComparison, buildValueProof } from '@/lib/analytics/value-proof/metrics';

describe('metric envelope', () => {
  it('marks n<30 as low confidence but still reports the value', () => {
    const m = metric(0.224, 17, 'attributed orders / conversations');
    expect(m.measured).toBe(true);
    expect(m.lowConfidence).toBe(true);
    expect(m.value).toBe(0.224);
    expect(m.n).toBe(17);
  });

  it('does not flag n>=30', () => {
    expect(metric(0.095, 1703, 'x').lowConfidence).toBe(false);
  });

  it('notMeasured is null, never zero', () => {
    const m = notMeasured('chat_handoffs is empty — feature not built');
    expect(m.measured).toBe(false);
    expect(m.value).toBeNull();
    expect(m.value).not.toBe(0);
  });

  it('a comparison across mismatched windows is not measured', () => {
    const m = matchedComparison(
      { value: 165.0, n: 149, from: '2026-06-12' },
      { value: 160.9, n: 26056, from: '2026-01-07' },   // <- unmatched window
      'AOV',
    );
    expect(m.measured).toBe(false);
    expect(m.value).toBeNull();
  });

  it('a period-matched comparison reports the delta', () => {
    const m = matchedComparison(
      { value: 165.0, n: 149, from: '2026-06-12' },
      { value: 173.3, n: 8996, from: '2026-06-12' },
      'AOV',
    );
    expect(m.measured).toBe(true);
    expect(m.value!.deltaPct).toBeCloseTo(-4.79, 1);
    expect(m.value!.withChat).toBe(165.0);
  });
});

describe('buildValueProof', () => {
  const raw = {
    window: { since: '2026-06-12T00:00:00Z', until: '2026-07-26T00:00:00Z' },
    attributed: {
      direct: { n: 149, revenue: 24579 }, assisted: { n: 0, revenue: 0 },
      influenced: { n: 12, revenue: 2320 }, none: { n: 8984, revenue: 1533472 },
    },
    conversations: 1703,
    deflected: 1487,
    tickets: 446,
    auto_escalations: 4,
    handoffs: 0,
    escalation_reasons: [],
    tickets_resolved: 386,
    close_seconds_p50: 201240,
    latency_samples: 0,
    carts: { with_email: 7959, recovered_7d: 1676, recovered_7d_value: 507356, bestie_touched: 20 },
    aov: { bestie: 165.0, other: 173.3, bestie_n: 149, other_n: 8996 },
    setup_days: 1,
    dashboard_visits: 0,
  };

  it('reports the three tiers separately and never as one number', () => {
    const out = buildValueProof(raw, { audience: 'admin', costPerTicket: null });
    expect(out.revenue.byTier.direct.value).toBe(24579);
    expect(out.revenue.byTier.assisted.measured).toBe(false);   // 0 rows -> not measured
    expect(out.revenue.byTier.influenced.value).toBe(2320);
    expect(out.revenue.total.value).toBe(26899);
    expect(out.revenue.total.basis).toContain('direct');
  });

  it('deflection in shekels is not measured until cost per ticket is supplied', () => {
    expect(buildValueProof(raw, { audience: 'admin', costPerTicket: null }).deflection.value_ils.measured).toBe(false);
    const withCost = buildValueProof(raw, { audience: 'admin', costPerTicket: 12 });
    expect(withCost.deflection.value_ils.value).toBe(1487 * 12);
  });

  it('first-response latency is not measured when there are no latency samples', () => {
    expect(buildValueProof(raw, { audience: 'admin', costPerTicket: null }).responseTime.firstResponse.measured).toBe(false);
  });

  it('escalation reasons are not measured when none are recorded', () => {
    expect(buildValueProof(raw, { audience: 'admin', costPerTicket: null }).escalation.byReason.measured).toBe(false);
  });

  it('the brand audience never receives accuracy, setup time, or usage', () => {
    const brand = buildValueProof(raw, { audience: 'brand', costPerTicket: 12 }) as any;
    expect(brand.accuracy).toBeUndefined();
    expect(brand.setup).toBeUndefined();
    expect(brand.clientUsage).toBeUndefined();
    expect(brand.revenue).toBeDefined();
    expect(brand.escalation).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/value-proof-metrics.test.ts`
Expected: FAIL — cannot resolve `@/lib/analytics/value-proof/metrics`.

- [ ] **Step 3: Write the envelope module**

`src/lib/analytics/value-proof/metrics.ts`:

```ts
/**
 * The honesty layer. Every number leaves here wrapped in a Metric envelope, so
 * the UI can render "not measured" instead of a zero that reads like a result.
 *
 * Three rules are enforced HERE rather than trusted to callers:
 *  1. A metric with no data source reports measured:false and value:null.
 *  2. A comparison whose two sides do not share a start date is not measured —
 *     this is the exact error that produced a flattering +2.5% AOV instead of
 *     the real -4.8% (see spec §1.3).
 *  3. n < 30 sets lowConfidence so the UI can print n beside the percentage.
 */
import { LOW_CONFIDENCE_N, type Metric } from './types';

export function metric<T>(value: T | null, n: number, basis: string): Metric<T> {
  if (value === null || value === undefined) return notMeasured(basis) as Metric<T>;
  return { value, n, measured: true, lowConfidence: n < LOW_CONFIDENCE_N, basis };
}

export function notMeasured(basis: string): Metric<never> {
  return { value: null, n: 0, measured: false, lowConfidence: false, basis };
}

export interface ComparisonSide { value: number; n: number; from: string }
export interface Comparison { withChat: number; without: number; deltaPct: number }

/**
 * Both sides MUST start on the same date. An unmatched window measures the
 * campaign calendar, not Bestie, so it is refused rather than reported.
 */
export function matchedComparison(a: ComparisonSide, b: ComparisonSide, basis: string): Metric<Comparison> {
  if (a.from !== b.from) {
    return notMeasured(`${basis} — windows not matched (${a.from} vs ${b.from})`) as Metric<Comparison>;
  }
  if (!(b.value > 0)) return notMeasured(`${basis} — no comparison baseline`) as Metric<Comparison>;
  return metric<Comparison>(
    { withChat: a.value, without: b.value, deltaPct: (a.value / b.value - 1) * 100 },
    Math.min(a.n, b.n),
    `${basis} — both sides from ${a.from}`,
  );
}

export interface ValueProofSummary {
  window: { since: string; until: string };
  revenue: {
    byTier: Record<'direct' | 'assisted' | 'influenced', Metric<number>>;
    total: Metric<number>;
    orders: Record<'direct' | 'assisted' | 'influenced', Metric<number>>;
  };
  conversion: Metric<number>;
  aov: Metric<Comparison>;
  carts: { recoveryRate: Metric<number>; recoveredValue: Metric<number>; bestieTouched: Metric<number>; platformBaseline: Metric<number> };
  deflection: { rate: Metric<number>; value_ils: Metric<number> };
  responseTime: { firstResponse: Metric<number>; timeToClose: Metric<number> };
  escalation: { gaveUpRate: Metric<number>; anyHumanRate: Metric<number>; byReason: Metric<Array<{ reason: string; n: number }>> };
  accuracy?: Metric<number>;
  setup?: { days: Metric<number>; staffHours: Metric<number> };
  clientUsage?: Metric<number>;
}

const day = (iso: string) => iso.slice(0, 10);

export function buildValueProof(
  raw: any,
  opts: { audience: 'admin' | 'brand'; costPerTicket: number | null }
): ValueProofSummary {
  const since = day(raw.window.since);
  const tierRevenue = (tier: 'direct' | 'assisted' | 'influenced'): Metric<number> => {
    const t = raw.attributed?.[tier];
    // 0 rows in a tier means we could not see it, not that it earned nothing.
    if (!t || t.n === 0) return notMeasured(`${tier} tier — no attributable rows in window`) as Metric<number>;
    return metric(t.revenue, t.n, `${tier} tier`);
  };
  const tierOrders = (tier: 'direct' | 'assisted' | 'influenced'): Metric<number> => {
    const t = raw.attributed?.[tier];
    if (!t || t.n === 0) return notMeasured(`${tier} tier — no attributable rows in window`) as Metric<number>;
    return metric(t.n, t.n, `${tier} tier`);
  };

  const attributedOrders =
    (raw.attributed?.direct?.n || 0) + (raw.attributed?.assisted?.n || 0) + (raw.attributed?.influenced?.n || 0);
  const attributedRevenue =
    (raw.attributed?.direct?.revenue || 0) + (raw.attributed?.assisted?.revenue || 0) + (raw.attributed?.influenced?.revenue || 0);

  const summary: ValueProofSummary = {
    window: { since: raw.window.since, until: raw.window.until },

    revenue: {
      byTier: { direct: tierRevenue('direct'), assisted: tierRevenue('assisted'), influenced: tierRevenue('influenced') },
      orders: { direct: tierOrders('direct'), assisted: tierOrders('assisted'), influenced: tierOrders('influenced') },
      total: metric(attributedRevenue, attributedOrders, 'sum of direct + assisted + influenced — always shown with the per-tier breakdown'),
    },

    conversion: raw.conversations > 0
      ? metric(attributedOrders / raw.conversations, raw.conversations, 'attributed orders / conversations with >=1 user message')
      : notMeasured('no conversations in window') as Metric<number>,

    aov: matchedComparison(
      { value: raw.aov?.bestie ?? 0, n: raw.aov?.bestie_n ?? 0, from: since },
      { value: raw.aov?.other ?? 0, n: raw.aov?.other_n ?? 0, from: since },
      'AOV',
    ),

    carts: {
      recoveryRate: raw.carts?.with_email > 0
        ? metric(raw.carts.recovered_7d / raw.carts.with_email, raw.carts.with_email, 'derived: same email ordered within 7d')
        : notMeasured('no carts with an email') as Metric<number>,
      recoveredValue: raw.carts?.with_email > 0
        ? metric(raw.carts.recovered_7d_value, raw.carts.recovered_7d, 'cart subtotal of carts recovered within 7d')
        : notMeasured('no carts with an email') as Metric<number>,
      bestieTouched: raw.carts?.with_email > 0
        ? metric(raw.carts.bestie_touched, raw.carts.recovered_7d, 'recovered carts with a Bestie touch near abandonment')
        : notMeasured('no carts with an email') as Metric<number>,
      // QuickShop never populates recovered_at (14,416 rows checked 2026-07-26).
      platformBaseline: notMeasured('QuickShop /abandoned-carts returns recovered_at=null on every row') as Metric<number>,
    },

    deflection: {
      rate: raw.conversations > 0
        ? metric(raw.deflected / raw.conversations, raw.conversations, `upper bound — chat_handoffs has ${raw.handoffs} rows`)
        : notMeasured('no conversations in window') as Metric<number>,
      value_ils: opts.costPerTicket && opts.costPerTicket > 0
        ? metric(raw.deflected * opts.costPerTicket, raw.deflected, `deflected x cost per ticket (₪${opts.costPerTicket}, brand-supplied)`)
        : notMeasured('cost per ticket not supplied by the brand') as Metric<number>,
    },

    responseTime: {
      // chat_messages.created_at is a WRITE time, not a send time — 75% of pairs
      // are sub-second, which is impossible for a real model response.
      firstResponse: raw.latency_samples > 0
        ? metric(raw.latency_p50_ms ?? null, raw.latency_samples, 'median metadata.latency_ms on assistant messages')
        : notMeasured('no latency_ms samples yet — chat_messages timestamps are write times') as Metric<number>,
      timeToClose: raw.tickets_resolved > 0
        ? metric(raw.close_seconds_p50, raw.tickets_resolved, 'median ticket created_at -> resolved_at')
        : notMeasured('no resolved tickets in window') as Metric<number>,
    },

    escalation: {
      gaveUpRate: raw.conversations > 0
        ? metric(raw.auto_escalations / raw.conversations, raw.conversations, "support_requests where source='auto_escalation'")
        : notMeasured('no conversations in window') as Metric<number>,
      anyHumanRate: raw.conversations > 0
        ? metric(raw.tickets / raw.conversations, raw.conversations, 'any support ticket / conversations')
        : notMeasured('no conversations in window') as Metric<number>,
      byReason: (raw.escalation_reasons || []).length > 0
        ? metric(raw.escalation_reasons, raw.escalation_reasons.reduce((s: number, r: any) => s + r.n, 0), 'support_requests.escalation_reason')
        : notMeasured('escalation_reason not yet recorded on any ticket') as Metric<Array<{ reason: string; n: number }>>,
    },
  };

  if (opts.audience === 'admin') {
    summary.accuracy = notMeasured('no sampling process — separate project') as Metric<number>;
    summary.setup = {
      days: metric(raw.setup_days, 1, 'accounts.created_at -> first answered message'),
      staffHours: notMeasured('never recorded') as Metric<number>,
    };
    summary.clientUsage = raw.dashboard_visits > 0
      ? metric(raw.dashboard_visits, raw.dashboard_visits, 'dashboard_visit events per week')
      : notMeasured('no dashboard_visit events recorded yet') as Metric<number>;
  }

  return summary;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/value-proof-metrics.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Append the aggregation RPC to the migration**

Append to `supabase/migrations/071_value_proof.sql`. The RPC aggregates in Postgres for the same reason `widget_analytics_summary` does — PostgREST truncates a row fetch at 1,000, which would silently cut 26K orders.

```sql
-- ---------------------------------------------------------------------------
-- Raw aggregates for one account and window. Shape is consumed by
-- buildValueProof() in src/lib/analytics/value-proof/metrics.ts, which applies
-- the measured/lowConfidence rules. This function returns FACTS only — it never
-- decides whether something is "not measured".
-- ---------------------------------------------------------------------------
create or replace function value_proof_summary(
  p_account_id uuid,
  p_since      timestamptz,
  p_until      timestamptz
) returns json language sql stable as $$
  with conv as (
    select count(*)::int n from (
      select s.id from chat_sessions s
       where s.account_id = p_account_id and s.created_at between p_since and p_until
         and exists (select 1 from chat_messages m where m.session_id = s.id and m.role = 'user')
      union all
      select null from widget_sessions w
       where w.account_id = p_account_id and w.first_seen between p_since and p_until and w.sent_message
    ) x
  ),
  tick as (
    select count(*)::int total,
           count(*) filter (where source = 'auto_escalation')::int gave_up,
           count(*) filter (where resolved_at is not null)::int resolved,
           percentile_cont(0.5) within group (
             order by extract(epoch from (resolved_at - created_at))
           ) filter (where resolved_at > created_at) close_p50
      from support_requests
     where account_id = p_account_id and created_at between p_since and p_until
  ),
  deflect as (
    select count(*)::int n from chat_sessions s
     where s.account_id = p_account_id and s.created_at between p_since and p_until
       and exists (select 1 from chat_messages m where m.session_id = s.id and m.role = 'user')
       and not exists (select 1 from support_requests r where r.session_id = s.id)
  ),
  attr as (
    select tier, count(*)::int n, coalesce(sum(amount), 0) revenue
      from bestie_attribution
     where account_id = p_account_id and subject_kind = 'order'
       and occurred_at between p_since and p_until
     group by tier
  ),
  aovs as (
    select coalesce(avg(amount) filter (where tier <> 'none'), 0) bestie,
           coalesce(avg(amount) filter (where tier = 'none'), 0)  other,
           count(*) filter (where tier <> 'none')::int bestie_n,
           count(*) filter (where tier = 'none')::int  other_n
      from bestie_attribution
     where account_id = p_account_id and subject_kind = 'order'
       and occurred_at between p_since and p_until and amount > 0
  ),
  cart as (
    select count(*)::int with_email,
           count(*) filter (where recovered_at is not null
                            and recovered_at - occurred_at <= interval '7 days')::int recovered_7d,
           coalesce(sum(amount) filter (where recovered_at is not null
                            and recovered_at - occurred_at <= interval '7 days'), 0) recovered_7d_value,
           count(*) filter (where recovered_at is not null
                            and recovered_at - occurred_at <= interval '7 days'
                            and tier <> 'none')::int bestie_touched
      from bestie_attribution
     where account_id = p_account_id and subject_kind = 'cart'
       and occurred_at between p_since and p_until
  ),
  lat as (
    select count(*)::int n,
           percentile_cont(0.5) within group (order by (m.metadata->>'latency_ms')::numeric) p50
      from chat_messages m join chat_sessions s on s.id = m.session_id
     where s.account_id = p_account_id and m.created_at between p_since and p_until
       and m.role <> 'user' and (m.metadata ? 'latency_ms')
  ),
  reasons as (
    select coalesce(json_agg(row_to_json(r)), '[]'::json) j from (
      select escalation_reason reason, count(*)::int n
        from support_requests
       where account_id = p_account_id and created_at between p_since and p_until
         and escalation_reason is not null
       group by 1 order by 2 desc) r
  ),
  visits as (
    select count(distinct date_trunc('week', created_at))::int weeks, count(*)::int n
      from events
     where account_id = p_account_id and type = 'dashboard_visit'
       and created_at between p_since and p_until
  ),
  setup as (
    select greatest(0, extract(day from (
             (select min(m.created_at) from chat_messages m
                join chat_sessions s on s.id = m.session_id
               where s.account_id = p_account_id and m.role <> 'user')
             - (select created_at from accounts where id = p_account_id)
           )))::int days
  )
  select json_build_object(
    'window', json_build_object('since', p_since, 'until', p_until),
    'attributed', (
      select json_object_agg(t.tier, json_build_object('n', t.n, 'revenue', t.revenue))
        from (select unnest(array['direct','assisted','influenced','none']) tier) k
        left join attr t on t.tier = k.tier
    ),
    'conversations',      (select n from conv),
    'deflected',          (select n from deflect),
    'tickets',            (select total from tick),
    'auto_escalations',   (select gave_up from tick),
    'tickets_resolved',   (select resolved from tick),
    'close_seconds_p50',  (select close_p50 from tick),
    'handoffs',           (select count(*)::int from chat_handoffs where account_id = p_account_id),
    'escalation_reasons', (select j from reasons),
    'latency_samples',    (select n from lat),
    'latency_p50_ms',     (select p50 from lat),
    'carts',              (select row_to_json(cart) from cart),
    'aov',                (select row_to_json(aovs) from aovs),
    'setup_days',         (select days from setup),
    'dashboard_visits',   (select n from visits)
  );
$$;
```

- [ ] **Step 6: Apply and verify the RPC against the report**

Apply with `apply_migration`, name `value_proof_summary_rpc`, then:

```sql
select value_proof_summary('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1', '2026-06-12', now());
```

Expected: `conversations` ≈ 1,703; `deflected` ≈ 1,400+; `attributed.direct.n` ≈ 149; `carts.recovered_7d` > 1,000; `latency_samples` = 0; `escalation_reasons` = `[]`. If `attributed` has a null entry for a tier with no rows, that is correct — `buildValueProof` turns it into `measured: false`.

Note the `json_object_agg` left-join: a tier with zero rows yields `{"n":null,"revenue":null}`, and `buildValueProof` treats `n === 0` or a missing tier as not-measured. Confirm `tierRevenue` handles the null case — if the RPC returns `n: null`, coerce with `(t.n || 0) === 0`.

- [ ] **Step 7: Fix the null-tier coercion if step 6 showed nulls**

In `metrics.ts`, change both tier helpers' guard from `t.n === 0` to `!(Number(t.n) > 0)` and add a test:

```ts
it('a tier the RPC returns as null is not measured', () => {
  const nulled = { ...raw, attributed: { ...raw.attributed, assisted: { n: null, revenue: null } } };
  expect(buildValueProof(nulled, { audience: 'admin', costPerTicket: null }).revenue.byTier.assisted.measured).toBe(false);
});
```

Run: `npx vitest run tests/unit/value-proof-metrics.test.ts` — Expected: PASS, 11 tests.

- [ ] **Step 8: Commit**

```bash
npm run type-check
git add supabase/migrations/071_value_proof.sql src/lib/analytics/value-proof/metrics.ts tests/unit/value-proof-metrics.test.ts
git commit -m "feat(value-proof): summary RPC and the measured/lowConfidence metric envelope"
```

---

## Task 7: One-off report script

**Files:**
- Create: `scripts/value-proof-report.ts`

**Interfaces:**
- Consumes: `value_proof_summary` RPC (Task 6), `buildValueProof` (Task 6).
- Produces: a markdown file at `docs/reports/<date>-value-proof-<account>.md`.

- [ ] **Step 1: Write the script**

`scripts/value-proof-report.ts`:

```ts
/**
 * One-off value-proof report.
 *
 *   npx tsx scripts/value-proof-report.ts <accountId> [--since 2026-06-12] [--until now]
 *
 * Reads the same RPC and the same buildValueProof() the dashboards use, so the
 * report cannot disagree with the UI. Metrics that are not measured are printed
 * as "NOT MEASURED" with their basis — never as 0.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { buildValueProof } from '../src/lib/analytics/value-proof/metrics';
import type { Metric } from '../src/lib/analytics/value-proof/types';

const [accountId, ...rest] = process.argv.slice(2);
if (!accountId) {
  console.error('usage: value-proof-report.ts <accountId> [--since ISO] [--until ISO]');
  process.exit(1);
}
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const fmt = (m: Metric<any>, render: (v: any) => string): string =>
  m.measured ? `${render(m.value)}${m.lowConfidence ? ` (n=${m.n} — low confidence)` : ''}` : `**NOT MEASURED** — ${m.basis}`;
const ils = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const since = arg('since') || '1970-01-01';
  const until = arg('until') || new Date().toISOString();

  const { data: account } = await supabase.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const label = (account as any)?.config?.username || accountId;
  const costPerTicket = Number((account as any)?.config?.support?.cost_per_ticket) || null;

  const { data: raw, error } = await supabase.rpc('value_proof_summary', {
    p_account_id: accountId, p_since: since, p_until: until,
  });
  if (error) throw new Error(`rpc failed: ${error.message}`);

  const vp = buildValueProof(raw, { audience: 'admin', costPerTicket });

  const md = `# Value-Proof Report — ${label}

**Account:** \`${accountId}\` · **Window:** ${since.slice(0, 10)} → ${until.slice(0, 10)} · **Generated:** ${new Date().toISOString().slice(0, 10)}

Every number below is computed by the same code that feeds the dashboards. A metric with no data source says NOT MEASURED and states why — it does not say zero.

| # | Metric | Value |
|---|---|---|
| 1 | Revenue in conversations (total) | ${fmt(vp.revenue.total, ils)} |
| 1a | — direct (bot link / UTM) | ${fmt(vp.revenue.byTier.direct, ils)} |
| 1b | — assisted (anon_id, ≤24h) | ${fmt(vp.revenue.byTier.assisted, ils)} |
| 1c | — influenced (phone/email, ≤7d) | ${fmt(vp.revenue.byTier.influenced, ils)} |
| 2 | Conversation conversion rate | ${fmt(vp.conversion, pct)} |
| 3 | AOV with vs without | ${fmt(vp.aov, (v) => `${ils(v.withChat)} vs ${ils(v.without)} = ${v.deltaPct.toFixed(1)}%`)} |
| 4 | Cart recovery rate (≤7d, derived) | ${fmt(vp.carts.recoveryRate, pct)} |
| 4a | — recovered value | ${fmt(vp.carts.recoveredValue, ils)} |
| 4b | — of which Bestie touched | ${fmt(vp.carts.bestieTouched, (v) => String(v))} |
| 4c | — platform baseline | ${fmt(vp.carts.platformBaseline, (v) => String(v))} |
| 5 | Deflection rate | ${fmt(vp.deflection.rate, pct)} |
| 5a | — in shekels | ${fmt(vp.deflection.value_ils, ils)} |
| 6 | Time to first response | ${fmt(vp.responseTime.firstResponse, (v) => `${Math.round(v)} ms`)} |
| 6a | Time to close (median) | ${fmt(vp.responseTime.timeToClose, (v) => `${(v / 3600).toFixed(1)}h`)} |
| 7 | Bot gave up | ${fmt(vp.escalation.gaveUpRate, pct)} |
| 7a | Any human touch | ${fmt(vp.escalation.anyHumanRate, pct)} |
| 7b | Escalation reasons | ${fmt(vp.escalation.byReason, (v) => v.map((r: any) => `${r.reason}: ${r.n}`).join(', '))} |
| 8 | Answer accuracy | ${fmt(vp.accuracy!, (v) => String(v))} |
| 9 | Setup time | ${fmt(vp.setup!.days, (v) => `${v} day(s)`)} |
| 9a | Setup staff-hours | ${fmt(vp.setup!.staffHours, (v) => String(v))} |
| 10 | Client's own usage | ${fmt(vp.clientUsage!, (v) => String(v))} |

## Attribution tiers, never summed without the breakdown

| Tier | Orders | Revenue |
|---|---|---|
| direct | ${fmt(vp.revenue.orders.direct, String)} | ${fmt(vp.revenue.byTier.direct, ils)} |
| assisted | ${fmt(vp.revenue.orders.assisted, String)} | ${fmt(vp.revenue.byTier.assisted, ils)} |
| influenced | ${fmt(vp.revenue.orders.influenced, String)} | ${fmt(vp.revenue.byTier.influenced, ils)} |
`;

  const out = `docs/reports/${new Date().toISOString().slice(0, 10)}-value-proof-${label}.md`;
  writeFileSync(out, md);
  console.log('wrote', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it for both accounts**

```bash
npx tsx scripts/value-proof-report.ts c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1 --since 2026-06-12
npx tsx scripts/value-proof-report.ts 36705ad6-4f82-46af-95e1-fb5ea6f4a44f --since 2026-07-23
```

- [ ] **Step 3: Acceptance — reconcile every number against independent SQL**

For each generated report, write a standalone SQL query per row (not reusing the RPC) and compare. The reference values from the hand-measured baseline in `docs/reports/2026-07-26-value-proof-argania-pasha.md` are: Argania — attributed ₪26,899 / 161 orders, conversion 9.5%, AOV −4.8%, cart recovery 21.1%, deflection 82.0%, close median 55.9h, gave-up 0.2%, any-human 25.0%, setup 1 day. Pasha — ₪2,713 / 17 orders, conversion 22.4%, AOV −21.2%, cart recovery 33.1%, deflection 87.0%, setup 0 days.

**A report that does not reconcile fails this task.** Fix the code, not the report.

- [ ] **Step 4: Commit**

```bash
git add scripts/value-proof-report.ts docs/reports/
git commit -m "feat(value-proof): report script, reconciled against the hand-measured baseline"
```

---

## Task 8: Persist the escalation reason

**Files:**
- Modify: `src/engines/escalation/dispatch.ts` (two `support_requests` inserts: ~line 124 and ~line 332)
- Modify: `supabase/migrations/071_value_proof.sql` (append a backfill)
- Test: `tests/unit/value-proof-escalation-reason.test.ts`

**Interfaces:**
- Consumes: `support_requests.escalation_reason` (Task 3).
- Produces: `escalation_reason` written as a top-level column on every auto-escalation ticket, plus a one-time backfill of existing rows.

**Context you need before editing:** the reason is *already computed and already stored* — `verdict.reason` at line 135 and `detection.reason` at ~line 339 are both written into `metadata.escalation.reason`. It is buried inside a jsonb blob, so it cannot be grouped or indexed, which is why metric 7's breakdown reads "not measured". This task promotes it to a column. It does **not** invent a taxonomy.

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-escalation-reason.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { inserted: [] };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(_t: string) {
      const ctx: any = {};
      ctx.insert = (row: any) => { state.inserted.push(row); return Promise.resolve({ data: null, error: null }); };
      ctx.select = () => ctx; ctx.eq = () => ctx; ctx.gte = () => ctx; ctx.limit = () => ctx;
      ctx.update = () => ctx;
      ctx.then = (resolve: any) => resolve({ data: [], error: null });
      return ctx;
    },
  },
}));

describe('escalation reason is persisted as a column', () => {
  beforeEach(() => { state.inserted = []; });

  it('mirrors metadata.escalation.reason into escalation_reason on every insert', async () => {
    // dispatch.ts already puts the reason in metadata; the column must agree with it.
    const { escalationTicketRow } = await import('@/engines/escalation/dispatch');
    const row = escalationTicketRow({
      accountId: 'acc-1', customerName: 'x', customerPhone: '0501234567',
      message: 'this is unacceptable', sessionId: 'sess-1',
      escalation: { severity: 'high', reason: 'angry_customer', triggers: ['anger'] },
    });
    expect(row.escalation_reason).toBe('angry_customer');
    expect(row.metadata.escalation.reason).toBe('angry_customer');
    expect(row.source).toBe('auto_escalation');
  });

  it('leaves the column null when the detector produced no reason', async () => {
    const { escalationTicketRow } = await import('@/engines/escalation/dispatch');
    const row = escalationTicketRow({
      accountId: 'acc-1', customerName: 'x', customerPhone: null,
      message: 'hi', sessionId: null, escalation: { severity: 'low', triggers: [] },
    });
    expect(row.escalation_reason).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/value-proof-escalation-reason.test.ts`
Expected: FAIL — `escalationTicketRow` is not exported from `@/engines/escalation/dispatch`.

- [ ] **Step 3: Extract the shared row builder**

There are two near-identical `support_requests` inserts in `dispatch.ts` (~line 124 and ~line 332) and they must not drift apart. Add this exported helper above the first of them:

```ts
/**
 * The single shape of an auto-escalation ticket. Both dispatch paths (pre-bind /
 * widget / chat, and the WhatsApp path) build their row here so the column and
 * the metadata blob can never disagree.
 *
 * escalation_reason duplicates metadata.escalation.reason on purpose: the blob is
 * the audit record, the column is what metric 7 groups by. A jsonb field cannot
 * be indexed or grouped cheaply, which is why the breakdown read "not measured".
 */
export function escalationTicketRow(input: {
  accountId: string;
  customerName: string;
  customerPhone: string | null;
  message: string;
  sessionId: string | null;
  escalation: { severity?: string; reason?: string; triggers?: unknown[]; [k: string]: unknown };
}) {
  return {
    account_id: input.accountId,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    message: input.message,
    session_id: input.sessionId,
    status: 'new' as const,
    source: 'auto_escalation' as const,
    escalation_reason: input.escalation?.reason ?? null,
    metadata: { escalation: input.escalation },
  };
}
```

- [ ] **Step 4: Route both inserts through it**

Replace the insert at ~line 124 with a call that preserves every field it currently writes — the existing `metadata.escalation` object there carries `severity`, `reason`, `triggers`, `customer_phone`, `transcript`, `detected_at` and `recipients_notified`, so pass that whole object as `escalation`:

```ts
  await supabase.from('support_requests').insert(
    escalationTicketRow({
      accountId: input.accountId,
      customerName: phone || 'לקוח/ה', // NOT NULL — mirrors cs-ticket.ts
      customerPhone: phone,
      message: input.userMessage,
      sessionId: input.sessionId,
      escalation: {
        severity: verdict.severity,
        reason: verdict.reason,
        triggers: verdict.triggers,
        customer_phone: phone,
        transcript: prior.slice(-8),
        detected_at: new Date(deps.now()).toISOString(),
        recipients_notified: notified,
      },
    })
  );
```

Do the same for the insert at ~line 332, passing `customerName: customerName`, `customerPhone: input.waId`, `sessionId: input.chatSessionId`, and the `escalation` object that path already builds. Keep the `update(patch)` branch above it untouched.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/value-proof-escalation-reason.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Backfill the reason already sitting in metadata**

Because the reason was being stored all along, existing tickets are recoverable. Append to `supabase/migrations/071_value_proof.sql`:

```sql
-- The escalation detector has always written its reason into
-- metadata.escalation.reason; it was just not groupable. Promote the history.
update support_requests
   set escalation_reason = metadata->'escalation'->>'reason'
 where escalation_reason is null
   and metadata->'escalation'->>'reason' is not null;
```

- [ ] **Step 7: Apply and check what the history actually contains**

Apply with `apply_migration`, name `value_proof_backfill_escalation_reason`, then:

```sql
select coalesce(escalation_reason, '(none)') reason, count(*) n
  from support_requests
 where account_id in ('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1','36705ad6-4f82-46af-95e1-fb5ea6f4a44f')
 group by 1 order by 2 desc;
```

Expected: at most 7 rows gain a reason (the `auto_escalation` count across both accounts). If the total is 0, the historical `metadata` shape differs — inspect one row with `select metadata from support_requests where source='auto_escalation' limit 1` before assuming the backfill is broken.

- [ ] **Step 8: Commit**

```bash
npm run type-check
git add src/engines/escalation/dispatch.ts supabase/migrations/071_value_proof.sql tests/unit/value-proof-escalation-reason.test.ts
git commit -m "feat(value-proof): promote the escalation reason to a groupable column, backfilled"
```

---

## Task 9: Real response latency

**Files:**
- Modify: `src/lib/chatbot/widget-chat-handler.ts:397-419`
- Modify: `src/app/api/chat/stream/route.ts` (around line 442)
- Test: `tests/unit/value-proof-latency.test.ts`

**Interfaces:**
- Produces: `chat_messages.metadata.latency_ms` on assistant rows, and an explicit `created_at` on the user row equal to when the turn was received.

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-latency.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { turnTimings } from '@/lib/analytics/value-proof/timings';

describe('turnTimings', () => {
  it('reports the elapsed milliseconds between receipt and completion', () => {
    const t = turnTimings(1_000_000, 1_004_500);
    expect(t.latencyMs).toBe(4500);
    expect(t.userCreatedAt).toBe(new Date(1_000_000).toISOString());
  });

  it('never produces a negative latency', () => {
    expect(turnTimings(1_004_500, 1_000_000).latencyMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/value-proof-latency.test.ts`
Expected: FAIL — cannot resolve `@/lib/analytics/value-proof/timings`.

- [ ] **Step 3: Write the helper**

`src/lib/analytics/value-proof/timings.ts`:

```ts
/**
 * Turn timing for metric 6b.
 *
 * WHY THIS EXISTS: chat_messages.created_at defaults to now() and both the user
 * and assistant rows are inserted together AFTER the turn completes (see
 * widget-chat-handler.ts). Measured 2026-07-26 on Argania: 1,022 of 1,354
 * user->assistant pairs are less than one second apart, which no real model
 * response can be. So the gap between rows is a write artifact, and true
 * latency has to be recorded explicitly.
 */
export function turnTimings(receivedAtMs: number, completedAtMs: number): { latencyMs: number; userCreatedAt: string } {
  return {
    latencyMs: Math.max(0, Math.round(completedAtMs - receivedAtMs)),
    userCreatedAt: new Date(receivedAtMs).toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/value-proof-latency.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into the widget chat handler**

In `src/lib/chatbot/widget-chat-handler.ts`, capture the receipt time at the top of the turn handler (immediately after the function's parameters are destructured, before any model call):

```ts
const turnReceivedAt = Date.now();
```

Then replace the two inserts at lines 400-412 with:

```ts
    supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: message,
      // Explicit: the default now() would stamp this at write time, which is
      // AFTER the model responded, collapsing the measurable latency to ~0.
      created_at: timings.userCreatedAt,
    }),
    supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: fullText,
      // Phase 2: persist the turn's parsed envelope so the next turn can
      // look it up for objection injection. Always nullable.
      intent: turnIntent || null,
      metadata: { latency_ms: timings.latencyMs },
    }),
```

with `const timings = turnTimings(turnReceivedAt, Date.now());` computed on the line immediately before the `await Promise.all([`, and `import { turnTimings } from '@/lib/analytics/value-proof/timings';` added to the imports.

- [ ] **Step 6: Wire it into the streaming route the same way**

Read `src/app/api/chat/stream/route.ts` around line 442. Capture a `turnReceivedAt` at the start of the request handler and add `metadata: { latency_ms: turnTimings(turnReceivedAt, Date.now()).latencyMs }` to the assistant insert. If that route writes the user message in a separate earlier call, leave its `created_at` alone — it is already stamped at receipt.

- [ ] **Step 7: Verify a live turn records latency**

Send one message to `/chat/argania`, then:

```sql
select m.role, m.created_at, m.metadata->>'latency_ms' latency_ms
  from chat_messages m join chat_sessions s on s.id = m.session_id
 where s.account_id = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1'
 order by m.created_at desc limit 4;
```

Expected: the newest assistant row has a `latency_ms` in the hundreds-to-thousands, and the user row's `created_at` precedes it by roughly that amount.

- [ ] **Step 8: Commit**

```bash
npm run type-check
git add src/lib/analytics/value-proof/timings.ts src/lib/chatbot/widget-chat-handler.ts src/app/api/chat/stream/route.ts tests/unit/value-proof-latency.test.ts
git commit -m "feat(value-proof): record real turn latency instead of write-time timestamps"
```

---

## Task 10: Thank-you beacon and dashboard-visit event

**Files:**
- Modify: `public/widget.js`
- Modify: `src/lib/analytics/event-catalog.ts`
- Modify: the brand dashboard layout (`src/app/influencer/[username]/layout.tsx`)
- Test: `tests/unit/value-proof-beacon.test.ts`

**Interfaces:**
- Consumes: `behaviorTrack` in `public/widget.js`; `EVENT_CATALOG` and `isAllowedEvent` from `@/lib/analytics/event-catalog`.
- Produces: a `widget_conversion_detected` widget event carrying `payload.order_number` and the visitor's `anon_id`; a `dashboard_visit` event on `events` for the brand's own account.

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-beacon.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isAllowedEvent, eventCategory, eventSurface } from '@/lib/analytics/event-catalog';
import { readFileSync } from 'node:fs';

describe('value-proof event wiring', () => {
  it('widget_conversion_detected is already an allowed conversion event', () => {
    expect(isAllowedEvent('widget_conversion_detected')).toBe(true);
    expect(eventCategory('widget_conversion_detected')).toBe('conversion');
    expect(eventSurface('widget_conversion_detected')).toBe('widget');
  });

  it('dashboard_visit is an allowed event', () => {
    expect(isAllowedEvent('dashboard_visit')).toBe(true);
    expect(eventCategory('dashboard_visit')).toBe('session');
  });

  it('widget.js emits the conversion beacon with an order_number', () => {
    const src = readFileSync('public/widget.js', 'utf8');
    expect(src).toContain('widget_conversion_detected');
    expect(src).toContain('bestieai:order_placed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/value-proof-beacon.test.ts`
Expected: FAIL — `dashboard_visit` is not allowed and `widget.js` has no beacon.

- [ ] **Step 3: Add the dashboard_visit event to the catalog**

In `src/lib/analytics/event-catalog.ts`, inside `EVENT_CATALOG`, directly under the `session_end` line:

```ts
  // Brand-user dashboard visit — metric 10. Written server-side from the
  // brand dashboard layout; never emitted by a public surface.
  dashboard_visit: { category: 'session', surface: 'shared' },
```

- [ ] **Step 4: Add thank-you detection to widget.js**

In `public/widget.js`, immediately after `function trackPageView() { … }`, add:

```js
  // ---- purchase beacon (metric 1, `assisted` tier) ----
  // Three ways to learn an order number, in priority order. All are opt-in:
  // with none of them present, nothing fires and the assisted tier stays
  // honestly empty rather than guessed at.
  //   1. the host page posts {type:'bestieai:order_placed', orderNumber}
  //   2. config.widget.conversion = { pathPattern, orderSelector }
  //   3. nothing — no detection
  var CONVERSION_REPORTED = false;
  function reportConversion(orderNumber) {
    try {
      var num = String(orderNumber || '').replace(/^#/, '').trim();
      if (!num || CONVERSION_REPORTED) return;
      CONVERSION_REPORTED = true;
      behaviorTrack('widget_conversion_detected', { order_number: num });
      flushBehavior(); // a thank-you page is often the last page of the session
    } catch (e) { /* never break the host page */ }
  }

  window.addEventListener('message', function (ev) {
    try {
      var d = ev && ev.data;
      if (d && d.type === 'bestieai:order_placed') reportConversion(d.orderNumber || d.order_number);
    } catch (e) { /* */ }
  });

  function detectConversionFromPage(conf) {
    try {
      if (!conf || !conf.pathPattern) return;
      if (!new RegExp(conf.pathPattern).test(location.pathname + location.search)) return;
      var text = '';
      if (conf.orderSelector) {
        var el = document.querySelector(conf.orderSelector);
        text = el ? (el.textContent || '') : '';
      }
      if (!text) text = document.body ? (document.body.textContent || '') : '';
      var m = text.match(/#?(\d{3,})/);
      if (m) reportConversion(m[1]);
    } catch (e) { /* */ }
  }
```

Then call `detectConversionFromPage(CONFIG && CONFIG.widget && CONFIG.widget.conversion);` at the same boot point where `trackPageView()` is called. Match the surrounding code's `var`-and-try/catch style — this file is ES5-flavoured and runs on third-party sites.

- [ ] **Step 5: Add the server-side dashboard visit**

In `src/app/influencer/[username]/layout.tsx`, after the existing auth/account resolution, insert one event per authenticated render:

```ts
// Metric 10 — the brand opening its own dashboard. Fire-and-forget: a failure
// here must never block the page.
void supabase.from('events').insert({
  type: 'dashboard_visit',
  category: 'session',
  account_id: account.id,
  mode: 'dashboard',
  payload: { path: '/influencer' },
}).then(() => {}, () => {});
```

Use whatever server Supabase client and account variable that layout already has; do not add a new client.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/value-proof-beacon.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Verify the checkout template question**

This is the open item from the spec (§8.1). Determine whether Bestie's snippet is present on QuickShop's checkout/thank-you pages for Argania and Pasha:

```sql
select distinct path from widget_events
 where account_id in ('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1','36705ad6-4f82-46af-95e1-fb5ea6f4a44f')
   and (path ilike '%checkout%' or path ilike '%thank%' or path ilike '%success%' or path ilike '%order%');
```

Expected today: **0 rows** — the snippet is not in the purchase flow. Report this to Ido as a blocker for the `assisted` tier rather than trying to work around it. Do not fabricate a fallback: the tier stays `measured: false`.

- [ ] **Step 8: Commit**

```bash
npm run type-check
git add public/widget.js src/lib/analytics/event-catalog.ts "src/app/influencer/[username]/layout.tsx" tests/unit/value-proof-beacon.test.ts
git commit -m "feat(value-proof): thank-you purchase beacon and dashboard_visit event"
```

---

## Task 11: Admin API and tab

**Files:**
- Create: `src/app/api/admin/analytics/value-proof/route.ts`
- Create: `src/app/admin/influencers/[id]/analytics/ValueProofTab.tsx`
- Modify: `src/app/admin/influencers/[id]/analytics/page.tsx` (lines 19, 112, 223-229)

**Interfaces:**
- Consumes: `value_proof_summary` RPC, `buildValueProof`, `requireAdminAuth` from `@/lib/auth/admin-auth`.
- Produces: `GET /api/admin/analytics/value-proof?accountId=…&days=…` returning `ValueProofSummary` with `audience: 'admin'`.

- [ ] **Step 1: Write the API route**

`src/app/api/admin/analytics/value-proof/route.ts`:

```ts
/**
 * GET /api/admin/analytics/value-proof?accountId=xxx&days=30
 *
 * All 10 value-proof metrics for the admin analytics "הוכחת ערך" tab. Reads the
 * value_proof_summary RPC (aggregated in Postgres — PostgREST truncates a row
 * fetch at 1000, which would silently cut 26K orders) and wraps it in the
 * measured/lowConfidence envelope.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { buildValueProof } from '@/lib/analytics/value-proof/metrics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 3650);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const until = new Date().toISOString();

  const supabase = await createClient();

  const { data: account } = await supabase.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const costPerTicket = Number((account as any)?.config?.support?.cost_per_ticket) || null;

  const { data: raw, error } = await supabase.rpc('value_proof_summary', {
    p_account_id: accountId, p_since: since, p_until: until,
  });
  if (error) {
    console.error('[admin/analytics/value-proof] rpc error:', error.message);
    return NextResponse.json({ error: 'aggregation_failed' }, { status: 500 });
  }

  return NextResponse.json(buildValueProof(raw, { audience: 'admin', costPerTicket }));
}
```

- [ ] **Step 2: Write the tab component**

`src/app/admin/influencers/[id]/analytics/ValueProofTab.tsx`. Follow `WidgetTab.tsx` for fetch/loading/RTL conventions. Non-negotiable rendering rules:

```tsx
'use client';
import { useEffect, useState } from 'react';

type Metric<T = number> = { value: T | null; n: number; measured: boolean; lowConfidence: boolean; basis: string };

/**
 * One number. `measured: false` renders "לא נמדד" plus its reason — a zero here
 * would read as a result, which is the specific failure this whole surface exists
 * to prevent. n is printed whenever confidence is low.
 */
function MetricCell({ m, render }: { m: Metric<any>; render: (v: any) => string }) {
  if (!m.measured) {
    return (
      <div className="text-sm">
        <span className="text-neutral-500">לא נמדד</span>
        <div className="text-xs text-neutral-400 mt-0.5">{m.basis}</div>
      </div>
    );
  }
  return (
    <div className="text-sm">
      <span className="font-semibold">{render(m.value)}</span>
      {m.lowConfidence && <span className="text-xs text-amber-600 mr-1">n={m.n}</span>}
    </div>
  );
}

export default function ValueProofTab({ accountId, days }: { accountId: string; days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/analytics/value-proof?accountId=${accountId}&days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId, days]);

  if (loading) return <div className="p-6 text-sm text-neutral-500">טוען…</div>;
  if (!data || data.error) return <div className="p-6 text-sm text-red-600">שגיאה בטעינת המדדים</div>;

  const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6 p-4" dir="rtl">
      {/* Tiers are ALWAYS shown together — never a single merged headline. */}
      <section>
        <h3 className="text-sm font-semibold mb-2">הכנסה שנוצרה בשיחות</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="סה״כ מיוחס"><MetricCell m={data.revenue.total} render={ils} /></Card>
          <Card label="direct — לינק של הבוט"><MetricCell m={data.revenue.byTier.direct} render={ils} /></Card>
          <Card label="assisted — דיבר ואז קנה"><MetricCell m={data.revenue.byTier.assisted} render={ils} /></Card>
          <Card label="influenced — טלפון/מייל"><MetricCell m={data.revenue.byTier.influenced} render={ils} /></Card>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="שיעור המרת שיחה"><MetricCell m={data.conversion} render={pct} /></Card>
        <Card label="AOV עם מול בלי">
          <MetricCell m={data.aov} render={(v) => `${ils(v.withChat)} מול ${ils(v.without)} (${v.deltaPct.toFixed(1)}%)`} />
        </Card>
        <Card label="שחזור עגלות (7 ימים)"><MetricCell m={data.carts.recoveryRate} render={pct} /></Card>
        <Card label="מהן בנגיעת בסטי"><MetricCell m={data.carts.bestieTouched} render={String} /></Card>
        <Card label="Deflection"><MetricCell m={data.deflection.rate} render={pct} /></Card>
        <Card label="Deflection בשקלים"><MetricCell m={data.deflection.value_ils} render={ils} /></Card>
        <Card label="זמן תגובה ראשון"><MetricCell m={data.responseTime.firstResponse} render={(v) => `${Math.round(v)} ms`} /></Card>
        <Card label="זמן סגירה (חציון)"><MetricCell m={data.responseTime.timeToClose} render={(v) => `${(v / 3600).toFixed(1)} שעות`} /></Card>
        <Card label="הבוט הרים ידיים"><MetricCell m={data.escalation.gaveUpRate} render={pct} /></Card>
        <Card label="נגיעה אנושית"><MetricCell m={data.escalation.anyHumanRate} render={pct} /></Card>
        <Card label="דיוק תשובות"><MetricCell m={data.accuracy} render={String} /></Card>
        <Card label="זמן הקמה"><MetricCell m={data.setup.days} render={(v) => `${v} ימים`} /></Card>
        <Card label="שעות אדם בהקמה"><MetricCell m={data.setup.staffHours} render={String} /></Card>
        <Card label="שימוש הלקוח"><MetricCell m={data.clientUsage} render={String} /></Card>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">סיבות הסלמה</h3>
        <MetricCell m={data.escalation.byReason} render={(v: any[]) => v.map((r) => `${r.reason}: ${r.n}`).join(' · ')} />
      </section>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab in**

In `src/app/admin/influencers/[id]/analytics/page.tsx`:
- line 19 area: `import ValueProofTab from './ValueProofTab';`
- line 112: `const [tab, setTab] = useState<'overview' | 'widget' | 'valueProof'>('overview');`
- after line 224: `<TabButton active={tab === 'valueProof'} onClick={() => setTab('valueProof')}>הוכחת ערך</TabButton>`
- after the existing `{tab === 'widget' && …}` block: `{tab === 'valueProof' ? <ValueProofTab accountId={id} days={Number(range)} /> : null}`

- [ ] **Step 4: Verify in the browser**

Open `/admin/influencers/<argania-id>/analytics`, select the הוכחת ערך tab with range 90 days. Expected: `direct` shows about ₪24,579; `assisted` shows **לא נמדד** with its reason; AOV shows a negative delta; `דיוק תשובות`, `שעות אדם בהקמה` and `שימוש הלקוח` all show לא נמדד. **No card shows ₪0 or 0% where the report says NOT MEASURED** — if one does, `buildValueProof` is coercing a null.

- [ ] **Step 5: Commit**

```bash
npm run type-check
git add src/app/api/admin/analytics/value-proof/route.ts "src/app/admin/influencers/[id]/analytics/ValueProofTab.tsx" "src/app/admin/influencers/[id]/analytics/page.tsx"
git commit -m "feat(value-proof): admin analytics tab for all 10 metrics"
```

---

## Task 12: Brand API, UI block and i18n

**Files:**
- Create: `src/app/api/influencer/[username]/analytics/value-proof/route.ts`
- Create: `src/app/influencer/[username]/analytics/ValueProofBlock.tsx`
- Modify: `src/app/influencer/[username]/analytics/page.tsx`
- Modify: `src/lib/i18n/dashboard/analytics.ts`
- Test: `tests/unit/value-proof-brand-scope.test.ts`

**Interfaces:**
- Consumes: `checkInfluencerAuth` from `@/lib/auth/influencer-auth`, `getInfluencerByUsername` from `@/lib/supabase`, `buildValueProof`.
- Produces: `GET /api/influencer/[username]/analytics/value-proof?days=` returning `ValueProofSummary` with `audience: 'brand'` — **without** `accuracy`, `setup`, or `clientUsage`.

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-brand-scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildValueProof } from '@/lib/analytics/value-proof/metrics';

const raw = {
  window: { since: '2026-06-12T00:00:00Z', until: '2026-07-26T00:00:00Z' },
  attributed: { direct: { n: 149, revenue: 24579 }, assisted: { n: 0, revenue: 0 }, influenced: { n: 12, revenue: 2320 }, none: { n: 8984, revenue: 1533472 } },
  conversations: 1703, deflected: 1487, tickets: 446, auto_escalations: 4, handoffs: 0,
  escalation_reasons: [], tickets_resolved: 386, close_seconds_p50: 201240, latency_samples: 0,
  carts: { with_email: 7959, recovered_7d: 1676, recovered_7d_value: 507356, bestie_touched: 20 },
  aov: { bestie: 165.0, other: 173.3, bestie_n: 149, other_n: 8996 },
  setup_days: 1, dashboard_visits: 0,
};

describe('brand audience payload', () => {
  it('omits the three internal-only metrics', () => {
    const brand: any = buildValueProof(raw, { audience: 'brand', costPerTicket: 12 });
    expect(brand.accuracy).toBeUndefined();
    expect(brand.setup).toBeUndefined();
    expect(brand.clientUsage).toBeUndefined();
    expect(JSON.stringify(brand)).not.toContain('staffHours');
    expect(JSON.stringify(brand)).not.toContain('dashboard_visit');
  });

  it('still includes the escalation rate — the honesty metric is shown to the brand', () => {
    const brand: any = buildValueProof(raw, { audience: 'brand', costPerTicket: 12 });
    expect(brand.escalation.gaveUpRate.measured).toBe(true);
    expect(brand.escalation.anyHumanRate.measured).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run tests/unit/value-proof-brand-scope.test.ts`
Expected: PASS if Task 6 was implemented correctly (the audience gate lives there). If it FAILS, fix `buildValueProof` — the brand must never receive those three keys.

- [ ] **Step 3: Write the brand API route**

`src/app/api/influencer/[username]/analytics/value-proof/route.ts`:

```ts
/**
 * Brand-facing value proof: 7 of the 10 metrics. Accuracy, setup time and the
 * brand's own usage are admin-only — they are OUR product metrics, and showing a
 * brand "you logged in twice this month" works against us.
 *
 * Scope comes from the influencer session cookie via checkInfluencerAuth, which
 * verifies the cookie matches the requested username. An IDOR of exactly this
 * shape was found and fixed on dm-settings — do not resolve the account from a
 * query parameter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { createClient } from '@/lib/supabase/server';
import { buildValueProof } from '@/lib/analytics/value-proof/metrics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 3650);
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const supabase = await createClient();
  const costPerTicket = Number((influencer as any)?.config?.support?.cost_per_ticket) || null;

  const { data: raw, error } = await supabase.rpc('value_proof_summary', {
    p_account_id: influencer.id, p_since: since, p_until: new Date().toISOString(),
  });
  if (error) {
    console.error('[influencer/analytics/value-proof] rpc error:', error.message);
    return NextResponse.json({ error: 'aggregation_failed' }, { status: 500 });
  }

  return NextResponse.json(buildValueProof(raw, { audience: 'brand', costPerTicket }));
}
```

- [ ] **Step 4: Add the i18n keys**

In `src/lib/i18n/dashboard/analytics.ts`, add to the `he` object (before its closing brace):

```ts
    valueProofTitle: 'הוכחת ערך',
    vpRevenueTitle: 'הכנסה שנוצרה בשיחות',
    vpTierDirect: 'מלינק של הבוט',
    vpTierAssisted: 'דיבר ואז קנה',
    vpTierInfluenced: 'זוהה בטלפון או מייל',
    vpTotalAttributed: 'סה״כ מיוחס',
    vpConversion: 'שיעור המרת שיחה',
    vpAov: 'סל ממוצע עם שיחה מול בלי',
    vpCartRecovery: 'שחזור עגלות נטושות',
    vpCartBestie: 'מהן בנגיעת בסטי',
    vpDeflection: 'פניות שנסגרו בלי אדם',
    vpDeflectionIls: 'חיסכון משוער',
    vpFirstResponse: 'זמן תגובה ראשון',
    vpTimeToClose: 'זמן סגירת פנייה',
    vpGaveUp: 'הבוט הפנה לאדם',
    vpAnyHuman: 'פניות שנגע בהן אדם',
    vpReasons: 'סיבות הפניה לאדם',
    vpNotMeasured: 'לא נמדד',
    vpLowConfidence: 'מדגם קטן',
```

And the matching `en` keys in the `en` object:

```ts
    valueProofTitle: 'Value proof',
    vpRevenueTitle: 'Revenue generated in conversations',
    vpTierDirect: 'From a bot link',
    vpTierAssisted: 'Talked, then bought',
    vpTierInfluenced: 'Matched by phone or email',
    vpTotalAttributed: 'Total attributed',
    vpConversion: 'Conversation conversion rate',
    vpAov: 'Average order value, with chat vs without',
    vpCartRecovery: 'Abandoned carts recovered',
    vpCartBestie: 'Of those, Bestie touched',
    vpDeflection: 'Closed without a human',
    vpDeflectionIls: 'Estimated saving',
    vpFirstResponse: 'Time to first response',
    vpTimeToClose: 'Time to close',
    vpGaveUp: 'Bot handed off to a human',
    vpAnyHuman: 'Conversations a human touched',
    vpReasons: 'Handoff reasons',
    vpNotMeasured: 'Not measured',
    vpLowConfidence: 'small sample',
```

**Gotcha from a previous session:** `git add <dir>/` does not stage a sibling deletion in this catalog directory and the build breaks. Stage `src/lib/i18n/dashboard/analytics.ts` explicitly by path.

- [ ] **Step 5: Write the brand UI block**

`src/app/influencer/[username]/analytics/ValueProofBlock.tsx` — same `MetricCell` contract as `ValueProofTab.tsx` (never render 0 for an unmeasured metric), but labelled from the i18n catalog and showing only the 7 brand metrics: revenue with its three tiers, conversion, AOV, cart recovery + Bestie share, deflection (rate and ₪), first response + time to close, gave-up + any-human + reasons. Read `page.tsx` to match its existing card markup and its `t(...)` accessor, and take `days` from the page's existing `dateRange` state.

- [ ] **Step 6: Render it on the brand analytics page**

In `src/app/influencer/[username]/analytics/page.tsx`, import the block and render it directly beneath the KPI row, passing `username` and the numeric days derived from `dateRange` (the page already does `parseInt(dateRange)` at lines 125 and 184).

- [ ] **Step 7: Verify both languages and the scope**

- Log in at `/argania/login` and open the analytics page: the block renders with Hebrew labels; unmeasured metrics say **לא נמדד**; `accuracy`, setup and usage are absent.
- Switch `accounts.language` to `en` via the existing toggle and confirm the English labels render.
- With Argania's session cookie, request `/api/influencer/studiopasha_fashion/analytics/value-proof` — expected **401**, not Pasha's data.

- [ ] **Step 8: Commit**

```bash
npm run type-check
git add "src/app/api/influencer/[username]/analytics/value-proof/route.ts" "src/app/influencer/[username]/analytics/ValueProofBlock.tsx" "src/app/influencer/[username]/analytics/page.tsx" src/lib/i18n/dashboard/analytics.ts tests/unit/value-proof-brand-scope.test.ts
git commit -m "feat(value-proof): brand dashboard block, 7 metrics, he+en, session-scoped"
```

---

## Task 13: Cost per ticket, brand-editable

**Files:**
- Modify: `src/app/api/influencer/settings/route.ts`
- Modify: the brand settings page under `src/app/influencer/[username]/settings/`
- Modify: `src/lib/i18n/dashboard/settings.ts`
- Test: `tests/unit/value-proof-cost-per-ticket.test.ts`

**Interfaces:**
- Produces: `accounts.config.support.cost_per_ticket` (number, ILS) — read by Tasks 7, 11 and 12.

**Context:** `src/app/api/influencer/settings/route.ts` merges into `accounts.config` with an explicit per-field guard (`if (body.phone_number !== undefined) updatedConfig.phone_number = …`, and similar from line 52 onward). A field written outside that pattern is silently dropped. Follow the pattern exactly.

- [ ] **Step 1: Write the failing test**

`tests/unit/value-proof-cost-per-ticket.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = { account: { id: 'acc-1', config: { username: 'argania_group' } }, updated: null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(_t: string) {
      const ctx: any = {};
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.single = async () => ({ data: state.account, error: null });
      ctx.maybeSingle = async () => ({ data: state.account, error: null });
      ctx.update = (row: any) => { state.updated = row; return ctx; };
      ctx.then = (resolve: any) => resolve({ data: null, error: null });
      return ctx;
    },
  },
}));
vi.mock('@/lib/auth/influencer-auth', () => ({ checkInfluencerAuth: async () => true }));

const post = async (body: any) => {
  const { POST } = await import('@/app/api/influencer/settings/route');
  return POST(new Request('http://localhost/api/influencer/settings?username=argania_group', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as any);
};

describe('cost per ticket', () => {
  beforeEach(() => { state.updated = null; vi.resetModules(); });

  it('persists a valid cost under config.support', async () => {
    await post({ cost_per_ticket: 12.5 });
    expect(state.updated.config.support.cost_per_ticket).toBe(12.5);
  });

  it('ignores a negative or non-numeric cost rather than writing garbage', async () => {
    await post({ cost_per_ticket: -3 });
    expect(state.updated?.config?.support?.cost_per_ticket).toBeUndefined();
    state.updated = null;
    await post({ cost_per_ticket: 'free' });
    expect(state.updated?.config?.support?.cost_per_ticket).toBeUndefined();
  });

  it('clearing the field removes it so the metric returns to not-measured', async () => {
    await post({ cost_per_ticket: null });
    expect(state.updated.config.support.cost_per_ticket).toBeNull();
  });
});
```

Adjust the `post` helper's request shape to match however the route actually reads `username` and its body — read the top of `route.ts` first.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/value-proof-cost-per-ticket.test.ts`
Expected: FAIL — `config.support` is undefined on the update.

- [ ] **Step 3: Add the field to the settings API**

In `src/app/api/influencer/settings/route.ts`, alongside the other `if (body.X !== undefined)` guards (after the `whatsapp_enabled` block around line 92):

```ts
    // Cost of handling one support ticket, in ILS. Brand-supplied on purpose:
    // no API exposes it, and a number the brand entered itself is a number the
    // brand cannot dispute when deflection is converted into shekels.
    // null clears it, which returns the shekel metric to "not measured".
    if (body.cost_per_ticket !== undefined) {
      const raw = body.cost_per_ticket;
      const valid = raw === null || (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0);
      if (valid) {
        updatedConfig.support = { ...(currentConfig.support || {}), cost_per_ticket: raw };
      }
    }
```

- [ ] **Step 4: Add the input to the settings page**

Add a numeric input to the brand settings page, following the markup of the existing `phone_number` field. Label from i18n: Hebrew `עלות טיפול בפנייה (₪)`, English `Cost per support ticket (₪)`. Helper line beneath it — Hebrew `המספר הזה שלכם. הוא מה שהופך פניות שנחסכו לשקלים בדוח.`, English `This number is yours. It is what turns deflected tickets into shekels in the report.` Add both key pairs to `src/lib/i18n/dashboard/settings.ts` under its `he` and `en` objects, and stage that file by explicit path.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/value-proof-cost-per-ticket.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify end to end**

Set the value to 12 in Argania's settings, reload `/influencer/argania_group/analytics`, and confirm the deflection-in-shekels metric changes from **לא נמדד** to roughly ₪17,844 (1,487 × 12). Clear the field and confirm it returns to לא נמדד — not to ₪0.

- [ ] **Step 7: Full suite and commit**

```bash
npm run test
npm run type-check
git add src/app/api/influencer/settings/route.ts "src/app/influencer/[username]/settings" src/lib/i18n/dashboard/settings.ts tests/unit/value-proof-cost-per-ticket.test.ts
git commit -m "feat(value-proof): brand-editable cost per ticket turns deflection into shekels"
```

---

## Final verification

- [ ] `npm run test` — all suites pass, including the five new value-proof suites.
- [ ] `npm run type-check` — clean.
- [ ] `npx tsx scripts/value-proof-report.ts` regenerated for both accounts, and every number reconciles against `docs/reports/2026-07-26-value-proof-argania-pasha.md` (allowing for drift from new orders since 2026-07-26).
- [ ] Admin tab and brand block both render, and **no unmeasured metric displays as 0 or 0%**.
- [ ] Cross-account request with the wrong session returns 401.
- [ ] Report to Ido, explicitly: whether the checkout snippet exists (Task 10 step 7 — determines if `assisted` is ever populatable), and that cost per ticket still needs a number from Argania and Pasha.

## Deliberate deviations from the spec

1. **No `widget_order_beacons` table and no `POST /api/widget/conversion`.** `widget_conversion_detected` is already in `EVENT_CATALOG` and `widget_events` already stores `anon_id` and a `payload` — the beacon rides the existing pipeline. Removes a table, an endpoint and an ingest path.
2. **No `normalizePhone` extraction.** `phoneMatches` already delegates to `toWaId` (`src/lib/whatsapp-cloud/client.ts:67`), which is the canonical normalizer. Task 1 wraps it and mirrors it in SQL rather than refactoring it.
3. **Attribution is computed in TypeScript, not SQL.** The spec put tier resolution in a SQL function. A SQL implementation cannot be unit-tested in this repo's pure-unit Vitest setup, and duplicating the rules in TS for the report script would let the two disagree. `attribute.ts` is the single implementation; the RPC only aggregates its output.
4. **`bestie_attribution` is one table, not two.** Orders and carts share the same columns; `subject_kind` discriminates.
