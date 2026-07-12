# Meta App Review — Instagram API Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an English/LTR "Meta API Console" to `/admin/influencers/[id]` that performs live Instagram Graph API calls for all four permissions, showing request + raw response + success state — producing a compliant Meta App Review screencast after the "static examples" rejection.

**Architecture:** A self-contained React console (`MetaApiConsole`) composed of one shared `ApiCallCard` per capability. Each card calls a thin admin API route under `/api/admin/meta-review/*` that resolves the account's connection from `ig_graph_connections`, calls `graph.instagram.com/v22.0`, and returns `{ requests, response, ok }` with the access token redacted server-side. A small OAuth `returnTo` change lets the Reconnect button land back on the console.

**Tech Stack:** Next.js 16 App Router, React client components, TypeScript, Tailwind, Vitest. Instagram Graph API (Instagram Business Login) `v22.0` on `https://graph.instagram.com`.

**Spec:** `docs/superpowers/specs/2026-07-12-meta-app-review-console-design.md`

## Global Constraints

- **Read-only on the profile except DM replies.** The only write/publish call in the whole console is `POST /{ig-id}/messages` (DM reply). No comment reply/hide/delete, no profile/media edits.
- **Access token never leaves the server.** It is read from `ig_graph_connections`, used server-side, and redacted (`access_token=***REDACTED***`) in every `request.url` returned to the client. It must never appear in a client response body.
- **English, LTR.** The console renders inside `<div dir="ltr" lang="en">`. All labels/tooltips in English.
- **Graph version + host:** `https://graph.instagram.com/v22.0`.
- **Admin-gated.** Every `/api/admin/meta-review/*` route starts with `requireAdminAuth()`.
- **Uniform endpoint contract:** every endpoint returns `{ requests: RequestMeta[]; response: unknown; ok: boolean }` (plus optional extra fields like `businessIgId`). Graph-level errors are returned in `response` with `ok:false` and HTTP 200 — never thrown — so the UI can display the real error.
- **Git:** commit per task; push to `main` at the end (project convention — no feature branch).

---

## File Structure

**Create:**
- `src/lib/meta-review/util.ts` — pure helpers: `redactToken`, `isSafeReturnTo`, `RequestMeta` type.
- `src/lib/meta-review/graph.ts` — `callGraph` fetch wrapper, `GRAPH_BASE`.
- `src/lib/instagram-graph/get-connection.ts` — `getIgConnectionForAccount` (DB resolver).
- `src/app/api/admin/meta-review/profile/route.ts` — basic (GET).
- `src/app/api/admin/meta-review/insights/route.ts` — insights (GET).
- `src/app/api/admin/meta-review/conversations/route.ts` — messages read (GET).
- `src/app/api/admin/meta-review/send-message/route.ts` — DM reply (POST).
- `src/app/api/admin/meta-review/comments/route.ts` — comments read (GET).
- `src/components/admin/meta-review/ApiCallCard.tsx` — shared live-call UI primitive.
- `src/components/admin/meta-review/MetaApiConsole.tsx` — the console (composes blocks).
- `docs/meta-app-review/screencast-runbook.md` — recording runbook.
- `tests/unit/meta-review-util.test.ts`, `tests/unit/meta-review-graph.test.ts` — unit tests.

**Modify:**
- `src/app/api/auth/instagram/connect/route.ts` — carry `returnTo` in state.
- `src/app/api/auth/instagram/callback/route.ts` — redirect to a safe `returnTo`.
- `src/app/admin/influencers/[id]/page.tsx` — render `<MetaApiConsole accountId={id} />`.

---

### Task 1: Pure helpers — token redaction + returnTo validation

**Files:**
- Create: `src/lib/meta-review/util.ts`
- Test: `tests/unit/meta-review-util.test.ts`

**Interfaces:**
- Produces: `type RequestMeta = { method: 'GET' | 'POST'; url: string; note?: string }`; `redactToken(url: string): string`; `isSafeReturnTo(path: string | null | undefined): path is string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/meta-review-util.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { redactToken, isSafeReturnTo } from '@/lib/meta-review/util';

describe('redactToken', () => {
  it('redacts the token when it is the last query param', () => {
    expect(redactToken('https://graph.instagram.com/v22.0/me?fields=id&access_token=ABC123'))
      .toBe('https://graph.instagram.com/v22.0/me?fields=id&access_token=***REDACTED***');
  });
  it('redacts the token when it is the first query param', () => {
    expect(redactToken('https://x/me?access_token=SECRET&fields=id'))
      .toBe('https://x/me?access_token=***REDACTED***&fields=id');
  });
  it('leaves a URL with no token untouched', () => {
    expect(redactToken('https://x/me?fields=id')).toBe('https://x/me?fields=id');
  });
});

describe('isSafeReturnTo', () => {
  it('accepts a relative admin path with a hash', () => {
    expect(isSafeReturnTo('/admin/influencers/abc#meta-api-console')).toBe(true);
  });
  it('rejects protocol-relative, absolute, and backslash URLs', () => {
    expect(isSafeReturnTo('//evil.com')).toBe(false);
    expect(isSafeReturnTo('https://evil.com')).toBe(false);
    expect(isSafeReturnTo('/\\evil.com')).toBe(false);
  });
  it('rejects null and empty', () => {
    expect(isSafeReturnTo(null)).toBe(false);
    expect(isSafeReturnTo('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/meta-review-util.test.ts`
