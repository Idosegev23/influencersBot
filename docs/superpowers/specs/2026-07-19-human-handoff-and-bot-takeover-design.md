# Human Handoff & Bot Takeover — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorm), pending implementation plan
**Supersedes the scope of:** the old "escalation" engine (`src/engines/escalation/`), which
was negative-sentiment-only and notification-only.

## Problem

The existing escalation engine detects only *bad* signals (legal threats, abuse, sustained
anger) and only *notifies* — it never stops the bot. Three gaps, raised by Ido:

1. **Recipients are not configurable** — they live in `config.escalation` set by hand, not in
   the account settings UI.
2. **"Escalation" is framed as negative only** — but handing a conversation to a human is
   often a *good* moment (a hot lead, an explicit request, the bot hitting its limits).
3. **No human takeover** — when a human answers a conversation, the bot keeps replying on top
   of them. There is no way for the bot to know it should go quiet, or to come back.

## Concept

Reframe "escalation" as **handoff to a human**: any reason a human should step in, positive or
negative. Two independent mechanisms:

- **Handoff notification** — a trigger fires, the configured recipients are alerted. Does *not*
  silence the bot.
- **Bot pause (takeover)** — a per-conversation state that actually stops the bot. Set when a
  human replies or hits "take over"; cleared only by a manual per-conversation toggle.

The `config.escalation` key is kept for back-compat; the UI and language are "העברה לנציג /
Handoff to a human".

## Decisions (from brainstorm)

- **Bot resume:** manual only — a per-conversation toggle. Once a human owns a conversation the
  bot never auto-jumps back in. (No timer auto-resume — YAGNI.)
- **Pause trigger:** a human reply (auto) **and** an explicit "take over" button (grab a
  conversation before typing).
- **Handoff triggers:** explicit human request (exists), purchase/deal intent (new), bot
  low-confidence (new), manual owner flag (exists), plus the existing negative set.
- **Recipients:** configured in the account settings UI, saved to `config.escalation`.

## Architecture

### 1. Per-conversation bot-pause state

New columns on `chat_sessions` (migration):

| column | type | meaning |
|--------|------|---------|
| `bot_paused` | `boolean not null default false` | bot is silenced for this conversation |
| `bot_paused_at` | `timestamptz null` | when it was paused |
| `bot_paused_reason` | `text null` | `'human_reply' \| 'manual_takeover'` |

A column (indexed on `bot_paused`), not JSON in `config`/`metadata`, because it is read on every
bot turn (hot path) and used to filter "human-owned" conversations in the dashboard.

### 2. The bot-reply guard (the single stop point)

A shared helper `isBotPaused(supabase, sessionId): Promise<boolean>`. Every handler checks it
**before generating/sending a bot reply**:

- `src/app/api/chat/stream/route.ts`
- `src/lib/chatbot/widget-chat-handler.ts`
- `src/lib/instagram-graph/dm-handler.ts`

When paused: the **inbound customer message is still stored** (so the human sees it), but the bot
produces no reply. This is the only place the bot is actually stopped, and it is shared across all
three channels.

### 3. Auto-pause on human reply

Where a human message is written today:

- IG DM owner reply — `src/app/api/influencer/dm/send/route.ts` (stores `role:'assistant'`,
  `metadata.by:'human'`).
- Dashboard conversation reply (if/where one exists) — same pattern.

After writing the human message, set `bot_paused=true, bot_paused_reason='human_reply'` on the
session (idempotent).

### 4. Handoff detection (notification only)

Extend the detector into `detectHandoff(currentMessage, priorUserMessages, ctx)` returning the
existing verdict plus the new triggers. `ctx` carries `botConfidence` (already returned as
`sandwichResult.metadata.confidence`).

