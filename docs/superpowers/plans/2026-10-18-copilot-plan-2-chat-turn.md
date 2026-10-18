# Co-Pilot Plan 2: Association Chat Turn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the partner API a working association assistant: `POST /api/partner/v1/chat` streams a cited, linked English answer with one related item, upcoming-event and membership prompts, and a contact request at the agreed point; plus `POST /contact` and a gated `POST /recap`.

**Architecture:** A new turn core in `src/lib/copilot/` built from small pure modules (exclusions, prompt, output protocol, contact trigger) and thin I/O modules (retrieval, model stream, events store, escalation), wired by `turn.ts` with injected dependencies so it is unit-testable without OpenAI or Supabase. It calls `retrieveContext` directly (not the sandwich bot) so exclusions apply before the model sees anything and no e-commerce logic runs. Upcoming events come from a new `copilot_events` table filled by an extractor over the association's crawled event pages.

**Tech Stack:** Next.js 16 route handlers (NDJSON streaming), TypeScript (tsconfig `strict: false`), Supabase service-role client, OpenAI Responses API (`gpt-6-luna`), Upstash Redis sliding window, Vitest (`npx vitest run`).

**Spec:** `docs/superpowers/specs/2026-09-29-multiview-association-copilot-design.md` §4 and §5. Plan 1 (done): `docs/superpowers/plans/2026-10-01-copilot-plan-1-foundation.md`.

## Global Constraints

- Stream format is **NDJSON** (`Content-Type: application/x-ndjson`, one `JSON.stringify(event)+'\n'` per event), matching `/api/chat/stream` and `/api/widget/chat`. The spec's "SSE" is superseded (ruling 2026-10-18: the repo has no SSE routes and the white-label app reuses the existing client reader).
- Every user-visible string is English. No partner-facing body may contain `bestie`, `influencerbot`, `ldrs` or `imai` (case-insensitive). Error codes are neutral snake_case.
- Chat model `gpt-6-luna`, fallback `gpt-5.6-terra` (same as `baseArchetype.ts:31-32`). Responses API, `reasoning: { effort: 'low' }`, `max_output_tokens: 1200`.
- Exclusions are applied to retrieved sources **before** the prompt is built.
- Only events with `starts_on >= today` (association timezone, default `America/New_York`) may be suggested.
- `/chat` rate limits: per anon 20/min, per association 300/min, message ≤ 2,000 characters. If Redis is unavailable the route refuses with 503 `rate_limiter_unavailable` (fail closed).
- Interaction events never break a request (`recordEvents` already swallows).
- Migration number **151**.
- Scripts run under Node 22: `export PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH` (supabase-js throws on Node 20).
- Tests: `npx vitest run <path>`; server route tests start with `// @vitest-environment node`.
- Commit locally after each task; the controller pushes after review. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The model invents a source number or URL that was not retrieved** — the answer must only surface links from retrieved sources; unknown citation numbers are dropped. Pinned in Task 4.
2. **The META block is split across stream deltas or missing entirely** — visible text must never contain `<<META`, and a missing/garbled META still yields a valid answer with no cards. Pinned in Task 4.
3. **An excluded page is the best match** — it must not appear in the prompt, the sources card, or the related item. Pinned in Tasks 2 and 7.
4. **A visitor sends to someone else's session id, or a session of another association** — refused before anything is written or any model call is made. Pinned in Task 8.
5. **Past events** — an event that ended yesterday is never offered, even if the model asks for it. Pinned in Tasks 3 and 7.

---

### Task 1: Chat rate limiter (fail closed)

**Files:**
- Create: `src/lib/copilot/rate-limit.ts`
- Test: `tests/unit/copilot/chat-rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `MAX_MESSAGE_CHARS = 2000`
  - `type ChatLimitResult = { allowed: true } | { allowed: false; status: 429 | 503; error: 'rate_limited' | 'rate_limiter_unavailable'; retryAfterMs: number }`
  - `checkChatLimits(ctx: { accountId: string; anonId: string }, deps?: { limiter?: typeof redisSlidingWindowRateLimit; available?: () => boolean; now?: () => number }): Promise<ChatLimitResult>`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { checkChatLimits } from '@/lib/copilot/rate-limit';

const ok = { allowed: true, remaining: 5, resetAt: 0, retryAfterMs: 0 };
const ctx = { accountId: 'acc', anonId: 'anon_aaaaaaaaaaaaaaaa' };

describe('checkChatLimits', () => {
  it('allows when both buckets allow', async () => {
    const limiter = vi.fn(async () => ok);
    expect(await checkChatLimits(ctx, { limiter, available: () => true })).toEqual({ allowed: true });
    expect(limiter).toHaveBeenCalledTimes(2);
    expect(limiter.mock.calls.map((c: any) => c[0].key)).toEqual([
      'rl:copilot:chat:anon:acc:anon_aaaaaaaaaaaaaaaa',
      'rl:copilot:chat:account:acc',
    ]);
    expect(limiter.mock.calls.map((c: any) => c[0].limit)).toEqual([20, 300]);
  });
  it('refuses 429 when the anon bucket is full', async () => {
    const limiter = vi.fn(async (a: any) => (a.key.includes(':anon:') ? { ...ok, allowed: false, retryAfterMs: 4000 } : ok));
    expect(await checkChatLimits(ctx, { limiter, available: () => true })).toEqual({ allowed: false, status: 429, error: 'rate_limited', retryAfterMs: 4000 });
  });
  it('refuses 429 when the association bucket is full', async () => {
    const limiter = vi.fn(async (a: any) => (a.key.includes(':account:') ? { ...ok, allowed: false, retryAfterMs: 900 } : ok));
    expect(await checkChatLimits(ctx, { limiter, available: () => true })).toMatchObject({ allowed: false, status: 429 });
  });
  it('fails closed when Redis is unavailable or the limiter errors', async () => {
    expect(await checkChatLimits(ctx, { limiter: vi.fn(async () => ok), available: () => false }))
      .toEqual({ allowed: false, status: 503, error: 'rate_limiter_unavailable', retryAfterMs: 5000 });
    expect(await checkChatLimits(ctx, { limiter: vi.fn(async () => null), available: () => true }))
      .toMatchObject({ allowed: false, status: 503 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/copilot/chat-rate-limit.test.ts`
Expected: FAIL, cannot resolve `@/lib/copilot/rate-limit`.

- [ ] **Step 3: Implement**

```ts
/**
 * /chat is the one partner route that costs money per call, so it gets real
 * limits backed by Redis. The shared limiter falls back to per-instance memory
 * when Redis is down; for a paid model call that is not a limit at all, so
 * here an unavailable Redis refuses the turn.
 */
import crypto from 'node:crypto';
import { redisSlidingWindowRateLimit, isRedisAvailable } from '@/lib/redis';

export const MAX_MESSAGE_CHARS = 2000;
const WINDOW_MS = 60_000;
const ANON_LIMIT = 20;
const ACCOUNT_LIMIT = 300;

export type ChatLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; error: 'rate_limited' | 'rate_limiter_unavailable'; retryAfterMs: number };

const UNAVAILABLE: ChatLimitResult = { allowed: false, status: 503, error: 'rate_limiter_unavailable', retryAfterMs: 5000 };

export async function checkChatLimits(
  ctx: { accountId: string; anonId: string },
  deps: { limiter?: typeof redisSlidingWindowRateLimit; available?: () => boolean } = {},
): Promise<ChatLimitResult> {
  const limiter = deps.limiter ?? redisSlidingWindowRateLimit;
  const available = deps.available ?? isRedisAvailable;
  if (!available()) return UNAVAILABLE;

  const buckets = [
    { key: `rl:copilot:chat:anon:${ctx.accountId}:${ctx.anonId}`, limit: ANON_LIMIT },
    { key: `rl:copilot:chat:account:${ctx.accountId}`, limit: ACCOUNT_LIMIT },
  ];
  for (const b of buckets) {
    const r = await limiter({ key: b.key, limit: b.limit, windowMs: WINDOW_MS, identifier: crypto.randomUUID() });
    if (!r) return UNAVAILABLE;
    if (!r.allowed) return { allowed: false, status: 429, error: 'rate_limited', retryAfterMs: r.retryAfterMs };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/unit/copilot/chat-rate-limit.test.ts` → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/rate-limit.ts tests/unit/copilot/chat-rate-limit.test.ts
git commit -m "feat(copilot): fail-closed chat rate limits per visitor and association"
```

---

### Task 2: Source retrieval with exclusions

**Files:**
- Create: `src/lib/copilot/sources.ts`
- Test: `tests/unit/copilot/sources.test.ts`

**Interfaces:**
- Consumes: `retrieveContext` from `@/lib/rag` (`RetrieveInput`, `RetrievedSource` in `@/lib/rag/types`; website URL is `source.metadata.url`).
- Produces:
  - `interface CopilotSource { n: number; id: string; title: string; url: string | null; excerpt: string; entityType: string }`
  - `isExcluded(url: string | null, rules: string[]): boolean` — a rule starting with `http` matches by full-URL prefix (case-insensitive, ignoring a trailing slash on the rule); a rule starting with `/` matches by URL path prefix; anything else is ignored.
  - `toCopilotSources(raw: RetrievedSource[], rules: string[], max?: number): CopilotSource[]` — drops excluded, drops website sources with no URL, de-duplicates by URL (first wins) else by `documentId`, numbers from 1, default max 8, excerpt trimmed to 1,200 chars.
  - `retrieveAssociationSources(accountId: string, query: string, rules: string[], deps?: { retrieve?: typeof retrieveContext }): Promise<CopilotSource[]>` — calls `retrieve({ accountId, query, topK: 24, archetype: 'association', timeWindow: {}, entityTypes: ['website', 'document', 'knowledge_base', 'post', 'transcription'] })`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { isExcluded, toCopilotSources, retrieveAssociationSources } from '@/lib/copilot/sources';

const src = (id: string, url: string | null, extra: Partial<any> = {}) => ({
  sourceId: id, documentId: `doc-${id}`, entityType: 'website', title: `T ${id}`, excerpt: `text ${id}`,
  updatedAt: '2026-10-01', confidence: 0.5, metadata: url ? { url } : {}, ...extra,
});

describe('isExcluded', () => {
  it('matches full-URL and path prefixes', () => {
    const rules = ['https://buses.org/archive/', '/members-only'];
    expect(isExcluded('https://buses.org/archive/2019/x', rules)).toBe(true);
    expect(isExcluded('HTTPS://BUSES.ORG/archive/x', rules)).toBe(true);
    expect(isExcluded('https://buses.org/members-only/dues', rules)).toBe(true);
    expect(isExcluded('https://buses.org/events/', rules)).toBe(false);
    expect(isExcluded(null, rules)).toBe(false);
    expect(isExcluded('https://buses.org/x', ['junk'])).toBe(false);
  });
});

describe('toCopilotSources', () => {
  it('drops excluded and url-less website sources, dedupes, numbers from 1', () => {
    const out = toCopilotSources([
      src('a', 'https://buses.org/archive/old'),
      src('b', 'https://buses.org/membership/'),
      src('c', 'https://buses.org/membership/'),
      src('d', null),
      src('e', null, { entityType: 'knowledge_base', documentId: 'kb-1' }),
    ] as any, ['/archive']);
    expect(out.map((s) => [s.n, s.id, s.url])).toEqual([[1, 'b', 'https://buses.org/membership/'], [2, 'e', null]]);
  });
  it('caps the count and trims excerpts', () => {
    const many = Array.from({ length: 12 }, (_, i) => src(String(i), `https://buses.org/p${i}`, { excerpt: 'x'.repeat(2000) }));
    const out = toCopilotSources(many as any, []);
    expect(out).toHaveLength(8);
    expect(out[0].excerpt.length).toBe(1200);
  });
});

