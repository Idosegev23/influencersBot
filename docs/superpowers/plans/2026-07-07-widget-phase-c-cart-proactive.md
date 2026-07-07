# Widget Phase C — Cart-Aware Proactive Complementary Recs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a visitor adds a product to the cart, proactively surface 2–3 AI-picked complementary products in a floating popup near the widget bubble.

**Architecture:** A server endpoint (`/api/widget/complementary`) uses the LLM, grounded in the account's `widget_products`, to pick complements for an added product (cached per product; logged to `widget_recommendations` with `strategy='complementary_cart'`). In `public/widget.js`, a multi-strategy **Cart Watcher** detects add-to-cart on QuickShop (a Next.js SPA with no `/cart.js`) via a MutationObserver on cart-count elements + a delegated click listener on add-to-cart buttons + a localStorage diff; it emits `cart_change` to the Phase-B analytics pipeline and to a **Trigger Engine** that (throttled) fetches complements and shows a **proactive popup**.

**Tech Stack:** Next.js route handler + OpenAI Responses API (`client.responses.create` json_schema, pattern in `src/lib/openai.ts`), Upstash Redis cache (`@/lib/redis`), Vitest; vanilla `public/widget.js` (IIFE, `var`, inline styles).

## Global Constraints

- **AI grounded in catalog:** complements are chosen ONLY from the account's `widget_products` (by id); the endpoint never invents products. Return 2–3.
- **Cache per product:** cache the complement set per `(accountId, productId)` in Redis (`redisGet`/`redisSet`, TTL 7 days) so the LLM runs at most once per product — bounds cost/latency.
- **Attribution:** log the shown complements to `widget_recommendations` with `strategy='complementary_cart'` (reuse the insert shape from `engine.ts:517` `trackRecommendations`). Popup clicks reuse `bestieTag(url,'complementary')` and navigate the CURRENT tab (e-commerce norm, matching `onCardClick`).
- **Cross-origin:** `/api/widget/complementary` MUST answer `OPTIONS` + echo `getCorsHeaders(origin)` on all responses (per-route local helper, mirror `src/app/api/widget/chat/route.ts:15-53`).
- **Throttle (never annoying):** the Trigger Engine fires at most once per 90s, goes on a 10-min cooldown after a dismiss, and never fires while the chat panel is open. Persist cooldown in `localStorage` keyed by account.
- **Cart Watcher is best-effort + tunable:** QuickShop selectors are not known statically — the watcher uses heuristics AND reads optional overrides from `config.cartWatcher` (returned by `/api/widget/config`) so exact selectors can be set per account after device testing without a code change.
- **Analytics:** `cart_change` (and a load-time `cart_state`) flow through the existing `behaviorTrack()` pipeline (Phase B) as well as the trigger engine.
- **Git:** commit each task straight to `main`, stage only that task's files; `public/widget.js` may be touched by a parallel session — stage it explicitly, never `git add -A`. Co-author line: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Verify:** server tasks — Vitest + `npm run type-check`; widget.js — `node --check`; Cart Watcher + popup are browser-dependent → **owner device/DevTools test** (the plan holds the push like the mobile build).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/recommendations/complementary.ts` | `generateComplementaryProducts(accountId, product, catalog)` — LLM pick + cache | Create |
| `tests/unit/widget/complementary.test.ts` | Unit tests for the prompt/parse/clamp + cache key | Create |
| `src/app/api/widget/complementary/route.ts` | POST endpoint: validate → generate → log → return cards | Create |
| `src/app/api/widget/config/route.ts` | Return `cartWatcher` overrides (optional per-account selectors) | Modify (`:100` area) |
| `public/widget.js` | Cart Watcher + Trigger Engine + proactive popup | Modify |

---

## Task 1: `generateComplementaryProducts` (AI, catalog-grounded, cached)

**Files:** Create `src/lib/recommendations/complementary.ts`, `tests/unit/widget/complementary.test.ts`

**Interfaces:**
- Produces: `buildComplementaryPrompt(product, catalog): { instructions: string; input: string }` (pure, testable) and `parseComplementaryIds(outputText: string, catalogIds: string[]): string[]` (pure — parse the LLM json, keep only ids that exist in the catalog, max 3). `generateComplementaryProducts(accountId, product, catalog): Promise<Product[]>` orchestrates cache→LLM→parse.
- Consumes: the OpenAI client pattern from `src/lib/openai.ts` (`getClient().responses.create` with `text.format.json_schema` → `response.output_text`); `redisGet`/`redisSet` from `@/lib/redis`.

