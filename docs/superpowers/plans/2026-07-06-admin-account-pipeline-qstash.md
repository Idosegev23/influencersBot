# Admin Account Pipeline (QStash) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin "add account + scan" feature backed by a QStash step-chained pipeline that runs the full account setup server-side on Vercel (where Gemini is reachable), decomposed into bounded serverless steps, with a live progress board.

**Architecture:** A `scan_jobs` row tracks one pipeline run. `POST /api/pipeline/start` creates the job and publishes the first QStash message. A single `POST /api/pipeline/run` endpoint verifies the QStash signature, takes a Redis mutex, dispatches `{jobId, step, batch}` to a step function, persists progress (`scan_jobs.step_logs` + new `pipeline_state` JSONB), and publishes the next QStash message (next batch of the same step, or the next step). Batched steps self-re-enqueue until their cursor drains. Every step reuses existing scan/RAG/persona logic.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role), Upstash Redis + **Upstash QStash** (new dep), cheerio (sitemap/crawl), existing `runScanJob` / `processAccountContent` / `rag` / `extract-products` modules.

## Global Constraints

- Node 22 for local scripts (`~/.nvm/versions/node/v22.22.2/bin`); Vercel runtime for routes.
- All step routes: `export const maxDuration = 300` (each invocation must finish well under this).
- Path alias `@/*` → `./src/*`.
- Supabase server client via `@/lib/supabase/server` (`createClient()`, service-role, RLS-bypassing) inside routes; repos via `getScanJobsRepo()`.
- QStash env (already set): `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.
- Base URL for QStash callbacks: `process.env.PIPELINE_BASE_URL || 'https://influencers-bot.vercel.app'`.
- Gemini model IDs are already current (`gemini-3.5-flash` / `gemini-3.1-pro-preview`) — do not reintroduce `gemini-3-flash-preview`.
- Config writes MUST be read-modify-write merges, never overwrite (config-wipe guard).
- Run type-check with `npm run type-check` (build ignores TS errors; must check separately).

---

## File Structure

**New (engine):**
- `src/lib/pipeline/types.ts` — `PipelineStep`, `STEP_ORDER`, `BATCH_SIZES`, `PipelineState`, `StepContext`.
- `src/lib/pipeline/qstash.ts` — `getQStash()`, `publishStep()`, `verifyQStashSignature()`.
- `src/lib/pipeline/locks.ts` — `acquireStepLock()` / `releaseStepLock()` (Redis `SET NX PX`).
- `src/lib/pipeline/state.ts` — `loadState()`, `saveState()`, `bumpCount()`, frontier + cursor helpers.
- `src/lib/pipeline/sitemap.ts` — `discoverSitemapUrls(siteUrl)`.
- `src/lib/pipeline/crawl.ts` — `crawlPageBatch(urls, accountId)`.
- `src/lib/pipeline/steps/index.ts` — `STEP_HANDLERS` map (step → handler fn).
- `src/lib/pipeline/steps/*.ts` — one file per step handler.

**New (routes):**
- `src/app/api/pipeline/start/route.ts`
- `src/app/api/pipeline/run/route.ts`
- `src/app/api/pipeline/status/[jobId]/route.ts`

**New (UI):**
- `src/app/admin/scan/[jobId]/page.tsx` — live board.
- `src/app/admin/scan/[jobId]/StepBoard.tsx` — client component (polling).

**Modify:**
- `package.json` — add `@upstash/qstash`.
- `src/lib/redis.ts` — add `redisSetNx()`.
- `src/app/admin/add/page.tsx` — add website/demo/options fields + call `/api/pipeline/start`.

**Migration:** add `pipeline_state jsonb` to `scan_jobs`.

---

## Task 1: Add QStash dependency + Redis NX helper

**Files:**
- Modify: `package.json`
- Modify: `src/lib/redis.ts`
- Test: `tests/unit/pipeline/redis-nx.test.ts`

**Interfaces:**
- Produces: `redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean>` — true if the key was set (lock acquired), false if it already existed.

- [ ] **Step 1: Install QStash**

Run: `npm install @upstash/qstash@^2.7.0`
Expected: `package.json` gains `"@upstash/qstash"` under dependencies.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/pipeline/redis-nx.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
vi.mock('@/lib/redis', async (orig) => {
  const actual = await (orig as any)();
  return { ...actual }; // redisSetNx is the real impl under test after we add it
});

describe('redisSetNx', () => {
  it('returns true first time, false while key exists', async () => {
    const { redisSetNx } = await import('@/lib/redis');
    const key = `test:nx:${Math.floor(performance.now())}`;
    const first = await redisSetNx(key, '1', 30);
    const second = await redisSetNx(key, '1', 30);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/pipeline/redis-nx.test.ts`
Expected: FAIL — `redisSetNx is not a function`.

- [ ] **Step 4: Implement `redisSetNx`**

Add to `src/lib/redis.ts` (uses the module's existing `getRedisClient()` / client accessor — match the file's existing pattern for obtaining the client):

```typescript
/** SET key value NX PX — returns true if acquired (key was absent). */
export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return true; // no redis configured → act as if acquired (dev fallback)
  const res = await client.set(key, value, { nx: true, ex: ttlSeconds });
  return res === 'OK';
}
```

(If the file exposes the client differently — e.g. an internal `redisClient` variable — use the same accessor the other exported helpers use.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/pipeline/redis-nx.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/redis.ts tests/unit/pipeline/redis-nx.test.ts
git commit -m "feat(pipeline): add @upstash/qstash dep + redisSetNx mutex helper"
```

---

## Task 2: Migration — add `pipeline_state` to `scan_jobs`

**Files:**
- Migration (via Supabase MCP `apply_migration`, name `add_pipeline_state_to_scan_jobs`)

**Interfaces:**
- Produces: `scan_jobs.pipeline_state jsonb default '{}'::jsonb`.

- [ ] **Step 1: Apply migration**

SQL:
```sql
ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS pipeline_state jsonb NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 2: Verify**

Run this SQL and confirm the column exists:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='scan_jobs' AND column_name='pipeline_state';
```
Expected: one row `pipeline_state`.

- [ ] **Step 3: Commit** (migration file if generated locally, else note in plan)

```bash
git commit --allow-empty -m "chore(db): add pipeline_state jsonb to scan_jobs"
```

---

## Task 3: Pipeline types & constants

**Files:**
- Create: `src/lib/pipeline/types.ts`
- Test: `tests/unit/pipeline/types.test.ts`

**Interfaces:**
- Produces:
  - `type PipelineStep = 'create-account'|'ig-scan'|'transcribe'|'site-discover'|'site-crawl'|'rag-ingest'|'product-extract'|'persona-build'|'finalize'`
  - `const STEP_ORDER: PipelineStep[]`
  - `const BATCH_SIZES: Record<PipelineStep, number>`
  - `interface PipelineState { currentStep: PipelineStep; counts: Record<string, {done:number; total:number}>; cursors: Record<string, number>; websiteUrl?: string; options: PipelineOptions }`
  - `interface PipelineOptions { transcribe: boolean; maxPages: number | null; postsLimit: number; isDemo: boolean }`
  - `interface StepContext { jobId: string; accountId: string; username: string; step: PipelineStep; batch: number; state: PipelineState }`
  - `function nextStep(step: PipelineStep): PipelineStep | null`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/types.test.ts
