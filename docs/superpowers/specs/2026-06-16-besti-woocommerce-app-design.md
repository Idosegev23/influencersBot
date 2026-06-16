# Design Spec — Besti as an Official WooCommerce App

> Date: 2026-06-16 · Status: approved (design), pending implementation plan
> Source brief: `docs/besti-marketplace-build-plan.md` (Phase 0 + Phase 1)
> Companion docs: `docs/besti-marketplace-apps.md`, `docs/besti-woocommerce-deep-dive.md`

## Outcome

A merchant installs a free **Besti for WooCommerce** plugin from WordPress.org, clicks
**"Connect to Besti,"** and their store is wired to Besti automatically:

- The widget appears on the storefront (no manual code paste).
- The store's products sync into the bot's catalog (`widget_products`) — the bot recommends
  real products with real prices/sale state.
- The order-lookup form in the widget works against real WooCommerce orders.
- The catalog stays live: product edits in the store reflect in the bot within seconds.

All AI processing and billing stay in Besti's cloud. The plugin is a thin connector.

## Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| Scope | Phase 0 (shared commerce core) + Phase 1 (WooCommerce, full) | Shopify (Phase 2) and Wix (Phase 3) are separate, later spec cycles |
| Billing | Besti cloud; plugin is a free GPLv2+ connector | **No** WooCommerce SaaS Billing API; WP.org-compliant "serviceware" |
| Product source | WC REST API sync replaces the scraper for Woo merchants | Single source of truth, live; scraper no longer used for Woo accounts |
| Enrichment timing | Batch on sync; webhooks mark products dirty; nightly cron re-enriches dirty only | AI profile/embedding for a webhook-edited product is refreshed by the next nightly run |
| Async execution | Upstash QStash durable queue for slow work (initial full sync + webhook event processing) | New infra (QStash) added; leverages existing Upstash account |
| Distribution | WordPress.org first + self-hosted `.zip`; Woo Marketplace deferred | Avoids QIT / Billing API; fastest path to live |

## Scope decomposition (why this cycle stops where it does)

The full `besti-marketplace-build-plan.md` spans **four codebases**: the Besti backend (this
repo), a PHP WordPress plugin, a Shopify Remix app, and a Wix app. That is too large for one
spec. This cycle covers the first coherent shippable outcome — "Besti is an official
WooCommerce app" — which is Phase 0 + Phase 1. Phase 2 (Shopify) and Phase 3 (Wix) reuse the
same commerce core and get their own spec → plan → implementation cycles.

## Architecture

Two sides plus a shared, platform-agnostic core.

### Side A — Besti backend (this repo, Next.js)

Shared commerce core under `src/lib/commerce/`:

- **`types.ts`** — the `CommerceProvider` interface and shared DTOs:
  ```ts
  interface CommerceProvider {
    lookupOrder(cfg, orderNumber, email): Promise<OrderLookupResult>;
    fetchAllProducts(cfg): AsyncIterable<RawProduct>;
    verifyWebhook(req): boolean | Promise<boolean>;
    parseWebhook(req): { type, product?, order? };
  }
  ```
  Move the existing `OrderLookupResult` type here and re-export it from
  `src/lib/shopify/order-lookup.ts` so nothing breaks.
- **`registry.ts`** — maps `platform → provider`.
- **`integrations.ts`** — extracted read-merge-write helper for `accounts.config.integrations[platform]`.
  The existing admin route (`src/app/api/admin/accounts/[accountId]/integrations/route.ts`)
  is refactored to call this helper so the admin route and the new register route share one
  implementation (no duplication). Token masking stays.
- **`connect-token.ts`** — HMAC mint/verify of short-lived (15-min), account-scoped connect
  tokens. Cloned from the proven `src/lib/analytics/widget-token.ts` pattern (same
  secret-fallback chain, timing-safe compare).
