# Multiview Association Co-Pilot: white-label platform design

Date: 2026-09-29. Status: design approved in conversation, awaiting spec review.

## 1. Why

Multiview signed contract v3 on 2026-09-25 (term 2026-09-25 to 2027-09-24):
$6,600/yr per association, $3,000 setup covering up to six associations,
2,000 conversations/month included, AMS/CMS read-only connector included.
The first association is expected to be ABA (American Bus Association),
whose content is already scanned in account `e7302108-b12f-4e3e-b8d4-a1f75cfbef41`.

Multiview's end goal (Brandon Webb, 2026-09-28): every conversation must be
captured as structured data **tied to a visitor profile**, to feed their
future Intent Exchange. Intent Exchange itself is out of contract scope; the
data layer it needs is in scope.

### Contract scope this design must satisfy

Included at launch:
- Session continuity between public and signed-in agents (shared session foundation).
- Hyperlinked responses with a source citation on every answer.
- Content and exclusion controls for association staff.
- API access to reporting data.
- Hosted page branded to the association.
- Non-member detection, event registration prompts, recap emails to the visitor.
- Cross-content navigation: one related event, page or resource per answer.
- Contact capture trigger at an agreed point.
- Membership renewal awareness (the only launch item allowed to slip if AMS access is late).
- Plus the base service: white-label widget (no vendor branding), English only,
  conversation intelligence dashboard, human escalation with log, usage visible.

Committed next release (not in this build): staff inbox with AI-drafted
replies, live takeover on web chat, conversion reporting.
Not scoped: outbound email tooling (templates, CC lists), Intent Exchange,
identity pixel, cross-association profile matching.

## 2. Decisions (all approved 2026-09-29)

| # | Decision |
|---|---|
| D1 | Separate frontend (own repo, own Vercel project), shared influencerbot backend. No fork of the bot. |
| D2 | Three access tiers: Multiview staff (Multiview-branded, all associations); association staff (association-branded, own association only); visitors (association-branded). |
| D3 | Domains: default subdomain per association under a Multiview domain (`<slug>.copilot.<multiview-domain>`); optional custom domain per association (CNAME, e.g. `copilot.buses.org`). |
| D4 | New widget: one chat UI in the new app; the hosted page shows it full screen, the widget is a small loader script that opens it in an iframe. The existing `public/widget.js` is not used. |
| D5 | We onboard associations with the existing scan pipeline; Multiview self-serve onboarding is later. Data model must not block it. |
| D6 | Signed-in identity: the association's site calls `CoPilot.identify({ memberId, email, ts, signature })` with an HMAC signed server-side using a per-association secret (Intercom model). SSO-in-chat may be added later. |
| D7 | The new app talks only to a new versioned partner API in influencerbot (`/api/partner/v1/*`), server-to-server. The browser never calls influencerbot and never touches Supabase. |

## 3. Data model (influencerbot / Supabase)

Each association is an ordinary `accounts` row, so scanning, RAG, persona,
conversation analytics and escalation work unchanged.

New tables:

- `partners`: `id`, `slug` (`multiview`), `name`, `branding jsonb` (logo, colors, fonts), `status`, timestamps.
- `partner_api_keys`: `id`, `partner_id`, `key_hash`, `label`, `status`, `created_at`, `last_used_at`. Plaintext shown once at creation.
- `tenant_domains`: `host` (unique, lowercase), `partner_id`, `account_id` (null = partner-level host), `kind` (`subdomain` | `custom`), `verified_at`.
- `console_users`: `id`, `email` (unique per partner), `name`, `partner_id`, `account_id` (null = partner staff), `role` (`owner` | `admin` | `viewer`), `last_login_at`, `status`.
- `console_login_codes`: `id`, `console_user_id`, `code_hash`, `expires_at`, `used_at`, `attempts`.
- `visitors`: `id`, `partner_id`, `account_id`, `anon_id`, `member_ref` (AMS id), `email`, `name`, `company`, `membership jsonb` (minimal snapshot: status, type, renewal_date, fetched_at), `first_seen`, `last_seen`, `merged_into` (self FK). Unique (`account_id`, `anon_id`); unique (`account_id`, `member_ref`) where not null.
- `interaction_events`: `id`, `partner_id`, `account_id`, `visitor_id`, `session_id`, `message_id` (nullable), `type`, `payload jsonb`, `industry`, `occurred_at`. Append-only. Index (`account_id`, `occurred_at`), (`visitor_id`, `occurred_at`), (`partner_id`, `type`, `occurred_at`).

