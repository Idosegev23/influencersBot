# Migration Plan — OpenAI → Multi-Model Optimization

> Based on OPENAI_USAGE_MAP.md audit (2026-02-21)

---

## Phase 0: Quick Wins (0 risk, immediate savings)

**Goal:** Remove dead code and stop wasting API calls.

| Task | File(s) | Impact | Effort |
|------|---------|--------|--------|
| 0.1 Delete `sandwich-bot-hybrid.ts` | `src/lib/chatbot/sandwich-bot-hybrid.ts` | Remove 294 lines of dead code (P8) | 5 min |
| 0.2 Delete legacy `generatePersona()` and `generatePersonaFromPosts()` | `src/lib/openai.ts` :77-150 | Remove superseded code (P12, P13) — persona building is done by `gemini-persona-builder.ts` | 15 min — verify no callers first |
| 0.3 Kill understanding engine OpenAI call | `src/engines/understanding/index.ts` | **100% timeout rate** → every call is wasted. Remove the OpenAI call, keep regex-only. Saves ~$X/month + 150ms latency per message. (P2) | 30 min |
| 0.4 Rename misnamed files | `gemini-chat.ts` → `gpt-persona-chat.ts`, `gemini-persona-builder.ts` → `gpt-persona-builder.ts` | Fix confusion — these files use OpenAI, not Gemini | 15 min + update all imports |
| 0.5 Audit `chat()`, `streamChat()`, `chatWithWebSearch()` callers | `src/lib/openai.ts` :460-576 | Determine if P18-P20 are dead code or have active callers | 30 min |

**Estimated savings:** Eliminating understanding engine calls (P2) alone removes ~50% of OpenAI API calls (1 call per incoming message that always times out).

---

## Phase 1: Migrate Easy Endpoints to Gemini Flash

**Goal:** Move low-stakes, non-chat OpenAI calls to Gemini 3 Flash for cost reduction.

**Prerequisites:** `GOOGLE_AI_API_KEY` already configured (used by `expandQuery`).

| Task | Current (OpenAI) | Target (Gemini) | Risk | Effort |
|------|-----------------|-----------------|------|--------|
| 1.1 `detectInfluencerType()` | `gpt-5-nano` (P11) | Gemini 3 Flash | Low — one-time per account scan, easy to validate | 1 hr |
| 1.2 `extractDataFromPost()` | `gpt-5-nano` (P14) | Gemini 3 Flash | Low — batch ingestion, not real-time | 1 hr |
| 1.3 `extractRecipeFromPost()` | `gpt-5-nano` (P15) | Gemini 3 Flash | Low — niche feature, food influencers only | 30 min |
| 1.4 `extractContentFromPost()` | `gpt-5-nano` (P16) | Gemini 3 Flash | Low — batch ingestion | 1 hr |
| 1.5 `generateGreetingAndQuestions()` | `gpt-5` (P21) | Gemini 3 Flash | Low — one-time per account, human reviews output | 1 hr |
| 1.6 `conversation-learner.ts` | `gpt-5-nano` (P9) | Gemini 3 Flash | Low — background analytics, no user-facing impact | 1 hr |
| 1.7 `support.ts` intent detection | `gpt-4o-mini` (P10) | Gemini 3 Flash | Medium — affects support routing. A/B test first. | 2 hr |

**Implementation pattern for each:**
1. Create `src/lib/ai/gemini-wrapper.ts` shared utility (or extend existing Gemini usage in `retrieve.ts`)
2. Add feature flag: `USE_GEMINI_FOR_<FUNCTION>=true`
3. Implement Gemini version alongside OpenAI version
4. Test with 10 real inputs, compare output quality
5. Flip flag, monitor for 48h
6. Remove OpenAI version

**Estimated cost reduction:** ~60-70% on these calls (Gemini Flash is significantly cheaper than gpt-5-nano for structured extraction tasks).

---

## Phase 2: Evaluate Chat Model Migration

**Goal:** Test whether Gemini 3 Flash or Claude can replace GPT-5.2 for the main chatbot.

**This is the highest-risk migration — proceed carefully.**

