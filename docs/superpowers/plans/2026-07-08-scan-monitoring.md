# Scan Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A central scans dashboard + a rich live board (overall %, live counts, elapsed, "updated Ns ago"), on-screen/browser notifications on done/failed, and a parallel-scan UX — all polling-based over the existing `scan_jobs`.

**Architecture:** A pure `computeScanProgress(job)` helper derives percent/currentStep/elapsed from `scan_jobs.step_logs` + `pipeline_state.counts`. `GET /api/pipeline/status/[jobId]` (extended) powers a rewritten `StepBoard`; a new `GET /api/admin/scans` powers a new `/admin/scans` dashboard. Both poll every 2.5s. A `POST /api/pipeline/retry` re-publishes a failed step. Notifications use a tiny toast + the Web Notification API.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role), existing pipeline (`scanJobsRepo`, `publishStep`).

## Global Constraints

- Node 22 for tests (`~/.nvm/versions/node/v22.22.2/bin`); `npx vitest run <file>`; `npm run type-check` (ignore pre-existing `promo-video/` errors).
- Path alias `@/*` → `./src/*`. Supabase server client: `import { createClient } from '@/lib/supabase/server'`.
- Admin routes: `requireAdminAuth()`; mutating pipeline routes also accept `Bearer CRON_SECRET`.
- Poll interval 2500ms; stop polling on `succeeded`/`failed`.
- The 9 steps, in order: `create-account, ig-scan, transcribe, site-discover, site-crawl, rag-ingest, product-extract, persona-build, finalize`.
- `Date.now()`/`new Date()` are fine in app code (only workflow scripts forbid them).

## File Structure

**New:** `src/lib/pipeline/progress.ts` (computeScanProgress); `src/app/api/admin/scans/route.ts`; `src/app/admin/scans/page.tsx` + `ScansDashboard.tsx`; `src/app/api/pipeline/retry/route.ts`; `src/components/admin/useScanNotifications.ts` (toast + Notification).
**Modify:** `src/app/api/pipeline/status/[jobId]/route.ts`; `src/app/admin/scan/[jobId]/StepBoard.tsx`; `src/app/admin/add/page.tsx`.

---

## Task 1: `computeScanProgress` helper

**Files:**
- Create: `src/lib/pipeline/progress.ts`
- Test: `tests/unit/pipeline/progress.test.ts`

**Interfaces:**
- Produces:
  - `const SCAN_STEPS: string[]` (the 9 steps, in order)
  - `interface StepLog { step: string; status: string; progress?: number; message?: string; timestamp: string }`
  - `interface ScanProgress { completedSteps: number; totalSteps: number; percent: number; currentStep: string | null; elapsedMs: number; lastUpdateMs: number }`
  - `computeScanProgress(input: { status: string; step_logs?: StepLog[]; created_at?: string; finished_at?: string | null }, now?: number): ScanProgress`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/progress.test.ts
import { describe, it, expect } from 'vitest';
import { computeScanProgress, SCAN_STEPS } from '@/lib/pipeline/progress';

describe('computeScanProgress', () => {
  it('counts distinct completed steps and derives percent + currentStep', () => {
    const logs = [
      { step: 'create-account', status: 'completed', timestamp: '2026-07-08T10:00:00Z' },
      { step: 'ig-scan', status: 'completed', timestamp: '2026-07-08T10:01:00Z' },
      { step: 'transcribe', status: 'running', timestamp: '2026-07-08T10:02:00Z' },
    ];
    const p = computeScanProgress({ status: 'running', step_logs: logs, created_at: '2026-07-08T10:00:00Z' }, Date.parse('2026-07-08T10:03:00Z'));
    expect(p.totalSteps).toBe(9);
    expect(p.completedSteps).toBe(2);
    expect(p.percent).toBe(22); // round(2/9*100)
    expect(p.currentStep).toBe('transcribe'); // running, no completed after
    expect(p.elapsedMs).toBe(180000);
    expect(p.lastUpdateMs).toBe(60000); // now - last log ts
  });
  it('empty logs → 0% at create-account', () => {
    const p = computeScanProgress({ status: 'queued', step_logs: [], created_at: '2026-07-08T10:00:00Z' }, Date.parse('2026-07-08T10:00:05Z'));
    expect(p.percent).toBe(0);
    expect(p.currentStep).toBe('create-account');
  });
});
```

- [ ] **Step 2: Run test** → FAIL (module missing). `npx vitest run tests/unit/pipeline/progress.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/pipeline/progress.ts
export const SCAN_STEPS = [
  'create-account', 'ig-scan', 'transcribe', 'site-discover', 'site-crawl',
  'rag-ingest', 'product-extract', 'persona-build', 'finalize',
];

export interface StepLog { step: string; status: string; progress?: number; message?: string; timestamp: string }
export interface ScanProgress { completedSteps: number; totalSteps: number; percent: number; currentStep: string | null; elapsedMs: number; lastUpdateMs: number }

