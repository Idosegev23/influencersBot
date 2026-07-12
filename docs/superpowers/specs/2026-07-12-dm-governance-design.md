# DM Bot Governance — design

**Date:** 2026-07-12
**Status:** Design — approved for spec review
**Owner:** Ido
**Applies to:** LDRS Instagram DM bot (extensible to any account via config)

---

## 1. Problem

The LDRS Instagram DM auto-reply bot (`src/lib/instagram-graph/dm-handler.ts`) replies to every inbound DM whenever `config.dm_bot_enabled === true`. It has no awareness of three things a real human operator needs:

1. **Human takeover** — when the account owner replies to a thread themselves (from the Instagram app), the bot keeps answering on top of them. It should go quiet in that thread.
2. **Flag-worthy messages** — some DMs need a human, both **negative** (angry / legal threat / abuse / "I want a human") and, just as important for an influencer, **positive high-value** ones: collaboration offers, brand partnerships, paid-promotion / business inquiries. Today none of these reach the owner proactively; they can be buried under routine chatter.
3. **No daily visibility** — the owner has no summary of what the DM bot handled: how many conversations, which opportunities came in, which threads escalated or were taken over.

## 2. Goal

Add a **DM Governance** layer to the Instagram DM path with three independent components, reusing existing infrastructure wherever possible:

- **A. Human takeover** — detect owner-sent messages and pause the bot in that conversation, auto-resuming after 24h of owner quiet.
- **B. Flag detection + owner alert** — classify each inbound DM as *escalation* (negative) or *opportunity* (positive); alert the owner on WhatsApp; hand the thread off to the human.
- **C. Daily summary** — a once-a-day WhatsApp digest of DM activity to the owner.

All gated per-account behind a new `config.dm_governance.enabled`, independent of the legacy dormant `ESCALATION_ENABLED` flag (which continues to gate only the web-chat/widget escalation path).

## 3. Non-goals

- No change to the SandwichBot reply generation itself.
- No new admin UI in this spec (config is set via SQL / existing account config tooling; a UI can follow later).
- Not re-enabling the legacy chat/widget escalation path (`ESCALATION_ENABLED`) — this is a separate, DM-scoped subsystem that reuses the same pure detector.
- No WhatsApp *inbound* handling — alerts are outbound-only (owner reads them, then acts in Instagram).
- No LLM classifier for opportunities in v1 — keyword-based, mirroring the existing escalation detector (LLM upgrade is a future option).

## 4. Reuse map (what already exists)

| Need | Existing asset | Action |
|---|---|---|
| Negative detection | `src/engines/escalation/detect.ts` `detectEscalation()` (pure, He+En keywords) | Reuse as-is |
| Escalation recipients | `config.escalation.recipients[]` (has an unused `whatsapp` field) | Reuse the `whatsapp` field |
| WhatsApp send | `sendText` + `toWaId` in `@/lib/whatsapp-cloud/client` | Reuse |
| Audit table | `support_requests` (escalation already writes here) | Reuse; add `kind` in metadata |
| Digest text pattern | `buildDigestText` in `src/lib/crm/agent-nudges.ts` | Mirror for `buildDmSummaryText` |
| Cron skeleton | `verifyCronSecret` + `vercel.json` crons[] | Copy pattern |
| Dedup mechanism | `chat_messages.meta_mid` lookup in `dm-handler.ts` | Reuse for owner-echo detection |
| Session store | `chat_sessions` (thread_id `dm_ig_graph_<sender>_<account>`) | Add `paused_until` column |

## 5. Component A — Human takeover

### A.1 Detecting an owner-sent message

When the owner replies from the Instagram app, Meta delivers a webhook **echo** (`message.is_echo === true`, `sender.id` = the business). The bot's OWN outbound sends also arrive as echoes — the platform does not distinguish them. Today both are dropped unlogged at `src/app/api/webhooks/instagram/route.ts` (lines ~143 and ~199).

We distinguish bot-echo from owner-echo using the existing `meta_mid` ledger:

1. **Persist the assistant's `meta_mid`.** In `dm-handler.ts`, when the bot sends, capture the `message_id` returned by `sendInstagramDM`/`sendLong…` and store it on the assistant `chat_messages` row (`meta_mid`). *(Today only the user row gets a `meta_mid`.)*
2. **On an echo webhook**, look up `chat_messages.meta_mid === echo.mid`:
   - **Found** → it is the bot's own echo → ignore (current behavior).
   - **Not found** → the owner typed it manually → this is a **takeover**.

