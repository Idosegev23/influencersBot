# Widget Purchase Attribution + Admin Account Page Redesign — Design

**Date:** 2026-06-11
**Status:** Approved by Ido (pending spec review)
**First target account:** Argania (`argania_group`, c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1, QuickShop on argania-oil.co.il)

## Problem

1. **Attribution gap:** Bestie (the website widget) recommends products in chat, but purchases happen later, outside the widget — the user browses the site and buys on their own. Today we track up to the card click (`widget_recommendations.was_clicked`) and append `utm_source=bestie` to card links, but we have no visibility into actual purchases, so we cannot answer "what revenue did Bestie contribute?"
2. **Admin page mismatch:** The "ניהול" button (admin dashboard + accounts list) opens `/admin/influencers/[id]`, which is built entirely around Instagram influencer accounts (IG connection, transcriptions, partnerships). For brand/widget accounts like Argania, most sections are irrelevant and the data that matters (widget, recommendations CTR, conversations, revenue) is missing. This is **admin-internal only** — no client-facing dashboard.

## Feasibility findings (verified on live Argania site, 2026-06-11)

- Argania runs on **QuickShop** (NOT Shopify): Next.js app, assets from `media.my-quickshop.com`.
- Bestie's `widget.js` (from `bestie.ldrsgroup.com`) is embedded in the site layout and loads on **every page, including `/cart` and `/checkout`** (verified via curl).
- After successful payment, QuickShop client-side routes to **`/checkout/thank-you/{orderNumber}?t={accessToken}`** — same domain, same app → widget.js loads there too.
- Just before payment, QuickShop's checkout writes the **full order to localStorage**: `{items[], subtotal, discount, shipping, total, couponCodes[], orderDate, orderReference, customer}` (verified in their checkout JS chunks). The exact localStorage key must be identified at runtime (it is a build-time constant); detection will scan localStorage for an entry matching this shape.
- QuickShop sends `utmSource`/`utmData` with each order to its own backend — so our existing `utm_source=bestie` on card clicks already lands in Argania's QuickShop order records (independent corroborating evidence on the client side).
- **Conclusion: fully feasible with changes on our side only (widget.js + our backend). Zero changes to the client's site.**

Known limitation (accepted): purchases completed on a different device/browser than the chat won't be attributed. Standard limitation for all chat-commerce attribution tools.

## Architecture

### 1. Conversion detection (widget.js)

- On every page load, check if `location.pathname` matches `/checkout/thank-you/` (QuickShop pattern; pattern list kept extensible per platform).
- If matched:
  - Extract `orderNumber` from the URL path.
  - Scan localStorage for QuickShop's pending-order payload (object with `items`, `total`, `orderReference`/`orderDate` shape). If found, use it; if not, fall back to URL `orderNumber` only.
  - Send a `conversion` event to our backend with: `anon_id`, `session_id` (if exists), `order_number`, `total`, `subtotal`, `discount`, `coupon_codes`, `line_items` (productId, name, qty, price, variant), `customer` (name/email/phone as present), `raw` payload, `page_url`.
- **Dedup:** localStorage flag `ibot_conv_${orderNumber}` — fire once per order even if the thank-you page is refreshed. Server also upserts on `(account_id, order_number)`.
- If the visitor never interacted with the widget (no `anon_id` until now), still send the conversion with the freshly-minted anon_id — it becomes baseline/non-attributed data (useful as denominator: total orders seen vs. Bestie-attributed orders).

### 2. Ingest endpoint

- New route: `POST /api/widget/conversion` — CORS-enabled like other widget routes, validated with the same HMAC-signed widget analytics token (as `/api/analytics/widget`), rate-limited.
- Upserts into `widget_conversions` on `(account_id, order_number)`.

### 3. Storage — `widget_conversions` table