export function computeScanProgress(
  input: { status: string; step_logs?: StepLog[]; created_at?: string; finished_at?: string | null },
  now: number = Date.now(),
): ScanProgress {
  const logs = input.step_logs ?? [];
  const completed = new Set(logs.filter(l => l.status === 'completed').map(l => l.step));
  const completedSteps = SCAN_STEPS.filter(s => completed.has(s)).length;
  const percent = Math.round((completedSteps / SCAN_STEPS.length) * 100);

  // currentStep: latest running log whose step has no later completed; else last log's step; else first step.
  let currentStep: string | null = null;
  const sorted = [...logs].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const l = sorted[i];
    if (l.status === 'running' && !completed.has(l.step)) { currentStep = l.step; break; }
  }
  if (!currentStep) currentStep = sorted.length ? sorted[sorted.length - 1].step : SCAN_STEPS[0];

  const createdMs = input.created_at ? Date.parse(input.created_at) : now;
  const endMs = input.finished_at ? Date.parse(input.finished_at) : now;
  const lastTs = sorted.length ? Date.parse(sorted[sorted.length - 1].timestamp) : createdMs;
  return {
    completedSteps, totalSteps: SCAN_STEPS.length, percent, currentStep,
    elapsedMs: Math.max(0, endMs - createdMs),
    lastUpdateMs: Math.max(0, now - lastTs),
  };
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** `git add src/lib/pipeline/progress.ts tests/unit/pipeline/progress.test.ts && git commit -m "feat(monitoring): computeScanProgress helper"`

---

## Task 2: Extend status route with progress

**Files:** Modify `src/app/api/pipeline/status/[jobId]/route.ts`; Test `tests/unit/pipeline/status-progress.test.ts`

**Interfaces:** Consumes `computeScanProgress` (Task 1). Adds `percent, currentStep, completedSteps, totalSteps, elapsedMs, lastUpdateMs` to the JSON (keep existing `status, steps, counts, error`; `currentStep` now comes from computeScanProgress, not the stale `pipeline_state.currentStep`).

- [ ] **Step 1: Write failing test** — mock `getScanJobsRepo().getById` returning a job with step_logs; assert response has `percent` and a non-stale `currentStep`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — compute `const prog = computeScanProgress(job)` and spread `percent: prog.percent, currentStep: prog.currentStep, completedSteps: prog.completedSteps, totalSteps: prog.totalSteps, elapsedMs: prog.elapsedMs, lastUpdateMs: prog.lastUpdateMs` into the existing response. Keep `steps: job.step_logs ?? []` and `counts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(monitoring): status route returns progress fields"`

---

## Task 3: `GET /api/admin/scans` list route

**Files:** Create `src/app/api/admin/scans/route.ts`; Test `tests/unit/admin/scans-list.test.ts`

**Interfaces:** Consumes `requireAdminAuth`, `computeScanProgress`, supabase. Produces `GET /api/admin/scans` → `{ scans: [{ jobId, accountId, name, username, status, currentStep, percent, completedSteps, totalSteps, elapsedMs, lastUpdateMs, error }] }`. Query `scan_jobs` (id, username, account_id, status, step_logs, created_at, finished_at, error_message) ordered `created_at desc limit 30`; join account `config->>display_name` for `name` (fallback username). Sort active (`queued`/`running`) first.

- [ ] **Step 1: Write failing test** — mock supabase returning one running job + one succeeded; assert `scans[0].percent` present and active-first ordering.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — admin auth; fetch jobs; for each, `computeScanProgress` + look up `name` (a second query for `accounts` by ids, `config->>display_name`); map; sort active-first then created desc.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(monitoring): /api/admin/scans list route"`

---

## Task 4: `/admin/scans` dashboard page

**Files:** Create `src/app/admin/scans/page.tsx`, `src/app/admin/scans/ScansDashboard.tsx`; Test manual.

**Interfaces:** Consumes `GET /api/admin/scans`.

- [ ] **Step 1:** `ScansDashboard` client component: polls `/api/admin/scans` every 2500ms; renders rows — name · status badge · a progress bar (`percent`%) with `currentStep` label · elapsed (mm:ss) · "עודכן לפני Ns" · a link `→ /admin/scan/{jobId}`. Active scans on top. Header "סריקות" + a "➕ הוסף חשבון" link to `/admin/add`. Show a subtle "⚠ ייתכן שנתקע" when a running job's `lastUpdateMs > 180000`.
- [ ] **Step 2:** `page.tsx` renders `<ScansDashboard/>`. `npm run type-check`; `npm run dev` → `/admin/scans` renders + polls.
- [ ] **Step 3: Commit** `git commit -m "feat(monitoring): /admin/scans central dashboard"`

---

## Task 5: Rich `StepBoard` rewrite

**Files:** Modify `src/app/admin/scan/[jobId]/StepBoard.tsx`; Test manual.