Expected: FAIL — cannot resolve `@/lib/meta-review/util`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/meta-review/util.ts`:

```ts
export type RequestMeta = { method: 'GET' | 'POST'; url: string; note?: string };

/** Replace the access_token query value so it is never shown to the client or logged. */
export function redactToken(url: string): string {
  return url.replace(/(access_token=)[^&]+/gi, '$1***REDACTED***');
}

/** Allow ONLY same-origin relative paths as an OAuth returnTo (prevents open redirect). */
export function isSafeReturnTo(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith('/')) return false; // must be relative
  if (path.startsWith('//')) return false; // protocol-relative → external host
  if (path.startsWith('/\\')) return false; // backslash trick some browsers treat as //
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/meta-review-util.test.ts`
Expected: PASS (3 + 3 assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta-review/util.ts tests/unit/meta-review-util.test.ts
git commit -m "feat(meta-review): pure helpers for token redaction + returnTo validation"
```

---

### Task 2: Graph fetch wrapper + connection resolver

**Files:**
- Create: `src/lib/meta-review/graph.ts`
- Create: `src/lib/instagram-graph/get-connection.ts`
- Test: `tests/unit/meta-review-graph.test.ts`

**Interfaces:**
- Consumes: `redactToken`, `RequestMeta` from Task 1.
- Produces:
  - `GRAPH_BASE = 'https://graph.instagram.com/v22.0'`
  - `callGraph(args: { method: 'GET'|'POST'; url: string; accessToken: string; body?: unknown }): Promise<{ request: RequestMeta; response: unknown; ok: boolean }>`
  - `interface IgConnection { igId: string; accessToken: string; username: string }`
  - `getIgConnectionForAccount(accountId: string): Promise<IgConnection | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/meta-review-graph.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { callGraph } from '@/lib/meta-review/graph';

afterEach(() => vi.restoreAllMocks());

describe('callGraph', () => {
  it('redacts the token in request.url and never leaks it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: '123', username: 'ldrs' }), { status: 200 })));
    const r = await callGraph({
      method: 'GET',
      url: 'https://graph.instagram.com/v22.0/me?fields=id',
      accessToken: 'SUPERSECRET',
    });
    expect(r.ok).toBe(true);
    expect(r.request.url).toContain('access_token=***REDACTED***');
    expect(r.request.url).not.toContain('SUPERSECRET');
    expect((r.response as any).username).toBe('ldrs');
  });

  it('returns the Graph error body with ok:false instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad', code: 100 } }), { status: 400 })));
    const r = await callGraph({
      method: 'GET',
      url: 'https://graph.instagram.com/v22.0/me',
      accessToken: 'X',
    });
    expect(r.ok).toBe(false);
    expect((r.response as any).error.code).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/meta-review-graph.test.ts`
Expected: FAIL — cannot resolve `@/lib/meta-review/graph`.

- [ ] **Step 3: Write `graph.ts`**

Create `src/lib/meta-review/graph.ts`:

```ts
import { redactToken, type RequestMeta } from './util';

export const GRAPH_BASE = 'https://graph.instagram.com/v22.0';

type CallGraphArgs = {
  method: 'GET' | 'POST';
  url: string; // full URL WITHOUT access_token
  accessToken: string;
  body?: unknown; // POST only
};

/**
 * Perform a single Instagram Graph API call.
 * Never throws on a Graph-level error — returns the raw response body (including
 * error JSON) with ok:false so the console can display it. Rejects only on a
 * network/transport failure.
 */
export async function callGraph({ method, url, accessToken, body }: CallGraphArgs): Promise<{
  request: RequestMeta;
  response: unknown;
  ok: boolean;
}> {
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${sep}access_token=${accessToken}`;
  const request: RequestMeta = {
    method,
    url: redactToken(fullUrl),
    note: body ? `body: ${JSON.stringify(body)}` : undefined,
  };
  const res = await fetch(fullUrl, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body && method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  const response = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
  return { request, response, ok: res.ok };
}
```

- [ ] **Step 4: Write `get-connection.ts`**

Create `src/lib/instagram-graph/get-connection.ts`:

```ts
import { supabase } from '@/lib/supabase';

export interface IgConnection {
  igId: string;
  accessToken: string;
  username: string;
}

/**
 * Resolve the newest ACTIVE Instagram connection for an account.
 * Returns null when none is connected. Uses order + limit + maybeSingle so it
 * tolerates the historical "two active rows" state (never throws like .single()).
 */
export async function getIgConnectionForAccount(accountId: string): Promise<IgConnection | null> {
  const { data, error } = await supabase
    .from('ig_graph_connections')
    .select('ig_business_account_id, access_token, ig_username, is_active, connected_at')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.access_token || !data.ig_business_account_id) return null;
  return {
    igId: data.ig_business_account_id,
    accessToken: data.access_token,
    username: data.ig_username,
  };
}
```

Note: `getIgConnectionForAccount` is a thin DB adapter (no branching logic to unit-test — the DB does the "newest active" selection via `order + limit`). It is exercised by the live dry-run in Task 12.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/meta-review-graph.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/meta-review/graph.ts src/lib/instagram-graph/get-connection.ts tests/unit/meta-review-graph.test.ts
git commit -m "feat(meta-review): callGraph wrapper + ig connection resolver"
```

