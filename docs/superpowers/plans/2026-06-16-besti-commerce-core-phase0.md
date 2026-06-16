# Besti Shared Commerce Core (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform-agnostic commerce core in the Besti backend so WooCommerce (Phase 1) and Shopify (Phase 2) plug into one pipeline for store registration, product sync, order-lookup, and webhooks.

**Architecture:** A `src/lib/commerce/` core defines a `CommerceProvider` interface, a registry, a shared integrations-config helper, an account-gated HMAC connect-token, a provider-agnostic product-sync pipeline, and an Upstash QStash durable queue. New `/api/connect/*` routes handle store registration (account-gated), webhooks, and a QStash worker. Shopify is wrapped as the reference provider so the whole pipeline is testable before any Woo code exists; sync/webhook plumbing is unit-tested with a fake provider.

**Tech Stack:** Next.js 16 App Router (route handlers, `runtime='nodejs'`), TypeScript, Supabase (service-role client for server routes), Upstash QStash (`@upstash/qstash`), Vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-16-besti-woocommerce-app-design.md`

---

## File Structure

Created in this plan:

- `src/lib/commerce/types.ts` — `CommerceProvider` interface + `RawProduct`, `ParsedWebhook`, `CommercePlatform`; owns `OrderLookupResult` (re-exported from the Shopify lib).
- `src/lib/commerce/connect-token.ts` — mint/verify account-scoped 15-min HMAC tokens + connect-link encode/decode.
- `src/lib/commerce/integrations.ts` — pure read-merge-write helpers for `accounts.config.integrations[platform]` + token masking.
- `src/lib/commerce/registry.ts` — `platform → CommerceProvider` map.
- `src/lib/commerce/sync-products.ts` — provider-agnostic upsert into `widget_products` (+ `mapRawToRow` pure mapper, soft-delete).
- `src/lib/commerce/queue.ts` — QStash enqueue + inbound-signature verify.
- `src/lib/shopify/provider.ts` — wraps `lookupShopifyOrder` in a `CommerceProvider` (sync/webhook stubs until Phase 2).
- `src/app/api/connect/register/route.ts` — account-gated store registration.
- `src/app/api/connect/webhooks/[platform]/route.ts` — webhook receiver → enqueue.
- `src/app/api/connect/sync-worker/route.ts` — QStash worker (full sync / webhook event).
- `src/app/api/connect/data-deletion/route.ts` — data-deletion endpoint (marketplace requirement).
- `src/app/api/admin/accounts/[accountId]/connect-link/route.ts` — admin: flag account for a platform + mint connect link.
- `src/app/api/cron/enrich-dirty-products/route.ts` — nightly re-enrichment of dirty products.
- `supabase/migrations/049_commerce_core.sql` — `external_id`, `source_platform`, `needs_enrichment` on `widget_products`.
- Tests under `tests/unit/commerce-*.test.ts`.

Modified:

- `src/lib/shopify/order-lookup.ts` — move `OrderLookupResult` to commerce/types, re-export (no behavior change).
- `src/app/api/admin/accounts/[accountId]/integrations/route.ts` — use the extracted `integrations.ts` helpers (no behavior change).
- `src/app/api/widget/order-lookup/route.ts` — resolve provider via the registry (Shopify behavior identical).

---

## Task 0: Dependencies + env

**Files:**
- Modify: `package.json` (via npm)
- Modify: `.env.example` / `scripts/check-env` (document new vars)

- [ ] **Step 1: Install QStash SDK**

Run: `npm install @upstash/qstash`
Expected: `@upstash/qstash` added to `package.json` dependencies.

- [ ] **Step 2: Document new env vars**

Add these to `.env.example` (create the lines if missing). They are read at runtime; the queue degrades to a direct worker call when `QSTASH_TOKEN` is absent (dev).

```bash
# Commerce core (Phase 0)
CONNECT_TOKEN_SECRET=        # optional; falls back to ANALYTICS_WIDGET_SECRET / IP_HASH_SALT / SUPABASE_SERVICE_ROLE_KEY
QSTASH_TOKEN=                # Upstash QStash publish token
QSTASH_CURRENT_SIGNING_KEY=  # for verifying inbound worker calls
QSTASH_NEXT_SIGNING_KEY=     # key rotation
APP_URL=https://bestie.ldrsgroup.com   # base URL the worker is reachable at
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore(commerce): add @upstash/qstash + document Phase 0 env vars"
```

---

## Task 1: Migration — commerce columns on widget_products

**Files:**
- Create: `supabase/migrations/049_commerce_core.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 049_commerce_core.sql
-- Phase 0 shared commerce core: live API sync needs a stable external key,
-- a source marker, and a dirty flag for nightly enrichment.

ALTER TABLE widget_products
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS source_platform TEXT NOT NULL DEFAULT 'scraper',
  ADD COLUMN IF NOT EXISTS needs_enrichment BOOLEAN NOT NULL DEFAULT false;

-- Upsert key for synced products. NON-partial on purpose: ON CONFLICT inference
-- does not use a partial index. Scraper rows keep NULL external_id and never
-- collide because Postgres treats NULLs as DISTINCT in unique indexes (default),
-- so many (account_id, NULL) rows are allowed while synced rows upsert cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS widget_products_account_external_uniq
  ON widget_products (account_id, external_id);

-- Nightly enrichment cron scans this.
CREATE INDEX IF NOT EXISTS widget_products_needs_enrichment_idx
  ON widget_products (account_id)
  WHERE needs_enrichment = true;

-- Existing rows came from the scraper.
UPDATE widget_products SET source_platform = 'scraper' WHERE source_platform IS NULL;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name: `commerce_core`, the SQL above), or `supabase db push` if running the CLI locally.
Expected: migration succeeds; `widget_products` now has `external_id`, `source_platform`, `needs_enrichment`.

- [ ] **Step 3: Verify columns exist**

Run a query (MCP `execute_sql`): `select column_name from information_schema.columns where table_name='widget_products' and column_name in ('external_id','source_platform','needs_enrichment');`
Expected: 3 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/049_commerce_core.sql
git commit -m "feat(commerce): migration for external_id/source_platform/needs_enrichment on widget_products"
```

---

## Task 2: Commerce types + move OrderLookupResult

**Files:**
- Create: `src/lib/commerce/types.ts`
- Modify: `src/lib/shopify/order-lookup.ts:22-33`
- Test: `tests/unit/commerce-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-types.test.ts
import { describe, it, expect } from 'vitest';
import type { OrderLookupResult, RawProduct, ParsedWebhook } from '@/lib/commerce/types';
import type { OrderLookupResult as ShopifyReExport } from '@/lib/shopify/order-lookup';

