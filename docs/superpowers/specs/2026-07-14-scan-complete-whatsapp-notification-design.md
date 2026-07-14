# Scan-Complete WhatsApp Notification — Design

**Date:** 2026-07-14
**Status:** Approved (pending spec review)

## Problem

When an admin adds an account and its scan pipeline finishes, the team has no
automatic signal that it's ready. They want a WhatsApp **template** message sent
to a fixed set of team phone numbers, containing a link to the finished account,
the moment the pipeline completes.

Two cases, two separate notifications:

- **Demo account** (`isDemo === true`) → "the demo is ready, you can send it to
  the client" framing.
- **Real / full account** (`isDemo !== true`) → "the account was set up" framing.

Both link to the public chat page and go to the same recipient list.

## Recipients

A fixed team list, configured via env (comma-separated, normalized by
`toWaId`), defaulting to the three numbers below:

```
SCAN_NOTIFY_RECIPIENTS=972523000584,972547667775,972545980677
```

(Source numbers: +972 52-300-0584, 972547667775, +972 54-598-0677.)

## Link

`https://bestie.ldrsgroup.com/chat/{username}` — consistent with the existing
`influencer_welcome_v2` / `follower_welcome_v2` templates, whose URL button is
registered with the `/chat/` base and a `{{1}}` slug suffix. The wrapper passes
the bare `username` as `urlButtonParam`; Meta assembles the full URL.

## Architecture

Hook the notification at the single pipeline completion point and reuse the
existing WhatsApp template infrastructure. No new pipeline step, no new route.

### 1. Two new template wrappers — `src/lib/whatsapp-notify.ts`

Following the existing `sendInfluencerWelcome` pattern (one exported wrapper per
Meta template, each calling the private `runTemplate`):

```ts
// demo_ready_v1 — demo scan finished (team notification)
//   Category: UTILITY | Vars: body {{1}} = brand name, url {{1}} = username slug
export async function sendDemoReady(p: {
  to: string; brandName: string; accountUsername: string;
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'demo_ready_v1',
    flagName: 'DEMO_READY',
    to: p.to,
    bodyParams: [p.brandName],
    urlButtonParam: p.accountUsername,
  });
}

// account_ready_v1 — real/full scan finished (team notification)
//   Category: UTILITY | Vars: body {{1}} = brand name, url {{1}} = username slug
export async function sendAccountReady(p: {
  to: string; brandName: string; accountUsername: string;
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'account_ready_v1',
    flagName: 'ACCOUNT_READY',
    to: p.to,
    bodyParams: [p.brandName],
    urlButtonParam: p.accountUsername,
  });
}
```

Gating is automatic via the existing mechanism in `runTemplate`:
`WHATSAPP_NOTIFY_ENABLED === 'true'` **and** the per-template flag
(`WHATSAPP_TEMPLATE_DEMO_READY` / `WHATSAPP_TEMPLATE_ACCOUNT_READY`) `=== 'true'`.
Until both are set, the wrappers no-op — so the code ships dark.

### 2. Completion hook — `src/app/api/pipeline/run/route.ts`

The final step is reached when `nextStep(step)` returns `null` (line 45–47).
Insert the notification immediately after `markSucceeded` (line 47), before the
`done` response is returned:

```ts
await repo.markSucceeded(jobId, { pipeline: 'complete' });
await notifyScanComplete({ jobId, job, state });   // new — awaited, never throws
return NextResponse.json({ status: 'done' });
```

`notifyScanComplete` (new helper, e.g. `src/lib/pipeline/notify.ts`):

1. **Dedup guard.** QStash can re-deliver the same POST. Acquire a Redis
   `SET NX` key `scan-notify:{jobId}` (TTL ~1 day). If it already exists, return
   immediately. (Same approach that fixed the IG-DM double-reply.)
2. **Resolve brand name.** Read the `accounts` row by `job.account_id`; use
   `config.display_name || config.username || job.username`.
3. **Pick the template.** `state.options?.isDemo === true` → `sendDemoReady`,
   else `sendAccountReady`.
4. **Send to all recipients.** Parse `SCAN_NOTIFY_RECIPIENTS` (fallback to the
   three defaults), `await Promise.allSettled(...)` over the list calling the
   chosen wrapper per number with `accountUsername = job.username`.
5. **Never throw.** Wrap in try/catch, log best-effort. A notification failure
   must not fail the pipeline or trigger a QStash retry of the whole step.

**Why `await`, not `fireAndForget`:** on Vercel serverless, background work after
the response is not guaranteed to run. Three sends add negligible latency, so we
await them to guarantee delivery.

**Why in the route, not in `markSucceeded`:** `markSucceeded` is a shared repo
method used by other flows; hooking in the route keeps this scoped to the
pipeline's true completion.

### 3. Meta templates to register (he, UTILITY)

**`demo_ready_v1`**
- Body: `הדמו של {{1}} מוכן! 🎉 הסריקה הושלמה ואפשר לשלוח ללקוח.`
- Button (URL, dynamic): `פתח דמו` → `https://bestie.ldrsgroup.com/chat/{{1}}`

**`account_ready_v1`**
- Body: `חשבון {{1}} הוקם והסריקה הושלמה ✅`
- Button (URL, dynamic): `פתח צ'אט` → `https://bestie.ldrsgroup.com/chat/{{1}}`

`{{1}}` in the body = brand name; `{{1}}` in the button = username slug.

## New environment variables

```
SCAN_NOTIFY_RECIPIENTS=972523000584,972547667775,972545980677
WHATSAPP_TEMPLATE_DEMO_READY=true
WHATSAPP_TEMPLATE_ACCOUNT_READY=true
```

(Plus the pre-existing master flag `WHATSAPP_NOTIFY_ENABLED=true`.)

## Data flow

```
admin adds account → startPipeline → QStash step chain (11 steps)
  → final step finishes → run/route.ts: markSucceeded
    → notifyScanComplete: dedup(NX) → read account → pick template by isDemo
      → send to each SCAN_NOTIFY_RECIPIENTS number → /chat/{username} link
```

## Error handling

- Notification wrapped in try/catch; failures logged, never propagated.
- Redis NX dedup prevents duplicate sends on QStash re-delivery.
- Per-recipient failures isolated via `Promise.allSettled`.
- Template gating (master + per-template env) keeps it dark until go-live.

## Testing

- Unit: `notifyScanComplete` picks the correct wrapper by `isDemo`; parses
  `SCAN_NOTIFY_RECIPIENTS`; second call for the same `jobId` no-ops (dedup);
  brand-name fallback chain.
- Wrappers pass through to `runTemplate` with the right `templateName` /
  `bodyParams` / `urlButtonParam` (mock `runTemplate`).

## Out of scope / non-goals

- The existing `influencer_welcome_v2` send to the influencer's own phone is a
  separate mechanism and is left untouched.
- No admin UI to edit the recipient list (env only, per decision).
- No retry/queue for failed sends beyond QStash's normal step delivery.

## Go-live checklist

1. Register + get Meta approval for `demo_ready_v1` and `account_ready_v1`.
2. Set the three env vars (+ confirm `WHATSAPP_NOTIFY_ENABLED=true`).
3. Deploy.
