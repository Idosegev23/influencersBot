# English Account Language Support + Lenovo Israel Demo — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending spec review → plan
**Owner:** Ido

## Goal

Add a **full demo account for Lenovo Israel** in which **everything the prospect sees is English** — dashboard UI, chatbot responses, the embeddable widget, and the persona/voice itself — even though the source Instagram (`lenovo_isr`) posts in Hebrew.

While doing it, make **English a first-class, reusable account option** rather than a Lenovo-specific hack, per the "new type = first-class, not a hack" rule.

- **Instagram:** `https://www.instagram.com/lenovo_isr`
- **Website:** `https://www.lenovo.com/il/en/`
- **Archetype:** `brand`
- **Demo:** `isDemo = true` (kept out of the daily auto-scan crons — no recurring scan cost)

## Background — how language flows today

The exploration of the current code established:

- **Chatbot runtime already flips to English** when `accounts.language = 'en'`. `baseArchetype.ts:591-597` reads `input.accountContext.language`, sets `isEnglish`, and prepends `LANG_DIRECTIVE_EN` to the system prompt. This reaches the runtime via `sandwichBot.ts:120` / `widget-chat-handler.ts:213`. **No change needed here.**
- **Widget static strings** support `'en'` via `api/widget/config/route.ts:46-49` (`SUPPORTED_LANGS = {he, en}`). **No change needed.**
- **Dashboard UI** switches on `accounts.language` via `POST /api/influencer/language` + the i18n catalog. **No change needed.**
- **BUT the stored persona is hardcoded Hebrew.** The IG persona builder (`gemini-persona-builder.ts`) has a Hebrew-only output contract (`:153` `כל התוכן בעברית בלבד`) and no language parameter; `savePersonaToDatabase` hardcodes `language: 'he'` (`:728`). `persona-build.ts:49` routes IG accounts to this builder. So even with the runtime forcing English replies, the **persona row itself is Hebrew** — visible in the dashboard/settings and fed (in Hebrew) into the prompt.
- **RAG enrichment is hardcoded Hebrew.** `rag/enrich.ts` unconditionally adds Hebrew `[סיכום: …]` summaries and Hebrew synthetic queries; it only exposes `skipTranslation` / `skipSyntheticQueries` skip-flags, no `language` switch. Internal only (not user-visible), but pollutes an "English" account.
- **No creation-time language control exists.** `PipelineOptions` has no `language` field; `create-account.ts` writes only `config.*`; the admin insert path hardcodes `'he'`. So an account is always born Hebrew.

## Chosen approach

**Parameterize language through the pipeline and into the persona builder** (recommended over a post-hoc rebuild script or routing English IG accounts to the website builder — both rejected: the first is a hack, the second ignores IG voice/content which the demo wants).

### Part A — Make English a first-class pipeline option (reusable)

1. **`PipelineOptions` + `StartPipelineInput`** (`src/lib/pipeline/types.ts`, `src/lib/pipeline/start.ts`): add `language?: 'he' | 'en'` (default `'he'`).

2. **`create-account` step** (`src/lib/pipeline/steps/create-account.ts`): write the top-level `accounts.language` column from `ctx.state.options.language` on both the insert and update branches (currently it only merges `config.*`). This sets the language at step 1 — well before persona-build (step 10) and before any runtime read.

3. **IG persona builder** (`src/lib/ai/gemini-persona-builder.ts`):
   - Add a `language: 'he' | 'en' = 'he'` parameter to `buildPersonaWithGemini(...)`.
   - When `'en'`: swap the output-contract line `:153` (`כל התוכן בעברית בלבד`) for an English equivalent ("all field values in English only"), and **prepend a strong English output directive** to the prompt — mirroring the proven `LANG_DIRECTIVE_EN` pattern already used in `baseArchetype.ts`. The Hebrew authoring scaffolding stays; only the emitted field **values** flip to English.
   - `savePersonaToDatabase(...)`: accept the language and store it instead of the hardcoded `'he'` at `:728`.

4. **`persona-build` step** (`src/lib/pipeline/steps/persona-build.ts`): `select('config, language')`, and pass `account.language` into `buildPersonaWithGemini` + `savePersonaToDatabase`. (The website-only branch already honors language via `persona-from-website.ts:26` — no change there.)

5. **`rag-ingest` step / `rag/enrich.ts`**: when the account language is `'en'`, pass `skipTranslation: true` + `skipSyntheticQueries: true` so no Hebrew summary/query text is bolted onto English chunks. (Uses the existing skip-flags — no new enrich logic.)

6. **`/admin/add` form** (`src/app/admin/add/page.tsx`): add a small **Language** selector (`he` | `en`, default `he`) next to the archetype selector, and include `language` in the start-pipeline payload (`:210-223`).

### Part B — Build the Lenovo account

1. Generate a UUID. Start the pipeline with: `username: lenovo_isr`, `accountId`, `websiteUrl: https://www.lenovo.com/il/en/`, `archetype: 'brand'`, `isDemo: true`, `language: 'en'`, `displayName: 'Lenovo Israel'`, `scanMode: 'full'`, `maxPages: 150`, `hasIg: true`.
2. **Trigger on prod (Vercel)** via `POST /api/pipeline/start` with the `CRON_SECRET` bearer — the local Bezeq egress IP is blocked from the Gemini API, so scans must run server-side. Watch `/admin/scan/[jobId]` (polls 2.5s).
3. Pipeline runs its steps: create-account (writes `language=en`) → ig-scan → transcribe → site-discover → site-crawl (≤150) → rag-ingest (English, skip Hebrew) → product-extract (cap 150) → persona-build (English) → finalize (English display name + chat config).
4. **Widget** (`config.widget`): cover image + logo, an Instagram social link to `lenovo_isr`, English welcome/placeholder strings, Powered-by-Bestie — per the widget-redesign schema.

### Crawl bound

`maxPages = 150` and product-extract cap `150`. Enough for a convincing demo (laptops, key categories, support) without a full catalog crawl cost.

## Verification

- Chat several English questions on the `/chat` page → English responses grounded in real Lenovo products/specs.
- `chatbot_persona` row for the account: `language = 'en'` and English field values.
- Dashboard loads in English; widget renders English strings.
- Confirm `config.isDemo = true` → excluded from the daily scan crons.
- Regression: create a `language: 'he'` account (or leave default) and confirm the persona is still Hebrew — the English path must be opt-in only.

## Scope / non-goals

- **Not** internationalizing `rag/enrich.ts` to *generate* English summaries — for `en` we simply skip the Hebrew injection. (A future improvement could add real English summaries.)
- **Not** translating admin `/admin/*` UI (Hebrew-only by design).
- **Not** persisting Lenovo product images to Storage (external URLs render fine under the widget CSP).

## Cost note

One full-scan-class run (~$0.20–0.25 AI). `isDemo=true` prevents recurring daily-scan cost.
