# Blueprint — ממשק הסוכן ב-WhatsApp מהיסוד ("מושלם")

> **Status:** APPROVED design (Ido) · 2026-07-08 · Owner: Ido
> Authoritative spec for rebuilding the **influencer-agency agent WhatsApp interface** only
> (voice/text/file → understand → price → quote → sign). NOT the follower chatbot, scraping, or the rest of the platform.
> **Relevant files:** `src/app/api/webhooks/whatsapp/route.ts` (`maybeHandleAgentQuote`), `src/lib/crm/wa-conversation.ts`, `src/lib/crm/wa-interpret.ts`, `src/lib/whatsapp-cloud/client.ts`, `src/lib/ai-parser/gemini.ts`, `src/lib/openai.ts`, `src/lib/crm/quotes.ts`, `src/lib/crm/pdf.ts`.

---

## ⚠️ SCOPE ADJUSTMENTS (from Ido — these OVERRIDE the blueprint where they conflict)

1. **NO interactive buttons, NO list-picker.** Everything is **free-form voice/text**. The model understands **who and what from conversation context** (roster, open briefs, recent deals, the rolling conversation). Do NOT introduce WhatsApp `interactive` reply buttons or list messages as the confirmation/selection mechanism.
2. **Confirmation = read-back + free-form reply.** Before an irreversible money action (issue quote), the assistant **reads back what it understood** ("הבנתי: אנה · קוקה-קולה · 80,000 ₪ + מע״מ = 94,400 ₪ — לשלוח?") and the agent confirms in **natural voice/text**, interpreted by the model in context. Safety comes from echo-before-act + numeric sanity gates + audit — NOT from deterministic buttons.
3. **Voice-first.** The agent mostly sends voice notes. The model must interpret them, resolve entities from context, and act (or ask a natural clarifying question). Replies may be text; **voice OUTPUT stays deferred.**
4. Entity resolution (talent/brand/deal) = **model + context + fuzzy Hebrew match + natural clarify** ("לאיזה מותג — X או Y?"), never a picker.

Everywhere the blueprint below says "buttons" / "list picker" for confirmation or selection, replace with the read-back + free-form + context-understanding model above. The blueprint's other pillars (two lanes, async off-webhook, per-agent serialization, model matrix, RAG brain, Decision-Log, evals) stand.

---

## 0. North Star
A **Hebrew voice-first chief-of-staff** for the agent: unbreakable on the money path (never a wrong amount, never an accidental send, every action auditable); genuinely smart on the read path (answers "what did they want in Anna's brief?", "how much did I close this month?", "who's my most profitable talent?", "draft a reply to the brand" — with real data); feels instant (typing/👀, no silent waits); cheap & predictable (right model per action).

**Prime principle:** separate the **money lane** (blocked, deterministic) from the **advisory lane** (agentic, read-only). Autonomy is an asset on the read path and a risk on the money path.

> Meta 2026 note: bots must perform a concrete business task — open-ended AI chat is disallowed. Both lanes are task-focused → compliant.

## 1. Target architecture — two lanes + orchestrator
```
WhatsApp ─▶ Webhook (route.ts)
  1. verify signature + persist raw event
  2. 👀 reaction + typing indicator + markAsRead   (immediate, fire-and-forget)
  3. dedup by wa_message_id
  4. enqueue(job) ──▶ return 200 (<300ms)   ★ KEY CHANGE (async off webhook)
        ▼
   Queue / Worker  (per-agent FIFO)              ★ per-agent serialization + lock
        ▼
   Orchestrator = Intent Router (fast model, structured output)
     ├─▶ TRANSACTIONAL LANE (blocked, deterministic)
     │     brief-intake · pricing-extract · issue-quote · get-link
     │     confirmation = READ-BACK + free-form reply (NO buttons)
     │     entity selection = model+context+fuzzy (NO list picker)
     └─▶ ADVISORY LANE (agentic, read-only)
           tool-calling agent over read-only DB tools
           analytics · "what did they ask" · price suggestions · draft emails
           ❌ cannot create/send any commitment
   Shared: Memory · Decision-Log · Evals · Observability
```
**Why:** 2026 router research — cramming too many tools into one model collapses accuracy (50 tools ≈94%, 200 ≈64%). An intent layer before dispatch + separate lanes keeps accuracy high and boundaries clear.

