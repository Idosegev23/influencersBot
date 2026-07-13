# Onboarding Wizard — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Admin generates a shareable onboarding link → a public token-guarded wizard where the creator connects Instagram, enters website/tiktok/youtube/whatsapp/email, and starts the full scan with live progress.

**Architecture:** A draft account + a 144-bit token are created on the admin action and stamped into `accounts.config.onboarding`. The public `/onboard/[token]` page resolves the draft by token, drives the open IG-connect route (returnTo back to itself), and a token-guarded `start` endpoint persists sources + owner contact and calls the existing `startPipeline`. Progress reuses the public `/api/pipeline/status/[jobId]`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Instagram Graph, QStash pipeline, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-account-onboarding-wizard-design.md`

## Global Constraints
- **Token IS the auth** for the public wizard + start endpoint (144-bit `randomBytes(18).base64url`; possession = authorization, scoped to one draft account).
- **Reuse, don't reinvent:** `startPipeline` (`src/lib/pipeline/start.ts`), the public status route `/api/pipeline/status/[jobId]`, `config.sources` shape `{instagram,website,youtube,tiktok}`, `appBaseUrl()` (`src/lib/crm/quotes.ts`), the open connect route `/api/auth/instagram/connect?accountId=&returnTo=`.
- `start` is **idempotent**: reject unless `config.onboarding.status ∈ {draft, filled}`.
- No secrets returned to the client; the token never grants cross-account access.
- Draft account: `config.username` is a slug placeholder until Start, then set to the connected IG handle.
- Commit per task; review workflow before push.

---

## File Structure
- Create `src/lib/onboarding/tokens.ts` — `newOnboardingToken()`, `slugifyAccountName(name)`, `onboardingLinkFor(token)`.
- Create `src/lib/onboarding/resolve.ts` — `resolveDraftByToken(token)` (server).
- Create `src/app/api/admin/onboarding/create/route.ts` — admin POST → draft + token + link.
- Create `src/app/api/onboard/[token]/status/route.ts` — public GET (connection + onboarding state).
- Create `src/app/api/onboard/[token]/start/route.ts` — public token POST → persist + `startPipeline`.
- Create `src/app/onboard/[token]/page.tsx` + `OnboardWizard.tsx` — the public wizard UI.
- Test `tests/unit/onboarding-tokens.test.ts`.

---

### Task 1: Token + slug helpers

**Files:** Create `src/lib/onboarding/tokens.ts`; Test `tests/unit/onboarding-tokens.test.ts`.
**Produces:** `newOnboardingToken(): string`; `slugifyAccountName(name: string): string`; `onboardingLinkFor(token: string): string`.

```ts
import { randomBytes } from 'crypto';
import { appBaseUrl } from '@/lib/crm/quotes';

/** 144-bit URL-safe onboarding token (same strength as signature/quote tokens). */
export function newOnboardingToken(): string {
  return randomBytes(18).toString('base64url');
}

/** URL-safe slug from an account name, for the draft account's placeholder username. */
export function slugifyAccountName(name: string): string {
  const base = (name || 'account')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'account';
}

