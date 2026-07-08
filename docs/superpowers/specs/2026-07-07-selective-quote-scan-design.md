# Selective "Quote" Scan + Website-Only Accounts (Design Spec)

**Date:** 2026-07-07
**Status:** Approved design → pending implementation plan
**Author:** Ido + Claude
**Builds on:** [2026-07-06 Admin Account Pipeline (QStash)](2026-07-06-admin-account-pipeline-qstash-design.md)

## Problem

Preparing a demo for a prospective client **before quoting** currently means a full scan every time — expensive (scans are the main cost driver) and slow (Carolina crawled 1,516 pages, ~90 min, most irrelevant to a demo). There's no lightweight pre-sales path, and adding an account requires an Instagram username even when the client is website-only.

## Goal

Two explicit scan **modes**, chosen up front:

1. **Quote scan (pre-sales demo)** — point at a website, see an AI-labelled map of what's there, pick a small relevant slice (sections + per-section caps), and run a **bounded** scan. Fast + cheap, Instagram optional, but produces the full demo experience: **chat + product recommendations + branding** on the slice. Marks the account `config.scan_mode='quote'`.

2. **Regular (full) scan** — either pick an existing quote account from a list and **enrich** it to full (lift caps, all categories, add IG, rebuild), or start a new full scan from scratch. Enrichment reuses the same account (no re-creation) and the pipeline's idempotency.

**Success:** an admin can, from `/admin/add`, produce a working branded demo of a website in a few minutes scanning only a chosen slice; and later upgrade that same account to full via a regular scan.

## Non-goals

- Not auto-detecting which quote account to enrich — the admin picks manually.
- Not changing the 9-step pipeline's core; this adds a discover pre-step, category filtering, IG-optional conditionals, and a website-only persona path.
- Not a general crawl-scheduler — fixed modes for account setup only.

## Architecture (Approach A — discover as a fast pre-step)

Three phases:

### Phase 1 — Discover (`POST /api/pipeline/discover`)
- Body `{ websiteUrl }`. Auth: admin cookie OR `CRON_SECRET`.
- Fetch sitemap via `discoverSitemapUrls(websiteUrl)` (reuse). If empty → shallow BFS from homepage as fallback, or return `{ noSitemap: true }` so the UI offers a default small crawl.
- **Group URLs by path** — first meaningful path segment / pattern (`/magazine/*`, `/optic/*`, root SKU slugs like `/cl3606-01` → an "items/products" group). Pure string work, no page fetches.
- **AI-label each group** — send each group's `{ pathPattern, count, sampleSlugs[5] }` to the chat model (GPT-5.4) → `{ label(he), type: 'products'|'articles'|'info'|'legal'|'other' }`. One LLM call for all groups (cheap; a handful of groups regardless of URL count).
- Return `{ domain, noSitemap?, categories: [{ id, pathPattern, label, type, count, sampleUrls }] }`.
- **Cache** in Redis `discover:{domain}` (TTL 1h). A "re-discover" action bypasses cache.
- No `scan_jobs` row is created. Target ~5–15s.

### Phase 2 — Select + Start (UI on `/admin/add`)
- **Mode selector** at top: "להצעת מחיר" (quote) / "רגילה" (regular).
- **Quote mode:** IG username **optional**, website URL field, "גלה מה יש באתר" button → calls discover → renders the category table: checkbox + label + count + **per-section cap** input per category (smart defaults: products→50, info/articles→10, legal→0). Running total ("~62 עמודים ייסרקו") shown. Demo toggle (on) + archetype dropdown (existing). "התחל דמו" → `POST /api/pipeline/start` with `{ username?, accountId, websiteUrl, isDemo, archetype, scanMode:'quote', categories:[{pathPattern, cap}] }`.
- **Regular mode:** shows a list of existing quote accounts (`config.scan_mode='quote'`). Admin picks **Enrich <account>** (→ `start` on that `accountId` with `scanMode:'full'`, no categories/caps, IG if provided) **or** **New full scan** (→ normal full pipeline, new account).
- Website-only (no IG) → account anchored on the domain (`config.username = <domain>`).

### Phase 3 — Bounded / full pipeline run
The existing 9-step QStash pipeline, with these changes (see Pipeline Changes).

## Pipeline Changes