Event `type` values at launch: `session_started`, `question`, `topic_classified`,
`resource_shown`, `related_item_shown`, `event_suggested`, `membership_prompted`,
`renewal_prompted`, `link_clicked`, `contact_requested`, `contact_captured`,
`identified`, `escalated`, `recap_sent`, `ams_unavailable`.
`conversion` is reserved for the next release.

Changes to existing tables:
- `accounts.partner_id uuid null` references `partners`.
- `accounts.config.copilot`: `branding` (logo, colors, fonts, header/footer links),
  `industry`, `exclusions` (URL prefixes and patterns), `contact_trigger`
  (rule, see §5), `escalation` recipients (reuse the existing
  `config.escalation` shape), `identify_secret_ref` (secret kept in Vault, as for
  BYO-WhatsApp tokens), `ams` (provider, base URL, credential ref).
- `chat_sessions`: add `visitor_id uuid null`, `identified_at timestamptz null`.
  Messages stay in `chat_messages`, so the existing classifier and weekly analytics run on them.

RLS: all new tables have RLS enabled with no `anon` or `authenticated` grants;
only the service role (partner API) reads and writes them.

### Identity merge (on `identify`)

1. Verify HMAC over `memberId|email|ts` with the association secret; reject if `ts` is older than 10 minutes.
2. If a visitor with this `member_ref` exists for the association: repoint the
   current anonymous visitor's sessions and events to it, set the anonymous
   row's `merged_into`.
3. Otherwise set `member_ref` and `email` on the current visitor.
4. Fetch the membership snapshot from the AMS (§5). Record `identified`.

Cross-association unification is not built. `partner_id` on every row keeps it possible.

## 4. Partner API (`/api/partner/v1`, in influencerbot)

Auth on every call: `Authorization: Bearer <partner key>` and
`X-Tenant-Host: <host>`. The API resolves the host through `tenant_domains`
and rejects a host that does not belong to the key's partner. This is the
single tenant-isolation check. Console calls also carry a console session
token (signed, short-lived, with a secret distinct from `SUPABASE_SECRET_KEY`);
an association-scoped user is refused any other `account_id`.

| Group | Endpoint | Purpose |
|---|---|---|
| Visitor | `POST /session` | Open or resume by `anon_id`; returns branding, opening questions, `visitor_id`, `session_id`. Counts a new conversation. |
| | `POST /identify` | §3 merge. |
| | `POST /chat` | One turn; SSE stream of text plus structured blocks. |
| | `POST /events` | Client events (`link_clicked`). |
| | `POST /contact` | Contact capture submit. |
| | `POST /recap` | Send the recap email for the session. |
| Console | `POST /auth/request-code`, `POST /auth/verify` | Email one-time code login. |
| | `GET /me` | User, tier, allowed associations. |
| | `GET/PATCH /associations/:id/settings` | Branding, exclusions, contact trigger, escalation recipients. |
| | `GET /conversations`, `GET /conversations/:id` | List and transcript. Transcripts shown to association staff are anonymized. |
| | `GET /escalations` | Escalation log. |
| | `GET/POST /users`, `DELETE /users/:id` | Invite staff (partner staff: any; association admin: own association). |
| Reporting | `GET /reports/usage` | Conversations this month vs 2,000. |
| | `GET /reports/topics`, `/reports/volume`, `/reports/gaps` | From existing conversation-analytics tables. |
| | `GET /interactions` | Cursor-paginated export of `interaction_events`. This is the contracted reporting API. |

Rate limits: per `anon_id` and per association on `/chat`, max message length,
per-key ceiling. Limits fail closed for `/chat` when Redis is down.

## 5. The association chat turn

New core `src/lib/copilot/turn.ts`. It does not wrap `/api/chat/stream`
(that route carries orders, shipment and product logic). It reuses: hybrid
retrieval, persona, `detectEscalation` / escalation dispatch, lead-capture checks.

1. Load context: association config, visitor, membership snapshot if identified.
2. Retrieve with exclusions applied **before** the model sees sources.
3. Prompt for the `association` archetype, with contract behaviours as rules:
   cite and link every factual answer; add one related item; suggest an
   upcoming event when relevant (only events with a future date); introduce
   membership to non-members when relevant; mention renewal value when the
   renewal date is within 60 days.
4. Stream the answer plus structured blocks: `sources[]`, `related` (one),
   `cta` (event registration / join / renew link), `contact_request`.
   The UI renders blocks as cards; links are never only inside prose.