```sql
create table widget_conversions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  anon_id text not null,
  session_id text,                -- widget chat session if known
  order_number text not null,
  total numeric, subtotal numeric, discount numeric,
  currency text default 'ILS',
  coupon_codes text[],
  line_items jsonb,               -- [{productId, name, quantity, price, variantTitle}]
  customer jsonb,                 -- full buyer details (admin-internal; PII stays in our DB only)
  raw jsonb,                      -- original payload for safety
  attribution text,               -- 'direct' | 'assisted' | 'influenced' | 'none' (computed)
  attributed_products jsonb,      -- which line items matched which recommendations
  page_url text,
  occurred_at timestamptz default now(),
  unique (account_id, order_number)
);
```

### 4. Attribution computation

Computed at ingest time (and recomputable via script). Window: **7 days** (constant, configurable per account later via `accounts.config`). Join key: `anon_id`.

- **Direct** — a purchased line item matches a `widget_recommendations` row for this `anon_id`'s sessions with `was_clicked = true` within the window.
- **Assisted** — a purchased line item matches a recommendation (not clicked) for this `anon_id` within the window.
- **Influenced** — no product match, but this `anon_id` had a chat session within the window.
- **None** — no chat activity in window (baseline order).

Product matching: `widget_recommendations.product_id` ↔ line item productId; fallback fuzzy match on product name/URL slug when IDs don't align (QuickShop productId vs our `widget_products.id` mapping — resolved via `widget_products.product_url`/`slug`).

Order-level attribution = strongest tier among its line items. `attributed_products` records the per-item evidence.

### 5. Admin — account page redesign (`/admin/influencers/[id]`)

The page becomes **archetype-aware** (driven by `accounts.type` + `config.archetype`).

**Common header (all account types):** name, status, quick actions (open chat, edit persona, scan, analytics) + 7-day KPI row: conversations, messages, leads.

**Brand/widget accounts (e.g., Argania) see:**
1. **💰 הכנסות בסטי** — total ₪ by period (7/30/90 days), breakdown by attribution tier, orders list (products, buyer, amount, tier, link to the chat session that drove it). New API: `GET /api/admin/conversions?accountId=` with summary + list.
2. **🛍️ המלצות מוצרים** — recommendations count, CTR, top products, strategy breakdown (wire the existing `/api/admin/recommendations` API — currently rendered nowhere).
3. **🌐 ווידג'ט** — domain, active modules, product count, last scrape, theme preview.
4. **💬 שיחות אחרונות** — recent sessions with summaries.
5. **📚 ידע** — RAG status (chunk count, last enrichment), documents (existing section retained).

**Influencer accounts see:** current sections (IG connection, transcriptions, partnerships, etc.) + the new recent-conversations section. No commercial sections.

**Removed for everyone:** read-only "Integrations" card and "AI Insight" card (no actionable content). Instagram stats hidden for accounts without Instagram.

### Privacy note

Buyer PII (`customer` jsonb) is stored deliberately — per Ido's decision this is admin-internal tracking ("אדמין שרוצה לעקוב על הכל") and may later feed leads/CRM. It is never exposed via widget/client-facing APIs; admin routes only (service-role + admin auth).

## Phasing

- **Phase A — conversion pipeline:** widget.js detection + `/api/widget/conversion` + `widget_conversions` migration + attribution logic. Deploy, verify live on Argania with a test order.
- **Phase B — admin redesign:** new account page sections (revenue, recommendations, widget, conversations), archetype-aware layout, dead-card cleanup.

## Testing

- Unit: attribution tier logic (product match, window edges, dedup upsert), payload validation.
- Manual/E2E: simulated thank-you page with QuickShop-shaped localStorage → event fires once; refresh → no duplicate. Live test order on Argania end-to-end.
- Admin page: brand account shows commercial sections, influencer account unchanged.

## Out of scope (explicitly)

- Client-facing dashboard (admin-only for now).
- "Add everything we discussed to cart" feature (discussed as a future conversion booster; separate project).
- Shopify webhook/cart-attributes channel and coupon-based fallback (designed conceptually; implement when a non-QuickShop client needs it).
- Studio Pasha rollout — same QuickShop mechanics, enable after Argania is verified.
