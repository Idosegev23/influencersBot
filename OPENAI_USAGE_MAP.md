# OpenAI Usage Map — influencerbot

> Generated: 2026-02-21 | Audit scope: all `src/` and `scripts/` files

---

## 1. Suspected Files — Confirmation

| # | Suspected file | Exists? | Notes |
|---|---------------|---------|-------|
| 1 | `src/lib/ai/gpt5-client.ts` (Whisper-1) | **NO** | Does not exist. Audio transcription lives in `scripts/ultimate-video-scan.js` using `gpt-4o-transcribe`. |
| 2 | `smart-budget-builder.ts` (GPT-5.2) | **NO** | No file with this name anywhere in the repo. |
| 3 | `src/app/api/ocr/analyze-receipt/route.ts` (GPT-4o Vision) | **NO** | Entire `/api/ocr/` directory does not exist. |
| 4 | `src/app/api/ocr/loan-statement/route.ts` (Vision) | **NO** | Same — no OCR routes. |
| 5 | `src/app/api/ocr/id-card/route.ts` (Vision) | **NO** | Same — no OCR routes. |

**Conclusion:** All 5 suspected files are absent from this codebase. They may belong to a different project.

---

## 2. Production Source Inventory (`src/`)

| # | File (lines) | Function / Route | Model(s) | Input | Output | Product purpose | Runtime path | Status | Env vars | Verdict |
|---|-------------|-----------------|----------|-------|--------|----------------|-------------|--------|----------|---------|
| P1 | `src/lib/chatbot/archetypes/baseArchetype.ts` :304-387 | `generateResponse()` | `gpt-5.2-2025-12-11` (primary), `gpt-4o` (fallback), `gpt-5-nano` (nano tier) | system prompt + chat history + knowledge context | Streamed/non-streamed chat reply | **Main chatbot response** — the model followers talk to | Dashboard chat → `stream/route.ts` → sandwichBot → baseArchetype | **Active — critical** | `OPENAI_API_KEY` | **KEEP** |
| P2 | `src/engines/understanding/index.ts` :60-120 | `understandMessage()` | `gpt-5-nano` (primary, 150ms timeout), `gpt-5` (fallback) | User message text | JSON: `{intent, entities, sentiment, risk, modelTier}` | Intent/entity extraction for decision engine | Every incoming chat message (regex fallback on timeout) | **Active** — 100% timeout in prod → always regex fallback | `OPENAI_API_KEY` | **REPLACE** — currently dead weight; regex does all work |
| P3 | `src/lib/rag/embeddings.ts` :7-86 | `embedTexts()`, `embedQuery()` | `text-embedding-3-small` (1536 dim) | Array of text strings | `number[][]` embedding vectors | Vector embeddings for RAG ingestion + query | RAG ingestion + every chat query via vector search | **Active — critical** | `OPENAI_API_KEY` | **KEEP** (migration requires re-embedding all vectors) |
| P4 | `src/lib/rag/retrieve.ts` :30-50 | `retrieve()` (embedding part) | `text-embedding-3-small` (via embeddings.ts) | Query string | Embedding vector → matched chunks | Query embedding for vector similarity search | Every chat message going through RAG path | **Active — critical** | `OPENAI_API_KEY` | **KEEP** (same as P3) |
| P5 | `src/lib/rag/answer.ts` :13-119 | `answerQuestion()` | `gpt-5-nano-2025-08-07` | Query + retrieved chunks | Text answer with sources | RAG answer generation | **CLI-only** — not in production chat path | **Legacy / Dev tool** | `OPENAI_API_KEY` | **KEEP as dev tool** or REMOVE |
| P6 | `src/lib/gemini-chat.ts` :120-140 | `buildPersonaWithGPT()` | `gpt-5.2-pro` | Full scraping data dump | Structured persona JSON | Persona building (one-time per account) | Scraping pipeline → content-processor-orchestrator | **Active** (misnamed file — uses OpenAI, not Gemini) | `OPENAI_API_KEY` | **KEEP** — reasoning model needed for complex persona |
| P7 | `src/lib/ai/gemini-persona-builder.ts` :200-340 | `buildPersonaWithGemini()` | `gpt-5.2-pro` (10-min timeout, 3 retries) | Full scraping data dump | Structured persona JSON | Persona building (alternative path) | Scraping pipeline | **Active** (misnamed — uses OpenAI GPT-5.2 Pro) | `OPENAI_API_KEY` | **KEEP** — same reasoning need |
| P8 | `src/lib/chatbot/sandwich-bot-hybrid.ts` :14-294 | `SandwichBotHybrid.chat()` | `gpt-5-nano-2025-08-07` | System prompt + messages + tools | Chat reply via 4-stage function calling | Hybrid retrieval chatbot | **NOT active** — `sandwichBot.ts` (not hybrid) is the active path | **Legacy** | `OPENAI_API_KEY` | **REMOVE** — dead code path |
| P9 | `src/lib/chatbot/conversation-learner.ts` :200-235 | `extractInsights()` | `gpt-5-nano-2025-08-07` | Conversation logs | JSON: FAQ patterns, pain points, objections | Conversation mining for insights | Periodic batch job | **Active (low priority)** | `OPENAI_API_KEY` | **REPLACE** with Gemini Flash |
| P10 | `src/lib/flows/support.ts` :70-95 | `detectSupportIntent()` | `gpt-4o-mini` | User message | JSON: `{intent, confidence, category}` | Support flow intent routing | Chat messages routed to support flow | **Active** | `OPENAI_API_KEY` | **REPLACE** with Gemini Flash or nano |
| P11 | `src/lib/openai.ts` :20-77 | `detectInfluencerType()` | `gpt-5-nano` | Bio + posts sample | JSON: influencer category | Classify influencer type during scan | Scraping pipeline | **Active** | `OPENAI_API_KEY` | **REPLACE** with Gemini Flash |
| P12 | `src/lib/openai.ts` :77-137 | `generatePersona()` | `gpt-5` | Bio + posts + type | JSON: structured persona | Legacy persona generation | Scraping pipeline (superseded by P6/P7) | **Legacy** | `OPENAI_API_KEY` | **REMOVE** — superseded by gemini-persona-builder |
| P13 | `src/lib/openai.ts` :138-150 | `generatePersonaFromPosts()` | (delegates to `generatePersona`) | Posts array | JSON: persona | Wrapper for persona gen | Scraping pipeline | **Legacy** | `OPENAI_API_KEY` | **REMOVE** — same as P12 |
| P14 | `src/lib/openai.ts` :151-219 | `extractDataFromPost()` | `gpt-5-nano` | Caption text | JSON: products, brands, prices | Extract structured data from post captions | Scraping ingestion | **Active** | `OPENAI_API_KEY` | **REPLACE** with Gemini Flash |
| P15 | `src/lib/openai.ts` :220-280 | `extractRecipeFromPost()` | `gpt-5-nano` | Caption text | JSON: recipe structure | Extract recipes from food influencer posts | Scraping ingestion | **Active (niche)** | `OPENAI_API_KEY` | **REPLACE** with Gemini Flash |
| P16 | `src/lib/openai.ts` :281-431 | `extractContentFromPost()` | `gpt-5-nano` | Caption text | JSON: general content extraction | General-purpose post content extraction | Scraping ingestion | **Active** | `OPENAI_API_KEY` | **REPLACE** with Gemini Flash |
| P17 | `src/lib/openai.ts` :432-459 | `analyzeAllPosts()` | (delegates to extractDataFromPost) | Array of posts | Array of extracted data | Batch post analysis | Scraping pipeline | **Active** | `OPENAI_API_KEY` | **REPLACE** (follows P14) |
| P18 | `src/lib/openai.ts` :460-501 | `chat()` | `gpt-5-nano` | Messages array | Text response | General chat utility | Various internal callers | **Partially active** | `OPENAI_API_KEY` | **AUDIT** — check callers |
| P19 | `src/lib/openai.ts` :502-545 | `streamChat()` | `gpt-5-nano` | Messages + params | Streamed text | General streaming chat utility | Various internal callers | **Partially active** | `OPENAI_API_KEY` | **AUDIT** — check callers |
| P20 | `src/lib/openai.ts` :546-576 | `chatWithWebSearch()` | `gpt-5-nano` | Messages + web search tool | Text response with citations | Web-augmented chat | Unknown usage | **Uncertain** | `OPENAI_API_KEY` | **AUDIT** — may be dead |
| P21 | `src/lib/openai.ts` :577-678 | `generateGreetingAndQuestions()` | `gpt-5` | Persona + account info | JSON: greeting text + suggested questions | Generate initial chatbot greeting | Account setup / onboarding | **Active** | `OPENAI_API_KEY` | **REPLACE** with Gemini Flash |