describe('retrieveAssociationSources', () => {
  it('over-fetches, disables the inferred time window, and filters before returning', async () => {
    const retrieve = vi.fn(async () => ({ sources: [src('a', 'https://buses.org/archive/x'), src('b', 'https://buses.org/events/')], debug: {} }));
    const out = await retrieveAssociationSources('acc', 'upcoming events', ['/archive'], { retrieve: retrieve as any });
    expect(retrieve).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc', query: 'upcoming events', topK: 24, timeWindow: {}, archetype: 'association' }));
    expect(out.map((s) => s.url)).toEqual(['https://buses.org/events/']);
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run tests/unit/copilot/sources.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
/**
 * Retrieval for the association assistant. Calls the hybrid retriever
 * directly (not the sandwich bot's knowledge bundle, which mixes in pages
 * that bypass any filter) so association staff exclusions hold before the
 * model sees a single source.
 */
import { retrieveContext } from '@/lib/rag';
import type { RetrievedSource } from '@/lib/rag/types';

export interface CopilotSource {
  n: number;
  id: string;
  title: string;
  url: string | null;
  excerpt: string;
  entityType: string;
}

const MAX_SOURCES = 8;
const MAX_EXCERPT = 1200;

export function isExcluded(url: string | null, rules: string[]): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch { path = ''; }
  return rules.some((raw) => {
    if (typeof raw !== 'string' || !raw) return false;
    const r = raw.toLowerCase().replace(/\/+$/, '');
    if (r.startsWith('http')) return u.startsWith(r);
    if (r.startsWith('/')) return path.startsWith(r);
    return false;
  });
}

function urlOf(s: RetrievedSource): string | null {
  const v = (s.metadata as Record<string, unknown> | undefined)?.url;
  return typeof v === 'string' && v ? v : null;
}

export function toCopilotSources(raw: RetrievedSource[], rules: string[], max = MAX_SOURCES): CopilotSource[] {
  const seen = new Set<string>();
  const out: CopilotSource[] = [];
  for (const s of raw) {
    const url = urlOf(s);
    if (s.entityType === 'website' && !url) continue;
    if (isExcluded(url, rules)) continue;
    const key = url ?? `doc:${s.documentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ n: out.length + 1, id: s.sourceId, title: s.title || url || 'Untitled', url, excerpt: (s.excerpt || '').slice(0, MAX_EXCERPT), entityType: s.entityType });
    if (out.length >= max) break;
  }
  return out;
}

export async function retrieveAssociationSources(
  accountId: string, query: string, rules: string[],
  deps: { retrieve?: typeof retrieveContext } = {},
): Promise<CopilotSource[]> {
  const retrieve = deps.retrieve ?? retrieveContext;
  const { sources } = await retrieve({
    accountId, query, topK: 24, archetype: 'association', timeWindow: {},
    entityTypes: ['website', 'document', 'knowledge_base', 'post', 'transcription'] as any,
  });
  return toCopilotSources(sources ?? [], rules);
}
```

- [ ] **Step 4: Run tests** → PASS (4).
- [ ] **Step 5: Commit** — `git add src/lib/copilot/sources.ts tests/unit/copilot/sources.test.ts && git commit -m "feat(copilot): association retrieval with staff exclusions applied before the prompt"`

---

### Task 3: Upcoming events store and extractor

**Files:**
- Create: `supabase/migrations/151_copilot_events.sql`
- Create: `src/lib/copilot/events-store.ts`
- Create: `scripts/copilot-extract-events.ts`
- Test: `tests/unit/copilot/events-store.test.ts`

**Interfaces:**
- Produces:
  - table `copilot_events(id uuid pk, account_id uuid fk accounts on delete cascade, title text not null, starts_on date not null, ends_on date, location text, url text not null, registration_url text, summary text, source_url text, extracted_at timestamptz default now(), unique(account_id, url, starts_on))`, RLS on, no anon/authenticated grants.
  - `interface UpcomingEvent { id: string; title: string; startsOn: string; endsOn: string | null; location: string | null; url: string; registrationUrl: string | null; summary: string | null }`
  - `todayIn(tz: string, now?: Date): string` (YYYY-MM-DD in that zone)
  - `parseExtractedEvents(raw: unknown, sourceUrl: string, today: string): Array<Omit<UpcomingEvent, 'id'> & { sourceUrl: string }>` — accepts `{ events: [...] }`; keeps entries with a title, a valid ISO date `starts_on`, an `http(s)` url (falls back to `sourceUrl`), and `ends_on ?? starts_on >= today`; drops the rest.
  - `listUpcomingEvents(accountId: string, today: string, limit?: number): Promise<UpcomingEvent[]>` — `ends_on >= today OR (ends_on is null AND starts_on >= today)`, ordered by `starts_on`, default limit 6.

- [ ] **Step 1: Write the migration**

```sql
-- ==================================================
-- Migration 151: Co-Pilot upcoming events
-- ==================================================
-- The association assistant may only suggest an event that has not happened
-- yet. Crawled pages carry dates as prose, so an extractor turns the
-- association's event pages into dated rows here; the chat turn reads only
-- rows whose end (or start) is today or later.
-- ==================================================
create table public.copilot_events (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  title             text not null,
  starts_on         date not null,
  ends_on           date,
  location          text,
  url               text not null,
  registration_url  text,
  summary           text,
  source_url        text,
  extracted_at      timestamptz not null default now(),
  unique (account_id, url, starts_on)
);
create index copilot_events_upcoming_idx on public.copilot_events(account_id, starts_on);
alter table public.copilot_events enable row level security;
revoke all on public.copilot_events from anon, authenticated;
```

- [ ] **Step 2: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { todayIn, parseExtractedEvents } from '@/lib/copilot/events-store';

describe('todayIn', () => {
  it('uses the association time zone, not UTC', () => {
    // 2026-10-19 02:00 UTC is still 2026-10-18 in New York.
    expect(todayIn('America/New_York', new Date('2026-10-19T02:00:00Z'))).toBe('2026-10-18');
    expect(todayIn('UTC', new Date('2026-10-19T02:00:00Z'))).toBe('2026-10-19');
  });
});

describe('parseExtractedEvents', () => {
  const today = '2026-10-18';
  it('keeps future and ongoing events, drops past and malformed ones', () => {
    const out = parseExtractedEvents({ events: [
      { title: 'Marketplace 2027', starts_on: '2027-01-10', ends_on: '2027-01-13', location: 'Columbus, OH', url: 'https://buses.org/marketplace', registration_url: 'https://buses.org/register' },
      { title: 'Ongoing webinar series', starts_on: '2026-10-01', ends_on: '2026-10-30', url: 'https://buses.org/webinars' },
      { title: 'Yesterday', starts_on: '2026-10-17', url: 'https://buses.org/y' },
      { title: '', starts_on: '2027-01-01', url: 'https://buses.org/z' },
      { title: 'Bad date', starts_on: 'next spring', url: 'https://buses.org/b' },
      { title: 'No url', starts_on: '2027-02-02' },
    ] }, 'https://buses.org/events/', today);
    expect(out.map((e) => e.title)).toEqual(['Marketplace 2027', 'Ongoing webinar series', 'No url']);
    expect(out[2].url).toBe('https://buses.org/events/');
    expect(out[0]).toMatchObject({ startsOn: '2027-01-10', endsOn: '2027-01-13', registrationUrl: 'https://buses.org/register', sourceUrl: 'https://buses.org/events/' });
  });
  it('returns nothing for junk', () => {
    expect(parseExtractedEvents(null, 'https://x', today)).toEqual([]);
    expect(parseExtractedEvents({ events: 'nope' }, 'https://x', today)).toEqual([]);
  });
  it('rejects non-http urls', () => {
    expect(parseExtractedEvents({ events: [{ title: 'X', starts_on: '2027-01-01', url: 'javascript:alert(1)' }] }, 'https://buses.org/e', today)[0].url).toBe('https://buses.org/e');
  });
});
```

- [ ] **Step 3: Run it to see it fail** → FAIL (module missing).

- [ ] **Step 4: Implement `events-store.ts`**

```ts
import { supabase } from '@/lib/supabase';

export interface UpcomingEvent {
  id: string; title: string; startsOn: string; endsOn: string | null; location: string | null;
  url: string; registrationUrl: string | null; summary: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}
function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export function parseExtractedEvents(raw: unknown, sourceUrl: string, today: string) {
  const list = (raw as any)?.events;
  if (!Array.isArray(list)) return [];
  const out: Array<Omit<UpcomingEvent, 'id'> & { sourceUrl: string }> = [];
  for (const e of list) {
    const title = text(e?.title, 200);
    const startsOn = typeof e?.starts_on === 'string' && ISO_DATE.test(e.starts_on) ? e.starts_on : null;
    if (!title || !startsOn) continue;
    const endsOn = typeof e?.ends_on === 'string' && ISO_DATE.test(e.ends_on) ? e.ends_on : null;
    if ((endsOn ?? startsOn) < today) continue;
    out.push({
      title, startsOn, endsOn,
      location: text(e?.location, 200),
      url: httpUrl(e?.url) ?? sourceUrl,
      registrationUrl: httpUrl(e?.registration_url),
      summary: text(e?.summary, 400),
      sourceUrl,
    });
  }
  return out;
}

export async function listUpcomingEvents(accountId: string, today: string, limit = 6): Promise<UpcomingEvent[]> {
  const { data, error } = await supabase.from('copilot_events')
    .select('id, title, starts_on, ends_on, location, url, registration_url, summary')
    .eq('account_id', accountId)
    .or(`ends_on.gte.${today},and(ends_on.is.null,starts_on.gte.${today})`)
    .order('starts_on', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[copilot/events-store]', 'list failed', accountId, error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, startsOn: r.starts_on, endsOn: r.ends_on, location: r.location,
    url: r.url, registrationUrl: r.registration_url, summary: r.summary,
  }));
}
```

- [ ] **Step 5: Implement `scripts/copilot-extract-events.ts`**

```ts
/**
 * Extract dated upcoming events from an association's crawled pages into copilot_events.
 *   export PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH
 *   npx tsx scripts/copilot-extract-events.ts --account <uuid> [--tz America/New_York] [--dry-run]
 * Reads document_chunks with topic 'events' or an event-like URL, groups by URL,
 * asks the model for structured events, keeps only future ones, upserts.
 */
import { config as loadEnv } from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { parseExtractedEvents, todayIn } from '../src/lib/copilot/events-store';

loadEnv({ path: '.env.local' });
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1]?.startsWith('--') ? '' : args[i + 1] ?? '') : null; };
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `Extract every specific, dated event (conference, marketplace, expo, webinar, meeting, summit) from the page text.
Return JSON {"events":[{"title":string,"starts_on":"YYYY-MM-DD","ends_on":"YYYY-MM-DD"|null,"location":string|null,"url":string|null,"registration_url":string|null,"summary":string|null}]}.
Only include an event when the page states its date. Use the year shown on the page; if no year is shown, omit the event. Never guess.`;

