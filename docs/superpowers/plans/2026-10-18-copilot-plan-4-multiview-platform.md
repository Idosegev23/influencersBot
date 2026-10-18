# Co-Pilot Plan 4: Multiview Platform, Console and Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the white-label app into Multiview's own platform — like Bestie's admin with its clients — where Multiview logs in, sees every association it owns, adds new associations (which starts a scan), and manages each one; each association's assistant lives at `<multiview-domain>/<slug>`; and the visitor chat and console get a drastic, production-grade redesign.

**Design decisions (approved by Ido 2026-10-18; supersede spec §2 D3/D5 and §6 routing):**
- **D3′ Path routing.** Associations live under the partner domain at `/<slug>` (hosted page), `/<slug>/embed`, `/<slug>/loader.js`. The app root `/` is the Multiview console. A custom per-association domain remains possible later via `tenant_domains` (not built here).
- **D5′ Self-serve onboarding.** Multiview staff add associations from the console (name + website + slug). This creates the account and starts the existing scan pipeline. Bestie no longer onboards by hand.
- Tenant mapping without DNS: the app resolves `slug` + the partner base host into the existing tenant host `<slug>.<base-host>` (e.g. `aba.copilot-dev.test`), so the partner API's `X-Tenant-Host` contract is unchanged. The partner base host itself (e.g. `copilot-dev.test`) is the partner-level tenant used by console calls.
- **Brand:** Multiview console uses Multiview's palette (deep navy `#0B1B2B`, gold `#E8B931` accent) from their brief. ABA uses its real site palette: navy `#041423`, ink blue `#143A53`, action blue `#03538A`, sky `#AFD7F2`, canvas `#F2F4F5`; logo `https://www.buses.org/wp-content/uploads/2026/02/aba-logo-dark.svg`; favicon `https://www.buses.org/wp-content/themes/theme/assets/favicon/default/ABA_Favicon_192x192.png`; ABA's font is Noi Grotesk (commercial) → use **Hanken Grotesk** (Google Fonts) as the closest open grotesk.

**Repos:** backend tasks B* in influencerbot (worktree `cp-wt`); frontend tasks F* in `multiview-copilot`. The two tracks run in parallel; F3/F4 consume B2–B4 contracts defined below.

## Global Constraints
- Everything from Plans 1–3 still binds: no vendor names in any response/HTML/email; partner key server-only; NDJSON chat; typed email is never a verified identity; recap gated.
- Console auth: email one-time code only (no passwords). Codes: 6 digits, SHA-256 stored, 10-minute expiry, max 5 attempts, max 5 code requests per email per 15 min, constant response for unknown emails (no enumeration). Console session token: HMAC-SHA256 signed `{u: consoleUserId, p: partnerId, a: accountId|null, r: role, e: expiryMs}`, 12h, secret `CONSOLE_SESSION_SECRET` (required; refuse to issue without it).
- Console authorisation: partner staff (`console_users.account_id IS NULL`) see all the partner's associations; association staff see only theirs. Only role `owner`/`admin` may create associations or change settings; `viewer` is read-only. Every console endpoint enforces it server-side; a cross-association request → 403.
- Config writes go through a jsonb-merge RPC (never read-modify-write the whole `accounts.config`) — the repo has a history of config-wipe races.
- Transcripts shown to association staff are anonymised (spec §4): show visitor as "Visitor" unless identity_source is ams_login/newsletter, never show raw anon ids.
- New migrations: **152**.
- Frontend: Next 16 app router, Tailwind 4, TypeScript strict; design quality bar = Linear/Vercel-level console and an editorial, institutional visitor chat. Follow the installed skill `design-motion-principles` (at `/Users/idosegev/Downloads/TriRoars/Leaders/influencerbot/.agents/skills/design-motion-principles/` — read `SKILL.md` and `workflows/create.md`) for all motion: purposeful, fast (150–250ms), `prefers-reduced-motion` respected, no motion on frequent keyboard actions.
- Commits local; the controller pushes after review.