import { describe, it, expect } from 'vitest';
import { STEP_ORDER, nextStep } from '@/lib/pipeline/types';

describe('STEP_ORDER', () => {
  it('starts at create-account and ends at finalize', () => {
    expect(STEP_ORDER[0]).toBe('create-account');
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe('finalize');
  });
  it('nextStep advances and returns null at the end', () => {
    expect(nextStep('create-account')).toBe('ig-scan');
    expect(nextStep('finalize')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pipeline/types.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```typescript
// src/lib/pipeline/types.ts
export type PipelineStep =
  | 'create-account' | 'ig-scan' | 'transcribe' | 'site-discover'
  | 'site-crawl' | 'rag-ingest' | 'product-extract' | 'persona-build' | 'finalize';

export const STEP_ORDER: PipelineStep[] = [
  'create-account', 'ig-scan', 'transcribe', 'site-discover',
  'site-crawl', 'rag-ingest', 'product-extract', 'persona-build', 'finalize',
];

export const BATCH_SIZES: Record<PipelineStep, number> = {
  'create-account': 0, 'ig-scan': 0, 'transcribe': 5, 'site-discover': 0,
  'site-crawl': 15, 'rag-ingest': 20, 'product-extract': 20, 'persona-build': 0, 'finalize': 0,
};

export interface PipelineOptions {
  transcribe: boolean;
  maxPages: number | null; // null = all sitemap urls
  postsLimit: number;
  isDemo: boolean;
}

export interface PipelineState {
  currentStep: PipelineStep;
  counts: Record<string, { done: number; total: number }>;
  cursors: Record<string, number>;
  websiteUrl?: string;
  options: PipelineOptions;
}

export interface StepContext {
  jobId: string;
  accountId: string;
  username: string;
  step: PipelineStep;
  batch: number;
  state: PipelineState;
}

export function nextStep(step: PipelineStep): PipelineStep | null {
  const i = STEP_ORDER.indexOf(step);
  return i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : null;
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/types.ts tests/unit/pipeline/types.test.ts
git commit -m "feat(pipeline): step order + types + batch sizes"
```

---

## Task 4: QStash client wrapper + signature verify

**Files:**
- Create: `src/lib/pipeline/qstash.ts`
- Test: `tests/unit/pipeline/qstash.test.ts`

**Interfaces:**
- Consumes: `PipelineStep` (Task 3).
- Produces:
  - `publishStep(input: { jobId: string; step: PipelineStep; batch?: number; delaySeconds?: number }): Promise<void>` — publishes a QStash message to `${PIPELINE_BASE_URL}/api/pipeline/run` with body `{jobId, step, batch}`.
  - `verifyQStashSignature(req: Request, rawBody: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test** (mock the QStash SDK)

```typescript
// tests/unit/pipeline/qstash.test.ts
import { describe, it, expect, vi } from 'vitest';
const publishJSON = vi.fn().mockResolvedValue({ messageId: 'm1' });
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(() => ({ publishJSON })),
  Receiver: vi.fn(() => ({ verify: vi.fn().mockResolvedValue(true) })),
}));

describe('publishStep', () => {
  it('publishes to /api/pipeline/run with jobId+step+batch', async () => {
    process.env.QSTASH_TOKEN = 't';
    process.env.PIPELINE_BASE_URL = 'https://example.com';
    const { publishStep } = await import('@/lib/pipeline/qstash');
    await publishStep({ jobId: 'j1', step: 'ig-scan', batch: 0 });
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/api/pipeline/run',
      body: { jobId: 'j1', step: 'ig-scan', batch: 0 },
    }));
  });
});
```

- [ ] **Step 2: Run test** → FAIL (module missing).

- [ ] **Step 3: Implement**

```typescript
// src/lib/pipeline/qstash.ts
import { Client, Receiver } from '@upstash/qstash';
import type { PipelineStep } from './types';

const BASE_URL = process.env.PIPELINE_BASE_URL || 'https://influencers-bot.vercel.app';

let client: Client | null = null;
export function getQStash(): Client {
  if (!client) client = new Client({ token: process.env.QSTASH_TOKEN! });
  return client;
}

export async function publishStep(input: {
  jobId: string; step: PipelineStep; batch?: number; delaySeconds?: number;
}): Promise<void> {
  await getQStash().publishJSON({
    url: `${BASE_URL}/api/pipeline/run`,
    body: { jobId: input.jobId, step: input.step, batch: input.batch ?? 0 },
    retries: 3,
    ...(input.delaySeconds ? { delay: input.delaySeconds } : {}),
  });
}