---

### Task 3: Basic endpoint — profile + recent media

**Files:**
- Create: `src/app/api/admin/meta-review/profile/route.ts`

**Interfaces:**
- Consumes: `requireAdminAuth`, `getIgConnectionForAccount`, `callGraph`, `GRAPH_BASE`.
- Produces: `GET /api/admin/meta-review/profile?accountId=…` → `{ requests, response: { profile, media }, ok }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/meta-review/profile/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { callGraph, GRAPH_BASE } from '@/lib/meta-review/graph';

// instagram_business_basic — live profile + recent media
export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const profile = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me?fields=id,username,name,profile_picture_url,followers_count,media_count,biography,website`,
    accessToken: conn.accessToken,
  });
  const media = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=12`,
    accessToken: conn.accessToken,
  });

  return NextResponse.json({
    requests: [profile.request, media.request],
    response: { profile: profile.response, media: media.response },
    ok: profile.ok && media.ok,
  });
}
```

- [ ] **Step 2: Verify against the running app**

Prereq: dev server running (`npm run dev`) and an admin session cookie value in `$COOKIE` (copy `bestieai_admin_session` from the browser, value `authenticated`), and `$ACCT` = the LDRS account id.

Run:
```bash
curl -s "http://localhost:3000/api/admin/meta-review/profile?accountId=$ACCT" \
  -H "Cookie: bestieai_admin_session=authenticated" | head -c 600
```
Expected: JSON containing `"requests"`, and `"profile"` with a real `username`/`followers_count`; `request.url` contains `access_token=***REDACTED***` and NOT the real token.

If no dev server / connection is available, defer verification to the Task 12 live dry-run and note it.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/meta-review/profile/route.ts
git commit -m "feat(meta-review): basic profile + media endpoint (instagram_business_basic)"
```

---

### Task 4: Insights endpoint

**Files:**
- Create: `src/app/api/admin/meta-review/insights/route.ts`

**Interfaces:**
- Produces: `GET /api/admin/meta-review/insights?accountId=…` → `{ requests, response: { account, demographics }, ok }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/meta-review/insights/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { callGraph, GRAPH_BASE } from '@/lib/meta-review/graph';

// instagram_business_manage_insights — account insights + follower demographics.
// Each metric group is fetched independently; a partial failure (e.g. demographics
// needs 100+ followers) is surfaced in the response, not fatal. Showing real,
// sometimes-partial data further proves the call is live.
export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const account = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me/insights?metric=reach,accounts_engaged,total_interactions,profile_views&period=day&metric_type=total_value`,
    accessToken: conn.accessToken,
  });
  const demographics = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&timeframe=this_month&breakdown=city`,
    accessToken: conn.accessToken,
  });

  return NextResponse.json({
    requests: [account.request, demographics.request],
    response: { account: account.response, demographics: demographics.response },
    // Whole call is "ok" if the primary account insights returned; demographics is best-effort.
    ok: account.ok,
  });
}
```

- [ ] **Step 2: Verify against the running app**

Run:
```bash
curl -s "http://localhost:3000/api/admin/meta-review/insights?accountId=$ACCT" \
  -H "Cookie: bestieai_admin_session=authenticated" | head -c 800
```
Expected: JSON with `response.account.data[]` entries each having `name` + `total_value`. If a metric is rejected for this account, the real Graph error appears in `response.account` — capture it; the plan's defensive design intends this to be visible (adjust the metric list here if a metric is unsupported for the LDRS account, per the spec's open item).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/meta-review/insights/route.ts
git commit -m "feat(meta-review): account insights + demographics endpoint (instagram_business_manage_insights)"
```

---

### Task 5: Conversations endpoint (messages read)

**Files:**
- Create: `src/app/api/admin/meta-review/conversations/route.ts`

**Interfaces:**
- Produces: `GET /api/admin/meta-review/conversations?accountId=…` → `{ requests, response, businessIgId, ok }`. `response.data[]` = conversations, each with `participants.data[]` and `messages.data[]`. `businessIgId` lets the client pick the *other* participant as the DM recipient.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/meta-review/conversations/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { callGraph, GRAPH_BASE } from '@/lib/meta-review/graph';

// instagram_business_manage_messages — READ recent DM conversations.
export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const convos = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me/conversations?platform=instagram&fields=id,updated_time,participants,messages.limit(5){id,from,message,created_time}`,
    accessToken: conn.accessToken,
  });

  return NextResponse.json({
    requests: [convos.request],
    response: convos.response,
    businessIgId: conn.igId,
    ok: convos.ok,
  });
}
```

- [ ] **Step 2: Verify against the running app**

