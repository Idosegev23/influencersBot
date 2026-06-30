# Support Escalation Engine — Design Spec

**Date:** 2026-06-30
**Status:** Approved design → pending implementation plan
**Author:** Claude (with Ido / LEADRS)

## 1. Problem

Customers chatting with a brand bot (widget / chat) can become angry, abusive, threaten
legal action, or demand an immediate human. Today nothing alerts a human — the existing
decision-engine "escalation" rules only soften the bot's tone; **no person is notified**.

Triggering example (Yoav, LEADRS, 30/06/2026):
> "עכשיו ללה בוטה יש לקוחה כעוסה, מקללת, מאיימת בתביעה, ודורשת מענה מיידי — איך אנחנו עושים אסקלציה מהיר?"

We need: when the bot detects a high-risk customer, **instantly alert the right human** for
that account, with enough context to take over out-of-band (call / WhatsApp the customer).

## 2. Goals / Non-goals

**Goals (MVP):**
- Detect anger / abuse / legal threat / explicit human-demand reliably and cheaply.
- Fire an alert to **account-scoped recipients** within seconds of the offending message.
- Alert carries: account, trigger reason, customer name/phone (if known), last messages,
  deep link to the live conversation in admin.
- Recipients are configurable **per account from admin** (under account settings).
- Log every escalation so it's auditable / visible.
- No added latency to the customer-facing response.

**Non-goals (explicit fast-follows, not in MVP):**
- In-chat live human takeover (reuse of `chat_handoffs` WhatsApp relay).
- Full CRM ticket workflow (assignment SLAs, reminders) beyond a logged record.
- LLM-based detection (MVP is keyword/regex; LLM confirmation is a later refinement).

## 3. Architecture

### 3.1 Detection — post-response, fire-and-forget
Detection runs **after** the bot's response is streamed, off the hot path, so it never
adds latency. It evaluates the current user message plus the last 2–3 turns.

Reuses the existing risk-keyword logic that already powers `understandMessageFast`
(`src/engines/understanding/`). The AI-nano classifier times out in production
(see `src/app/api/chat/stream/route.ts:319` comment), so regex is what actually runs —
which is fine and free for MVP. Because detection is off the hot path, an optional cheap
LLM confirmation can be layered in later to cut false positives without touching latency.

**Trigger conditions (any → escalate):**
- `risk.legal` — תביעה / עורך דין / משפט / "sue" / "lawyer" / "court"
- `risk.harassment` / `intent==='abuse'` — קללות / איומים / abusive language
- Explicit human demand — "נציג" / "מנהל" / "בן אדם אמיתי" / "מענה עכשיו" / "human" / "manager"
- Sustained anger — `sentiment==='negative'` on the current turn AND at least one prior
  negative turn in the last 3 (single grumpy message ≠ escalation).

### 3.2 Recipients & routing — account-scoped, admin-configured
New per-account config block:

```jsonc
// accounts.config.escalation
{
  "enabled": true,
  "recipients": [
    { "name": "יואב",  "whatsapp": "9725...", "email": "yoav@..." }
  ],
  "dedupeMinutes": 15        // optional; default 15
}
```

Resolution order at alert time:
1. `config.escalation.recipients` (primary — works for all accounts incl. Argania / Studio Pasha
   which have no `support_agents`).
2. Fallback: active `support_agents` for the account (LA BEAUTÉ has 9, with email).
3. If neither resolves → log a warning escalation record and emit an admin-level alert
   (`sendAdminAlert`) so it's never silently dropped.

Recipients are edited from **admin → account settings**, saved via the existing
`src/app/api/admin/accounts/[accountId]/integrations/route.ts` pattern (which already writes
to `accounts.config`), surfaced in the `src/app/admin/accounts` UI.

### 3.3 Channels — email now, WhatsApp when template approved
- **Email (MVP, ships day one):** reuse `sendEmail` / `sendAdminAlert` in `src/lib/email.ts`
  (Gmail API, already wired). Sent to every recipient `email`.
- **WhatsApp (fast-follow):** reuse `runTemplate` in `src/lib/whatsapp-notify.ts`. Meta requires
  a **pre-approved template** to message an agent outside a 24h window, so WhatsApp turns on once
  an `escalation_alert` template is registered + approved (a few days at Meta). Template params
  must respect the sanitizer rules (no `\n`, `\t`, 5+ spaces — already enforced at the
  `runTemplate` chokepoint).

