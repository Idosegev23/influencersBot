# Instagram Control Page + Dashboard Meta-Alignment — design

**Date:** 2026-07-13
**Status:** Design — approved in chat, pending spec review
**Owner:** Ido
**Driver:** Meta App Review for LeadersInfluencers (app ID 1297141655644794). The reviewer signs into the LDRS dashboard (`/influencer/ldrs_group/dashboard`) and verifies each permission there, so the owner-facing dashboard must match the submission's written claims.

## 1. Problem

The Meta submission commits the creator dashboard to specific, verifiable behavior:

- **basic**: top of dashboard shows the connected account — username, profile picture, media list.
- **insights**: header metrics (followers, views, likes, engagement rate) + per-post insights (likes, views, comments).
- **comments**: aggregated comment count per post only; raw comment text never shown.
- **messages**: a "Conversation Management Dashboard" — complete conversation history (incoming + outgoing), response analytics, a per-account on/off toggle, the ability to **flag** conversations and **respond manually within the 24-hour window**.

Audit results:
- Dashboard already satisfies **insights** and **comments** (real numbers from `instagram_posts` / `instagram_profile_history`; per-post likes/views/comments shown; aggregated comment count shown; no raw comment text). One **basic gap**: the "Recent posts" list renders a generic type-icon instead of the real post thumbnail, though `thumbnail` is already sent to the client.
- There is **no messages/Conversation-Management surface** for the owner today. The bot on/off toggle exists (`/api/influencer/dm-settings`) and DM threads are readable on the generic `conversations` page, but there is no Instagram-focused page, no owner send path, and no flag persistence.

## 2. Goal

Two parts, both aligned to the submission:

- **Part A — Instagram control page** (`/influencer/[username]/instagram`, shown only when IG-connected): connection + per-account bot on/off + DM conversation history + manual reply within the 24h window + flagging + light response analytics. This is the "Conversation Management Dashboard" for `instagram_business_manage_messages`.
- **Part B — Dashboard media-list fix**: render the real post thumbnail in "Recent posts" so the **basic** "media list" claim holds.

## 3. Non-goals

- **No per-conversation bot pause / auto human-takeover** (Ido confirmed: account-wide on/off only). The DM-governance backend (`paused_until`, owner-echo detection, flag alerts) stays a separate future spec.
- No sending **outside** the 24-hour standard messaging window; no message tags; no unsolicited/broadcast messages (submission commitment — enforced server-side).
- No comment write/reply/hide/delete anywhere (comments stay read-only, per submission).
- No admin-side changes.

## 4. Part A — Instagram control page

### 4.1 Nav gating
- `nav-features` route: add `instagramConnected: boolean` (query `ig_graph_connections` by `account_id`, `is_active=true` — reuse the existing pattern / `getIgConnectionForAccount`).
- `NavigationMenu`: add `'instagram'` to `NavKey`; add `{ key: 'instagram', icon: Instagram, requiresInstagram: true }` to `BASE_NAV_ITEMS`; extend the filter with `if (item.requiresInstagram && !instagramConnected) return false;`; thread `instagramConnected` through the `features` state. Add the nav label to the i18n `nav` section (he+en).

### 4.2 Page structure (`src/app/influencer/[username]/instagram/page.tsx`, `'use client'`)
Mirrors the existing dashboard-page conventions (auth check → fetch → `useDashboardLang` + `getDashboardStrings(lang)`; renders inside the influencer layout). Sections:

1. **Connection & bot control.** Connected-account card (`@username` + profile picture, from `dm-settings` GET `ig_connection`) + a **per-account on/off toggle** for "Automated DM responses" (reuse `dm-settings` PATCH `{ accountId, dm_bot_enabled }`). Copy matches the submission ("per-account on/off toggle").
2. **Conversation history (inbox).** A two-pane (or list→expand) view of DM threads:
   - Thread list: each thread shows the counterpart (`@username` if resolvable, else the IGSID), last message snippet, relative time, a **flag** marker, and a "bot / you" indicator on the last outbound message.
   - Thread detail: full message history — inbound (`role='user'`) and outbound (`role='assistant'`) bubbles, with outbound tagged bot vs. `metadata.by='human'`.
   - **Manual reply box**: enabled only when the thread is **inside the 24h window** (last inbound message < 24h old); otherwise shown disabled with a "Outside Instagram's 24-hour messaging window" note. Send → `POST /api/influencer/dm/send`.
   - **Flag** toggle per thread → `POST /api/influencer/dm/flag`.
3. **Response analytics** (light): totals over the DM threads — conversations, messages handled by the bot, manual replies, flagged. Derived from `chat_messages` counts; no new heavy analytics.