## Review Focus
1. A viewer or an association-scoped console user creating an association or editing another association's settings → 403.
2. Login-code brute force / email enumeration: unknown email and known email give identical responses and timings; 6th wrong code fails even with the right one.
3. Creating an association with a slug that already exists, or a website that is not http(s) → clean 409/400, no half-created account, no second pipeline.
4. Path routing: `/<unknown-slug>` → real 404 with no partner branding; `/<slug>` for another partner's association → 404.
5. Redesign must not regress Plan 3 guarantees: frame-ancestors, no key in HTML, chat streaming, link safety, 360px no horizontal scroll, contrast.

---

## Backend (influencerbot)

### B1. Migration 152 + counts + config merge
- `partner_account_counts(p_account_ids uuid[], p_since timestamptz)` → `(account_id, sessions, messages, escalations, last_activity)`: sessions = chat_sessions with `ref_source='copilot'` and `created_at >= p_since`; messages = sum of those sessions' `message_count`; escalations = support_requests `source='copilot_escalation'` since; last_activity = max(chat_sessions.last_turn_at). `language sql stable`, `set search_path = public`, service_role only (follow migration 091).
- `copilot_merge_config(p_account_id uuid, p_patch jsonb)` → merges `p_patch` into `accounts.config->'copilot'` (one-level deep merge: `config = jsonb_set(config, '{copilot}', coalesce(config->'copilot','{}') || p_patch)`), returns the new copilot object. Service role only.
- Apply locally on the throwaway Postgres pattern used in Plan 1 Task 1 (stand-ins for accounts/chat_sessions/support_requests) to validate; do NOT apply to production (controller does).
- Tests: none in vitest (SQL); include the local validation output in the report.

### B2. Console auth
Files: `src/lib/copilot/console-auth.ts`, routes `src/app/api/partner/v1/console/auth/{request-code,verify}/route.ts`, tests.
- Both routes require the partner key and a **partner-level** host (`requireTenant(req, {association:false})` and tenant.accountId === null) — the console always calls through the partner base host.
- `request-code` body `{email}` → normalise; if an active console_user exists for this partner, create a code (invalidate previous unused codes) and email it via the existing `sendEmail` with From display name `Multiview` and subject `Your sign-in code`; always respond `{ok:true}` after a constant minimum delay of 400ms. Per-email rate limit 5/15min via `redisSlidingWindowRateLimit` (fail closed: respond ok, send nothing, log).
- `verify` body `{email, code}` → on success `{token, user:{id,email,name,role,accountId}}` and set `last_login_at`; wrong code increments attempts; >5 attempts or expired → 401 `invalid_code` (same for every failure).
- `requireConsole(req): Promise<ConsoleContext | Response>` — requires partner key + partner host + `x-console-token`; verifies HMAC, expiry, and that the console_user row is still active and matches partner. `ConsoleContext = { partnerId, userId, accountId: string|null, role: 'owner'|'admin'|'viewer' }`. Helper `canManage(ctx)`, `canSeeAccount(ctx, accountId)`.
- Script `scripts/copilot-console-user.ts --partner multiview --email <e> --name <n> --role owner [--account <uuid>]` (idempotent upsert; Node 22; loads env first).
- Tests: enumeration-safe responses, attempt cap, expiry, token tamper/expiry, inactive user, association-scoped user.

### B3. Console data API
Routes under `src/app/api/partner/v1/console/`:
- `GET associations` → `[{ id, slug, name, websiteUrl, status: 'scanning'|'ready'|'failed', scan:{percent,currentStep}|null, counts:{sessions30, messages30, escalations30, lastActivity} }]` filtered by `canSeeAccount`; slug = the tenant_domains host's first label for that account under the partner base host. Counts via `partner_account_counts` (since = now-30d).
- `GET associations/:id` → detail incl. counts (7d and 30d), top topics (from existing conversation analytics tables if present for the account, else []), recent 5 escalations (reason, created_at), settings snapshot (whitelisted copilot fields only: branding, opening_questions, exclusions, contact_trigger, escalation.recipients, links, tone, industry).
- `GET associations/:id/conversations?cursor=` → page of 25 sessions (`ref_source='copilot'`): id, started, last_turn_at, message_count, first user message (120 chars), escalated flag, identified flag.
- `GET associations/:id/conversations/:sessionId` → anonymised transcript (role, content, created_at, cited sources from metadata).
- `PATCH associations/:id/settings` (canManage) → validates and whitelists: branding (same rules as the /tenant whitelist), opening_questions (≤6 strings ≤120), exclusions (≤50 strings, must start with `/` or `http`), contact_trigger (validated via readContactRules shape), escalation.recipients (≤10 emails, EMAIL_RE), links.join/renew (https), tone (≤300). Writes via `copilot_merge_config`. Returns the new settings snapshot.
- Tests for authorisation on every route (partner staff vs association staff vs viewer vs other partner), pagination, whitelisting.