| Task | Current | Candidate | Risk | Notes |
|------|---------|-----------|------|-------|
| 2.1 Main chat response | `gpt-5.2-2025-12-11` (P1) | Gemini 3 Flash / Claude Sonnet | **HIGH** — this is the core product | Hebrew fluency, personality consistency, streaming support all critical |
| 2.2 Persona building | `gpt-5.2-pro` (P6, P7) | Gemini 3 Pro / Claude Opus | **HIGH** — needs deep reasoning for persona extraction | Long-context input (full account data), complex structured output |

**Approach:**
1. **Shadow mode:** Route 5% of chat traffic to candidate model, log both responses
2. **Human eval:** Compare 100 response pairs (GPT-5.2 vs candidate) on:
   - Hebrew fluency and naturalness
   - Persona consistency (does it sound like the influencer?)
   - Knowledge accuracy (correct product recommendations?)
   - Tone/warmth match
3. **Latency comparison:** Measure p50/p95 TTFT and total latency (use existing pipeline metrics)
4. **Cost comparison:** Track tokens in/out for both models
5. **Decision gate:** Only proceed if candidate scores ≥90% on human eval AND latency is ≤ current

**Do NOT migrate P1 or P6/P7 without completing the evaluation above.**

---

## Phase 3: Embeddings Strategy (Long-term)

**Goal:** Evaluate whether to keep OpenAI embeddings or migrate.

**Current state:** `text-embedding-3-small` with 1536 dimensions. All vectors stored in Supabase `document_chunks` table.

| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| A. Keep OpenAI embeddings | Zero migration work, proven quality | Vendor lock-in, cost | None |
| B. Migrate to Gemini embedding | Unified vendor (if chat migrates) | Must re-embed ALL chunks (~600/account × N accounts). Downtime during migration. Different similarity scores. | Days |
| C. Dual embedding | Can A/B test retrieval quality | 2x embedding cost during transition, complex query logic | Days |

**Recommendation:** Keep OpenAI embeddings (Option A) unless Phase 2 fully migrates chat to Gemini. Embeddings are the lowest-cost OpenAI usage and highest-risk migration.

---

## Priority Order

```
Phase 0 (now)          → $0 cost, immediate cleanup
  ├─ 0.3 Kill understanding engine call  ← biggest single win
  ├─ 0.1 Delete sandwich-bot-hybrid.ts
  ├─ 0.2 Delete legacy persona functions
  ├─ 0.5 Audit chat/streamChat callers
  └─ 0.4 Rename misnamed files

Phase 1 (next sprint)  → ~60-70% cost reduction on extraction calls
  ├─ 1.1-1.4 Extraction functions     ← batch, low risk
  ├─ 1.5-1.6 Greeting + learner       ← low frequency
  └─ 1.7 Support intent               ← A/B test

Phase 2 (evaluate)     → potential full migration
  ├─ 2.1 Shadow-test chat model        ← weeks of data needed
  └─ 2.2 Evaluate persona building     ← complex reasoning test

Phase 3 (if needed)    → embeddings migration
  └─ Only after Phase 2 decision
```

---

## Cost Estimate (Current)

| Category | Model | Est. calls/day | Est. cost/month |
|----------|-------|----------------|----------------|
| Chat responses | gpt-5.2 | ~500 | High |
| Understanding (wasted) | gpt-5-nano | ~500 (all timeout) | Medium (wasted) |
| Embeddings | text-embedding-3-small | ~50 | Low |
| Extraction | gpt-5-nano | ~20 (during scans) | Low |
| Persona building | gpt-5.2-pro | ~2 (new accounts) | Low per-call, high per-unit |
| Support intent | gpt-4o-mini | ~30 | Low |

**Phase 0 eliminates the "Understanding (wasted)" row entirely — immediate ROI.**

---

## Files That Can Be Deleted After Phase 0+1

| File | Reason | Blocked by |
|------|--------|-----------|
| `src/lib/chatbot/sandwich-bot-hybrid.ts` | Dead code path | Nothing |
| `src/lib/openai.ts` :77-150 (functions only) | Superseded by persona builder | Verify no callers |
| `src/lib/openai.ts` :460-576 (if confirmed dead) | Unused utility functions | Phase 0.5 audit |