- [ ] **Step 1: Write the failing test** `tests/unit/widget/complementary.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildComplementaryPrompt, parseComplementaryIds } from '@/lib/recommendations/complementary';

const CATALOG = [
  { id: 'a', name: 'INTENSIVE Shampoo' },
  { id: 'b', name: 'INTENSIVE Mask' },
  { id: 'c', name: 'Red Fiber Serum' },
];

describe('parseComplementaryIds', () => {
  it('keeps only real catalog ids, max 3', () => {
    const out = JSON.stringify({ ids: ['b', 'c', 'zzz', 'a'] });
    expect(parseComplementaryIds(out, ['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });
  it('drops the added product itself if echoed', () => {
    const out = JSON.stringify({ ids: ['a', 'b'] });
    expect(parseComplementaryIds(out, ['a', 'b'], 'a')).toEqual(['b']);
  });
  it('returns [] on malformed output', () => {
    expect(parseComplementaryIds('not json', ['a'])).toEqual([]);
  });
});

describe('buildComplementaryPrompt', () => {
  it('lists the catalog names+ids and names the added product', () => {
    const { instructions, input } = buildComplementaryPrompt({ id: 'a', name: 'INTENSIVE Shampoo' }, CATALOG);
    expect(input).toContain('INTENSIVE Shampoo');
    expect(input).toContain('[id:b]');
    expect(instructions.toLowerCase()).toContain('complement');
  });
});
```

- [ ] **Step 2: Run RED** — `npx vitest run tests/unit/widget/complementary.test.ts` → fails (module missing).

- [ ] **Step 3: Implement** `src/lib/recommendations/complementary.ts`:

```typescript
import OpenAI from 'openai';
import { redisGet, redisSet } from '@/lib/redis';

function getClient() { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }
const MODEL = 'gpt-5-nano'; // small/fast — pick 2-3 complements, cached per product

export interface CatalogItem { id: string; name: string; nameHe?: string | null; category?: string | null; description?: string | null; }

export function buildComplementaryPrompt(product: CatalogItem, catalog: CatalogItem[]): { instructions: string; input: string } {
  const list = catalog.slice(0, 60).map((p) => `[id:${p.id}] ${p.nameHe || p.name}${p.category ? ' — ' + p.category : ''}`).join('\n');
  return {
    instructions: 'You pick complementary products (cross-sell) that pair well with the product the customer just added to cart. Choose ONLY from the numbered catalog by id. Prefer different categories that complete a routine/set. Return 2-3 ids, never the added product itself.',
    input: `Added product: [id:${product.id}] ${product.nameHe || product.name}\n\nCatalog:\n${list}`,
  };
}

export function parseComplementaryIds(outputText: string, catalogIds: string[], addedId?: string): string[] {
  let ids: unknown;
  try { ids = JSON.parse(outputText).ids; } catch { return []; }
  if (!Array.isArray(ids)) return [];
  const valid = new Set(catalogIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && valid.has(id) && id !== addedId && !seen.has(id)) { seen.add(id); out.push(id); }
    if (out.length >= 3) break;
  }
  return out;
}

export async function generateComplementaryProducts(accountId: string, product: CatalogItem, catalog: CatalogItem[]): Promise<CatalogItem[]> {
  const cacheKey = `wc:comp:${accountId}:${product.id}`;
  const cached = await redisGet<string[]>(cacheKey);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  if (Array.isArray(cached)) return cached.map((id) => byId.get(id)).filter((p): p is CatalogItem => !!p);

  const { instructions, input } = buildComplementaryPrompt(product, catalog);
  let ids: string[] = [];
  try {
    const res = await getClient().responses.create({
      model: MODEL, instructions, input,
      text: { format: { type: 'json_schema', name: 'complements', strict: true,
        schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'], additionalProperties: false } } },
    });
    ids = parseComplementaryIds((res as any).output_text || '', catalog.map((p) => p.id), product.id);
  } catch (e) {
    console.error('[complementary] LLM error:', (e as any)?.message);
  }
  if (ids.length > 0) await redisSet(cacheKey, ids, 7 * 24 * 60 * 60);
  return ids.map((id) => byId.get(id)).filter((p): p is CatalogItem => !!p);
}
```

- [ ] **Step 4: Run GREEN** — `npx vitest run tests/unit/widget/complementary.test.ts` (3+3 pass) + `npm run type-check` (clean for the new file).

- [ ] **Step 5: Commit**
```bash
git add src/lib/recommendations/complementary.ts tests/unit/widget/complementary.test.ts
git commit -m "feat(recs): AI catalog-grounded complementary picks (cached per product)"
```

---

## Task 2: `/api/widget/complementary` endpoint