async function main() {
  const accountId = flag('account');
  if (!accountId) throw new Error('--account is required');
  const today = todayIn(flag('tz') || 'America/New_York');
  const dry = flag('dry-run') !== null;

  const { data: chunks, error } = await sb.from('document_chunks')
    .select('chunk_text, metadata, topic')
    .eq('account_id', accountId)
    .or('topic.eq.events,metadata->>url.ilike.%event%,metadata->>url.ilike.%marketplace%,metadata->>url.ilike.%webinar%')
    .limit(2000);
  if (error) throw new Error(`chunks: ${error.message}`);

  const pages = new Map<string, string[]>();
  for (const c of chunks ?? []) {
    const url = (c as any).metadata?.url;
    if (typeof url !== 'string') continue;
    pages.set(url, [...(pages.get(url) ?? []), (c as any).chunk_text ?? '']);
  }
  console.log(`pages: ${pages.size}, today: ${today}`);

  let kept = 0;
  for (const [url, parts] of pages) {
    const body = parts.join('\n').slice(0, 12000);
    const res = await openai.responses.create({
      model: 'gpt-6-luna', instructions: PROMPT, input: `URL: ${url}\n\n${body}`,
      reasoning: { effort: 'low' }, max_output_tokens: 1500, text: { format: { type: 'json_object' } },
    } as any);
    let parsed: unknown = null;
    try { parsed = JSON.parse((res as any).output_text || 'null'); } catch { parsed = null; }
    const events = parseExtractedEvents(parsed, url, today);
    kept += events.length;
    console.log(`${events.length}  ${url}`);
    if (dry || events.length === 0) continue;
    const { error: upErr } = await sb.from('copilot_events').upsert(events.map((e) => ({
      account_id: accountId, title: e.title, starts_on: e.startsOn, ends_on: e.endsOn, location: e.location,
      url: e.url, registration_url: e.registrationUrl, summary: e.summary, source_url: e.sourceUrl, extracted_at: new Date().toISOString(),
    })), { onConflict: 'account_id,url,starts_on' });
    if (upErr) throw new Error(`upsert: ${upErr.message}`);
  }
  console.log(`\nupcoming events kept: ${kept}${dry ? ' (dry run, nothing written)' : ''}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```

Before writing this script, check the real column name of chunk text in `document_chunks` (`select column_name from information_schema.columns where table_name='document_chunks'`) and use it in place of `chunk_text` if different.

- [ ] **Step 6: Run tests** — `npx vitest run tests/unit/copilot/events-store.test.ts` → PASS (4). Type-check the script: `npx tsc --noEmit --skipLibCheck --esModuleInterop --module esnext --moduleResolution bundler --target es2022 --types node scripts/copilot-extract-events.ts`.
- [ ] **Step 7: Commit** (migration, store, script, test). Do NOT apply the migration or run the script; the controller does both after review.

---

### Task 4: Prompt and output protocol

**Files:**
- Create: `src/lib/copilot/prompt.ts`
- Create: `src/lib/copilot/protocol.ts`
- Test: `tests/unit/copilot/protocol.test.ts`, `tests/unit/copilot/prompt.test.ts`

**Interfaces:**
- Consumes: `CopilotSource` (Task 2), `UpcomingEvent` (Task 3), `MemberSnapshot` (`@/lib/copilot/ams/types`).
- Produces in `protocol.ts`:
  - `META_OPEN = '<<META>>'`, `META_CLOSE = '<</META>>'`
  - `interface CopilotMeta { cited: number[]; related: number | null; eventId: string | null; cta: { kind: 'event' | 'join' | 'renew'; url: string } | null; askContact: boolean; topic: string | null; membershipMentioned: boolean; renewalMentioned: boolean }`
  - `createVisibleTextSplitter(): { push(delta: string): string; end(): { visible: string; rawMeta: string | null } }` — `push` returns text safe to show now; it withholds any suffix that could be the start of `<<META>>`; once the marker appears nothing after it is ever shown.
  - `parseMeta(raw: string | null, ctx: { sourceCount: number; eventIds: string[]; allowedCtaUrls: string[]; topics: readonly string[] }): CopilotMeta` — invalid JSON → empty meta; `cited` keeps unique integers 1..sourceCount; `related` kept only if 1..sourceCount and not in `cited`; `eventId` kept only if in `eventIds`; `cta.url` kept only if in `allowedCtaUrls`; `topic` kept only if in `topics`.
  - `EMPTY_META: CopilotMeta`
- Produces in `prompt.ts`:
  - `interface PromptContext { associationName: string; websiteUrl: string | null; sources: CopilotSource[]; events: UpcomingEvent[]; member: MemberSnapshot | null; identified: boolean; joinUrl: string | null; renewUrl: string | null; today: string; topics: readonly string[]; tone: string | null }`
  - `buildInstructions(ctx: PromptContext): string`
  - `buildUserInput(message: string): string`
  - `allowedCtaUrls(ctx: PromptContext): string[]` — join/renew URLs plus each event's registration or page URL.

- [ ] **Step 1: Write the failing protocol test**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createVisibleTextSplitter, parseMeta, EMPTY_META } from '@/lib/copilot/protocol';

describe('createVisibleTextSplitter', () => {
  it('never shows the META marker even when split across deltas', () => {
    const s = createVisibleTextSplitter();
    let shown = '';
    for (const d of ['Dues depend on ', 'membership type [1].', '\n<<ME', 'TA>>{"cited":[1]}', '<</META>>']) shown += s.push(d);
    const end = s.end();
    shown += end.visible;
    expect(shown).toBe('Dues depend on membership type [1].\n');
    expect(shown).not.toContain('<<');
    expect(end.rawMeta).toBe('{"cited":[1]}');
  });
  it('releases a held "<<" that turned out not to be the marker', () => {
    const s = createVisibleTextSplitter();
    const shown = s.push('a << b') + s.end().visible;
    expect(shown).toBe('a << b');
  });
  it('reports no meta when the model omits it', () => {
    const s = createVisibleTextSplitter();
    s.push('Plain answer.');
    expect(s.end()).toEqual({ visible: '', rawMeta: null });
  });
});

describe('parseMeta', () => {
  const ctx = { sourceCount: 3, eventIds: ['ev1'], allowedCtaUrls: ['https://buses.org/join'], topics: ['membership', 'events'] };
  it('keeps only valid references', () => {
    const m = parseMeta(JSON.stringify({ cited: [1, 3, 3, 9, 'x'], related: 2, eventId: 'ev1', cta: { kind: 'join', url: 'https://buses.org/join' }, askContact: true, topic: 'membership', membershipMentioned: true, renewalMentioned: false }), ctx);
    expect(m).toEqual({ cited: [1, 3], related: 2, eventId: 'ev1', cta: { kind: 'join', url: 'https://buses.org/join' }, askContact: true, topic: 'membership', membershipMentioned: true, renewalMentioned: false });
  });
  it('drops invented sources, events, urls and topics', () => {
    const m = parseMeta(JSON.stringify({ cited: [4], related: 1, eventId: 'made-up', cta: { kind: 'join', url: 'https://evil.example/join' }, topic: 'crypto' }), { ...ctx, sourceCount: 3 });
    expect(m).toMatchObject({ cited: [], related: 1, eventId: null, cta: null, topic: null });
  });
  it('a related item that is also cited is dropped', () => {
    expect(parseMeta(JSON.stringify({ cited: [1], related: 1 }), ctx).related).toBeNull();
  });
  it('garbage yields the empty meta', () => {
    expect(parseMeta('not json', ctx)).toEqual(EMPTY_META);
    expect(parseMeta(null, ctx)).toEqual(EMPTY_META);
  });
});
```

- [ ] **Step 2: Write the failing prompt test**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildInstructions, allowedCtaUrls } from '@/lib/copilot/prompt';

const base = {
  associationName: 'American Bus Association', websiteUrl: 'https://www.buses.org', today: '2026-10-18',
  sources: [{ n: 1, id: 'c1', title: 'Membership', url: 'https://buses.org/membership/', excerpt: 'Operator members...', entityType: 'website' }],
  events: [{ id: 'ev1', title: 'Marketplace 2027', startsOn: '2027-01-10', endsOn: '2027-01-13', location: 'Columbus, OH', url: 'https://buses.org/marketplace', registrationUrl: 'https://buses.org/register', summary: null }],
  member: null, identified: false, joinUrl: 'https://buses.org/join', renewUrl: null,
  topics: ['membership', 'events'], tone: null,
};

describe('buildInstructions', () => {
  it('lists numbered sources with URLs, upcoming events and the META contract', () => {
    const p = buildInstructions(base as any);
    expect(p).toContain('You are the assistant on the American Bus Association website');
    expect(p).toContain('[1] Membership — https://buses.org/membership/');
    expect(p).toContain('id=ev1');
    expect(p).toContain('2027-01-10');
    expect(p).toContain('<<META>>');
    expect(p).toContain('English');
    expect(p).not.toMatch(/bestie|influencerbot|ldrs|imai/i);
  });
  it('describes a member with renewal due and never shows member data for anonymous visitors', () => {
    const anon = buildInstructions(base as any);
    expect(anon).toContain('not signed in');
    const member = buildInstructions({ ...base, identified: true, renewUrl: 'https://buses.org/renew', member: { memberRef: 'M1', email: null, name: 'Pat', company: 'Acme Coaches', status: 'active', type: 'Operator', renewalDate: '2026-11-30', registrations: [], fetchedAt: '' } } as any);
    expect(member).toContain('Acme Coaches');
    expect(member).toContain('renewal date 2026-11-30');
    expect(member).toContain('within 60 days');
  });
  it('says there are no upcoming events when the list is empty', () => {
    expect(buildInstructions({ ...base, events: [] } as any)).toContain('No upcoming events are known');
  });
});

describe('allowedCtaUrls', () => {
  it('collects join, renew and event links', () => {
    expect(allowedCtaUrls({ ...base, renewUrl: 'https://buses.org/renew' } as any).sort())
      .toEqual(['https://buses.org/join', 'https://buses.org/marketplace', 'https://buses.org/register', 'https://buses.org/renew'].sort());
  });
});
```

- [ ] **Step 3: Run both to see them fail.**

- [ ] **Step 4: Implement `protocol.ts`**

```ts
/**
 * The model streams the answer, then one trailing machine block:
 *   <<META>>{...json...}<</META>>
 * The visible text must never contain the block, even when the marker is split
 * across stream deltas, and every reference in the block is checked against
 * what was actually retrieved: the model cannot surface a link we did not give it.
 */
export const META_OPEN = '<<META>>';
export const META_CLOSE = '<</META>>';

export interface CopilotMeta {
  cited: number[];
  related: number | null;
  eventId: string | null;
  cta: { kind: 'event' | 'join' | 'renew'; url: string } | null;
  askContact: boolean;
  topic: string | null;
  membershipMentioned: boolean;
  renewalMentioned: boolean;
}

export const EMPTY_META: CopilotMeta = {
  cited: [], related: null, eventId: null, cta: null, askContact: false, topic: null, membershipMentioned: false, renewalMentioned: false,
};

function heldSuffixLength(s: string): number {
  for (let k = Math.min(META_OPEN.length - 1, s.length); k > 0; k--) {
    if (META_OPEN.startsWith(s.slice(-k))) return k;
  }
  return 0;
}

export function createVisibleTextSplitter() {
  let buffer = '';
  let inMeta = false;
  let meta = '';
  return {
    push(delta: string): string {
      if (inMeta) { meta += delta; return ''; }
      buffer += delta;
      const i = buffer.indexOf(META_OPEN);
      if (i >= 0) {
        const out = buffer.slice(0, i);
        meta = buffer.slice(i + META_OPEN.length);
        buffer = '';
        inMeta = true;
        return out;
      }
      const hold = heldSuffixLength(buffer);
      const out = buffer.slice(0, buffer.length - hold);
      buffer = buffer.slice(buffer.length - hold);
      return out;
    },
    end(): { visible: string; rawMeta: string | null } {
      if (!inMeta) { const v = buffer; buffer = ''; return { visible: v, rawMeta: null }; }
      const close = meta.indexOf(META_CLOSE);
      return { visible: '', rawMeta: (close >= 0 ? meta.slice(0, close) : meta).trim() || null };
    },
  };
}

export function parseMeta(
  raw: string | null,
  ctx: { sourceCount: number; eventIds: string[]; allowedCtaUrls: string[]; topics: readonly string[] },
): CopilotMeta {
  if (!raw) return { ...EMPTY_META };
  let j: any;
  try { j = JSON.parse(raw); } catch { return { ...EMPTY_META }; }
  if (!j || typeof j !== 'object') return { ...EMPTY_META };
  const inRange = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= ctx.sourceCount;
  const cited = Array.isArray(j.cited) ? [...new Set(j.cited.filter(inRange) as number[])] : [];
  const related = inRange(j.related) && !cited.includes(j.related) ? j.related : null;
  const eventId = typeof j.eventId === 'string' && ctx.eventIds.includes(j.eventId) ? j.eventId : null;
  const kinds = ['event', 'join', 'renew'];
  const cta = j.cta && kinds.includes(j.cta.kind) && typeof j.cta.url === 'string' && ctx.allowedCtaUrls.includes(j.cta.url)
    ? { kind: j.cta.kind, url: j.cta.url } : null;
  const topic = typeof j.topic === 'string' && ctx.topics.includes(j.topic) ? j.topic : null;
  return {
    cited, related, eventId, cta, topic,
    askContact: j.askContact === true,
    membershipMentioned: j.membershipMentioned === true,
    renewalMentioned: j.renewalMentioned === true,
  };
}
```

- [ ] **Step 5: Implement `prompt.ts`**

```ts
/**
 * System instructions for the association assistant. Written for a
 * knowledgeable staff member: answer, cite, point to the next useful thing,
 * never invent a fact, a price or a link.
 */
import type { CopilotSource } from './sources';
import type { UpcomingEvent } from './events-store';
import type { MemberSnapshot } from './ams/types';

export interface PromptContext {
  associationName: string;
  websiteUrl: string | null;
  sources: CopilotSource[];
  events: UpcomingEvent[];
  member: MemberSnapshot | null;
  identified: boolean;
  joinUrl: string | null;
  renewUrl: string | null;
  today: string;
  topics: readonly string[];
  tone: string | null;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function allowedCtaUrls(ctx: PromptContext): string[] {
  const urls = new Set<string>();
  if (ctx.joinUrl) urls.add(ctx.joinUrl);
  if (ctx.renewUrl) urls.add(ctx.renewUrl);
  for (const e of ctx.events) { urls.add(e.url); if (e.registrationUrl) urls.add(e.registrationUrl); }
  return [...urls];
}

function visitorBlock(ctx: PromptContext): string {
  if (!ctx.identified || !ctx.member) {
    return `VISITOR: not signed in. Do not assume membership. If their questions show they would benefit from membership, introduce it naturally once, with the join link if one is given.`;
  }
  const m = ctx.member;
  const lines = [`VISITOR: signed in${m.name ? ` as ${m.name}` : ''}${m.company ? ` of ${m.company}` : ''}. Membership status: ${m.status}${m.type ? ` (${m.type})` : ''}.`];
  if (m.status === 'non_member') lines.push('They are signed in but not a member: find a natural moment to introduce membership and its value.');
  if (m.status === 'lapsed') lines.push('Their membership has lapsed: when relevant, explain what they are missing and offer the renewal link.');
  if (m.renewalDate) {
    const d = daysBetween(ctx.today, m.renewalDate);
    lines.push(`Their renewal date ${m.renewalDate}${d >= 0 && d <= 60 ? ' is within 60 days: when they ask about membership, frame renewal around the value they get, not as a reminder.' : '.'}`);
  }
  if (m.registrations.length) lines.push(`Registered for: ${m.registrations.map((r) => r.title).join('; ')}. Do not prompt them to register for these again.`);
  return lines.join('\n');
}

export function buildInstructions(ctx: PromptContext): string {
  const sources = ctx.sources.length
    ? ctx.sources.map((s) => `[${s.n}] ${s.title}${s.url ? ` — ${s.url}` : ''}\n${s.excerpt}`).join('\n\n')
    : 'No sources matched this question.';
  const events = ctx.events.length
    ? ctx.events.map((e) => `- id=${e.id} | ${e.title} | ${e.startsOn}${e.endsOn && e.endsOn !== e.startsOn ? ` to ${e.endsOn}` : ''}${e.location ? ` | ${e.location}` : ''} | page ${e.url}${e.registrationUrl ? ` | register ${e.registrationUrl}` : ''}`).join('\n')
    : 'No upcoming events are known. Do not mention specific event dates.';
  const links = [ctx.joinUrl && `Join: ${ctx.joinUrl}`, ctx.renewUrl && `Renew: ${ctx.renewUrl}`].filter(Boolean).join('\n') || 'None given.';

  return `You are the assistant on the ${ctx.associationName} website${ctx.websiteUrl ? ` (${ctx.websiteUrl})` : ''}. You help every visitor the way a knowledgeable staff member would: answer the question asked, point them to the right page, and suggest the next useful thing.
Write in natural, native English only. Be concise: 2 to 5 short paragraphs or a short list.${ctx.tone ? `\nTone: ${ctx.tone}` : ''}
Today is ${ctx.today}.

RULES
- Use only the SOURCES and UPCOMING EVENTS below. If they do not answer the question, say so plainly and offer to connect the visitor with staff. Never invent facts, prices, dues, dates, names or links.
- Cite the sources you used inline as [n]. Every factual answer cites at least one source.
- Only use links that appear below. Never write a URL that is not listed.
- Suggest at most one related page, resource or event that the visitor did not ask about but would likely want next.
- Only mention an event from UPCOMING EVENTS. Never mention an event that is not listed.
- Do not ask for personal details in the text; set askContact in META instead when it would genuinely help staff follow up.

${visitorBlock(ctx)}

SOURCES
${sources}

UPCOMING EVENTS
${events}

KEY LINKS
${links}

OUTPUT
After the answer, on a new line, write exactly one block and nothing after it:
<<META>>{"cited":[source numbers you cited],"related":source number or null,"eventId":"event id" or null,"cta":{"kind":"event"|"join"|"renew","url":"one URL from above"} or null,"askContact":true|false,"topic":one of ${JSON.stringify(ctx.topics)} or null,"membershipMentioned":true|false,"renewalMentioned":true|false}<</META>>`;
}

export function buildUserInput(message: string): string {
  return message;
}
```

- [ ] **Step 6: Run both tests** → PASS.
- [ ] **Step 7: Commit** (`prompt.ts`, `protocol.ts`, both tests).

---

### Task 5: Model stream wrapper with fallback and cost

**Files:**
- Create: `src/lib/copilot/model.ts`
- Test: `tests/unit/copilot/model.test.ts`

**Interfaces:**
- Consumes: `TokenUsage` from `@/lib/chatbot/archetypes/types`; `recordTurnCost` from `@/lib/costs/recorder`.
- Produces:
  - `COPILOT_MODEL = 'gpt-6-luna'`, `COPILOT_FALLBACK_MODEL = 'gpt-5.6-terra'`
  - `interface ModelClient { responses: { create(params: any): Promise<any> } }`
  - `streamCopilotModel(p: { instructions: string; input: Array<{ role: 'user' | 'assistant'; content: string }>; previousResponseId: string | null; onDelta: (t: string) => void }, client?: ModelClient): Promise<{ text: string; responseId: string | null; usage: TokenUsage[] }>`
    - primary: streaming `responses.create({ model: COPILOT_MODEL, instructions, input, previous_response_id?, max_output_tokens: 1200, reasoning: { effort: 'low' }, stream: true })`; reads `response.output_text.delta` (`event.delta`) and `response.completed` (`event.response.id`, `event.response.usage`).
    - if the primary throws before any delta was emitted, or completes with empty text: one non-streaming call on `COPILOT_FALLBACK_MODEL` with no `previous_response_id`, emitting its `output_text` as a single delta.
    - if the primary throws after deltas were emitted: rethrow (do not emit a second answer).
    - usage mapped to `{ model, inputTokens: usage.input_tokens, cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0, outputTokens: usage.output_tokens }` for every call that returned usage.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { streamCopilotModel, COPILOT_MODEL, COPILOT_FALLBACK_MODEL } from '@/lib/copilot/model';

function streamOf(events: any[]) {
  return { async *[Symbol.asyncIterator]() { for (const e of events) yield e; } };
}
const usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10 } };