Run:
```bash
curl -s "http://localhost:3000/api/admin/meta-review/conversations?accountId=$ACCT" \
  -H "Cookie: bestieai_admin_session=authenticated" | head -c 800
```
Expected: JSON with `businessIgId` set and `response.data[]` conversations (present only if the account has recent DMs — see Runbook prep). If empty, the Runbook's "DM the account before recording" step provides data.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/meta-review/conversations/route.ts
git commit -m "feat(meta-review): read conversations endpoint (instagram_business_manage_messages)"
```

---

### Task 6: Send-message endpoint (the one write action)

**Files:**
- Create: `src/app/api/admin/meta-review/send-message/route.ts`

**Interfaces:**
- Consumes: `sendInstagramDM(recipientId, text, igAccountId, accessToken)` from `@/lib/instagram-graph/client`; `redactToken`.
- Produces: `POST /api/admin/meta-review/send-message` body `{ accountId, recipientId, text }` → `{ requests, response, ok }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/meta-review/send-message/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { sendInstagramDM } from '@/lib/instagram-graph/client';
import { redactToken, type RequestMeta } from '@/lib/meta-review/util';

// instagram_business_manage_messages — the ONLY write/publish action: reply via DM.
export async function POST(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId, recipientId, text } = await req.json().catch(() => ({}));
  if (!accountId || !recipientId || !text) {
    return NextResponse.json({ error: 'Missing accountId, recipientId, or text' }, { status: 400 });
  }

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const request: RequestMeta = {
    method: 'POST',
    url: redactToken(`https://graph.instagram.com/v22.0/${conn.igId}/messages?access_token=${conn.accessToken}`),
    note: `body: {"recipient":{"id":"${recipientId}"},"message":{"text":${JSON.stringify(text)}}}`,
  };

  try {
    const result = await sendInstagramDM(recipientId, text, conn.igId, conn.accessToken);
    return NextResponse.json({ requests: [request], response: result, ok: true });
  } catch (e: any) {
    return NextResponse.json({ requests: [request], response: { error: { message: e?.message || 'send failed' } }, ok: false });
  }
}
```

- [ ] **Step 2: Verify against the running app**

Run (replace `<recipient-igsid>` with a `recipientId` from the conversations response; the recipient must have DMed the account within 24h):
```bash
curl -s -X POST "http://localhost:3000/api/admin/meta-review/send-message" \
  -H "Cookie: bestieai_admin_session=authenticated" \
  -H "Content-Type: application/json" \
  -d '{"accountId":"'"$ACCT"'","recipientId":"<recipient-igsid>","text":"Hello from the LDRS App Review demo"}' | head -c 400
```
Expected: `{"requests":[...],"response":{"recipient_id":"…","message_id":"…"},"ok":true}` and the message arrives in the recipient's Instagram. Outside the 24h window the Graph error `#10`/`#551` appears in `response` with `ok:false` — expected; the Runbook prevents it.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/meta-review/send-message/route.ts
git commit -m "feat(meta-review): send DM reply endpoint (instagram_business_manage_messages write)"
```

---

### Task 7: Comments endpoint (read-only)

**Files:**
- Create: `src/app/api/admin/meta-review/comments/route.ts`

**Interfaces:**
- Produces: `GET /api/admin/meta-review/comments?accountId=…&mediaId=…` → `{ requests, response, ok }`. `response.data[]` = comments.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/meta-review/comments/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { callGraph, GRAPH_BASE } from '@/lib/meta-review/graph';

// instagram_business_manage_comments — READ-ONLY. Reading comments requires this
// permission, so a live read is a legitimate demonstration. No reply/hide/delete.
export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  const mediaId = req.nextUrl.searchParams.get('mediaId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
  if (!mediaId) return NextResponse.json({ error: 'Missing mediaId' }, { status: 400 });

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const comments = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/${mediaId}/comments?fields=id,text,username,timestamp,like_count,replies{id,text,username}`,
    accessToken: conn.accessToken,
  });

  return NextResponse.json({
    requests: [comments.request],
    response: comments.response,
    ok: comments.ok,
  });
}
```

- [ ] **Step 2: Verify against the running app**

Run (use a `mediaId` from the profile endpoint's `response.media.data`):
```bash
curl -s "http://localhost:3000/api/admin/meta-review/comments?accountId=$ACCT&mediaId=<media-id>" \
  -H "Cookie: bestieai_admin_session=authenticated" | head -c 600
```
Expected: JSON with `response.data[]` comments (present if the post has comments — see Runbook prep).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/meta-review/comments/route.ts
git commit -m "feat(meta-review): read comments endpoint (instagram_business_manage_comments, read-only)"
```

---

### Task 8: OAuth returnTo — Reconnect lands back on the console

**Files:**
- Modify: `src/app/api/auth/instagram/connect/route.ts:39` (state build)
- Modify: `src/app/api/auth/instagram/callback/route.ts:106-136` (redirect)

**Interfaces:**
- Consumes: `isSafeReturnTo` from Task 1.

- [ ] **Step 1: Add `returnTo` to the connect state**

In `src/app/api/auth/instagram/connect/route.ts`, replace the `accountId` + `state` block (lines ~22 and ~39):

```ts
  const accountId = req.nextUrl.searchParams.get('accountId') || '';
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '';
```
and
```ts
  // State parameter — passed through OAuth and returned in the callback.
  // Carries the accountId (to link the connection) and an optional returnTo
  // (so the admin console can send the user back to itself after reconnect).
  const state = encodeURIComponent(JSON.stringify({ accountId, returnTo }));
```

