# TerminalX Demo Account — Design

**Date:** 2026-07-31
**Status:** Approved
**Account type:** demo (`isDemo: true`), archetype `brand`, language `he`

## Goal

Stand up a demo account for TerminalX (Israeli fashion & lifestyle retailer) with:
- Website + 3 Instagram handles as content sources
- A product catalog **split into categories** (the site is fashion, not cosmetics)
- A shareable widget demo running on terminalx.com itself

Sources:
- https://www.terminalx.com/
- https://www.instagram.com/terminalx/
- https://www.instagram.com/terminalx_beauty/
- https://www.instagram.com/terminalxkids/

## Site reconnaissance

TerminalX is **headless Magento** with a React SPA front end.

`POST /api/pipeline/discover` returned 42 AI-labelled path categories over ~18K sitemap URLs.
The largest: `/collections` (8,799), `/test-daniel` (2,207 — internal test pages, exclude),
`/kids` (1,738), `/on-sale` (1,695), `/dreamcard-terminalx` (1,132), `/brands` (1,056).

**The blocker:** the sitemap contains only **category/listing** pages
(`/women/tops/tank-tops`). Product detail pages are absent from it. They exist only as links
inside the listing pages' server-rendered HTML, shaped
`/{cat}/{sub}/{leaf}/{sku}?color=NN` — e.g. `/women/tops/tank-tops/r340280005?color=10`.

**The gift:** every product page carries a complete `schema.org/Product` ld+json —
Hebrew `name`, `description`, `sku`, `color`, `material`, `brand.name`, `image[]`,
`offers[].price` + `priceCurrency` + `availability` — plus a `BreadcrumbList` giving the
exact category hierarchy (נשים → חולצות → גופיות).

Verified: terminalx.com sends **no `X-Frame-Options` and no CSP** (header or meta), so it can
be iframed and proxied.

## Code changes

All four are small and generic — they benefit any SPA/e-commerce account, not just TerminalX.

### A. Fix `structured_data` always being `[]`

`src/lib/pipeline/crawl.ts` strips `<script>` tags at line ~121, then tries to read
`script[type="application/ld+json"]` at line ~192. Cheerio's `.remove()` has already
detached those nodes, so **every page crawled by the pipeline stores `structured_data: []`**.
(The standalone `scripts/deep-scrape-*.mjs` collect it before the strip, which is why they
populate it correctly.)

Fix: collect ld+json before the strip.

### B. `seedUrls` — explicit URL seeding into the crawl

The pipeline can only seed the crawl frontier from a sitemap. Add
`seedUrls?: string[]` to `PipelineOptions` (`src/lib/pipeline/types.ts`) and
`StartPipelineInput` (`src/lib/pipeline/start.ts`), consumed in
`src/lib/pipeline/steps/site-discover.ts`: seeds are unioned with the (capped) sitemap
selection before `pushFrontier`, and counted in the crawl total.

This is the generic escape hatch for SPA sites whose product pages aren't in the sitemap.

### C. Catalog vertical registry — one taxonomy + prompt per market

`src/lib/recommendations/extract-products.ts` hardcoded a **cosmetics** category enum
(`hair_care, body_care, face_care, men, lip_care, nails, …`). Every non-cosmetics account —
fashion, food, SaaS, home goods — collapsed into `other`.

Patching "fashion" into that one prompt would only move the problem to the next market. So
instead: **`src/lib/catalog/verticals.ts`**, a pure-data registry with one entry per market:

| id | id | id |
|---|---|---|
| `fashion` | `beauty` | `food` |
| `home` | `sports` | `jewelry` |
| `electronics` | `health` | `baby_kids` |
| `pets` | `saas` | `services` |
| `general` (fallback) | | |

Each entry declares:
- `label` — bilingual display name
- `categories` — the main category enum, each with a bilingual label
- `subcategories` — the vocabulary the model may draw on
- `extractionRules` — market-specific prompt guidance
- `attributes` — which of volume / ingredients / material / sizes are meaningful here

One registry entry now drives **three** consumers, so adding a market never means editing a
prompt, a component, or a form:
1. `buildExtractionPrompt(verticalId)` — assembles the Gemini system instruction. Shared
   rules (price splitting, catalog-page guard, stock wording, JSON envelope) live once;
   the enum, vocabulary and rules come from the registry.
2. `ProductsCatalogTab` filter chips — category labels resolve through
   `categoryLabel()`, which searches the account's vertical first and then every other, so
   rows extracted under a previous vertical still read correctly after a re-scan.
3. The `/admin/add` form — see F.