describe('streamCopilotModel', () => {
  it('streams deltas and returns id and usage', async () => {
    const create = vi.fn(async () => streamOf([
      { type: 'response.output_text.delta', delta: 'Hel' },
      { type: 'response.output_text.delta', delta: 'lo' },
      { type: 'response.completed', response: { id: 'resp_1', usage } },
    ]));
    const deltas: string[] = [];
    const r = await streamCopilotModel({ instructions: 'i', input: [{ role: 'user', content: 'q' }], previousResponseId: 'prev', onDelta: (d) => deltas.push(d) }, { responses: { create } });
    expect(deltas.join('')).toBe('Hello');
    expect(r).toEqual({ text: 'Hello', responseId: 'resp_1', usage: [{ model: COPILOT_MODEL, inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 }] });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: COPILOT_MODEL, previous_response_id: 'prev', stream: true, max_output_tokens: 1200 }));
  });
  it('falls back once without the chain when the primary fails before any text', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'resp_fb', output_text: 'Fallback answer', usage });
    const deltas: string[] = [];
    const r = await streamCopilotModel({ instructions: 'i', input: [{ role: 'user', content: 'q' }], previousResponseId: 'prev', onDelta: (d) => deltas.push(d) }, { responses: { create } });
    expect(deltas).toEqual(['Fallback answer']);
    expect(r.responseId).toBe('resp_fb');
    expect(create.mock.calls[1][0]).toMatchObject({ model: COPILOT_FALLBACK_MODEL });
    expect(create.mock.calls[1][0]).not.toHaveProperty('previous_response_id');
    expect(create.mock.calls[1][0]).not.toHaveProperty('stream');
  });
  it('does not fall back after text was already shown', async () => {
    const create = vi.fn(async () => ({ async *[Symbol.asyncIterator]() { yield { type: 'response.output_text.delta', delta: 'Partial' }; throw new Error('cut'); } }));
    await expect(streamCopilotModel({ instructions: 'i', input: [], previousResponseId: null, onDelta: () => {} }, { responses: { create } })).rejects.toThrow('cut');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

- [ ] **Step 3: Implement**

```ts
import OpenAI from 'openai';
import type { TokenUsage } from '@/lib/chatbot/archetypes/types';

export const COPILOT_MODEL = 'gpt-6-luna';
export const COPILOT_FALLBACK_MODEL = 'gpt-5.6-terra';
const MAX_OUTPUT_TOKENS = 1200;

export interface ModelClient { responses: { create(params: any): Promise<any> } }

let defaultClient: ModelClient | null = null;
function client(): ModelClient {
  if (!defaultClient) defaultClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ModelClient;
  return defaultClient;
}

function toUsage(model: string, u: any): TokenUsage | null {
  if (!u) return null;
  return { model, inputTokens: u.input_tokens ?? 0, cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
}

export async function streamCopilotModel(
  p: { instructions: string; input: Array<{ role: 'user' | 'assistant'; content: string }>; previousResponseId: string | null; onDelta: (t: string) => void },
  c: ModelClient = client(),
): Promise<{ text: string; responseId: string | null; usage: TokenUsage[] }> {
  const usage: TokenUsage[] = [];
  let text = '';
  let responseId: string | null = null;
  try {
    const stream = await c.responses.create({
      model: COPILOT_MODEL, instructions: p.instructions, input: p.input,
      ...(p.previousResponseId ? { previous_response_id: p.previousResponseId } : {}),
      max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' }, stream: true,
    });
    for await (const ev of stream) {
      if (ev?.type === 'response.output_text.delta' && typeof ev.delta === 'string') { text += ev.delta; p.onDelta(ev.delta); }
      else if (ev?.type === 'response.completed') {
        responseId = ev.response?.id ?? null;
        const u = toUsage(COPILOT_MODEL, ev.response?.usage);
        if (u) usage.push(u);
      }
    }
    if (text) return { text, responseId, usage };
  } catch (e) {
    if (text) throw e;
    console.error('[copilot/model]', 'primary failed, falling back', e instanceof Error ? e.message : e);
  }
  const fb = await c.responses.create({
    model: COPILOT_FALLBACK_MODEL, instructions: p.instructions, input: p.input,
    max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' },
  });
  const fbText: string = fb?.output_text ?? '';
  const u = toUsage(COPILOT_FALLBACK_MODEL, fb?.usage);
  if (u) usage.push(u);
  if (!fbText) throw new Error('empty response from both models');
  p.onDelta(fbText);
  return { text: fbText, responseId: fb?.id ?? null, usage };
}
```

- [ ] **Step 4: Run tests** → PASS (3).
- [ ] **Step 5: Commit.**

---

### Task 6: Contact trigger and English escalation

**Files:**
- Create: `src/lib/copilot/contact-trigger.ts`
- Create: `src/lib/copilot/escalate.ts`
- Test: `tests/unit/copilot/contact-trigger.test.ts`, `tests/unit/copilot/escalate.test.ts`

**Interfaces:**
- Produces in `contact-trigger.ts`:
  - `type ContactRule = { kind: 'after_n_questions'; n: number } | { kind: 'on_intent'; topics: string[] } | { kind: 'before_escalation' }`
  - `DEFAULT_CONTACT_RULES: ContactRule[] = [{ kind: 'on_intent', topics: ['membership', 'events'] }, { kind: 'before_escalation' }]`
  - `readContactRules(config: unknown): ContactRule[]` — from `config.copilot.contact_trigger` (array, or a single object), invalid entries dropped, empty → defaults.
  - `shouldRequestContact(s: { rules: ContactRule[]; questionCount: number; topic: string | null; modelAsked: boolean; escalating: boolean; alreadyHaveEmail: boolean; alreadyRequested: boolean }): boolean` — false if `alreadyHaveEmail` or `alreadyRequested`; true if any rule fires (`after_n_questions`: `questionCount >= n`; `on_intent`: `topic` in topics AND `modelAsked`; `before_escalation`: `escalating`).
- Produces in `escalate.ts`:
  - `interface EscalationResult { escalated: boolean; reason: string | null; notified: number; deduped: boolean }`
  - `escalateIfNeeded(input: { accountId: string; associationName: string; sessionId: string; visitorLabel: string; userMessage: string; priorUserMessages: string[]; transcript: Array<{ role: string; content: string }>; config: unknown }, deps?: { detect?: typeof detectEscalation; sendEmail?: typeof sendEmail; db?: typeof supabase; now?: () => Date }): Promise<EscalationResult>`
    - uses `detectEscalation(userMessage, priorUserMessages)` from `@/engines/escalation/detect`;
    - recipients from `config.copilot.escalation.recipients` (array of emails); none → escalated true, notified 0 (still logged);
    - dedupe: an existing `support_requests` row with `session_id = sessionId`, `source = 'copilot_escalation'`, created in the last 15 minutes → `deduped: true`, no email;
    - inserts `support_requests { account_id, session_id, status: 'new', source: 'copilot_escalation', message: userMessage, escalation_reason: <English reason>, customer_email: null, metadata: { copilot: { triggers, severity } } }`;
    - English reason text per trigger: legal → 'Mentions legal action', abuse → 'Abusive language', human_demand → 'Asked for a staff member', sustained_anger → 'Repeated frustration';
    - English email: subject `[${associationName}] Visitor needs a staff member: ${reason}`, body = escaped last 12 transcript lines.

- [ ] **Step 1: Write the failing contact-trigger test**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { shouldRequestContact, readContactRules, DEFAULT_CONTACT_RULES } from '@/lib/copilot/contact-trigger';

const base = { rules: DEFAULT_CONTACT_RULES, questionCount: 1, topic: null, modelAsked: false, escalating: false, alreadyHaveEmail: false, alreadyRequested: false };

describe('shouldRequestContact', () => {
  it('fires on a membership question when the model judged follow-up useful', () => {
    expect(shouldRequestContact({ ...base, topic: 'membership', modelAsked: true })).toBe(true);
    expect(shouldRequestContact({ ...base, topic: 'membership', modelAsked: false })).toBe(false);
    expect(shouldRequestContact({ ...base, topic: 'safety', modelAsked: true })).toBe(false);
  });
  it('fires before an escalation', () => {
    expect(shouldRequestContact({ ...base, escalating: true })).toBe(true);
  });
  it('after_n_questions', () => {
    const rules = [{ kind: 'after_n_questions', n: 3 }] as any;
    expect(shouldRequestContact({ ...base, rules, questionCount: 2 })).toBe(false);
    expect(shouldRequestContact({ ...base, rules, questionCount: 3 })).toBe(true);
  });
  it('never asks twice or when the email is known', () => {
    expect(shouldRequestContact({ ...base, escalating: true, alreadyRequested: true })).toBe(false);
    expect(shouldRequestContact({ ...base, escalating: true, alreadyHaveEmail: true })).toBe(false);
  });
});

describe('readContactRules', () => {
  it('reads valid rules and falls back to defaults', () => {
    expect(readContactRules({ copilot: { contact_trigger: { kind: 'after_n_questions', n: 4 } } })).toEqual([{ kind: 'after_n_questions', n: 4 }]);
    expect(readContactRules({ copilot: { contact_trigger: [{ kind: 'nope' }] } })).toEqual(DEFAULT_CONTACT_RULES);
    expect(readContactRules(null)).toEqual(DEFAULT_CONTACT_RULES);
  });
});
```

- [ ] **Step 2: Write the failing escalation test**

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { escalateIfNeeded } from '@/lib/copilot/escalate';

function db(existing: any[] = []) {
  const inserts: any[] = [];
  const api: any = {
    inserts,
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: existing, error: null }) }) }) }) }),
      insert: async (row: any) => { inserts.push(row); return { error: null }; },
    }),
  };
  return api;
}
const input = {
  accountId: 'acc', associationName: 'American Bus Association', sessionId: 's1', visitorLabel: 'Anonymous visitor',
  userMessage: 'I want to talk to a human now', priorUserMessages: [], transcript: [{ role: 'user', content: 'I want to talk to a human now' }],
  config: { copilot: { escalation: { recipients: ['staff@buses.org'] } } },
};
const detectYes = vi.fn(() => ({ escalate: true, severity: 'high', reason: 'x', triggers: ['human_demand'] })) as any;

describe('escalateIfNeeded', () => {
  it('does nothing when the detector says no', async () => {
    const d = db();
    const sendEmail = vi.fn();
    const r = await escalateIfNeeded(input, { detect: vi.fn(() => ({ escalate: false, severity: null, reason: '', triggers: [] })) as any, sendEmail: sendEmail as any, db: d });
    expect(r).toEqual({ escalated: false, reason: null, notified: 0, deduped: false });
    expect(d.inserts).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('logs the request and emails staff in English', async () => {
    const d = db();
    const sendEmail = vi.fn(async () => ({ success: true }));
    const r = await escalateIfNeeded(input, { detect: detectYes, sendEmail: sendEmail as any, db: d });
    expect(r).toEqual({ escalated: true, reason: 'Asked for a staff member', notified: 1, deduped: false });
    expect(d.inserts[0]).toMatchObject({ account_id: 'acc', session_id: 's1', source: 'copilot_escalation', escalation_reason: 'Asked for a staff member' });
    const mail = (sendEmail.mock.calls[0] as any)[0];
    expect(mail.to).toEqual(['staff@buses.org']);
    expect(mail.subject).toBe('[American Bus Association] Visitor needs a staff member: Asked for a staff member');
    expect(mail.html).not.toMatch(/[֐-׿]/);
    expect(mail.html).not.toMatch(/bestie|influencerbot|ldrs|imai/i);
  });
  it('dedupes within 15 minutes', async () => {
    const d = db([{ id: 'r1' }]);
    const sendEmail = vi.fn();
    const r = await escalateIfNeeded(input, { detect: detectYes, sendEmail: sendEmail as any, db: d });
    expect(r).toMatchObject({ escalated: true, deduped: true, notified: 0 });
    expect(d.inserts).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('escapes HTML from the transcript', async () => {
    const d = db();
    const sendEmail = vi.fn(async () => ({ success: true }));
    await escalateIfNeeded({ ...input, transcript: [{ role: 'user', content: '<script>x</script>' }] }, { detect: detectYes, sendEmail: sendEmail as any, db: d });
    expect((sendEmail.mock.calls[0] as any)[0].html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 3: Run both to see them fail.**

- [ ] **Step 4: Implement `contact-trigger.ts`**

```ts
export type ContactRule =
  | { kind: 'after_n_questions'; n: number }
  | { kind: 'on_intent'; topics: string[] }
  | { kind: 'before_escalation' };

export const DEFAULT_CONTACT_RULES: ContactRule[] = [
  { kind: 'on_intent', topics: ['membership', 'events'] },
  { kind: 'before_escalation' },
];

function valid(r: any): ContactRule | null {
  if (r?.kind === 'after_n_questions' && Number.isInteger(r.n) && r.n > 0) return { kind: 'after_n_questions', n: r.n };
  if (r?.kind === 'on_intent' && Array.isArray(r.topics) && r.topics.every((t: unknown) => typeof t === 'string')) return { kind: 'on_intent', topics: r.topics };
  if (r?.kind === 'before_escalation') return { kind: 'before_escalation' };
  return null;
}

export function readContactRules(config: unknown): ContactRule[] {
  const raw = (config as any)?.copilot?.contact_trigger;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const rules = list.map(valid).filter(Boolean) as ContactRule[];
  return rules.length ? rules : DEFAULT_CONTACT_RULES;
}

export function shouldRequestContact(s: {
  rules: ContactRule[]; questionCount: number; topic: string | null; modelAsked: boolean;
  escalating: boolean; alreadyHaveEmail: boolean; alreadyRequested: boolean;
}): boolean {
  if (s.alreadyHaveEmail || s.alreadyRequested) return false;
  return s.rules.some((r) =>
    (r.kind === 'after_n_questions' && s.questionCount >= r.n) ||
    (r.kind === 'on_intent' && !!s.topic && r.topics.includes(s.topic) && s.modelAsked) ||
    (r.kind === 'before_escalation' && s.escalating));
}
```

- [ ] **Step 5: Implement `escalate.ts`**

```ts
/**
 * Staff escalation for the association assistant. Reuses the pure detector,
 * but writes its own English reason and email: association staff read these,
 * and the shared escalation path is written in Hebrew.
 */
import { detectEscalation } from '@/engines/escalation/detect';
import { sendEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';

export interface EscalationResult { escalated: boolean; reason: string | null; notified: number; deduped: boolean }

const REASONS: Record<string, string> = {
  legal: 'Mentions legal action',
  abuse: 'Abusive language',
  human_demand: 'Asked for a staff member',
  sustained_anger: 'Repeated frustration',
};
const DEDUPE_MS = 15 * 60 * 1000;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function escalateIfNeeded(
  input: {
    accountId: string; associationName: string; sessionId: string; visitorLabel: string;
    userMessage: string; priorUserMessages: string[]; transcript: Array<{ role: string; content: string }>; config: unknown;
  },
  deps: { detect?: typeof detectEscalation; sendEmail?: typeof sendEmail; db?: any; now?: () => Date } = {},
): Promise<EscalationResult> {
  const detect = deps.detect ?? detectEscalation;
  const send = deps.sendEmail ?? sendEmail;
  const db = deps.db ?? supabase;
  const now = (deps.now ?? (() => new Date()))();

  const v = detect(input.userMessage, input.priorUserMessages);
  if (!v.escalate) return { escalated: false, reason: null, notified: 0, deduped: false };
  const reason = REASONS[v.triggers[0]] ?? 'Needs a staff member';

  const since = new Date(now.getTime() - DEDUPE_MS).toISOString();
  const { data: recent } = await db.from('support_requests').select('id')
    .eq('session_id', input.sessionId).eq('source', 'copilot_escalation').gte('created_at', since).limit(1);
  if (recent && recent.length) return { escalated: true, reason, notified: 0, deduped: true };

  const { error } = await db.from('support_requests').insert({
    account_id: input.accountId, session_id: input.sessionId, status: 'new', source: 'copilot_escalation',
    message: input.userMessage, escalation_reason: reason, customer_email: null,
    metadata: { copilot: { triggers: v.triggers, severity: v.severity } },
  });
  if (error) console.error('[copilot/escalate]', 'insert failed', input.accountId, error.message);

  const recipients: string[] = ((input.config as any)?.copilot?.escalation?.recipients ?? []).filter((r: unknown) => typeof r === 'string' && r.includes('@'));
  if (!recipients.length) return { escalated: true, reason, notified: 0, deduped: false };

  const lines = input.transcript.slice(-12).map((m) => `<p><b>${m.role === 'user' ? 'Visitor' : 'Assistant'}:</b> ${esc(m.content)}</p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><p>A visitor on the ${esc(input.associationName)} website needs a staff member.</p><p><b>Reason:</b> ${esc(reason)}<br><b>Visitor:</b> ${esc(input.visitorLabel)}</p><hr>${lines}</div>`;
  const r = await send({ to: recipients, subject: `[${input.associationName}] Visitor needs a staff member: ${reason}`, html });
  return { escalated: true, reason, notified: r?.success ? recipients.length : 0, deduped: false };
}
```

- [ ] **Step 6: Run both tests** → PASS.
- [ ] **Step 7: Commit.**

---

### Task 7: The turn orchestrator

**Files:**
- Create: `src/lib/copilot/turn.ts`
- Test: `tests/unit/copilot/turn.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 6; `AssociationContext` (`association.ts`); `VisitorRow` (`visitors.ts`); `recordEvents`; `resolvePreviousResponseId` (`@/lib/chatbot/chain-ttl`); `recordTurnCost` (`@/lib/costs/recorder`); `ASSOCIATION_TOPICS` (`@/lib/rag/enrich`).
- Produces:
  - `type TurnEvent = { type: 'meta'; sessionId: string } | { type: 'delta'; text: string } | { type: 'sources'; items: Array<{ n: number; title: string; url: string }> } | { type: 'related'; item: { title: string; url: string } } | { type: 'event'; item: { id: string; title: string; startsOn: string; endsOn: string | null; location: string | null; url: string; registrationUrl: string | null } } | { type: 'cta'; kind: 'event' | 'join' | 'renew'; url: string } | { type: 'contact_request' } | { type: 'escalated' } | { type: 'done'; messageId: string | null } | { type: 'error'; error: string }`
  - `interface TurnDeps { db; retrieveSources; listEvents; model; escalate; recordEvents; recordCost; now: () => Date }` (defaults wired in `defaultTurnDeps()`)
  - `runCopilotTurn(input: { tenant: AssociationTenant; assoc: AssociationContext; visitor: VisitorRow; sessionId: string; message: string }, emit: (e: TurnEvent) => void, deps?: Partial<TurnDeps>): Promise<void>`
- Behaviour, in order:
  1. Load session `chat_sessions` by id: must have `account_id === tenant.accountId` and `visitor_id === visitor.id`; else `emit({type:'error', error:'unknown_session'})` and return (no writes, no model call).
  2. Load last 10 `chat_messages` (role, content) for the session, oldest first; previous response id = `resolvePreviousResponseId(session)`.
  3. Insert the user message (`chat_messages` `{session_id, role:'user', content}` `.select('id').single()`).
  4. Read config: `exclusions = config.copilot.exclusions ?? []` (strings only); `joinUrl = config.copilot.links.join ?? null`; `renewUrl = config.copilot.links.renew ?? null`; `tz = config.copilot.timezone ?? 'America/New_York'`; `today = todayIn(tz, now)`; `tone = config.copilot.tone ?? null`; name = `config.display_name ?? config.username`; website = `config.website_url ?? null`.
  5. In parallel: `retrieveSources(accountId, message, exclusions)` and `listEvents(accountId, today)`.
  6. Build instructions (`member = visitor.membership` only when `visitor.identity_source` is `ams_login`, `newsletter` or `ams_email`); `input` = history when there is no previous response id, else only the new message.
  7. Emit `meta`, stream the model through `createVisibleTextSplitter`, emitting `delta` for every non-empty visible chunk.
  8. Parse META; emit `sources` (only cited sources that have a URL, in citation order), `related` (if any, with a URL), `event` (if `eventId`), `cta` (if any).
  9. Escalation via `escalate(...)` with prior user messages from history; if escalated and not deduped emit `escalated`.
  10. Contact request via `shouldRequestContact` (`questionCount` = prior user messages + 1; `alreadyHaveEmail` = `!!visitor.email`; `alreadyRequested` = any prior assistant message whose metadata has `contact_requested: true` — loaded with the history select `role, content, metadata`); emit `contact_request` if true.
  11. Insert the assistant message with the visible text and `metadata: { copilot: { cited, related, eventId, cta, topic, contact_requested } }`, `.select('id').single()`; update session `{ last_response_id, last_turn_at: now, message_count: (session.message_count ?? 0) + 2 }`.
  12. `recordEvents` (never throws): `question` (payload `{ length }`), `topic_classified` (if topic), `resource_shown` (cited urls), `related_item_shown`, `event_suggested` (eventId), `membership_prompted` (if `meta.membershipMentioned` or cta.kind join), `renewal_prompted` (if `meta.renewalMentioned` or cta.kind renew), `contact_requested`, `escalated` (reason) — all with `sessionId` and the assistant `messageId`.
  13. `recordCost({ accountId, sessionId, usage })` (fire and forget).
  14. Emit `done` with the assistant message id.
  - On a model error: emit `{type:'error', error:'answer_unavailable'}` and still save nothing else (the user message stays saved).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCopilotTurn, type TurnEvent } from '@/lib/copilot/turn';

const tenant = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot-dev.test' };
const assoc = { accountId: 'acc', partnerId: 'pA', industry: 'motorcoach', branding: {}, openingQuestions: [],
  config: { display_name: 'American Bus Association', website_url: 'https://www.buses.org', copilot: { exclusions: ['/archive'], links: { join: 'https://buses.org/join' } } } };
const visitor = { id: 'v1', partner_id: 'pA', account_id: 'acc', anon_id: 'anon_x', email: null, identity_source: null, membership: null } as any;
const sources = [
  { n: 1, id: 'c1', title: 'Membership', url: 'https://buses.org/membership/', excerpt: 'x', entityType: 'website' },
  { n: 2, id: 'c2', title: 'Marketplace', url: 'https://buses.org/marketplace/', excerpt: 'y', entityType: 'website' },
];
const events = [{ id: 'ev1', title: 'Marketplace 2027', startsOn: '2027-01-10', endsOn: null, location: null, url: 'https://buses.org/marketplace/', registrationUrl: 'https://buses.org/register', summary: null }];

function makeDb(session: any) {
  const inserted: any[] = []; const updates: any[] = [];
  const db: any = {
    inserted, updates,
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: t === 'chat_sessions' ? session : null }),
          order: () => ({ limit: async () => ({ data: [] }) }),
        }),
      }),
      insert: (row: any) => ({ select: () => ({ single: async () => { inserted.push({ t, row }); return { data: { id: `m${inserted.length}` }, error: null }; } }) }),
      update: (patch: any) => ({ eq: async () => { updates.push({ t, patch }); return { error: null }; } }),
    }),
  };
  return db;
}