### B4. Create association + scan status
- `POST console/associations` (canManage + partner staff only) body `{name, websiteUrl, slug}`; slug `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`, reserved slugs (`api, admin, console, login, embed, assets, _next, static`) refused; website http(s) via `normalizeWebsiteUrl`. Conflict if the tenant host `<slug>.<base-host>` exists or an account with `config.username = slug` exists → 409 `slug_taken`.
- Steps (in this order, all-or-nothing as far as possible; on failure after the account insert, delete the account row and any tenant_domains row created): insert `accounts` (type creator, plan free, status active, language en, timezone America/New_York, partner_id, allowed_channels web, features chatbot+analytics, `config:{username: slug, display_name: name, archetype:'association', website_url, isDemo:false, copilot:{industry:null, opening_questions:[], links:{}, ams:{provider:'stub', stub_members:[]}}}`, `security_config:{admin_password_hash: hashPassword(<32 random bytes hex>)}`); create identify secret via `copilot_store_secret` and merge `identify_secret_ref`; insert tenant_domains `{host: <slug>.<base-host>, partner_id, account_id, kind:'subdomain'}`; `startPipeline({accountId, websiteUrl, archetype:'association', language:'en', isDemo:false, scanMode:'full', requestedBy:'partner:'+partnerId})`. Response `{id, slug, jobId}`.
- `GET console/associations/:id/scan` → latest scan job for the account via `getScanJobsRepo().getByAccount(id, 1)` + `computeScanProgress` → `{status, percent, currentStep, startedAt, finishedAt, error}`.
- Note: the pipeline's team WhatsApp "account ready" notification will fire — acceptable (team visibility).
- Tests with mocked repo/startPipeline/supabase: happy path order, slug conflicts, reserved slug, invalid website, rollback on pipeline start failure, authorisation.

### B5. Transcript restore for visitors
- `/session` on resume additionally returns `messages`: last 30 of the session oldest-first: `{role, content, cards}` where `cards` for assistant messages come from `metadata.copilot` (`sources`, `related`, `event`, `cta`). Extend `turn.ts` to store `related {title,url}`, `event {id,title,startsOn,endsOn,location,url,registrationUrl}` and `cta {kind,url}` in `metadata.copilot` (it already stores `sources`). Only for sessions owned by the visitor (already checked). Tests.

## Frontend (multiview-copilot)

### F1. Path routing + console shell
- Routes: `/` console (redirect to `/login` without a console session), `/login`, `/associations`, `/associations/new`, `/associations/[id]` (overview), `/associations/[id]/conversations`, `/associations/[id]/conversations/[sessionId]`, `/associations/[id]/settings`, `/associations/[id]/install`; public: `/[slug]` hosted chat, `/[slug]/embed`, `/[slug]/loader.js`; app API: `/api/t/[slug]/{session,chat,identify,events,contact}` (visitor, proxying to the association tenant host) and `/api/console/*` (proxying to the partner console API with the console token from an httpOnly, Secure, SameSite=Lax cookie `cp_console`).
- Tenant resolution: base host = `COPILOT_HOST_OVERRIDE` (now set to the partner base host `copilot-dev.test`) else the request host; association tenant host = `<slug>.<base>`; validate slug with the same regex; unknown → 404 page (neutral). Remove the old root hosted page.
- Frame policy: `/[slug]/embed` uses the validated parent origin as before; everything else `frame-ancestors 'none'`.
- Loader: `/[slug]/loader.js` (same script, APP origin + slug baked in, iframe `src=/<slug>/embed?origin=…`, chat API calls `/api/t/<slug>/…`).
- Keep all Plan 3 tests passing (update paths), add routing tests (unknown slug, reserved slug, other-partner slug).

