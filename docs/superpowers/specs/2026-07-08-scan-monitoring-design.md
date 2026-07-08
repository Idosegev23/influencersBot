# Scan Monitoring — Central Dashboard, Rich Board, Notifications, Parallel Scans

**Date:** 2026-07-08
**Status:** Approved design → pending plan
**Builds on:** the QStash account pipeline + selective quote-scan.

## Problem

Adding accounts gives poor feedback: the live board (`StepBoard.tsx`) is bare (plain rows, no overall progress, no elapsed time, no liveness signal), so long steps (transcription) look frozen; there is no central view of all in-progress scans; no notification when a scan finishes/fails; and the add-form forces the user onto a single board, discouraging running several lightweight scans in parallel (the backend already runs jobs in parallel via QStash — this is only a UX gap).

## Goal

Make scan progress obvious and monitorable across many parallel scans:

1. **Central scans dashboard** (`/admin/scans`) — every active + recent scan with live progress and a link to its board.
2. **Rich detailed board** — overall progress, highlighted current step, live per-step counts, elapsed time, and a "updated Ns ago" heartbeat so it never looks frozen.
3. **Notifications** — on-screen toast + browser Notification when a watched scan finishes or fails.
4. **Parallel scans UX** — after "start", let the admin add another scan instead of being forced to one board; watch all of them on the dashboard.

## Non-goals

- No websockets/Supabase Realtime — poll every ~2.5s (simple, consistent with the current board).
- No new job infrastructure — the QStash pipeline already runs jobs in parallel; this is monitoring + UX only.
- Email notifications are optional (reuse existing notify infra later); v1 is on-screen + browser Notification.

## Data (all already present in `scan_jobs`)

`scan_jobs`: `id, username, account_id, status ('queued'|'running'|'succeeded'|'failed'|'cancelled'), step_logs jsonb [{step,status,progress,message,timestamp}], pipeline_state jsonb {counts, currentStep, options}, config, created_at, updated_at, finished_at`.

**Progress computation (shared helper `computeScanProgress(job)`):**
- `THE_9_STEPS = [create-account, ig-scan, transcribe, site-discover, site-crawl, rag-ingest, product-extract, persona-build, finalize]`. Every step (incl. skipped ones) writes a `completed` log when it advances.
- `completedSteps` = count of distinct steps with a `completed` entry in `step_logs`.
- `percent` = round(completedSteps / 9 * 100).
- `currentStep` = the step of the most-recent `running` log that has no later `completed` log for the same step; else the last log's step; else null.
- `elapsedMs` = (finished_at ?? now) − created_at. `lastUpdateMs` = now − max(step_logs.timestamp).

## Components

### 1. `GET /api/admin/scans` (new)
Admin-auth. Returns the last N (~30) scan_jobs (or all `status in (queued,running)` + recent succeeded/failed), each mapped via `computeScanProgress` + joined account `display_name`:
`{ jobId, accountId, name, username, status, currentStep, completedSteps, percent, elapsedMs, lastUpdateMs, error }`. Ordered active-first, then created_at desc.

### 2. `/admin/scans` page (new) — central dashboard
Client component, polls `/api/admin/scans` every 2.5s. A table/cards list: name · status badge · **current-step label + `percent`% bar** · elapsed · "updated Ns ago" · link → `/admin/scan/{jobId}`. Active scans highlighted on top. A "➕ הוסף חשבון" button → `/admin/add`. Linked from the admin nav + from `/admin/accounts`.

### 3. Rich `StepBoard.tsx` (rewrite) — detailed board
- Header: account name, overall status badge, **overall progress bar (`percent`% · completedSteps/9)**, total elapsed, **"עודכן לפני Ns"** heartbeat (recomputed each poll).
- 9 step rows: state icon (pending `•` / running animated spinner / done `✓` / failed `✗`), label, **live count** (`counts[step].done/total` — e.g. transcription 12/39, crawl 45/210), per-step elapsed (from its running→completed timestamps). Current step visually highlighted.
- Terminal: on `succeeded` → success banner + links (chat `/chat/{username}`, widget install, account page); on `failed` → the failed step + message + a **"נסה שוב"** button that re-publishes that step via a new `POST /api/pipeline/retry` (admin/CRON auth → `publishStep(jobId, failedStep, 0)`).
- Polls every 2.5s; stops on terminal.

### 4. Notifications
- In `StepBoard` and `/admin/scans`: when a job the user is viewing transitions to `succeeded`/`failed` (detected across polls), show a toast and fire a browser `Notification` (request permission on first scan view; degrade silently if denied).
- Keep it dependency-free: a tiny toast component + the Web Notification API.

### 5. Parallel-scan UX (`/admin/add`)
On successful `start`, do **not** force-redirect. Show a success state: "✅ הסריקה התחילה עבור {name}" with two actions — **"עבור ללוח"** (`/admin/scan/{jobId}`) and **"הוסף חשבון נוסף"** (reset the form, stay). A persistent link to `/admin/scans` ("צפה בכל הסריקות"). Backend parallelism is unchanged (QStash).

## Error handling & edge cases
- A job with no step_logs yet → `percent 0`, `currentStep create-account`, status from row.
- `cancelled`/`failed` jobs shown with their state; failed shows the failing step.
- Notification permission denied → toast only.
- `lastUpdateMs` large (e.g. > 3 min) on a running job → the board shows a subtle "⚠ ייתכן שנתקע" hint (does not change job state).
- Many parallel scans → dashboard caps the list (~30) and notes if truncated.

## Testing
- **Unit:** `computeScanProgress` (percent, currentStep detection incl. skipped steps, elapsed/lastUpdate); `/api/admin/scans` mapping (mock supabase); retry route publishes the right step.
- **Integration:** status/list endpoints return the computed shape; StepBoard renders counts + heartbeat from a mock status payload.
- **E2E:** start 2 quote scans in parallel → both appear on `/admin/scans` with advancing progress → each board shows live counts → completion toast fires.

## Reuse
- `GET /api/pipeline/status/[jobId]` (existing) powers the board; extend its payload with `percent/elapsedMs/lastUpdateMs/currentStep` via `computeScanProgress`.
- `scanJobsRepo` for queries; `requireAdminAuth`; `publishStep` (`@/lib/pipeline/qstash`) for retry.
