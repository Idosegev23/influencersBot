# Meta App Review — Instagram API Console (English, live-call demo)

**Date:** 2026-07-12
**Status:** Design — approved for spec review
**Owner:** Ido
**Account under review:** LDRS (`ldrsgroup` Instagram Business account)

---

## 1. Problem

The Meta App Review submission for four Instagram permissions was **rejected**:

- `instagram_business_basic`
- `instagram_business_manage_messages`
- `instagram_business_manage_insights`
- `instagram_business_manage_comments`

Meta **approved the use case** but rejected the **screencast** under Developer Policy 1.6, with one recurring reason and one explicit reviewer note:

> "Static examples were shown instead of a live interaction. Please re-record using a real API call that retrieves data or publishes content, and display the success state in your app UI."

The screencast must therefore show, **in English**, with captions/tooltips:

1. The complete Meta/Instagram login (OAuth) flow.
2. The user **granting** the app access (the permission consent screen).
3. A **live API call** per permission that **retrieves data or publishes content**, with the **success state visible in the app UI**.

### Current code reality (from codebase survey)

| Permission | Today | Gap for a compliant live demo |
|---|---|---|
| `instagram_business_basic` | OAuth fetches profile at connect (`callback/route.ts`); shown as a stored snapshot in Hebrew | Needs an on-demand **live** fetch, in English, with visible request/response |
| `instagram_business_manage_messages` | Send works but only via webhook auto-reply (`dm-handler.ts` → `client.ts sendInstagramDM`); no read-on-demand | Needs **read conversations** (`GET /me/conversations`) + **manual send** with a success state in the UI |
| `instagram_business_manage_insights` | Not built (only story insights, and that path is a stub that never persists) | Needs account + media + demographics insights, live |
| `instagram_business_manage_comments` | Read only via a manual `tsx` script; webhook drops comment events | Needs **live read of comments** in the UI (retrieves real data). **No write** — per the read-only constraint below |

The OAuth flow already requests all four scopes (`src/app/api/auth/instagram/connect/route.ts:14-19`), so the connection layer is fine. The gap is a **running English UI that exercises each permission live and shows the raw request + response + success state.**

## 2. Goal

Add a self-contained **"Meta API Console"** section to the existing admin account page (`/admin/influencers/[id]`) that:

- Renders in **English, LTR** (wrapped in `dir="ltr" lang="en"`), regardless of the surrounding Hebrew RTL admin shell.
- Provides a **Reconnect** button that re-runs OAuth so the consent/permission-grant screen is captured on video.
- For each of the four permissions, exposes a button that performs a **live Graph API call** against the LDRS connection stored in `ig_graph_connections`, and renders: the **Request** (method + URL + fields, token redacted), the **raw Response JSON**, and a **success/error banner**.
- Ships with a **Screencast Runbook** documenting the exact recording steps and the pre-recording preparation.

