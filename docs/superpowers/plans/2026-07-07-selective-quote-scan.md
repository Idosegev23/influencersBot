# Selective Quote Scan + Website-Only Accounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "quote" scan mode — discover a site's sitemap, AI-label its sections, let the admin pick a bounded slice, and run a cheap pre-sales demo scan (chat + products + branding); plus website-only accounts and enrich-to-full.

**Architecture:** A fast `POST /api/pipeline/discover` pre-step returns AI-labelled path categories (no job). The `/admin/add` form gains a mode selector; quote mode sends `categories:[{pathPattern,cap}]` to `/api/pipeline/start`. The existing 9-step QStash pipeline gains: category-bounded `site-discover`, IG-optional `ig-scan`/`transcribe`, a website-only persona branch, and `scan_mode` marking in `finalize`. Regular mode either enriches an existing quote account (full scope, same accountId) or starts fresh.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role), Upstash Redis, OpenAI (`src/lib/openai.ts` `chat`), existing pipeline in `src/lib/pipeline/`.

## Global Constraints

- Node 22 for local scripts/tests (`~/.nvm/versions/node/v22.22.2/bin`). Run tests with `npx vitest run <file>`. Type-check `npm run type-check` (ignore pre-existing `promo-video/` errors).
- Path alias `@/*` → `./src/*`. Supabase server client: `import { createClient } from '@/lib/supabase/server'`.
- Auth on new mutating routes: admin cookie OR `Bearer CRON_SECRET` (mirror `/api/pipeline/start`).
- Config writes are read-modify-write MERGES, never overwrite.
- Do NOT reintroduce `gemini-3-flash-preview`. Chat/labelling uses OpenAI `chat()` from `src/lib/openai.ts`.
- Category absent in `pipeline_state.options` ⇒ full scope (current behaviour). Never change full-scan behaviour when `categories` is undefined.

## File Structure

**New:**
- `src/lib/pipeline/discover.ts` — `groupUrlsByPath`, `labelCategories`, `discoverCategories`.
- `src/app/api/pipeline/discover/route.ts` — POST endpoint + Redis cache.
- `src/lib/ai/persona-from-website.ts` — `buildPersonaFromWebsite(accountId)` (lift of gov-ministry logic).

**Modify:**
- `src/lib/pipeline/types.ts` — add `categories` + `scanMode` to `PipelineOptions`.
- `src/lib/pipeline/steps/site-discover.ts` — honour `options.categories`.
- `src/lib/pipeline/steps/ig-scan.ts`, `transcribe.ts` — skip when no IG username.
- `src/lib/pipeline/steps/create-account.ts` — domain anchor when no IG.
- `src/lib/pipeline/steps/persona-build.ts` — website branch when no IG content.
- `src/lib/pipeline/steps/finalize.ts` — write `scan_mode` + `scanned_categories` + best-effort branding.
- `src/app/api/pipeline/start/route.ts` — accept `scanMode`, `categories`.
- `src/app/admin/add/page.tsx` — mode selector, optional IG, discover button + category table, enrich list.

---

## Task 1: URL path grouping

**Files:**
- Create: `src/lib/pipeline/discover.ts`
- Test: `tests/unit/pipeline/discover-group.test.ts`

**Interfaces:**
- Produces: `interface UrlGroup { pathPattern: string; count: number; sampleUrls: string[] }` and `groupUrlsByPath(urls: string[]): UrlGroup[]` — groups by first path segment; URLs whose path is a single segment (root slugs like `/cl3606-01`) collapse into a `'/'` (root items) group. Sorted by count desc. `sampleUrls` ≤ 5 per group.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/discover-group.test.ts
import { describe, it, expect } from 'vitest';
import { groupUrlsByPath } from '@/lib/pipeline/discover';

