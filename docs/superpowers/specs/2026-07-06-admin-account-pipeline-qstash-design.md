# Admin Account Pipeline — QStash Long-Running Scan (Design Spec)

**Date:** 2026-07-06
**Status:** Approved design → pending implementation plan
**Author:** Ido + Claude

## Problem

Adding a new account today means running the local CLI `scripts/setup-account.ts` (8 steps).
Two problems have surfaced:

1. **Local Gemini block.** From the office/home Bezeq egress IP (79.177.137.100), Google
   sinkholes `generativelanguage.googleapis.com` to its `216.239.32.0/19` block VIP and returns
   a GFE `403 robot` page for **every** request — no key, any path. Proven via Cloudflare DoH and
   Google's own DoH (both return the block VIP) and by forcing the real IP with correct SNI.
   Result: **all video transcription and Gemini-based product extraction fail locally.** OpenAI,
   ScrapeCreators, Supabase, and the Instagram CDN all work from the same network — only the
   Gemini API host is blocked. Production (Vercel egress) is **not** blocked.

2. **Duration.** A real website scrape (all pages via sitemap — hundreds/thousands) plus dozens of
   video transcriptions far exceeds Vercel's 600s serverless `maxDuration`. The existing synchronous
   `POST /api/admin/full-scan` (maxDuration=600) dies mid-run on large sites.

## Goal

An **admin-dashboard "add account + scan"** feature backed by a **QStash step-chained pipeline**
that runs the entire account setup **server-side on Vercel** (where Gemini works), decomposed into
bounded serverless steps so no single invocation approaches 600s. Full parity with the local CLI so
accounts come out complete (persona + RAG + posts + transcriptions + full product catalog + tabs +
widget). A **live progress board** shows per-step status and counts.

**Acceptance test:** Carolina Lemke (`carolinalemkeberlin.il` / `carolinalemke.co.il`,
account `a9d1501a-af17-4a74-8198-6d2257b890f9`, `isDemo=true`) is the first account run end-to-end
through the pipeline.

## Non-goals

- Not replacing the nightly `daily-scan` / `process-content` crons (they keep running for existing
  accounts). This pipeline is the **on-demand new-account** path.
- Not building a general workflow engine — a fixed 9-step DAG for account setup only.
- No new always-on infra (that was rejected Approach B). QStash + Vercel + Redis only.

## Chosen approach: A — QStash step-chaining

QStash (already fully configured: `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT/NEXT_SIGNING_KEY`)
makes signed HTTP callbacks to our step routes on Vercel. Each step does a bounded chunk, persists
progress, and publishes the next message (next batch of the same step, or the next step). QStash
provides at-least-once delivery, automatic retries with backoff, and delays.