Building on the existing `/admin/influencers/[id]` page (Ido's chosen approach) reuses the admin auth, the per-account context, and the existing connection card.

## 3. Non-goals & core constraint

**Core constraint — read-only on the profile, one write action only.** The console must **not modify the existing LDRS Instagram profile or its content in any way**. It only: (a) connects to the account, (b) reads/scans from it (profile, media, insights, comments), and (c) **replies via Direct Message**. The **DM reply is the single write/publish action** in the whole console.

Concretely:

- **Comments: read-only.** Live `GET` of real comments (retrieves data). **No reply, no hide, no delete** — those all alter the profile.
- **No comment reply / hide / delete** anywhere.
- **No profile, media, or content edits** of any kind.
- The only `POST` that publishes is `send-message` (DM reply).

Other non-goals:

- No new top-level admin nav item, no separate route — the console is a section on the existing page.
- No change to the live production DM bot behavior (webhook auto-reply stays as is).
- No general-purpose inbox/moderation product. This is a focused, real, working demo surface — genuinely live (not mocked), but scoped to what App Review needs to see.
- No change to which scopes are requested (all four already requested).

## 4. Meta requirement → how we satisfy it

| Meta requirement | Where satisfied |
|---|---|
| Complete Meta login flow | **Reconnect** button → existing `/api/auth/instagram/connect` OAuth, captured on video |
| User granting app access (consent screen) | Instagram's own consent screen during Reconnect; Runbook covers revoking first so the full grant screen re-appears |
| Live API call retrieving data / publishing content, success state in UI | Each block calls a real `/api/admin/meta-review/*` endpoint that hits `graph.instagram.com`; UI shows raw response + success banner. `manage_comments` is demonstrated via a **live read** (`GET /{media}/comments`) — the reviewer explicitly allows "retrieves data"; reading comments requires the permission. `manage_messages` is the one that also **publishes** (DM reply) |
| English UI language | Console wrapped in `dir="ltr" lang="en"`; all labels/tooltips in English; Runbook sets the IG account UI language to English so the consent screen is English too |
| Captions / tooltips explaining UI elements | Each `ApiCallCard` has a title, a permission explainer line, and a tooltip; Runbook provides the caption script |
| Server-to-server disclosure (if any) | N/A — this is a frontend-initiated flow with a visible OAuth login; the Runbook states the login flow is visible so no server-token disclosure is needed |

## 5. Architecture

### 5.1 UI — section on the existing page

- New component `src/components/admin/meta-review/MetaApiConsole.tsx` (`'use client'`), rendered at the bottom of `src/app/admin/influencers/[id]/page.tsx`, inside `<div id="meta-api-console" dir="ltr" lang="en">…</div>`.
- Receives `accountId` (the route param already available on the page).
- Composed of one **Connection block** + four **permission blocks**, each built from a shared `ApiCallCard`.

### 5.2 Shared UI primitive — `ApiCallCard`

`src/components/admin/meta-review/ApiCallCard.tsx`:

```
Props: {
  title: string
  permission: string           // e.g. "instagram_business_manage_insights"
  description: string          // English explainer of what this demonstrates
  actionLabel: string          // button text, e.g. "Fetch account insights"
  onRun: () => Promise<{ request: RequestMeta; response: unknown }>
  children?: ReactNode         // optional custom result renderer
}
```

Renders: header (title + permission chip + tooltip), the action button, a **Request** panel (`METHOD https://graph.instagram.com/v22.0/… fields=…`, `access_token=***REDACTED***`), a **Response** panel (pretty-printed JSON), and a success/error banner. State machine: `idle → loading → success | error`. The button shows a spinner while loading. This is the single component that makes every block visibly "live."

`RequestMeta = { method: 'GET'|'POST'; url: string; note?: string }` is returned by each endpoint alongside the data, so the UI displays exactly what was called (with the token already redacted server-side).

### 5.3 Backend — endpoints

All under `src/app/api/admin/meta-review/`, each starting with `requireAdminAuth()`, each resolving the connection via a shared helper and returning `{ request, response }` (token redacted in `request.url`).

| Route | Method | Graph call(s) | Permission |
|---|---|---|---|
| `profile/route.ts` | GET | `GET /me?fields=id,username,name,profile_picture_url,followers_count,media_count,biography,website` + `GET /me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=12` | basic |
| `insights/route.ts` | GET | account: `GET /me/insights?metric=reach,accounts_engaged,total_interactions,profile_views&period=day&metric_type=total_value`; demographics: `GET /me/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&timeframe=this_month&breakdown=city`; media: `GET /{media-id}/insights?metric=reach,likes,comments,saved,shares,total_interactions` | insights |
| `conversations/route.ts` | GET | `GET /me/conversations?platform=instagram&fields=id,updated_time,participants,messages.limit(5){id,from,message,created_time}` | messages |
| `send-message/route.ts` | POST | `POST /me/messages` `{recipient:{id}, message:{text}}` (reuse `sendInstagramDM`) | messages |
| `comments/route.ts` | GET | `GET /{media-id}/comments?fields=id,text,username,timestamp,like_count,replies{id,text,username}` — **read-only** | comments |

### 5.4 Shared server helper — connection resolver

`src/lib/instagram-graph/get-connection.ts`:

```
getIgConnectionForAccount(accountId): Promise<{
  igId: string          // ig_business_account_id
  accessToken: string
  username: string
} | null>
```

Reads the latest active row: `.eq('account_id', accountId).eq('is_active', true).order('connected_at', {ascending:false}).limit(1).maybeSingle()` — mirrors the hardened read pattern already used in `admin/ig-connection/route.ts` and `dm-handler.ts` (avoids the historical two-active-rows `.single()` bug). Returns `null` when no active connection, so endpoints can respond `409 { error: "No active Instagram connection" }` and the UI can prompt Reconnect.

A tiny `redactToken(url)` util replaces the `access_token` query value with `***REDACTED***` for the `request.url` returned to the client.

### 5.5 OAuth return path (Reconnect)

Small extension so Reconnect returns to the console instead of the influencer thank-you page:

- `connect/route.ts`: accept optional `returnTo` query param; include it in the `state` JSON.
- `callback/route.ts`: if `state.returnTo` is present, redirect there (must be a same-origin relative path — validate it starts with `/` and is not `//`), else keep the current `/instagram/connected` behavior.
- Console Reconnect button links to `/api/auth/instagram/connect?accountId=<id>&returnTo=/admin/influencers/<id>%23meta-api-console`.

The consent screen re-appearing reliably is handled operationally (revoke first) — see Runbook — not in code.

### 5.6 The five blocks

**0. Connection & OAuth.** Shows current connection (`@username`, granted permissions, token expiry) from `GET /api/admin/ig-connection?accountId=`. Primary button **"Reconnect & review permissions"** (the OAuth link above). Caption: this is the login + permission-grant step.

**1. Basic — `instagram_business_basic`.** Button "Fetch profile & recent media" → `profile` endpoint. Renders a profile card (avatar, name, `@username`, followers, media count) + a media thumbnail grid, plus the raw Request/Response.

**2. Insights — `instagram_business_manage_insights`.** Button "Fetch account insights" → `insights` endpoint. Renders KPI tiles (reach, accounts engaged, total interactions, profile views), a demographics breakdown, and last-media insights, plus raw Request/Response. Endpoint is **defensive**: each metric group is fetched in its own try/catch; partial failures (e.g. a metric unsupported for the account) are surfaced in the response rather than failing the whole call — showing real, sometimes-partial data further proves it is live.

**3. Messages — `instagram_business_manage_messages`.** Button "Load conversations" → `conversations` endpoint → list of recent threads (participant `@username` + last message). Selecting a thread reveals a reply box → "Send reply" → `send-message` endpoint → `Message sent ✓` banner and the sent text echoed. Reuses `sendInstagramDM`.

**4. Comments — `instagram_business_manage_comments` (read-only).** Button "Load comments" (defaults to the most recent media from block 1, or a media-id input) → `comments` endpoint → renders the real comment list (author `@username`, text, timestamp, likes, nested replies) plus the raw Request/Response. **No reply, hide, or delete** — this block only reads, per the read-only constraint. The live retrieval of real comment data is what demonstrates the permission.

## 6. Data flow (per block)

```
Button click
  → client fetch('/api/admin/meta-review/<x>?accountId=…')
  → requireAdminAuth() → getIgConnectionForAccount(accountId)
  → fetch graph.instagram.com/v22.0/… with accessToken
  → return { request: {method,url(redacted)}, response: <graph json> }
  → ApiCallCard renders Request + Response + success banner
```

## 7. Error handling

- No active connection → `409`; UI shows "No active Instagram connection — click Reconnect."
- Graph error (expired token, permission not granted, out-of-window message) → endpoint returns `{ request, response: <graph error body>, ok:false }` with HTTP 200 so the UI can **display the real Graph error** (useful and honest on camera) and show a red banner. Only infra failures (network, auth) return non-200.
- Messages 24h-window violation surfaces as the real Graph error `#10`/`#551` in the Response panel — the Runbook prevents it via prep, but the UI degrades gracefully.
- Token redaction is enforced server-side; the client never receives the raw token.

## 8. Security

- Every endpoint is admin-gated (`requireAdminAuth`, `bestieai_admin_session` cookie).
- Access token is read server-side from `ig_graph_connections` and never returned to the client (redacted in `request.url`, absent from `response`).
- `returnTo` validated as a same-origin relative path (`startsWith('/')`, not `//`) before redirect, to prevent open-redirect.

## 9. Testing

- **Unit** (`tests/unit/`): `redactToken` redacts the token in assorted URLs; `getIgConnectionForAccount` picks the newest active row when two active rows exist (regression guard for the historical bug); `returnTo` validator rejects `//evil.com`, `https://…`, accepts `/admin/…`.
- **Manual live verification** (the real proof, per the `verify` discipline): with the LDRS connection, hit each endpoint and confirm a real Graph response. This doubles as the dry run for the screencast.
- Type-check (`npm run type-check`) — the repo ignores build type errors, so this is run separately.

## 10. Screencast Runbook (shipped as `docs/meta-app-review/screencast-runbook.md`)

Pre-recording prep:

1. Set the LDRS Instagram account's **app language to English** (so the consent screen renders in English).
2. To force the consent screen to reappear: in the LDRS Instagram app → Settings → **Apps and websites → remove the app** (so Reconnect shows a full fresh grant).
3. **Messages window:** from a second account, DM the LDRS account within ~20 min of recording (opens the 24h reply window).
4. **Comments:** from a second account, leave a comment on a recent LDRS post (so there is a real comment to reply to / hide).

Recording sequence (English captions provided per step):

1. Open `/admin/influencers/<ldrs-id>#meta-api-console`.
2. **Connection block** → Reconnect → complete Instagram login → **show the permission grant screen** → land back on the console.
3. **Basic** → Fetch profile → show request + JSON + rendered profile.
4. **Insights** → Fetch insights → show KPI tiles + JSON.
5. **Messages** → Load conversations → select the thread from prep → Send reply → show `Message sent ✓`.
6. **Comments** → Load comments → show the real comments retrieved live (request + JSON + rendered list). Read-only — no reply/hide.

Each step: keep the Request + Response panels visible to prove the call is live.

## 11. Rollout

- Straight to `main` (project convention), staged to only the files in this change.
- No migration required (`ig_graph_connections` already exists; no schema change).
- No new env vars (existing `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` / token in DB).

## 12. Open items / risks

- **Insights metric shape in v22:** exact metric/period/breakdown combos can be finicky (some require `metric_type=total_value`, `follower_demographics` requires `timeframe` + `breakdown` + 100+ followers). Mitigated by the per-group defensive fetch; the plan phase should verify the exact working combo against the live LDRS token during implementation.
- **Consent screen re-display:** if removing the app doesn't force a fresh grant, fallback is to record on a freshly added tester. Documented in the Runbook.
- **`manage_comments` demonstrated by read only:** per the read-only constraint, the comments block only reads (`GET /{media}/comments`). The reviewer's note explicitly allows "retrieves data," and reading comments requires this permission, so a live read is a legitimate demonstration. Residual risk: the reviewer may still expect a moderation action. If a resubmission is rejected on this specific point, the fallback (not built now) is a **reversible Hide → Unhide** (net-zero change to the profile) — a decision to revisit only if Meta pushes back.
- **Hebrew admin chrome** around the English panel: acceptable per Meta (the demonstrated surface is English). Optional enhancement (not in scope): hide the sidebar when `#meta-api-console` is the active anchor for a cleaner frame.
