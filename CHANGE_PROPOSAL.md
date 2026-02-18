# CHANGE PROPOSAL — Conversation Memory + Precision Guardrails

> PHASE 1 | 2026-02-17

---

## Why Continuity Fails Today

1. **History query is broken** — `stream/route.ts:561` queries column `message` which doesn't exist; history is always `[]`
2. **No rolling summary** — even when history is fixed, only last 10 messages are kept; older context is lost forever
3. **No grounding instruction** — system prompt lacks "answer only from sources" directive
4. **RAG not integrated** — `answerQuestion()` only works via CLI, not production chat

---

## Proposed Changes

### Change 0: Fix History Bug (Immediate, no flag)
**File:** `src/app/api/chat/stream/route.ts` lines 561, 570
- `.select('role, message')` → `.select('role, content')`
- `m.message` → `m.content`
- **Risk:** None. This is a bug fix restoring intended behavior.

### Change 1: DB Migration — Add `rolling_summary` to `chat_sessions`
**Type:** Additive ALTER TABLE
```sql
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS rolling_summary TEXT;
```
- No existing data affected
- Nullable, default NULL
- **Rollback:** `ALTER TABLE chat_sessions DROP COLUMN rolling_summary;`

### Change 2: New Module — `src/lib/chatbot/conversation-memory.ts`
**Purpose:** Rolling summary generation + memory-augmented history building
**Functions:**
- `buildConversationContext(sessionId, currentMessages)` — returns `{ recentMessages, rollingSummary }`
- `updateRollingSummary(sessionId, newMessages, existingSummary)` — calls LLM to update summary
- `shouldUpdateSummary(messageCount)` — returns true every N messages (configurable, default 6)

**LLM for summary:** Gemini 3 Flash (cheap, fast) via existing `chatWithGemini()`
**Summary captures:** user goals, constraints, decisions, key facts, open questions
**Max summary size:** ~300 tokens

### Change 3: Integrate Memory into Chat Flow
**File:** `src/app/api/chat/stream/route.ts`

Before SandwichBot call (after line 571):
```typescript
if (process.env.MEMORY_V2_ENABLED === 'true') {
  const { buildConversationContext } = await import('@/lib/chatbot/conversation-memory');
  const memoryContext = await buildConversationContext(currentSessionId, conversationHistory);
  // Prepend rolling summary to conversation history
  if (memoryContext.rollingSummary) {
    conversationHistory.unshift({
      role: 'assistant' as const,
      content: `[סיכום שיחה קודמת: ${memoryContext.rollingSummary}]`,
    });
  }
}
```

After saving messages (after line 654):
```typescript
if (process.env.MEMORY_V2_ENABLED === 'true') {
  const { updateRollingSummary, shouldUpdateSummary } = await import('@/lib/chatbot/conversation-memory');
  const newCount = (session?.message_count || 0) + 2;
  if (shouldUpdateSummary(newCount)) {
    // Fire-and-forget, don't block response
    updateRollingSummary(currentSessionId, [...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: fullText }
    ]).catch(err => console.error('[Memory] Summary update failed:', err));
  }
}
```

### Change 4: Grounding Instruction
**File:** `src/lib/chatbot/archetypes/baseArchetype.ts`

Add to system prompt (gated by flag):
```
[אם MEMORY_V2_ENABLED]
חשוב: ענה רק על בסיס המידע שניתן לך (פוסטים, תמלולים, קופונים, שיתופי פעולה).
אם אין לך מספיק מידע — אמור זאת בכנות ושאל שאלה ממוקדת אחת.
אל תמציא מידע שלא הוזכר במקורות.
```

### Change 5: Precision Improvements in RAG Retrieve (Optional)
**File:** `src/lib/rag/retrieve.ts`

Gated by `MEMORY_V2_ENABLED`:
- **Dynamic similarity threshold:** If top result > 0.8, raise threshold to 0.5 for others
- **Diversity guardrail:** Max 2 chunks per `source_id`, max 3 per `entity_type`
- **Skip rerank when dominant:** If top similarity > 0.85, skip rerank and take top 3

---

## Files Changed (Summary)

| File | Change Type | Gated? |
|------|-------------|--------|
| `src/app/api/chat/stream/route.ts` | Bug fix + memory integration | Bug fix: no. Memory: yes |
| `src/lib/chatbot/conversation-memory.ts` | **NEW** | Entire module |
| `src/lib/chatbot/archetypes/baseArchetype.ts` | Grounding instruction | Yes |
| `src/lib/rag/retrieve.ts` | Precision tweaks | Yes |
| `chat_sessions` table | Add column | Additive |

---

## Feature Flag

```env
MEMORY_V2_ENABLED=false  # default off
```

- All new behavior gated behind this flag
- Bug fix (Change 0) is NOT gated — it's a correctness fix
- When flag is `false`, system behaves exactly as today (minus the bug)

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Rolling summary adds latency | Fire-and-forget after response, doesn't block streaming |
| Summary LLM call fails | Graceful fallback — no summary, history still works |
| Summary grows too large | Capped at ~300 tokens, re-summarized each update |
| Breaking existing behavior | Feature flag OFF by default; bug fix is the only ungated change |
| Column migration | `ADD COLUMN IF NOT EXISTS`, nullable, no data modification |

---

## Rollback Plan

1. Set `MEMORY_V2_ENABLED=false` → instant disable
2. If DB column needs removal: `ALTER TABLE chat_sessions DROP COLUMN rolling_summary;`
3. Remove new module `conversation-memory.ts` (no other code depends on it when flag is off)

---

## Test Plan

1. **Unit tests:** `tests/unit/conversation-memory.test.ts`
   - Summary generation with mock LLM
   - `shouldUpdateSummary()` threshold logic
   - `buildConversationContext()` with/without existing summary
2. **History bug fix verification:** Existing tests + manual check that history now loads
3. **Feature flag test:** Verify behavior identical when `MEMORY_V2_ENABLED=false`
4. **Integration:** CLI simulation of 20-turn conversation checking summary updates
