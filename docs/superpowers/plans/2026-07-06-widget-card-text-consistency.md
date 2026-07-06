# Widget Card/Text Consistency + Ranking Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the widget's product CARDS always match the products the bot actually TALKS ABOUT, and get the right product series into the candidate pool so the bot can feature it.

**Architecture:** Approach C (single structured source of truth): the LLM ends its reply with a `<<PRODUCTS>>1,3<</PRODUCTS>>` envelope naming the POSITIONS (from the numbered recommendation block) of the products it featured; the handler resolves those positions against the candidate list and cards are built from exactly those products. Reuses the existing `<<INTENT>>`/`<<ACTION>>` envelope-strip machinery; falls back to the engine's top-3 when the envelope is absent (no regression). Card-eligibility (`isValidProductUrl`) moves upstream into the engine so every emittable position is card-eligible. Ranking: widen the candidate pool 3→8 and fix the dead trigger-scoring so the on-need series reliably reaches the pool.

**Tech Stack:** TypeScript (Next.js server), Vitest, vanilla `public/widget.js`. Chat model gpt-5.4 (streams envelopes reliably, same class as the already-shipping `<<INTENT>>`).

## Global Constraints

- **Root cause (verified):** prose and cards come from two decoupled selections with no reconciliation. Cards = engine top-3 `widget_products` (`getRecommendations`, `widget-chat-handler.ts:173-181` → `route.ts:246`), further narrowed by route-only `isValidProductUrl` (`route.ts:231-243`) + `SUPPRESS_CARDS_FOR` (`route.ts:224`). Prose = the same top-3 block (`baseArchetype.ts:796`) ∪ the full RAG KB (`baseArchetype.ts:840`), with the model told to name any KB product (`baseArchetype.ts:821-826`).
- **Envelope positions are 1-indexed** and refer to the numbered lines in `buildPromptBlock` (`engine.ts:456-469`, `${i+1}. **name** …`). The candidate array `recommendedProducts` is in the SAME order, so position `k` ↔ `recommendedProducts[k-1]`.
- **No regression:** if the `<<PRODUCTS>>` envelope is missing, malformed, or empty, cards fall back to `recommendedProducts.slice(0, 3)` (today's behavior).
- **Streaming preserved:** `<<PRODUCTS>>` is stripped both server-side (handler, after stripIntent/stripAction) and client-side (`widget.js` streaming display), exactly like the other envelopes.
- **Widget-only blast radius:** all prompt changes are inside `mode === 'widget'` branches; the social chatbot path is untouched.
- **Git:** commit each task straight to `main` and push; stage only that task's files. `public/widget.js` no longer has other uncommitted hunks (shipped), but still stage it explicitly. Co-author line: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Note (separate, in-scope):** the deterministic `scoreNeedBased` cannot perfectly distinguish a dedicated series from one that merely also lists a need (INTENSIVE vs Red Fiber both carry `target_audience: "שיער יבש"`; the embedding tie-breaks toward Red Fiber). The reliable fix is Approach C + a wider pool so the smart LLM selects; the scoring change here only improves candidate RECALL, it does not hand-rank series.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/chatbot/widget-objections.ts` | Add `stripProducts` envelope parser (mirror `stripIntent`) | Modify |
| `tests/unit/widget/strip-products.test.ts` | Unit tests for `stripProducts` | Create |
| `src/lib/recommendations/engine.ts` | Export `isValidProductUrl`; apply it in `getRecommendations`; fix dead trigger scoring | Modify |
| `tests/unit/widget/recommendation-scoring.test.ts` | Unit tests for URL filter + token-overlap trigger scoring | Create |
| `src/app/api/widget/chat/route.ts` | Cards from `result.products` (drop inline URL filter; keep stage suppression) | Modify (`:231-248`) |
| `src/lib/chatbot/widget-chat-handler.ts` | Pool 3→8; parse `<<PRODUCTS>>`; resolve positions→products; fallback | Modify (`:177`, `:371`, `:418`) |
| `src/lib/chatbot/archetypes/baseArchetype.ts` | Widget-mode prompt: `<<PRODUCTS>>` instruction + exclusivity | Modify (widget block ~`:770-792`) |
| `public/widget.js` | Strip `<<PRODUCTS>>` in streaming + final display | Modify |

---

## Task 1: `stripProducts` envelope parser

**Files:**
- Modify: `src/lib/chatbot/widget-objections.ts`
- Test: `tests/unit/widget/strip-products.test.ts`

**Interfaces:**
- Produces: `stripProducts(text: string): { cleanText: string; positions: number[] }` — extracts `<<PRODUCTS>>...<</PRODUCTS>>`, parses a comma/space-separated list of 1-indexed positions (ignores non-numbers, dedupes, preserves first-seen order), returns cleaned text with the envelope removed. Empty/absent → `positions: []`.

- [ ] **Step 1: Write the failing test** `tests/unit/widget/strip-products.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { stripProducts } from '@/lib/chatbot/widget-objections';

describe('stripProducts', () => {
  it('extracts positions and strips the envelope', () => {
    const { cleanText, positions } = stripProducts('בול בשבילך INTENSIVE ✨<<PRODUCTS>>1,3<</PRODUCTS>>');
    expect(positions).toEqual([1, 3]);
    expect(cleanText).toBe('בול בשבילך INTENSIVE ✨');
  });
  it('tolerates spaces and dedupes, ignores non-numbers', () => {
    const { positions } = stripProducts('x <<PRODUCTS>> 2 , 2, foo, 5 <</PRODUCTS>>');
    expect(positions).toEqual([2, 5]);
  });
  it('no envelope → empty positions, text unchanged', () => {
    const { cleanText, positions } = stripProducts('just a reply');
    expect(positions).toEqual([]);
    expect(cleanText).toBe('just a reply');
  });
  it('empty envelope → empty positions', () => {
    const { positions } = stripProducts('hi <<PRODUCTS>><</PRODUCTS>>');
    expect(positions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run RED** — `npx vitest run tests/unit/widget/strip-products.test.ts` → fails (`stripProducts` not exported).

- [ ] **Step 3: Implement** — append to `src/lib/chatbot/widget-objections.ts` (mirror the `stripIntent` pattern already in the file):

```typescript
/**
 * Strip the <<PRODUCTS>>1,3<</PRODUCTS>> envelope (Approach C). The numbers are
 * 1-indexed positions into the recommendation block the model was shown; the
 * handler resolves them to the actual products so cards == what the bot featured.
 */
const PRODUCTS_RE = /<<PRODUCTS>>([\s\S]*?)<<\/PRODUCTS>>/;

export function stripProducts(text: string): { cleanText: string; positions: number[] } {
  if (!text) return { cleanText: text || '', positions: [] };
  const match = text.match(PRODUCTS_RE);
  if (!match) return { cleanText: text, positions: [] };
  const seen = new Set<number>();
  const positions: number[] = [];
  for (const tok of match[1].split(/[,\s]+/)) {
    const n = parseInt(tok, 10);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) { seen.add(n); positions.push(n); }
  }
  const cleanText = text.replace(PRODUCTS_RE, '').replace(/\n\s*\n\s*$/, '').trim();
  return { cleanText, positions };
}
```

- [ ] **Step 4: Run GREEN** — `npx vitest run tests/unit/widget/strip-products.test.ts` → 4/4 pass.

- [ ] **Step 5: Commit**
```bash
git add src/lib/chatbot/widget-objections.ts tests/unit/widget/strip-products.test.ts
git commit -m "feat(widget): stripProducts envelope parser (Approach C source of truth)"
```

---

## Task 2: Card-eligible candidates + working trigger scoring (engine)

**Files:**
- Modify: `src/lib/recommendations/engine.ts`
- Test: `tests/unit/widget/recommendation-scoring.test.ts`

**Interfaces:**
- Produces: exported `isValidProductUrl(u: string | null | undefined): boolean` (moved verbatim from `route.ts:231-243`); `getRecommendations` filters its candidate list to card-eligible products before scoring/slicing. `scoreNeedBased` gains token-overlap trigger credit.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test** `tests/unit/widget/recommendation-scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isValidProductUrl } from '@/lib/recommendations/engine';

