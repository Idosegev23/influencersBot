# ROLLOUT VERIFICATION REPORT

> Phases A-F | 2026-02-17

---

## 1. Runtime Path Trace

```
POST /api/chat/stream
  │
  ├─ [A] Validate: idempotency, rate limit, session lock
  ├─ [B] loadChatContextCached(accountId) → persona, brands, content
  ├─ [C] Engine v2: understand → decide → policy
  │
  ├─ [D] History load (stream/route.ts:559-564):
  │    SELECT role, content FROM chat_messages           ← FIXED (was 'message')
  │    WHERE session_id = ? ORDER BY created_at DESC LIMIT 10
  │    → .reverse() → [{role, content}]                 ← max 10 messages
  │
  ├─ [E] Memory V2 inject (stream/route.ts:573-587):     ← GATED: MEMORY_V2_ENABLED
  │    └─ buildConversationContext(sessionId, history)
  │       ├─ SELECT rolling_summary FROM chat_sessions WHERE id = ?
  │       └─ if rollingSummary: unshift({role:'assistant', content:'[סיכום...]'})
  │
  ├─ [F] SandwichBot (sandwichBot.ts:49-151):
  │    ├─ routeToArchetype(msg, history) → archetype
  │    ├─ retrieveKnowledge(accountId, archetype, msg) → KnowledgeBase (FTS)
  │    └─ processWithArchetype → baseArchetype
  │
  ├─ [G] baseArchetype.generateAIResponse (baseArchetype.ts:210-354):
  │    ├─ historyMessages = input.conversationHistory.map({role, content})
  │    ├─ kbContext = buildKnowledgeContext(kb)           ← FTS knowledge
  │    ├─ systemPrompt = archetype + personality + rules + [grounding if V2]
  │    ├─ userPrompt = kbContext + userMessage
  │    └─ messages = [system, ...historyMessages, user]
  │         │
  │         ├─ [0] system: archetype role + personality + rules + grounding(V2)
  │         ├─ [1] (V2 only) assistant: "[סיכום שיחה קודמת: ...]"
  │         ├─ [2..N] conversation history (up to 10 from DB)
  │         └─ [N+1] user: FTS knowledge context + user message
  │
  ├─ [H] Stream NDJSON: meta → delta* → done
  ├─ [I] Save messages: saveChatMessage(sessionId, 'user'|'assistant', text)
  │
  └─ [J] Memory V2 summary update (stream/route.ts:672-687): ← GATED
       └─ if shouldUpdateSummary(msgCount):
            updateRollingSummary(sessionId, fullHistory).catch(...)  ← fire-and-forget
```

---

## 2. Verification: MEMORY_V2_ENABLED=false

| Check | Status | Evidence |
|-------|--------|----------|
| History query uses `content` column | ✅ PASS | stream/route.ts:561 — `.select('role, content')` |
| History returns non-empty when messages exist | ✅ PASS | SQL verified: `SELECT role, content FROM chat_messages` returns data with real content |
| Outgoing payload includes recent turns | ✅ PASS | baseArchetype.ts:276-280 — `[system, ...historyMessages, user]` |
| No memory code executes | ✅ PASS | Guard `process.env.MEMORY_V2_ENABLED === 'true'` blocks lines 573 and 672 |
| No grounding directive in system prompt | ✅ PASS | baseArchetype.ts:263 — ternary returns `''` when flag is false |
| RAG precision unchanged | ✅ PASS | retrieve.ts:282 — guard blocks dynamic threshold/diversity/skip-rerank |

### Redacted payload sample (flag=false):

```
messages[0] = { role: "system", content: "אתה [NAME], משפיענית...
  🎯 תפקיד: [archetype]
  📝 [description]
  🎭 סגנון אישיות: [personality]
  ⚠️ כללים קריטיים: 1-10..." }

messages[1] = { role: "user", content: "שלום, מה קורה?" }
messages[2] = { role: "assistant", content: "היי! מה שלומך?" }
... (up to 10 history messages)

messages[N] = { role: "user", content: "📚 **בסיס הידע שלי:**
  📸 תוכן מפוסטים (5)...
  💰 קופונים זמינים (3)...
  ✨ הילייטס (8)...

  💬 שאלת המשתמש:
  \"[user question]\"

  תן תשובה קצרה, ספציפית ומועילה בעברית:" }
```

---

## 3. Verification: MEMORY_V2_ENABLED=true

| Check | Status | Evidence |
|-------|--------|----------|
| Rolling summary injected when exists | ✅ PASS | stream/route.ts:578-582 — unshifts summary as assistant message |
| Recent turns still included | ✅ PASS | History from DB (up to 10) + summary at position [0] |
| RAG context still injected (FTS) | ✅ PASS | kbContext built in baseArchetype.ts:218, placed in userPrompt at line 269 |
| RAG context does NOT override memory | ✅ PASS | They occupy different positions: summary in history, knowledge in user prompt |
| Grounding directive present | ✅ PASS | baseArchetype.ts:263-267 — appended to system prompt |
| Summary update fires correctly | ✅ PASS | stream/route.ts:672-687 — fire-and-forget with catch |
| rolling_summary column exists | ✅ PASS | SQL verified: `text, nullable` in chat_sessions |

### Redacted payload sample (flag=true, with rolling summary):

