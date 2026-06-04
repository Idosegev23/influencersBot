# Coupon Validity & RAG — Design Spec

**Date:** 2026-06-04
**Status:** Approved (design); pending implementation plan
**Trigger incident:** LA BEAUTÉ (`432dea15-707f-4cfe-b7e2-331c7a02b228`) — four `70% הנחה` coupons (`danielamit`, `hen`, `hadar`, `karin`) expired `14.5.26` but stayed `is_active=true`, were ingested into RAG as `entity_type='coupon'` chunks on `2026-06-03`, and the bot kept offering a 70% discount that no longer exists.

---

## 1. Problem

The codebase treats coupons as **durable knowledge** (baked into RAG) when they are actually **ephemeral state** (live rows with start/end dates and an active flag). Once coupon text is embedded into `document_chunks`, it surfaces forever via semantic retrieval, regardless of validity. There is exactly **one** validity check in the whole system, and it is incomplete and applied at the wrong layer.

### The two parallel paths that feed coupons to the LLM
- **Path B — live DB read (per message):** `sandwichBot.ts → retrieveKnowledge() → fetchRelevantCoupons()` (`src/lib/chatbot/knowledge-retrieval.ts`) reads the `coupons` table directly, then `compact-knowledge-context.ts` injects it into the system prompt. *Almost* safe.
- **Path A — RAG chunks (index-time):** `src/lib/rag/ingest.ts:401-428` writes each coupon as an `entity_type='coupon'` chunk, filtered only on `is_active` at ingest, never date-checked, never deleted on expiry. Surfaces through generic semantic retrieval in `retrieve.ts`, which has **no** validity gate. **This is the incident vector.**

### Leak vectors (verified in code)
| # | Vector | Filtered today? | Anchor |
|---|--------|-----------------|--------|
| V1 | `document_chunks` `entity_type='coupon'` | `is_active` at ingest only; **none** at retrieval | `ingest.ts:401-428` |
| V2 | `document_chunks` `entity_type='partnership'` carrying `Coupon code:` | partnership `is_active` only | `ingest.ts:568` (`buildPartnershipText`) |
| V3 | `document_chunks` `entity_type='post'` (IG captions naming codes) | **none** (posts have no dates) | `ingest.ts` post case / `buildPostText` |
| V4 | `document_chunks` `entity_type='website'`/`'knowledge_base'` (promo terms, manual seeds) | **none** | `ingest.ts:430-454`; `scripts/seed-labeaute-policy-chunks.ts` |
| V5 | `sync-commerce-data.ts` inserts persona-extracted coupons `is_active=true` **with no start/end dates** | **none** (date-NULL ⇒ never expires) | `sync-commerce-data.ts:100-133` |
| V6 | Direct-table reads filtering `is_active` only (RPC + ~12 query paths) | **no dates** | `031_rpc_get_coupons.sql:29-30` + paths below |
| V7 | `fetchRelevantCoupons` fallback query | **no dates** | `knowledge-retrieval.ts:962-968` |
| V8 | `dm-handler.ts` rich card | `end_date` only, **missing `start_date`** | `dm-handler.ts:549-555` |
| V9 | `compact-knowledge-context.ts` (the only "filter") | `end_date` only; **no `is_active`, no `start_date`**; blind to RAG | `compact-knowledge-context.ts:126-153` |

---

## 2. Design principle

> **A coupon is live state, not knowledge.** It must never be embedded in RAG. It is read live from the `coupons` table at request time, gated by ONE canonical predicate. When no coupon passes the predicate for a brand/account, the bot does not mention discounts at all.

### Canonical validity predicate (date is authoritative)
```
is_active = true
AND (start_date IS NULL OR start_date <= now())
AND (end_date   IS NULL OR end_date   >= now())
```
**Date is the source of truth.** An expired coupon is invisible even if someone forgot to flip `is_active`. A nightly job flips `is_active=false` for hygiene/dashboards, but correctness does not depend on it.

### Decisions locked with the user
1. **Approach:** A + C together now (full belt-and-suspenders), not phased.
2. **Expiry control:** date-canonical predicate **plus** a nightly auto-deactivate cron.
3. **No valid coupon ⇒ the bot says nothing about discounts** (silent, no "offer ended" message).

---

## 3. Architecture

Six coordinated changes. Each unit is independently testable.