export function onboardingLinkFor(token: string): string {
  return `${appBaseUrl()}/onboard/${token}`;
}
```

Test: token is URL-safe + unique across calls; slug strips accents/spaces/symbols, lowercases, non-empty fallback; link ends with `/onboard/<token>`.

- [ ] Write test → run (fail) → implement → run (pass) → commit.

---

### Task 2: Admin create-draft endpoint

**Files:** Create `src/app/api/admin/onboarding/create/route.ts`.
**Consumes:** `requireAdminAuth`, `newOnboardingToken`, `slugifyAccountName`, `onboardingLinkFor`, `supabase`.
**Produces:** `POST /api/admin/onboarding/create` body `{ accountName, clientName }` → `{ accountId, token, link }`.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { supabase } from '@/lib/supabase';
import { newOnboardingToken, slugifyAccountName, onboardingLinkFor } from '@/lib/onboarding/tokens';

export async function POST(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountName, clientName } = await req.json().catch(() => ({}));
  if (!accountName?.trim()) return NextResponse.json({ error: 'accountName required' }, { status: 400 });

  const token = newOnboardingToken();
  // Placeholder username (unique) until the creator connects Instagram; the real
  // IG handle replaces it at Start.
  const username = `${slugifyAccountName(accountName)}-${token.slice(0, 6).toLowerCase()}`;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      type: 'creator',
      status: 'active',
      config: {
        username,
        display_name: accountName.trim(),
        onboarding: {
          token,
          status: 'draft',
          accountName: accountName.trim(),
          clientName: (clientName || '').trim(),
          createdAt: now,
        },
      },
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[onboarding/create] insert failed:', error?.message);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  return NextResponse.json({ accountId: data.id, token, link: onboardingLinkFor(token) });
}
```

- [ ] Write route → curl with admin cookie returns `{link}` → commit.

---

### Task 3: Draft resolver + public onboard status

**Files:** Create `src/lib/onboarding/resolve.ts`, `src/app/api/onboard/[token]/status/route.ts`.
**Produces:**
- `resolveDraftByToken(token: string): Promise<{ id: string; config: any } | null>`.
- `GET /api/onboard/[token]/status` → `{ accountName, clientName, status, sources, connected, igUsername, jobId }`.

`resolve.ts`:
```ts
import { supabase } from '@/lib/supabase';

export async function resolveDraftByToken(token: string): Promise<{ id: string; config: any } | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('config->onboarding->>token', token)
    .maybeSingle();
  return data || null;
}
```

`status/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const draft = await resolveDraftByToken(token);
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ob = draft.config?.onboarding || {};
  const { data: conn } = await supabase
    .from('ig_graph_connections')
    .select('ig_username, is_active')
    .eq('account_id', draft.id)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    accountName: ob.accountName || draft.config?.display_name || '',
    clientName: ob.clientName || '',
    status: ob.status || 'draft',
    sources: draft.config?.sources || {},
    connected: !!conn,
    igUsername: conn?.ig_username || null,
    jobId: ob.jobId || null,
  });
}
```

- [ ] Write both → GET returns the draft state → commit.

---

### Task 4: Token-guarded start endpoint

