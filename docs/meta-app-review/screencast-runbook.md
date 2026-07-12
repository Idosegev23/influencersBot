# Meta App Review — Screencast Runbook (LDRS Instagram)

Re-recording after the "static examples" rejection. The console lives at
`/admin/meta-review/<LDRS-ACCOUNT-ID>` (clean full-English page, no Hebrew chrome) and renders in English.

LDRS account id: `de38eac6-d2fb-46a7-ac09-5ec860147ca0` →
record at **`/admin/meta-review/de38eac6-d2fb-46a7-ac09-5ec860147ca0`**.
Goal: show the full login flow + a live API call per permission with the raw
JSON response and success state visible.

> There is already an active connection — that is what makes the live data calls
> work. The **Reconnect** button exists only to capture the login + permission
> **grant** screen on video (Meta requires it). Reconnect re-authorizes the same
> account (upsert on the same `ig_business_account_id`) and refreshes the token;
> it does not create or break a connection.

## Pre-recording prep

1. **Set the Instagram account language to English** (Instagram app → Settings →
   Language → English) so the OAuth consent screen renders in English.
2. **Force a fresh consent screen:** Instagram app → Settings → Apps and websites
   → remove the app, so Reconnect shows the full permission-grant screen. (If it
   still skips the grant screen, record on a freshly added Instagram Tester.)
3. **Messages window:** from a second Instagram account, DM the LDRS account within
   ~20 minutes of recording (opens the 24-hour reply window). Send something the
   demo can reply to.
4. **Comments:** from a second account, leave a comment on a recent LDRS post so
   there is a real comment to read.
5. **Screen text:** enable captions/tooltips; record at a resolution where the
   Request + Response panels are legible.

## Recording sequence (English captions in brackets)

1. Open `/admin/meta-review/<LDRS-ACCOUNT-ID>` (clean full-English page, no Hebrew chrome).
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
