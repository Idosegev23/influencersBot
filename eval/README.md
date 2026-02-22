# Eval — Shadow Model Benchmark

Side-by-side comparison of **OpenAI GPT-5.2** vs **Gemini 3 Flash** for the
influencer chatbot's final text generation step.

Runs 25 multi-turn Hebrew conversations (5 turns each = 125 turns per model)
using real account data from Supabase. Does NOT modify production code.

## Quick Start

```bash
# From project root (reads .env automatically)
npx tsx eval/run-benchmark.ts

# With explicit account
ACCOUNT_ID=<uuid> npx tsx eval/run-benchmark.ts
```

## What It Measures

| Metric | Description |
|--------|-------------|
| TTFT (ms) | Time to first token — streaming responsiveness |
| Total (ms) | Full response latency |
| Continuity | References to entities from prior conversation turns |
| Constraint adherence | Respects Hebrew constraints ("בלי", "רק", "עד") |
| Hallucination count | Brand/coupon mentions not in DB |
| Persona style | Cosine similarity to persona keyword embedding |
| **Composite** | Quality (70%) + Speed (30%) |

## Output Files

| File | Description |
|------|-------------|
| `eval/results.jsonl` | Per-turn metrics (one JSON line per API call) |
| `eval/transcripts/<scenario>_<provider>.json` | Full conversation transcript |
| `eval/summary.json` | Aggregated stats + recommendation |

## Scenario Categories (25 total)

- **greeting** (5): Opening + knowledge exploration
- **coupon** (5): Real brand/coupon lookups
- **knowledge** (5): Deep-dive on persona topics
- **support** (3): Complaint/escalation flows
- **mixed** (4): Multi-topic conversations
- **edge** (3): Empty input, language switching, off-topic

## Environment Variables

| Var | Required | Default |
|-----|----------|---------|
| `ACCOUNT_ID` | No | Miran's account |
| `OPENAI_API_KEY` | Yes | — |
| `GEMINI_API_KEY` | Yes | — |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | — |
| `SUPABASE_SECRET_KEY` | Yes | — |