**Implementation note (Vercel):** "return 200 then keep working" is NOT reliable on Vercel — the function freezes after the response. Use **QStash** (already used in this repo's admin scan pipeline): webhook enqueues → a worker route processes → sends the reply. Per-agent FIFO via QStash ordering key or `pg_advisory_xact_lock(hash(agent_id))` in the worker.

### What changes vs today
| Today | Target |
|---|---|
| all processing synchronous inside webhook | immediate ack → queue → worker |
| single brain (`gpt-5-nano`) that classifies *and* acts | fast router + per-lane specialists |
| one state per agent, no lock | per-agent FIFO + lock + TTL |
| free-text yes/no via `interpretYesNo` | **read-back + free-form reply interpreted in context** |
| talent match via `q.includes(name)` | **model + context + fuzzy Hebrew match + natural clarify** |
| transcription via the quote parser | dedicated Hebrew STT + confidence score |
| no advisory/analytics lane | read-only agentic lane |
| no decision log / evals | Decision-Log + eval harness at deploy gate |

## 2. Redesigning "the brain" — 3-stage chain
Today: one-shot classify (`planFreeform` → one of 6 actions). Target: a 3-stage chain, right model + structured output per stage.

- **Stage A — Router (fast, cheap, confidence-gated):** input = transcript/text + minimal context (conversation state, roster names). Output `{ lane, intent, confidence }`. If `confidence < threshold` → escalate to a stronger model, or **clarify in natural language**. Later distillable to a dedicated classifier (ModernBERT-class) for ~0 latency/cost.
- **Stage B (money lane) — Structured Extraction (strong, controlled):** strong reasoning model, `response_format` = strict JSON schema. Extract per brief `{ talent_id, line_items:[{deliverable, qty, unit_price}], confidence, ambiguities[] }`. **Numeric sanity gate** (§5): suspicious amount (<1,000 ₪, or anomalous vs history) → `needs_confirmation`. **Read-back + free-form confirm** before `record` and before `issue`.
- **Stage C (advisory lane) — ReAct agent, read-only:** real tool-calling loop over read-only DB tools (`get_briefs`, `get_deals`, `get_talent_stats`, `search_history`, `compute_revenue`, `draft_message`). Free to reason/chain here (no transactional side-effects). Conversation memory: rolling summary in state (or `previous_response_id`) so "רגע, תשנה לאנה ל-90" is understood as a follow-up.

Interface changes that delete whole bug classes — **adapted to the no-buttons rule:**
- Confirmation via **read-back + free-form** → removes `interpretYesNo` brittleness by having the model interpret the reply in context (not a keyword set), and by echoing before acting.
- Entity resolution via **model+context+fuzzy** → removes `q.includes(name)`.
- **Typing indicator** (official, in addition to 👀), auto-clears after 25s.

## 3. Voice pipeline — redesign
Today `parseAudioWithGemini({documentType:'quote'})` — a COMPLEX model, 32K tokens, discards the extraction and keeps only `transcription`. Expensive, distracting, and not the best Hebrew STT.

Target — dedicated pipeline:
1. **Dedicated Hebrew STT with confidence** (within the OpenAI+Gemini stack): primary **Gemini 3 Pro** (native audio); fallback **OpenAI `gpt-4o-transcribe`** or **Gemini 3.5 Flash** (~$0.057/hr). Optional max-accuracy vendor if ever needed: ElevenLabs Scribe (WER ≈3.1% Hebrew) — not required.
2. **Confidence-gated read-back.** Low STT confidence, or a critical number → `שמעתי: "…" | סכום: 80,000 ₪ — נכון?` + free-form confirm. High confidence → skip (don't nag).
3. **One number normalizer** (§5) serving voice and text identically.
4. **Store the audio** (or media_id + transcript) for debugging + eval.

## 4. Model selection matrix (July 2026)
> Policy: **OpenAI + Gemini only (latest), each provider is the other's fallback.** Prices /1M tokens. Families: OpenAI GPT-5.5 ($5/$30) · GPT-5.4 ($2.50/$15) · GPT-5.4 Mini ($0.75/$4.50) · Nano ($0.20/$1.25) · preview GPT-5.6 (Sol/Terra/Luna). Google Gemini 3 Pro / 3.5 Pro · Gemini 3 Flash ($0.50/$3) · 3.5 Flash (~$0.057/hr audio).
> **IMPLEMENTATION NOTE:** every model ID must be verified against the live SDK before wiring — do not hardcode an ID that 404s. Build the model layer config-driven so upgrades are one line.

| # | Action | Primary | Fallback (other provider) | Why |
|---|---|---|---|---|
| 1 | ack / "typing…" | — (WhatsApp typing + 👀) | — | zero latency |
| 2 | Hebrew transcription | Gemini 3 Pro (native audio) | gpt-4o-transcribe / Gemini 3.5 Flash | strong multilingual audio |
| 3 | Intent Router | Gemini 3 Flash | GPT-5.4 Nano | fast+cheap classify, structured out |
| 4 | pricing extraction (money) | GPT-5.5 (structured outputs) | Gemini 3 Pro | highest stakes: per-line across briefs; reasoning + strict JSON |
| 5 | Q&A + analytics (tool-calling + RAG) | Gemini 3 Pro (huge context) | GPT-5.5 | tool loop + big retrieval context |
| 6 | brief parse (PDF/image) | Gemini 3 Pro (vision) | GPT-5.5 vision | multimodal |
| 7 | draft emails / counter-offer | GPT-5.5 | Gemini 3 Pro | Hebrew writing quality |
| 8 | embeddings (RAG) | Gemini `gemini-embedding` | OpenAI `text-embedding-3-large` | semantic retrieval |
| 9 | eval judge | the *other* provider (GPT judges Gemini pipeline & vice-versa) | — | avoid self-preference |

**Immediate:** `src/lib/openai.ts` sets `CHAT_MODEL='gpt-5-nano'` (legacy). Money lane (#4) → GPT-5.5 + structured outputs; Q&A (#5) → Gemini 3 Pro; keep Nano/Flash for the router (#3). Both SDKs already wired — no new vendor.

## 4.5 The agent brain — voice Q&A, hybrid RAG, proactivity ★ the heart
The agent asks by voice "how many contracts did Anna have?" / "how many reels in Maor's quote?" / "pull all Anna's contracts in 6 months" / "Anna's sales in the summer project?" and gets an accurate voice/text answer. One engineering truth decides "amazing" vs "embarrassing":

**A. Two question families — never conflate:**
1. **Exact/quantitative** (count, sum, list, filter): "how many contracts", "list of last 6 months", "sales in project X", "how many reels". → **structured DB queries** (ground truth). Pure RAG = wrong numbers in front of a client.
2. **Meaning/content** (open, semantic): "what did the brand want?", "which brief mentioned exclusivity?", "find a deal that mentioned summer campaign". → **RAG** (vector search) over unstructured text.

The brain picks the tool **automatically**, sometimes **combines**: "Anna's sales in summer project" = identify "summer" semantically (RAG) **+** sum in SQL. **RAG for meaning, SQL for numbers.** (Reuse the `sandwich-bot-hybrid.ts` hybrid-retrieval pattern for the agent.)

**B. Brain architecture — hybrid tool-belt agent:** tool-calling loop (Gemini 3 Pro / GPT-5.5), **read-only** tools scoped to `agent_id`:
- **Exact SQL tools:** `count_contracts` · `list_contracts` · `sum_sales` · `get_quote_details` · `talent_stats` · `pipeline_status` · `revenue_by_period` — typed, return facts; the LLM only phrases/summarizes.
- **RAG tool:** `search_context(query, filters)` over vectors.
- **Compute tools:** aggregations/ratios.

**C. RAG layer — pgvector on Supabase (no new infra):** embed brief `raw_text`, voice transcripts, `specialTerms`, deliverable descriptions, quote/contract bodies, agent notes. Per-chunk metadata `agent_id, talent_id, brand, deal_id, date, source_type` → filtered retrieval (RLS + metadata) so info NEVER leaks between agents. Auto-ingest on every brief-document / deal-record / transcript (in the worker).

**D. Examples — voice → under the hood:**
| Agent says (voice) | tool(s) | answer |
|---|---|---|
| "how many contracts did Anna have?" | `count_contracts(Anna)` | "Anna has 14 contracts." |
| "list all Anna's contracts in 6 months" | `list_contracts(Anna, 6mo)` | formatted list + sums |
| "how many reels in Maor's quote?" | `get_quote_details(Maor)` | "3 reels + one story." |
| "Anna's sales in the summer project?" | `search_context("summer")`→brand + `sum_sales` | "82,000 ₪ in 2 deals." |
| "what did the brand want with Dani?" | `search_context(talent=Dani)` | semantic summary from the brief |

**E. Proactivity — the system reaches out first:** scheduled digest (morning/weekly) to WhatsApp: briefs awaiting pricing · quotes viewed-not-signed · sales summary (builds on the existing `/api/cron/crm-reminders`). Event nudges: signature opened & unsigned N days → "send a reminder?"; brief unpriced N days; new brief similar to a past deal → "similar to the 80K you closed with X". Opportunity/anomaly: talent with no deal 30d; quote far below the talent's average; returning brand. **Answer-and-act:** the agent replies to a nudge by voice ("yes, send a reminder") → it happens.

**F. Safety boundary:** everything read-only + scoped to `agent_id`. Proactivity **proposes** — never sends money/quote without a **read-back + free-form confirmation** (NOT a button). The brain is "crazy and smart" without touching transactional risk.

## 5. Reliability & correctness (money lane)
- **5.1 Async off webhook:** persist event → return 200 <300ms → process in worker/queue (QStash). 👀+typing give feedback; reply sent when ready.
- **5.2 Per-agent serialization + lock:** FIFO per `agent_id`, or `pg_advisory_xact_lock(hash(agent_id))`, or `version` column + optimistic retry. Today a burst of voice notes races the state machine.
- **5.3 State TTL:** in `getState`, if `updated_at` older than 30 min → idle (else tomorrow's brief is read as a "yes/no").
- **5.4 Money guardrails:** one `normalizeAmount` serving both the heuristic (`extractNumbers`/`handlePrices`) and the LLM output — kills the "80 = ₪80 vs ₪80,000" bug. Sanity thresholds: <1,000 ₪ or >X% deviation from talent/brand history → `needs_confirmation`. **Diff read-back before `issue`:** "Anna · Coca-Cola — 3 deliverables — 80,000 ₪ +VAT = 94,400 ₪. Send?" (free-form confirm). **Immutable audit:** every amount/status change logged (§6) with timestamp + source (voice/text). **Idempotency:** keep `wa_message_id` unique; add an idempotency key on `issue_quote` so a double reply never issues twice.
- **5.5 Explicit error handling:** replace silent `catch {}`. Planner failure must NOT fall to `startBrief`+log-a-junk-brief+send ✅. Distinguish technical failure (ask "send again", no row, no ✅) from a real brief; ✅ only on `outcome==='done'`.

## 6. Observability
- **6.1 Decision-Log** `crm_agent_wa_log`, one row per inbound message: `message_id, agent_id, ts, channel(voice/text/attachment), stt_provider, stt_confidence, transcript, router_intent, router_confidence, plan_json, model_used, input_tokens, output_tokens, latency_ms, outcome(done/need_more/error), deal_id, amount, agent_corrected(gold signal)`. This is what makes "why was this mispriced?" answerable.
- **6.2 KPIs:** pricing-correction-rate ↓ · time-to-quote · router accuracy vs golden set · STT-confidence distribution + %read-backs · model-fallback-rate · cost/conversation · voice-resend-rate.
- **6.3 Advisory lane = agent dashboard:** the same read-only queries feed both chat answers and a dashboard ("this month: 12 quotes · 340K ₪ · 41% conversion · top talent: Anna").

## 7. Eval harness — deploy gate
Eval is production code, tied to the deploy gate, criterion-by-criterion, structured output.
- **Golden set** (50–150 Hebrew scenarios): single brief, multi-brief in one voice note, shorthand numbers ("80"/"מאתיים אלף"), ambiguous talent, link request, analytics question, gibberish, noisy voice.
- **Deterministic checks** on amounts: exact-match `unit_price`/total (zero money tolerance).
- **LLM-as-judge** (different provider, §4#9) for advisory quality — rubric per criterion.
- **Confidence calibration** — when the model is sure, how often is it right.
- **CI gate:** no prompt/model change ships without passing the golden set. Source: Decision-Log (§6) + `agent_corrected=true` rows auto-become test cases.

## 8. Data-model additions
| table/column | purpose |
|---|---|
| `crm_agent_wa_log` (new) | Decision-Log (§6.1) |
| `crm_agent_wa_state.version` | optimistic concurrency (§5.2) |
| `crm_agent_wa_state.updated_at` (exists) | TTL (§5.3) |
| `crm_agent_wa_memory` / rolling summary | advisory conversation memory (§2C) |
| `crm_inbound_messages.stt_confidence`, `stt_provider` | voice audit |
| `signature_requests.idempotency_key` | prevent double-issue (§5.4) |
| `crm_agent_embeddings` (pgvector, new) | semantic RAG — `chunk_text`, `embedding vector`, meta `agent_id/talent_id/brand/deal_id/source_type/date` for filtered retrieval (§4.5C) |

## 9. Phased rollout
- **P0 — money correctness (days):** unified `normalizeAmount` + sanity gates · fix ✅-on-failure · idempotency on issue · basic Decision-Log.
- **P1 — reliability + better input:** async off webhook (QStash) · per-agent lock/FIFO · state TTL · **read-back confirmation flow (free-form, no buttons)** · typing indicator · fuzzy Hebrew entity resolution (replaces `q.includes`).
- **P2 — voice + models:** Gemini 3 Pro native-audio transcription + confidence read-back · money lane → GPT-5.5 + structured outputs · separate router (Gemini 3 Flash / GPT-5.4 Nano) · config-driven dual-provider model layer.
- **P3 — broad brain (Q&A + RAG + proactivity) + measurement:** pgvector + ingestion · exact SQL tools + `search_context` · hybrid agent (Gemini 3 Pro/GPT-5.5) · conversation memory · proactivity (digest + nudges, answer-and-act) · eval harness in CI · agent analytics dashboard.

## 10. Build plan (per phase — TDD, exact files)
After each step: `npm run type-check` + `wa-interpret` evals.

**P0:** (1) `wa-interpret.ts`: single `normalizeAmount()` (domain "thousands" rule) used by both `interpretPricing` and the LLM output in `wa-conversation.ts`; sanity thresholds (<1000 → confirmation); unit tests 80 / 80k / "80 אלף" / 80,000 / "מאתיים אלף". (2) `route.ts` (`maybeHandleAgentQuote`): `handleAgentMessage` returns `{reply, outcome}`; ✅ only when `outcome==='done'`. (3) `quotes.ts`/`issueQuoteForDeal`: idempotency key on issue. (4) create + write `crm_agent_wa_log` per message.

**P1:** (5) `route.ts`: persist event → return 200 → process in worker (QStash). (6) per-`agent_id` serialization (advisory lock or FIFO) around `handleAgentMessage`. (7) `getState`: 30-min TTL → idle. (8) `client.ts`: `sendTyping()`; **read-back confirmation is free-form** (model interprets reply in context — no button/list APIs); fuzzy Hebrew entity resolver replaces `q.includes`.

**P2:** (9) new `lib/stt/transcribeHebrew()`: Gemini 3 Pro native audio, fallback gpt-4o-transcribe/Gemini 3.5 Flash, with `confidence`; replace `parseAudioWithGemini({documentType:'quote'})` on the voice path. (10) confidence-gated read-back before recording. (11) new `lib/llm/`: config-driven dual-provider layer (OpenAI+Gemini) with structured outputs + mutual fallback; money → GPT-5.5; router → Gemini 3 Flash / GPT-5.4 Nano.

**P3:** (12) RAG infra: `crm_agent_embeddings` (pgvector) + `lib/rag/ingest-agent.ts` — embed briefs/transcripts/quotes/`specialTerms` with meta on every record. (13) `lib/crm/agent-tools.ts`: read-only exact SQL tools + `search_context()`. (14) `lib/crm/agent-brain.ts`: hybrid tool-calling agent (Gemini 3 Pro/GPT-5.5) choosing SQL vs RAG + combining; conversation memory (rolling summary). (15) proactivity: `cron/agent-digest` + event nudges (stuck signature · unpriced brief · similar-to-past) → WhatsApp with free-form "do it" reply. (16) `eval/agent-wa/`: golden set (incl. Q&A + exact-number checks) + runner + CI gate. (17) agent analytics dashboard (same read-only tools).

**P3+ (optional):** single multimodal call (audio→action); distil the router to a dedicated classifier (ModernBERT) for ~0 latency/cost.

## Sources
See the blueprint message; pricing/model/STT/router/eval references retained.