**Files:** Create `src/app/api/widget/complementary/route.ts`

**Interfaces:**
- Consumes: `generateComplementaryProducts` (Task 1); loads `widget_products` for the account; `toCardDTO`-shaped output for the widget.
- Produces: `POST` returns `{ products: CardDTO[] }` (2–3 complement cards) + logs to `widget_recommendations` (`strategy='complementary_cart'`). `OPTIONS` for CORS.

- [ ] **Step 1: Write the route** `src/app/api/widget/complementary/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateComplementaryProducts } from '@/lib/recommendations/complementary';

export const runtime = 'nodejs';

function getCorsHeaders(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
}
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: getCorsHeaders(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const cors = getCorsHeaders(req.headers.get('origin') || '*');
  try {
    const { accountId, productId, productName, sessionId } = await req.json();
    if (!accountId || (!productId && !productName)) {
      return NextResponse.json({ products: [] }, { headers: cors });
    }
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('widget_products')
      .select('id, name, name_he, category, description, price, original_price, is_on_sale, image_url, product_url')
      .eq('account_id', accountId).eq('is_available', true);
    const catalog = (rows || []) as any[];
    // Resolve the added product from the catalog (by id, else fuzzy by name).
    const added = catalog.find((p) => p.id === productId)
      || catalog.find((p) => productName && (p.name === productName || p.name_he === productName))
      || { id: productId || 'added', name: productName || 'product' };
    const picks = await generateComplementaryProducts(accountId, { id: added.id, name: added.name, nameHe: added.name_he, category: added.category, description: added.description }, catalog.map((p) => ({ id: p.id, name: p.name, nameHe: p.name_he, category: p.category })));
    const pickRows = picks.map((pk) => catalog.find((p) => p.id === pk.id)).filter(Boolean) as any[];

    // Log to widget_recommendations (strategy complementary_cart) for attribution.
    if (pickRows.length && sessionId) {
      await supabase.from('widget_recommendations').insert(pickRows.map((p, i) => ({
        account_id: accountId, session_id: sessionId, product_id: p.id, product_name: p.name,
        strategy: 'complementary_cart', conversation_context: `added:${added.id}`, position: i + 1,
      }))).then(() => {}, () => {});
    }
    const products = pickRows.map((p) => ({
      id: p.id, name: p.name_he || p.name, image: p.image_url,
      price: p.price, originalPrice: p.original_price, isOnSale: p.is_on_sale,
      productUrl: p.product_url,
    }));
    return NextResponse.json({ products }, { headers: cors });
  } catch {
    return NextResponse.json({ products: [] }, { headers: cors });
  }
}
```

- [ ] **Step 2: Verify** — `npm run type-check` (clean for the route). Manual (controller, post-deploy): `curl -X POST .../api/widget/complementary -d '{"accountId":"432dea15-...","productName":"Intensive Shampoo","sessionId":null}'` returns 2–3 products.

- [ ] **Step 3: Commit**
```bash
git add src/app/api/widget/complementary/route.ts
git commit -m "feat(widget): /api/widget/complementary endpoint (AI complements + attribution)"
```

---

## Task 3: Config returns optional Cart Watcher overrides

**Files:** Modify `src/app/api/widget/config/route.ts` (`:100` area, beside `coverImage`)

**Interfaces:** Produces `cartWatcher` in the config response: `{ cartCountSelector?, addToCartSelector?, cartStorageKey? }` from `config.widget.cartWatcher` (all optional; absent → the widget uses heuristics only).

- [ ] **Step 1: Add the field** to the `NextResponse.json({...})` object (next to `coverImage`/`socialLinks`):
```typescript
        cartWatcher: (widgetConfig.cartWatcher && typeof widgetConfig.cartWatcher === 'object') ? widgetConfig.cartWatcher : null,
```

- [ ] **Step 2: Verify + commit**
```bash
npm run type-check
git add src/app/api/widget/config/route.ts
git commit -m "feat(widget-config): expose optional cartWatcher selector overrides"
```

---

## Task 4: Cart Watcher (multi-strategy) in widget.js

**Files:** Modify `public/widget.js`

**Interfaces:** Produces `initCartWatcher(onAdd)` — calls `onAdd(addedProduct)` when an add-to-cart is detected; reads `config.cartWatcher` overrides; also emits `cart_change`/`cart_state` via the existing `behaviorTrack()`.