**Files:** Create `src/app/api/onboard/[token]/start/route.ts`.
**Consumes:** `resolveDraftByToken`, `startPipeline`, `supabase`, `normalizeIgUsername` (`@/lib/pipeline/username`).
**Produces:** `POST /api/onboard/[token]/start` body `{ website, tiktok, youtube, whatsapp, email }` → `{ jobId }`.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveDraftByToken } from '@/lib/onboarding/resolve';
import { startPipeline } from '@/lib/pipeline/start';
import { normalizeIgUsername } from '@/lib/pipeline/username';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const draft = await resolveDraftByToken(token);
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ob = draft.config?.onboarding || {};
  if (!['draft', 'filled'].includes(ob.status)) {
    return NextResponse.json({ error: 'already started', jobId: ob.jobId || null }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const website = (body.website || '').trim();
  const tiktok = (body.tiktok || '').trim();
  const youtube = (body.youtube || '').trim();
  const whatsapp = (body.whatsapp || '').trim();
  const email = (body.email || '').trim();

  // Require a connected Instagram (the account's scannable anchor + login handle).
  const { data: conn } = await supabase
    .from('ig_graph_connections')
    .select('ig_username, is_active')
    .eq('account_id', draft.id)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn?.ig_username) return NextResponse.json({ error: 'connect_instagram_first' }, { status: 422 });

  const igHandle = normalizeIgUsername(conn.ig_username);
  const sources = { instagram: igHandle, website, youtube, tiktok };

  // Persist sources + owner contact; set username to the real IG handle; mark scanning.
  const nextConfig = {
    ...draft.config,
    username: igHandle,
    sources,
    onboarding: { ...ob, status: 'scanning', ownerWhatsapp: whatsapp, ownerEmail: email },
  };
  await supabase.from('accounts').update({ config: nextConfig }).eq('id', draft.id);

  const result = await startPipeline({
    accountId: draft.id,
    username: igHandle,
    websiteUrl: website || null,
    youtube: youtube || undefined,
    tiktok: tiktok || undefined,
    archetype: 'influencer',
    isDemo: false,
    scanMode: 'full',
    requestedBy: 'onboarding',
  });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  // Stash the jobId for the status endpoint + completion hook (Phase 2).
  await supabase
    .from('accounts')
    .update({ config: { ...nextConfig, onboarding: { ...nextConfig.onboarding, jobId: result.jobId } } })
    .eq('id', draft.id);

  return NextResponse.json({ jobId: result.jobId });
}
```

- [ ] Write route → (live) start returns a jobId; second call 409 → commit.

---

### Task 5: The public wizard page + UI

**Files:** Create `src/app/onboard/[token]/page.tsx` (server, `force-dynamic`), `src/app/onboard/[token]/OnboardWizard.tsx` (`'use client'`).

`page.tsx`: `resolveDraftByToken`; if null → `notFound()`; else render `<OnboardWizard token={token} />`.

`OnboardWizard.tsx` — a polished, single-column, LTR/RTL-agnostic branded page:
- On mount + after focus, `GET /api/onboard/[token]/status`.
- Header: "Welcome, {accountName}" + a short subline.
- **Connect Instagram** card: if `connected` → "Connected as @X ✓"; else a button →
  `/api/auth/instagram/connect?accountId=<draft.id from status? no — use a connect link built server-side>`.
  (The status response does NOT expose accountId; instead expose a `connectUrl` from the status
  endpoint: `connectUrl = /api/auth/instagram/connect?accountId=<id>&returnTo=/onboard/<token>` —
  add `connectUrl` to Task 3's response so the client never needs the raw accountId.)
- Fields: website, TikTok, YouTube, WhatsApp, email (controlled inputs).
- **Start** button: disabled until `connected` && whatsapp && email present → `POST start` → on `{jobId}` switch to progress view.
- **Progress view**: poll `GET /api/pipeline/status/{jobId}` every 2500ms; render a step list with a percent bar (mirror the public fields `percent`, `currentStep`, `steps`, `status`); on terminal `status` show a "we'll message you when it's ready" done state.

> Task 3 addendum: add `connectUrl: \`/api/auth/instagram/connect?accountId=${draft.id}&returnTo=/onboard/${token}\`` to the status response so the client gets the connect link without the raw accountId leaking as a separate field it must assemble.

- [ ] Build page + wizard → type-check clean → manual: open a created link, connect, fill, start, watch progress → commit.

---

### Task 6: Verify + review workflow + push
- [ ] `npx vitest run tests/unit/onboarding-tokens.test.ts` green; `npm run type-check` clean for the new files.
- [ ] Adversarial review workflow (token isolation / idempotency / no-accountId-leak / start validation) over the new endpoints + page; apply confirmed fixes.
- [ ] `git push origin main`.

---

## Self-Review
- **Spec coverage (Phase 1):** admin link-gen (T2), token+draft (T1/T2), public wizard + connect + fields + start + progress (T5), token-guarded start → startPipeline (T4), status/resolve (T3). ✓ (Phases 2 notify + 3 tutorial are out of this plan by design.)
- **Placeholders:** none — full code for T1-T4; T5 UI specified against exact endpoints (built inline). ✓
- **Type consistency:** `resolveDraftByToken → {id,config}` consumed identically in T3/T4; `config.onboarding.{token,status,jobId,ownerWhatsapp,ownerEmail}` written in T2/T4 and read in T3; `startPipeline` input matches `StartPipelineInput`. `connectUrl` added to T3 response, consumed in T5. ✓