- **`sync-products.ts`** — provider-agnostic upsert of a provider's products into
  `widget_products`, keyed by `(account_id, external_id)`; soft-deletes rows absent from a full
  sync; marks rows dirty for enrichment.
- **`queue.ts`** — QStash enqueue + inbound-signature-verify helpers.

New API routes under `src/app/api/connect/`:

- **`POST /api/connect/register`** — a plugin/app registers a store's credentials. Body:
  `{ account_id, platform, shop_domain, credentials, connect_token }`. Validates the
  connect_token, rate-limits, merges via `integrations.ts`, then enqueues an initial full-sync
  job to QStash. CORS enabled, `runtime = 'nodejs'`. Never logs credentials.
- **`POST /api/connect/webhooks/[platform]`** — verifies the provider signature, enqueues the
  event to QStash, returns 200 fast. 401 on bad signature.
- **`POST /api/connect/sync-worker`** — the QStash worker. Verifies the QStash signature, then
  either runs a full sync or processes one webhook event (raw upsert + mark dirty; order events
  bust order cache). Idempotent and resumable.
- **`POST /api/connect/data-deletion`** + a public privacy page — marketplace requirement;
  reusable for Meta later.
- Admin "generate connect link" action — mints a connect_token for an account (extends the
  integrations admin surface / `StoreIntegrationForm.tsx`).
- New cron route — nightly enrichment of dirty products.

### WooCommerce provider (`src/lib/woocommerce/`)

- **`order-lookup.ts`** → `lookupWooOrder(cfg, orderNumber, email): Promise<OrderLookupResult>`.
  Reads `cfg` from `config.integrations.woocommerce = { shop_domain, consumer_key,
  consumer_secret, enabled }`. Calls `GET https://{shop_domain}/wp-json/wc/v3/orders?search={orderNumber}`
  over HTTPS Basic auth. Matches `email` against `billing.email` server-side. 7s timeout. Returns
  the same sanitized `OrderLookupResult`; `{ found: false }` on error/not-found (no leakage).
- **`products.ts`** → `fetchAllProducts` (paginated `GET /wc/v3/products?per_page=100&page=N`
  → `RawProduct`), `verifyWebhook` (validate `X-WC-Webhook-Signature`, base64 HMAC-SHA256 of the
  payload with the webhook secret), `parseWebhook` (map `product.created/updated/deleted` +
  `order.updated`).
- Registered in `registry.ts` under `'woocommerce'`.

### Side B — WordPress plugin (`/wordpress-plugin/besti-for-woocommerce/`, PHP)

A thin, GPLv2+ connector. All AI stays in Besti's cloud.

- **Settings page** under the WooCommerce menu: Account ID field + "Connect to Besti" button +
  a disable-widget toggle. `current_user_can('manage_woocommerce')`, nonce on every form,
  sanitize input / escape output.
- **Widget injection** on `wp_footer` (frontend only):
  `<script src="https://bestie.ldrsgroup.com/widget.js" data-account-id="{ID}"></script>`.
- **Connect handshake**: trigger WooCommerce key provisioning via `/wc-auth/v1/authorize`
  (Read scope, return_url back to the plugin). On callback, POST the issued
  consumer_key/secret + shop_domain to `POST /api/connect/register` with the account's
  connect_token. Then register webhooks (`product.*`, `order.updated`) pointing at
  `/api/connect/webhooks/woocommerce`.
- **Compliance**: i18n text-domain + RTL (Hebrew); `readme.txt` (stable tag, "Tested up to",
  GPLv2+); `uninstall.php` cleanup; privacy disclosure that data is sent to the Besti service;
  no remote admin assets; no obfuscation. Must pass the official Plugin Check.

## Data flow

1. **Connect** — merchant clicks Connect → WC issues consumer key/secret via
   `/wc-auth/v1/authorize` → plugin POSTs to `/api/connect/register` (with connect_token) →
   Besti saves creds in `config.integrations.woocommerce` → Besti enqueues an initial full-sync
   job to QStash.