```
messages[0] = { role: "system", content: "אתה [NAME], משפיענית...
  🎯 תפקיד: [archetype]
  📝 [description]
  🎭 סגנון אישיות: [personality]
  ⚠️ כללים קריטיים: 1-10...
  🔒 הנחיית דיוק:                          ← NEW
  - ענה רק על בסיס המידע שניתן לך...
  - אל תמציאי מידע..." }

messages[1] = { role: "assistant",                     ← NEW: summary
  content: "[סיכום שיחה קודמת: המשתמש שאל על קופונים של ספרינג. הומלץ קוד MIRAN.]" }

messages[2] = { role: "user", content: "..." }         ← history from DB
messages[3] = { role: "assistant", content: "..." }
... (up to 10 history messages from DB)

messages[N] = { role: "user", content: "📚 **בסיס הידע שלי:**
  [FTS knowledge context - same as before]

  💬 שאלת המשתמש: \"[user question]\"
  תן תשובה קצרה, ספציפית ומועילה בעברית:" }
```

---

## 4. Payload Ordering Verification

| Position | Content | Spec Match |
|----------|---------|------------|
| 1 | System prompt (archetype + personality + rules + grounding) | ✅ |
| 2 | Rolling summary as assistant message (if enabled + exists) | ✅ |
| 3..N | Recent conversation turns (up to 10 from DB) | ✅ |
| N+1 | User prompt: FTS knowledge context (XML/emoji) + user message | ✅ |

**Ordering matches the spec: system → summary → history → RAG+message.**

---

## 5. Issues Found

### ISSUE 1: Message count for shouldUpdateSummary was fragile ~~(MEDIUM)~~ FIXED

**Was:** `conversationHistory.length + 2` — unreliable because array length changes with SQL LIMIT and summary prepend.

**Fixed in PHASE C:** Now uses `session.message_count + 2` from the DB, which is the true persistent count incremented by `saveChatMessage()`.

### ISSUE 2: HISTORY_WINDOW mismatch (LOW)

**Location:** conversation-memory.ts:19 vs stream/route.ts:564

`HISTORY_WINDOW = 12` in the memory module is never applied — the SQL `LIMIT 10` in stream/route.ts controls the actual window. The `buildConversationContext()` calls `.slice(-HISTORY_WINDOW)` on the 10 messages passed to it, which has no effect (10 < 12).

**Impact:** Cosmetic only. Not a bug — just a misleading constant.

### ISSUE 3: No retry on summary update failure ~~(MEDIUM)~~ FIXED

**Fixed in PHASE B:** Added 2 retries with exponential backoff (500ms, 1000ms). Structured logging on success/failure with session_id and duration. Tests added.

### ISSUE 4: No token budget enforcement ~~(MEDIUM)~~ FIXED

**Fixed in PHASE C:** Added `trimToTokenBudget()` — drops oldest history first (keeps min 4), then truncates summary. Budget: 12K tokens for history+summary portion. Logged via `[Memory] Context prepared { trimmed, estimatedTokens }`.

### ISSUE 5: rate-limit.test.ts failures ~~(LOW, PRE-EXISTING)~~ FIXED

**Fixed in PHASE E:** Updated test to match current API signature: `checkRateLimit(scope, bucket, ctx, config)`. Fixed field names: `allowed` not `success`, `limit` not `maxRequests`. Added `await` for async function. All 3 tests now pass.

---

## 6. Summary

| Category | Verdict |
|----------|---------|
| Bug fix (history column) | ✅ Correct, wired, verified |
| Memory injection (flag=true) | ✅ Correctly gated, properly positioned |
| No-change when flag=false | ✅ Identical to pre-change behavior (minus bug fix) |
| Grounding directive | ✅ Present only when flag=true |
| RAG context preserved | ✅ FTS knowledge always injected regardless of flag |
| Payload ordering | ✅ Matches spec |
| Summary persistence | ✅ Retry with backoff (PHASE B) |
| Token budgeting | ✅ trimToTokenBudget guardrail (PHASE C) |
| Summary trigger stability | ✅ Uses DB message_count (PHASE C) |
| Rate-limit tests | ✅ Fixed — 72/72 passing (PHASE E) |
| Per-account rollout | ✅ accounts.features.memory_v2 override (PHASE F) |
| Snapshots | ✅ baseline-flag-off.json + baseline-flag-on.json (PHASE D) |

---

## 7. Final Test Report

```
 Test Files  6 passed (6)
      Tests  72 passed (72)
   Duration  735ms
```

| File | Tests |
|------|-------|
| conversation-memory.test.ts | 30 |
| rag-chunker.test.ts | 16 |
| rag-retrieve.test.ts | 11 |
| utils.test.ts | 9 |
| sanitize.test.ts | 3 |
| rate-limit.test.ts | 3 |

---

## 8. Files Changed (Full Manifest)

| File | Change |
|------|--------|
| `src/app/api/chat/stream/route.ts` | Bug fix + memory integration + per-account flag + token budget |
| `src/lib/chatbot/conversation-memory.ts` | NEW: memory module with retry, token budget |
| `src/lib/chatbot/archetypes/baseArchetype.ts` | Grounding directive (env-gated) |
| `src/lib/rag/retrieve.ts` | Precision improvements (env-gated) |
| `tests/unit/conversation-memory.test.ts` | NEW: 30 tests |
| `tests/unit/rate-limit.test.ts` | Fixed: correct API signature |
| `scripts/snapshot-payload.ts` | NEW: payload snapshot tool |
| `snapshots/baseline-flag-off.json` | Regression snapshot |
| `snapshots/baseline-flag-on.json` | Regression snapshot |
| `CURRENT_STATE.md` | Discovery report |
| `CHANGE_PROPOSAL.md` | Implementation proposal |
| `ROLLOUT_VERIFICATION.md` | This file |
| `ROLLOUT_PLAN.md` | Step-by-step rollout guide |
| DB: `chat_sessions.rolling_summary` | Additive column (TEXT, nullable) |