describe('groupUrlsByPath', () => {
  it('groups by first path segment; root slugs collapse to "/"', () => {
    const urls = [
      'https://s.com/cl3606-01', 'https://s.com/cl9414-02', 'https://s.com/841313198035',
      'https://s.com/magazine/a', 'https://s.com/magazine/b', 'https://s.com/optic/x',
    ];
    const groups = groupUrlsByPath(urls);
    const byPattern = Object.fromEntries(groups.map(g => [g.pathPattern, g.count]));
    expect(byPattern['/']).toBe(3);          // root SKU slugs
    expect(byPattern['/magazine']).toBe(2);
    expect(byPattern['/optic']).toBe(1);
    expect(groups[0].count).toBeGreaterThanOrEqual(groups[1].count); // sorted desc
    expect(groups.find(g => g.pathPattern === '/')!.sampleUrls.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test** → FAIL (module missing). `npx vitest run tests/unit/pipeline/discover-group.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/pipeline/discover.ts
export interface UrlGroup { pathPattern: string; count: number; sampleUrls: string[] }

export function groupUrlsByPath(urls: string[]): UrlGroup[] {
  const map = new Map<string, string[]>();
  for (const u of urls) {
    let path: string;
    try { path = new URL(u).pathname; } catch { continue; }
    const segs = path.split('/').filter(Boolean);
    const pattern = segs.length <= 1 ? '/' : `/${segs[0]}`;
    if (!map.has(pattern)) map.set(pattern, []);
    map.get(pattern)!.push(u);
  }
  return [...map.entries()]
    .map(([pathPattern, list]) => ({ pathPattern, count: list.length, sampleUrls: list.slice(0, 5) }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/discover.ts tests/unit/pipeline/discover-group.test.ts
git commit -m "feat(discover): group sitemap URLs by path segment"
```

---

## Task 2: AI category labelling + discoverCategories

**Files:**
- Modify: `src/lib/pipeline/discover.ts`
- Test: `tests/unit/pipeline/discover-label.test.ts`

**Interfaces:**
- Consumes: `groupUrlsByPath` (Task 1); OpenAI `chat` from `src/lib/openai.ts` (confirm its exact signature/return by reading the file — it is `export async function chat(...)` around line 462).
- Produces:
  - `interface Category { id: string; pathPattern: string; label: string; type: 'products'|'articles'|'info'|'legal'|'other'; count: number; sampleUrls: string[] }`
  - `labelCategories(groups: UrlGroup[]): Promise<Category[]>` — one LLM call; maps each group to `{label(he), type}`; on LLM failure falls back to `label = pathPattern`, `type = 'other'`.
  - `discoverCategories(websiteUrl: string): Promise<{ domain: string; noSitemap: boolean; categories: Category[] }>` — calls `discoverSitemapUrls` (`src/lib/pipeline/sitemap.ts`), groups, labels. `noSitemap: true` + empty categories when the sitemap yields nothing.

- [ ] **Step 1: Write the failing test** (mock openai + sitemap)

```typescript
// tests/unit/pipeline/discover-label.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/openai', () => ({ chat: vi.fn().mockResolvedValue(JSON.stringify([
  { pathPattern: '/', label: 'מוצרים', type: 'products' },
  { pathPattern: '/magazine', label: 'מגזין', type: 'articles' },
])) }));
vi.mock('@/lib/pipeline/sitemap', () => ({ discoverSitemapUrls: vi.fn().mockResolvedValue([
  'https://s.com/cl1', 'https://s.com/cl2', 'https://s.com/magazine/a',
]) }));

describe('discoverCategories', () => {
  it('returns labelled categories from the sitemap', async () => {
    const { discoverCategories } = await import('@/lib/pipeline/discover');
    const res = await discoverCategories('https://s.com');
    expect(res.noSitemap).toBe(false);
    const products = res.categories.find(c => c.pathPattern === '/');
    expect(products?.label).toBe('מוצרים');
    expect(products?.type).toBe('products');
    expect(products?.count).toBe(2);
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** (append to `discover.ts`; confirm `chat()`'s real call shape against `src/lib/openai.ts` — it may take `(messages)` or `(system, user)`; adapt the call and JSON-parse the reply)

```typescript
// src/lib/pipeline/discover.ts  (append)
import { discoverSitemapUrls } from '@/lib/pipeline/sitemap';
import { chat } from '@/lib/openai';

export interface Category { id: string; pathPattern: string; label: string; type: 'products'|'articles'|'info'|'legal'|'other'; count: number; sampleUrls: string[] }

export async function labelCategories(groups: UrlGroup[]): Promise<Category[]> {
  const prompt = `אתה מקבל קבוצות URL מאתר. לכל קבוצה תן תווית קצרה בעברית וסוג.
סוגים: products, articles, info, legal, other.
החזר JSON array בלבד: [{"pathPattern","label","type"}].
קבוצות:\n${groups.map(g => `${g.pathPattern} (${g.count}) דוגמאות: ${g.sampleUrls.join(', ')}`).join('\n')}`;
  let labels: Record<string, { label: string; type: Category['type'] }> = {};
  try {
    const reply = await chat(prompt); // confirm chat() signature in src/lib/openai.ts
    const arr = JSON.parse(reply.replace(/```json|```/g, '').trim());
    for (const x of arr) labels[x.pathPattern] = { label: x.label, type: x.type };
  } catch { /* fall back to raw patterns below */ }
  return groups.map(g => ({
    id: g.pathPattern,
    pathPattern: g.pathPattern,
    label: labels[g.pathPattern]?.label || g.pathPattern,
    type: labels[g.pathPattern]?.type || 'other',
    count: g.count,
    sampleUrls: g.sampleUrls,
  }));
}

export async function discoverCategories(websiteUrl: string): Promise<{ domain: string; noSitemap: boolean; categories: Category[] }> {
  const domain = new URL(websiteUrl).host;
  const urls = await discoverSitemapUrls(websiteUrl);
  if (!urls.length) return { domain, noSitemap: true, categories: [] };
  const categories = await labelCategories(groupUrlsByPath(urls));
  return { domain, noSitemap: false, categories };
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/discover.ts tests/unit/pipeline/discover-label.test.ts
git commit -m "feat(discover): AI-label path groups into categories"
```

---

## Task 3: Discover endpoint + Redis cache

**Files:**
- Create: `src/app/api/pipeline/discover/route.ts`
- Test: `tests/unit/pipeline/discover-route.test.ts`

**Interfaces:**
- Consumes: `discoverCategories` (Task 2); `requireAdminAuth`; `redisGet`/`redisSet` (`@/lib/redis`).
- Produces: `POST /api/pipeline/discover` body `{ websiteUrl, refresh? }` → auth (admin or CRON_SECRET) → cache `discover:{domain}` (TTL 3600) unless `refresh` → returns `discoverCategories` result.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/discover-route.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
vi.mock('@/lib/redis', () => ({ redisGet: vi.fn().mockResolvedValue(null), redisSet: vi.fn() }));
vi.mock('@/lib/pipeline/discover', () => ({ discoverCategories: vi.fn().mockResolvedValue({ domain: 's.com', noSitemap: false, categories: [{ id: '/', pathPattern: '/', label: 'מוצרים', type: 'products', count: 2, sampleUrls: [] }] }) }));
describe('POST /api/pipeline/discover', () => {
  it('returns categories', async () => {
    const { POST } = await import('@/app/api/pipeline/discover/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ websiteUrl: 'https://s.com' }) });
    const json = await (await POST(req as any)).json();
    expect(json.categories[0].label).toBe('מוצרים');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/app/api/pipeline/discover/route.ts
import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { discoverCategories } from '@/lib/pipeline/discover';
import { redisGet, redisSet } from '@/lib/redis';

export const maxDuration = 60;

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const hasCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!hasCron) { const denied = await requireAdminAuth(); if (denied) return denied; }

  const { websiteUrl, refresh } = await req.json();
  if (!websiteUrl) return NextResponse.json({ error: 'websiteUrl required' }, { status: 400 });
  let domain: string;
  try { domain = new URL(websiteUrl).host; } catch { return NextResponse.json({ error: 'bad url' }, { status: 400 }); }

  const cacheKey = `discover:${domain}`;
  if (!refresh) { const cached = await redisGet<any>(cacheKey); if (cached) return NextResponse.json({ ...cached, cached: true }); }
  const result = await discoverCategories(websiteUrl);
  await redisSet(cacheKey, JSON.stringify(result), 3600); // confirm redisSet signature (key,value,ttlSeconds) in src/lib/redis.ts
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add "src/app/api/pipeline/discover/route.ts" tests/unit/pipeline/discover-route.test.ts
git commit -m "feat(discover): /api/pipeline/discover endpoint + redis cache"
```

---

## Task 4: PipelineOptions.categories + scanMode

**Files:**
- Modify: `src/lib/pipeline/types.ts`
- Test: `tests/unit/pipeline/types.test.ts` (extend)

**Interfaces:**
- Produces: `PipelineOptions` gains `categories?: { pathPattern: string; cap: number }[]` and `scanMode?: 'quote' | 'full'`.

- [ ] **Step 1: Write the failing test** (append)

```typescript
// tests/unit/pipeline/types.test.ts  (add)
import { STEP_ORDER } from '@/lib/pipeline/types';
it('PipelineOptions type accepts categories + scanMode (compile check)', () => {
  const opts: import('@/lib/pipeline/types').PipelineOptions = { transcribe: true, maxPages: null, postsLimit: 50, isDemo: true, scanMode: 'quote', categories: [{ pathPattern: '/', cap: 30 }] };
  expect(opts.categories?.[0].cap).toBe(30);
});
```

- [ ] **Step 2: Run test** → FAIL (type error / property missing).

- [ ] **Step 3: Implement**

```typescript
// src/lib/pipeline/types.ts — extend PipelineOptions
export interface PipelineOptions {
  transcribe: boolean;
  maxPages: number | null;
  postsLimit: number;
  isDemo: boolean;
  archetype?: string;
  scanMode?: 'quote' | 'full';
  categories?: { pathPattern: string; cap: number }[];
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/types.ts tests/unit/pipeline/types.test.ts
git commit -m "feat(pipeline): PipelineOptions gains categories + scanMode"
```

---

## Task 5: Category-bounded site-discover

**Files:**
- Modify: `src/lib/pipeline/steps/site-discover.ts`
- Test: `tests/unit/pipeline/site-discover-categories.test.ts`

**Interfaces:**
- Consumes: `discoverSitemapUrls`, `pushFrontier`, `setCount`, `groupUrlsByPath` (Task 1), `PipelineOptions.categories`.
- Behaviour: when `ctx.state.options.categories` present, filter sitemap URLs to selected `pathPattern`s and take first `cap` per group (cap 0 excluded); else current full behaviour.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/site-discover-categories.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/sitemap', () => ({ discoverSitemapUrls: vi.fn().mockResolvedValue([
  'https://s.com/cl1','https://s.com/cl2','https://s.com/cl3','https://s.com/magazine/a','https://s.com/legal/x',
]) }));
const pushed: string[][] = [];
vi.mock('@/lib/pipeline/state', () => ({ pushFrontier: vi.fn(async (_j: string, urls: string[]) => { pushed.push(urls); }), setCount: vi.fn(), popFrontier: vi.fn(), frontierSize: vi.fn() }));
describe('siteDiscoverStep with categories', () => {
  it('keeps only selected patterns and applies caps', async () => {
    const { siteDiscoverStep } = await import('@/lib/pipeline/steps/site-discover');
    await siteDiscoverStep({ jobId: 'j', accountId: 'a', username: 'u', step: 'site-discover', batch: 0, state: { websiteUrl: 'https://s.com', options: { categories: [{ pathPattern: '/', cap: 2 }, { pathPattern: '/legal', cap: 0 }] } } as any });
    const urls = pushed[0];
    expect(urls.filter(u => u.includes('/cl')).length).toBe(2); // capped
    expect(urls.some(u => u.includes('/magazine'))).toBe(false); // not selected
    expect(urls.some(u => u.includes('/legal'))).toBe(false);    // cap 0
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** (replace the body of `siteDiscoverStep`; keep the no-website + full-scope branches)

```typescript
// src/lib/pipeline/steps/site-discover.ts
import { discoverSitemapUrls } from '@/lib/pipeline/sitemap';
import { pushFrontier, setCount } from '@/lib/pipeline/state';
import { groupUrlsByPath } from '@/lib/pipeline/discover';
import type { StepContext } from '../types';
import type { StepResult } from './index';

export async function siteDiscoverStep(ctx: StepContext): Promise<StepResult> {
  if (!ctx.state.websiteUrl) return { status: 'advance' };
  let urls = await discoverSitemapUrls(ctx.state.websiteUrl);
  if (urls.length === 0) urls = [ctx.state.websiteUrl];

  const categories = ctx.state.options.categories;
  if (categories && categories.length) {
    const capByPattern = new Map(categories.map(c => [c.pathPattern, c.cap]));
    const groups = groupUrlsByPath(urls);
    const selected: string[] = [];
    for (const g of groups) {
      const cap = capByPattern.get(g.pathPattern);
      if (cap === undefined || cap <= 0) continue; // not selected / excluded
      // re-collect all urls for this pattern (groups only keep 5 samples), then cap
      const all = urls.filter(u => { try { const s = new URL(u).pathname.split('/').filter(Boolean); return (s.length <= 1 ? '/' : `/${s[0]}`) === g.pathPattern; } catch { return false; } });
      selected.push(...all.slice(0, cap));
    }
    urls = selected;
  } else if (ctx.state.options.maxPages && urls.length > ctx.state.options.maxPages) {
    urls = urls.slice(0, ctx.state.options.maxPages);
  }

  await pushFrontier(ctx.jobId, urls);
  await setCount(ctx.jobId, 'crawl', { done: 0, total: urls.length });
  return { status: 'advance' };
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/steps/site-discover.ts tests/unit/pipeline/site-discover-categories.test.ts
git commit -m "feat(pipeline): category-bounded site-discover"
```

---

## Task 6: IG-optional (skip ig-scan/transcribe, domain anchor)

**Files:**
- Modify: `src/lib/pipeline/steps/ig-scan.ts`, `src/lib/pipeline/steps/transcribe.ts`, `src/lib/pipeline/steps/create-account.ts`
- Test: `tests/unit/pipeline/ig-optional.test.ts`

**Interfaces:**
- Behaviour: a "no IG" account is signalled by `ctx.username` equalling the website host (domain anchor) or being empty. Use a shared helper `hasInstagram(ctx)` = `!!ctx.username && ctx.username !== new URL(ctx.state.websiteUrl||'http://x').host`. When false, `ig-scan` and `transcribe` return `{status:'advance'}` immediately. `create-account` sets `config.username` = domain when no IG username was supplied (start route passes `username` = domain for website-only).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/ig-optional.test.ts
import { describe, it, expect, vi } from 'vitest';
const runScanJob = vi.fn();
vi.mock('@/lib/scraping/runScanJob', () => ({ runScanJob }));
vi.mock('@/lib/pipeline/state', () => ({ saveState: vi.fn(), setCount: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: {} } }) }) }) }) }) }));
describe('ig-scan skip when website-only', () => {
  it('advances without running the scan when username == domain', async () => {
    const { igScanStep } = await import('@/lib/pipeline/steps/ig-scan');
    const res = await igScanStep({ jobId: 'j', accountId: 'a', username: 's.com', step: 'ig-scan', batch: 0, state: { websiteUrl: 'https://s.com', options: {} } as any });
    expect(runScanJob).not.toHaveBeenCalled();
    expect(res.status).toBe('advance');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** — add a shared guard in `src/lib/pipeline/steps/index.ts` (or a small util) `export function hasInstagram(ctx: StepContext): boolean`, and guard `igScanStep`/`transcribeStep` with `if (!hasInstagram(ctx)) return { status: 'advance' };` at the top. Confirm `create-account.ts` already sets `config.username = ctx.username` (it does); no change needed there beyond ensuring it doesn't require a real IG handle.

```typescript
// src/lib/pipeline/steps/index.ts  (add)
import type { StepContext } from '../types';
export function hasInstagram(ctx: StepContext): boolean {
  if (!ctx.username) return false;
  try { return ctx.username !== new URL(ctx.state.websiteUrl || 'http://x.invalid').host; } catch { return true; }
}
```

Add to `ig-scan.ts` and `transcribe.ts` top: `import { hasInstagram } from './index';` then `if (!hasInstagram(ctx)) return { status: 'advance' };`.

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/steps/ig-scan.ts src/lib/pipeline/steps/transcribe.ts src/lib/pipeline/steps/index.ts src/lib/pipeline/steps/create-account.ts tests/unit/pipeline/ig-optional.test.ts
git commit -m "feat(pipeline): IG-optional (skip ig-scan/transcribe for website-only)"
```

---

## Task 7: Website-only persona

**Files:**
- Create: `src/lib/ai/persona-from-website.ts`
- Modify: `src/lib/pipeline/steps/persona-build.ts`
- Test: `tests/unit/pipeline/persona-website.test.ts`

**Interfaces:**
- Produces: `buildPersonaFromWebsite(accountId: string): Promise<boolean>` — reads `instagram_bio_websites` for the account, calls OpenAI (`chat` from `@/lib/openai`, or the `/v1/responses` gpt-5.4 pattern from `scripts/build-gov-ministry-persona.mjs` — lift that logic), upserts `chatbot_persona` (requires `name` NOT NULL) with `preprocessing_data`-compatible content; returns true on success. Confirm the exact prompt + upsert shape against `scripts/build-gov-ministry-persona.mjs`.
- `persona-build.ts`: if `hasInstagram(ctx)` and posts exist → existing `preprocessInstagramData` path; else → `buildPersonaFromWebsite(ctx.accountId)`.

- [ ] **Step 1: Write the failing test** (mock supabase + openai)

```typescript
// tests/unit/pipeline/persona-website.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/steps/index', () => ({ hasInstagram: () => false }));
const buildFromWeb = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/ai/persona-from-website', () => ({ buildPersonaFromWebsite: buildFromWeb }));
vi.mock('@/lib/scraping/preprocessing', () => ({ preprocessInstagramData: vi.fn() }));
vi.mock('@/lib/ai/gemini-persona-builder', () => ({ buildPersonaWithGemini: vi.fn(), savePersonaToDatabase: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: {} } }) }) }) }) }) }));
describe('persona-build website branch', () => {
  it('uses buildPersonaFromWebsite when no instagram', async () => {
    const { personaBuildStep } = await import('@/lib/pipeline/steps/persona-build');
    const res = await personaBuildStep({ jobId: 'j', accountId: 'a', username: 's.com', step: 'persona-build', batch: 0, state: { websiteUrl: 'https://s.com', options: {} } as any });
    expect(buildFromWeb).toHaveBeenCalledWith('a');
    expect(res.status).toBe('advance');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** `persona-from-website.ts` by lifting `scripts/build-gov-ministry-persona.mjs` (read `instagram_bio_websites`, build a persona JSON via gpt-5.4, upsert `chatbot_persona` with a non-null `name`). Then branch `persona-build.ts`:

```typescript
// src/lib/pipeline/steps/persona-build.ts  (top of function)
import { hasInstagram } from './index';
import { buildPersonaFromWebsite } from '@/lib/ai/persona-from-website';
// ...
export async function personaBuildStep(ctx: StepContext): Promise<StepResult> {
  if (!hasInstagram(ctx)) {
    await buildPersonaFromWebsite(ctx.accountId);
    return { status: 'advance' };
  }
  // ...existing preprocessInstagramData + buildPersonaWithGemini path...
}
```

- [ ] **Step 4: Run test** → PASS. Then `npm run type-check`.
- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/persona-from-website.ts src/lib/pipeline/steps/persona-build.ts tests/unit/pipeline/persona-website.test.ts
git commit -m "feat(pipeline): website-only persona branch"
```

---

## Task 8: finalize — scan_mode + scanned_categories + best-effort branding

**Files:**
- Modify: `src/lib/pipeline/steps/finalize.ts`
- Test: `tests/unit/pipeline/finalize-scanmode.test.ts`

**Interfaces:**
- Behaviour: finalize merges `config.scan_mode = ctx.state.options.scanMode || 'full'` and `config.scanned_categories = ctx.state.options.categories ?? []`. Branding: best-effort — read the homepage HTML, `extractImageData` (`@/lib/scraping/image-analyzer`) to pick a logo/`og:image`, set `config.widget.coverImage` if absent; wrapped in try/catch, never fails the step. Keep existing archetype + `generateAndSaveChatConfig` + `generateTabConfig` logic.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/finalize-scanmode.test.ts
import { describe, it, expect, vi } from 'vitest';
const updated: any[] = [];
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: {} } }) }) }), update: (p: any) => ({ eq: async () => { updated.push(p); return {}; } }) }) }) }));
vi.mock('@/lib/chat-ui/generate-tab-config', () => ({ generateTabConfig: vi.fn() }));
vi.mock('@/lib/processing/generate-chat-config', () => ({ generateAndSaveChatConfig: vi.fn() }));
describe('finalize scan_mode', () => {
  it('writes scan_mode and scanned_categories', async () => {
    updated.length = 0;
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    await finalizeStep({ jobId: 'j', accountId: 'a', username: 's.com', step: 'finalize', batch: 0, state: { websiteUrl: 'https://s.com', options: { isDemo: true, scanMode: 'quote', categories: [{ pathPattern: '/', cap: 30 }], archetype: 'brand' } } as any });
    const cfg = updated.find(p => p.config)?.config;
    expect(cfg.scan_mode).toBe('quote');
    expect(cfg.scanned_categories[0].cap).toBe(30);
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** — in `finalize.ts`, after the identity guard + archetype, add:

```typescript
  cfg.scan_mode = ctx.state.options?.scanMode || 'full';
  cfg.scanned_categories = ctx.state.options?.categories ?? [];
```

Keep the existing merge/update + `generateAndSaveChatConfig` + `generateTabConfig`. Add the branding block (best-effort, try/catch) after the config update — fetch homepage, `extractImageData`, set `config.widget.coverImage` if missing.

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/steps/finalize.ts tests/unit/pipeline/finalize-scanmode.test.ts
git commit -m "feat(pipeline): finalize writes scan_mode + scanned_categories (+ branding best-effort)"
```

---

## Task 9: start route — accept scanMode + categories

**Files:**
- Modify: `src/app/api/pipeline/start/route.ts`
- Test: `tests/unit/pipeline/start-categories.test.ts`

**Interfaces:**
- Behaviour: `start` reads `scanMode` (default `'full'`), `categories` (default `undefined`) from the body and puts them into `pipeline_state.options`. Website-only: if `username` is falsy but `websiteUrl` is given, set `username = new URL(websiteUrl).host` (domain anchor).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pipeline/start-categories.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
vi.mock('@/lib/db/repositories/scanJobsRepo', () => ({ getScanJobsRepo: () => ({ create: async () => ({ id: 'job-1' }) }) }));
let savedState: any = null;
vi.mock('@/lib/pipeline/state', () => ({ saveState: vi.fn(async (_id: string, s: any) => { savedState = s; }) }));
vi.mock('@/lib/pipeline/qstash', () => ({ publishStep: vi.fn() }));
describe('start with categories', () => {
  it('threads scanMode+categories and domain-anchors when no IG', async () => {
    const { POST } = await import('@/app/api/pipeline/start/route');
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ accountId: 'a', websiteUrl: 'https://s.com', scanMode: 'quote', categories: [{ pathPattern: '/', cap: 30 }] }) });
    await POST(req as any);
    expect(savedState.options.scanMode).toBe('quote');
    expect(savedState.options.categories[0].cap).toBe(30);
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement** — extend the body destructure with `scanMode = 'full'`, `categories`; add `const uname = username || (websiteUrl ? new URL(websiteUrl).host : undefined);` and validate `uname` exists; pass `scanMode, categories` into `options`.

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/app/api/pipeline/start/route.ts tests/unit/pipeline/start-categories.test.ts
git commit -m "feat(pipeline): start accepts scanMode+categories, domain anchor for website-only"
```

---

## Task 10: Admin add form — mode selector, discover, category table

**Files:**
- Modify: `src/app/admin/add/page.tsx`
- Test: manual (UI).

**Interfaces:** Consumes `POST /api/pipeline/discover`, `POST /api/pipeline/start`.

- [ ] **Step 1:** Add state: `scanMode` ('quote'|'full'), `categories` (from discover), `selections` (Map pathPattern→cap), `discovering`. Add a mode toggle at the top. In quote mode: make IG username optional; add a "גלה מה יש באתר" button → `POST /api/pipeline/discover {websiteUrl}` → render a table (checkbox + label + count + cap number input, smart default caps: products 50, articles/info 10, legal 0). Show running total. "התחל דמו" posts `start` with `scanMode:'quote', categories: selected [{pathPattern,cap}]`.
- [ ] **Step 2:** `npm run type-check`; `npm run dev`; load `/admin/add`, switch to quote mode, discover a test site, confirm categories render + start navigates to the board.
- [ ] **Step 3: Commit**

```bash
git add src/app/admin/add/page.tsx
git commit -m "feat(admin): quote-mode discover + category selection UI"
```

---

## Task 11: Regular mode — enrich list

**Files:**
- Modify: `src/app/admin/add/page.tsx`
- Create: `src/app/api/admin/quote-accounts/route.ts` (GET list of `config.scan_mode='quote'` accounts)
- Test: `tests/unit/admin/quote-accounts.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/quote-accounts` → `[{ accountId, display_name, username, website_url }]` where `config->>scan_mode='quote'`. In regular mode the form lists these; picking one calls `start` with that `accountId`, `scanMode:'full'`, no `categories`; "New full scan" runs the existing full flow.

- [ ] **Step 1: Write the failing test** for the route (mock supabase returning one quote account); assert it returns the mapped list.
- [ ] **Step 2: Run test** → FAIL → implement route (query `accounts` where `config->>scan_mode='quote'`, `requireAdminAuth`) → PASS.
- [ ] **Step 3:** Wire the regular-mode UI: fetch `/api/admin/quote-accounts`, render list with "עַבֵּה" buttons + a "סריקה מלאה חדשה" button.
- [ ] **Step 4:** `npm run type-check`.
- [ ] **Step 5: Commit**

```bash
git add "src/app/api/admin/quote-accounts/route.ts" src/app/admin/add/page.tsx tests/unit/admin/quote-accounts.test.ts
git commit -m "feat(admin): regular-mode enrich list of quote accounts"
```

---

## Task 12: E2E acceptance (operational)

- [ ] **Step 1:** Ensure `main` deployed (all pipeline routes live).
- [ ] **Step 2:** Quote scan a test website via `/admin/add` (quote mode): discover, pick 2 categories (products cap 30 + one info section), no IG → start.
- [ ] **Step 3:** Watch `/admin/scan/<jobId>`: ig-scan/transcribe skipped, crawl ≈ selected slice, persona built from website, products ≈ 30, `finalize` completed.
- [ ] **Step 4:** Verify via SQL: `config.scan_mode='quote'`, `scanned_categories` set, persona=1, products>0, chat page 200.
- [ ] **Step 5:** Regular mode → enrich that account → confirm full crawl + `scan_mode='full'`.

---

## Self-Review

**Spec coverage:** discover pre-step (T1–3), PipelineOptions (T4), category-bounded crawl (T5), IG-optional (T6), website persona (T7), scan_mode+branding (T8), start threading + domain anchor (T9), quote UI (T10), enrich list (T11), acceptance (T12). All spec sections mapped.

**Placeholder scan:** "confirm signature" notes point at named existing files (`src/lib/openai.ts` `chat`, `src/lib/redis.ts` `redisSet`, `scripts/build-gov-ministry-persona.mjs`, `src/lib/scraping/image-analyzer.ts`) — the executor resolves them by reading those files, not by inventing. No TBD/TODO.

**Type consistency:** `UrlGroup`, `Category`, `PipelineOptions.categories {pathPattern,cap}`, `hasInstagram(ctx)`, `discoverCategories`, `buildPersonaFromWebsite(accountId)` are used consistently across tasks.

**Open bindings the executor MUST resolve by reading code:**
1. `chat()` call shape + return in `src/lib/openai.ts` (Tasks 2, 7).
2. `redisSet` signature in `src/lib/redis.ts` (Task 3).
3. gov-ministry persona prompt + `chatbot_persona` upsert shape (Task 7).
4. `extractImageData` return shape for branding (Task 8).
5. `create-account.ts` already anchors `config.username` — verify no extra change needed (Task 6).
