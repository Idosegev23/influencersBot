# Co-Pilot Plan 3: White-Label App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A separate, fully white-labelled Next.js app (`multiview-copilot`, its own GitHub repo and Vercel project) that serves the association's hosted chat page, an embeddable widget (`/loader.js` + `/embed`), and talks to influencerbot only through the partner API with a server-held key.

**Architecture:** The new app has no database and no AI keys. Every browser call goes to the app's own `/api/*` route handlers, which forward to `influencerbot` `/api/partner/v1/*` with `Authorization: Bearer <COPILOT_PARTNER_KEY>` and `X-Tenant-Host: <resolved host>`. The tenant (association or partner) is resolved from the request host, with a dev override for the temporary domain. One chat UI component powers both the hosted page and the iframe; the loader script is a small vanilla-JS file that draws a Shadow-DOM launcher on the association's own site, keeps the anonymous id in that site's localStorage, and passes it (and signed `identify` payloads) into the iframe by `postMessage`.

**Tech Stack:** Next.js 16 (App Router, route handlers, React 19), TypeScript strict, Tailwind CSS 4, Vitest + Testing Library (jsdom), Playwright for one smoke, GitHub (`gh`), Vercel CLI.

**Dependency:** Tasks 1–6 can run in parallel with Plan 2. Task 7's chat smoke needs Plan 2's `/chat` route deployed.

**Spec:** `docs/superpowers/specs/2026-09-29-multiview-association-copilot-design.md` §6 (in the influencerbot repo). Plans 1 and 2 built the partner API this app consumes.

## Global Constraints

- New repo `Idosegev23/multiview-copilot`, **private**. Never copy influencerbot code or env into it; it imports nothing from influencerbot.
- Env vars (all server-only, never `NEXT_PUBLIC_`): `COPILOT_API_BASE` (e.g. `https://influencers-bot.vercel.app`), `COPILOT_PARTNER_KEY` (`cpk_…`), `COPILOT_HOST_OVERRIDE` (optional; when set, every request is treated as this host — used on the `*.vercel.app` preview until real domains exist).
- No string `bestie`, `influencerbot`, `ldrs` or `imai` (case-insensitive) anywhere in the repo source, build output, or any HTTP response. Enforced by `scripts/white-label-guard.mjs` in CI and in `npm run build` (`postbuild`).
- The partner key never reaches the browser: no client component, no `/loader.js` output, no HTML contains it. A test asserts this.
- Stream format from `/api/chat` is NDJSON, passed through unchanged from the partner API (`application/x-ndjson`).
- Behaviour rulings carried from Plans 1–2:
  - open a chat session only when the visitor sends the first message (never on page load);
  - on 409 `identity_conflict` from identify: generate a new anon id, drop the session, and continue anonymous;
  - never rotate the anon id on 409 `identify_not_configured`;
  - `anon_id` format `[A-Za-z0-9_-]{16,64}` (generate 32 url-safe chars).