### F2. Design system + visitor chat redesign
- Use the design skills available in this environment: read `/Users/idosegev/Downloads/TriRoars/Leaders/influencerbot/.agents/skills/design-motion-principles/SKILL.md` + `workflows/create.md` for motion. Visual direction: editorial, institutional, trustworthy — generous whitespace, a real type scale (display font for headings, text font for body), refined neutrals, subtle depth (hairline borders + soft shadow, no heavy gradients), association brand colour used with intent (header, primary actions, citation chips), not everywhere.
- Hosted page: full-bleed association header (logo image if https logo set, else name wordmark), a welcoming hero with the association name, a short line about what the assistant can do, and opening-question chips; conversation column max ~720px; sticky composer with auto-growing textarea, send button, keyboard hint; footer with the association's footer text and a quiet "Answers are based on <association> pages" note.
- Messages: user bubbles right, assistant as a clean card without a bubble tail; **safe markdown-lite renderer** (bold, italic, ordered/unordered lists, paragraphs, `[text](http(s) url)` links with rel/target, inline `[n]` citation chips that link to the source) — no raw HTML ever; sources as a compact numbered list with favicon/domain; event card with a date block (month/day), title, location, Register button; CTA as a primary button; contact form as an inline card with clear consent copy.
- States: typing indicator (three dots, reduced-motion safe), streaming caret, error line with retry, rate-limit copy, empty state.
- Transcript restore on reload using B5's `messages`.
- Motion (per skill): message enter (opacity+translateY 6px, 180ms, ease-out), cards stagger 40ms, chip hover lift, no animation on each streamed token.
- Widget panel (embed): same components, compact header with close, 380×640 panel; launcher redesigned (brand circle, icon, subtle shadow, focus ring).
- Accessibility: AA contrast (keep Plan 3 derivation), focus rings, aria-live for streaming, labels.
- Verify in a real browser (Playwright headless shell at `$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`) at 1440, 1024, 375 widths; attach screenshots paths in the report.

### F3. Multiview console UI
- Multiview-branded (navy/gold), Linear/Vercel-level polish: left sidebar (Multiview wordmark, Associations, Settings placeholder, user menu), content area.
- Login: email → code screen (6 boxes), resend timer, errors neutral.
- Associations: grid/table of cards — association name, slug, website, status pill (Scanning n% / Ready / Failed), sessions and messages (30d), escalations, last activity; "Add association" primary button.
- Add association: 3-field form (name, website, slug auto-suggested from name, editable, live validity), submit → progress view polling `/scan` every 4s with the 15 pipeline steps shown as a calm progress list; done → link to the association.
- Association workspace tabs: Overview (KPI tiles, recent escalations, top topics, "Open assistant" and "Copy install code"), Conversations (list + transcript viewer side panel), Settings (branding with live preview of the chat header + colours with contrast hint, opening questions, exclusions, escalation recipients, links, tone; save via PATCH), Install (copy-paste `<script src=…/<slug>/loader.js async>` snippet, the `CoPilot.identify` server-side signing example in Node and PHP, CSP note `script-src`/`frame-src` allow the app origin).
- Viewer role sees no edit controls; association-scoped staff land directly on their association.
- Real-browser screenshots at 1440 and 1024.

### F4. Configuration, deploy and QA (controller-run)
- Apply migration 152; set `CONSOLE_SESSION_SECRET` on influencerbot (Vercel) — needs Ido or Vercel access; set ABA branding via `copilot_merge_config` (palette, logo, favicon, font Hanken Grotesk, header links Membership/Events/Advocacy/News on buses.org, footer text); set ABA opening questions; seed console users (Ido as Multiview owner); set `COPILOT_HOST_OVERRIDE=copilot-dev.test` on multiview-copilot; deploy both; browser QA of console login → associations → ABA → settings preview, and `/aba` chat at 1440/375; send screenshots.

## Out of scope
Custom per-association domains, Multiview-level settings page content, reporting API `/interactions` export (next plan), AMS adapter, recap enablement.