Alert body (email + WA): account name · trigger reason (e.g. "legal threat + anger") ·
customer name/phone if known · last 2–3 messages · deep link to the conversation in admin.

### 3.4 Dedup
One alert per `session_id` per `dedupeMinutes` (default 15). Implemented by checking for a
recent `support_requests` row with `source='auto_escalation'` and the same `session_id`
before sending. An angry thread produces one ping, not ten.

### 3.5 Record / audit
Reuse `support_requests` (no new table). On escalation, upsert a row:
- `source = 'auto_escalation'`
- `status = 'new'`
- `session_id`, `customer_name`, `customer_phone`, `customer_email`, `message` (offending text)
- `metadata.escalation = { severity, reason, triggers[], detected_at, recipients_notified[],
  channels[] }`
This makes escalations visible in the existing support/admin views and powers dedup.

### 3.6 In-conversation behavior
The customer-facing reply stays calm and empathetic and tells the customer a team member will
reach out — reusing the existing `escalation_requires_human` / empathetic-tone rule in
`src/engines/decision/rules/escalation.ts`. **No fabricated SLA promises** ("within X minutes").

## 4. Components & files

| Concern | File | Change |
|---|---|---|
| Detector | `src/engines/escalation/detect.ts` (new) | Pure fn: (message, recentTurns) → `{ escalate, severity, reason, triggers[] }`, reusing understanding risk keywords |
| Dispatcher | `src/engines/escalation/dispatch.ts` (new) | Resolve recipients → dedup check → send email (+WA when enabled) → write `support_requests` record |
| Hook (chat) | `src/app/api/chat/stream/route.ts` | After `done`, fire-and-forget `runEscalation(...)` (`.catch(console.error)`) |
| Hook (widget) | `src/lib/chatbot/widget-chat-handler.ts` | Same fire-and-forget hook |
| Recipients API | `src/app/api/admin/accounts/[accountId]/integrations/route.ts` | Extend to read/write `config.escalation` |
| Recipients UI | `src/app/admin/accounts/...` | "Escalation / support contacts" section per account |
| Email | `src/lib/email.ts` | Reuse `sendEmail` / `sendAdminAlert` (new escalation template fn) |
| WhatsApp | `src/lib/whatsapp-notify.ts` | New `sendEscalationAlert()` wrapping `runTemplate` (gated on approved template) |
| Feature flag | env `ESCALATION_ENABLED` + per-account `config.escalation.enabled` | Gate rollout |

## 5. Failure modes / edge cases
- **No recipients configured** → still log record + `sendAdminAlert`; never silent.
- **Email send fails** → log on the record (`metadata.escalation.channels` reflects success/fail);
  don't throw (fire-and-forget).
- **False positive** (e.g. quoting "תביעה" rhetorically) → acceptable for MVP; dedup limits noise;
  LLM confirmation is the later mitigation.
- **WhatsApp template not yet approved** → WA path is a no-op; email still fires.
- **High-traffic angry thread** → dedup window caps to one alert per 15 min/session.
- **Detector throws** → caught by the fire-and-forget wrapper; customer response already sent.

## 6. Testing
- Unit: `detect.ts` — table of Hebrew/English messages → expected `{escalate, triggers}`
  (legal, abuse, human-demand, sustained-anger, benign-negative-single-turn = no escalate).
- Unit: recipient resolution (config recipients → support_agents fallback → admin-alert fallback).
- Unit: dedup (second message in window does not re-send).
- Integration: stream route fires escalation without delaying the streamed response.

## 7. Rollout
1. Ship detector + dispatcher + record + **email** channel behind `ESCALATION_ENABLED`,
   `config.escalation.enabled` per account.
2. Add admin recipients UI; populate recipients for LA BEAUTÉ, Argania, Studio Pasha.
3. Register + approve `escalation_alert` WhatsApp template at Meta; enable WA channel.
4. (Fast-follow) LLM confirmation; in-chat takeover via `chat_handoffs`; CRM ticket workflow.

## 8. Open questions
- Exact alert deep-link target (admin conversation view URL pattern) — confirm during planning.
- Severity tiers: do we want only one tier for MVP, or legal/abuse = "critical" vs human-demand =
  "high"? (Default: single tier in MVP, `metadata.severity` recorded for future use.)