- All UI copy in English.
- Commit locally per task; the controller pushes after review. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Partner key leak** — no client bundle, HTML page or `/loader.js` response contains `cpk_`. Pinned in Tasks 2 and 6.
2. **`postMessage` from a foreign origin** — the iframe accepts `anonId`/`identify` messages only from the parent origin it was opened for (`?origin=` param checked against the association's allowed origins from `/tenant`); the loader accepts messages only from the app origin. Pinned in Tasks 5 and 6.
3. **Stream cut mid-answer** (network drop, 60s limit) — the UI shows what arrived plus a neutral error line, never a spinner forever. Pinned in Task 4.
4. **Unknown host** (someone points a random domain at the app) — 404 page with no branding, no partner call that could leak another tenant. Pinned in Task 2.
5. **Visitor reloads mid-conversation** — the hosted page resumes the same session (session id in sessionStorage) and does not open a new one. Pinned in Task 4.

---

### Task 1 (influencerbot repo): `GET /api/partner/v1/tenant`

The app needs branding before any visitor exists, and `/session` requires an anon id.

**Files (influencerbot):**
- Create: `src/app/api/partner/v1/tenant/route.ts`
- Test: `tests/unit/copilot/tenant-route.test.ts`

**Interfaces:** `GET` with the usual partner headers. Works for both association and partner hosts (`requireTenant(req, { association: false })`). Response:
`{ kind: 'association' | 'partner', name: string, branding: Record<string, unknown>, openingQuestions: string[], allowedOrigins: string[] }`
- association: `name` = `config.display_name ?? config.username`; `branding` = `config.copilot.branding ?? {}`; `openingQuestions` = `config.copilot.opening_questions ?? config.suggested_questions ?? []` (strings, max 6); `allowedOrigins` = origins of `config.website_url` plus `config.copilot.allowed_origins` (strings that parse as `https?://host[:port]`).
- partner: `name` = `partners.name`; `branding` = `partners.branding`; `openingQuestions: []`; `allowedOrigins: []`.
- No vendor names; `Cache-Control: private, max-age=60`.

- [ ] **Step 1: Write the failing test** — mock `@/lib/copilot/auth` (`requireTenant`) and `@/lib/supabase` (chain for `accounts` and `partners`); cases: association host → full shape with `allowedOrigins` `['https://www.buses.org']` from `website_url` `https://www.buses.org/` plus a configured `https://members.buses.org`; invalid `allowed_origins` entries (`javascript:x`, `not a url`) dropped; `suggested_questions` fallback; partner host → partner name; tenant refusal passes through; body contains no vendor names.
- [ ] **Step 2: Run, see it fail.**
- [ ] **Step 3: Implement** (use `loadAssociation` for the association case; read `partners` by `tenant.partnerId` for the partner case; origin = `new URL(x).origin`).
- [ ] **Step 4: Run** `npx vitest run tests/unit/copilot` and the scoped tsc grep → green.
- [ ] **Step 5: Commit** (influencerbot worktree).

---

### Task 2: Scaffold `multiview-copilot`, host resolution, partner client, white-label guard

**Files (new repo):**
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `README.md`
- `src/lib/env.ts` — reads and validates the three env vars (throws a clear error on missing `COPILOT_API_BASE`/`COPILOT_PARTNER_KEY` at request time, not import time)
- `src/lib/host.ts` — `resolveHost(headers: Headers): string | null` (override → `x-forwarded-host` → `host`; lowercased, port stripped, same rules as the backend `normalizeHost`)
- `src/lib/partner.ts` — server-only (`import 'server-only'`)
- `src/lib/tenant.ts` — `getTenant(host): Promise<Tenant | null>` calling `GET /tenant`, cached per host for 60s in module memory
- `src/app/not-found.tsx` — plain neutral 404
- `scripts/white-label-guard.mjs`
- `.github/workflows/ci.yml` — install, `npm run lint`, `npm test`, `npm run build` (runs the guard)
- Tests: `tests/host.test.ts`, `tests/partner.test.ts`, `tests/white-label-guard.test.ts`

**Interfaces:**
- `partnerFetch(path: string, init: { host: string; method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }): Promise<Response>` — `fetch(`${COPILOT_API_BASE}/api/partner/v1${path}`, { method, headers: { authorization: `Bearer ${key}`, 'x-tenant-host': host, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal })`.
- `type Tenant = { kind: 'association' | 'partner'; name: string; branding: Record<string, unknown>; openingQuestions: string[]; allowedOrigins: string[] }`.

**Steps:**
- [ ] **Step 1:** `gh repo create Idosegev23/multiview-copilot --private --clone` into the session scratchpad; `npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --no-import-alias --use-npm` (then set the `@/*` alias to `./src/*` in tsconfig); add `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom server-only`.
- [ ] **Step 2: Write failing tests:**
  - `resolveHost`: override wins; `x-forwarded-host: ABA.copilot-dev.test:443` → `aba.copilot-dev.test`; junk → null.
  - `partnerFetch`: with `global.fetch` mocked, sends the bearer key and `x-tenant-host`, `cache: 'no-store'`, posts JSON; throws `env_missing` when the key is unset.
  - guard: create a temp dir with `ok.js` and `bad.html` containing `Powered by BeStIe` → the guard script exits 1 and names `bad.html`; with only `ok.js` → exit 0; it also fails on any file containing `cpk_` followed by 20+ url-safe chars.
- [ ] **Step 3: Implement.** The guard walks given directories (default `src`, `public`, `.next/static`, `.next/server/app`), skips binary files, matches `/bestie|influencerbot|ldrs|imai/i` and `/cpk_[A-Za-z0-9_-]{20,}/`, prints `file:line` for each hit, exits 1 on any hit. Wire `"postbuild": "node scripts/white-label-guard.mjs"`.
- [ ] **Step 4:** `npm test`, `npm run build` → green (build output must pass the guard).
- [ ] **Step 5: Commit** and push the initial branch `main` to the new private repo (this repo is the task's deliverable; pushing it does not deploy anything).

---

### Task 3: App API routes (proxy)

**Files:** `src/app/api/session/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/identify/route.ts`, `src/app/api/events/route.ts`, `src/app/api/contact/route.ts`; test `tests/api-routes.test.ts`.

**Behaviour:** each `POST` resolves the host, returns 404 `unknown_host` when `getTenant(host)` is null or `kind !== 'association'`, forwards the JSON body to the same-named partner endpoint, and returns the partner status and body. `/api/chat` streams: return `new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/x-ndjson', 'cache-control': 'no-store' } })` and forwards `retry-after`. `export const maxDuration = 60` on `/api/chat`. Request bodies are capped at 16 KB (413 `too_large`). No partner key, upstream URL or upstream error text is ever echoed to the browser beyond the partner JSON error code.

- [ ] Tests (mock `partnerFetch` and `getTenant`): unknown host → 404 and no `partnerFetch` call; session forwards body and status; chat passes the NDJSON body through byte-for-byte and keeps `retry-after`; oversize body → 413; response bodies never contain `cpk_`.
- [ ] Implement, run, commit.

---

### Task 4: Chat UI component

**Files:** `src/components/chat/Chat.tsx` (client), `src/components/chat/useCopilotChat.ts` (client hook), `src/components/chat/ndjson.ts`, `src/components/chat/cards.tsx`, `src/lib/anon.ts`; tests `tests/ndjson.test.ts`, `tests/useCopilotChat.test.tsx`, `tests/Chat.test.tsx`.

**Interfaces:**
- `readNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: any) => void): Promise<void>` — splits on `\n`, tolerates a line split across chunks, ignores blank lines, skips lines that fail `JSON.parse` (logs once).
- `getAnonId(storage: Storage, key = 'cp_anon'): string` / `rotateAnonId(storage, key)` — 32 chars from `crypto.getRandomValues` mapped to `[A-Za-z0-9_-]`; storage access wrapped in try/catch (falls back to an in-memory id).
- `useCopilotChat(opts: { apiBase?: string; anonId: () => string; onRotateAnon: () => string; sessionStore: Storage | null })` returns `{ messages, send(text), status: 'idle'|'streaming'|'error', contactRequested, submitContact(fields) }`.
  - first `send` calls `/api/session` (lazily), stores `{ visitorId, sessionId }` in `sessionStore` under `cp_session`; later sends reuse them; on reload the stored ids are reused (no new session).
  - `send` POSTs `/api/chat`, appends a streaming assistant message; `delta` appends text; `sources`/`related`/`event`/`cta` attach cards; `contact_request` sets `contactRequested`; `escalated` adds a neutral notice ("A member of staff has been notified."); `error` → message ends with "Sorry, I couldn't finish that answer. Please try again."; a thrown/aborted stream does the same; status always returns to `idle` or `error` (never stuck in `streaming`).
  - 429 → "You're sending messages quickly. Please wait a moment."; 503 → "The assistant is busy. Please try again shortly."
  - `submitContact` POSTs `/api/contact` with `consent: true`.
- `Chat` renders the transcript (assistant text as plain text with `[n]` citations turned into superscript links to the matching source card), opening-question chips before the first message, an input, typing dots while streaming (no "please wait" copy), source cards, one related card, an event card (title, dates, location, "Register" button when present), a CTA button, and an inline contact form (email required, name optional, consent checkbox required) when `contactRequested`.
- All links open in a new tab with `rel="noopener noreferrer"`; only `http(s)` URLs are rendered as links.

- [ ] Tests: ndjson split-across-chunks and junk lines; hook with mocked `fetch` (session opened lazily once, reused on second send, resumed from `sessionStore`; deltas accumulate; cards attach; a stream that throws ends in `error` status with the apology line; 429 copy); Chat renders chips → hidden after first send, renders a source link with `target="_blank"` and does not render a `javascript:` URL.
- [ ] Implement, run, commit.

---

### Task 5: Hosted page and `/embed`

**Files:** `src/app/page.tsx`, `src/app/embed/page.tsx`, `src/app/layout.tsx`, `src/components/brand/BrandShell.tsx`, `src/components/brand/theme.ts`, `src/components/embed/EmbedBridge.tsx` (client); tests `tests/theme.test.ts`, `tests/embed-bridge.test.tsx`.

**Behaviour:**
- `layout.tsx`: `generateMetadata` uses the tenant name for `<title>` and `branding.favicon` (if an `https` URL) for the icon; unknown host → `notFound()`.
- `theme.ts`: `brandCssVars(branding): Record<string,string>` maps `primary`, `primaryText`, `background`, `surface`, `text`, `font` to `--cp-*` CSS variables; only accepts hex colours (`#rgb`/`#rrggbb`) and a font family from an allow-list (`Inter, Roboto, Open Sans, Lato, Source Sans 3, Montserrat, Merriweather, system-ui`); defaults neutral navy/white. No arbitrary CSS injection.
- `/`: `BrandShell` (logo from `branding.logo` if `https`, association name, header links from `branding.header_links` `[{label,url}]` with `https` URLs only, footer text) + full-height `<Chat />` using `localStorage` for the anon id and `sessionStorage` for the session.
- `/embed?origin=<parent origin>`: chat only, transparent background, no header. `EmbedBridge` accepts `message` events only when `event.origin === origin` AND `origin` is in `tenant.allowedOrigins`; message types: `{ type: 'cp:init', anonId }` (sets the anon id provider), `{ type: 'cp:identify', payload: { memberId, email, ts, signature } | { newsletterToken } }` (forwards to `/api/identify` with the current `visitorId`/`sessionId`; on 409 `identity_conflict` posts `{ type: 'cp:rotate-anon' }` to the parent and resets the session). It posts `{ type: 'cp:ready' }` to the parent on mount. If `origin` is missing or not allowed, the embed renders a neutral "This assistant isn't available here." and makes no partner calls.
- [ ] Tests: `brandCssVars` rejects `red; background:url(x)` and non-hex values, accepts `#0b2a4a`; EmbedBridge ignores a message from `https://evil.example`, handles `cp:init` from the allowed origin, posts `cp:ready`, and on a mocked 409 `identity_conflict` posts `cp:rotate-anon`.
- [ ] Implement, run, commit.

---

### Task 6: `/loader.js`

**Files:** `src/app/loader.js/route.ts`, `src/loader/loader-template.ts` (the script source as a string builder); test `tests/loader.test.ts`.

**Behaviour:** `GET /loader.js` resolves the tenant (unknown → `404` with `/* not available */`), and returns `application/javascript; charset=utf-8`, `Cache-Control: public, max-age=300`, a self-contained IIFE that:
- creates a host `<div>` with an attached **closed** Shadow root, draws a round launcher button (colour from `branding.primary` validated as hex) and a panel containing an `<iframe src="${APP_ORIGIN}/embed?origin=${encodeURIComponent(location.origin)}" title="${name} assistant" allow="clipboard-write">`;
- keeps `cp_anon` in the **host page's** `localStorage` (try/catch, in-memory fallback); on `cp:ready` from the iframe (`event.origin === APP_ORIGIN` and `event.source === iframe.contentWindow`) posts `{ type: 'cp:init', anonId }` to `APP_ORIGIN`; on `cp:rotate-anon` regenerates and re-sends;
- exposes `window.CoPilot = { identify(payload), open(), close() }`; `identify` queues until `cp:ready` then posts `{ type: 'cp:identify', payload }`;
- injects nothing into the host page's global CSS; is idempotent if included twice.
- `APP_ORIGIN` is the request's own origin (`https://${host}`), computed server-side and JSON-encoded into the script; the template escapes `</script>` and U+2028/2029.
- [ ] Tests: response is JS with the right headers; contains the app origin and `attachShadow({ mode: 'closed' })`; contains no `cpk_`, no vendor names, no `COPILOT_API_BASE` value; unknown host → 404; a tenant name containing `</script><script>alert(1)` is escaped; colour `red;}` falls back to the default.
- [ ] Implement, run, commit.

---

### Task 7: Deploy to Vercel on a temporary domain and smoke

Controller-run (needs the Vercel CLI and production writes; not dispatched to an implementer without the controller present).

- [ ] **Step 1:** `vercel link` the new repo to a new project `multiview-copilot` (team scope of the existing project); set env `COPILOT_API_BASE=https://influencers-bot.vercel.app`, `COPILOT_PARTNER_KEY=<the dev key from Plan 1 setup>`, `COPILOT_HOST_OVERRIDE=aba.copilot-dev.test` for Production and Preview.
- [ ] **Step 2:** `vercel deploy --prod`; note the `*.vercel.app` URL.
- [ ] **Step 3:** In influencerbot, add the app's own origin to ABA's `config.copilot.allowed_origins` only if testing the widget from a test page on that origin; otherwise use a local test page (`npx serve`) with origin `http://localhost:5050` added to `allowed_origins` temporarily.
- [ ] **Step 4:** Playwright smoke (in the new repo, `tests/e2e/smoke.spec.ts`, run against the deployed URL): hosted page shows the ABA name and opening chips; sending "What does membership include?" streams text and at least one source card; reload keeps the conversation's session; the page HTML and `/loader.js` contain no `cpk_` and no vendor names; a local test page that includes `/loader.js` shows the launcher and the iframe loads.
- [ ] **Step 5:** Remove `COPILOT_HOST_OVERRIDE` only when real domains exist (Plan 5).

## What Plan 3 deliberately leaves out

- The admin console (Plan 4) — `/admin/*` routes are not created here.
- Custom/wildcard domains and DNS (needs Multiview's domain; Plan 5).
- Identity snippet documentation for ABA's developers (Plan 5).