let receiver: Receiver | null = null;
export async function verifyQStashSignature(req: Request, rawBody: string): Promise<boolean> {
  const signature = req.headers.get('upstash-signature');
  if (!signature) return false;
  if (!receiver) {
    receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });
  }
  try {
    return await receiver.verify({ signature, body: rawBody });
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/qstash.ts tests/unit/pipeline/qstash.test.ts
git commit -m "feat(pipeline): QStash publish + signature verification"
```

---

## Task 5: State module (pipeline_state + step logs + frontier/cursor)

**Files:**
- Create: `src/lib/pipeline/state.ts`
- Create: `src/lib/pipeline/locks.ts`
- Test: `tests/unit/pipeline/state.test.ts`

**Interfaces:**
- Consumes: `PipelineState`, `PipelineStep` (Task 3); `redisRPush/redisLPopCount/redisLLen/redisSet/redisGet` (`@/lib/redis`); `redisSetNx` (Task 1).
- Produces (`state.ts`):
  - `loadState(jobId): Promise<PipelineState>`
  - `saveState(jobId, state: PipelineState): Promise<void>`
  - `setCount(jobId, key, patch: {done?:number; total?:number}): Promise<PipelineState>`
  - `pushFrontier(jobId, urls: string[]): Promise<void>`
  - `popFrontier(jobId, n: number): Promise<string[]>`
  - `frontierSize(jobId): Promise<number>`
  - `getCursor(jobId, step): Promise<number>` / `setCursor(jobId, step, n): Promise<void>`
- Produces (`locks.ts`):
  - `acquireStepLock(jobId, step, batch): Promise<boolean>`
  - Lock key format `pipeline:{jobId}:lock:{step}:{batch}`, TTL 120s.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/state.test.ts
import { describe, it, expect, vi } from 'vitest';
const rows: Record<string, any> = {};
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: rows['j1'] ?? null }) }) }),
      update: (patch: any) => ({ eq: async () => { rows['j1'] = { ...rows['j1'], ...patch }; return {}; } }),
    }),
  }),
}));
describe('state', () => {
  it('setCount merges counts into pipeline_state', async () => {
    rows['j1'] = { pipeline_state: { currentStep: 'transcribe', counts: {}, cursors: {}, options: {} } };
    const { setCount, loadState } = await import('@/lib/pipeline/state');
    await setCount('j1', 'transcribe', { done: 3, total: 37 });
    const s = await loadState('j1');
    expect(s.counts.transcribe).toEqual({ done: 3, total: 37 });
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement `locks.ts`**

```typescript
// src/lib/pipeline/locks.ts
import { redisSetNx } from '@/lib/redis';
import type { PipelineStep } from './types';
export async function acquireStepLock(jobId: string, step: PipelineStep, batch: number): Promise<boolean> {
  return redisSetNx(`pipeline:${jobId}:lock:${step}:${batch}`, '1', 120);
}
```

- [ ] **Step 4: Implement `state.ts`**

```typescript
// src/lib/pipeline/state.ts
import { createClient } from '@/lib/supabase/server';
import { redisRPush, redisLPopCount, redisLLen, redisSet, redisGet } from '@/lib/redis';
import type { PipelineState, PipelineStep } from './types';

export async function loadState(jobId: string): Promise<PipelineState> {
  const supabase = await createClient();
  const { data } = await supabase.from('scan_jobs').select('pipeline_state').eq('id', jobId).single();
  return (data?.pipeline_state ?? {}) as PipelineState;
}
export async function saveState(jobId: string, state: PipelineState): Promise<void> {
  const supabase = await createClient();
  await supabase.from('scan_jobs').update({ pipeline_state: state, updated_at: new Date().toISOString() }).eq('id', jobId);
}
export async function setCount(jobId: string, key: string, patch: { done?: number; total?: number }): Promise<PipelineState> {
  const state = await loadState(jobId);
  const prev = state.counts?.[key] ?? { done: 0, total: 0 };
  state.counts = { ...(state.counts ?? {}), [key]: { done: patch.done ?? prev.done, total: patch.total ?? prev.total } };
  await saveState(jobId, state);
  return state;
}
export async function pushFrontier(jobId: string, urls: string[]): Promise<void> {
  if (urls.length) await redisRPush(`pipeline:${jobId}:frontier`, urls);
}
export async function popFrontier(jobId: string, n: number): Promise<string[]> {
  return redisLPopCount(`pipeline:${jobId}:frontier`, n);
}
export async function frontierSize(jobId: string): Promise<number> {
  return redisLLen(`pipeline:${jobId}:frontier`);
}
export async function getCursor(jobId: string, step: PipelineStep): Promise<number> {
  const v = await redisGet<string>(`pipeline:${jobId}:cursor:${step}`);
  return v ? parseInt(v, 10) : 0;
}
export async function setCursor(jobId: string, step: PipelineStep, n: number): Promise<void> {
  await redisSet(`pipeline:${jobId}:cursor:${step}`, String(n), 86400);
}
```

(If `redisSet`'s signature differs — e.g. `(key, value, ttl)` vs an options object — match the existing signature in `src/lib/redis.ts`.)

- [ ] **Step 5: Run test** → PASS.
- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/state.ts src/lib/pipeline/locks.ts tests/unit/pipeline/state.test.ts
git commit -m "feat(pipeline): durable state + redis frontier/cursor + step lock"
```

---

## Task 6: Step handler registry + dispatcher skeleton

**Files:**
- Create: `src/lib/pipeline/steps/index.ts`
- Create: `src/lib/pipeline/steps/create-account.ts`
- Test: `tests/unit/pipeline/dispatch.test.ts`

**Interfaces:**
- Consumes: `StepContext`, `PipelineStep` (Task 3).
- Produces:
  - `type StepResult = { status: 'advance' } | { status: 're-enqueue'; delaySeconds?: number } | { status: 'failed'; error: string }`
  - `type StepHandler = (ctx: StepContext) => Promise<StepResult>`
  - `const STEP_HANDLERS: Record<PipelineStep, StepHandler>`
  - `create-account.ts` exports `createAccountStep: StepHandler`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/dispatch.test.ts
import { describe, it, expect } from 'vitest';
import { STEP_HANDLERS } from '@/lib/pipeline/steps';
import { STEP_ORDER } from '@/lib/pipeline/types';
describe('STEP_HANDLERS', () => {
  it('has a handler for every step', () => {
    for (const s of STEP_ORDER) expect(typeof STEP_HANDLERS[s]).toBe('function');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement `create-account.ts`**

```typescript
// src/lib/pipeline/steps/create-account.ts
import { createClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/utils';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function createAccountStep(ctx: StepContext): Promise<StepResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from('accounts').select('id, config, security_config').eq('id', ctx.accountId).single();
  const baseConfig = existing?.config ?? {};
  const mergedConfig = { ...baseConfig, username: ctx.username, display_name: baseConfig.display_name || ctx.username, isDemo: ctx.state.options.isDemo };
  if (!existing) {
    await supabase.from('accounts').insert({ id: ctx.accountId, type: 'creator', config: mergedConfig });
  } else {
    await supabase.from('accounts').update({ config: mergedConfig }).eq('id', ctx.accountId); // merge, never overwrite
  }
  if (!existing?.security_config?.admin_password_hash) {
    const hash = await hashPassword('123456');
    await supabase.from('accounts').update({ security_config: { ...(existing?.security_config ?? {}), admin_password_hash: hash } }).eq('id', ctx.accountId);
  }
  return { status: 'advance' };
}
```

- [ ] **Step 4: Implement registry `index.ts`** (stub the not-yet-written handlers with a temporary throwing placeholder that later tasks replace)

```typescript
// src/lib/pipeline/steps/index.ts
import type { PipelineStep, StepContext } from '../types';
import { createAccountStep } from './create-account';

export type StepResult =
  | { status: 'advance' }
  | { status: 're-enqueue'; delaySeconds?: number }
  | { status: 'failed'; error: string };
export type StepHandler = (ctx: StepContext) => Promise<StepResult>;

const notImplemented: StepHandler = async () => ({ status: 'advance' }); // replaced in Tasks 8-14

export const STEP_HANDLERS: Record<PipelineStep, StepHandler> = {
  'create-account': createAccountStep,
  'ig-scan': notImplemented,
  'transcribe': notImplemented,
  'site-discover': notImplemented,
  'site-crawl': notImplemented,
  'rag-ingest': notImplemented,
  'product-extract': notImplemented,
  'persona-build': notImplemented,
  'finalize': notImplemented,
};
```

- [ ] **Step 5: Run test** → PASS.
- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/steps tests/unit/pipeline/dispatch.test.ts
git commit -m "feat(pipeline): step handler registry + create-account step"
```

---

## Task 7: `/api/pipeline/run` — verify, lock, dispatch, advance

**Files:**
- Create: `src/app/api/pipeline/run/route.ts`
- Test: `tests/unit/pipeline/run-route.test.ts`

**Interfaces:**
- Consumes: `verifyQStashSignature`, `publishStep` (Task 4); `acquireStepLock` (Task 5); `STEP_HANDLERS` (Task 6); `loadState`, `saveState` (Task 5); `getScanJobsRepo().addStepLog` + `getById`; `nextStep` (Task 3).
- Behaviour: verify signature → 401 if bad; parse `{jobId, step, batch}`; `acquireStepLock` → if false return 200 `{deduped:true}`; `addStepLog(step,'running',...)`; run handler; on `advance` → `addStepLog(step,'completed',100)`, compute `nextStep`, if present `publishStep(next)` else `markSucceeded`; on `re-enqueue` → `publishStep(same step, batch+1, delay)`; on `failed` → `addStepLog(step,'failed')` + `markFailed` + stop.

- [ ] **Step 1: Write the failing test** (mock qstash + handlers + repo)

```typescript
// tests/unit/pipeline/run-route.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/qstash', () => ({ verifyQStashSignature: vi.fn().mockResolvedValue(true), publishStep: vi.fn() }));
vi.mock('@/lib/pipeline/locks', () => ({ acquireStepLock: vi.fn().mockResolvedValue(true) }));
const addStepLog = vi.fn(); const markSucceeded = vi.fn();
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => ({ addStepLog, markSucceeded, markFailed: vi.fn(), getById: async () => ({ id: 'j1', account_id: 'a1', username: 'u' }) }) }));
vi.mock('@/lib/pipeline/state', () => ({ loadState: async () => ({ currentStep: 'finalize', counts: {}, cursors: {}, options: {} }), saveState: vi.fn() }));
vi.mock('@/lib/pipeline/steps', () => ({ STEP_HANDLERS: { finalize: async () => ({ status: 'advance' }) } }));

describe('POST /api/pipeline/run', () => {
  it('marks job succeeded when the last step advances', async () => {
    const { POST } = await import('@/app/api/pipeline/run/route');
    const req = new Request('http://x/api/pipeline/run', { method: 'POST', body: JSON.stringify({ jobId: 'j1', step: 'finalize', batch: 0 }) });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(markSucceeded).toHaveBeenCalledWith('j1', expect.anything());
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/pipeline/run/route.ts
import { NextResponse } from 'next/server';
import { verifyQStashSignature, publishStep } from '@/lib/pipeline/qstash';
import { acquireStepLock } from '@/lib/pipeline/locks';
import { STEP_HANDLERS } from '@/lib/pipeline/steps';
import { loadState } from '@/lib/pipeline/state';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { nextStep } from '@/lib/pipeline/types';

export const maxDuration = 300;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const ok = await verifyQStashSignature(req, rawBody);
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  const { jobId, step, batch } = JSON.parse(rawBody) as { jobId: string; step: any; batch: number };
  if (!(await acquireStepLock(jobId, step, batch))) return NextResponse.json({ deduped: true });

  const repo = getScanJobsRepo();
  const job = await repo.getById(jobId);
  if (!job) return NextResponse.json({ error: 'no job' }, { status: 404 });

  const state = await loadState(jobId);
  await repo.addStepLog(jobId, step, 'running', 0, `שלב ${step} רץ (batch ${batch})`);

  let result;
  try {
    result = await STEP_HANDLERS[step]({ jobId, accountId: job.account_id!, username: job.username, step, batch, state });
  } catch (e: any) {
    result = { status: 'failed', error: e?.message || String(e) } as const;
  }

  if (result.status === 'failed') {
    await repo.addStepLog(jobId, step, 'failed', 0, result.error);
    await repo.markFailed(jobId, 'PIPELINE_STEP_FAILED', `${step}: ${result.error}`);
    return NextResponse.json({ status: 'failed', step });
  }
  if (result.status === 're-enqueue') {
    await publishStep({ jobId, step, batch: batch + 1, delaySeconds: result.delaySeconds });
    return NextResponse.json({ status: 're-enqueued', step, batch: batch + 1 });
  }
  // advance
  await repo.addStepLog(jobId, step, 'completed', 100, `שלב ${step} הושלם`);
  const next = nextStep(step);
  if (next) { await publishStep({ jobId, step: next, batch: 0 }); return NextResponse.json({ status: 'advanced', next }); }
  await repo.markSucceeded(jobId, { pipeline: 'complete' });
  return NextResponse.json({ status: 'done' });
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/app/api/pipeline/run/route.ts tests/unit/pipeline/run-route.test.ts
git commit -m "feat(pipeline): /api/pipeline/run dispatcher (verify+lock+advance)"
```

---

## Task 8: `/api/pipeline/start` + `/api/pipeline/status/[jobId]`

**Files:**
- Create: `src/app/api/pipeline/start/route.ts`
- Create: `src/app/api/pipeline/status/[jobId]/route.ts`
- Test: `tests/unit/pipeline/start-route.test.ts`

**Interfaces:**
- Consumes: `requireAdminAuth`; `getScanJobsRepo().create`; `saveState` (Task 5); `publishStep` (Task 4); `DEFAULT_SCAN_CONFIG`.
- Produces: `POST /api/pipeline/start` body `{ username, accountId, websiteUrl?, isDemo?, transcribe?, maxPages?, postsLimit? }` → creates job + seeds `pipeline_state` + `publishStep('create-account')` → returns `{ jobId }`. `GET /api/pipeline/status/[jobId]` → `{ status, steps: {step,status,progress,message,timestamp}[], counts, currentStep }`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/start-route.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
const create = vi.fn(async () => ({ id: 'job-9' }));
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => ({ create }) }));
vi.mock('@/lib/pipeline/state', () => ({ saveState: vi.fn() }));
const publishStep = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({ publishStep }));

describe('POST /api/pipeline/start', () => {
  it('creates job and publishes create-account', async () => {
    const { POST } = await import('@/app/api/pipeline/start/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ username: 'u', accountId: 'a1' }) });
    const res = await POST(req as any);
    const json = await res.json();
    expect(json.jobId).toBe('job-9');
    expect(publishStep).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-9', step: 'create-account' }));
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement `start/route.ts`**

```typescript
// src/app/api/pipeline/start/route.ts
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';
import { saveState } from '@/lib/pipeline/state';
import { publishStep } from '@/lib/pipeline/qstash';
import { DEFAULT_SCAN_CONFIG } from '@/lib/scraping/newScanOrchestrator';
import type { PipelineState } from '@/lib/pipeline/types';

export async function POST(req: Request) {
  const denied = await requireAdminAuth();
  if (denied) return denied;
  const body = await req.json();
  const { username, accountId, websiteUrl, isDemo = true, transcribe = true, maxPages = null, postsLimit = DEFAULT_SCAN_CONFIG.postsLimit } = body;
  if (!username || !accountId) return NextResponse.json({ error: 'username and accountId required' }, { status: 400 });

  const repo = getScanJobsRepo();
  const job = await repo.create({ username, account_id: accountId, priority: 100, requested_by: 'admin:pipeline', config: { ...DEFAULT_SCAN_CONFIG, postsLimit, transcribeReels: transcribe } });

  const state: PipelineState = { currentStep: 'create-account', counts: {}, cursors: {}, websiteUrl, options: { transcribe, maxPages, postsLimit, isDemo } };
  await saveState(job.id, state);
  await publishStep({ jobId: job.id, step: 'create-account', batch: 0 });
  return NextResponse.json({ jobId: job.id });
}
```

- [ ] **Step 4: Implement `status/[jobId]/route.ts`**

```typescript
// src/app/api/pipeline/status/[jobId]/route.ts
import { NextResponse } from 'next/server';
import { getScanJobsRepo } from '@/lib/db/repositories/scanJobsRepo';

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getScanJobsRepo().getById(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    status: job.status,
    steps: job.step_logs ?? [],
    counts: (job as any).pipeline_state?.counts ?? {},
    currentStep: (job as any).pipeline_state?.currentStep ?? null,
    error: job.error_message ?? null,
  });
}
```

- [ ] **Step 5: Run test** → PASS.
- [ ] **Step 6: Commit**

```bash
git add src/app/api/pipeline/start/route.ts "src/app/api/pipeline/status/[jobId]/route.ts" tests/unit/pipeline/start-route.test.ts
git commit -m "feat(pipeline): start + status routes"
```

---

## Task 9: Step `ig-scan` (wrap runScanJob)

**Files:**
- Create: `src/lib/pipeline/steps/ig-scan.ts`
- Modify: `src/lib/pipeline/steps/index.ts` (wire handler)
- Test: `tests/unit/pipeline/ig-scan-step.test.ts`

**Interfaces:**
- Consumes: `runScanJob(jobId)` from `@/lib/scraping/runScanJob`; `StepContext`, `StepResult`.
- Produces: `igScanStep: StepHandler`. After scan, reads `accounts.config.website_url` (populated from IG bio) and, if the run had no explicit `websiteUrl`, writes it into `state.websiteUrl` via `saveState`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/ig-scan-step.test.ts
import { describe, it, expect, vi } from 'vitest';
const runScanJob = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/scraping/runScanJob', () => ({ runScanJob }));
vi.mock('@/lib/pipeline/state', () => ({ saveState: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: { website_url: 'https://carolinalemke.co.il' } } }) }) }) }) }) }));
describe('igScanStep', () => {
  it('runs the scan and advances', async () => {
    const { igScanStep } = await import('@/lib/pipeline/steps/ig-scan');
    const res = await igScanStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'ig-scan', batch: 0, state: { currentStep: 'ig-scan', counts: {}, cursors: {}, options: { transcribe: true, maxPages: null, postsLimit: 50, isDemo: true } } as any });
    expect(runScanJob).toHaveBeenCalledWith('j1');
    expect(res.status).toBe('advance');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/lib/pipeline/steps/ig-scan.ts
import { runScanJob } from '@/lib/scraping/runScanJob';
import { createClient } from '@/lib/supabase/server';
import { saveState } from '@/lib/pipeline/state';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function igScanStep(ctx: StepContext): Promise<StepResult> {
  await runScanJob(ctx.jobId); // scrapes profile+posts+highlights+comments into DB
  if (!ctx.state.websiteUrl) {
    const supabase = await createClient();
    const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
    const fromBio = data?.config?.website_url;
    if (fromBio) { ctx.state.websiteUrl = fromBio; await saveState(ctx.jobId, ctx.state); }
  }
  return { status: 'advance' };
}
```

- [ ] **Step 4: Wire into `index.ts`** — replace `'ig-scan': notImplemented` with `igScanStep` (add import).
- [ ] **Step 5: Run test** → PASS.
- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/steps/ig-scan.ts src/lib/pipeline/steps/index.ts tests/unit/pipeline/ig-scan-step.test.ts
git commit -m "feat(pipeline): ig-scan step wraps runScanJob"
```

---

## Task 10: Step `transcribe` (batched)

**Files:**
- Create: `src/lib/pipeline/steps/transcribe.ts`
- Modify: `src/lib/pipeline/steps/index.ts`
- Test: `tests/unit/pipeline/transcribe-step.test.ts`

**Interfaces:**
- Consumes: a batch transcription helper. Reuse the transcriber by selecting untranscribed videos for the account and transcribing up to `BATCH_SIZES.transcribe`. Use existing `@/lib/transcription/gemini-transcriber` (`transcribeVideo`-style fn) + `instagram_posts` query for videos lacking a transcription. Consult `src/lib/processing/content-processor-orchestrator.ts` for the exact transcriber call it uses and mirror it.
- Produces: `transcribeStep: StepHandler` — transcribes the next `BATCH_SIZES.transcribe` untranscribed videos, updates `setCount(jobId,'transcribe',{done,total})`; returns `re-enqueue` while untranscribed videos remain, else `advance`. If `state.options.transcribe === false`, immediately `advance`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/transcribe-step.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/state', () => ({ setCount: vi.fn() }));
describe('transcribeStep', () => {
  it('skips (advance) when transcription disabled', async () => {
    const { transcribeStep } = await import('@/lib/pipeline/steps/transcribe');
    const res = await transcribeStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'transcribe', batch: 0, state: { options: { transcribe: false } } as any });
    expect(res.status).toBe('advance');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** (mirror the transcriber usage found in `content-processor-orchestrator.ts`; the query below selects video posts without a transcription — adjust column names to the real schema you confirm)

```typescript
// src/lib/pipeline/steps/transcribe.ts
import { createClient } from '@/lib/supabase/server';
import { setCount } from '@/lib/pipeline/state';
import { BATCH_SIZES } from '../types';
import type { StepContext } from '../types';
import type { StepResult } from './index';
// import the same transcriber fn used by content-processor-orchestrator.ts
import { transcribeSingleVideo } from '@/lib/transcription/gemini-transcriber'; // confirm exact export name

export async function transcribeStep(ctx: StepContext): Promise<StepResult> {
  if (!ctx.state.options.transcribe) return { status: 'advance' };
  const supabase = await createClient();
  // total video posts for account
  const { count: total } = await supabase.from('instagram_posts').select('id', { count: 'exact', head: true }).eq('account_id', ctx.accountId).eq('is_video', true);
  // next batch of untranscribed videos
  const { data: pending } = await supabase.from('instagram_posts').select('id, video_url').eq('account_id', ctx.accountId).eq('is_video', true).is('transcription', null).limit(BATCH_SIZES.transcribe);
  if (!pending || pending.length === 0) { await setCount(ctx.jobId, 'transcribe', { done: total ?? 0, total: total ?? 0 }); return { status: 'advance' }; }
  for (const p of pending) {
    try { await transcribeSingleVideo(p.id, p.video_url); } catch (e) { /* per-video failure is non-fatal; leave for retry */ }
  }
  const { count: remaining } = await supabase.from('instagram_posts').select('id', { count: 'exact', head: true }).eq('account_id', ctx.accountId).eq('is_video', true).is('transcription', null);
  await setCount(ctx.jobId, 'transcribe', { done: (total ?? 0) - (remaining ?? 0), total: total ?? 0 });
  return (remaining ?? 0) > 0 ? { status: 're-enqueue' } : { status: 'advance' };
}
```

> **Implementer note:** confirm the real transcriber export + the `instagram_posts` columns (`is_video`, `video_url`, `transcription`) against the codebase before finalizing; mirror exactly what `content-processor-orchestrator.ts` does. Update the query/fn names to match.

- [ ] **Step 4: Wire into `index.ts`.**
- [ ] **Step 5: Run test** → PASS.
- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/steps/transcribe.ts src/lib/pipeline/steps/index.ts tests/unit/pipeline/transcribe-step.test.ts
git commit -m "feat(pipeline): batched transcribe step"
```

---

## Task 11: Sitemap discovery

**Files:**
- Create: `src/lib/pipeline/sitemap.ts`
- Test: `tests/unit/pipeline/sitemap.test.ts`

**Interfaces:**
- Produces: `discoverSitemapUrls(siteUrl: string): Promise<string[]>` — fetches `/sitemap.xml`, follows `<sitemapindex>` children (and `.gz`), returns a de-duplicated, same-host list of page `<loc>` URLs. Returns `[]` if no sitemap (caller falls back to BFS seed).

- [ ] **Step 1: Write the failing test** (mock fetch)

```typescript
// tests/unit/pipeline/sitemap.test.ts
import { describe, it, expect, vi } from 'vitest';
describe('discoverSitemapUrls', () => {
  it('parses a urlset and returns same-host locs', async () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://site.com/a</loc></url><url><loc>https://site.com/b</loc></url></urlset>`;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xml, headers: new Map() }) as any;
    const { discoverSitemapUrls } = await import('@/lib/pipeline/sitemap');
    const urls = await discoverSitemapUrls('https://site.com');
    expect(urls).toContain('https://site.com/a');
    expect(urls).toContain('https://site.com/b');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** (use `cheerio` — already a dep — with `xmlMode`)

```typescript
// src/lib/pipeline/sitemap.ts
import * as cheerio from 'cheerio';

async function fetchXml(url: string): Promise<string | null> {
  try { const r = await fetch(url, { headers: { 'user-agent': 'BestieBot/1.0' } }); if (!r.ok) return null; return await r.text(); }
  catch { return null; }
}

export async function discoverSitemapUrls(siteUrl: string): Promise<string[]> {
  const origin = new URL(siteUrl).origin;
  const host = new URL(siteUrl).host;
  const seen = new Set<string>();
  const out = new Set<string>();
  const queue = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  while (queue.length) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue; seen.add(sm);
    const xml = await fetchXml(sm);
    if (!xml) continue;
    const $ = cheerio.load(xml, { xmlMode: true });
    // nested sitemaps
    $('sitemap > loc').each((_, el) => { const u = $(el).text().trim(); if (u) queue.push(u); });
    // page urls
    $('url > loc').each((_, el) => {
      const u = $(el).text().trim();
      try { if (u && new URL(u).host === host) out.add(u); } catch { /* skip */ }
    });
  }
  return [...out];
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/sitemap.ts tests/unit/pipeline/sitemap.test.ts
git commit -m "feat(pipeline): sitemap discovery (index+nested, same-host)"
```

---

## Task 12: Step `site-discover` (build frontier)

**Files:**
- Create: `src/lib/pipeline/steps/site-discover.ts`
- Modify: `src/lib/pipeline/steps/index.ts`
- Test: `tests/unit/pipeline/site-discover-step.test.ts`

**Interfaces:**
- Consumes: `discoverSitemapUrls` (Task 11); `pushFrontier`, `setCount` (Task 5).
- Produces: `siteDiscoverStep: StepHandler` — if no `state.websiteUrl` → `advance` (skip crawl entirely). Else discover urls, apply `state.options.maxPages` cap if set, `pushFrontier`, `setCount(jobId,'crawl',{done:0,total:urls.length})`, `advance`. If sitemap empty → seed frontier with `[websiteUrl]` (BFS fallback handled by crawl step following on-page links).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/site-discover-step.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/sitemap', () => ({ discoverSitemapUrls: vi.fn().mockResolvedValue(['https://s.com/a','https://s.com/b']) }));
const pushFrontier = vi.fn(); const setCount = vi.fn();
vi.mock('@/lib/pipeline/state', () => ({ pushFrontier, setCount }));
describe('siteDiscoverStep', () => {
  it('skips when no website', async () => {
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');
    const res = await siteDiscoverStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-discover', batch: 0, state: { options: {}, } as any });
    expect(res.status).toBe('advance');
    expect(pushFrontier).not.toHaveBeenCalled();
  });
  it('pushes frontier when website present', async () => {
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');
    const res = await siteDiscoverStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-discover', batch: 0, state: { websiteUrl: 'https://s.com', options: { maxPages: null } } as any });
    expect(pushFrontier).toHaveBeenCalledWith('j1', ['https://s.com/a','https://s.com/b']);
    expect(res.status).toBe('advance');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/lib/pipeline/steps/site-discover.ts
import { discoverSitemapUrls } from '@/lib/pipeline/sitemap';
import { pushFrontier, setCount } from '@/lib/pipeline/state';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function siteDiscoverStep(ctx: StepContext): Promise<StepResult> {
  if (!ctx.state.websiteUrl) return { status: 'advance' };
  let urls = await discoverSitemapUrls(ctx.state.websiteUrl);
  if (urls.length === 0) urls = [ctx.state.websiteUrl]; // BFS fallback seed
  if (ctx.state.options.maxPages && urls.length > ctx.state.options.maxPages) urls = urls.slice(0, ctx.state.options.maxPages);
  await pushFrontier(ctx.jobId, urls);
  await setCount(ctx.jobId, 'crawl', { done: 0, total: urls.length });
  return { status: 'advance' };
}
```

- [ ] **Step 4: Wire into `index.ts`.**
- [ ] **Step 5: Run test** → PASS.
- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/steps/site-discover.ts src/lib/pipeline/steps/index.ts tests/unit/pipeline/site-discover-step.test.ts
git commit -m "feat(pipeline): site-discover builds crawl frontier from sitemap"
```

---

## Task 13: Crawl batch + step `site-crawl`

**Files:**
- Create: `src/lib/pipeline/crawl.ts`
- Create: `src/lib/pipeline/steps/site-crawl.ts`
- Modify: `src/lib/pipeline/steps/index.ts`
- Test: `tests/unit/pipeline/site-crawl-step.test.ts`

**Interfaces:**
- Consumes: `popFrontier`, `frontierSize`, `pushFrontier`, `setCount` (Task 5); a page extractor ported from `scripts/deep-scrape-website.mjs` (fetch → cheerio → save page content + images + products). Reuse the same persistence target the local script writes to (confirm: `website_pages` / `documents` / `widget_products`).
- Produces:
  - `crawlPageBatch(urls: string[], accountId: string): Promise<{ savedPages: number; discoveredLinks: string[] }>`
  - `siteCrawlStep: StepHandler` — pop `BATCH_SIZES['site-crawl']` from frontier, `crawlPageBatch`, push newly-discovered same-host links not yet seen (BFS fallback only when sitemap was empty — guard with a `seen` set), bump `crawl.done`; `re-enqueue` while frontier non-empty, else `advance`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/site-crawl-step.test.ts
import { describe, it, expect, vi } from 'vitest';
const popFrontier = vi.fn().mockResolvedValueOnce(['https://s.com/a']).mockResolvedValue([]);
const frontierSize = vi.fn().mockResolvedValueOnce(0);
vi.mock('@/lib/pipeline/state', () => ({ popFrontier, frontierSize, pushFrontier: vi.fn(), setCount: vi.fn() }));
vi.mock('@/lib/pipeline/crawl', () => ({ crawlPageBatch: vi.fn().mockResolvedValue({ savedPages: 1, discoveredLinks: [] }) }));
describe('siteCrawlStep', () => {
  it('advances when frontier drains', async () => {
    const { siteCrawlStep } = await import('@/lib/pipeline/steps/site-crawl');
    const res = await siteCrawlStep({ jobId: 'j1', accountId: 'a1', username: 'u', step: 'site-crawl', batch: 0, state: { counts: { crawl: { done: 0, total: 1 } }, options: {} } as any });
    expect(res.status).toBe('advance');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement `crawl.ts`** — port the fetch+cheerio extraction from `scripts/deep-scrape-website.mjs` (content text, `<img>` srcs, product detection) and persist to the SAME tables the script uses. Keep this function pure per-batch (no global crawl loop).

```typescript
// src/lib/pipeline/crawl.ts
import * as cheerio from 'cheerio';
import { createClient } from '@/lib/supabase/server';

export async function crawlPageBatch(urls: string[], accountId: string): Promise<{ savedPages: number; discoveredLinks: string[] }> {
  const supabase = await createClient();
  let saved = 0; const links: string[] = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'BestieBot/1.0' } });
      if (!r.ok) continue;
      const html = await r.text();
      const $ = cheerio.load(html);
      const title = $('title').first().text().trim();
      const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20000);
      const images = $('img').map((_, el) => $(el).attr('src')).get().filter(Boolean);
      // persist to the same target the local deep-scrape script uses (confirm table/columns):
      await supabase.from('website_pages').upsert({ account_id: accountId, url, page_title: title, content: text, images }, { onConflict: 'account_id,url' });
      saved++;
      $('a[href]').each((_, el) => { const h = $(el).attr('href'); if (h) links.push(h); });
    } catch { /* skip page */ }
  }
  return { savedPages: saved, discoveredLinks: links };
}
```

> **Implementer note:** match the persistence table/columns to what `scripts/deep-scrape-website.mjs` actually writes (it may target `documents` for RAG and `widget_products` for products). Reuse its extraction helpers rather than re-deriving them.

- [ ] **Step 4: Implement `site-crawl.ts`**

```typescript
// src/lib/pipeline/steps/site-crawl.ts
import { popFrontier, frontierSize, setCount } from '@/lib/pipeline/state';
import { crawlPageBatch } from '@/lib/pipeline/crawl';
import { BATCH_SIZES } from '../types';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function siteCrawlStep(ctx: StepContext): Promise<StepResult> {
  const batchUrls = await popFrontier(ctx.jobId, BATCH_SIZES['site-crawl']);
  if (batchUrls.length === 0) return { status: 'advance' };
  await crawlPageBatch(batchUrls, ctx.accountId);
  const prevDone = ctx.state.counts?.crawl?.done ?? 0;
  const total = ctx.state.counts?.crawl?.total ?? batchUrls.length;
  await setCount(ctx.jobId, 'crawl', { done: prevDone + batchUrls.length, total });
  const remaining = await frontierSize(ctx.jobId);
  return remaining > 0 ? { status: 're-enqueue' } : { status: 'advance' };
}
```

- [ ] **Step 5: Wire into `index.ts`.**
- [ ] **Step 6: Run test** → PASS.
- [ ] **Step 7: Commit**

```bash
git add src/lib/pipeline/crawl.ts src/lib/pipeline/steps/site-crawl.ts src/lib/pipeline/steps/index.ts tests/unit/pipeline/site-crawl-step.test.ts
git commit -m "feat(pipeline): batched site-crawl with frontier drain"
```

---

## Task 14: Steps `rag-ingest`, `product-extract`, `persona-build`, `finalize`

**Files:**
- Create: `src/lib/pipeline/steps/rag-ingest.ts`, `product-extract.ts`, `persona-build.ts`, `finalize.ts`
- Modify: `src/lib/pipeline/steps/index.ts`
- Test: `tests/unit/pipeline/finalize-step.test.ts`

**Interfaces:**
- `ragIngestStep` — reuse `processAccountContent({ accountId, scanJobId, transcribeVideos: false, buildRagIndex: true, buildPersona: false })` (RAG only; transcription already done in Task 10) OR the direct `rag/ingest` + `rag/enrich` calls. `advance` on completion.
- `productExtractStep` — if no `state.websiteUrl` → `advance`. Else reuse `extract-products-from-rag` + `enrich-products` + `persist-product-images` logic (import the library functions those scripts call). `advance`.
- `personaBuildStep` — reuse the persona builder used by `setup-account.ts` step 6 (`buildPersonaWithGemini`/GPT-5.4 from `preprocessing_data`). `advance`.
- `finalizeStep` — generate tab config (`generateTabConfig`), run the **config-wipe guard**: reload `accounts.config`, if any of `username/display_name/archetype/website_url` are missing, merge them back (read-modify-write); ensure `config.isDemo` matches `state.options.isDemo`. `advance`.

- [ ] **Step 1: Write the failing test (finalize guard)**

```typescript
// tests/unit/pipeline/finalize-step.test.ts
import { describe, it, expect, vi } from 'vitest';
const updated: any[] = [];
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { config: { avatar_url: 'x' } } }) }) }),
    update: (patch: any) => ({ eq: async () => { updated.push(patch); return {}; } }),
  }),
}) }));
vi.mock('@/lib/chat-ui/generate-tab-config', () => ({ generateTabConfig: vi.fn().mockResolvedValue(undefined) }), { virtual: true });
describe('finalizeStep', () => {
  it('merges identity back into config (guard) and sets isDemo', async () => {
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    const res = await finalizeStep({ jobId: 'j1', accountId: 'a1', username: 'carolinalemkeberlin.il', step: 'finalize', batch: 0, state: { websiteUrl: 'https://carolinalemke.co.il', options: { isDemo: true } } as any });
    const cfg = updated.find(p => p.config)?.config;
    expect(cfg.username).toBe('carolinalemkeberlin.il');
    expect(cfg.isDemo).toBe(true);
    expect(res.status).toBe('advance');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement `finalize.ts`**

```typescript
// src/lib/pipeline/steps/finalize.ts
import { createClient } from '@/lib/supabase/server';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function finalizeStep(ctx: StepContext): Promise<StepResult> {
  const supabase = await createClient();
  const { data } = await supabase.from('accounts').select('config').eq('id', ctx.accountId).single();
  const cfg = { ...(data?.config ?? {}) };
  // config-wipe guard — merge identity back, never overwrite
  if (!cfg.username) cfg.username = ctx.username;
  if (!cfg.display_name) cfg.display_name = cfg.username || ctx.username;
  if (ctx.state.websiteUrl && !cfg.website_url) cfg.website_url = ctx.state.websiteUrl;
  cfg.isDemo = ctx.state.options.isDemo;
  await supabase.from('accounts').update({ config: cfg }).eq('id', ctx.accountId);
  // tab config generation (reuse existing generator)
  try { const { generateTabConfig } = await import('@/lib/chat-ui/generate-tab-config'); await generateTabConfig(ctx.accountId); } catch { /* generator optional */ }
  return { status: 'advance' };
}
```

- [ ] **Step 4: Implement `rag-ingest.ts`, `product-extract.ts`, `persona-build.ts`** — each reuses the existing library functions (see interfaces above). Each returns `{ status: 'advance' }` on success and throws on hard failure (the run route catches → marks failed). Confirm the exact exported function names against `src/lib/processing/content-processor-orchestrator.ts`, `scripts/extract-products-from-rag.ts`, and `setup-account.ts` step 6, and call those library functions (not the CLI scripts).

- [ ] **Step 5: Wire all four into `index.ts`.**
- [ ] **Step 6: Run test** → PASS. Then `npm run type-check`.
- [ ] **Step 7: Commit**

```bash
git add src/lib/pipeline/steps tests/unit/pipeline/finalize-step.test.ts
git commit -m "feat(pipeline): rag-ingest, product-extract, persona-build, finalize steps"
```

---

## Task 15: Admin add form → trigger pipeline

**Files:**
- Modify: `src/app/admin/add/page.tsx`
- Test: manual (UI) — no unit test (thin form).

**Interfaces:**
- Consumes: `POST /api/pipeline/start`.

- [ ] **Step 1:** Add form fields: website URL (optional), demo toggle (default checked), advanced collapsible (posts limit number, transcribe checkbox, max pages number/blank). Keep the existing username/displayName create logic; after the account row is created (existing `POST /api/admin/accounts`), call:

```typescript
const startRes = await fetch('/api/pipeline/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: trimmed, accountId: data.accountId, websiteUrl: websiteUrl || undefined, isDemo, transcribe, maxPages: maxPages ? Number(maxPages) : null }),
});
const { jobId } = await startRes.json();
router.push(`/admin/scan/${jobId}`);
```

- [ ] **Step 2:** Run `npm run type-check` and `npm run dev`, load `/admin/add`, confirm the form renders and submit navigates to `/admin/scan/<jobId>`.
- [ ] **Step 3: Commit**

```bash
git add src/app/admin/add/page.tsx
git commit -m "feat(admin): add-account form triggers scan pipeline"
```

---

## Task 16: Live progress board

**Files:**
- Create: `src/app/admin/scan/[jobId]/page.tsx`
- Create: `src/app/admin/scan/[jobId]/StepBoard.tsx`
- Test: manual (UI).

**Interfaces:**
- Consumes: `GET /api/pipeline/status/[jobId]`.

- [ ] **Step 1: Implement `StepBoard.tsx`** (client component, polls every 2.5s)

```tsx
'use client';
import { useEffect, useState } from 'react';

const STEP_LABELS: Record<string, string> = {
  'create-account': 'יצירת חשבון', 'ig-scan': 'סריקת אינסטגרם', 'transcribe': 'תמלול וידאו',
  'site-discover': 'איתור עמודי אתר', 'site-crawl': 'סריקת אתר', 'rag-ingest': 'אינדוקס RAG',
  'product-extract': 'חילוץ מוצרים', 'persona-build': 'בניית פרסונה', 'finalize': 'סיום והגדרות',
};
const ORDER = Object.keys(STEP_LABELS);

export default function StepBoard({ jobId }: { jobId: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/pipeline/status/${jobId}`); const j = await r.json();
      if (alive) setData(j);
      if (alive && j.status !== 'succeeded' && j.status !== 'failed') setTimeout(tick, 2500);
    };
    tick(); return () => { alive = false; };
  }, [jobId]);
  if (!data) return <div>טוען…</div>;
  const latest = (step: string) => [...(data.steps ?? [])].reverse().find((s: any) => s.step === step);
  return (
    <div dir="rtl">
      <h1>סטטוס סריקה — {data.status}</h1>
      {ORDER.map(step => {
        const log = latest(step); const c = data.counts?.[step === 'site-crawl' ? 'crawl' : step];
        const status = log?.status ?? 'pending';
        return (
          <div key={step} style={{ display: 'flex', gap: 8, padding: 8 }}>
            <span>{status === 'completed' ? '✓' : status === 'running' ? '⏳' : status === 'failed' ? '✗' : '•'}</span>
            <span>{STEP_LABELS[step]}</span>
            {c && <span>{c.done}/{c.total}</span>}
            {status === 'failed' && <span style={{ color: 'red' }}>{log?.message}</span>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement `page.tsx`**

```tsx
import StepBoard from './StepBoard';
export default async function ScanBoardPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <StepBoard jobId={jobId} />;
}
```

- [ ] **Step 3:** `npm run dev`, visit `/admin/scan/<jobId>`, confirm the board renders + polls.
- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/scan/[jobId]/page.tsx" "src/app/admin/scan/[jobId]/StepBoard.tsx"
git commit -m "feat(admin): live pipeline progress board"
```

---

## Task 17: End-to-end acceptance — Carolina Lemke on prod

**Files:** none (operational).

- [ ] **Step 1:** Ensure `main` is deployed to Vercel (pipeline routes + model fix live). Confirm the deploy finished.
- [ ] **Step 2:** Trigger via admin UI (`/admin/add`) OR curl:

```bash
curl -s -X POST https://influencers-bot.vercel.app/api/pipeline/start \
  -H "Authorization: Bearer $CRON_SECRET" -H 'Content-Type: application/json' \
  -d '{"username":"carolinalemkeberlin.il","accountId":"a9d1501a-af17-4a74-8198-6d2257b890f9","websiteUrl":"https://www.carolinalemke.co.il/","isDemo":true}'
```

(If `/api/pipeline/start` requires an admin cookie rather than `CRON_SECRET`, add a `CRON_SECRET` bypass to it like `admin/full-scan` has, or trigger from the UI while logged in.)

- [ ] **Step 3:** Watch `/admin/scan/<jobId>` until all 9 steps are `completed`.
- [ ] **Step 4:** Verify via SQL: persona exists, RAG chunks > 0, posts = 50, transcriptions > 0, `widget_products` populated, `accounts.config.isDemo = true`, tabs set.
- [ ] **Step 5:** Confirm the chat page + widget render for Carolina.

---

## Self-Review

**Spec coverage:** create-account (T6), ig-scan (T9), transcribe (T10), sitemap full-crawl no-cap (T11–13), rag-ingest/product-extract/persona/finalize (T14), QStash chaining + signature verify + mutex idempotency (T4,5,7), live board (T16), config-wipe guard (T14 finalize), Carolina acceptance (T17), status/start routes (T8). All spec sections mapped.

**Placeholder scan:** The three "implementer note" callouts (transcribe columns, crawl persistence target, reuse of extract/persona library fns) point to *existing code to mirror*, not undefined work — the implementer confirms exact export names against named files. These are integration-binding notes, acceptable, but the executing agent must resolve them by reading the referenced files, not invent.

**Type consistency:** `StepResult`/`StepHandler`/`StepContext`/`PipelineState`/`PipelineStep` names consistent across tasks; `publishStep`/`verifyQStashSignature`/`acquireStepLock`/`loadState`/`saveState`/`setCount`/`popFrontier`/`frontierSize`/`discoverSitemapUrls`/`crawlPageBatch` signatures match their consuming call-sites.

**Open bindings the executor MUST resolve by reading code (not guess):**
1. Exact transcriber export + `instagram_posts` video/transcription columns (Task 10).
2. Where `deep-scrape-website.mjs` persists pages/products (Task 13 `crawl.ts`).
3. Exact library fns for rag-ingest / product-extract / persona-build (Task 14).
4. `src/lib/redis.ts` client accessor + `redisSet` signature (Tasks 1, 5).