function modelSaying(text: string) {
  return vi.fn(async (p: any) => { for (const ch of text.match(/.{1,7}/gs) ?? []) p.onDelta(ch); return { text, responseId: 'resp_1', usage: [] }; });
}

let emitted: TurnEvent[];
const emit = (e: TurnEvent) => emitted.push(e);
beforeEach(() => { emitted = []; });

const META = '<<META>>{"cited":[1],"related":2,"eventId":"ev1","cta":{"kind":"join","url":"https://buses.org/join"},"askContact":true,"topic":"membership","membershipMentioned":true,"renewalMentioned":false}<</META>>';

describe('runCopilotTurn', () => {
  it('streams a cited answer with cards and records structured events', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const recordEvents = vi.fn();
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'How do I join?' }, emit, {
      db, retrieveSources: vi.fn(async () => sources), listEvents: vi.fn(async () => events),
      model: modelSaying(`You can join as an operator member [1].\n${META}`) as any,
      escalate: vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false })),
      recordEvents, recordCost: vi.fn(), now: () => new Date('2026-10-18T15:00:00Z'),
    });
    const text = emitted.filter((e) => e.type === 'delta').map((e: any) => e.text).join('');
    expect(text).toBe('You can join as an operator member [1].\n');
    expect(text).not.toContain('<<');
    expect(emitted).toContainEqual({ type: 'sources', items: [{ n: 1, title: 'Membership', url: 'https://buses.org/membership/' }] });
    expect(emitted).toContainEqual({ type: 'related', item: { title: 'Marketplace', url: 'https://buses.org/marketplace/' } });
    expect(emitted).toContainEqual(expect.objectContaining({ type: 'event', item: expect.objectContaining({ id: 'ev1' }) }));
    expect(emitted).toContainEqual({ type: 'cta', kind: 'join', url: 'https://buses.org/join' });
    expect(emitted).toContainEqual({ type: 'contact_request' });
    expect(emitted.at(-1)).toMatchObject({ type: 'done' });
    const types = (recordEvents.mock.calls[0] as any)[1].map((e: any) => e.type);
    expect(types).toEqual(expect.arrayContaining(['question', 'topic_classified', 'resource_shown', 'related_item_shown', 'event_suggested', 'membership_prompted', 'contact_requested']));
    expect(db.updates.find((u: any) => u.t === 'chat_sessions').patch).toMatchObject({ last_response_id: 'resp_1', message_count: 2 });
  });

  it('refuses a session that belongs to another visitor without calling the model', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'someone-else', message_count: 0 });
    const model = vi.fn();
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'hi' }, emit, {
      db, retrieveSources: vi.fn(), listEvents: vi.fn(), model: model as any, escalate: vi.fn(), recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date(),
    });
    expect(emitted).toEqual([{ type: 'error', error: 'unknown_session' }]);
    expect(model).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
  });

  it('passes the staff exclusions to retrieval', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    const retrieveSources = vi.fn(async () => []);
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit, {
      db, retrieveSources, listEvents: vi.fn(async () => []), model: modelSaying('I do not have that.') as any,
      escalate: vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false })), recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date(),
    });
    expect(retrieveSources).toHaveBeenCalledWith('acc', 'q', ['/archive']);
  });

  it('never surfaces an event the model invented', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'events?' }, emit, {
      db, retrieveSources: vi.fn(async () => sources), listEvents: vi.fn(async () => []),
      model: modelSaying('See you there.\n<<META>>{"cited":[],"eventId":"ev-old"}<</META>>') as any,
      escalate: vi.fn(async () => ({ escalated: false, reason: null, notified: 0, deduped: false })), recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date(),
    });
    expect(emitted.find((e) => e.type === 'event')).toBeUndefined();
  });

  it('reports a model failure as answer_unavailable', async () => {
    const db = makeDb({ id: 's1', account_id: 'acc', visitor_id: 'v1', message_count: 0 });
    await runCopilotTurn({ tenant, assoc: assoc as any, visitor, sessionId: 's1', message: 'q' }, emit, {
      db, retrieveSources: vi.fn(async () => []), listEvents: vi.fn(async () => []), model: vi.fn(async () => { throw new Error('down'); }) as any,
      escalate: vi.fn(), recordEvents: vi.fn(), recordCost: vi.fn(), now: () => new Date(),
    });
    expect(emitted.at(-1)).toEqual({ type: 'error', error: 'answer_unavailable' });
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

- [ ] **Step 3: Implement `turn.ts`** following the behaviour list above exactly, using the injected deps (`deps.db` in place of `supabase` everywhere). Write the defaults as:

```ts
export function defaultTurnDeps(): TurnDeps {
  return {
    db: supabase,
    retrieveSources: retrieveAssociationSources,
    listEvents: listUpcomingEvents,
    model: streamCopilotModel,
    escalate: escalateIfNeeded,
    recordEvents,
    recordCost: (p) => { void recordTurnCost(p); },
    now: () => new Date(),
  };
}
```

and merge `{ ...defaultTurnDeps(), ...deps }` at the top of `runCopilotTurn`. The history select is `.from('chat_messages').select('role, content, metadata').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(10)` then reversed. The session select is `.from('chat_sessions').select('id, account_id, visitor_id, message_count, last_response_id, last_turn_at, created_at').eq('id', sessionId).maybeSingle()`.

If the test's db mock does not model a chain you need, extend the mock minimally (never weaken an assertion) and say so in the report.

- [ ] **Step 4: Run tests** → PASS (5). Then `npx vitest run tests/unit/copilot`.
- [ ] **Step 5: Commit.**

---

### Task 8: `POST /api/partner/v1/chat`

**Files:**
- Create: `src/app/api/partner/v1/chat/route.ts`
- Test: `tests/unit/copilot/chat-route.test.ts`

**Interfaces:**
- Consumes: `requireTenant`, `loadAssociation`, `getVisitor`, `checkChatLimits`, `MAX_MESSAGE_CHARS`, `runCopilotTurn`.
- Request: `{ visitorId: string; sessionId: string (uuid); message: string }`.
- Responses: 400 `invalid_request` (missing fields, non-uuid sessionId, empty message), 413 `message_too_long`, 404 `unknown_visitor` / `association_unavailable`, 429/503 from the limiter (with `Retry-After` seconds header), else 200 NDJSON stream of `TurnEvent`s. `export const maxDuration = 60;`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const T = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot-dev.test' };
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: vi.fn(async () => T) }));
vi.mock('@/lib/copilot/association', () => ({ loadAssociation: vi.fn(async () => ({ accountId: 'acc', partnerId: 'pA', industry: null, branding: {}, openingQuestions: [], config: {} })) }));
const getVisitor = vi.fn();
vi.mock('@/lib/copilot/visitors', () => ({ getVisitor: (...a: any[]) => getVisitor(...a) }));
const checkChatLimits = vi.fn();
vi.mock('@/lib/copilot/rate-limit', () => ({ MAX_MESSAGE_CHARS: 2000, checkChatLimits: (...a: any[]) => checkChatLimits(...a) }));
const runCopilotTurn = vi.fn();
vi.mock('@/lib/copilot/turn', () => ({ runCopilotTurn: (...a: any[]) => runCopilotTurn(...a) }));