### Unit 1 — Canonical filter helper (single source of the predicate)
**New:** `src/lib/coupons/active-filter.ts`
- `applyActiveCouponFilter(query, nowISO)` — applies the predicate to a Supabase query builder:
  ```ts
  query
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${nowISO}`)
    .or(`end_date.is.null,end_date.gte.${nowISO}`)
  ```
  (Multiple top-level `.or()` groups are AND-combined by PostgREST.)
- `isCouponValid(coupon, now)` — the same predicate in JS, for in-memory filtering (used by `compact-knowledge-context` and the redaction allowlist).
- Exported `couponValidityWhereSQL()` string fragment for raw SQL / RPC parity.

**Consumers updated to use it (V6/V7):**
- `supabase/migrations/0XX_rpc_get_coupons_validity.sql` — new migration redefining `get_coupons_with_partnerships` to add the date clauses to the `WHERE` (currently `031` line 29-30).
- `src/lib/chatbot/knowledge-retrieval.ts:962-968` — fallback query.
- `src/lib/chatbot/hybrid-retrieval.ts:99-135` — both coupon queries.
- `src/lib/chatbot/knowledge-sync.ts:61-71`.
- `src/lib/instagram-graph/dm-handler.ts:549-555` (V8 — add `start_date`).
- User-facing/admin read paths for consistency: `api/influencer/coupons/route.ts`, `api/influencer/partnerships/[id]/coupons/route.ts`, `api/influencer/analytics/coupons/route.ts`, `api/influencer/dashboard-stats/route.ts`, `api/influencer/attribution/route.ts`, `api/admin/coupons/route.ts`, `src/lib/supabase.ts:566-624`, `src/lib/chat-ui/generate-tab-config.ts:262-265`.
  - **Note:** the influencer/admin *management* dashboards must still be able to **see** expired coupons to edit/reactivate them. The filter applies to **chat/widget/DM read paths and any "available coupons" surface**, NOT to management CRUD lists. Management lists keep showing all and render an "expired" badge instead. This is called out per-path in the implementation plan.

### Unit 2 — Remove coupons from RAG (A)
- **Delete** the `case 'coupon'` block in `src/lib/rag/ingest.ts:401-428`. Coupons are never ingested as chunks again.
- **Strip** `Coupon code:` from partnership chunks: remove line `ingest.ts:568` in `buildPartnershipText` (V2). Partnership chunks describe the partnership; the code/validity comes only from the live read.
- **Backfill (one-time):** purge every `document_chunks` + parent `documents` where `entity_type='coupon'` across all accounts, and re-ingest partnerships so existing partnership chunks lose the baked code. Script: `scripts/purge-coupon-chunks.ts` (dry-run flag, per-account or `--all`).

### Unit 3 — Invalid-code KB scrub (C, safety net for V3/V4 and any future leak)
**Reuse the existing, tested input-scrub** rather than build a new output parser. `sandwichBot.ts` already has:
- `couponCodeWhitelist` (lines 225-233) — post-filters `knowledgeBase.coupons` to allowed codes.
- `bannedTerms` scrub (lines 239-277) — regex-replaces banned strings with `███` across **every** KB text field (posts, websites, highlights, insights), then drops rows that became >40% redaction noise.

**Plan:** extract the inline scrub (`scrubObj`/`tooMuchRedaction`, lines 244-276) into a shared util `src/lib/coupons/kb-scrub.ts` (`scrubTermsFromKB(kb, terms)`), then add a new step in `SandwichBot.process()` **before generation** (right after the `couponCodeWhitelist` block, ~line 233):
- Compute `invalidCodes = allAccountCouponCodes − validCodes`, where:
  - `validCodes` = codes in `knowledgeBase.coupons` (already date+active filtered after Units 1+4 — always this turn's truth).
  - `allAccountCouponCodes` = every `code` in `coupons` for the account regardless of validity (one cheap indexed query; `is_active` NOT filtered, so deactivated/expired codes are included). Helper `getAllCouponCodes(accountId)` in `active-filter.ts`.
- Scrub `invalidCodes` from the KB via `scrubTermsFromKB`. Valid codes are untouched; the live coupon section is unaffected (invalid codes aren't in it).
- **Input-side, before the LLM ever sees the text** — strictly stronger than output redaction, covers all KB entity types (V3/V4), and reuses code already proven on `bannedTerms`.
- **Conservative:** only scrubs strings that are *known coupon codes for this account but not currently valid*. No percentage-claim softening (too false-positive-prone). Logged: `console.log('🛡 Coupon scrub: removed N invalid codes')`.
- Covers both social and widget paths automatically (both call `SandwichBot.process()`). The DM path (`dm-handler.ts`) builds structured cards from the Unit-1-filtered query, so it needs no text scrub.

### Unit 4 — Prompt hardening (so the gate rarely has to fire)
- `src/lib/rag/compact-knowledge-context.ts:126-153`: use `isCouponValid` (adds `is_active` + `start_date`); **only render the coupon section when `activeCoupons.length > 0`** (when empty, omit it entirely → satisfies "say nothing about discounts").
- `baseArchetype.ts` `buildProactiveBlock` / `buildKnowledgeContext` (≈509-537, 1017-1040): instruct the model to mention **only** codes present in the provided coupon block and never to volunteer or invent a code.

### Unit 5 — Nightly auto-deactivate cron (hygiene)
**New:** `src/app/api/cron/expire-coupons/route.ts` (CRON_SECRET-guarded), registered in `vercel.json`.
```sql
UPDATE coupons SET is_active = false, updated_at = now()
WHERE is_active = true AND end_date IS NOT NULL AND end_date < now();
```
Correctness does not depend on it (date is canonical), but it keeps dashboards honest and shrinks the known/valid sets.

### Unit 6 — Gate the coupon factory (V5)
- `src/lib/processing/sync-commerce-data.ts:100-133`: synthetic coupons extracted from persona metadata are inserted as **`is_active=false` (draft)**, tagged `metadata.source='persona_sync'`, and carry any extracted expiry. They surface only after a human activates them. Stops the steady production of never-expiring active rows.

---

## 4. Data flow (after change)

```
User message
  → SandwichBot.process()
     → retrieveKnowledge() → fetchRelevantCoupons()   [live read, canonical predicate via RPC]  ← ONLY coupon source
     → couponCodeWhitelist post-filter (existing)
     → INVALID-CODE SCRUB (new): scrub (allAccountCodes − validCodes) from ALL KB text  [input-side, before LLM]
     → compact-knowledge-context                       [isCouponValid; omit section if empty]
     → baseArchetype prompt                            [“only codes in the block; never invent”]
     → LLM generates answer (KB already free of invalid codes)
  → widget-chat-handler strips <<INTENT>>/<<ACTION>>   [unchanged]
  → response to user