- [ ] **Step 1: Add the watcher** near the page-context helpers. Registered once after config loads:
```javascript
  // Multi-strategy add-to-cart detection for SPA stores (QuickShop = Next.js, no /cart.js).
  // Heuristics + optional per-account overrides from config.cartWatcher. Best-effort.
  function initCartWatcher(onAdd) {
    var cw = (config.cartWatcher || {});
    var fire = function () {
      try {
        var pc = (typeof extractPageContext === 'function') ? extractPageContext() : { product: null, cart: null };
        var added = pc.product || null;
        behaviorTrack('cart_change', { added_product: added ? { name: added.name, price: added.price, sku: added.sku } : null, value: pc.cart ? pc.cart.total : null });
        if (onAdd) onAdd(added);
      } catch (e) { /* never break host page */ }
    };
    // (a) Delegated click on add-to-cart controls.
    try {
      document.addEventListener('click', function (e) {
        var el = e.target;
        for (var i = 0; el && i < 5; i++, el = el.parentElement) {
          var sel = cw.addToCartSelector;
          var match = sel ? (el.matches && el.matches(sel)) :
            ((el.getAttribute && (/(add[-_ ]?to[-_ ]?cart|הוסף|לסל|לעגלה)/i).test((el.getAttribute('class') || '') + ' ' + (el.textContent || '').slice(0, 40))));
          if (match) { setTimeout(fire, 600); break; }  // let the SPA update the cart first
        }
      }, true);
    } catch (e) { /* */ }
    // (b) MutationObserver on the cart-count element.
    try {
      var countEl = cw.cartCountSelector ? document.querySelector(cw.cartCountSelector) : null;
      if (countEl && window.MutationObserver) {
        var last = (countEl.textContent || '').trim();
        new MutationObserver(function () {
          var now = (countEl.textContent || '').trim();
          if (now !== last && (parseInt(now, 10) || 0) > (parseInt(last, 10) || 0)) fire();
          last = now;
        }).observe(countEl, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) { /* */ }
    // (c) localStorage cart diff (poll every 2s; low cost).
    try {
      var key = cw.cartStorageKey || null;
      var readCount = function () {
        try {
          var raw = key ? localStorage.getItem(key) : null;
          if (!key) { for (var k = 0; k < localStorage.length; k++) { var kk = localStorage.key(k); if (kk && /cart/i.test(kk)) { raw = localStorage.getItem(kk); break; } } }
          if (!raw) return 0;
          var v = JSON.parse(raw);
          var items = v.items || v.lines || v.products || (Array.isArray(v) ? v : []);
          return Array.isArray(items) ? items.length : 0;
        } catch (e) { return 0; }
      };
      var lastCount = readCount();
      setInterval(function () { var c = readCount(); if (c > lastCount) fire(); lastCount = c; }, 2000);
    } catch (e) { /* */ }
  }
```

- [ ] **Step 2: Verify + commit** — `node --check public/widget.js`; `grep -c "initCartWatcher" public/widget.js` → present.
```bash
git add public/widget.js
git commit -m "feat(widget): multi-strategy cart watcher (click/observer/localStorage)"
```

---

## Task 5: Trigger Engine + proactive popup

**Files:** Modify `public/widget.js`

**Interfaces:** Consumes `initCartWatcher` (Task 4), `/api/widget/complementary` (Task 2), `bestieTag`, `avatarHtml`. Produces the popup DOM + `window.__ibotComplementClick`.