2. **Initial sync (worker)** — QStash worker fetches all products (paginated WC REST) → raw
   upsert into `widget_products` by `(account_id, external_id)` → soft-delete rows missing from
   the full sync → run **batch** enrichment (existing `enrichAllProducts`) at the end.
3. **Live updates** — Woo fires a `product.*` / `order.updated` webhook →
   `/api/connect/webhooks/woocommerce` verifies signature → enqueues to QStash → returns 200 →
   worker upserts raw + **marks dirty** (no inline enrichment). Order events bust the order cache.
4. **Nightly enrichment cron** — re-enriches only dirty products (AI profile + 1536-d product
   embedding via `generateProductEmbedding`), then clears the dirty flag.
5. **Order-lookup (live)** — widget `orderForm` → `/api/widget/order-lookup` → registry resolves
   the account's provider → `lookupWooOrder` → sanitized DTO back to the widget.

## Schema migration

A Supabase migration adds to `widget_products`:

- `external_id` (text) — the platform's product id, half of the upsert key.
- `source_platform` (text) — e.g. `'woocommerce'` / `'shopify'` / `'scraper'`.
- A dirty/enrich marker — `needs_enrichment` (bool, default false) **or** `enriched_at`
  (timestamptz). Implementation plan picks one; the nightly cron selects rows where the marker
  indicates stale enrichment.

RLS stays intact. Existing rows are backfilled with `source_platform = 'scraper'`.

## Error handling

- **Register**: 401 on bad/expired connect_token; rate-limited; never log credentials; mask any
  credential echoed in a response.
- **Webhooks**: 401 on bad signature; log platform + event type only (no PII); upserts are
  idempotent.
- **QStash worker**: verify the inbound QStash signature; rely on QStash retries for transient
  failures; the sync is idempotent and resumable.
- **Order-lookup**: 7s timeout; `{ found: false }` on error/not-found (no data leakage);
  `integration_missing` fallback for any platform not yet configured (keeps the widget graceful).
- **Sync**: re-runnable without duplicates; soft-delete, never hard-delete.

## Testing

- **Unit**: connect-token mint/verify; `integrations.ts` merge helper; Woo order-lookup
  (found / not-found / wrong-email, mocked WC response); Woo webhook signature verify; product
  mapping → `widget_products`; sync idempotency (re-run = no dupes).
- **Regression**: existing Shopify order-lookup behavior unchanged after it is wrapped in the
  `CommerceProvider` interface (add a regression test).
- **Plugin**: installs clean on a fresh WP + Woo; connects; widget appears; products sync;
  order-lookup works; Plugin Check passes with zero errors.
- **Per CLAUDE.md, after each chunk**: `npm run type-check` (separate — the build ignores TS
  errors) + `npm run lint` + `npm run test`. Use the `@/*` alias for all internal imports.

## Cross-cutting (build alongside Phase 0/1)

- Privacy policy page + `/api/connect/data-deletion` at a stable URL (every marketplace requires
  it; reused for Meta later).
- Admin "Connections" view: per-account list of connected stores, sync status, disconnect —
  an extension of `StoreIntegrationForm.tsx`.
- Keep `/api/connect/register` generic so the future Meta DM hook and the Shopify/Wix apps plug
  into the same path.

## Explicitly out of scope this cycle (YAGNI)

- Shopify app shell / theme app extension (Phase 2) — but Shopify order-lookup **is** wrapped in
  the provider interface now.
- Wix app + `public/widget.js` localStorage refactor (Phase 3).
- Woo Marketplace submission + SaaS Billing API.
- The Meta DM hook (the register endpoint stays generic so it can attach later).

## Distribution / submission (human steps, tracked here)

- Ship a self-hosted `.zip` from bestie.ldrsgroup.com immediately after the plugin connects
  end-to-end, while the WP.org review queue clears.
- A `SUBMISSION.md` checklist documents the human WP.org steps (account, SVN, review wait).
