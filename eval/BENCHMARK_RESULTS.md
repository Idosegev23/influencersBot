# Benchmark Results: GPT-5.2 vs Gemini 3 Flash

**Date:** 2026-02-22
**Account:** miranbuzaglo (Miran Buzaglo)
**Scenarios:** 25 (greeting, coupon, knowledge, support, mixed, edge)
**Turns per scenario:** 5 (125 API calls per model, 250 total)
**Errors:** 0 on both models

---

## Speed

| Metric | GPT-5.2 | Gemini 3 Flash | Winner |
|--------|---------|----------------|--------|
| Avg TTFT | **775ms** | 1,070ms | GPT-5.2 (38% faster) |
| P95 TTFT | 1,572ms | **1,335ms** | Gemini (15% tighter) |
| Avg Total | 4,483ms | **2,264ms** | Gemini (2x faster) |
| P95 Total | 7,544ms | **3,010ms** | Gemini (2.5x faster) |
| Avg Output | 585 chars | 442 chars | — |

**Takeaway:**
- GPT-5.2 starts responding faster (lower TTFT), but Gemini finishes much faster (half the total time) because it generates shorter responses.
- Gemini has tighter P95 TTFT (more consistent first-token latency).
- GPT-5.2 writes ~30% more text per response.

---

## Quality

| Metric | GPT-5.2 | Gemini 3 Flash | Winner |
|--------|---------|----------------|--------|
| Continuity | **0.168** | 0.141 | GPT-5.2 |
| Constraint Adherence | **0.900** | 0.860 | GPT-5.2 |
| Hallucinations | **0.000** | 0.040 | GPT-5.2 |
| Persona Style | **0.426** | 0.422 | Tie |

**Takeaway:**
- Both models have low continuity scores — this is expected because the scoring heuristic checks raw entity overlap across turns, and Hebrew morphology makes exact-match hard. The actual conversation transcripts show both models maintain context well.
- GPT-5.2 has slightly better constraint adherence (0.90 vs 0.86).
- GPT-5.2 had **zero** hallucinations. Gemini had 1 across all 125 turns (a single fabricated quoted term in one greeting scenario).
- Persona style is virtually identical (0.426 vs 0.422) — both models match the influencer's tone equally well.

---

## Composite Score

| | GPT-5.2 | Gemini 3 Flash |
|---|---------|----------------|
| Quality (70%) | 0.498 | 0.474 |
| Speed (30%) | 0.277 | 0.000 |
| **Composite** | **0.431** | **0.332** |

> Formula: `quality = avg(continuity, constraint, persona) * 0.7` + `speed = (1 - ttft/max_ttft) * 0.3`

**Winner: GPT-5.2** (0.431 vs 0.332)

---

## Conversation Quality (Manual Inspection)

### Coupon scenario (coupon_6): "יש לך קופון לSpring?"

| Aspect | GPT-5.2 | Gemini |
|--------|---------|--------|
| Correct code (MIRAN) | Yes | Yes |
| Correct discount (15%) | Yes | Yes |
| Correct link | Yes | Yes |
| Cross-sells other coupons | Yes (Leaves 45%, ARGANIA 40%) | Yes (same) |
| Admits unknown expiry | Yes ("אין לי תאריך תוקף") | Partially ("בדרך כלל אין תפוגה קרוב") |
| Follow-up suggestions | Relevant | Relevant |

Both models correctly used all 3 real coupon codes without hallucinating fake ones.

### Knowledge scenario (knowledge_15): "שמעתי שK-Care טוב לעור"

Both models referenced real brand data and provided coupon codes correctly. GPT-5.2 gave more detailed skincare advice; Gemini was more concise but still accurate.

---

## Recommendation

**Keep GPT-5.2 as production model.** Reasons:

1. **Zero hallucinations** — critical for an influencer chatbot that shares coupon codes and brand info
2. **Better TTFT** — users see the first token 38% faster
3. **Richer responses** — 30% more content per turn, which matters for recipes/tips/skincare routines
4. **Higher constraint adherence** — better at following user restrictions ("בלי", "רק")

**Gemini's advantages** (worth monitoring):
- 2x faster total response time (2.3s vs 4.5s avg)
- More consistent P95 latency (tighter distribution)
- Near-identical persona style matching
- Could work well for nano-tier (simple/short responses)

**Potential future test:** Try Gemini for the `nano` model tier (simple greetings, short answers) where its speed advantage matters most and hallucination risk is lowest.

---

## Files Generated

| File | Description |
|------|-------------|
| `eval/results.jsonl` | 250 lines — per-turn metrics |
| `eval/summary.json` | Aggregated stats |
| `eval/transcripts/*.json` | 50 files — full conversation transcripts (25 per model) |
| `eval/run-benchmark.ts` | The benchmark harness (standalone, no src/ modifications) |

## How to Re-Run

```bash
npx tsx eval/run-benchmark.ts
# or with a different account:
ACCOUNT_ID=<uuid> npx tsx eval/run-benchmark.ts
```