- [ ] **Step 2: Honor a safe `returnTo` in the callback**

In `src/app/api/auth/instagram/callback/route.ts`:

Add the import at the top (after the existing imports):
```ts
import { isSafeReturnTo } from '@/lib/meta-review/util';
```

Parse `returnTo` alongside `accountId` near the top of `GET` (extend the existing state-parse at lines 31-34):
```ts
  // Parse state to get accountId + optional returnTo for redirect
  let accountId = '';
  let returnTo = '';
  if (state) {
    try {
      const parsed = JSON.parse(decodeURIComponent(state));
      accountId = parsed.accountId || '';
      returnTo = parsed.returnTo || '';
    } catch {}
  }
```

Replace the success redirect (lines 133-136) so a safe `returnTo` wins:
```ts
    // Redirect back to the admin console if a safe returnTo was supplied,
    // otherwise the influencer "thank you" page.
    if (isSafeReturnTo(returnTo)) {
      return NextResponse.redirect(new URL(returnTo, req.url));
    }
    return NextResponse.redirect(
      new URL(`/instagram/connected?username=${encodeURIComponent(igAccount.username)}`, req.url),
    );
```

- [ ] **Step 3: Type-check the touched routes**

Run: `npm run type-check`
Expected: no NEW errors referencing `connect/route.ts` or `callback/route.ts` (the repo has pre-existing type noise; confirm nothing new about these two files or `isSafeReturnTo`).

- [ ] **Step 4: Manual verify (deferred to dry-run if no live IG)**

The full reconnect round-trip is verified in Task 12 / the Runbook. Sanity check now: `git grep -n "returnTo" src/app/api/auth/instagram` shows the param carried in both files.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/instagram/connect/route.ts src/app/api/auth/instagram/callback/route.ts
git commit -m "feat(meta-review): carry safe returnTo through IG OAuth so Reconnect returns to the console"
```

---

### Task 9: ApiCallCard — shared live-call UI primitive

**Files:**
- Create: `src/components/admin/meta-review/ApiCallCard.tsx`

**Interfaces:**
- Consumes: `RequestMeta` from Task 1.
- Produces: default export `ApiCallCard`; `interface ApiCallResult { requests: RequestMeta[]; response: unknown; ok: boolean }`.

- [ ] **Step 1: Write the component**

Create `src/components/admin/meta-review/ApiCallCard.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import type { RequestMeta } from '@/lib/meta-review/util';

export interface ApiCallResult {
  requests: RequestMeta[];
  response: unknown;
  ok: boolean;
}

interface ApiCallCardProps {
  title: string;
  permission: string;
  description: string;
  actionLabel: string;
  onRun: () => Promise<ApiCallResult>;
  disabled?: boolean;
  disabledReason?: string;
  children?: (result: ApiCallResult) => ReactNode;
}