```
RAG no longer carries any coupon chunk. Partnership/post/website chunks may still *contain* a code string in free text, but the invalid-code scrub removes any code that is not currently valid **before generation**, so the LLM never sees it.

---

## 5. Error handling
- **Helper/RPC failure:** fail **closed** for chat surfaces — if the live coupon read errors, treat the active set as empty (bot mentions no discounts) rather than falling through to an unfiltered query.
- **Redis miss for known-codes:** fall back to a direct one-shot query of all codes for the account; if that also fails, redaction uses `validCodes` only (still safe — never shows an invalid code, may over-keep an unknown token).
- **Backfill script:** dry-run prints counts; real run wrapped per-account; idempotent (safe to re-run).
- **Cron:** logs affected row count; non-fatal on error.

---

## 6. Testing
- **Unit — `active-filter`:** active / expired-by-date / not-yet-started / null-dates / `is_active=false`.
- **Unit — `redact-invalid-coupons`:** removes a known-but-invalid code; keeps a valid code; no false-positive on ordinary Hebrew text; softens orphan `70% הנחה`; Hebrew/English mixed.
- **Integration:** all-expired account ⇒ `fetchRelevantCoupons` empty ⇒ `compact-knowledge-context` omits the coupon section; RPC honors date clauses; management list still shows expired with badge.
- **Regression (the incident):** seed an expired-but-`is_active=true` 70% coupon, ask the bot about discounts in both social and widget paths ⇒ no 70% mentioned, redaction log clean or shows the strip.

---

## 7. Migration / rollout
1. Ship the canonical helper + RPC migration + all read-path edits.
2. Run `expire-coupons` once (deactivates already-expired).
3. Run `purge-coupon-chunks.ts --all` and re-ingest partnerships (removes V1/V2 from existing data).
4. Deploy redaction gate + prompt hardening + cron registration.
5. Gate `sync-commerce-data`.

---

## 8. Out of scope
- Rearchitecting RAG retrieval scoring beyond coupon/partnership handling.
- A coupon-discovery-via-semantic-search feature (the always-injected live block replaces it; deemed sufficient).
- Localized "this offer ended" messaging (user chose silent).

---

## 9. Resolved open questions
1. **is_active vs dates →** date canonical + nightly job. 2. **Silent vs message →** silent. 3. **Semantic discovery →** not needed; live block suffices. 4. **Freshness →** per-turn live read; redaction allowlist reuses that turn's fetch (always fresh); known-codes cached ~short TTL. 5. **V3/V4 in scope →** yes, via redaction gate. 6. **sync-commerce-data →** gated to `is_active=false` drafts.
