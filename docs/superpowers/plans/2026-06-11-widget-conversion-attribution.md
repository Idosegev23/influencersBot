# Widget Purchase Attribution + Admin Account Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect purchases on QuickShop client sites (first: Argania) via widget.js, attribute them to Bestie chat activity (Direct/Assisted/Influenced/None), and surface revenue + widget data in an archetype-aware admin account page.

**Architecture:** widget.js (already loaded on every page of the client site, including `/checkout/thank-you/{orderNumber}`) detects the QuickShop thank-you page, reads the order QuickShop stashes in localStorage, and POSTs it with the visitor's `anon_id` to a new `/api/widget/conversion` endpoint (same HMAC widget-token auth as `/api/analytics/widget`). The server upserts into a new `widget_conversions` table and computes attribution by joining `anon_id → chat_sessions → widget_recommendations` within a 7-day window. Phase B wires this (plus the existing-but-unrendered recommendations CTR API) into `/admin/influencers/[id]`, which becomes archetype-aware.

**Tech Stack:** Next.js 16 App Router, Supabase (service-role, RLS off on chat tables), vanilla JS widget (`public/widget.js`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-widget-conversion-attribution-design.md`

**Git workflow (per Ido's standing preference):** commit each task straight to `main` and push. Stage only the task's files.

**Verified facts the plan relies on (checked live on argania-oil.co.il, 2026-06-11):**
- Thank-you route: `/checkout/thank-you/{orderNumber}?t={accessToken}`, same domain, widget.js loads there.
- QuickShop writes the order to localStorage pre-payment: `{items[], subtotal, discount, shipping, total, couponCodes[], orderDate, orderReference, customer}`. The key name is a build constant we don't know → detect by value shape, not key.
- `chat_sessions.anon_id` exists and is persisted by `widget-chat-handler.ts` (lines ~106-113).
- `widget_recommendations` columns: `id, account_id, session_id, product_id (our widget_products UUID), product_name, strategy, was_clicked, clicked_at, conversation_context, position, created_at` (insert at `src/lib/recommendations/engine.ts:495-505`).
- Widget token auth pattern: `src/app/api/analytics/widget/route.ts` (uses `verifyWidgetToken` from `@/lib/analytics/widget-token`; token issued by `/api/widget/config`, available in widget.js as `ANALYTICS_TOKEN` after config load, line ~629).
- Latest migration: `supabase/migrations/048_rpc_get_coupons_validity.sql` → new one is `049`.
- Migrations are applied with the Supabase MCP tool (`mcp__supabase__apply_migration`), NOT a CLI.

---

## Phase A — Conversion pipeline

### Task 1: `widget_conversions` migration

**Files:**
- Create: `supabase/migrations/049_widget_conversions.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 049: widget_conversions — purchases detected by widget.js on client-site
-- thank-you pages (QuickShop first). Attribution computed at ingest by
-- joining anon_id → chat_sessions → widget_recommendations (7-day window).
-- RLS intentionally left disabled (consistent with chat_* tables); accessed
-- only via server routes with admin/service auth.

CREATE TABLE IF NOT EXISTS widget_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  anon_id TEXT NOT NULL,
  session_id TEXT,                      -- widget chat session if known at purchase time
  order_number TEXT NOT NULL,
  order_reference TEXT,                 -- QuickShop's internal reference (may differ from order_number)
  total NUMERIC,
  subtotal NUMERIC,
  discount NUMERIC,
  currency TEXT NOT NULL DEFAULT 'ILS',
  coupon_codes TEXT[] DEFAULT '{}',
  line_items JSONB DEFAULT '[]',        -- [{productId, name, quantity, price, variantTitle}]
  customer JSONB,                       -- buyer details from the order (admin-internal PII)
  raw JSONB,                            -- original client payload, for safety/debugging
  attribution TEXT NOT NULL DEFAULT 'none'
    CHECK (attribution IN ('direct', 'assisted', 'influenced', 'none')),
  attributed_products JSONB DEFAULT '[]', -- per-item evidence [{lineItemName, productId, recommendationId, tier}]
  matched_session_ids TEXT[] DEFAULT '{}',
  page_url TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_widget_conversions_account_time
  ON widget_conversions (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_widget_conversions_anon
  ON widget_conversions (account_id, anon_id);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call `mcp__supabase__apply_migration` with `name: "049_widget_conversions"` and the SQL above. Expected: success, no errors.

- [ ] **Step 3: Verify the table exists**

Call `mcp__supabase__execute_sql` with `SELECT column_name FROM information_schema.columns WHERE table_name = 'widget_conversions' ORDER BY ordinal_position;`
Expected: all 20 columns listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/049_widget_conversions.sql
git commit -m "feat(conversions): widget_conversions table for purchase attribution" && git push
```

---

### Task 2: Attribution logic (pure, TDD)

**Files:**
- Create: `src/lib/analytics/conversion-attribution.ts`
- Test: `tests/unit/conversion-attribution.test.ts`

The pure core: given line items, the account's product catalog, and the visitor's recommendations/sessions inside the window, produce the attribution tier + evidence. No DB access here (DB loading is Task 4).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/conversion-attribution.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  computeAttribution,
  type CatalogProduct,
  type RecommendationRow,
} from '@/lib/analytics/conversion-attribution';

const catalog: CatalogProduct[] = [
  { id: 'p1', name: 'Argan Hair Serum', nameHe: 'סרום שיער ארגן' },
  { id: 'p2', name: 'Body Butter', nameHe: 'חמאת גוף' },
];

function rec(over: Partial<RecommendationRow> = {}): RecommendationRow {
  return {
    id: 'r1',
    product_id: 'p1',
    product_name: 'סרום שיער ארגן',
    session_id: 's1',
    was_clicked: false,
    ...over,
  };
}

describe('normalizeName', () => {
  it('lowercases, trims, collapses whitespace', () => {
    expect(normalizeName('  Argan   Hair  Serum ')).toBe('argan hair serum');
  });
  it('handles Hebrew names unchanged apart from whitespace', () => {
    expect(normalizeName(' סרום  שיער ')).toBe('סרום שיער');
  });
});

describe('computeAttribution', () => {
  it('returns none when there are no sessions in window', () => {
    const out = computeAttribution({
      lineItems: [{ name: 'סרום שיער ארגן', quantity: 1, price: 89 }],
      catalog,
      recommendations: [],
      hasSessionsInWindow: false,
    });
    expect(out.attribution).toBe('none');
    expect(out.attributedProducts).toEqual([]);
  });

  it('returns influenced when sessions exist but no purchased item was recommended', () => {
    const out = computeAttribution({
      lineItems: [{ name: 'Body Butter', quantity: 1, price: 59 }],
      catalog,
      recommendations: [rec()], // recommended p1, bought p2
      hasSessionsInWindow: true,
    });
    expect(out.attribution).toBe('influenced');
  });

  it('returns assisted when a purchased item matches a recommendation by Hebrew name', () => {
    const out = computeAttribution({
      lineItems: [{ name: 'סרום   שיער ארגן', quantity: 2, price: 89 }],
      catalog,
      recommendations: [rec()],
      hasSessionsInWindow: true,
    });
    expect(out.attribution).toBe('assisted');
    expect(out.attributedProducts).toHaveLength(1);
    expect(out.attributedProducts[0]).toMatchObject({
      productId: 'p1',
      recommendationId: 'r1',
      tier: 'assisted',
    });
  });

  it('matches by English catalog name too', () => {
    const out = computeAttribution({
      lineItems: [{ name: 'ARGAN HAIR SERUM', quantity: 1, price: 89 }],
      catalog,
      recommendations: [rec()],
      hasSessionsInWindow: true,
    });
    expect(out.attribution).toBe('assisted');
  });

  it('returns direct when the matching recommendation was clicked', () => {
    const out = computeAttribution({
      lineItems: [{ name: 'סרום שיער ארגן', quantity: 1, price: 89 }],
      catalog,
      recommendations: [rec({ was_clicked: true })],
      hasSessionsInWindow: true,
    });
    expect(out.attribution).toBe('direct');
    expect(out.attributedProducts[0].tier).toBe('direct');
  });

  it('direct beats assisted at order level when both exist', () => {
    const out = computeAttribution({
      lineItems: [
        { name: 'סרום שיער ארגן', quantity: 1, price: 89 },
        { name: 'חמאת גוף', quantity: 1, price: 59 },
      ],
      catalog,
      recommendations: [
        rec({ id: 'r1', product_id: 'p1', was_clicked: true }),
        rec({ id: 'r2', product_id: 'p2', product_name: 'חמאת גוף', was_clicked: false }),
      ],
      hasSessionsInWindow: true,
    });
    expect(out.attribution).toBe('direct');
    expect(out.attributedProducts).toHaveLength(2);
  });

  it('falls back to matching recommendation product_name when item is not in catalog', () => {
    const out = computeAttribution({
      lineItems: [{ name: 'מארז מתנה מיוחד', quantity: 1, price: 199 }],
      catalog, // not in catalog
      recommendations: [rec({ id: 'r9', product_id: 'p9', product_name: 'מארז מתנה מיוחד' })],
      hasSessionsInWindow: true,
    });
    expect(out.attribution).toBe('assisted');
    expect(out.attributedProducts[0].recommendationId).toBe('r9');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/conversion-attribution.test.ts`
Expected: FAIL — module `@/lib/analytics/conversion-attribution` not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/analytics/conversion-attribution.ts
/**
 * Pure attribution logic for widget purchase conversions.
 *
 * Tiers (order-level = strongest tier among line items):
 *  - direct:     purchased item matches a recommendation the visitor CLICKED
 *  - assisted:   purchased item matches a recommendation (not clicked)
 *  - influenced: visitor chatted within the window but bought unrecommended items
 *  - none:       no chat activity within the window (baseline order)
 *
 * Matching is by normalized product name: QuickShop line items carry
 * QuickShop's own productId, which never matches our widget_products UUIDs,
 * so names are the only shared key. We match against both the catalog
 * (name + nameHe → product_id → recommendation.product_id) and, as a
 * fallback, the recommendation's stored product_name directly.
 */

export const ATTRIBUTION_WINDOW_DAYS = 7;

export interface CatalogProduct {
  id: string;
  name: string | null;
  nameHe?: string | null;
}

export interface RecommendationRow {
  id: string;
  product_id: string | null;
  product_name: string | null;
  session_id: string | null;
  was_clicked: boolean;
}

export interface ConversionLineItem {
  name: string;
  quantity: number;
  price: number;
  productId?: string | null;
  variantTitle?: string | null;
}

export interface AttributedProduct {
  lineItemName: string;
  productId: string | null;
  recommendationId: string;
  tier: 'direct' | 'assisted';
}

export interface AttributionResult {
  attribution: 'direct' | 'assisted' | 'influenced' | 'none';
  attributedProducts: AttributedProduct[];
}

export function normalizeName(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function computeAttribution(input: {
  lineItems: ConversionLineItem[];
  catalog: CatalogProduct[];
  recommendations: RecommendationRow[];
  hasSessionsInWindow: boolean;
}): AttributionResult {
  const { lineItems, catalog, recommendations, hasSessionsInWindow } = input;

  if (!hasSessionsInWindow) {
    return { attribution: 'none', attributedProducts: [] };
  }

  // catalog name (he/en) → our product id
  const nameToProductId = new Map<string, string>();
  for (const p of catalog) {
    for (const n of [p.name, p.nameHe]) {
      const key = normalizeName(n);
      if (key) nameToProductId.set(key, p.id);
    }
  }

  // our product id → its recommendations; plus recommendation name → recommendations
  const recsByProductId = new Map<string, RecommendationRow[]>();
  const recsByName = new Map<string, RecommendationRow[]>();
  for (const r of recommendations) {
    if (r.product_id) {
      const arr = recsByProductId.get(r.product_id) || [];
      arr.push(r);
      recsByProductId.set(r.product_id, arr);
    }
    const nameKey = normalizeName(r.product_name);
    if (nameKey) {
      const arr = recsByName.get(nameKey) || [];
      arr.push(r);
      recsByName.set(nameKey, arr);
    }
  }

  const attributedProducts: AttributedProduct[] = [];
  for (const item of lineItems) {
    const itemKey = normalizeName(item.name);
    if (!itemKey) continue;
    const productId = nameToProductId.get(itemKey) || null;
    const candidates = [
      ...(productId ? recsByProductId.get(productId) || [] : []),
      ...(recsByName.get(itemKey) || []),
    ];
    if (candidates.length === 0) continue;
    // Prefer a clicked recommendation as the evidence row.
    const clicked = candidates.find((r) => r.was_clicked);
    const evidence = clicked || candidates[0];
    attributedProducts.push({
      lineItemName: item.name,
      productId: productId || evidence.product_id,
      recommendationId: evidence.id,
      tier: clicked ? 'direct' : 'assisted',
    });
  }

  if (attributedProducts.length === 0) {
    return { attribution: 'influenced', attributedProducts: [] };
  }
  const hasDirect = attributedProducts.some((a) => a.tier === 'direct');
  return {
    attribution: hasDirect ? 'direct' : 'assisted',
    attributedProducts,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/conversion-attribution.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/conversion-attribution.ts tests/unit/conversion-attribution.test.ts
git commit -m "feat(conversions): pure attribution logic (direct/assisted/influenced/none)" && git push
```

---

### Task 3: Conversion payload parser (TDD)

**Files:**
- Create: `src/lib/analytics/conversion-ingest.ts`
- Test: `tests/unit/conversion-ingest.test.ts`

Keeps the route thin (mirrors how `/api/analytics/widget` delegates to `server-ingest.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/conversion-ingest.test.ts
import { describe, it, expect } from 'vitest';
import { parseConversionPayload } from '@/lib/analytics/conversion-ingest';

const valid = {
  accountId: 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1',
  anonId: 'aw_abc123',
  sessionId: 'sess_1',
  token: 'tok',
  orderNumber: '12345',
  pageUrl: 'https://argania-oil.co.il/checkout/thank-you/12345?t=x',
  order: {
    total: 199.9,
    subtotal: 220,
    discount: 20.1,
    couponCodes: ['BESTIE10'],
    orderReference: 'qs_ref_1',
    orderDate: '2026-06-11T10:00:00Z',
    items: [
      { productId: 'qs1', name: 'סרום שיער ארגן', quantity: 2, price: 89, variantTitle: null },
    ],
    customer: { firstName: 'דנה', email: 'dana@example.com' },
  },
};

describe('parseConversionPayload', () => {
  it('accepts a full valid payload', () => {
    const out = parseConversionPayload(valid);
    expect(out.ok).toBe(true);
    expect(out.payload!.orderNumber).toBe('12345');
    expect(out.payload!.lineItems).toHaveLength(1);
    expect(out.payload!.total).toBe(199.9);
  });

  it('accepts a payload with no order object (URL-only fallback)', () => {
    const out = parseConversionPayload({ ...valid, order: null });
    expect(out.ok).toBe(true);
    expect(out.payload!.lineItems).toEqual([]);
    expect(out.payload!.total).toBeNull();
  });

  it('rejects missing accountId / anonId / orderNumber', () => {
    expect(parseConversionPayload({ ...valid, accountId: undefined }).ok).toBe(false);
    expect(parseConversionPayload({ ...valid, anonId: '' }).ok).toBe(false);
    expect(parseConversionPayload({ ...valid, orderNumber: undefined }).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(parseConversionPayload('x').ok).toBe(false);
    expect(parseConversionPayload(null).ok).toBe(false);
  });

  it('clamps line items to 50 and sanitizes item fields', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      name: `item ${i}`, quantity: 1, price: 10,
    }));
    const out = parseConversionPayload({ ...valid, order: { ...valid.order, items } });
    expect(out.ok).toBe(true);
    expect(out.payload!.lineItems).toHaveLength(50);
  });

  it('coerces bad numeric fields to null instead of failing', () => {
    const out = parseConversionPayload({
      ...valid,
      order: { ...valid.order, total: 'abc', subtotal: undefined },
    });
    expect(out.ok).toBe(true);
    expect(out.payload!.total).toBeNull();
    expect(out.payload!.subtotal).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/conversion-ingest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/analytics/conversion-ingest.ts
/**
 * Validation/sanitization for /api/widget/conversion payloads.
 * Client data is untrusted: clamp sizes, coerce types, never throw.
 */

export interface ParsedConversion {
  accountId: string;
  anonId: string;
  sessionId: string | null;
  orderNumber: string;
  orderReference: string | null;
  pageUrl: string | null;
  total: number | null;
  subtotal: number | null;
  discount: number | null;
  couponCodes: string[];
  lineItems: Array<{
    productId: string | null;
    name: string;
    quantity: number;
    price: number;
    variantTitle: string | null;
  }>;
  customer: Record<string, unknown> | null;
  raw: unknown;
}

const MAX_ITEMS = 50;

function str(v: unknown, max = 300): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function parseConversionPayload(
  raw: unknown
): { ok: boolean; payload?: ParsedConversion; error?: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_payload' };
  const r = raw as Record<string, unknown>;

  const accountId = str(r.accountId, 100);
  const anonId = str(r.anonId, 100);
  const orderNumber = str(r.orderNumber, 100);
  if (!accountId) return { ok: false, error: 'accountId_required' };
  if (!anonId) return { ok: false, error: 'anonId_required' };
  if (!orderNumber) return { ok: false, error: 'orderNumber_required' };

  const order =
    r.order && typeof r.order === 'object' ? (r.order as Record<string, unknown>) : null;

  const itemsRaw = order && Array.isArray(order.items) ? order.items : [];
  const lineItems = itemsRaw.slice(0, MAX_ITEMS).flatMap((it) => {
    if (!it || typeof it !== 'object') return [];
    const o = it as Record<string, unknown>;
    const name = str(o.name, 300);
    if (!name) return [];
    return [{
      productId: str(o.productId, 100),
      name,
      quantity: num(o.quantity) ?? 1,
      price: num(o.price) ?? 0,
      variantTitle: str(o.variantTitle, 200),
    }];
  });

  const couponCodes =
    order && Array.isArray(order.couponCodes)
      ? order.couponCodes.flatMap((c) => (typeof c === 'string' ? [c.slice(0, 80)] : [])).slice(0, 10)
      : [];

  const customer =
    order && order.customer && typeof order.customer === 'object'
      ? (order.customer as Record<string, unknown>)
      : null;

  return {
    ok: true,
    payload: {
      accountId,
      anonId,
      sessionId: str(r.sessionId, 100),
      orderNumber,
      orderReference: order ? str(order.orderReference, 150) : null,
      pageUrl: str(r.pageUrl, 500),
      total: order ? num(order.total) : null,
      subtotal: order ? num(order.subtotal) : null,
      discount: order ? num(order.discount) : null,
      couponCodes,
      lineItems,
      customer,
      raw: order,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/conversion-ingest.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/conversion-ingest.ts tests/unit/conversion-ingest.test.ts
git commit -m "feat(conversions): payload parser for /api/widget/conversion" && git push
```

---

### Task 4: DB attribution loader + `/api/widget/conversion` route

**Files:**
- Modify: `src/lib/analytics/conversion-attribution.ts` (append DB loader)
- Create: `src/app/api/widget/conversion/route.ts`

- [ ] **Step 1: Append the DB loader to `conversion-attribution.ts`**

Add at the end of the file (import `SupabaseClient` type at top: `import type { SupabaseClient } from '@supabase/supabase-js';`):

```typescript
/**
 * Loads window-scoped context from DB and runs computeAttribution.
 * Join chain: anon_id → chat_sessions (this account, window) →
 * widget_recommendations (those sessions) + widget_products catalog.
 */
export async function attributeConversion(
  supabase: SupabaseClient,
  params: {
    accountId: string;
    anonId: string;
    lineItems: ConversionLineItem[];
    occurredAt?: Date;
  }
): Promise<AttributionResult & { matchedSessionIds: string[] }> {
  const occurredAt = params.occurredAt || new Date();
  const windowStart = new Date(
    occurredAt.getTime() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('account_id', params.accountId)
    .eq('anon_id', params.anonId)
    .gte('created_at', windowStart);

  const sessionIds = (sessions || []).map((s: { id: string }) => String(s.id));
  if (sessionIds.length === 0) {
    return { attribution: 'none', attributedProducts: [], matchedSessionIds: [] };
  }

  const [{ data: recs }, { data: products }] = await Promise.all([
    supabase
      .from('widget_recommendations')
      .select('id, product_id, product_name, session_id, was_clicked')
      .eq('account_id', params.accountId)
      .in('session_id', sessionIds),
    supabase
      .from('widget_products')
      .select('id, name, nameHe')
      .eq('account_id', params.accountId),
  ]);

  const result = computeAttribution({
    lineItems: params.lineItems,
    catalog: (products || []) as CatalogProduct[],
    recommendations: (recs || []) as RecommendationRow[],
    hasSessionsInWindow: true,
  });

  return { ...result, matchedSessionIds: sessionIds };
}
```

- [ ] **Step 2: Run the existing unit tests to confirm nothing broke**

Run: `npx vitest run tests/unit/conversion-attribution.test.ts`
Expected: all PASS (loader is additive).

- [ ] **Step 3: Create the route**

```typescript
// src/app/api/widget/conversion/route.ts
/**
 * POST /api/widget/conversion
 * Purchase detected by widget.js on a client-site thank-you page.
 *
 * Auth: same HMAC widget token as /api/analytics/widget — token's accountId
 * must match the payload's. CORS open (script runs on client domains).
 * Upsert on (account_id, order_number): first write wins (client also
 * dedups via localStorage flag; refresh-resend is expected and harmless).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyWidgetToken } from '@/lib/analytics/widget-token';
import { parseConversionPayload } from '@/lib/analytics/conversion-ingest';
import { attributeConversion } from '@/lib/analytics/conversion-attribution';

export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    // keepalive/sendBeacon may send text/plain — read as text and parse.
    const text = await req.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return cors({ error: 'invalid_json' }, 400);
    }

    const tokenRaw = (raw as Record<string, unknown>)?.token;
    if (typeof tokenRaw !== 'string') return cors({ error: 'token_required' }, 401);
    const verified = verifyWidgetToken(tokenRaw);
    if (!verified) return cors({ error: 'token_invalid' }, 401);

    const parsed = parseConversionPayload(raw);
    if (!parsed.ok || !parsed.payload) return cors({ error: parsed.error || 'invalid' }, 400);
    const p = parsed.payload;

    if (verified.accountId !== p.accountId) {
      return cors({ error: 'token_account_mismatch' }, 403);
    }

    const supabase = await createClient();

    const attribution = await attributeConversion(supabase, {
      accountId: p.accountId,
      anonId: p.anonId,
      lineItems: p.lineItems,
    });

    const { error } = await supabase.from('widget_conversions').upsert(
      {
        account_id: p.accountId,
        anon_id: p.anonId,
        session_id: p.sessionId,
        order_number: p.orderNumber,
        order_reference: p.orderReference,
        total: p.total,
        subtotal: p.subtotal,
        discount: p.discount,
        coupon_codes: p.couponCodes,
        line_items: p.lineItems,
        customer: p.customer,
        raw: p.raw,
        attribution: attribution.attribution,
        attributed_products: attribution.attributedProducts,
        matched_session_ids: attribution.matchedSessionIds,
        page_url: p.pageUrl,
      },
      { onConflict: 'account_id,order_number', ignoreDuplicates: true }
    );

    if (error) {
      console.error('[widget/conversion] upsert error:', error.message);
      return cors({ error: 'persist_failed' }, 500);
    }

    return cors({ ok: true, attribution: attribution.attribution }, 200);
  } catch (e: any) {
    console.error('[widget/conversion] error:', e?.message);
    return cors({ error: 'ingest_failed' }, 500);
  }
}

function cors(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no NEW errors (tsconfig is `strict: false`; pre-existing errors may exist — compare against `git stash`-free baseline if unsure).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/conversion-attribution.ts src/app/api/widget/conversion/route.ts
git commit -m "feat(conversions): /api/widget/conversion endpoint with attribution at ingest" && git push
```

---

### Task 5: widget.js — thank-you page detection

**Files:**
- Modify: `public/widget.js`

Insert a new section right after the analytics section's unload hooks (after the `window.addEventListener('pagehide', flushAnalytics);` line, ~line 471), and trigger it after the config fetch sets `ANALYTICS_TOKEN` (the conversion POST requires the token).

- [ ] **Step 1: Add the conversion detection block after line ~471 (`window.addEventListener('pagehide', flushAnalytics);`)**

```javascript
  // ============================================
  // Purchase conversion detection (QuickShop)
  // ============================================
  // QuickShop routes to /checkout/thank-you/{orderNumber} after payment and
  // stashes the full order in localStorage just before redirecting to the
  // payment gateway. The localStorage key is a build constant we can't rely
  // on, so we find the order by VALUE SHAPE (items[] + total). The dedup
  // flag is only set after a 2xx from the server, so a failed send retries
  // on the next page load; the server upserts on (account, order) so
  // double-sends are harmless.

  var CONVERSION_PATH_RE = /\/checkout\/thank-you\/([^\/?#]+)/;

  function findStoredOrder() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key) continue;
        if (key.indexOf('ibot_') === 0) continue; // skip our own keys
        var rawVal = localStorage.getItem(key);
        if (!rawVal || rawVal.charAt(0) !== '{') continue;
        if (rawVal.indexOf('"items"') === -1 || rawVal.indexOf('"total"') === -1) continue;
        try {
          var obj = JSON.parse(rawVal);
          if (obj && Array.isArray(obj.items) && obj.items.length > 0 &&
              typeof obj.total === 'number' &&
              (obj.orderReference || obj.orderDate || obj.customer)) {
            return obj;
          }
        } catch (e) { /* not JSON — keep scanning */ }
      }
    } catch (e) { /* localStorage unavailable */ }
    return null;
  }

  function maybeSendConversion() {
    try {
      var m = CONVERSION_PATH_RE.exec(window.location.pathname);
      if (!m || !ANALYTICS_TOKEN) return;
      var orderNumber = decodeURIComponent(m[1]);
      var dedupKey = 'ibot_conv_' + ACCOUNT_ID + '_' + orderNumber;
      try { if (localStorage.getItem(dedupKey)) return; } catch (e) { /* */ }

      var order = findStoredOrder();
      var body = JSON.stringify({
        accountId: ACCOUNT_ID,
        anonId: ANON_ID,
        sessionId: sessionId || null,
        token: ANALYTICS_TOKEN,
        orderNumber: orderNumber,
        pageUrl: window.location.href,
        order: order ? {
          total: order.total,
          subtotal: typeof order.subtotal === 'number' ? order.subtotal : null,
          discount: typeof order.discount === 'number' ? order.discount : null,
          couponCodes: Array.isArray(order.couponCodes) ? order.couponCodes : [],
          orderReference: order.orderReference || null,
          orderDate: order.orderDate || null,
          items: (order.items || []).slice(0, 50).map(function (it) {
            return {
              productId: it && it.productId != null ? String(it.productId) : null,
              name: (it && it.name) || '',
              quantity: (it && it.quantity) || 1,
              price: (it && it.price) || 0,
              variantTitle: (it && it.variantTitle) || null,
            };
          }),
          customer: order.customer || null,
        } : null,
      });

      fetch(BASE_URL + '/api/widget/conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        mode: 'cors',
      }).then(function (r) {
        if (r && r.ok) {
          try { localStorage.setItem(dedupKey, '1'); } catch (e) { /* */ }
        }
      }).catch(function () { /* retry on next load */ });

      widgetTrack('widget_conversion_detected', {
        order_number: orderNumber,
        total: order ? order.total : null,
        items_count: order && order.items ? order.items.length : 0,
        had_stored_order: !!order,
      });
    } catch (e) { /* never break the host page */ }
  }
```

- [ ] **Step 2: Trigger it after the config load sets the token**

Find the config-load success handler (~line 629-645, where `if (data.analyticsToken) ANALYTICS_TOKEN = data.analyticsToken;` and `widgetTrack('widget_loaded', ...)` live). Immediately after the `widgetTrack('widget_loaded', { modules: modules });` line, add:

```javascript
      maybeSendConversion();
```

- [ ] **Step 3: Syntax-check the widget bundle**

Run: `node --check public/widget.js`
Expected: no output (valid syntax).

- [ ] **Step 4: Manual harness verification (local)**

Create a throwaway local check (do NOT commit): start the dev server (`npm run dev`), then create `/tmp/widget-conv-test.html`:

```html
<!doctype html>
<html><body>
<script>
  localStorage.setItem('qs_pending_order', JSON.stringify({
    items: [{ productId: 'qs1', name: 'סרום שיער ארגן', quantity: 1, price: 89 }],
    subtotal: 89, discount: 0, total: 89, couponCodes: [],
    orderDate: new Date().toISOString(), orderReference: 'ref_t1',
    customer: { firstName: 'Test', email: 'test@example.com' }
  }));
  history.replaceState({}, '', '/checkout/thank-you/TEST-001');
</script>
<script src="http://localhost:3000/widget.js" data-account-id="c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1"></script>
</body></html>
```

Serve it (`cd /tmp && python3 -m http.server 8787`), open `http://localhost:8787/widget-conv-test.html`, and in DevTools Network verify a POST to `/api/widget/conversion` returning 200. Then verify the row:

`mcp__supabase__execute_sql`: `SELECT order_number, total, attribution, line_items FROM widget_conversions WHERE order_number = 'TEST-001';`
Expected: one row, `total = 89`. (`attribution` will be `none` unless this browser's anon_id chatted recently — that's correct behavior.) Reload the page → verify NO second POST (dedup flag). Delete the test row afterwards:
`DELETE FROM widget_conversions WHERE order_number = 'TEST-001';`

- [ ] **Step 5: Commit**

```bash
git add public/widget.js
git commit -m "feat(widget): detect QuickShop thank-you page and report purchase conversions" && git push
```

---

### Task 6: Live verification on Argania (post-deploy)

**Files:** none (operational task)

- [ ] **Step 1: Confirm deployment**

After push, Vercel auto-deploys. Verify the new widget code is live: `curl -s https://bestie.ldrsgroup.com/widget.js | grep -c "maybeSendConversion"` → expected `>= 1`. Verify the endpoint: `curl -s -X POST https://bestie.ldrsgroup.com/api/widget/conversion -d '{}' -H 'Content-Type: application/json'` → expected `{"error":"token_required"}` (proves route is live).

- [ ] **Step 2: Monitor for the first real conversion**

Real Argania orders will trigger organically. Check after a day or two:
`mcp__supabase__execute_sql`: `SELECT order_number, total, attribution, occurred_at FROM widget_conversions WHERE account_id = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1' ORDER BY occurred_at DESC LIMIT 10;`

If rows appear with sensible totals/line_items → pipeline verified end-to-end. If after several days there are zero rows despite site traffic, debug: check Vercel logs for `[widget/conversion]` errors, and verify the thank-you URL pattern hasn't changed (`/checkout/thank-you/`).

---

## Phase B — Admin account page redesign

### Task 7: Expose archetype on the detail API

**Files:**
- Modify: `src/app/api/admin/influencers/[id]/route.ts`

- [ ] **Step 1: Add archetype fields to the response**

In the response object built around lines 54-80 (where `username`, `displayName`, `type` are set from `config`), add:

```typescript
      archetype: config.archetype || 'influencer',
      accountType: account.type || 'creator',
      isBrandWidget: !!config.widget || config.archetype === 'brand',
      widgetDomain: config.username || null,
      widgetModules: config.widget?.modules || null,
```

(`account` here is the row fetched from `accounts` — confirm the select includes `type`; if it selects specific columns, add `type`.)

- [ ] **Step 2: Extend the page's TypeScript interface**

In `src/app/admin/influencers/[id]/page.tsx`, find the `InfluencerDetails` interface/type (defined in the file or imported — grep `InfluencerDetails`). Add:

```typescript
  archetype?: string;
  accountType?: string;
  isBrandWidget?: boolean;
  widgetDomain?: string | null;
  widgetModules?: Record<string, { enabled?: boolean }> | null;
```

- [ ] **Step 3: Type-check and commit**

Run: `npm run type-check` → no new errors.

```bash
git add src/app/api/admin/influencers/\[id\]/route.ts src/app/admin/influencers/\[id\]/page.tsx
git commit -m "feat(admin): expose archetype + widget flags on account detail API" && git push
```

---

### Task 8: Admin conversions API

**Files:**
- Create: `src/app/api/admin/conversions/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/admin/conversions/route.ts
/**
 * GET /api/admin/conversions?account_id=xxx&days=30
 * Bestie revenue summary + recent attributed orders for one account.
 * Admin-internal (includes buyer PII from widget_conversions.customer).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export async function GET(request: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const accountId = request.nextUrl.searchParams.get('account_id');
    if (!accountId) {
      return NextResponse.json({ error: 'account_id required' }, { status: 400 });
    }
    const days = Math.min(parseInt(request.nextUrl.searchParams.get('days') || '30', 10) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from('widget_conversions')
      .select('id, anon_id, session_id, order_number, total, coupon_codes, line_items, customer, attribution, attributed_products, matched_session_ids, occurred_at')
      .eq('account_id', accountId)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tiers = ['direct', 'assisted', 'influenced', 'none'] as const;
    const byTier = Object.fromEntries(
      tiers.map((t) => {
        const tierRows = (rows || []).filter((r: any) => r.attribution === t);
        return [t, {
          count: tierRows.length,
          revenue: tierRows.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0),
        }];
      })
    );
    const attributed = (rows || []).filter((r: any) => r.attribution !== 'none');

    return NextResponse.json({
      days,
      totalOrders: rows?.length || 0,
      attributedOrders: attributed.length,
      attributedRevenue: attributed.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0),
      byTier,
      orders: rows || [],
    });
  } catch (e: any) {
    console.error('[admin/conversions] error:', e?.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke-test**

With dev server running and an admin session, `curl` (or browser) `http://localhost:3000/api/admin/conversions?account_id=c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1` → expected JSON with `byTier` and `orders` (possibly empty arrays — fine).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/conversions/route.ts
git commit -m "feat(admin): conversions summary API (Bestie revenue per account)" && git push
```

---

### Task 9: Recent sessions API

**Files:**
- Create: `src/app/api/admin/influencers/[id]/sessions/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/admin/influencers/[id]/sessions/route.ts
/**
 * GET /api/admin/influencers/[id]/sessions?limit=10
 * Recent chat sessions for the account page "שיחות אחרונות" section.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, anon_id, created_at, message_count, rolling_summary, lead_id')
      .eq('account_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sessions: data || [] });
  } catch (e: any) {
    console.error('[admin/sessions] error:', e?.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/admin/influencers/[id]/sessions/route.ts"
git commit -m "feat(admin): recent sessions API for account page" && git push
```

---

### Task 10: Brand section components

**Files:**
- Create: `src/app/admin/influencers/[id]/sections/RevenueSection.tsx`
- Create: `src/app/admin/influencers/[id]/sections/RecommendationsSection.tsx`
- Create: `src/app/admin/influencers/[id]/sections/ConversationsSection.tsx`
- Create: `src/app/admin/influencers/[id]/sections/WidgetSection.tsx`

Use the project's existing Card primitives — match imports used in `src/app/admin/dashboard/page.tsx` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` — check the exact import path there, likely `@/components/ui/...`). All three are client components fetching their own data.

- [ ] **Step 1: RevenueSection**

```tsx
// src/app/admin/influencers/[id]/sections/RevenueSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  direct: { label: 'ישיר (לחץ וקנה)', color: 'var(--success)' },
  assisted: { label: 'בסיוע (הומלץ וקנה)', color: '#818cf8' },
  influenced: { label: 'השפעה (שוחח וקנה)', color: '#a78bfa' },
  none: { label: 'ללא שיחה', color: 'var(--ink-400)' },
};

function ils(n: number) {
  return '₪' + Math.round(n).toLocaleString('he-IL');
}

export default function RevenueSection({ accountId }: { accountId: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/conversions?account_id=${accountId}&days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [accountId, days]);

  return (
    <Card>
      <CardHeader className="flex-row items-end justify-between">
        <div>
          <CardTitle>💰 הכנסות בסטי</CardTitle>
          <CardDescription>הזמנות שזוהו באתר ויוחסו לשיחות עם הבוט</CardDescription>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ui-input text-xs w-auto"
        >
          <option value={7}>7 ימים</option>
          <option value={30}>30 ימים</option>
          <option value={90}>90 ימים</option>
        </select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-[color:var(--ink-400)]">טוען…</div>
        ) : !data || data.totalOrders === 0 ? (
          <div className="text-sm text-[color:var(--ink-400)]">
            עדיין לא זוהו הזמנות בתקופה זו. (הזיהוי פעיל מרגע פריסת widget v4.1)
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-2xl font-bold">{ils(data.attributedRevenue)}</div>
                <div className="text-xs text-[color:var(--ink-500)]">
                  הכנסות מיוחסות לבסטי ({data.attributedOrders} הזמנות)
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">{data.totalOrders}</div>
                <div className="text-xs text-[color:var(--ink-500)]">סה"כ הזמנות שזוהו</div>
              </div>
            </div>
            <div className="space-y-1.5 mb-4">
              {Object.entries(TIER_LABELS).map(([tier, t]) => {
                const row = data.byTier?.[tier];
                if (!row) return null;
                return (
                  <div key={tier} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                      {t.label}
                    </span>
                    <span className="tabular-nums font-medium">
                      {row.count} · {ils(row.revenue)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-[color:var(--line)] pt-3 space-y-2 max-h-72 overflow-y-auto">
              {data.orders.slice(0, 20).map((o: any) => (
                <div key={o.id} className="flex items-start justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      #{o.order_number} · {ils(Number(o.total) || 0)}
                      <span
                        className="ms-2 px-1.5 py-0.5 rounded text-[10px]"
                        style={{ background: 'var(--surface-2)', color: TIER_LABELS[o.attribution]?.color }}
                      >
                        {TIER_LABELS[o.attribution]?.label || o.attribution}
                      </span>
                    </div>
                    <div className="text-[color:var(--ink-500)] truncate">
                      {(o.line_items || []).map((li: any) => li.name).join(', ')}
                    </div>
                    {o.customer && (o.customer.firstName || o.customer.email) ? (
                      <div className="text-[color:var(--ink-400)] truncate">
                        {[o.customer.firstName, o.customer.lastName, o.customer.email]
                          .filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-[color:var(--ink-400)] whitespace-nowrap">
                    {new Date(o.occurred_at).toLocaleDateString('he-IL')}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: RecommendationsSection** (wires the existing, never-rendered `/api/admin/recommendations`)

```tsx
// src/app/admin/influencers/[id]/sections/RecommendationsSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function RecommendationsSection({ accountId }: { accountId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/recommendations?account_id=${accountId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return null;
  const total = data?.totalRecommendations ?? data?.stats?.totalRecommendations ?? 0;
  const clicks = data?.totalClicks ?? data?.stats?.totalClicks ?? 0;
  const ctr = total > 0 ? Math.round((clicks / total) * 100) : 0;
  const topProducts = data?.topProducts || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>🛍️ המלצות מוצרים</CardTitle>
        <CardDescription>מה הבוט המליץ וכמה נלחץ</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xl font-bold tabular-nums">{total}</div>
            <div className="text-xs text-[color:var(--ink-500)]">המלצות</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{clicks}</div>
            <div className="text-xs text-[color:var(--ink-500)]">קליקים</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{ctr}%</div>
            <div className="text-xs text-[color:var(--ink-500)]">CTR</div>
          </div>
        </div>
        {topProducts.length > 0 && (
          <div className="space-y-1.5">
            {topProducts.slice(0, 5).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate">{p.name || p.product_name}</span>
                <span className="tabular-nums text-[color:var(--ink-500)] whitespace-nowrap ms-2">
                  {p.count ?? p.recommendations} המלצות · {p.clicks ?? 0} קליקים
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Note to implementer:** before finalizing, open `src/app/api/admin/recommendations/route.ts` and confirm the exact response field names (`totalRecommendations`/`topProducts` etc.) — adjust the component's field access to the actual shape. The optional-chaining fallbacks above are a safety net, not a substitute for checking.

- [ ] **Step 3: ConversationsSection**

```tsx
// src/app/admin/influencers/[id]/sections/ConversationsSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function ConversationsSection({ accountId }: { accountId: string }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/influencers/${accountId}/sessions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSessions(d?.sessions || []))
      .finally(() => setLoading(false));
  }, [accountId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>💬 שיחות אחרונות</CardTitle>
        <CardDescription>10 הסשנים האחרונים</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-[color:var(--ink-400)]">טוען…</div>
        ) : sessions.length === 0 ? (
          <div className="text-sm text-[color:var(--ink-400)]">אין שיחות עדיין</div>
        ) : (
          <div className="space-y-2.5">
            {sessions.map((s) => (
              <div key={s.id} className="text-xs border-b border-[color:var(--line)] pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-[color:var(--ink-500)]">
                    {new Date(s.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <span className="tabular-nums text-[color:var(--ink-400)]">
                    {s.message_count || 0} הודעות{s.lead_id ? ' · 🎯 ליד' : ''}
                  </span>
                </div>
                {s.rolling_summary ? (
                  <div className="mt-1 text-[color:var(--ink-600)] line-clamp-2">{s.rolling_summary}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: WidgetSection** (props-driven — data comes from the detail API fields added in Task 7; product count comes from `/api/admin/recommendations` which already returns `totalProducts`)

```tsx
// src/app/admin/influencers/[id]/sections/WidgetSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function WidgetSection({
  accountId,
  domain,
  modules,
}: {
  accountId: string;
  domain: string | null;
  modules: Record<string, { enabled?: boolean }> | null;
}) {
  const [productCount, setProductCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/admin/recommendations?account_id=${accountId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProductCount(d?.totalProducts ?? d?.stats?.totalProducts ?? null));
  }, [accountId]);

  const moduleEntries = Object.entries(modules || {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>🌐 ווידג'ט</CardTitle>
        <CardDescription>הטמעה באתר הלקוח</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[color:var(--ink-500)]">דומיין</span>
          {domain ? (
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline-offset-2 hover:underline"
            >
              {domain}
            </a>
          ) : (
            <span className="text-[color:var(--ink-400)]">—</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[color:var(--ink-500)]">מוצרים בקטלוג</span>
          <span className="tabular-nums font-medium">{productCount ?? '—'}</span>
        </div>
        {moduleEntries.length > 0 && (
          <div className="pt-1.5 border-t border-[color:var(--line)]">
            <div className="text-[color:var(--ink-500)] mb-1">מודולים</div>
            <div className="flex flex-wrap gap-1.5">
              {moduleEntries.map(([name, m]) => (
                <span
                  key={name}
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{
                    background: 'var(--surface-2)',
                    opacity: m?.enabled ? 1 : 0.45,
                  }}
                >
                  {name} {m?.enabled ? '✓' : '✕'}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → no new errors. (If the Card import path differs, fix to match what `src/app/admin/dashboard/page.tsx` uses.)

```bash
git add "src/app/admin/influencers/[id]/sections/"
git commit -m "feat(admin): revenue, recommendations, widget and conversations sections for account page" && git push
```

---

### Task 11: Archetype-aware page integration + dead-card cleanup

**Files:**
- Modify: `src/app/admin/influencers/[id]/page.tsx`

The page (777 lines) has anchor comments: `{/* A. Profile Card */}` (~line 338, includes the 2x3 IG stats grid at ~366), `{/* B. Persona Section */}` (~383), `{/* C. Documents Section */}` (~434), `{/* D. IG Connection Card */}` (~538), and further right-column cards (Copy buttons, AI Insight, Integrations, Color theme). **Read the full file before editing.**

- [ ] **Step 1: Add a brand flag and imports**

Near the top of the component (after `const [influencer, setInfluencer] = ...`):

```tsx
const isBrandWidget = !!influencer?.isBrandWidget;
```

Add imports:

```tsx
import RevenueSection from './sections/RevenueSection';
import RecommendationsSection from './sections/RecommendationsSection';
import ConversationsSection from './sections/ConversationsSection';
import WidgetSection from './sections/WidgetSection';
```

- [ ] **Step 2: Insert brand sections in the LEFT column**

Immediately after the `{/* B. Persona Section */}` card's closing tag and before `{/* C. Documents Section */}`, insert:

```tsx
          {/* B2. Brand commerce sections (widget accounts only) */}
          {isBrandWidget && (
            <>
              <RevenueSection accountId={id} />
              <RecommendationsSection accountId={id} />
            </>
          )}
```

- [ ] **Step 3: Hide influencer-only UI for brand accounts**

- Wrap the `{/* D. IG Connection Card */}` card in `{!isBrandWidget && ( ... )}`, and for brand accounts render in its place:

```tsx
          {isBrandWidget && (
            <WidgetSection
              accountId={id}
              domain={influencer?.widgetDomain || null}
              modules={influencer?.widgetModules || null}
            />
          )}
```

- In the Profile Card stats grid (~line 366): for brand accounts, hide the IG-only counters (Posts, Transcriptions, Partnerships) and keep Documents/Websites/Coupons. Implement by conditionally filtering the stat entries with `isBrandWidget`.
- Skip the `loadIgConnection()` call for brand accounts: in the `useEffect`, guard with `if (!influencer?.isBrandWidget)` (note: requires influencer loaded first — move the call to after `loadInfluencer()` resolves, or check the flag inside `loadIgConnection`).

- [ ] **Step 4: Add ConversationsSection to the RIGHT column (all account types)**

After the `{/* D. IG Connection Card */}` block (or where it would be for brands), insert:

```tsx
          <ConversationsSection accountId={id} />
```

- [ ] **Step 5: Remove the dead read-only cards**

Locate and delete the "Integrations" card (read-only Instagram/Gemini/Websites status) and the "AI Insight" card in the right column. Keep: Copy buttons, Color theme preview.

- [ ] **Step 6: Verify visually**

Run `npm run dev`, open `/admin/influencers/c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1` (Argania):
- Revenue, Recommendations sections appear; IG connection card, IG stats, Integrations and AI Insight cards gone; Conversations section shows recent sessions.

Open an influencer account page:
- Everything as before + Conversations section; no commerce sections.

- [ ] **Step 7: Type-check, lint, commit**

Run: `npm run type-check && npm run lint` → no new errors.

```bash
git add "src/app/admin/influencers/[id]/page.tsx"
git commit -m "feat(admin): archetype-aware account page — brand sections, dead cards removed" && git push
```

---

## Final verification

- [ ] Run the full unit suite: `npx vitest run` — expected: all green except the pre-existing `rate-limit.test.ts` failures (3 tests, broken before this work).
- [ ] `npm run type-check` — no new errors.
- [ ] Confirm live: widget.js deployed with `maybeSendConversion`, `/api/widget/conversion` answers `token_required` to empty POST, Argania admin page renders the new sections.
- [ ] Update memory: add conversion-pipeline facts to the project memory (new table, endpoint, widget version, admin sections).

## Out of scope (do not build)

- Client-facing dashboard, "add-all-to-cart" feature, Shopify webhook channel, coupon fallback, Studio Pasha rollout (enable after Argania verified — it's the same QuickShop platform, zero code changes expected).