Handling the send-splitters: `sendLongInstagramDM*` can return multiple ids; store all of them (e.g. the assistant row's `meta_mid` holds the first, plus a `meta_mid_all text[]` — or store the set in `metadata`). To keep it simple and robust, the takeover check treats "echo.mid matches ANY assistant-sent id for this account in the last N hours" as bot-origin.

### A.2 Pausing + auto-resume

- On takeover, set `chat_sessions.paused_until = now + takeover_hours` (default 24h) for that thread, and persist the owner's message as a `role='assistant'` row tagged `metadata.by='human'` (so history and the daily summary see it).
- Each further owner echo **pushes `paused_until` forward** by another 24h → "24h of quiet" semantics.
- **Enforcement:** in `processInstagramGraphDM`, immediately after the session is loaded (`dm-handler.ts:~113`), if `session.paused_until` is in the future → log and return without replying. Because it is a timestamp, the bot resumes automatically once 24h passes with no new owner echo — no cron needed.

### A.3 Data

- Migration: `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS paused_until timestamptz;`
- Assistant `chat_messages` rows now carry `meta_mid` (existing column) and `metadata.by` (`'bot'` | `'human'`).

## 6. Component B — Flag detection + owner WhatsApp alert

### B.1 Detection (two axes)

A new orchestrator `classifyDmFlag(message, priorUserMessages)` returns `{ kind: 'escalation' | 'opportunity' | null, category, reason }`:

- **Negative** → reuse `detectEscalation(message, priorUserMessages)`; if it escalates, `kind='escalation'`, carry its `triggers`/`severity`.
- **Positive** → new pure `detectOpportunity(message)` in the same keyword style. Hebrew + English collaboration/business keywords, e.g.: שיתוף פעולה, שת"פ, קמפיין, שגריר/ה, אמבסדור, ברטר, תקציב, פרסום ממומן, קולקציה, הצעה עסקית, מדיה, PR / collab, collaboration, partnership, ambassador, campaign, sponsored, brand deal, budget, rate, media kit, paid promo. Returns `{ match: boolean, category, matched: string[] }`.
- Escalation takes precedence over opportunity if both match.

`detectOpportunity` is pure and unit-tested, exactly like `detectEscalation`.

### B.2 Action

Runs in `dm-handler.ts` on each inbound user message (before/around the reply), gated by `config.dm_governance.enabled`:

- **Escalation** → alert owner (WhatsApp) + **pause** the thread (`paused_until = now + takeover_hours`), and DO NOT send the normal bot reply for this message.
- **Opportunity** → alert owner (WhatsApp) + send a single **holding reply** (`config.dm_governance.opportunity_reply`, default Hebrew: "תודה על הפנייה! 🙌 מעבירה לצוות ונחזור אליך בהקדם") + **pause** the thread. *(Chosen behavior: holding-reply + pause — professional and safe; the owner closes the deal.)*
- **None** → normal bot flow.

### B.3 Alert delivery + dedup

- `sendDmOwnerAlert(account, { kind, category, reason, customerUsername, message, threadPermalink? })` → `sendText` to each `config.escalation.recipients[].whatsapp` (fallback: `config.dm_governance.owner_whatsapp`).
- Alert text (Hebrew) states the kind (🔴 escalation / 💰 opportunity), the customer's `@username`, the message excerpt, and "the bot is paused on this conversation — reply from Instagram to take over."
- **Dedup:** write a `support_requests` row (`source: 'dm_governance'`, `metadata.kind`, `metadata.category`) and skip re-alerting the same `(account, thread, kind)` within `dedupeMinutes` (default 60) — reusing the escalation dedup approach. These rows also feed Component C's counts.

### B.4 Order of guards in `dm-handler.ts`

```
resolve account → dm_bot_enabled? → dedup(meta_mid) → session
  → [A] paused_until in future? → stop
  → [B] classifyDmFlag → escalation? alert+pause+stop
                        → opportunity? alert+holdingReply+pause+stop
  → normal SandwichBot reply
```

## 7. Component C — Daily summary (WhatsApp)

- New cron route `src/app/api/cron/dm-daily-summary/route.ts` (`verifyCronSecret`, `runtime='nodejs'`, `maxDuration=300`) + a `vercel.json` entry (e.g. `0 17 * * *` = 20:00 IL).
- For each account with `config.dm_governance.daily_summary === true`:
  - Query DM sessions active in the last 24h: `chat_sessions` where `thread_id LIKE 'dm_ig_graph_%'` and `account_id = …` and updated in-window; join `chat_messages` for counts.
  - Query `support_requests` (`source='dm_governance'`) in-window for opportunity/escalation counts.
  - Compute: conversations, new contacts (first-seen threads), inbound/outbound messages, opportunities, escalations, threads currently paused (takeover), and up to 3 notable items (opportunities first).
  - `buildDmSummaryText(stats)` → Hebrew digest (mirrors `buildDigestText`).
  - `sendText` to the owner WhatsApp (`config.escalation.recipients[].whatsapp` / `config.dm_governance.owner_whatsapp`).
- Pure `buildDmSummaryText(stats)` is unit-tested; the data-gathering query is integration-verified.

## 8. Config & gating

New namespace on `accounts.config`:

```jsonc
"dm_governance": {
  "enabled": true,              // master per-account switch for this whole layer
  "takeover_hours": 24,         // A: pause window / quiet-to-resume
  "opportunity_alerts": true,   // B: fire on positive opportunities
  "opportunity_reply": "תודה על הפנייה! 🙌 מעבירה לצוות ונחזור אליך בהקדם",
  "daily_summary": true,        // C
  "owner_whatsapp": "9725…"    // fallback if config.escalation.recipients has no whatsapp
}
```

- When `dm_governance.enabled !== true`, the whole layer is a no-op (bot behaves exactly as today).
- Independent of `ESCALATION_ENABLED`; reuses only the *pure* `detectEscalation` function, not the legacy `runEscalationCheck` env gate.

## 9. Error handling

- All governance work is **best-effort and non-blocking**: a failure in flag detection, alert send, or `paused_until` write must never drop the customer's message or crash the webhook. Wrap each in try/catch; on error, fall through to normal bot behavior and log.
- WhatsApp send failures are logged; the `support_requests` audit row is still written so the daily summary stays accurate.
- Takeover false-negative (owner echo misclassified as bot) is the acceptable-failure direction (bot keeps replying) over false-positive (bot goes silent on a live customer for 24h) — so the meta_mid match must be conservative: only treat as bot-origin on a definite id match.

## 10. Testing

- **Unit (pure):** `detectOpportunity` (matches He+En collab keywords; ignores routine text); `classifyDmFlag` precedence (escalation beats opportunity; none when neither); `buildDmSummaryText` (Hebrew, includes the numbers); a takeover-decision helper `isOwnerEcho(echoMid, knownSentMids)`.
- **Integration-verified (manual):** owner replies from IG app → thread pauses → bot silent → resumes after window; a seeded collab DM → owner WhatsApp alert + holding reply + pause; daily summary cron produces a correct digest for a day of seeded DM traffic.
- Type-check clean for all new files.

## 11. Rollout / build order

Independent, individually shippable, in order:

1. **A — Human takeover** (migration + webhook echo classification + `dm-handler` guard).
2. **B — Flag alerts** (`detectOpportunity` + `classifyDmFlag` + `sendDmOwnerAlert` + `dm-handler` wiring + `support_requests` audit).
3. **C — Daily summary** (`buildDmSummaryText` + cron + `vercel.json`).

Enable for LDRS by setting `config.dm_governance` and populating a `whatsapp` recipient. Push to `main` per project convention.

## 12. Open items / risks

- **`chat_sessions` / `chat_messages` base schema is not under migration control** (predates numbered migrations); confirm the live columns (`paused_until` absence, `metadata` presence, `meta_mid`) against the DB before the migration.
- **Multi-id echo mid** from `sendLong…` splitters — store all returned ids so a takeover check never misfires on a multi-part bot reply.
- **Opportunity keyword precision** — keyword lists will over/under-match; acceptable for v1 (owner gets a WhatsApp they can ignore). Tune lists from real misses; LLM classifier is the future upgrade.
- **Owner WhatsApp opt-in / 24h window** — outbound WhatsApp to the owner uses the Cloud API; if the owner hasn't messaged the business number within 24h, a template may be required. Confirm the existing `agent-digest` free-form send works for this recipient, else use an approved template.