describe('isValidProductUrl (moved from route)', () => {
  it('accepts /product/ detail URLs', () => {
    expect(isValidProductUrl('https://x.co.il/product/intensive-shampoo')).toBe(true);
  });
  it('rejects category/listing/pagination URLs', () => {
    expect(isValidProductUrl('https://x.co.il/category/hair')).toBe(false);
    expect(isValidProductUrl('https://x.co.il/shop')).toBe(false);
    expect(isValidProductUrl('https://x.co.il/shop/hair/page/3')).toBe(false);
  });
  it('rejects empty/undefined', () => {
    expect(isValidProductUrl(undefined)).toBe(false);
    expect(isValidProductUrl('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run RED** — `npx vitest run tests/unit/widget/recommendation-scoring.test.ts` → fails (`isValidProductUrl` not exported from engine).

- [ ] **Step 3: Move the util + apply it + fix trigger scoring** in `src/lib/recommendations/engine.ts`:

(a) Add the exported util near the top of the file (verbatim logic from `route.ts:231-243`):
```typescript
// Card-eligibility: reject category/listing/pagination URLs so a recommended
// product is always a real detail page the visitor can click. Applied to the
// candidate list here so every product the model can feature is card-eligible.
export function isValidProductUrl(u: string | null | undefined): boolean {
  if (!u || typeof u !== 'string') return false;
  const lower = u.toLowerCase();
  if (/\/page\/\d+/.test(lower)) return false;
  if (/\/category\//.test(lower)) return false;
  if (/\/shop\/?[^/]*\/?$/.test(lower)) return false;
  if (/\/(product|products|p|item)\//.test(lower)) return true;
  const last = lower.replace(/\/+$/, '').split('/').pop() || '';
  return last.length >= 5 && /[a-z֐-׿]/i.test(last);
}
```

(b) In `getRecommendations` (around `engine.ts:88-93` where `allProducts` is loaded), filter to card-eligible after load:
```typescript
    // Only recommend products that are card-eligible (real detail page), so the
    // model can never feature a product whose card would be dropped downstream.
    allProducts = (allProducts || []).filter((p: any) => isValidProductUrl(p.product_url));
```
(Place this right after the products are fetched and before strategy scoring. Keep the existing empty-guard that returns `{products:[],…}` when nothing remains.)

(c) Fix the dead trigger scoring in `scoreNeedBased` (`engine.ts:208-215`). Full-sentence triggers never match a short query via `includes`; add token-overlap credit. Replace the block:
```typescript
    // 1. Keyword matching on conversationTriggers (highest weight)
    const triggers = product.ai_profile?.conversationTriggers || [];
    for (const trigger of triggers) {
      const t = trigger.toLowerCase();
      if (lower.includes(t)) {
        score += 25;                       // full phrase present (rare for short queries)
        matchedTriggers.push(trigger);
      } else {
        // Token overlap: short need-queries ("שיער יבש") never contain a whole
        // trigger sentence, so credit shared meaningful words instead.
        const words = t.split(/[^a-z֐-׿0-9]+/i).filter((w: string) => w.length >= 3);
        let hits = 0;
        for (const w of words) if (lower.includes(w)) hits++;
        if (hits > 0) {
          score += Math.min(18, hits * 6);
          if (hits >= 2) matchedTriggers.push(trigger);
        }
      }
    }
```

- [ ] **Step 4: Run GREEN** — `npx vitest run tests/unit/widget/recommendation-scoring.test.ts` → 3/3 pass. Then `npm run type-check` (clean for engine.ts; pre-existing unrelated errors OK).

- [ ] **Step 5: Commit**
```bash
git add src/lib/recommendations/engine.ts tests/unit/widget/recommendation-scoring.test.ts
git commit -m "feat(recs): card-eligible candidates + token-overlap trigger scoring"
```

---

## Task 3: Route builds cards from the featured set (drop route-side URL filter)

**Files:**
- Modify: `src/app/api/widget/chat/route.ts` (`:231-248`)

**Interfaces:**
- Consumes: `result.products` (now the model's featured, card-eligible set after Tasks 2+4); `isValidProductUrl` no longer needed in the route.
- Produces: `cards` = `result.products.map(toCardDTO)` with only `SUPPRESS_CARDS_FOR` stage suppression retained.

- [ ] **Step 1: Delete the inline `isValidProductUrl`** (`route.ts:231-243`) and simplify the cards block (`route.ts:244-248`) to:
```typescript
          // Cards come from result.products, which is exactly the set the bot
          // featured (Approach C) and is already card-eligible (URL filter now
          // runs upstream in the recommendation engine). Only stage suppression
          // remains — it merely empties, it never diverges from the prose.
          const cards = SUPPRESS_CARDS_FOR.has(stage)
            ? []
            : (result.products || []).map((p) => toCardDTO(p, loc));
```

- [ ] **Step 2: Verify** — `npm run type-check` (clean for route.ts). Confirm no remaining reference to the deleted `isValidProductUrl` in the file: `grep -n "isValidProductUrl" src/app/api/widget/chat/route.ts` → no matches.

- [ ] **Step 3: Commit**
```bash
git add src/app/api/widget/chat/route.ts
git commit -m "refactor(widget): cards from featured set; URL filter moved upstream"
```

---

## Task 4: Handler resolves the `<<PRODUCTS>>` envelope + widens the pool

**Files:**
- Modify: `src/lib/chatbot/widget-chat-handler.ts` (`:177`, after `:371`, `:418`)

**Interfaces:**
- Consumes: `stripProducts` (Task 1).
- Produces: `recommendedProducts` returned at `:418` is now the model's featured products (resolved from positions), or `recommendedProducts.slice(0, 3)` fallback.

- [ ] **Step 1: Widen the candidate pool** — change `maxResults: 3` to `maxResults: 8` (`widget-chat-handler.ts:177`). The model sees 8 candidates and features the right ones; cards are only what it features.

- [ ] **Step 2: Parse + resolve the envelope.** In the finalization block, right after the `stripAction` call (`widget-chat-handler.ts:371-372`), add:
```typescript
  // Approach C: the model ends its reply with <<PRODUCTS>>1,3<</PRODUCTS>> —
  // the positions (1-indexed) of the products it actually featured, from the
  // numbered recommendation block. Resolve them so the CARDS are exactly what
  // the bot talked about. Missing/empty/all-invalid → fall back to the engine
  // top-3 (no regression).
  const { cleanText: cleanText3, positions: featuredPositions } = stripProducts(fullText);
  fullText = cleanText3;
  if (featuredPositions.length > 0) {
    const picked = featuredPositions
      .map((pos) => recommendedProducts[pos - 1])
      .filter((p): p is ProductRecommendation => !!p);
    if (picked.length > 0) recommendedProducts = picked;
    else recommendedProducts = recommendedProducts.slice(0, 3);
  } else {
    recommendedProducts = recommendedProducts.slice(0, 3);
  }
```
Add `stripProducts` to the existing import from `'./widget-objections'` (which already imports `stripIntent`/`stripAction`/`buildObjectionBlock`).

- [ ] **Step 3: Verify** — `npm run type-check` (clean for the handler). Confirm the import line includes `stripProducts`: `grep -n "stripProducts" src/lib/chatbot/widget-chat-handler.ts` → import + usage.

- [ ] **Step 4: Commit**
```bash
git add src/lib/chatbot/widget-chat-handler.ts
git commit -m "feat(widget): resolve <<PRODUCTS>> envelope to featured cards; widen pool 3->8"
```

---

## Task 5: Prompt the model to emit `<<PRODUCTS>>` + feature only from the list

**Files:**
- Modify: `src/lib/chatbot/archetypes/baseArchetype.ts` (widget-mode block, ~`:770-792`, beside the existing `<<INTENT>>` spec)

**Interfaces:** none (prompt string only). The instruction must live in the `mode === 'widget'` branch so the social path is unaffected.

- [ ] **Step 1: Read the widget-mode block** — open `src/lib/chatbot/archetypes/baseArchetype.ts` around lines 770-830 to find where the `<<INTENT>>` envelope is specified and where `_recommendationBlock` is interpolated (`:796`). The new instruction goes in the same widget-only instructions string, after the recommendation block is referenced.

- [ ] **Step 2: Add the envelope instruction + exclusivity.** Insert this Hebrew instruction into the widget-mode instructions (adjacent to the `<<INTENT>>` spec so both envelopes are specified together):
```
בסוף כל תשובה שבה הצגת/המלצת על מוצרים, הוסף/י שורה נפרדת עם המיקומים (המספרים) של המוצרים שבאמת הצגת מתוך "🛍️ מוצרים מומלצים" — בדיוק בפורמט הזה: <<PRODUCTS>>1,3<</PRODUCTS>> (רק המספרים, מופרדים בפסיק). אם לא הצגת אף מוצר לרכישה — <<PRODUCTS>><</PRODUCTS>>. חשוב: מותר להציג/להמליץ לרכישה אך ורק מוצרים מתוך הרשימה הממוספרת הזו. אל תמליץ/תציג כמוצר לרכישה שום מוצר שמופיע רק בתוכן/בידע אבל לא ברשימה. את שאר המידע מהידע אפשר לתת כתשובה, אבל לא כהמלצת מוצר לרכישה.
```
Keep the existing `<<INTENT>>` instruction; the two envelopes coexist (handler strips INTENT, then ACTION, then PRODUCTS).

- [ ] **Step 3: Verify** — `npm run type-check` (clean). `grep -n "<<PRODUCTS>>" src/lib/chatbot/archetypes/baseArchetype.ts` → present, inside the widget-mode branch (confirm it is not added to a shared/social path).

- [ ] **Step 4: Commit**
```bash
git add src/lib/chatbot/archetypes/baseArchetype.ts
git commit -m "feat(widget): prompt model to emit <<PRODUCTS>> + feature only from recommended list"
```

---

## Task 6: Strip `<<PRODUCTS>>` client-side (streaming + final)

**Files:**
- Modify: `public/widget.js`

**Interfaces:** none. Mirror the existing `<<INTENT>>`/`<<ACTION>>`/`<<SUGGESTIONS>>` strip regexes so a partial `<<PRODUCTS>>` never flashes mid-stream.

- [ ] **Step 1: Find the existing envelope strips** — `grep -n "SUGGESTIONS>>\\|INTENT>>\\|ACTION>>" public/widget.js`. There are two places: the streaming `displayText` (partial, `<<X>>[\s\S]*`) and the final `clean` (paired, `<<X>>[\s\S]*?<<\/X>>`).

- [ ] **Step 2: Add `<<PRODUCTS>>` to both.** In the streaming `displayText` chain add `.replace(/<<PRODUCTS>>[\s\S]*/g, '')`; in the final `clean` chain add `.replace(/<<PRODUCTS>>[\s\S]*?<<\/PRODUCTS>>/g, '')` — matching the exact style of the adjacent INTENT/ACTION lines.

- [ ] **Step 3: Verify** — `node --check public/widget.js` → OK. `grep -c "PRODUCTS>>" public/widget.js` → 2.

- [ ] **Step 4: Commit**
```bash
git add public/widget.js
git commit -m "fix(widget): strip <<PRODUCTS>> envelope from streamed + final text"
```

---

## Self-Review

**Spec coverage:** Approach C → Tasks 1 (parser), 4 (resolve+widen), 5 (prompt), 6 (client strip). Upstream card-eligibility (fold-in of Approach A) → Tasks 2 (apply in engine) + 3 (drop from route). Ranking → Task 2 (token-overlap trigger scoring) + Task 4 (pool 3→8). Fallback/no-regression → Task 4 Step 2. Streaming preserved → Task 6.

**Placeholder scan:** No TBD/TODO. Task 5 Step 1 is a real "read to locate the exact insertion line" action (the file is large and the exact line shifts); the instruction text to insert is given verbatim in Step 2.

**Type consistency:** `stripProducts(text) → {cleanText, positions:number[]}` defined in Task 1, consumed in Task 4. `isValidProductUrl` exported in Task 2, its inline twin deleted in Task 3. `recommendedProducts: ProductRecommendation[]` (existing type) reused in Task 4. Positions are 1-indexed against `recommendedProducts` order (same array `buildPromptBlock` numbers).

**Out of scope:** perfect series-level ranking in `scoreNeedBased` (deterministic scorer can't reliably separate INTENSIVE from Red Fiber when both list "שיער יבש"); mitigated by wide pool + LLM selection. The mobile bottom-sheet redesign and Phase C are separate.

**Verification (post-deploy, manual):** on LA BEAUTÉ prod, ask "מה מומלץ לשיער יבש?" — the bot's prose and the cards must show the SAME products (expected: INTENSIVE), and `SELECT product_name FROM widget_recommendations WHERE account_id='432dea15-707f-4cfe-b7e2-331c7a02b228' ORDER BY created_at DESC LIMIT 5` reflects the featured set.