### 4.3 Backend (all owner-gated via `requireInfluencerAuth`, which reads `?username=` from the query string — every call MUST include `?username=`, see the language-toggle gotcha)

- **`GET /api/influencer/dm/conversations?username=&accountId=`** → threads for the account: read `chat_sessions` where `account_id=` and `thread_id LIKE 'dm_ig_graph_%'`, join recent `chat_messages`. For each thread return: `sessionId`, `threadId`, `recipientId` (parsed from `dm_ig_graph_<recipientId>_<accountId>`), `recipientHandle` (best-effort via cached `resolveSenderIdentity`), `lastMessage`, `lastMessageAt`, `lastInboundAt` (drives the 24h window), `flagged` (`chat_sessions.meta_state === 'flagged'`), and `messages[]` (role, content, created_at, `by`). Analytics counts computed here or in a sibling call.
- **`POST /api/influencer/dm/send?username=`** body `{ accountId, threadId, text }`:
  1. `requireInfluencerAuth`; resolve connection via `getIgConnectionForAccount(accountId)` → 409 if none.
  2. Parse `recipientId` from `threadId`.
  3. **Enforce the 24h window**: look up the latest inbound `chat_messages` (role='user') for the session; if `now - lastInboundAt > 24h`, return `422 { error: 'outside_24h_window' }` and DO NOT send (submission compliance).
  4. `sendInstagramDM(recipientId, text, conn.igId, conn.accessToken)`.
  5. Persist the sent message to `chat_messages` (`session_id`, `role='assistant'`, `content`, `metadata: { by: 'human' }`, `meta_mid` from the send response if present); bump `chat_sessions.message_count`.
  6. Return `{ ok, response }` (Graph error surfaced with `ok:false`).
- **`POST /api/influencer/dm/flag?username=`** body `{ accountId, sessionId, flagged }` → set `chat_sessions.meta_state = flagged ? 'flagged' : null` (scoped to a session whose `account_id` matches — ownership check).

### 4.4 Data model
- No migration. Reuse: `chat_sessions.meta_state` (existing spare column) for the durable flag; `chat_messages.metadata.by` for bot-vs-human on outbound; `thread_id` (`dm_ig_graph_<recipientId>_<accountId>`) to derive the recipient.
- Sender identity: best-effort via existing `resolveSenderIdentity` (24h Redis cache, minimal `name,username` Graph fetch). If it fails, fall back to the IGSID — never block the inbox.

## 5. Part B — Dashboard media-list fix

In `src/app/influencer/[username]/dashboard/page.tsx` "Recent posts" (≈ lines 634-662): render the real thumbnail when present — `post.thumbnail ? <img src={post.thumbnail} …/> : <TypeIcon/>` (keep the type icon as the fallback / overlay). `thumbnail` is already returned by `dashboard-stats`. This makes the visible "media list" match the **basic** claim. (Optional, minor: promote likes to its own header metric card; not required — likes already appear as engagement sub-text and per-post.)

## 6. i18n
The dashboard is fully internationalized (per-section catalog under `src/lib/i18n/dashboard/`). All new Instagram-page strings go in a new `instagram` section file (`src/lib/i18n/dashboard/instagram.ts`, wired into `index.ts`), `he` canonical + `en` mirror (enforced by the existing en-mirrors-he test). The nav label goes in the `nav` section. LDRS renders `en`, so English copy must read naturally.

## 7. Error handling
- No connection → 409; page shows "Instagram not connected" (the tab is hidden in that case anyway, but the endpoints stay safe).
- Outside 24h window → the reply box is disabled client-side and the send endpoint hard-refuses (422) — defense in depth for the submission's compliance claim.
- Graph send error (revoked token, etc.) → returned with `ok:false`, surfaced as an inline error; the bot on/off and inbox reads keep working.
- All governance work is best-effort: identity-resolution or analytics failure must never break the inbox.

## 8. Testing
- Unit (pure): `parseRecipientFromThreadId('dm_ig_graph_123_acc')` → `'123'`; `within24h(lastInboundAt, now)` boundary; the analytics reducer over a sample message set.
- Type-check clean; i18n en-mirrors-he test stays green with the new `instagram` section.
- Manual: on LDRS — tab appears, toggle flips the bot, inbox lists real DM threads, a reply sends within the window and appears as a `human` outbound, a thread flags/unflags, and an out-of-window thread shows the disabled state.

## 9. Rollout
- Straight to `main`. No migration, no new env. Ships as: nav-features flag + NavigationMenu tab + the `instagram` page + 3 owner endpoints + the `instagram` i18n section + the dashboard thumbnail fix.
- Verifies the `instagram_business_manage_messages` review path (Conversation Management Dashboard) and closes the `basic` media-list gap; insights/comments already pass.
