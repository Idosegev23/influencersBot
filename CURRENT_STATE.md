# CURRENT_STATE.md — Conversation Memory Discovery Report

> Generated: 2026-02-17 | PHASE 0 output

---

## 1. File Map — Chat & Session Handling

| File | Lines | Role |
|------|-------|------|
| `src/app/api/chat/stream/route.ts` | 709 | **Primary chat endpoint** — NDJSON streaming, engine v2 pipeline |
| `src/lib/chatbot/sandwichBot.ts` | 231 | Bot orchestrator — routes archetype → knowledge → archetype → personality |
| `src/lib/chatbot/archetypes/baseArchetype.ts` | 527 | **Actual LLM call** — builds system prompt + messages, calls GPT-5.2 |
| `src/lib/chatbot/knowledge-retrieval.ts` | 812 | Fetches posts/highlights/coupons/partnerships/transcriptions via FTS |
| `src/lib/gemini-chat.ts` | 436 | Gemini 3 Flash chat functions — **imported but NOT called** in stream route |
| `src/lib/supabase.ts` | 1143 | DB operations: `createChatSession`, `saveChatMessage`, `getChatMessages` |
| `src/lib/rag/answer.ts` | ~200 | RAG `answerQuestion()` — **NOT used in production chat**, only CLI |
| `src/lib/rag/retrieve.ts` | ~300 | RAG `retrieveContext()` — vector search pipeline |

## 2. Database Schema — Chat Tables

### `chat_sessions`
```
id            uuid        PK, gen_random_uuid()
account_id    uuid        NOT NULL, FK → accounts(id) ON DELETE CASCADE
thread_id     text        nullable
message_count integer     default 0
state         varchar(50) default 'Idle'
meta_state    varchar(50) nullable
version       integer     default 1
created_at    timestamptz default now()
updated_at    timestamptz default now()
```
- **62 rows**, 3 distinct `account_id` values
- **NO `rolling_summary` column**
- **NO `user_id` column** (only `account_id` for tenant isolation)
- **RLS: DISABLED**

### `chat_messages`
```
id          uuid        PK, gen_random_uuid()
session_id  uuid        FK → chat_sessions(id) ON DELETE CASCADE
role        text        CHECK ('user' or 'assistant')
content     text        (the actual message text)
created_at  timestamptz default now()
```
- **320 rows**, 61 distinct sessions
- **RLS: DISABLED**
- **Note:** Column is `content` in schema, but stream route queries `message` field at line 561: `.select('role, message')` — this works because Supabase PostgREST aliases or the client handles it. The `saveChatMessage()` function inserts with `content` field.

## 3. Current Chat Flow (Production)

```
POST /api/chat/stream
  │
  ├─ 1. Validate: idempotency, rate limit, session lock
  ├─ 2. Load context: loadChatContextCached(accountId)  → persona, brands, content
  ├─ 3. Engine v2:
  │    ├─ Understanding engine → intent, entities, risk flags
  │    ├─ Decision engine → handler routing
  │    └─ Policy engine → rate limiting, security
  │
  ├─ 4. Load history (stream/route.ts:559-571):
  │    SELECT role, message FROM chat_messages
  │    WHERE session_id = ?
  │    ORDER BY created_at DESC
  │    LIMIT 10
  │    → reverse() → [{role, content}]
  │
  ├─ 5. SandwichBot (sandwichBot.ts):
  │    ├─ routeToArchetype() → selects archetype
  │    ├─ retrieveKnowledge() → FTS parallel fetch from 7 sources
  │    └─ processWithArchetype() → calls baseArchetype
  │
  ├─ 6. baseArchetype.generateAIResponse() (baseArchetype.ts:210-354):
  │    ├─ Model: gpt-5.2-2025-12-11 (fallback: gpt-4o)
  │    ├─ Messages array:
  │    │   [0] system: archetype role + personality + behavioral rules
  │    │   [1..N] ...conversationHistory (last 10 messages)
  │    │   [N+1] user: knowledge context + user message
  │    ├─ max_completion_tokens: 500
  │    └─ stream: true (when onToken callback present)
  │
  ├─ 7. Stream NDJSON events: meta → delta* → done
  │
  └─ 8. Save messages:
       saveChatMessage(sessionId, 'user', message)
       saveChatMessage(sessionId, 'assistant', fullText)
```

## 4. LLM Payload Structure (baseArchetype.ts)

### System Prompt (lines 239-262)
```
אתה {archetype.name}, {archetype.description}
[personality block from DB]
[response templates for different scenarios]
[10 critical behavioral rules in Hebrew]
```

### Messages Array (lines 271-275)
```typescript
[
  { role: 'system', content: systemPrompt },           // archetype + personality + rules
  ...conversationHistory,                               // last 10 messages from DB
  { role: 'user', content: `${knowledgeContext}\n\n${userMessage}\n\nענה בעברית...` }
]
```