import { POST } from '@/app/api/partner/v1/chat/route';

const SID = '11111111-2222-4333-8444-555555555555';
const req = (b: any) => new Request('http://x/api/partner/v1/chat', { method: 'POST', body: JSON.stringify(b) }) as any;
async function readNdjson(res: Response) {
  const text = await res.text();
  return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

beforeEach(() => {
  getVisitor.mockResolvedValue({ id: 'v1', anon_id: 'anon_aaaaaaaaaaaaaaaa' });
  checkChatLimits.mockResolvedValue({ allowed: true });
  runCopilotTurn.mockImplementation(async (_i: any, emit: any) => { emit({ type: 'delta', text: 'Hi' }); emit({ type: 'done', messageId: 'm1' }); });
});

describe('POST /chat', () => {
  it('streams NDJSON turn events', async () => {
    const res = await POST(req({ visitorId: 'v1', sessionId: SID, message: 'hello' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    expect(await readNdjson(res)).toEqual([{ type: 'delta', text: 'Hi' }, { type: 'done', messageId: 'm1' }]);
    expect(checkChatLimits).toHaveBeenCalledWith({ accountId: 'acc', anonId: 'anon_aaaaaaaaaaaaaaaa' });
  });
  it('validates input before rate limiting or calling the turn', async () => {
    expect((await POST(req({ visitorId: 'v1', sessionId: 'nope', message: 'x' }))).status).toBe(400);
    expect((await POST(req({ visitorId: 'v1', sessionId: SID, message: '   ' }))).status).toBe(400);
    expect((await POST(req({ visitorId: 'v1', sessionId: SID, message: 'x'.repeat(2001) }))).status).toBe(413);
    expect(runCopilotTurn).not.toHaveBeenCalled();
  });
  it('404 for a visitor of another association', async () => {
    getVisitor.mockResolvedValueOnce(null);
    expect((await POST(req({ visitorId: 'vX', sessionId: SID, message: 'x' }))).status).toBe(404);
    expect(runCopilotTurn).not.toHaveBeenCalled();
  });
  it('passes limiter refusals through with Retry-After', async () => {
    checkChatLimits.mockResolvedValueOnce({ allowed: false, status: 429, error: 'rate_limited', retryAfterMs: 4200 });
    const res = await POST(req({ visitorId: 'v1', sessionId: SID, message: 'x' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(runCopilotTurn).not.toHaveBeenCalled();
  });
  it('turns an unexpected throw into an error event, not a broken stream', async () => {
    runCopilotTurn.mockImplementationOnce(async () => { throw new Error('kaboom'); });
    const lines = await readNdjson(await POST(req({ visitorId: 'v1', sessionId: SID, message: 'x' })));
    expect(lines.at(-1)).toEqual({ type: 'error', error: 'answer_unavailable' });
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

- [ ] **Step 3: Implement**

```ts
import { requireTenant } from '@/lib/copilot/auth';
import { loadAssociation } from '@/lib/copilot/association';
import { getVisitor } from '@/lib/copilot/visitors';
import { checkChatLimits, MAX_MESSAGE_CHARS } from '@/lib/copilot/rate-limit';
import { runCopilotTurn, type TurnEvent } from '@/lib/copilot/turn';
import type { AssociationTenant } from '@/lib/copilot/tenant';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (status: number, error: string, headers?: Record<string, string>) => Response.json({ error }, { status, headers });

export async function POST(req: Request) {
  const t = await requireTenant(req, { association: true });
  if (t instanceof Response) return t;
  const tenant = t as AssociationTenant;

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!body || typeof body.visitorId !== 'string' || typeof body.sessionId !== 'string' || !UUID.test(body.sessionId) || !message) {
    return bad(400, 'invalid_request');
  }
  if (message.length > MAX_MESSAGE_CHARS) return bad(413, 'message_too_long');

  const visitor = await getVisitor(tenant, body.visitorId);
  if (!visitor) return bad(404, 'unknown_visitor');

  const limit = await checkChatLimits({ accountId: tenant.accountId, anonId: visitor.anon_id });
  if (limit.allowed === false) return bad(limit.status, limit.error, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });

  const assoc = await loadAssociation(tenant);
  if (!assoc) return bad(404, 'association_unavailable');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: TurnEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      try {
        await runCopilotTurn({ tenant, assoc, visitor, sessionId: body.sessionId, message }, emit);
      } catch (e) {
        console.error('[copilot/chat]', 'turn threw', tenant.accountId, e instanceof Error ? e.message : e);
        emit({ type: 'error', error: 'answer_unavailable' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
```

- [ ] **Step 4: Run tests** → PASS (5). Then `npx vitest run tests/unit/copilot` and the scoped tsc grep.
- [ ] **Step 5: Commit.**

---

### Task 9: `POST /contact` and gated `POST /recap`

**Files:**
- Create: `src/app/api/partner/v1/contact/route.ts`
- Create: `src/app/api/partner/v1/recap/route.ts`
- Create: `src/lib/copilot/recap.ts`
- Test: `tests/unit/copilot/contact-route.test.ts`, `tests/unit/copilot/recap.test.ts`

**Interfaces:**
- `/contact` request `{ visitorId, sessionId? (uuid), email, name?, company?, consent: true }`:
  - 400 `invalid_request` if `consent !== true` or the email fails `normalizeEmail`;
  - resolves identity with `identityFromEmail(email, getAmsAdapter(assoc.config))`; if it returns an update, `applyIdentity(tenant, visitor, { ...update, name: name ?? update.name, company: update.company ?? company })`; an `IdentityConflictError` is caught (contact is still recorded, identity unchanged, response `identity: 'conflict'`);
  - if no identity update (consumer email, not a member), still store the email/name/company on the visitor when those columns are empty: `supabase.from('visitors').update({...}).eq('id', visitor.id).is('email', null)`;
  - emails `config.copilot.escalation.recipients` (if any) an English "New contact from the website assistant" note with name, email, company and the session's last 12 messages (reuse the escape helper pattern from `escalate.ts`);
  - records `contact_captured` (payload `{ source: identity source or 'email_only' }`) and `ams_unavailable` when flagged;
  - response `{ ok: true, identity: 'member' | 'company' | 'email_only' | 'conflict' }`.
- `recap.ts`: `buildRecapEmail(p: { associationName: string; messages: Array<{ role: string; content: string; metadata?: any }>; sources: Array<{ title: string; url: string }> }): { subject: string; html: string }` — English, escaped, lists the conversation and the cited links.
- `/recap` request `{ visitorId, sessionId (uuid), email? }`: returns 409 `recap_not_configured` unless `config.copilot.recap.enabled === true`; otherwise sends to the visitor's email (body email or `visitor.email`; 400 `email_required` if neither), records `recap_sent`, responds `{ ok: true }`. Session ownership is checked as in Task 7 (404 `unknown_session`).

- [ ] **Step 1: Write failing tests** covering, for `/contact`: member found through the stub AMS → `identity: 'member'` and `applyIdentity` called with source `ams_email`; business domain → `'company'`; gmail → `'email_only'` and the direct visitor update; missing consent → 400; `IdentityConflictError` → 200 with `'conflict'` and `contact_captured` still recorded. For `recap.ts`: subject `Your conversation with the ${associationName} assistant`, escaping of `<`, the cited links listed, no Hebrew characters, no vendor names. For `/recap`: 409 when not enabled; 400 `email_required`; 200 + `recap_sent` when enabled. Mock modules exactly as in `tests/unit/copilot/identify-route.test.ts` (spread the original `@/lib/copilot/visitors` so `IdentityConflictError` keeps its identity).
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement the three files** per the interface above. Contact emails and recap emails go through `sendEmail` from `@/lib/email`.
- [ ] **Step 4: Run tests**, then `npx vitest run tests/unit/copilot` and the scoped tsc grep.
- [ ] **Step 5: Commit.**

Note: `sendEmail` sends from the platform mailbox today (the `From` name is fixed in `buildRawEmail`). That is why `/recap` is gated off: it must not reach visitors until Multiview's sender domain is set up (Plan 5). Staff notifications in `/contact` and `escalate.ts` are internal and acceptable now.

---

### Task 10: Smoke test for the chat turn

**Files:**
- Modify: `scripts/copilot-smoke.ts`

- [ ] **Step 1:** After the existing checks, add a chat check: open a fresh session (`smoke_` anon id), POST `/chat` with `"What are the benefits of ABA membership?"`, read the NDJSON body line by line, and assert: status 200; at least one `delta`; the concatenated delta text has no `<<META` and no vendor names; a `done` event arrives; if a `sources` event arrives every `url` starts with `http`. Print the answer's first 200 characters. Then POST `/chat` with an over-long message (2,001 chars) and assert 413. Update the header comment's count of PASS lines.
- [ ] **Step 2:** Type-check the script (same tsc command as Task 3). Do not run it.
- [ ] **Step 3: Commit.**

---

## Controller steps after all tasks (not for implementers)

1. Apply migration 151 to production; verify RLS and no anon/authenticated grants.
2. Run `scripts/copilot-extract-events.ts --account e7302108-b12f-4e3e-b8d4-a1f75cfbef41 --dry-run`, review the extracted events by eye, then run without `--dry-run`.
3. Push to main; wait for the deploy.
4. Run the smoke script against production (Node 22), then delete the `smoke_` sessions and visitors for the ABA account.
5. Read three real answers end to end (membership, events, an off-topic question) and check citations, links and tone.

## What Plan 2 deliberately leaves out

- The white-label app and widget (Plan 3), the admin console and reporting API (Plan 4), the real AMS adapter, custom sender domain and ABA go-live (Plan 5).
- Rolling conversation summaries (the shared helper writes Hebrew). Context is the Responses chain plus the last 10 messages, bounded by the existing chain brake.
- Live staff takeover and AI-drafted replies (contract: next release).