---

## 3. Script Inventory (`scripts/`)

| # | File | Model(s) | Input | Product purpose | Status | Verdict |
|---|------|----------|-------|----------------|--------|---------|
| S1 | `scripts/ultimate-video-scan.js` | `gpt-4o-transcribe` (audio), `gpt-4o` (vision/OCR on frames), `gpt-5.2-pro` (analysis) | Video files → audio + frames | Transcribe reels, OCR on-screen text, deep analysis | **Dev/admin script** | **KEEP** as manual tool |
| S2 | `scripts/ultimate-deep-scan.js` | `gpt-5.2-pro` | Scraping data | Deep persona analysis | **Dev/admin script** | **KEEP** |
| S3 | `scripts/deep-persona-analysis.js` | `gpt-5.2-pro` | Scraping data | Deep persona analysis (alternative) | **Dev/admin script** | **KEEP** |
| S4 | `scripts/ultimate-persona-builder.js` | `gpt-4o-transcribe` (audio), `gpt-5.2-pro` (persona) | Audio + data | Build persona with transcription | **Dev/admin script** | **KEEP** |
| S5 | `scripts/test-chatbot.mjs` | N/A (tests the API, doesn't call OpenAI directly) | — | Chatbot E2E test | **Dev script** | **KEEP** |
| S6 | `scripts/build-persona-dekel.ts` | (imports from `gemini-persona-builder`) | — | One-off persona builder for specific account | **Dev script** | **KEEP** |

---

## 4. Model Summary

| Model | Usage count | API | Cost tier | Where used |
|-------|------------|-----|-----------|-----------|
| `gpt-5.2-2025-12-11` | 1 | Chat Completions | $$$$ | P1 (main chat) |
| `gpt-5.2-pro` | 3 | Responses API | $$$$$ | P6, P7 (persona building), S1-S4 (scripts) |
| `gpt-5` | 2 | Responses API | $$$ | P2 fallback, P12/P21 (openai.ts complex tasks) |
| `gpt-5-nano` / `gpt-5-nano-2025-08-07` | 9 | Chat Completions + Responses | $ | P2, P5, P8, P9, P11, P14-P20 |
| `gpt-4o` | 1+scripts | Chat Completions | $$ | P1 fallback, S1 (vision) |
| `gpt-4o-mini` | 1 | Chat Completions | $ | P10 (support intent) |
| `gpt-4o-transcribe` | scripts | Audio API | $$ | S1, S4 (audio transcription) |
| `text-embedding-3-small` | 2 | Embeddings | $ | P3, P4 (vector search) |

---

## 5. Environment Variables

| Variable | Required by | Notes |
|----------|-----------|-------|
| `OPENAI_API_KEY` | ALL OpenAI calls | Single key for everything — no per-model keys |
| `GOOGLE_AI_API_KEY` | `retrieve.ts` expandQuery, `gemini-chat.ts` Gemini import (unused for persona) | Gemini Flash for query expansion |

---

## 6. Risk Analysis — Per Usage

| # | What breaks if removed | What replaces it | Data/security implications |
|---|----------------------|-----------------|---------------------------|
| P1 | **Chatbot stops responding** — all follower conversations fail | Gemini 3 Flash or Claude Haiku | Must test Hebrew quality + streaming compatibility |
| P2 | **Nothing in practice** — already 100% regex fallback due to timeouts | Remove call, keep regex. Or replace with Gemini Flash (faster TTFT) | Reduces unnecessary API calls and timeout overhead |
| P3 | **Vector search breaks completely** — all RAG retrieval fails | Gemini embedding or Voyage. Requires full re-embedding of all vectors in Supabase | **High risk migration** — all 600+ chunks per account must be re-embedded. Dimension mismatch = broken search. |
| P4 | Same as P3 (uses P3's embeddings) | Same as P3 | Same as P3 |
| P5 | CLI RAG tool stops working | Gemini Flash | Low impact — dev-only tool |
| P6 | Persona building fails for new accounts | Gemini 3 Pro or Claude Opus | Complex reasoning task — must validate output quality |
| P7 | Same as P6 (alternative persona path) | Same as P6 | Same as P6 |
| P8 | **Nothing** — code path is not active | Delete the file | No impact |
| P9 | Conversation insights stop being generated | Gemini Flash | Low priority — insights are background analytics |
| P10 | Support flow loses AI intent detection, falls to regex/default routing | Gemini Flash or regex-only | Minor UX degradation for support queries |
| P11 | Influencer type detection fails during scan | Gemini Flash | Low risk — one-time per account |
| P12-P13 | **Nothing** — superseded by P6/P7 | Already replaced | Dead code — safe to delete |
| P14-P17 | Post data extraction during scraping fails | Gemini Flash | Batch job, not real-time. Easy to A/B test. |
| P18-P20 | Depends on callers (need audit) | Gemini Flash | Must trace all callers before removing |
| P21 | Initial chatbot greeting generation fails | Gemini Flash | One-time per account, easy migration |
| S1-S4 | Manual admin scripts stop working | Keep as-is or add Gemini alternative | Scripts are run manually, low urgency |

---

## 7. Key Findings

1. **Misnamed files**: `gemini-chat.ts` and `gemini-persona-builder.ts` both use **OpenAI GPT-5.2 Pro**, not Gemini. The filenames are legacy.

2. **Understanding engine is dead weight**: `engines/understanding/index.ts` calls GPT-5-nano with 150ms timeout. Measurement shows **100% timeout rate** — every request falls back to regex. This is wasted API cost and adds ~150ms latency per message.

3. **Embeddings are the hardest to migrate**: `text-embedding-3-small` is baked into all stored vectors. Changing embedding models requires re-indexing every account's documents.

4. **expandQuery uses Gemini, not OpenAI**: Confirmed at `retrieve.ts:80` — `const gemini = getGemini()`. The expansion/fallback query logic is already on Gemini.

5. **sandwich-bot-hybrid.ts is dead code**: The active chat path is `sandwichBot.ts` → `baseArchetype.ts`. The hybrid file is never called in production.

6. **Single API key**: All calls use `OPENAI_API_KEY` — no per-model or per-feature key separation.
