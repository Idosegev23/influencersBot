# Dashboard Language Toggle + i18n Completion — design

**Date:** 2026-07-13
**Status:** Design approved (chat) — building
**Owner:** Ido

## 1. Problem

The `/influencer/[username]/*` dashboard has real i18n scaffolding — a per-account
`accounts.language` column ('he'|'en'), a `he`/`en` string catalog
(`src/lib/i18n/dashboard.ts`), `getDashboardStrings`/`dashboardDir`, and the
`useDashboardLang` hook wired into all 15 pages. But:

1. **No way to switch.** `accounts.language` is *read* everywhere and *written*
   nowhere — there is no UI toggle and no write endpoint. The only way to make a
   dashboard English today is a manual DB edit.
2. **Migration is partial.** Most visible copy is still hardcoded Hebrew inline
   (support ≈ 616 tokens, chatbot-settings ≈ 181, analytics ≈ 158, dashboard ≈ 142,
   settings ≈ 133, …), so even flipping `language='en'` leaves a half-Hebrew UI.

Immediate driver: the LDRS dashboard must render fully in English for Meta App
Review. General goal: a reusable language toggle any account can use.

## 2. Goal

- A **reusable `<LanguageToggle />` component** in the dashboard chrome that flips
  the whole dashboard he↔en (including RTL↔LTR), persisting the choice per account.
- **Complete the i18n extraction** so the toggle actually translates everything.

## 3. Non-goals

- Admin console (`/admin/*`) i18n — out of scope (Hebrew-only stays).
- Adding a third language — the design keeps the door open (catalog + `DashboardLang`
  union) but only he/en ship now.
- No i18n framework (next-intl/react-i18next) — keep the existing bespoke catalog.

## 4. Architecture

### 4.1 Persistence + write path (the missing piece)
- Source of truth stays `accounts.language`.
- **New endpoint** `POST /api/influencer/language` — authed via `requireInfluencerAuth`,
  body `{ language: 'he' | 'en' }`, validates the value, updates `accounts.language`
  for the caller's account, returns `{ ok, language }`.

### 4.2 `<LanguageToggle />` component
- `src/components/LanguageToggle.tsx`. Reads the current lang (`useDashboardLang`),
  renders a globe + the *other* language's label. On click:
  1. `POST /api/influencer/language` with the target lang,
  2. write the `dash_lang:<username>` localStorage cache (instant, flicker-free),
  3. `window.location.reload()` — the whole tree re-renders in the new lang + dir.
  Reload is the simplest correct way to re-flip every page's `dir` and strings at once.
- Placed next to the existing theme toggle in `NavigationMenu` (desktop nav + mobile bar).

### 4.3 Direction
- `dashboardDir(lang)` already exists. Add a `dir` wrapper in
  `/influencer/[username]/layout.tsx` (derive lang via `useDashboardLang` + `useParams`)
  so the whole surface — not just each page — flips LTR/RTL consistently.

### 4.4 Catalog restructure (enables safe parallel completion)
- Split the single `STRINGS` const into per-section files under `src/lib/i18n/dashboard/`
  (`nav.ts`, `dashboard.ts`, `chatbot.ts`, `analytics.ts`, `conversations.ts`,
  `support.ts`, `settings.ts`, `partnerships.ts`, `coupons.ts`, `products.ts`,
  `botContent.ts`, `attribution.ts`, `common.ts`), each exporting `{ he, en }`.
  `src/lib/i18n/dashboard/index.ts` composes them and keeps the public API identical
  (`getDashboardStrings`, `dashboardDir`, `DashboardLang`, `DashboardStrings`) so every
  existing `import … from '@/lib/i18n/dashboard'` keeps working.
- Payoff: each dashboard page maps to one section file, so completion work parallelizes
  with zero shared-file merge conflicts.

### 4.5 i18n completion
- For each page, extract remaining hardcoded Hebrew into its section file (`he` + `en`)
  and replace inline strings with `t.<section>.<key>` refs. `he` stays the canonical
  shape; `en` must mirror it (enforced by `DashboardStrings = typeof …he`).

## 5. Build phases

- **Phase 1 (foundation):** write endpoint + `<LanguageToggle />` + layout dir wrapper
  + toggle labels in the nav catalog. Toggle works immediately (translating whatever is
  already extracted). Verify + commit.
- **Phase 2 (completion):** (a) refactor catalog to per-section files; (b) parallel
  per-page extraction (workflow — each agent owns one section file + its page); (c)
  review + type-check + commit + push. Then set LDRS `language='en'`.

## 6. Error handling
- Endpoint: invalid/absent language → 400; unauth → the auth helper's 401; DB error → 500.
- Toggle: on POST failure, do not reload; surface a small inline error and keep the
  current language (no half-applied state).
- `getDashboardStrings` already falls back to `he` for any non-'en' value, so a missing
  `en` key degrades to Hebrew rather than crashing (but `DashboardStrings` typing catches
  missing keys at build time).

## 7. Testing
- Unit: language validation helper (`normalizeLang`) — 'en'→'en', 'he'→'he', junk→null;
  catalog composition (`getDashboardStrings('en').nav.dashboard === 'Dashboard'`, and
  `en` has the same keys as `he` for each section).
- Type-check: `en` mirrors `he` (the `DashboardStrings` type enforces this).
- Manual: toggle on LDRS flips the dashboard to English/LTR and back.

## 8. Rollout
- Straight to `main`. Set LDRS `accounts.language = 'en'` after Phase 2 so the recorded
  Meta surface is fully English. Other accounts stay Hebrew (per-account column).