**Interfaces:** Consumes the extended status route (Task 2), `SCAN_STEPS` (Task 1), retry route (Task 6), notifications (Task 7).

- [ ] **Step 1:** Rewrite: header (account/job title, status badge, **overall progress bar `percent`% · `completedSteps`/9**, total elapsed mm:ss, **"עודכן לפני Ns"** recomputed each poll from `lastUpdateMs`). Nine step rows using `SCAN_STEPS`: state icon (pending `•` / running animated spinner / done `✓` / failed `✗`), Hebrew label, live count `counts[step === 'site-crawl' ? 'crawl' : step]` as `done/total`, current step highlighted (`currentStep`). On `succeeded`: success banner + links (`/chat/{username}`, install, account). On `failed`: failed step + message + a "נסה שוב" button → `POST /api/pipeline/retry {jobId, step}`. Poll 2500ms, stop on terminal. Keep the Hebrew `STEP_LABELS`.
- [ ] **Step 2:** `npm run type-check`; `npm run dev` → open a board, confirm counts + heartbeat + spinner render.
- [ ] **Step 3: Commit** `git commit -m "feat(monitoring): rich live StepBoard (progress, counts, heartbeat)"`

---

## Task 6: `POST /api/pipeline/retry`

**Files:** Create `src/app/api/pipeline/retry/route.ts`; Test `tests/unit/pipeline/retry-route.test.ts`

**Interfaces:** Consumes `requireAdminAuth`/CRON, `publishStep` (`@/lib/pipeline/qstash`). `POST {jobId, step}` → auth → `publishStep({ jobId, step, batch: 0 })` → `{ ok: true }`. Validate `step` ∈ `SCAN_STEPS`.

- [ ] **Step 1: Write failing test** — mock `publishStep`; assert it's called with the given jobId+step and returns ok.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — admin-or-CRON auth block (mirror `/api/pipeline/start`); validate step; `await publishStep({ jobId, step, batch: 0 })`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(monitoring): retry route re-publishes a failed step"`

---

## Task 7: Notifications (toast + browser Notification)

**Files:** Create `src/components/admin/useScanNotifications.ts`; wire into `StepBoard.tsx` + `ScansDashboard.tsx`; Test manual.

**Interfaces:** Produces `useScanNotifications()` → `{ notify(title: string, body: string), Toasts }`. `notify` shows an in-page toast (auto-dismiss ~6s) AND fires `new Notification(title,{body})` if `Notification.permission === 'granted'` (request once on mount; silently degrade if denied/unsupported).

- [ ] **Step 1:** Implement the hook: internal toast list state + a `Toasts` element to render; `notify` pushes a toast + fires Notification; request permission on first mount.
- [ ] **Step 2:** In `StepBoard`: track previous status across polls; when it transitions to `succeeded`/`failed`, call `notify('הסריקה הושלמה'/'הסריקה נכשלה', accountName)`. Same in `ScansDashboard` for any job that flips to terminal since the last poll.
- [ ] **Step 3:** `npm run type-check`. Commit `git commit -m "feat(monitoring): toast + browser notifications on scan done/failed"`

---

## Task 8: Parallel-scan UX in add form

**Files:** Modify `src/app/admin/add/page.tsx`; Test manual.

**Interfaces:** Consumes `POST /api/pipeline/start`.

- [ ] **Step 1:** After a successful `start`, instead of `router.push`, set a `started` state holding `{ jobId, name }`. Render a success panel: "✅ הסריקה התחילה עבור {name}" with **"עבור ללוח"** (`router.push('/admin/scan/'+jobId)`) and **"הוסף חשבון נוסף"** (reset form fields + `started=null`, stay on page). Add a persistent "צפה בכל הסריקות" link to `/admin/scans`.
- [ ] **Step 2:** `npm run type-check`; `npm run dev` → start a scan, confirm the panel appears and "הוסף עוד" resets the form.
- [ ] **Step 3: Commit** `git commit -m "feat(monitoring): parallel-scan add UX (add another / view all)"`

---

## Self-Review

**Spec coverage:** central dashboard (T3+T4), rich board (T2+T5), notifications (T7), parallel UX (T8), retry (T6), computeScanProgress shared helper (T1). All spec sections mapped.

**Placeholder scan:** UI tasks (4,5,8) are manual-test with concrete step descriptions + exact copy; logic tasks (1,2,3,6) have full code/tests. "Confirm" notes point at named existing files. No TBD.

**Type consistency:** `SCAN_STEPS`, `ScanProgress` fields (`percent/currentStep/completedSteps/totalSteps/elapsedMs/lastUpdateMs`), `computeScanProgress`, `useScanNotifications`, retry `{jobId, step}` are consistent across tasks.

**Executor reads before coding:** `scanJobsRepo.getById` + `ScanJob` type; the existing status route; `publishStep` signature (`{jobId, step, batch}`); `requireAdminAuth`; the current `StepBoard`/add-form.