- [ ] **Step 1: Wire the trigger + popup.** After config loads (where the widget boots), register:
```javascript
  var COMP_COOLDOWN_KEY = 'ibot_comp_cd_' + ACCOUNT_ID;
  var lastCompShown = 0;
  function complementCooldownActive() {
    try { var v = parseInt(localStorage.getItem(COMP_COOLDOWN_KEY) || '0', 10); return v && Date.now() < v; } catch (e) { return false; }
  }
  function onCartAdd(added) {
    if (isOpen) return;                                   // never over the open chat
    if (Date.now() - lastCompShown < 90000) return;       // max 1 / 90s
    if (complementCooldownActive()) return;               // dismissed recently
    lastCompShown = Date.now();
    fetch(BASE_URL + '/api/widget/complementary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: ACCOUNT_ID, productId: added && added.sku ? added.sku : null, productName: added ? added.name : null, sessionId: sessionId }),
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.products && d.products.length) showComplementPopup(d.products); })
      .catch(function () { /* */ });
  }
  function dismissComplements() {
    try { localStorage.setItem(COMP_COOLDOWN_KEY, String(Date.now() + 10 * 60 * 1000)); } catch (e) { /* */ }
    var el = document.getElementById('ibot-comp'); if (el) el.parentNode.removeChild(el);
  }
  window.__ibotComplementDismiss = dismissComplements;
  window.__ibotComplementClick = function (url) {
    widgetTrack('widget_product_click', { surface: 'complement_popup', href: url || null });
    if (url) window.location.href = bestieTag(url, 'complementary');   // same-tab, e-commerce norm
  };
  function showComplementPopup(products) {
    if (document.getElementById('ibot-comp')) return;
    var pc = config.primaryColor;
    var cards = products.slice(0, 3).map(function (p) {
      var price = p.price != null ? locale.currencyPrefix + p.price : '';
      var img = p.image ? '<img src="' + escapeHtml(p.image) + '" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0;" onerror="this.style.display=\'none\'"/>' : '';
      return '<button onclick="window.__ibotComplementClick(\'' + escapeHtml(p.productUrl || '') + '\')" style="display:flex;align-items:center;gap:8px;width:100%;text-align:' + (locale.dir === 'rtl' ? 'right' : 'left') + ';background:var(--ibot-surface);border:1px solid var(--ibot-border);border-radius:10px;padding:7px 9px;cursor:pointer;font-family:inherit;margin-bottom:6px;">' +
        img + '<span style="flex:1;min-width:0;"><span style="display:block;font-size:12.5px;font-weight:600;color:var(--ibot-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.name || '') + '</span><span style="font-size:12px;color:' + pc + ';font-weight:700;">' + price + '</span></span></button>';
    }).join('');
    var el = document.createElement('div');
    el.id = 'ibot-comp';
    el.style.cssText = 'position:fixed;z-index:2147483646;bottom:calc(96px + env(safe-area-inset-bottom));' + (config.position === 'bottom-left' ? 'left:20px;' : 'right:20px;') + 'width:260px;max-width:calc(100vw - 40px);background:var(--ibot-panel-bg);border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,0.18);padding:12px;animation:ibot-slide-up 0.3s ease-out;direction:' + locale.dir + ';';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<span style="font-size:13px;font-weight:700;color:var(--ibot-text-primary);">' + escapeHtml(wlbl('משלים מצוין 👇', 'Goes great with it 👇')) + '</span>' +
      '<button onclick="window.__ibotComplementDismiss()" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;font-size:18px;line-height:1;">&times;</button></div>' + cards;
    document.body.appendChild(el);
    widgetTrack('widget_action_proposed', { type: 'complementary', count: products.length });
  }
```

- [ ] **Step 2: Boot the watcher.** In the config-load `.then(...)` where the widget initializes (after `render()`), add:
```javascript
      try { initCartWatcher(onCartAdd); } catch (e) { /* */ }
```

- [ ] **Step 3: Verify + commit** — `node --check public/widget.js`; `grep -c "showComplementPopup\|__ibotComplementClick" public/widget.js` → present.
```bash
git add public/widget.js
git commit -m "feat(widget): proactive complementary popup on add-to-cart (throttled, same-tab clicks)"
```

---

## Self-Review

**Spec coverage (§8):** Cart Watcher (multi-strategy) → Task 4; Trigger Engine (throttle/cooldown/not-while-open) → Task 5; `/api/widget/complementary` (AI catalog-grounded, cache, `strategy='complementary_cart'`) → Tasks 1+2; proactive popup (near bubble, click→same-tab attributed, dismiss→cooldown) → Task 5; `cart_change`/`cart_state` to the analytics pipeline → Task 4. Optional per-account selector overrides → Task 3.

**Placeholder scan:** none. The Cart Watcher heuristics are intentionally best-effort (spec-approved "multi-strategy adaptive"); the `config.cartWatcher` overrides (Task 3) are the concrete tuning path after device testing.

**Type consistency:** `generateComplementaryProducts`/`parseComplementaryIds`/`buildComplementaryPrompt` (Task 1) consumed by Task 2. `initCartWatcher(onAdd)` (Task 4) consumed by Task 5. Popup product shape `{id,name,image,price,originalPrice,isOnSale,productUrl}` (Task 2 output) matches the popup renderer (Task 5). `cartWatcher` config field (Task 3) read in Task 4.

**Device-dependent (hold push):** the Cart Watcher's add-to-cart detection + the popup are browser-dependent on a live QuickShop store. Server Tasks 1–3 are verifiable now (Vitest + curl); widget Tasks 4–5 need the owner's on-device / DevTools test (confirm add-to-cart fires the popup on argania; tune `config.cartWatcher` selectors if the heuristics miss). Push held until then.

**Out of scope:** exact QuickShop selector values (owner supplies via `config.cartWatcher` after DevTools inspection if heuristics are insufficient); non-QuickShop platform adapters (Shopify `/cart.js`, Woo) — future.
```