| trigger | detection | severity |
|---------|-----------|----------|
| `legal` / `abuse` / `sustained_anger` | existing `detectEscalation` (post-#8 word-boundary) | critical / high |
| `human_demand` | existing | high |
| `purchase_intent` | Hebrew/English phrase list (`הצעת מחיר`, `רוצה לקנות`, `לסגור עסקה`, `כמה עולה`, `to buy`, `quote`, `pricing`) with the same word-boundary matcher | high |
| `low_confidence` | `botConfidence < config.escalation.lowConfidenceThreshold` (default 0.4) | high |
| `manual_flag` | the existing `/api/influencer/dm/flag` endpoint fires a handoff notification | high |

Each trigger is individually on/offable via `config.escalation.triggers`. A handoff notification
never pauses the bot (per the decision) — humans decide whether to take over.

### 5. Config shape (account settings)

```jsonc
config.escalation = {
  enabled: boolean,               // master on/off for this account
  triggers: {                     // each individually toggleable
    legal: true, abuse: true, sustained_anger: true,
    human_demand: true, purchase_intent: true, low_confidence: true,
  },
  lowConfidenceThreshold: 0.4,
  dedupeMinutes: 15,              // existing
  recipients: [ { name, email, whatsapp? } ],
}
```

### 6. Settings UI

A new **"העברה לנציג"** card on the influencer settings surface
(`src/app/influencer/[username]/settings/…`): master toggle, per-trigger checkboxes, low-confidence
threshold, and a recipients editor (name + email rows). Saves through the existing
`POST /api/influencer/settings`, which already merges into `accounts.config`. This replaces any
hardcoded recipient config.

### 7. Notifications (two channels)

1. **Email** — the existing `runEscalationCheck` → `dispatch` → `resolveRecipients` path, now
   reading recipients from the settings-managed config.
2. **In-app** — insert into `in_app_notifications` for the account → a bell in the dashboard;
   click → open the conversation → "take over". This makes handoffs actionable rather than an
   email that gets lost.

### 8. Takeover UI controls

Per-conversation **"בוט: פעיל/מושתק"** toggle + **"השתלט"** button on:

- the influencer conversations page (`src/app/influencer/[username]/conversations/…`), and
- the IG DM control page (`src/app/influencer/[username]/instagram/…`).

New endpoint `POST /api/influencer/conversations/bot-toggle` (auth: `requireInfluencerAuth`) that
sets `bot_paused` on a session the account owns. "Take over" = set paused; the toggle also clears
it (resume).

## End-to-end flow

```
customer message
  └─ guard: isBotPaused(session)?
       ├─ paused → store message, bot stays silent (human handles)
       └─ active → bot replies
                    └─ detectHandoff(msg, prior, {botConfidence})
                         └─ trigger? → notify recipients (email + in-app), dedup per session
   ... human clicks "take over" OR sends a reply
        └─ bot_paused = true  → bot silent from now on
   ... owner flips the per-conversation toggle back on
        └─ bot_paused = false → bot resumes
```

## Isolation / units

- `isBotPaused()` + `pauseBot()` / `resumeBot()` — one small module owning the pause state; the
  three channel handlers depend only on `isBotPaused`.
- `detectHandoff()` — pure function, testable in isolation (extends the existing pure
  `detectEscalation`); no I/O.
- `runEscalationCheck` (dispatch) — unchanged interface, gains the in-app channel and the new
  triggers via `detectHandoff`.
- Settings card + bot-toggle endpoint — UI/transport only, no detection logic.

## Out of scope (YAGNI)

- Timer-based auto-resume of the bot.
- Round-robin / load-balanced recipient routing, SLA timers, reminder nudges.
- WhatsApp as a notification channel (the `recipients[].whatsapp` field is reserved but not wired).
- Reworking the legacy Respond.io DM handler (already broken: text sessionKey into a uuid column).

## Testing

- `detectHandoff` unit tests: each new trigger fires; purchase-intent word boundaries (no
  substring false fire); low-confidence threshold boundary; existing negative cases still pass.
- `isBotPaused` guard: a paused session yields no bot reply but still stores the inbound message,
  across all three handlers (at least one integration-style test per handler path).
- Auto-pause: a human reply flips `bot_paused` true; the toggle endpoint flips it back.

## Rollout

Gated behind the existing `ESCALATION_ENABLED` env + per-account `config.escalation.enabled`, so
it ships dark and is enabled per account (starting with LDRS) from the new settings UI — which is
also how #10 (LDRS recipients) gets resolved, in the UI rather than in code.