5. After the turn: write `interaction_events`, run escalation check, evaluate
   the contact trigger.

Contact trigger rules supported at launch (one per association):
`after_n_questions` (n), `on_intent` (membership, events, sponsorship),
`before_escalation`. Default: `on_intent` + `before_escalation`.

Events for "upcoming event" come from a structured source per association
(feed, API or crawled calendar page parsed into dated items). Until the
source exists the event prompt is off, not guessed.

AMS connector: `src/lib/copilot/ams/` with one interface
`getMember(memberRef) -> { status, type, renewalDate, registrations[] }` and
one adapter per AMS. The first adapter is written once we know ABA's AMS.
AMS failure: continue as identified with no member data, record `ams_unavailable`.

Recap email: backend-rendered, branded per tenant, sent from the partner's
sender domain. Disabled until the domain has SPF and DKIM.

## 6. New frontend app (separate repo)

Next.js 16, Tailwind 4, Vercel, wildcard domain.

- Middleware resolves the tenant from the host (cached) and sets branding.
- Routes: `/` hosted page (association header/footer, full-screen chat);
  `/embed` the same chat UI for the iframe; `/loader.js` tenant-aware widget
  loader; `/admin/*` console, branded by host (partner host shows Multiview,
  association host shows the association).
- All API calls go through the app's own server routes, which add the partner
  key. The partner key never reaches the browser.
- Widget loader: renders the launcher in Shadow DOM; stores `anon_id` in the
  association site's localStorage (first-party, survives Safari ITP); opens
  the iframe and passes `anon_id` and `identify` payloads by `postMessage`
  with origin checks. Widget and hosted page have separate anonymous ids
  (different origins); they merge on identify.
- Branding via CSS variables from tenant config: colors, font, logo, favicon, meta.
- White-label guard in CI: fail the build if the build output or served HTML
  contains `bestie`, `influencerbot`, `ldrs` or `imai` (case-insensitive).
- Console screens at launch: overview (volume, top topics, usage vs 2,000),
  conversations, escalations log, settings, users, API keys (partner staff only).
- Console login: email one-time code. No passwords.

## 7. Build order

0. **Security prerequisites** before any member data: public repo secrets
   (C1), `123456` passwords (C2), `/api/influencer/profile` config leak (C3),
   anon storage policies (C4), agent cookie tenant check (C5); set
   `SESSION_COOKIE_SECRET`. Runs in parallel with 1 to 3.
1. **Foundation** (influencerbot): migrations for §3, partner and tenant
   resolution, API key auth, `/session`, `/identify` (HMAC + merge, AMS stubbed),
   `interaction_events` writer.
2. **Chat turn**: `turn.ts`, exclusions, structured blocks, contact trigger, `/chat`.
3. **Frontend app**: repo, host routing, branding, hosted page, `/embed`, loader, white-label CI guard.
4. **Console + reporting API**: login, settings, conversations, escalations, users, reports, `/interactions`.
5. **ABA go-live**: link ABA account to the partner, subdomain, exclusions,
   event source, contact trigger, identify snippet handed to ABA, full English
   and white-label pass in a real browser.
6. **AMS adapter** once ABA's AMS and credentials arrive; renewal awareness and non-member detection go live.
7. **Recap email** once the sender domain is verified.

Blocked on Multiview/ABA: Multiview domain (3), AMS name and credentials (6),
sender domain (7), event source (event prompts), identify snippet deployment
on buses.org (signed-in agent), Intent Exchange document (may add fields to
`visitors` / event payloads before step 1 is frozen).

## 8. Testing

- Unit: HMAC verify (valid, wrong secret, stale ts), merge (new member,
  existing member, repeated identify), tenant resolution (foreign host
  rejected), exclusions filter, contact trigger rules, event type writer.
- Every absence assertion (no vendor string, no excluded URL in sources) has a
  paired presence assertion that is watched failing first.
- Integration: a scripted conversation against ABA verifying a citation on
  every answer, one related item, event suggestion only with future dates.
- Isolation test: an association-scoped console token requesting another
  association gets 403 on every console endpoint.
- Real-browser pass before go-live on hosted page, widget on a test page, and
  console, in Safari and Chrome.

## 9. Out of scope

Intent Exchange product, identity pixel, cross-association profiles, staff
inbox and AI drafts, web-chat takeover, conversion reporting, outbound email
tooling, self-serve association onboarding, SSO-in-chat.