### Knowledge Context Format (built by buildKnowledgeContext, lines 359-471)
```
📱 פוסטים רלוונטיים:
---
[קישור: ...] | 📅 ... | ❤️ ... | 💬 ...
תיאור: ...
---

🎬 תמלולי וידאו רלוונטיים:
---
[וידאו: ...] | 📅 ...
תמלול: ...
---

🎯 תובנות שיחה:
...

🏷️ קופונים זמינים:
...

🤝 שיתופי פעולה:
...

🌐 תוכן אתר:
...

📌 היילייטים רלוונטיים:
...
```

## 5. Gemini Path (UNUSED in production)

- `streamChatWithGemini` is imported at stream/route.ts:17 but **never called**
- `gemini-chat.ts` defines:
  - `AI_MODELS.CHAT_RESPONSES = 'gemini-3-flash-preview'`
  - `chatWithGemini()` / `streamChatWithGemini()` — takes history in Gemini format
  - `buildSystemInstructions()` — rich persona-based system instructions
- Currently a dead import; Gemini path may have been the original plan but GPT-5.2 via SandwichBot is the active path.

## 6. RAG Pipeline (answerQuestion) — NOT in Production Chat

- `answerQuestion()` exists in `src/lib/rag/answer.ts`
- Only called from `scripts/rag-cli.ts` (CLI tool)
- **Not integrated** into stream/route.ts or SandwichBot
- Uses: classify → filter → vector search → rerank → LLM answer
- Separate from the knowledge-retrieval.ts FTS pipeline

## 7. Why Continuity Currently Fails

### Problem 1: Hard 10-message window
- stream/route.ts:564 — `LIMIT 10` with no summarization
- After 10 exchanges (5 user + 5 assistant), earliest context is **permanently lost**
- No rolling summary preserves prior context

### Problem 2: No conversation state tracking
- chat_sessions has no `rolling_summary`, no `topic`, no `user_goals` field
- Each request is essentially stateless beyond the raw message window

### Problem 3: No cross-session memory
- Sessions are isolated; new session = fresh start
- No user preference/fact persistence across sessions

### Problem 4: Knowledge context is per-turn only
- Knowledge retrieved via FTS for current message only
- No carry-forward of relevant knowledge from earlier in conversation
- If user discusses topic A in turn 1, then topic B in turn 5, context about A is gone

### Problem 5: No grounding enforcement
- System prompt has behavioral rules but no strict grounding instruction
- No "only answer from provided sources" directive
- LLM can hallucinate freely outside knowledge context

## 8. Existing Patterns & Constraints

| Pattern | Detail |
|---------|--------|
| Feature flags | **None exist** — no `process.env.*_ENABLED` pattern in codebase |
| Multi-tenant isolation | `account_id` on every table, but RLS disabled on chat tables |
| Cache layer | L1 (in-memory LRU via `@/lib/cache`) + L2 (Upstash Redis via `@/lib/redis`) |
| Message save | `saveChatMessage(sessionId, role, content)` → inserts + increments count |
| Session create | `createChatSession(influencerId)` → inserts with `account_id` |
| Error handling | Try/catch with fallback models (GPT-5.2 → GPT-4o) |
| Streaming | NDJSON via ReadableStream with `meta → delta* → done` events |

## 9. CRITICAL BUG: Conversation History Is Broken

**Verified via SQL:** The `chat_messages` table has columns: `id, session_id, role, content, created_at`. There is **NO `message` column**. No view or alias exists.

The stream route at line 561 queries:
```typescript
.select('role, message')  // ← 'message' does NOT exist
```

PostgREST returns a 400 error for non-existent columns. The Supabase client returns `{ data: null, error: {...} }`. Since the code only destructures `data`:
```typescript
const { data: historyMessages } = await supabase...  // data is null
const conversationHistory = (historyMessages || [])   // [] empty
  .reverse().map(...)                                  // [] empty
```

**Result: The bot has been running with ZERO conversation history.** Every turn is stateless — the LLM only sees the system prompt + current user message. This explains why continuity fails.

**Fix (in scope of this work):** Change `.select('role, message')` to `.select('role, content')` and change `m.message` to `m.content` at line 570. This is a one-line fix that restores the 10-message window immediately.

---

## 10. Summary — What Needs to Change

To add conversation memory, these are the **minimal touchpoints**:

1. **DB migration:** Add `rolling_summary TEXT` to `chat_sessions`
2. **New module:** `src/lib/chatbot/conversation-memory.ts` — summary generation + retrieval
3. **stream/route.ts:** After saving messages, optionally update rolling summary
4. **baseArchetype.ts:** Include rolling summary in system prompt or messages
5. **Feature flag:** `MEMORY_V2_ENABLED` env var, default `false`
6. **Tests:** Unit tests for summary generation, integration test for full flow
