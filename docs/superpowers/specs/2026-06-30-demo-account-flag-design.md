# Demo Account Flag — Design

**Date:** 2026-06-30
**Goal:** Let an admin mark an account as "demo" so it is excluded from all automatic daily scanning/AI crons, cutting cost on the ~29 non-client accounts currently full-scanned daily.

## Problem

Measured reality (30 days): 720 full scans across 30 accounts (~daily per account), 1,873 reel transcriptions. Only one account (LA BEAUTÉ) is an active paying client; the rest are demos/tests being scanned daily at ~$5–8/account/month for nothing.

## Decisions

- **Demo behavior:** a demo account is **never scanned automatically** (manual scan still works via the existing add/re-scan flow).
- **UI:** a toggle + "Demo" badge on each account card in `admin/accounts`.

## Storage

`accounts.config.isDemo` (boolean, JSONB). Chosen to sit alongside the existing `config.crmOnly` flag that `daily-scan` already filters on. Absent ⇒ not a demo ⇒ all existing accounts behave exactly as today.

## Cron gating (the cost saving)

Exclude demos from the three automatic crons:

| Cron | Change |
|---|---|
| `daily-scan` | extend existing filter: `&& config?.isDemo !== true` (next to `crmOnly`) |
| `daily-persona-update` | fetch demo account IDs; `continue` (skip) in the per-account loop |
| `analyze-conversations` | add `config` to the accounts select; skip demos in the loop |

## API

Extend the existing `PATCH /api/admin/accounts/[accountId]` (env-cookie admin auth) to merge `isDemo` into `config` when `typeof body.isDemo === 'boolean'`, without clobbering other config fields. The existing widget-merge behavior is preserved.

`GET /api/admin/accounts` adds `is_demo: config.isDemo === true` to each transformed row so the UI can render toggle state.

## UI

`admin/accounts/page.tsx`:
- Track `is_demo` per row in component state.
- `AccountCard`: show a "Demo" badge when on; add a toggle button in the actions row that PATCHes `{ isDemo: !current }` and updates state optimistically.

## Default & safety

- Existing accounts: no `isDemo` ⇒ not demo ⇒ unchanged behavior.
- Mark demo ⇒ excluded from the next cron run.
- Unmark ⇒ returns to the daily scan rotation.

## Scope

~5 files, mostly 1–2 line changes: 3 crons, list API, PATCH API, 1 UI component. No DB migration (JSONB).
