# Rollout Plan — Conversation Memory V2

---

## Activation Layers

There are **two independent activation mechanisms**:

| Mechanism | Controls | Scope |
|-----------|----------|-------|
| `MEMORY_V2_ENABLED=true` (env var) | All features globally: memory + grounding + RAG precision | All accounts |
| `accounts.features.memory_v2 = true` (DB per-account) | Memory features only: summary read/write + token budget | Single account |

**Per-account override does NOT require the env var.** Either one is sufficient to activate memory for a given account.

The grounding directive and RAG precision improvements only activate via the env var (low-risk, can be enabled globally).

---

## Step-by-Step Rollout

### Step 1: Deploy code (no behavior change)
```
git add . && git commit && deploy
```
- `MEMORY_V2_ENABLED` remains absent/false
- Per-account flags remain unset
- **Only change active:** History bug fix (`.select('role, content')`) — this restores 10-message history for ALL accounts immediately
- **Verify:** Check logs for `[Stream]` entries showing conversationHistory length > 0

### Step 2: Enable for ONE test account via DB
```sql
UPDATE accounts
SET features = features || '{"memory_v2": true}'::jsonb
WHERE id = '<TEST_ACCOUNT_ID>';
```
- Only this account gets memory features
- Monitor logs for:
  - `[Memory] Context prepared` — memory module loaded successfully
  - `[Memory] Summary updated` — summary generated after 6 messages
- Test a 10+ message conversation and verify summary appears in subsequent turns

### Step 3: Monitor signals (24-48 hours)
Watch for:
- `[Memory] Failed to load context` — DB query failures
- `[Memory] Summary update failed after retries` — Gemini/DB write failures
- `[Memory] Retry attempt` — transient failures being handled
- Response latency increase (expected: <100ms for summary load)
- User complaints about response quality

### Step 4: Enable grounding globally
```env
MEMORY_V2_ENABLED=true
```
This activates for ALL accounts:
- Grounding directive in system prompt
- RAG precision improvements (dynamic threshold, diversity, skip-rerank)
- Memory features for all (not just the test account)

### Step 5: Full rollout monitoring (1 week)
- Check summary update frequency (should trigger every ~6 messages)
- Verify token budget trimming (`[Memory] Context prepared { trimmed: N }`)
- Compare response quality before/after

---

## Rollback Steps

### Level 1: Disable globally (instant)
```env
MEMORY_V2_ENABLED=false  # or remove entirely
```
All memory, grounding, and precision features OFF for all accounts.

### Level 2: Disable per-account
```sql
UPDATE accounts
SET features = features - 'memory_v2'
WHERE id = '<ACCOUNT_ID>';
```

### Level 3: Clear all summaries (if corrupted)
```sql
UPDATE chat_sessions SET rolling_summary = NULL;
```

### Level 4: Full code revert
Revert the conversation-memory module changes. The history bug fix should NOT be reverted.

---

## Monitoring Signals

| Signal | Log Pattern | Expected | Alert If |
|--------|-------------|----------|----------|
| Memory load | `[Memory] Context prepared` | Every V2 request | Missing when V2 is active |
| Summary generation | `[Memory] Summary updated` | Every ~6 messages | Never appears after 12+ messages |
| Summary failure | `[Memory] Summary update failed after retries` | Rare | >5% of summary attempts |
| Retry | `[Memory] Retry attempt` | Rare | Consistent retries |
| Token trimming | `trimmed: N` in Context prepared | Rare (long sessions) | Always trimming (budget too low) |
| Latency | Stream response time | <2s total | >3s consistently |

---

## SQL: Enable/Disable Per Account

```sql
-- Enable for account
UPDATE accounts
SET features = COALESCE(features, '{}'::jsonb) || '{"memory_v2": true}'::jsonb
WHERE id = '<ACCOUNT_ID>';

-- Disable for account
UPDATE accounts
SET features = features - 'memory_v2'
WHERE id = '<ACCOUNT_ID>';

-- Check which accounts have memory_v2 enabled
SELECT id, features->'memory_v2' as memory_v2
FROM accounts
WHERE features->>'memory_v2' = 'true';
```
