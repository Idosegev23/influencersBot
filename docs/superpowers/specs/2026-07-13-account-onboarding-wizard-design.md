# Account Onboarding Wizard — design

**Date:** 2026-07-13
**Status:** Design — approved in chat, pending spec review
**Owner:** Ido

## 1. Problem
Onboarding a new creator today is manual: an admin creates the account in `admin/add`,
types the sources, and runs the scan. There is no way to hand the creator a link and let
them self-serve (connect Instagram, enter their own channels, kick off the scan) and be
notified when their assistant is ready. We want a shareable, tokenized onboarding flow.

## 2. Goal
End-to-end self-service onboarding:
1. **Admin** enters two fields (account name + client name) → gets a unique shareable link.
2. **Client** opens the link (a polished public page): connects Instagram, enters website +
   TikTok + YouTube + their WhatsApp + email, and clicks **Start scan**.
3. The **full existing pipeline** runs in the background (~hours: scrape all sources, build
   the persona/RAG) with **live progress** on the page.
4. **On completion:** the client gets a **WhatsApp + email** with links to their dashboard
   and their chat; the **admin** gets a "new account completed" notification.
5. The client's **first dashboard visit** shows a short guided **tutorial**.

## 3. Non-goals
- No billing/payment in the flow.
- No new scan engine — reuse `startPipeline` unchanged.
- No change to the admin `admin/add` flow (this is an additional, lighter entry point).
- Tutorial is a first-run tour, not a full help center.

## 4. Phases (each independently shippable)

### Phase 1 — the wizard (core)

**Data model.** At admin "create link", create a **draft account** (reuse `POST /api/admin/accounts`)
with a slug username derived from the account name, and stamp
`accounts.config.onboarding = { token, status: 'draft', accountName, clientName, createdAt }`.
`token = randomBytes(18).toString('base64url')` (the quotes/signatures pattern). Public lookups
resolve the account by the token via a JSON filter (`config->onboarding->>token`); low account
volume makes a seq scan fine (a dedicated indexed column can be added later if needed).
`status` transitions: `draft → filled → scanning → ready`.

**Admin entry** — a small action (button/modal on the admin accounts or add page): fields
**account name + client name** → `POST /api/admin/onboarding/create` → creates the draft account
+ token, returns `{ link: <appBaseUrl>/onboard/<token> }` to copy/send.

**Public wizard** `src/app/onboard/[token]/page.tsx` (`force-dynamic`, no auth — token IS the auth):
- Resolves the draft by token (invalid/expired → `notFound()`), greets by account name.
- Fields: **website URL, TikTok username, YouTube username, WhatsApp number, email** + a
  **Connect Instagram** button (links to the open `/api/auth/instagram/connect?accountId=<id>&returnTo=/onboard/<token>`;
  the callback links the connection to the draft account and returns to the wizard, which now
  shows "Instagram connected ✓").
- **Start scan** button (enabled once IG is connected + required fields filled) →
  `POST /api/onboard/[token]/start`.
- After start: render the **live progress** using the existing `StepBoard` pattern against the
  public `GET /api/pipeline/status/[jobId]`.

**Token-guarded start** `src/app/api/onboard/[token]/start/route.ts`:
- Validates the token → draft account. Rejects if already scanning/ready (idempotent).
- Persists the sources (`config.sources = { instagram, website, tiktok, youtube }`, via the
  existing `saveSources` shape) + `config.onboarding.ownerWhatsapp`/`ownerEmail`, sets
  `status: 'scanning'`, and updates `config.username` to the connected IG handle.
- Calls `startPipeline({ accountId, username, websiteUrl, youtube, tiktok, archetype:'influencer', ... })`
  and returns `{ jobId }`.

### Phase 2 — completion notifications

A **completion hook** fires once when the pipeline reaches terminal success for an account
whose `config.onboarding.status === 'scanning'`. Implemented server-side in the pipeline's
final step (reliable — the client need not keep the page open for hours); flips
`status → ready` so it only fires once.

- **Client:** WhatsApp via the existing `sendInfluencerWelcome` template (`whatsapp-notify.ts`)
  to `config.onboarding.ownerWhatsapp`, and `sendEmail` to `config.onboarding.ownerEmail` —
  both carry links to **the dashboard** (`/influencer/<username>/dashboard`) and **the chat**
  (`/chat/<username>`). Dependency: the WhatsApp template must be **approved** in Meta (confirm
  `sendInfluencerWelcome`'s template is live; if not, that's the one blocker for the WhatsApp
  side — email still ships).
- **Admin:** `sendAdminAlert({ level:'info', subject:'New account onboarded', message, details })`.

### Phase 3 — first-run dashboard tutorial

A dismissible guided tour on `/influencer/[username]/*`, shown when the account has
`config.onboarding.status === 'ready'` and no `config.tutorial_seen`. A welcome modal + a few
coach-marks over the nav tabs (Dashboard / Instagram / Analytics / …) explaining "what you see /
what to do." Dismiss → `PATCH` sets `config.tutorial_seen = true` (owner-gated, `?username=`,
same pattern as the language toggle). i18n he+en in the `instagram`/new `tutorial` catalog section.

## 5. Reuse map
- Scan: `startPipeline` + `StepBoard` + public `GET /api/pipeline/status/[jobId]` — as-is.
- Token: `randomBytes(18).base64url` + `appBaseUrl()` (`src/lib/crm/quotes.ts`); public-page
  blueprint `src/app/sign/[token]/page.tsx`.
- IG connect: the open `/api/auth/instagram/connect` (callback links by accountId) — as-is.
- Sources: `config.sources` shape + `saveSources`.
- Notify: `sendInfluencerWelcome` (WhatsApp), `sendEmail` (client), `sendAdminAlert` (admin).
- Account create: `POST /api/admin/accounts`.

## 6. Security
- The wizard + start endpoint are **token-guarded** (the token is a 144-bit secret; possession =
  authorization). This also scopes the IG connect to a real draft account created by an admin.
- `start` is idempotent (rejects if not in `draft/filled`), preventing double-scans / re-trigger.
- No secrets returned to the client; the token never grants access to other accounts.
- Validate the WhatsApp number (`toWaId`) and email format before storing.

## 7. Error handling
- Invalid/used token → `notFound()` (wizard) / 404 (API).
- IG not connected when Start is pressed → the button stays disabled; the API also rejects.
- Pipeline failure → the progress board shows the failed step + retry (existing `StepBoard`
  behavior); the completion hook only fires on success, so no false "ready" notification.
- Notify failures are best-effort + logged (a WhatsApp/email failure must not roll back a
  successful scan); `status` still flips to `ready` so the client can reach their dashboard.

## 8. Testing
- Unit: token generation/uniqueness; the draft-resolver (token→account, rejects unknown);
  `within`-style guards for `start` idempotency; the completion-hook "fire once" gate.
- Type-check clean; i18n en-mirrors-he stays green (new tutorial strings).
- Manual: admin creates a link → open it in a fresh browser → connect IG (tester) → fill
  sources + WhatsApp + email → Start → progress runs → on completion, client WhatsApp+email
  arrive with working dashboard/chat links → admin alert arrives → first dashboard visit shows
  the tour.

## 9. Rollout
Straight to `main`, phase by phase (each phase is usable on its own). No new env for Phase 1;
Phase 2 needs an approved WhatsApp template + (for admin WhatsApp, later) an admin phone env —
email works immediately. Build order: **Phase 1 → Phase 2 → Phase 3.**