describe('commerce types', () => {
  it('OrderLookupResult is shared and re-exported from the shopify lib', () => {
    const r: OrderLookupResult = { found: false };
    const s: ShopifyReExport = r; // assignable both ways → same type
    expect(s.found).toBe(false);
  });
  it('RawProduct requires external_id + name', () => {
    const p: RawProduct = { external_id: 'sku-1', name: 'Argan Oil' };
    expect(p.external_id).toBe('sku-1');
  });
  it('ParsedWebhook discriminates on type', () => {
    const w: ParsedWebhook = { type: 'product.delete', external_id: 'sku-9' };
    expect(w.type).toBe('product.delete');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-types.test.ts`
Expected: FAIL — cannot find module `@/lib/commerce/types`.

- [ ] **Step 3: Create the types module**

```ts
// src/lib/commerce/types.ts
/**
 * Platform-agnostic commerce contracts. Each platform (Shopify, WooCommerce, …)
 * implements CommerceProvider; the registry maps platform → provider.
 */

export type CommercePlatform = 'shopify' | 'woocommerce';

export interface OrderLookupResult {
  found: boolean;
  orderNumber?: string;
  status?: string;
  placedAt?: string | null;
  total?: string;
  itemSummary?: string;
  trackingUrls?: string[];
  trackingNumbers?: string[];
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

/** Normalized product as a provider yields it, before DB mapping + enrichment. */
export interface RawProduct {
  external_id: string;
  name: string;
  name_he?: string;
  brand?: string;
  category?: string;
  description?: string;
  image_url?: string;
  product_url?: string;
  is_on_sale?: boolean;
}

export type ParsedWebhook =
  | { type: 'product.upsert'; product: RawProduct }
  | { type: 'product.delete'; external_id: string }
  | { type: 'order.update'; orderId: string }
  | { type: 'unknown' };

export interface CommerceProvider {
  platform: CommercePlatform;
  lookupOrder(cfg: any, orderNumber: string, email: string): Promise<OrderLookupResult>;
  fetchAllProducts(cfg: any): AsyncIterable<RawProduct>;
  /** Verify an inbound webhook signature against the account's stored secret. */
  verifyWebhook(rawBody: string, headers: Record<string, string>, cfg: any): boolean;
  parseWebhook(rawBody: string, headers: Record<string, string>): ParsedWebhook;
}
```

- [ ] **Step 4: Re-point the Shopify lib at the shared type**

In `src/lib/shopify/order-lookup.ts`, replace the local `OrderLookupResult` interface (lines 22-33) with a re-export. Leave `ShopifyIntegrationConfig` in place.

```ts
// src/lib/shopify/order-lookup.ts  (replace the `export interface OrderLookupResult {...}` block)
import type { OrderLookupResult } from '@/lib/commerce/types';
export type { OrderLookupResult };
```

- [ ] **Step 5: Run test + type-check**

Run: `npx vitest run tests/unit/commerce-types.test.ts && npm run type-check`
Expected: PASS; type-check clean (existing `import { OrderLookupResult } from '@/lib/shopify/order-lookup'` still resolves).

- [ ] **Step 6: Commit**

```bash
git add src/lib/commerce/types.ts src/lib/shopify/order-lookup.ts tests/unit/commerce-types.test.ts
git commit -m "feat(commerce): shared CommerceProvider types; move OrderLookupResult to commerce/types"
```

---

## Task 3: Connect-token (account-gated, 15-min)

**Files:**
- Create: `src/lib/commerce/connect-token.ts`
- Test: `tests/unit/commerce-connect-token.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-connect-token.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import {
  mintConnectToken, verifyConnectToken, encodeConnectLink, decodeConnectLink,
} from '@/lib/commerce/connect-token';

beforeAll(() => { process.env.CONNECT_TOKEN_SECRET = 'test-secret-123'; });

describe('connect-token', () => {
  it('mints a token that verifies back to account + platform', () => {
    const tok = mintConnectToken('acc-1', 'woocommerce');
    expect(verifyConnectToken(tok)).toEqual({ accountId: 'acc-1', platform: 'woocommerce' });
  });
  it('rejects a tampered token', () => {
    const tok = mintConnectToken('acc-1', 'woocommerce');
    expect(verifyConnectToken(tok.slice(0, -2) + 'xx')).toBeNull();
  });
  it('rejects a token signed with a different secret', () => {
    const tok = mintConnectToken('acc-1', 'woocommerce');
    process.env.CONNECT_TOKEN_SECRET = 'a-different-secret';
    expect(verifyConnectToken(tok)).toBeNull();
    process.env.CONNECT_TOKEN_SECRET = 'test-secret-123';
  });
  it('round-trips a connect link', () => {
    const tok = mintConnectToken('acc-7', 'woocommerce');
    const link = encodeConnectLink('acc-7', 'woocommerce', tok, 'https://bestie.ldrsgroup.com');
    expect(decodeConnectLink(link)).toEqual({
      accountId: 'acc-7', platform: 'woocommerce', token: tok, apiBase: 'https://bestie.ldrsgroup.com',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-connect-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (clone of widget-token.ts, scoped + 15-min)**

```ts
// src/lib/commerce/connect-token.ts
/**
 * Account- and platform-scoped HMAC connect tokens (15-min TTL). Minted by the
 * admin "flag + generate connect link" action; verified by /api/connect/register.
 * Same minimal-envelope design as lib/analytics/widget-token.ts (we control both ends).
 * Payload: { a: accountId, p: platform, e: expiresAtMs }
 */
import crypto from 'node:crypto';
import type { CommercePlatform } from './types';

const TOKEN_TTL_MS = 15 * 60 * 1000;

function getSecret(): string {
  const secret =
    process.env.CONNECT_TOKEN_SECRET ||
    process.env.ANALYTICS_WIDGET_SECRET ||
    process.env.IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('CONNECT_TOKEN_SECRET not configured');
  return secret;
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

export function mintConnectToken(accountId: string, platform: CommercePlatform): string {
  const payload = JSON.stringify({ a: accountId, p: platform, e: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = b64url(payload);
  const sig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export function verifyConnectToken(token: string): { accountId: string; platform: CommercePlatform } | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.', 2);
  if (!payloadB64 || !sigB64) return null;

  const expected = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  let provided: Buffer;
  try { provided = b64urlDecode(sigB64); } catch { return null; }
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  let payload: { a?: string; p?: string; e?: number };
  try { payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')); } catch { return null; }
  if (!payload.a || !payload.p || !payload.e || Date.now() > payload.e) return null;
  return { accountId: payload.a, platform: payload.p as CommercePlatform };
}

/** The single string a client pastes into the plugin. */
export function encodeConnectLink(accountId: string, platform: CommercePlatform, token: string, apiBase: string): string {
  return b64url(JSON.stringify({ a: accountId, p: platform, t: token, b: apiBase }));
}
export function decodeConnectLink(link: string): { accountId: string; platform: CommercePlatform; token: string; apiBase: string } | null {
  try {
    const o = JSON.parse(b64urlDecode(link).toString('utf8'));
    if (!o.a || !o.p || !o.t || !o.b) return null;
    return { accountId: o.a, platform: o.p, token: o.t, apiBase: o.b };
  } catch { return null; }
}
```

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run tests/unit/commerce-connect-token.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commerce/connect-token.ts tests/unit/commerce-connect-token.test.ts
git commit -m "feat(commerce): account+platform-scoped HMAC connect tokens (15-min) + connect-link codec"
```

---

## Task 4: Integrations config helper (extract from admin route)

**Files:**
- Create: `src/lib/commerce/integrations.ts`
- Modify: `src/app/api/admin/accounts/[accountId]/integrations/route.ts`
- Test: `tests/unit/commerce-integrations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-integrations.test.ts
import { describe, it, expect } from 'vitest';
import { maskToken, mergeIntegration, maskIntegrations } from '@/lib/commerce/integrations';

describe('integrations helper', () => {
  it('maskToken keeps only last 4', () => {
    expect(maskToken('shpat_abcd1234')).toBe('••••1234');
    expect(maskToken('')).toBeNull();
    expect(maskToken('xy')).toBe('••••');
  });
  it('mergeIntegration preserves other config + other platforms', () => {
    const config = { username: 'argania.co.il', integrations: { shopify: { enabled: true } } };
    const next = mergeIntegration(config, 'woocommerce', { enabled: true, shop_domain: 'a.co.il' });
    expect(next.username).toBe('argania.co.il');
    expect(next.integrations.shopify).toEqual({ enabled: true });
    expect(next.integrations.woocommerce).toEqual({ enabled: true, shop_domain: 'a.co.il' });
  });
  it('mergeIntegration shallow-merges into the same platform', () => {
    const config = { integrations: { woocommerce: { enabled: true, shop_domain: 'a.co.il' } } };
    const next = mergeIntegration(config, 'woocommerce', { consumer_key: 'ck_1' });
    expect(next.integrations.woocommerce).toEqual({ enabled: true, shop_domain: 'a.co.il', consumer_key: 'ck_1' });
  });
  it('maskIntegrations masks api_token and adds has_token', () => {
    const masked = maskIntegrations({ shopify: { enabled: true, api_token: 'shpat_zzzz9999' } });
    expect(masked.shopify.api_token).toBe('••••9999');
    expect(masked.shopify.has_token).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-integrations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/commerce/integrations.ts
/**
 * Pure read-merge-write helpers for accounts.config.integrations[platform].
 * Shared by the admin integrations route and /api/connect/register so the
 * config shape stays identical across both write paths.
 */

export function maskToken(t: unknown): string | null {
  if (typeof t !== 'string' || !t) return null;
  if (t.length <= 4) return '••••';
  return '••••' + t.slice(-4);
}

/** Shallow-merge a platform patch into config.integrations[platform]; returns a new config object. */
export function mergeIntegration(
  config: Record<string, any> | null | undefined,
  platform: string,
  patch: Record<string, any>,
): Record<string, any> {
  const cfg = (config || {}) as Record<string, any>;
  const integrations = (cfg.integrations || {}) as Record<string, any>;
  const existing = (integrations[platform] || {}) as Record<string, any>;
  return {
    ...cfg,
    integrations: { ...integrations, [platform]: { ...existing, ...patch } },
  };
}

/** Mask every platform's api_token for safe GET responses. */
export function maskIntegrations(integrations: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [platform, cfg] of Object.entries(integrations || {})) {
    safe[platform] = { ...cfg, api_token: maskToken((cfg as any)?.api_token), has_token: !!(cfg as any)?.api_token };
  }
  return safe;
}
```

- [ ] **Step 4: Refactor the admin route to use the helper (no behavior change)**

In `src/app/api/admin/accounts/[accountId]/integrations/route.ts`:
- Add import: `import { maskToken, mergeIntegration, maskIntegrations } from '@/lib/commerce/integrations';`
- Delete the local `maskToken` function (lines 27-31).
- In `GET`, replace the masking loop (lines 53-62) with:

```ts
  const integrations = ((account.config as any)?.integrations || {}) as Record<string, any>;
  return NextResponse.json({ integrations: maskIntegrations(integrations) });
```

- In `PUT`, replace the manual merge (lines 96-119) with the helper while keeping the token-preserve guard:

```ts
  const config = (account.config || {}) as Record<string, any>;
  const existing = ((config.integrations || {})[platform] || {}) as Record<string, any>;

  const patch: Record<string, any> = {
    shop_domain: typeof body.shop_domain === 'string' ? body.shop_domain.trim() : existing.shop_domain || '',
    enabled: body.enabled === true,
  };
  if (typeof body.api_token === 'string' && body.api_token.trim() && !body.api_token.startsWith('••••')) {
    patch.api_token = body.api_token.trim();
  }

  const updatedConfig = mergeIntegration(config, platform, patch);
  const next = updatedConfig.integrations[platform];

  const { error: writeErr } = await supabase
    .from('accounts')
    .update({ config: updatedConfig })
    .eq('id', accountId);
```

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run tests/unit/commerce-integrations.test.ts && npm run type-check && npm run lint`
Expected: PASS; clean. (Admin route still compiles and behaves identically.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/commerce/integrations.ts src/app/api/admin/accounts/[accountId]/integrations/route.ts tests/unit/commerce-integrations.test.ts
git commit -m "refactor(commerce): extract shared integrations read-merge-write helper; admin route reuses it"
```

---

## Task 5: Shopify provider wrapper

**Files:**
- Create: `src/lib/shopify/provider.ts`
- Test: `tests/unit/commerce-shopify-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-shopify-provider.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/shopify/order-lookup', () => ({
  lookupShopifyOrder: vi.fn(async () => ({ found: true, orderNumber: '#1001' })),
}));

import { shopifyProvider } from '@/lib/shopify/provider';

describe('shopifyProvider', () => {
  it('delegates lookupOrder to lookupShopifyOrder', async () => {
    const r = await shopifyProvider.lookupOrder({ shop_domain: 's', admin_api_token: 't' }, '1001', 'a@b.com');
    expect(r).toEqual({ found: true, orderNumber: '#1001' });
  });
  it('exposes platform="shopify"', () => {
    expect(shopifyProvider.platform).toBe('shopify');
  });
  it('fetchAllProducts is not implemented until Phase 2', async () => {
    await expect(async () => { for await (const _ of shopifyProvider.fetchAllProducts({})) { /* */ } })
      .rejects.toThrow(/not implemented/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-shopify-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/shopify/provider.ts
import type { CommerceProvider, RawProduct, ParsedWebhook } from '@/lib/commerce/types';
import { lookupShopifyOrder } from './order-lookup';

export const shopifyProvider: CommerceProvider = {
  platform: 'shopify',
  lookupOrder: (cfg, orderNumber, email) => lookupShopifyOrder(cfg, orderNumber, email),
  // Product sync + webhooks land in Phase 2; the interface exists now so the
  // pipeline is buildable/testable with a fake provider.
  async *fetchAllProducts(_cfg: any): AsyncIterable<RawProduct> {
    throw new Error('shopify fetchAllProducts not implemented (Phase 2)');
  },
  verifyWebhook(): boolean {
    throw new Error('shopify verifyWebhook not implemented (Phase 2)');
  },
  parseWebhook(): ParsedWebhook {
    return { type: 'unknown' };
  },
};
```

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run tests/unit/commerce-shopify-provider.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shopify/provider.ts tests/unit/commerce-shopify-provider.test.ts
git commit -m "feat(commerce): wrap Shopify order-lookup as a CommerceProvider"
```

---

## Task 6: Provider registry

**Files:**
- Create: `src/lib/commerce/registry.ts`
- Test: `tests/unit/commerce-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-registry.test.ts
import { describe, it, expect } from 'vitest';
import { getProvider, resolveAccountProvider } from '@/lib/commerce/registry';

describe('registry', () => {
  it('resolves the shopify provider', () => {
    expect(getProvider('shopify')?.platform).toBe('shopify');
  });
  it('returns null for an unknown platform', () => {
    expect(getProvider('magento')).toBeNull();
  });
  it('resolveAccountProvider picks the first enabled+registered platform', () => {
    const config = { integrations: { shopify: { enabled: true, shop_domain: 's', admin_api_token: 't' } } };
    const r = resolveAccountProvider(config);
    expect(r?.platform).toBe('shopify');
    expect(r?.cfg.shop_domain).toBe('s');
  });
  it('resolveAccountProvider returns null when nothing enabled', () => {
    expect(resolveAccountProvider({ integrations: { shopify: { enabled: false } } })).toBeNull();
    expect(resolveAccountProvider({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/commerce/registry.ts
import type { CommerceProvider, CommercePlatform } from './types';
import { shopifyProvider } from '@/lib/shopify/provider';

// Phase 1 adds: import { woocommerceProvider } ... and registers it here.
const providers: Partial<Record<CommercePlatform, CommerceProvider>> = {
  shopify: shopifyProvider,
};

export function getProvider(platform: string): CommerceProvider | null {
  return providers[platform as CommercePlatform] ?? null;
}

export function registerProvider(p: CommerceProvider): void {
  providers[p.platform] = p;
}

/** Find the account's active commerce platform: first enabled integration that has a registered provider. */
export function resolveAccountProvider(
  config: Record<string, any> | null | undefined,
): { platform: CommercePlatform; cfg: any; provider: CommerceProvider } | null {
  const integrations = (config?.integrations || {}) as Record<string, any>;
  for (const [platform, cfg] of Object.entries(integrations)) {
    if (cfg?.enabled !== true) continue;
    const provider = getProvider(platform);
    if (provider) return { platform: provider.platform, cfg, provider };
  }
  return null;
}
```

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run tests/unit/commerce-registry.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commerce/registry.ts tests/unit/commerce-registry.test.ts
git commit -m "feat(commerce): provider registry + resolveAccountProvider"
```

---

## Task 7: Refactor widget order-lookup route to the registry

**Files:**
- Modify: `src/app/api/widget/order-lookup/route.ts`
- Test: `tests/unit/commerce-order-lookup-route.test.ts`

- [ ] **Step 1: Write the failing regression test**

```ts
// tests/unit/commerce-order-lookup-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lookupOrder = vi.fn(async () => ({ found: true, orderNumber: '#1001' }));
vi.mock('@/lib/commerce/registry', () => ({
  resolveAccountProvider: vi.fn((config: any) =>
    config?.integrations?.shopify?.enabled
      ? { platform: 'shopify', cfg: config.integrations.shopify, provider: { lookupOrder } }
      : null),
}));
const single = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }),
}));

import { POST } from '@/app/api/widget/order-lookup/route';

function req(body: any) {
  return new Request('http://x/api/widget/order-lookup', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://shop.com' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => { lookupOrder.mockClear(); single.mockReset(); });

describe('widget order-lookup route (registry)', () => {
  it('returns the provider result for a configured Shopify account', async () => {
    single.mockResolvedValue({ data: { config: { integrations: { shopify: { enabled: true, shop_domain: 's', admin_api_token: 't' } } } } });
    const res = await POST(req({ accountId: 'a', orderNumber: '1001', email: 'a@b.com' }));
    expect(await res.json()).toEqual({ found: true, orderNumber: '#1001' });
  });
  it('returns integration_missing (503) when no provider is enabled', async () => {
    single.mockResolvedValue({ data: { config: { integrations: {} } } });
    const res = await POST(req({ accountId: 'a', orderNumber: '1001', email: 'a@b.com' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('integration_missing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-order-lookup-route.test.ts`
Expected: FAIL — route still imports Shopify directly / assertion mismatch.

- [ ] **Step 3: Refactor the route**

Replace the body of `src/app/api/widget/order-lookup/route.ts` (keep the `cors`/`OPTIONS` block) so the handler resolves the provider via the registry:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveAccountProvider } from '@/lib/commerce/registry';

// ...keep existing cors() and OPTIONS()...

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin') || '*');
  try {
    const body = await req.json();
    const accountId: string | undefined = body?.accountId;
    const orderNumber: string | undefined = body?.orderNumber;
    const email: string | undefined = body?.email;

    if (!accountId || !orderNumber || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'accountId + orderNumber + valid email required' }, { status: 400, headers });
    }

    const supabase = await createClient();
    const { data: account } = await supabase
      .from('accounts').select('config, language').eq('id', accountId).single();
    if (!account) {
      return NextResponse.json({ error: 'account not found' }, { status: 404, headers });
    }

    const resolved = resolveAccountProvider((account as any).config || {});
    if (!resolved) {
      return NextResponse.json({ error: 'Order tracking not available for this store', code: 'integration_missing' }, { status: 503, headers });
    }

    const result = await resolved.provider.lookupOrder(resolved.cfg, orderNumber, email);
    return NextResponse.json(result, { headers });
  } catch (err: any) {
    console.error('[Widget Order Lookup] error:', err);
    return NextResponse.json({ error: err?.message || 'internal error' }, { status: 500, headers });
  }
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run tests/unit/commerce-order-lookup-route.test.ts && npm run type-check`
Expected: PASS; clean. Shopify-configured accounts behave exactly as before; unconfigured accounts still get `integration_missing`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/widget/order-lookup/route.ts tests/unit/commerce-order-lookup-route.test.ts
git commit -m "refactor(commerce): widget order-lookup resolves provider via registry (Shopify unchanged)"
```

---

## Task 8: Product mapping + sync pipeline

**Files:**
- Create: `src/lib/commerce/sync-products.ts`
- Test: `tests/unit/commerce-sync-products.test.ts`

- [ ] **Step 1: Write the failing test (pure mapper + soft-delete logic)**

```ts
// tests/unit/commerce-sync-products.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mapRawToRow } from '@/lib/commerce/sync-products';
import type { RawProduct } from '@/lib/commerce/types';

describe('mapRawToRow', () => {
  it('maps a RawProduct to a widget_products row with sync metadata', () => {
    const raw: RawProduct = {
      external_id: 'wc-42', name: 'Argan Oil', name_he: 'שמן ארגן',
      brand: 'Argania', category: 'hair_care', description: 'd',
      image_url: 'http://i/1.jpg', product_url: 'http://s/p/42', is_on_sale: true,
    };
    const row = mapRawToRow('acc-1', 'woocommerce', raw);
    expect(row).toMatchObject({
      account_id: 'acc-1', external_id: 'wc-42', source_platform: 'woocommerce',
      name: 'Argan Oil', name_he: 'שמן ארגן', brand: 'Argania', category: 'hair_care',
      image_url: 'http://i/1.jpg', product_url: 'http://s/p/42',
      is_on_sale: true, is_available: true, needs_enrichment: true,
    });
    expect(typeof row.updated_at).toBe('string');
  });
  it('defaults optional fields to null/false', () => {
    const row = mapRawToRow('acc-1', 'woocommerce', { external_id: 'x', name: 'n' });
    expect(row.name_he).toBeNull();
    expect(row.is_on_sale).toBe(false);
    expect(row.needs_enrichment).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-sync-products.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pipeline**

```ts
// src/lib/commerce/sync-products.ts
/**
 * Provider-agnostic product sync into widget_products. Upsert by
 * (account_id, external_id); soft-delete rows missing from a full sync; mark
 * everything needs_enrichment=true (enrichment runs as a batch after a full
 * sync, and nightly for incremental webhook changes).
 */
import { supabase } from '@/lib/supabase';
import type { CommerceProvider, CommercePlatform, RawProduct } from './types';

export interface ProductRow {
  account_id: string;
  external_id: string;
  source_platform: string;
  name: string;
  name_he: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  product_url: string | null;
  is_on_sale: boolean;
  is_available: boolean;
  needs_enrichment: boolean;
  updated_at: string;
}

export function mapRawToRow(accountId: string, platform: CommercePlatform, raw: RawProduct): ProductRow {
  return {
    account_id: accountId,
    external_id: raw.external_id,
    source_platform: platform,
    name: raw.name,
    name_he: raw.name_he ?? null,
    brand: raw.brand ?? null,
    category: raw.category ?? null,
    description: raw.description ?? null,
    image_url: raw.image_url ?? null,
    product_url: raw.product_url ?? null,
    is_on_sale: raw.is_on_sale ?? false,
    is_available: true,
    needs_enrichment: true,
    updated_at: new Date().toISOString(),
  };
}

/** Upsert one product (used by webhook events too). */
export async function upsertProduct(accountId: string, platform: CommercePlatform, raw: RawProduct): Promise<void> {
  const row = mapRawToRow(accountId, platform, raw);
  const { error } = await supabase.from('widget_products').upsert(row, { onConflict: 'account_id,external_id' });
  if (error) throw new Error(`upsertProduct failed: ${error.message}`);
}

/** Soft-delete (is_available=false) products for this platform absent from the full sync. */
export async function softDeleteMissing(accountId: string, platform: CommercePlatform, keepIds: string[]): Promise<void> {
  let q = supabase.from('widget_products')
    .update({ is_available: false, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('source_platform', platform);
  if (keepIds.length) q = q.not('external_id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`);
  const { error } = await q;
  if (error) throw new Error(`softDeleteMissing failed: ${error.message}`);
}

/** Full sync: iterate the provider, upsert each, soft-delete the rest. */
export async function syncAllProducts(
  accountId: string, platform: CommercePlatform, provider: CommerceProvider, cfg: any,
): Promise<{ count: number }> {
  const seen: string[] = [];
  for await (const raw of provider.fetchAllProducts(cfg)) {
    await upsertProduct(accountId, platform, raw);
    seen.push(raw.external_id);
  }
  await softDeleteMissing(accountId, platform, seen);
  return { count: seen.length };
}
```

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run tests/unit/commerce-sync-products.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commerce/sync-products.ts tests/unit/commerce-sync-products.test.ts
git commit -m "feat(commerce): provider-agnostic product sync into widget_products"
```

---

## Task 9: QStash queue helpers

**Files:**
- Create: `src/lib/commerce/queue.ts`
- Test: `tests/unit/commerce-queue.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-queue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const publishJSON = vi.fn(async () => ({ messageId: 'm1' }));
const verify = vi.fn(async () => true);
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(() => ({ publishJSON })),
  Receiver: vi.fn(() => ({ verify })),
}));
const fetchMock = vi.fn(async () => ({ ok: true }));
vi.stubGlobal('fetch', fetchMock);

import { enqueueJob, verifyWorkerSignature, type SyncJob } from '@/lib/commerce/queue';

beforeEach(() => { publishJSON.mockClear(); fetchMock.mockClear(); });

describe('queue', () => {
  it('publishes via QStash when QSTASH_TOKEN is set', async () => {
    process.env.QSTASH_TOKEN = 'tok'; process.env.APP_URL = 'https://x';
    const job: SyncJob = { type: 'full-sync', accountId: 'a', platform: 'woocommerce' };
    await enqueueJob(job);
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://x/api/connect/sync-worker', body: job }));
  });
  it('falls back to a direct worker fetch when QSTASH_TOKEN is missing (dev)', async () => {
    delete process.env.QSTASH_TOKEN; process.env.APP_URL = 'https://x';
    await enqueueJob({ type: 'full-sync', accountId: 'a', platform: 'woocommerce' });
    expect(fetchMock).toHaveBeenCalledWith('https://x/api/connect/sync-worker', expect.objectContaining({ method: 'POST' }));
  });
  it('verifyWorkerSignature returns false when no signing key is configured', async () => {
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    expect(await verifyWorkerSignature('sig', 'body')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/commerce/queue.ts
/**
 * Durable async via Upstash QStash. enqueueJob publishes to the sync-worker
 * route; verifyWorkerSignature authenticates inbound worker calls. In dev (no
 * QSTASH_TOKEN) we POST the worker directly so the flow still works locally.
 */
import { Client, Receiver } from '@upstash/qstash';
import type { CommercePlatform, ParsedWebhook } from './types';

export type SyncJob =
  | { type: 'full-sync'; accountId: string; platform: CommercePlatform }
  | { type: 'webhook-event'; accountId: string; platform: CommercePlatform; event: ParsedWebhook };

function workerUrl(): string {
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/connect/sync-worker`;
}

export async function enqueueJob(job: SyncJob): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  if (token) {
    const client = new Client({ token });
    await client.publishJSON({ url: workerUrl(), body: job });
    return;
  }
  // Dev fallback: fire the worker directly (no durability, fine for local).
  await fetch(workerUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-direct': '1' },
    body: JSON.stringify(job),
  });
}

export async function verifyWorkerSignature(signature: string | null, rawBody: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signature || !currentSigningKey) return false;
  const receiver = new Receiver({ currentSigningKey, nextSigningKey: nextSigningKey || currentSigningKey });
  try {
    return await receiver.verify({ signature, body: rawBody });
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run tests/unit/commerce-queue.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commerce/queue.ts tests/unit/commerce-queue.test.ts
git commit -m "feat(commerce): QStash enqueue + inbound signature verify (dev direct-call fallback)"
```

---

## Task 10: Register route (account-gated)

**Files:**
- Create: `src/app/api/connect/register/route.ts`
- Test: `tests/unit/commerce-register-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-register-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99 })) }));
const enqueueJob = vi.fn(async () => {});
vi.mock('@/lib/commerce/queue', () => ({ enqueueJob }));

const single = vi.fn();
const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single }) }), update }) },
}));

import { mintConnectToken } from '@/lib/commerce/connect-token';
import { POST } from '@/app/api/connect/register/route';

function req(body: any) {
  return new Request('http://x/api/connect/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as any;
}
beforeEach(() => { process.env.CONNECT_TOKEN_SECRET = 's'; single.mockReset(); enqueueJob.mockClear(); });

describe('POST /api/connect/register', () => {
  it('rejects a bad connect token', async () => {
    single.mockResolvedValue({ data: { id: 'a', config: { integrations: { woocommerce: { enabled: true } } } } });
    const res = await POST(req({ account_id: 'a', platform: 'woocommerce', shop_domain: 's', credentials: {}, connect_token: 'garbage' }));
    expect(res.status).toBe(401);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  it('rejects when the account is not flagged for the platform (gating #2)', async () => {
    single.mockResolvedValue({ data: { id: 'a', config: { integrations: {} } } });
    const token = mintConnectToken('a', 'woocommerce');
    const res = await POST(req({ account_id: 'a', platform: 'woocommerce', shop_domain: 's', credentials: {}, connect_token: token }));
    expect(res.status).toBe(403);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  it('rejects when the account does not exist (gating #1)', async () => {
    single.mockResolvedValue({ data: null });
    const token = mintConnectToken('a', 'woocommerce');
    const res = await POST(req({ account_id: 'a', platform: 'woocommerce', shop_domain: 's', credentials: {}, connect_token: token }));
    expect(res.status).toBe(404);
  });
  it('accepts, stores creds, and enqueues a full sync on the happy path', async () => {
    single.mockResolvedValue({ data: { id: 'a', config: { integrations: { woocommerce: { enabled: true } } } } });
    const token = mintConnectToken('a', 'woocommerce');
    const res = await POST(req({
      account_id: 'a', platform: 'woocommerce', shop_domain: 'shop.co.il',
      credentials: { consumer_key: 'ck', consumer_secret: 'cs', webhook_secret: 'ws' }, connect_token: token,
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(update).toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith({ type: 'full-sync', accountId: 'a', platform: 'woocommerce' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-register-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/connect/register/route.ts
/**
 * Account-gated store registration. A connector plugin posts its freshly-issued
 * store API credentials here. Accepted ONLY when (1) the account exists and
 * (2) it is flagged for this platform (integrations[platform].enabled === true),
 * AND the connect token verifies for that account+platform. On success we merge
 * the creds and enqueue an initial full sync. Credentials are never logged/echoed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyConnectToken } from '@/lib/commerce/connect-token';
import { mergeIntegration } from '@/lib/commerce/integrations';
import { enqueueJob } from '@/lib/commerce/queue';
import { checkRateLimit } from '@/lib/rate-limit';
import type { CommercePlatform } from '@/lib/commerce/types';

export const runtime = 'nodejs';

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin') || '*');
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers }); }

  const accountId = String(body?.account_id || '');
  const platform = String(body?.platform || '') as CommercePlatform;
  const shopDomain = String(body?.shop_domain || '').trim();
  const credentials = (body?.credentials || {}) as Record<string, any>;
  const connectToken = String(body?.connect_token || '');

  if (!accountId || !platform || !shopDomain || !connectToken) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400, headers });
  }

  const rl = await checkRateLimit('account', 'admin', { accountId });
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers });

  // Connect token must verify AND match the claimed account+platform.
  const verified = verifyConnectToken(connectToken);
  if (!verified || verified.accountId !== accountId || verified.platform !== platform) {
    return NextResponse.json({ error: 'invalid_connect_token' }, { status: 401, headers });
  }

  // Gating #1: account exists.
  const { data: account } = await supabase.from('accounts').select('id, config').eq('id', accountId).single();
  if (!account) return NextResponse.json({ error: 'account_not_found' }, { status: 404, headers });

  // Gating #2: account flagged for this platform.
  const config = ((account as any).config || {}) as Record<string, any>;
  if (config?.integrations?.[platform]?.enabled !== true) {
    return NextResponse.json({ error: 'platform_not_enabled' }, { status: 403, headers });
  }

  // Merge creds (preserve enabled flag + other config).
  const patch: Record<string, any> = { enabled: true, shop_domain: shopDomain };
  for (const k of ['consumer_key', 'consumer_secret', 'admin_api_token', 'webhook_secret']) {
    if (typeof credentials[k] === 'string' && credentials[k].trim()) patch[k] = credentials[k].trim();
  }
  const updatedConfig = mergeIntegration(config, platform, patch);
  const { error: writeErr } = await supabase.from('accounts').update({ config: updatedConfig }).eq('id', accountId);
  if (writeErr) return NextResponse.json({ error: 'store_failed' }, { status: 500, headers });

  await enqueueJob({ type: 'full-sync', accountId, platform });
  return NextResponse.json({ ok: true, platform }, { headers });
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run tests/unit/commerce-register-route.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/connect/register/route.ts tests/unit/commerce-register-route.test.ts
git commit -m "feat(commerce): account-gated /api/connect/register (both gating conditions + token)"
```

---

## Task 11: Admin "flag platform + generate connect link"

**Files:**
- Create: `src/app/api/admin/accounts/[accountId]/connect-link/route.ts`
- Test: `tests/unit/commerce-connect-link-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-connect-link-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: vi.fn(async () => null) }));
const single = vi.fn();
const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single }) }), update }) } }));

import { decodeConnectLink } from '@/lib/commerce/connect-token';
import { POST } from '@/app/api/admin/accounts/[accountId]/connect-link/route';

function ctx(accountId: string) { return { params: Promise.resolve({ accountId }) }; }
function req(body: any) { return new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as any; }
beforeEach(() => { process.env.CONNECT_TOKEN_SECRET = 's'; process.env.APP_URL = 'https://bestie.ldrsgroup.com'; single.mockReset(); update.mockClear(); });

describe('POST connect-link', () => {
  it('flags the account for the platform and returns a decodable connect link', async () => {
    single.mockResolvedValue({ data: { id: 'a', config: {} } });
    const res = await POST(req({ platform: 'woocommerce' }), ctx('a'));
    expect(res.status).toBe(200);
    const { connect_link } = await res.json();
    const decoded = decodeConnectLink(connect_link);
    expect(decoded?.accountId).toBe('a');
    expect(decoded?.platform).toBe('woocommerce');
    expect(update).toHaveBeenCalled(); // enabled flag persisted
  });
  it('rejects an unsupported platform', async () => {
    single.mockResolvedValue({ data: { id: 'a', config: {} } });
    const res = await POST(req({ platform: 'magento' }), ctx('a'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-connect-link-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/api/admin/accounts/[accountId]/connect-link/route.ts
/**
 * Admin: flag an account as a given commerce platform (gating condition #2) and
 * mint a connect link the operator hands to the client. The link carries
 * account_id + platform + a 15-min signed token + the API base.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { mergeIntegration } from '@/lib/commerce/integrations';
import { mintConnectToken, encodeConnectLink } from '@/lib/commerce/connect-token';
import type { CommercePlatform } from '@/lib/commerce/types';

export const runtime = 'nodejs';
const SUPPORTED: CommercePlatform[] = ['shopify', 'woocommerce'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const platform = String(body?.platform || '') as CommercePlatform;
  if (!SUPPORTED.includes(platform)) return NextResponse.json({ error: 'unsupported_platform' }, { status: 400 });

  const { data: account } = await supabase.from('accounts').select('id, config').eq('id', accountId).single();
  if (!account) return NextResponse.json({ error: 'account_not_found' }, { status: 404 });

  // Flag (gating #2): enabled=true with no creds yet; register fills creds later.
  const config = ((account as any).config || {}) as Record<string, any>;
  const updatedConfig = mergeIntegration(config, platform, { enabled: true });
  const { error } = await supabase.from('accounts').update({ config: updatedConfig }).eq('id', accountId);
  if (error) return NextResponse.json({ error: 'flag_failed' }, { status: 500 });

  const apiBase = (process.env.APP_URL || 'https://bestie.ldrsgroup.com').replace(/\/$/, '');
  const token = mintConnectToken(accountId, platform);
  const connect_link = encodeConnectLink(accountId, platform, token, apiBase);

  return NextResponse.json({ ok: true, platform, connect_link, expires_in_seconds: 900 });
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run tests/unit/commerce-connect-link-route.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/admin/accounts/[accountId]/connect-link/route.ts" tests/unit/commerce-connect-link-route.test.ts
git commit -m "feat(commerce): admin flag-platform + generate connect-link route"
```

---

## Task 12: Sync worker (QStash) route

**Files:**
- Create: `src/app/api/connect/sync-worker/route.ts`
- Test: `tests/unit/commerce-sync-worker-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-sync-worker-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyWorkerSignature = vi.fn(async () => true);
vi.mock('@/lib/commerce/queue', () => ({ verifyWorkerSignature }));
const syncAllProducts = vi.fn(async () => ({ count: 3 }));
const upsertProduct = vi.fn(async () => {});
vi.mock('@/lib/commerce/sync-products', () => ({ syncAllProducts, upsertProduct, softDeleteMissing: vi.fn() }));
const enrichAllProducts = vi.fn(async () => ({ productsEnriched: 3 }));
vi.mock('@/lib/recommendations/enrich-products', () => ({ enrichAllProducts }));
const single = vi.fn(async () => ({ data: { id: 'a', config: { integrations: { woocommerce: { enabled: true } } } } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) } }));
vi.mock('@/lib/commerce/registry', () => ({
  getProvider: () => ({ platform: 'woocommerce', fetchAllProducts: async function* () {} }),
}));

import { POST } from '@/app/api/connect/sync-worker/route';

function req(job: any) {
  return new Request('http://x/api/connect/sync-worker', {
    method: 'POST', headers: { 'content-type': 'application/json', 'upstash-signature': 'sig' }, body: JSON.stringify(job),
  }) as any;
}
beforeEach(() => { verifyWorkerSignature.mockClear(); syncAllProducts.mockClear(); enrichAllProducts.mockClear(); });

describe('POST /api/connect/sync-worker', () => {
  it('rejects an unsigned request', async () => {
    verifyWorkerSignature.mockResolvedValueOnce(false);
    const res = await POST(req({ type: 'full-sync', accountId: 'a', platform: 'woocommerce' }));
    expect(res.status).toBe(401);
  });
  it('runs a full sync then batch-enriches', async () => {
    const res = await POST(req({ type: 'full-sync', accountId: 'a', platform: 'woocommerce' }));
    expect(res.status).toBe(200);
    expect(syncAllProducts).toHaveBeenCalled();
    expect(enrichAllProducts).toHaveBeenCalledWith('a');
  });
  it('processes a product.upsert webhook event without enriching inline', async () => {
    const res = await POST(req({ type: 'webhook-event', accountId: 'a', platform: 'woocommerce', event: { type: 'product.upsert', product: { external_id: 'x', name: 'n' } } }));
    expect(res.status).toBe(200);
    expect(upsertProduct).toHaveBeenCalled();
    expect(enrichAllProducts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-sync-worker-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/api/connect/sync-worker/route.ts
/**
 * QStash worker. Authenticated by the QStash signature (dev: x-dev-direct).
 * full-sync   → fetch all products via the provider, upsert, soft-delete, then
 *               batch-enrich the whole account.
 * webhook-event → upsert/soft-delete a single product (mark dirty for nightly
 *                 enrichment); order events bust no cache here yet (Phase 1).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getProvider } from '@/lib/commerce/registry';
import { syncAllProducts, upsertProduct, softDeleteMissing } from '@/lib/commerce/sync-products';
import { verifyWorkerSignature } from '@/lib/commerce/queue';
import { enrichAllProducts } from '@/lib/recommendations/enrich-products';
import type { SyncJob } from '@/lib/commerce/queue';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  const devDirect = req.headers.get('x-dev-direct') === '1' && !process.env.QSTASH_TOKEN;
  if (!devDirect && !(await verifyWorkerSignature(signature, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  let job: SyncJob;
  try { job = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const provider = getProvider(job.platform);
  if (!provider) return NextResponse.json({ error: 'unknown_platform' }, { status: 400 });

  const { data: account } = await supabase.from('accounts').select('id, config').eq('id', job.accountId).single();
  const cfg = ((account as any)?.config?.integrations || {})[job.platform];
  if (!cfg) return NextResponse.json({ error: 'integration_missing' }, { status: 400 });

  if (job.type === 'full-sync') {
    const result = await syncAllProducts(job.accountId, job.platform, provider, cfg);
    await enrichAllProducts(job.accountId); // batch enrichment after a full sync
    return NextResponse.json({ ok: true, ...result });
  }

  // webhook-event — single product; never call softDeleteMissing here (that is
  // the full-sync reaper and would wipe the whole catalog for one event).
  const ev = job.event;
  if (ev.type === 'product.upsert') {
    await upsertProduct(job.accountId, job.platform, ev.product); // needs_enrichment=true → nightly cron
  } else if (ev.type === 'product.delete') {
    await supabase.from('widget_products')
      .update({ is_available: false, updated_at: new Date().toISOString() })
      .eq('account_id', job.accountId)
      .eq('source_platform', job.platform)
      .eq('external_id', ev.external_id);
  }
  // order.update / unknown → no-op here (order cache busting lands with Phase 1 order cache)
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run tests/unit/commerce-sync-worker-route.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/connect/sync-worker/route.ts tests/unit/commerce-sync-worker-route.test.ts
git commit -m "feat(commerce): QStash sync-worker (full-sync + batch enrich; webhook events mark dirty)"
```

---

## Task 13: Webhook receiver route

**Files:**
- Create: `src/app/api/connect/webhooks/[platform]/route.ts`
- Test: `tests/unit/commerce-webhook-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-webhook-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enqueueJob = vi.fn(async () => {});
vi.mock('@/lib/commerce/queue', () => ({ enqueueJob }));
const verifyWebhook = vi.fn(() => true);
const parseWebhook = vi.fn(() => ({ type: 'product.upsert', product: { external_id: 'x', name: 'n' } }));
vi.mock('@/lib/commerce/registry', () => ({ getProvider: () => ({ platform: 'woocommerce', verifyWebhook, parseWebhook }) }));
const single = vi.fn(async () => ({ data: { id: 'a', config: { integrations: { woocommerce: { enabled: true, webhook_secret: 'ws' } } } } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) } }));

import { POST } from '@/app/api/connect/webhooks/[platform]/route';

function ctx(p: string) { return { params: Promise.resolve({ platform: p }) }; }
function req(account = 'a') {
  return new Request(`http://x/api/connect/webhooks/woocommerce?account=${account}`, {
    method: 'POST', headers: { 'x-wc-webhook-signature': 'sig' }, body: '{"id":1}',
  }) as any;
}
beforeEach(() => { enqueueJob.mockClear(); verifyWebhook.mockReturnValue(true); });

describe('POST /api/connect/webhooks/[platform]', () => {
  it('401 on bad signature, no enqueue', async () => {
    verifyWebhook.mockReturnValueOnce(false);
    const res = await POST(req(), ctx('woocommerce'));
    expect(res.status).toBe(401);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  it('200 + enqueues a webhook-event on valid signature', async () => {
    const res = await POST(req(), ctx('woocommerce'));
    expect(res.status).toBe(200);
    expect(enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'webhook-event', accountId: 'a', platform: 'woocommerce' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-webhook-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/api/connect/webhooks/[platform]/route.ts
/**
 * Inbound commerce webhooks. The plugin registers webhooks at
 *   /api/connect/webhooks/{platform}?account={id}
 * We verify the provider signature against the account's stored webhook secret,
 * parse the event, enqueue it, and return 200 fast. No PII is logged.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getProvider } from '@/lib/commerce/registry';
import { enqueueJob } from '@/lib/commerce/queue';
import type { CommercePlatform } from '@/lib/commerce/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const accountId = req.nextUrl.searchParams.get('account') || '';
  const provider = getProvider(platform);
  if (!provider || !accountId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  const { data: account } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  const cfg = ((account as any)?.config?.integrations || {})[platform];
  if (!cfg) return NextResponse.json({ error: 'integration_missing' }, { status: 404 });

  if (!provider.verifyWebhook(rawBody, headers, cfg)) {
    console.warn(`[webhook] bad signature platform=${platform}`);
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const event = provider.parseWebhook(rawBody, headers);
  console.log(`[webhook] platform=${platform} type=${event.type}`);
  if (event.type !== 'unknown') {
    await enqueueJob({ type: 'webhook-event', accountId, platform: platform as CommercePlatform, event });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run tests/unit/commerce-webhook-route.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/connect/webhooks/[platform]/route.ts" tests/unit/commerce-webhook-route.test.ts
git commit -m "feat(commerce): webhook receiver (verify → enqueue → 200 fast)"
```

---

## Task 14: Nightly enrich-dirty-products cron

**Files:**
- Create: `src/app/api/cron/enrich-dirty-products/route.ts`
- Test: `tests/unit/commerce-enrich-cron.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-enrich-cron.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enrichAllProducts = vi.fn(async () => ({ productsEnriched: 2 }));
vi.mock('@/lib/recommendations/enrich-products', () => ({ enrichAllProducts }));
// The route only touches these helpers (which wrap supabase) + enrichAllProducts,
// so mock the helpers directly — no supabase mock needed.
vi.mock('@/lib/commerce/enrich-dirty', () => ({
  getDirtyAccountIds: vi.fn(async () => ['a', 'b']),
  clearDirtyForAccount: vi.fn(async () => {}),
}));

import { GET } from '@/app/api/cron/enrich-dirty-products/route';

function req() { return new Request('http://x/api/cron/enrich-dirty-products', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }) as any; }
beforeEach(() => { process.env.CRON_SECRET = 'cs'; enrichAllProducts.mockClear(); });

describe('GET enrich-dirty-products cron', () => {
  it('rejects without the cron secret', async () => {
    const bad = new Request('http://x', { headers: {} }) as any;
    const res = await GET(bad);
    expect(res.status).toBe(401);
  });
  it('enriches each dirty account and clears its flag', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(enrichAllProducts).toHaveBeenCalledWith('a');
    expect(enrichAllProducts).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-enrich-cron.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement helper + route**

```ts
// src/lib/commerce/enrich-dirty.ts
import { supabase } from '@/lib/supabase';

/** Distinct account_ids that have at least one product needing enrichment. */
export async function getDirtyAccountIds(): Promise<string[]> {
  const { data } = await supabase
    .from('widget_products').select('account_id').eq('needs_enrichment', true);
  const ids = new Set<string>();
  for (const r of (data || []) as any[]) ids.add(r.account_id);
  return [...ids];
}

export async function clearDirtyForAccount(accountId: string): Promise<void> {
  await supabase.from('widget_products')
    .update({ needs_enrichment: false }).eq('account_id', accountId).eq('needs_enrichment', true);
}
```

```ts
// src/app/api/cron/enrich-dirty-products/route.ts
/**
 * Nightly: re-enrich products marked needs_enrichment by webhook upserts.
 * Re-uses the existing batch enrichAllProducts per dirty account, then clears
 * the flag. Authenticated with CRON_SECRET (Vercel cron).
 */
import { NextRequest, NextResponse } from 'next/server';
import { enrichAllProducts } from '@/lib/recommendations/enrich-products';
import { getDirtyAccountIds, clearDirtyForAccount } from '@/lib/commerce/enrich-dirty';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const accountIds = await getDirtyAccountIds();
  const results: Record<string, any> = {};
  for (const accountId of accountIds) {
    try {
      results[accountId] = await enrichAllProducts(accountId);
      await clearDirtyForAccount(accountId);
    } catch (e: any) {
      results[accountId] = { error: e?.message || 'failed' };
    }
  }
  return NextResponse.json({ ok: true, accounts: accountIds.length, results });
}
```

- [ ] **Step 4: Register the cron in `vercel.json`**

Add to the `crons` array (run 02:30 UTC, after the 02:00 persona update):

```json
{ "path": "/api/cron/enrich-dirty-products", "schedule": "30 2 * * *" }
```

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run tests/unit/commerce-enrich-cron.test.ts && npm run type-check`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/commerce/enrich-dirty.ts src/app/api/cron/enrich-dirty-products/route.ts vercel.json tests/unit/commerce-enrich-cron.test.ts
git commit -m "feat(commerce): nightly enrich-dirty-products cron"
```

---

## Task 15: Data-deletion endpoint

**Files:**
- Create: `src/app/api/connect/data-deletion/route.ts`
- Test: `tests/unit/commerce-data-deletion-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/commerce-data-deletion-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const eqDelete = vi.fn(async () => ({ error: null }));
const del = vi.fn(() => ({ eq: () => ({ eq: eqDelete }) }));
const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
const single = vi.fn(async () => ({ data: { id: 'a', config: { integrations: { woocommerce: { enabled: true } } } } }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ delete: del, update, select: () => ({ eq: () => ({ single }) }) }) },
}));
vi.mock('@/lib/commerce/connect-token', () => ({ verifyConnectToken: vi.fn((t: string) => t === 'good' ? { accountId: 'a', platform: 'woocommerce' } : null) }));

import { POST } from '@/app/api/connect/data-deletion/route';
function req(body: any) { return new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as any; }
beforeEach(() => { del.mockClear(); update.mockClear(); });

describe('POST /api/connect/data-deletion', () => {
  it('rejects without a valid connect token', async () => {
    const res = await POST(req({ account_id: 'a', platform: 'woocommerce', connect_token: 'bad' }));
    expect(res.status).toBe(401);
  });
  it('deletes synced products + clears integration on a valid token', async () => {
    const res = await POST(req({ account_id: 'a', platform: 'woocommerce', connect_token: 'good' }));
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/commerce-data-deletion-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/api/connect/data-deletion/route.ts
/**
 * Data deletion / disconnect. A disconnecting store calls this with its connect
 * token; we delete that platform's synced products and clear stored credentials.
 * Marketplace requirement (also reused for Meta later).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyConnectToken } from '@/lib/commerce/connect-token';
import { mergeIntegration } from '@/lib/commerce/integrations';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const accountId = String(body?.account_id || '');
  const platform = String(body?.platform || '');
  const token = String(body?.connect_token || '');

  const verified = verifyConnectToken(token);
  if (!verified || verified.accountId !== accountId || verified.platform !== platform) {
    return NextResponse.json({ error: 'invalid_connect_token' }, { status: 401 });
  }

  // Delete this platform's synced products.
  await supabase.from('widget_products').delete().eq('account_id', accountId).eq('source_platform', platform);

  // Clear stored credentials (disable + drop creds), preserve the rest of config.
  const { data: account } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  const config = ((account as any)?.config || {}) as Record<string, any>;
  const updatedConfig = mergeIntegration(config, platform, { enabled: false, consumer_key: null, consumer_secret: null, admin_api_token: null, webhook_secret: null });
  await supabase.from('accounts').update({ config: updatedConfig }).eq('id', accountId);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests + type-check + full suite**

Run: `npx vitest run tests/unit/commerce-data-deletion-route.test.ts && npm run type-check && npm run test`
Expected: PASS; commerce tests green. (Pre-existing `rate-limit.test.ts` failures are unrelated and known.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/connect/data-deletion/route.ts tests/unit/commerce-data-deletion-route.test.ts
git commit -m "feat(commerce): data-deletion / disconnect endpoint"
```

---

## Final verification

- [ ] **Step 1: Type-check + lint + tests**

Run: `npm run type-check && npm run lint && npm run test`
Expected: type-check clean; lint clean; all `commerce-*` tests pass (the 3 pre-existing `rate-limit.test.ts` failures are known and unrelated — see project memory).

- [ ] **Step 2: Manual smoke (optional, needs a real account)**

1. `POST /api/admin/accounts/{id}/connect-link` with `{ "platform": "woocommerce" }` (admin session) → returns a `connect_link`.
2. Decode it, then `POST /api/connect/register` with the embedded token + dummy creds → `{ ok: true }`, full-sync enqueued (or direct-called in dev).
3. Confirm the account's `config.integrations.woocommerce` now has the creds (masked via the admin GET).

---

## Deferred from the spec (intentionally not in Phase 0)

- **Admin "Connections" view** (per-account connected-stores list + sync status + disconnect): pure UI; the `connect-link` route + existing `StoreIntegrationForm.tsx` cover the operational path. Build during Phase 1 alongside the plugin.
- **Public privacy-policy page**: a static page; belongs with submission prep (Phase 1D). The machine-readable `/api/connect/data-deletion` endpoint *is* built here (Task 15).

## Notes for Phase 1 (next plan)

- Add `src/lib/woocommerce/order-lookup.ts` + `products.ts` implementing `CommerceProvider`, and register it in `registry.ts` (`woocommerce`). The pipeline, register, webhook receiver, worker, and cron already accept it with zero changes.
- Wire `getRecommendations()` into the main chat path (`/api/chat/stream` → `sandwich-bot-hybrid`) so synced products surface in both chat surfaces (spec: "Main-chat product wiring").
- Build the PHP connector plugin (`/wordpress-plugin/besti-for-woocommerce/`): settings page (connect-link field), `wp_footer` widget injection, `/wc-auth/v1/authorize` handshake → `/api/connect/register`, webhook registration → `/api/connect/webhooks/woocommerce?account={id}`.
