# Owner-facing Instagram Connect / Disconnect — design

**Date:** 2026-07-13
**Status:** Approved in chat — building
**Owner:** Ido

## 1. Problem
The new Instagram control page (`/influencer/[username]/instagram`) shows connection
status ("Connected as @X") but gives the account owner no way to **connect** or
**disconnect** their Instagram themselves — the connect OAuth was admin-initiated only,
and there is no disconnect (only `request-deletion`, which is full data deletion via an
admin email). The tab is also hidden when not connected, so a disconnected owner has no
entry point to connect. Meta's own submission promises "creators can disconnect at any time."

## 2. Goal
On the Instagram page's connection card: a **Connect Instagram** button when not connected,
and a **Disconnect** button when connected. Make the tab always reachable.

## 3. Non-goals
- Not full data deletion — `request-deletion` stays for that. Disconnect only deactivates
  the connection (`is_active=false`); stored data is untouched.
- No WhatsApp (separate future request).

## 4. Design

### 4.1 Always-visible tab
Remove the `requiresInstagram` gate in `NavigationMenu` so the Instagram tab always shows.
The page adapts: disconnected → only the connection card (with Connect); connected → the
full control panel (inbox + analytics + Disconnect). (`nav-features.instagramConnected`
stays returned but is no longer used for gating.)

### 4.2 Connect
Reuse the existing OAuth route. The button links to
`/api/auth/instagram/connect?accountId=<accountId>&returnTo=/influencer/<username>/instagram`.
After the owner authenticates with Instagram and grants, the callback links the connection
and (via `returnTo`) lands back on the Instagram page.

### 4.3 Disconnect
New owner endpoint `POST /api/influencer/instagram/disconnect?username=` —
`requireInfluencerAuth` (account derived from the session; client value never trusted),
sets `ig_graph_connections.is_active = false` for `account_id = auth.accountId`. Returns
`{ ok }`. The page confirms first, then reloads (the tab stays; the card flips to the
disconnected state).

### 4.4 Harden the connect route (consistency with the dm-settings IDOR fix)
Today `/api/auth/instagram/connect` takes `accountId` from the query with **no ownership
check** — anyone could start an OAuth that links their Instagram to another account's id.
Add an authorization gate: resolve the account's username from `accountId` and allow only
if the request carries a valid influencer session for that account (`checkInfluencerAuth`)
OR a valid admin cookie (`requireAdminAuth`). Otherwise redirect to the account's login.
This keeps both existing callers working (admin console/pages via the admin cookie; the new
owner button via the owner session) while closing the connect-IDOR.

## 5. i18n
Add to the `instagram` section (he+en): `connect`, `disconnect`, `disconnectConfirm`,
`disconnecting`, `connectHint`. Wire on the page.

## 6. Error handling
- Disconnect: DB error → 500; the page keeps the connected state and shows nothing
  destructive. No connection to disconnect → still returns `{ ok:true }` (idempotent).
- Connect hardening: unauthorized → redirect to `/influencer/<username>/login` (or the
  generic influencer login) rather than silently starting OAuth.

## 7. Testing
- Unit: none new (thin adapters); the connect-auth resolver is exercised by the live dry-run.
- Type-check clean; i18n en-mirrors-he stays green.
- Manual on LDRS: tab always shows; Disconnect flips the card to disconnected + Connect
  appears; Connect starts OAuth and returns to the page; admin console Reconnect still works.

## 8. Rollout
Straight to `main`. No migration. Files: NavigationMenu (drop gate), new disconnect route,
harden connect route, Instagram page UI, `instagram` i18n section.