1. **IG-optional** — `ig-scan` and `transcribe` steps `return { status:'advance' }` immediately when `ctx.username` is falsy/domain-only (no IG). `create-account` anchors `config.username` on the domain when no IG username is given.
2. **Category-bounded `site-discover`** — when `ctx.state.options.categories` is set: after `discoverSitemapUrls`, keep only URLs whose path matches a selected `pathPattern`, take the first `cap` per group (cap 0 = exclude), push that bounded set to the frontier. When `categories` is absent (full/enrich) → push all sitemap URLs (current behaviour).
3. **Website-only persona** — `persona-build`: if the account has Instagram content (posts/transcriptions) → existing `preprocessInstagramData` path; else → build from website content (`instagram_bio_websites`) via the gov-ministry pattern (`scripts/build-gov-ministry-persona.mjs` logic, lifted into a lib function `buildPersonaFromWebsite(accountId)`), then save via `savePersonaToDatabase`.
4. **Branding (best-effort)** — `finalize` (or a small branding step): pull homepage `og:image`/favicon as logo + a dominant accent colour (reuse `src/lib/theme.ts` / `src/lib/scraping/image-analyzer.ts`), write to `config.widget` theme; fall back to defaults on failure. Never fails the run.
5. **Mode marking** — `finalize` writes `config.scan_mode` (`'quote'`/`'full'`) and `config.scanned_categories` (the selected `[{pathPattern, cap, count}]`) for the enrich UI + audit.

## Data model

- `config.scan_mode`: `'quote' | 'full'`.
- `config.scanned_categories`: `[{ pathPattern, cap, count }]`.
- `pipeline_state.options.categories`: `[{ pathPattern, cap }]` (absent → full scope). Extends the existing `PipelineOptions` (transcribe, maxPages, postsLimit, isDemo, archetype).
- Redis `discover:{domain}` → cached discover result (TTL 1h).

## Enrich flow (regular scan on an existing quote account)

`start` with an existing `accountId`, `scanMode:'full'`, no `categories`. The pipeline re-runs full-scope on the same account: `site-discover` pushes all sitemap URLs (skips ones already in `instagram_bio_websites` as an optimisation), `ig-scan` runs if an IG username is now present, `rag-ingest`/`product-extract`/`persona-build` rebuild on the fuller content (idempotent upserts), `finalize` sets `scan_mode='full'`. No account re-creation.

## Error handling & edge cases

- **No sitemap** → discover returns `noSitemap:true`; UI offers "scan homepage + N pages"; pipeline seeds frontier with homepage + shallow BFS.
- **No IG and no website** → `start`/`discover` validation error (need at least one).
- **Huge/nested sitemap** → grouping only counts; AI labelling is per-group → cost is O(#groups), not O(#urls).
- **Website-only, no products** (service site) → `product-extract` yields 0; demo = chat + branding.
- **Enrich re-crawl** → upserts make it safe; skip already-scraped URLs as an optimisation.
- **Stale discover cache** → 1h TTL + explicit re-discover.
- **Branding extraction fails** → default theme; admin can adjust.

## Testing

- **Unit:** path-grouping; `site-discover` category filter (URLs matched + caps + cap-0 exclusion); discover AI-labelling (mock LLM); `ig-scan`/`transcribe` skip when no username; persona-build path selection (IG vs website); `create-account` domain anchor.
- **Integration:** discover endpoint (mock sitemap fetch) → categories; `start` with categories → `pipeline_state.options.categories` set; `site-discover` with categories → frontier only selected slice; enrich `start` → full scope.
- **E2E acceptance:** a real quote scan of a website (pick 2 categories, products→30) → demo account with chat + products + branding on the slice; then a regular enrich run → full account, `scan_mode='full'`.

## Reuse targets (implementer confirms exact signatures)

- `discoverSitemapUrls` (`src/lib/pipeline/sitemap.ts`), `pushFrontier`/`setCount` (`src/lib/pipeline/state.ts`).
- Website persona: `scripts/build-gov-ministry-persona.mjs` (reads `instagram_bio_websites`, GPT-5.4) → lift into `buildPersonaFromWebsite(accountId)`.
- Branding: `src/lib/theme.ts`, `src/lib/scraping/image-analyzer.ts`.
- Chat model helper for labelling: existing GPT-5.4 client (`src/lib/gemini-chat.ts` is Gemini; use the OpenAI chat path the app already uses for chat).
- Existing pipeline: `/api/pipeline/start`, `run`, `steps/*`, `PipelineOptions` (`src/lib/pipeline/types.ts`).
