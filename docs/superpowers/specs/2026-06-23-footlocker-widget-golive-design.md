# Foot Locker — Widget Go-Live Design

**Date:** 2026-06-23
**Status:** Approved (verbal "שוט")
**Account:** Foot Locker IL — `a610c713-0a17-47aa-a926-0e96d3d49b5a` (`footlocker.il`, archetype `brand`, site `footlocker.co.il`)

## Context

Foot Locker signed a contract and wants the embeddable chat widget on their site.
The account already exists (created 2026-05-07 via `setup-account.ts`) and is substantially
complete. This is a refresh + go-live, **not** a from-scratch setup.

### Audit (as of 2026-06-23)

| Component | State |
|-----------|-------|
| Account row | ✅ active, archetype=brand, website_url set |
| chatbot_persona | ✅ 1 row (name field is a long description — cosmetic) |
| instagram_posts | ✅ 99 |
| RAG chunks (`documents`) | ✅ 2,675 (website 1,726 · transcription 850 · post 99) |
| widget_products | ✅ 1,526 — all with image_url + product_url |
| `config.widget` | ❌ **missing entirely** (widget runs on generic defaults) |
| `config.profile_pic_url` | ❌ logo stored as `config.avatar_url` → widget can't show it |
| `/footlocker/login` portal | ❌ does not exist |
| Brand password (`admin_password_hash`) | ❌ not set |

### Key findings driving the design

- **Products use a bespoke path.** Catalog was imported by `footlocker-import-products.ts`
  (bulk from `instagram_bio_websites` rows matching `/products/`, no LLM), **not** the
  orchestrator's `extract-products-from-rag.ts` (step 5). The refresh must reuse the same
  bespoke path or the catalog quality regresses.
- **Site is scrapeable with the plain scraper.** The May scrape (fetch + cheerio,
  `deep-scrape-website.mjs`) produced 1,726 website chunks + 1,526 products → no Cloudflare
  workaround needed.
- **Widget resolves by `accountId`, not domain.** `widget.js` embeds `data-account-id`;
  `/api/widget/config` and the chat handler query by id. The `config.username=footlocker.il`
  vs domain `footlocker.co.il` mismatch does **not** break the widget.
- **config-wipe race** (recurred for studiopasha): scan/setup scripts rewrite `config`.
  → **Ordering rule: refresh data FIRST, write `config.widget` branding LAST**, so the race
  can't clobber branding. Password lives in a separate column (`admin_password_hash`), so it
  is safe to set anytime.
- **Portal pattern is reusable.** `argania`/`studiopasha` login pages are a direct template:
  fetch branding from `/api/widget/config`, POST to `/api/influencer/auth`, route to
  `/influencer/<username>/support` (route already exists). Password = PBKDF2 `salt:hash`
  via `hashPassword()` in `lib/utils.ts`.

## Plan

### Phase 1 — Refresh all data (reuse existing scripts)
1. Re-scan Instagram (posts + transcriptions) — `scan-account.ts` / orchestrator step 2.
2. Re-scrape `footlocker.co.il` — `deep-scrape-website.mjs` → fresh `instagram_bio_websites`
   + website RAG.
3. **Delete old `widget_products` for the account**, then re-import via
   `footlocker-import-products.ts` (fresh catalog + prices).
4. RAG enrich (`enrich-rag-chunks.ts`) + persona rebuild (`footlocker-persona-only.ts`).

### Phase 2 — Widget branding (`config.widget`)
Write `config.widget` via MCP/SQL **after** Phase 1:
- `primaryColor`: `#111111` (classic Foot Locker black/white); adjust if scrape reveals a
  clear signature brand color.
- `coverImage`: pulled from the scrape (hero/banner). Verify CSP whitelist for the image host.
- `socialLinks`: Instagram `footlocker.il` (+ others if found).
- `welcomeMessage` / `placeholder`: Hebrew, on-brand.
- Fix `config.profile_pic_url` = existing `config.avatar_url` so the logo renders.
- `enabled: true`.

### Phase 3 — Brand portal
- `src/app/footlocker/login/page.tsx` — copy of argania login; `ACCOUNT_USERNAME='footlocker.il'`,
  `ACCOUNT_ID='a610c713-...'`, `SUPPORT_PATH='/influencer/footlocker.il/support'`,
  fallback color `#111111`.
- Set `admin_password_hash` for the account to `hashPassword('123456')`.

### Delivery
- Embed snippet:
  `<script src="https://bestie.ldrsgroup.com/widget.js" data-account-id="a610c713-0a17-47aa-a926-0e96d3d49b5a"></script>`
- Smoke-test chat + product recommendations.
- ⚠️ Verify `ANALYTICS_WIDGET_SECRET` is set in prod (Vercel) — else widget records 0
  analytics/conversions (known blackout bug). This is env, not code.

## Decisions (confirmed with user)
- Goal: brand the widget **and** create the brand portal.
- Refresh: **everything** (products + prices + posts + RAG).
- Color: black `#111111` (refine from site during scrape).
- Cover: pull from the scrape.
- Password: `123456` (same as argania/studiopasha).

## Out of scope
- Fixing the config-wipe race itself (mitigated here by ordering).
- Setting prod env vars (ops task for the user).