export default function ApiCallCard({
  title, permission, description, actionLabel, onRun, disabled, disabledReason, children,
}: ApiCallCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ApiCallResult | null>(null);
  const [showRaw, setShowRaw] = useState(true); // JSON visible by default — it proves the call is live

  async function run() {
    setStatus('loading');
    try {
      const r = await onRun();
      setResult(r);
      setStatus(r.ok ? 'success' : 'error');
    } catch (e: any) {
      setResult({ requests: [], response: { error: { message: e?.message || 'Request failed' } }, ok: false });
      setStatus('error');
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="inline-block mt-1 text-[11px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
            {permission}
          </span>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">{description}</p>
        </div>
        <button
          onClick={run}
          disabled={disabled || status === 'loading'}
          title={disabled ? (disabledReason || 'Unavailable') : `Runs a live ${permission} call to the Instagram Graph API`}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? 'Calling API…' : actionLabel}
        </button>
      </div>

      {disabled && disabledReason && (
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{disabledReason}</p>
      )}

      {status !== 'idle' && result && (
        <div className="mt-4 space-y-3">
          {status === 'success' && (
            <div className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ Live API call succeeded
            </div>
          )}
          {status === 'error' && (
            <div className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              ✕ The API returned an error (shown in the response below)
            </div>
          )}

          {children && result.ok && <div>{children(result)}</div>}

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Request</div>
            <div className="p-3 space-y-1">
              {result.requests.map((r, i) => (
                <div key={i} className="font-mono text-xs text-gray-700 break-all">
                  <span className="font-bold">{r.method}</span> {r.url}
                  {r.note && <div className="text-gray-400">{r.note}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="w-full text-left px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
            >
              Response (raw JSON) {showRaw ? '▲' : '▼'}
            </button>
            {showRaw && (
              <pre className="p-3 text-xs text-gray-800 overflow-x-auto max-h-80">
                {JSON.stringify(result.response, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors referencing `ApiCallCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/meta-review/ApiCallCard.tsx
git commit -m "feat(meta-review): ApiCallCard — live request/response/success UI primitive"
```

---

### Task 10: MetaApiConsole + page injection

**Files:**
- Create: `src/components/admin/meta-review/MetaApiConsole.tsx`
- Modify: `src/app/admin/influencers/[id]/page.tsx` (render the console near the bottom, after `<EscalationContactsForm />`)

**Interfaces:**
- Consumes: `ApiCallCard`, `ApiCallResult`; endpoints from Tasks 3-7; connect route with `returnTo` from Task 8; `GET /api/admin/ig-connection` (existing).

- [ ] **Step 1: Write the console component**

Create `src/components/admin/meta-review/MetaApiConsole.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import ApiCallCard from './ApiCallCard';

interface Props { accountId: string; }

interface ConnInfo {
  ig_username?: string;
  ig_name?: string;
  ig_followers_count?: number;
  is_active?: boolean;
}
interface MediaItem { id: string; caption?: string; media_type?: string; }
interface Thread { id: string; recipientId: string; recipientName: string; lastMessage: string; }

export default function MetaApiConsole({ accountId }: Props) {
  const [conn, setConn] = useState<ConnInfo | null | undefined>(undefined);
  const [recentMedia, setRecentMedia] = useState<MediaItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState('');
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    fetch(`/api/admin/ig-connection?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => setConn(d.connection ?? null))
      .catch(() => setConn(null));
  }, [accountId]);

  const reconnectUrl =
    `/api/auth/instagram/connect?accountId=${accountId}` +
    `&returnTo=${encodeURIComponent(`/admin/influencers/${accountId}#meta-api-console`)}`;

  return (
    <div id="meta-api-console" dir="ltr" lang="en" style={{ direction: 'ltr' }} className="mt-10">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Meta API Console</h2>
        <p className="text-sm text-gray-600 mt-1">
          Live Instagram Graph API calls for App Review. Each block below performs a real API request
          and shows the request URL, the raw JSON response, and the success state.
        </p>
      </div>

      {/* Block 0 — Connection & OAuth */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-5">
        <h3 className="text-lg font-semibold text-gray-900">Connection &amp; permissions</h3>
        <p className="mt-2 text-sm text-gray-600">
          Reconnect to run the Instagram login flow and review the permissions granted to this app.
          This is the login + consent step recorded at the start of the screencast.
        </p>
        <div className="mt-3 text-sm">
          {conn === undefined && <span className="text-gray-400">Checking connection…</span>}
          {conn === null && <span className="text-amber-700">No active Instagram connection.</span>}
          {conn && (
            <span className="text-gray-800">
              Connected as <strong>@{conn.ig_username}</strong>
              {typeof conn.ig_followers_count === 'number' && <> · {conn.ig_followers_count} followers</>}
            </span>
          )}
        </div>
        <a
          href={reconnectUrl}
          className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700"
        >
          Reconnect &amp; review permissions
        </a>
      </section>

      {/* Block 1 — Basic */}
      <ApiCallCard
        title="Profile & recent media"
        permission="instagram_business_basic"
        description="Retrieves the connected account's public profile (username, name, follower count, media count) and its most recent media."
        actionLabel="Fetch profile & recent media"
        onRun={async () => {
          const res = await fetch(`/api/admin/meta-review/profile?accountId=${accountId}`);
          const json = await res.json();
          const media = (json.response?.media?.data || []) as any[];
          setRecentMedia(media.map((m) => ({ id: m.id, caption: m.caption, media_type: m.media_type })));
          if (media[0] && !selectedMedia) setSelectedMedia(media[0].id);
          return { requests: json.requests || [], response: json.response, ok: !!json.ok };
        }}
      >
        {(r) => {
          const p = (r.response as any)?.profile || {};
          return (
            <div className="flex items-center gap-3">
              {p.profile_picture_url && (
                <img src={p.profile_picture_url} alt="" className="w-14 h-14 rounded-full object-cover" />
              )}
              <div>
                <div className="font-semibold text-gray-900">
                  {p.name} <span className="text-gray-500">@{p.username}</span>
                </div>
                <div className="text-sm text-gray-600">
                  {p.followers_count} followers · {p.media_count} posts
                </div>
              </div>
            </div>
          );
        }}
      </ApiCallCard>

      {/* Block 2 — Insights */}
      <ApiCallCard
        title="Account insights"
        permission="instagram_business_manage_insights"
        description="Retrieves account-level analytics (reach, accounts engaged, total interactions, profile views) and follower demographics."
        actionLabel="Fetch account insights"
        onRun={async () => {
          const res = await fetch(`/api/admin/meta-review/insights?accountId=${accountId}`);
          const json = await res.json();
          return { requests: json.requests || [], response: json.response, ok: !!json.ok };
        }}
      >
        {(r) => {
          const rows = ((r.response as any)?.account?.data || []) as any[];
          if (!rows.length) return <div className="text-sm text-gray-500">No metric values returned.</div>;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {rows.map((m: any) => (
                <div key={m.name} className="rounded-lg border border-gray-200 p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{m.total_value?.value ?? '—'}</div>
                  <div className="text-xs text-gray-500">{m.name}</div>
                </div>
              ))}
            </div>
          );
        }}
      </ApiCallCard>

      {/* Block 3 — Messages (read + send) */}
      <ApiCallCard
        title="Direct messages — conversations"
        permission="instagram_business_manage_messages"
        description="Retrieves recent Instagram Direct conversations. Select one below to send a reply."
        actionLabel="Load conversations"
        onRun={async () => {
          const res = await fetch(`/api/admin/meta-review/conversations?accountId=${accountId}`);
          const json = await res.json();
          const bizId = json.businessIgId || '';
          const data = (json.response?.data || []) as any[];
          setThreads(
            data
              .map((c) => {
                const other = (c.participants?.data || []).find((p: any) => p.id !== bizId) || {};
                return {
                  id: c.id,
                  recipientId: other.id || '',
                  recipientName: other.username || other.id || 'unknown',
                  lastMessage: c.messages?.data?.[0]?.message || '',
                };
              })
              .filter((t: Thread) => t.recipientId),
          );
          return { requests: json.requests || [], response: json.response, ok: !!json.ok };
        }}
      />

      {threads.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Reply to conversation</label>
          <select
            value={selectedThread}
            onChange={(e) => setSelectedThread(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          >
            <option value="">Select a conversation…</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                @{t.recipientName} — {t.lastMessage.slice(0, 40)}
              </option>
            ))}
          </select>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type a reply to send via Instagram Direct…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
            rows={2}
          />
          <ApiCallCard
            title="Send reply"
            permission="instagram_business_manage_messages"
            description="Sends the reply above to the selected conversation via the Instagram Send API and shows the message id returned on success."
            actionLabel="Send reply"
            disabled={!selectedThread || !replyText.trim()}
            disabledReason="Select a conversation and type a reply first."
            onRun={async () => {
              const t = threads.find((x) => x.id === selectedThread);
              const res = await fetch('/api/admin/meta-review/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, recipientId: t?.recipientId, text: replyText }),
              });
              const json = await res.json();
              return { requests: json.requests || [], response: json.response, ok: !!json.ok };
            }}
          />
        </div>
      )}

      {/* Block 4 — Comments (read-only) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">Media to read comments from</label>
        {recentMedia.length === 0 ? (
          <p className="text-xs text-amber-700">Run “Fetch profile &amp; recent media” first to populate this list.</p>
        ) : (
          <select
            value={selectedMedia}
            onChange={(e) => setSelectedMedia(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {recentMedia.map((m) => (
              <option key={m.id} value={m.id}>
                {m.media_type} — {(m.caption || m.id).slice(0, 50)}
              </option>
            ))}
          </select>
        )}
      </div>

      <ApiCallCard
        title="Comments on media (read-only)"
        permission="instagram_business_manage_comments"
        description="Retrieves the comments on the selected media. Read-only — this console does not reply to, hide, or delete comments."
        actionLabel="Load comments"
        disabled={!selectedMedia}
        disabledReason="Select a media item above first."
        onRun={async () => {
          const res = await fetch(
            `/api/admin/meta-review/comments?accountId=${accountId}&mediaId=${encodeURIComponent(selectedMedia)}`,
          );
          const json = await res.json();
          return { requests: json.requests || [], response: json.response, ok: !!json.ok };
        }}
      >
        {(r) => {
          const items = ((r.response as any)?.data || []) as any[];
          if (!items.length) return <div className="text-sm text-gray-500">No comments on this media.</div>;
          return (
            <ul className="space-y-2">
              {items.map((c: any) => (
                <li key={c.id} className="text-sm">
                  <span className="font-semibold">@{c.username}</span> {c.text}{' '}
                  <span className="text-gray-400">· {c.like_count} likes</span>
                </li>
              ))}
            </ul>
          );
        }}
      </ApiCallCard>
    </div>
  );
}
```

- [ ] **Step 2: Render the console on the account page**

In `src/app/admin/influencers/[id]/page.tsx`:

Add the import next to the other local imports (after line 6, `import SourcesPanel from './SourcesPanel';`):
```tsx
import MetaApiConsole from '@/components/admin/meta-review/MetaApiConsole';
```

Render it just before the final closing `</div>` of the page — immediately after the existing `<EscalationContactsForm accountId={id} />` line:
```tsx
      <EscalationContactsForm accountId={id} />

      <MetaApiConsole accountId={id} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors referencing `MetaApiConsole.tsx` or `influencers/[id]/page.tsx`.

- [ ] **Step 4: Manual UI verify**

With `npm run dev` running and logged in as admin, open `/admin/influencers/<ldrs-id>#meta-api-console`. Confirm: the console renders in English/LTR; the connection line shows `@ldrs…`; "Fetch profile & recent media" returns a real profile + JSON; the comments media dropdown populates after it. (Insights/messages/comments data depends on the Runbook prep and the live LDRS token — full pass happens in Task 12.)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/meta-review/MetaApiConsole.tsx "src/app/admin/influencers/[id]/page.tsx"
git commit -m "feat(meta-review): MetaApiConsole (English/LTR live demo) on the account page"
```

---

### Task 11: Screencast Runbook

**Files:**
- Create: `docs/meta-app-review/screencast-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `docs/meta-app-review/screencast-runbook.md`:

```markdown
# Meta App Review — Screencast Runbook (LDRS Instagram)

Re-recording after the "static examples" rejection. The console lives at
`/admin/influencers/<LDRS-ACCOUNT-ID>#meta-api-console` and renders in English.
Goal: show the full login flow + a live API call per permission with the raw
JSON response and success state visible.

## Pre-recording prep

1. **Set the Instagram account language to English** (Instagram app → Settings →
   Language → English) so the OAuth consent screen renders in English.
2. **Force a fresh consent screen:** Instagram app → Settings → Apps and websites
   → remove the app, so Reconnect shows the full permission-grant screen.
3. **Messages window:** from a second Instagram account, DM the LDRS account within
   ~20 minutes of recording (opens the 24-hour reply window). Send something the
   demo can reply to.
4. **Comments:** from a second account, leave a comment on a recent LDRS post so
   there is a real comment to read.
5. **Screen text:** enable captions/tooltips; record at a resolution where the
   Request + Response panels are legible.

## Recording sequence (English captions in brackets)

1. Open `/admin/influencers/<LDRS-ACCOUNT-ID>#meta-api-console`.
   [Caption: "Admin opens the Instagram API console for the connected account."]
2. **Connection & permissions** → "Reconnect & review permissions" → complete the
   Instagram login → **show the permission grant screen listing the four
   permissions** → land back on the console.
   [Caption: "User logs in and grants the app the four Instagram Business permissions."]
3. **Profile & recent media** → "Fetch profile & recent media".
   [Caption: "instagram_business_basic — live GET /me returns the profile and media (raw JSON shown)."]
4. **Account insights** → "Fetch account insights".
   [Caption: "instagram_business_manage_insights — live GET /me/insights returns reach, engagement, demographics."]
5. **Direct messages — conversations** → "Load conversations" → select the thread
   from prep → type a reply → "Send reply" → show `✓ Live API call succeeded` and
   the returned `message_id`.
   [Caption: "instagram_business_manage_messages — live GET conversations, then POST a reply; message id returned."]
6. **Comments on media (read-only)** → pick the post from prep → "Load comments".
   [Caption: "instagram_business_manage_comments — live GET comments returns the real comment thread."]

Keep the Request + Response panels visible in every step to prove each call is live.

## Notes for the submission form

- The Meta login/authentication flow is **visible** in the screencast (step 2) —
  this is a frontend-initiated flow, not server-to-server.
- `instagram_business_manage_comments` is demonstrated by a **live read** (which
  requires the permission). The app intentionally does not modify the profile
  beyond replying to Direct Messages.
```

- [ ] **Step 2: Commit**

```bash
git add docs/meta-app-review/screencast-runbook.md
git commit -m "docs(meta-review): screencast runbook for App Review re-submission"
```

---

### Task 12: Full verification + push

**Files:** none (verification + push)

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run tests/unit/meta-review-util.test.ts tests/unit/meta-review-graph.test.ts`
Expected: all green.

- [ ] **Step 2: Type-check the project**

Run: `npm run type-check`
Expected: no NEW errors in any `meta-review` file, the two OAuth routes, or the account page. (Pre-existing repo errors elsewhere are acceptable — compare against a pre-change baseline if unsure.)

- [ ] **Step 3: Live dry-run (the real proof — same steps as the screencast)**

With `npm run dev` and the LDRS connection, walk the console end-to-end per the Runbook: Reconnect round-trips back to `#meta-api-console`; each of the four blocks returns a real Graph response with the token redacted in every displayed Request. Fix any metric/field that the live LDRS token rejects (see the spec's insights open item) and re-commit that endpoint if changed.

- [ ] **Step 4: Push to main**

```bash
git push origin main
```

- [ ] **Step 5: Confirm**

Report: unit tests green, type-check clean for the new files, live dry-run screenshots/notes captured, pushed. Hand the Runbook to Ido for recording.

---

## Self-Review

**Spec coverage:**
- §5.1 page section (English/LTR) → Task 10. ✓
- §5.2 `ApiCallCard` (request + response + success) → Task 9. ✓
- §5.3 all endpoints (profile, insights, conversations, send-message, comments) → Tasks 3-7. ✓ (comment-reply/hide intentionally absent per read-only constraint.)
- §5.4 `getIgConnectionForAccount` + `redactToken` → Tasks 1-2. ✓
- §5.5 OAuth `returnTo` → Task 8. ✓
- §5.6 five blocks (Connection, Basic, Insights, Messages, Comments) → Task 10. ✓
- §8 security (admin-gate, token redaction, safe returnTo) → Tasks 1-8. ✓
- §9 testing (redactToken, isSafeReturnTo, callGraph, live verify) → Tasks 1-2, 12. ✓
- §10 Runbook → Task 11. ✓
- Read-only constraint (Global Constraints) → enforced by the endpoint set (only send-message writes). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; every command has an expected result. The only intentional runtime unknowns are the live Graph field/metric combos (flagged as a spec open item, resolved during the Task 12 dry-run). ✓

**Type consistency:** `RequestMeta` (Task 1) used identically in `callGraph` (Task 2), `ApiCallCard` (Task 9), and `send-message` (Task 6). `ApiCallResult { requests, response, ok }` (Task 9) matches every endpoint's return shape (Tasks 3-7) and every `onRun` in the console (Task 10). `getIgConnectionForAccount → { igId, accessToken, username }` consumed consistently in Tasks 3-7. `isSafeReturnTo` (Task 1) consumed in Task 8. ✓