Rejected: **B** (always-on worker — new infra, doesn't use existing QStash) and
**C** (cron-drain only — nightly windows, doesn't decompose the full crawl, no on-demand/live feel).

## Architecture

- **Trigger:** Admin UI → `POST /api/pipeline/start` (protected by `requireAdminAuth`) → creates a
  `scan_jobs` row + publishes the first QStash message → returns `jobId` immediately.
- **Steps:** `/api/pipeline/<step>` routes. Every step:
  1. Verifies the QStash signature (`Receiver` / `QSTASH_CURRENT/NEXT_SIGNING_KEY`); unsigned → 401.
  2. Acquires a Redis mutex per `(job, step, batch)` (`SET NX PX`); if held, returns 200 (dedupe).
  3. Does one bounded chunk of work.
  4. Persists progress to `scan_jobs.pipeline_state` + `scan_step_logs`; cursors/frontier to Redis.
  5. Publishes the next QStash message (same step next batch, or next step; with delay if needed).
- **Status read:** `GET /api/pipeline/status/:jobId` merges `scan_step_logs` + `pipeline_state`.
- **Egress:** all step routes run on Vercel → reach Gemini (fixes the local block).

## Pipeline steps (DAG)

Reuse existing logic; wrap into bounded steps.

| # | step | work | bound | reuse |
|---|------|------|-------|-------|
| 1 | `create-account` | ensure account row (+`isDemo`, default dashboard password) | instant | `/api/admin/accounts`, `hashPassword` |
| 2 | `ig-scan` | profile + posts + highlights + comments | one-shot ~300s | `runScanJob` |
| 3 | `transcribe` | K videos/invocation, re-enqueue until done | batch | `gemini-transcriber` |
| 4 | `site-discover` | fetch **all** URLs from sitemap (index → children → gzip); BFS fallback if none | one-shot | sitemap logic from `deep-scrape-website.mjs` |
| 5 | `site-crawl` | K pages/invocation from frontier; extract content + images + products; re-enqueue until frontier empty | batch | cheerio logic from `deep-scrape-website.mjs` |
| 6 | `rag-ingest` | ingest posts + transcriptions + website into RAG (+ enrich) | batch/doc | `rag/ingest`, `rag/enrich` |
| 7 | `product-extract` | extract + enrich products + persist images (Gemini) | batch | `extract-products-from-rag`, `enrich-products`, `persist-product-images` |
| 8 | `persona-build` | build persona (GPT-5.4) | one-shot | `setup-account.ts` step 6 |
| 9 | `finalize` | tab-config + verify + config-wipe guard + mark demo | one-shot | `generateTabConfig`, guard from `cf961bf` |

Notes:
- Step 4 answers the "why 200 pages" question: the `MAX_PAGES=200` cap in the local script is an
  arbitrary safety ceiling. Sitemap gives the complete URL list up-front = the QStash frontier, with
  no cap (optional very-high safety ceiling only to avoid runaway on giant sites).
- Step 9 **must** include the config-wipe guard (the recurring regression documented for
  Studio Pasha / Biopeptix): read-modify-write **merge** of `config`, never overwrite.

## Data model

**Durable:**
- `scan_jobs` row = the pipeline run. Add `pipeline_state` JSONB: `{ currentStep, counts: {step:{done,total}}, cursors }`.
- `scan_step_logs` (exists: `step_name`, `status` pending/running/completed/failed, timestamps, error) → powers the board's step cards.

**Ephemeral (Redis, TTL'd):**
- `pipeline:{jobId}:frontier` — URLs still to crawl
- `pipeline:{jobId}:cursor:{step}` — batch offset (transcribe/rag/products)
- `pipeline:{jobId}:seen` — visited-URL set (dedupe)
- `pipeline:{jobId}:lock:{step}:{batch}` — mutex

## Admin UI

- **Add + scan form** (extend `/admin/add`, currently create-only): IG username (required), website
  URL (optional — auto-filled from IG bio during `ig-scan`), demo toggle (default ON), advanced
  (collapsible): posts limit, transcribe on/off, max-pages safety ceiling (blank = all). Submit →
  `/api/pipeline/start` → redirect to the board.
- **Live progress board** `/admin/scan/[jobId]`: header (name, overall status, elapsed); 9 step cards
  with status icon + count line ("תמלול 12/37", "סריקת אתר 45/210", "מוצרים 30/109", "פרסונה ✓");
  failed step shows error + **"נסה שוב שלב זה"** (re-publishes that step's message); poll status
  every ~2.5s (existing `/api/admin/scrape-progress` pattern); success banner + links (chat, widget
  install, account page) on completion. `/admin/accounts` gets an in-flight/failed badge linking to
  the board.

## Error handling, idempotency, resume, security

- **Signature verification** on every `/api/pipeline/*` step (401 if unsigned). `/api/pipeline/start`
  under `requireAdminAuth`.
- **Idempotency:** per-`(job,step,batch)` Redis mutex; data-layer upserts keyed by natural IDs
  (post id / url / product_url) so re-running a batch overwrites, never duplicates; skip a step whose
  `scan_step_logs` status is already `completed`.
- **Retries:** QStash auto-retries 5xx with backoff (`retries` on publish). Terminal failure → mark
  step `failed`, stop chain, surface in UI; manual retry re-publishes from that step.
- **Resume:** durable `pipeline_state` + `scan_step_logs` + Redis cursors let a run resume from the
  last incomplete step/batch without redoing completed work.
- **config-wipe guard:** every config write is a merge; `finalize` runs the `cf961bf` verify-guard and
  repairs missing identity keys before marking success.

## Batch sizing (initial, tunable constants)

- `transcribe`: ~5 videos/invocation (~60–90s/batch)
- `site-crawl`: ~10–20 pages/invocation
- `rag-ingest` / `product-extract`: ~20 items/invocation

Conservative defaults keep every invocation < ~2 min, far under the 600s ceiling.

## Testing

- **Unit:** sitemap parser (index + nested + gzip), frontier batching + dedupe, mutex idempotency,
  step advance/skip logic, config-merge guard.
- **Integration:** mock `qstash.publishJSON`; invoke each step route with a fake signed request + fake
  job; assert progress transitions + next message published; mock Gemini/OpenAI/ScrapeCreators.
- **E2E acceptance:** Carolina Lemke, full pipeline on prod (persona + RAG chunks + posts +
  transcriptions + full product catalog + tabs + widget, `isDemo=true`).
- Pre-existing broken `rate-limit.test.ts` is unrelated.

## Prerequisite (already done in this session)

Gemini model IDs updated repo-wide to current: `gemini-3-flash-preview` → `gemini-3.5-flash`,
`gemini-3-pro-preview` → `gemini-3.1-pro-preview`, `gemini-2.0-flash` → `gemini-3.5-flash`
(RAG rerank/expand kept on `gemini-2.5-flash`/`-lite`). Needed so the pipeline uses live models.