The extractor also now feeds `page.structured_data` (populated by change A) into
`pageContext`, so the model classifies from real `Product` + `BreadcrumbList` data rather
than guessing from free text, and prefers the schema.org product image over `image_urls[0]`
(on og:image-less SPA pages that first image is often a nav logo).

Product-page detection gains a third signal ahead of the existing two: the presence of a
`schema.org/Product` node. This is the only signal that survives SPA storefronts whose
prices render client-side and therefore never reach `extracted_data.price`.

### D. `productVertical` threaded through the pipeline

`PipelineOptions.productVertical` → `StartPipelineInput` → `product-extract` (passed
explicitly, because that step runs before finalize) → `finalize` persists it to
`accounts.config.product_vertical`. An explicit choice always wins, including on re-scan;
otherwise a stored value is preserved, and a blank first scan derives one from the
archetype via `verticalForArchetype()`.

`extractAllProducts(accountId, { vertical })` falls back to `config.product_vertical` when
run standalone, so a manual re-extract needs no argument.

### E. Public widget demo via the real proxy

`src/app/api/widget/preview/[accountId]/route.ts` already fetches the customer's site
server-side, strips frame-blocking headers and `<meta>` CSP, injects `<base href>`, and
injects the real `public/widget.js`. It is wired only into the admin-only
`/admin/websites/[id]/preview`.

`src/app/demo/[id]/page.tsx` is the public shareable page but takes a weaker path: a raw
iframe of the site (falling back to a gradient mockup when framing is blocked) plus a ~290
line **React reimplementation** of the widget — no product cards, chips, modules, dark mode
or ratings, and the exact "reimplementation drift" the proxy's own docblock warns about.

Change: point `/demo/[id]` at `/api/widget/preview/[accountId]` and delete the duplicated
React widget. Requires `config.widget.domain` to be set (the proxy only serves registered
domains — it does not accept a user-supplied URL).

### Script: `scripts/harvest-product-urls.mjs`

Fetches N category listing pages, regex-extracts product detail links from the HTML,
takes `--per-category` from each, prints/writes a JSON array of absolute URLs for use as
`seedUrls`. Generic: the product-link pattern is derived from "listing path + one extra
segment containing digits", not hardcoded to TerminalX.

## Scan plan

Product URL harvest — 8 listing roots, 25 products each ≈ 200 seeds:

| Category | Listing path |
|---|---|
| נשים | `/women` |
| גברים | `/men` |
| ילדים | `/kids` |
| יופי | `/beauty` |
| בית ואורח חיים | `/home-lifestyle` |
| ספורט | `/sports` |
| תכשיטים | `/jewelry` |
| מבצעים | `/on-sale` |

Info/brand pages come from quote-mode `categories` with small caps: `/brands` (15),
`/dreamcard-terminalx` (10), `/weareterminalx` (5), `/` (10). `/test-daniel` excluded.

### Run order — three IG handles onto one `accountId`

`create-account` overwrites `config.username`, and the IG scan overwrites profile metadata
(bio, followers, profile pic). The **last** run wins, so the main handle runs last:

1. `@terminalxkids` — 30 posts, no website (`enrichSources: ['instagram']`)
2. `@terminalx_beauty` — 30 posts, no website (`enrichSources: ['instagram']`)
3. `@terminalx` — 30 posts **+ website + seedUrls + info categories** — the only run that
   crawls the site and produces products, persona, tabs and finalize.

Posts accumulate across runs (upsert by shortcode), so all three handles' content feeds one
shared RAG index.

Scan mode is `quote` (bounded demo): transcriptions capped at 5, category caps enforced.

## Verification

- `widget_products` has ~200 rows spread across ≥6 distinct `category` values, each with a
  non-null `price`, `image_url` and a product-detail `product_url`.
- `/chat/terminalx` renders category filter chips with Hebrew labels; a query like
  "מחפשת שמלה לאירוע" returns product cards with price, image and a working link.
- `chatbot_persona` exists and reads as a fashion retailer, not a cosmetics brand.
- `config.widget.domain = 'www.terminalx.com'`; `/demo/<accountId>` loads the real
  terminalx.com with the real widget bubble.

## Known risks

- `extractAllProducts` **deletes all** `widget_products` rows for the account before
  inserting, and any re-scan reverts `accounts.config` (a recurring race in this project).
  Config polish must be re-applied by SQL after the final run.
- Product images are hosted on `media.terminalx.com`; the widget CSP allows `https:` image
  sources, so no proxying is needed.
- `/test-daniel` (2,207 URLs) is internal test content — must stay excluded from every run.
