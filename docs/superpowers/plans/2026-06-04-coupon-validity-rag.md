# Coupon Validity & RAG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chatbot present coupons only when they are currently valid (active + within start/end dates), and stop ephemeral coupons from being baked into RAG.

**Architecture:** One canonical validity predicate (date-authoritative) in a shared helper, applied to every chat/widget/DM coupon read. Coupons are removed from RAG entirely; existing coupon chunks are purged. A reuse of the existing KB input-scrub removes any invalid coupon code from post/website text before the LLM sees it. A nightly cron deactivates expired coupons; the persona→coupon sync stops auto-creating active rows.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + PostgREST), Vitest, Vercel cron.

**Spec:** `docs/superpowers/specs/2026-06-04-coupon-validity-rag-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/coupons/active-filter.ts` | Canonical validity predicate (JS + query-builder + SQL string) + `getAllCouponCodes` | Create |
| `src/lib/coupons/kb-scrub.ts` | Reusable "scrub terms from KB text" util (extracted from sandwichBot) | Create |
| `supabase/migrations/<NEXT>_rpc_get_coupons_validity.sql` | Redefine `get_coupons_with_partnerships` with date clauses | Create |
| `src/lib/chatbot/knowledge-retrieval.ts` | Fallback coupon query → validity filter | Modify (~962-968) |
| `src/lib/chatbot/hybrid-retrieval.ts` | Two coupon queries → validity filter | Modify (~99-124) |
| `src/lib/chatbot/knowledge-sync.ts` | Coupon→KB sync query → validity filter | Modify (~61-71) |
| `src/lib/instagram-graph/dm-handler.ts` | DM card coupon query → validity filter (add start_date) | Modify (~549-555) |
| `src/lib/rag/compact-knowledge-context.ts` | `isCouponValid` + omit empty section + "only listed codes" instruction | Modify (~126-153) |
| `src/lib/rag/ingest.ts` | Delete coupon ingestion case; strip `Coupon code:` from partnership text | Modify (401-428, 568) |
| `scripts/purge-coupon-chunks.ts` | One-time purge of `entity_type='coupon'` chunks+docs | Create |
| `src/lib/chatbot/sandwichBot.ts` | Wire invalid-code scrub; refactor bannedTerms to shared util | Modify (~239-278) |
| `src/app/api/cron/expire-coupons/route.ts` | Nightly auto-deactivate of expired coupons | Create |
| `vercel.json` | Register the new cron | Modify |
| `src/lib/processing/sync-commerce-data.ts` | Insert persona-extracted coupons as `is_active=false` drafts | Modify (~100-133) |
| `src/app/influencer/[username]/coupons/page.tsx` | "פג תוקף" badge on expired coupons in management list | Modify (~21-51) |
| `tests/unit/coupon-active-filter.test.ts` | Unit tests for `isCouponValid` | Create |
| `tests/unit/coupon-kb-scrub.test.ts` | Unit tests for `scrubTermsFromKB` | Create |

---

## Task 0: Branch

- [ ] **Step 1: Create a feature branch** (repo is on `main`)

```bash
git checkout -b coupon-validity-rag
```

---

## Task 1: Canonical validity helper

**Files:**
- Create: `src/lib/coupons/active-filter.ts`
- Test: `tests/unit/coupon-active-filter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/coupon-active-filter.test.ts
import { describe, it, expect } from 'vitest';
import { isCouponValid } from '@/lib/coupons/active-filter';

const NOW = new Date('2026-06-04T12:00:00Z');

describe('isCouponValid', () => {
  it('valid when active and no dates', () => {
    expect(isCouponValid({ is_active: true }, NOW)).toBe(true);
  });
  it('valid when undefined is_active and no dates (upstream already filtered)', () => {
    expect(isCouponValid({}, NOW)).toBe(true);
  });
  it('invalid when is_active is false', () => {
    expect(isCouponValid({ is_active: false }, NOW)).toBe(false);
  });
  it('invalid when end_date is in the past (the LA BEAUTÉ case)', () => {
    expect(isCouponValid({ is_active: true, end_date: '2026-05-14T20:59:59Z' }, NOW)).toBe(false);
  });
  it('invalid when start_date is in the future', () => {
    expect(isCouponValid({ is_active: true, start_date: '2026-07-01T00:00:00Z' }, NOW)).toBe(false);
  });
  it('valid when now is inside the window', () => {
    expect(isCouponValid({ is_active: true, start_date: '2026-04-01T00:00:00Z', end_date: '2026-12-31T00:00:00Z' }, NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/coupon-active-filter.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/coupons/active-filter"`.

- [ ] **Step 3: Write the helper**

```ts
// src/lib/coupons/active-filter.ts
// Single source of truth for "is this coupon valid right now?".
// Date is authoritative: an expired coupon is invalid even if is_active was
// never flipped (the LA BEAUTÉ incident). is_active=false always wins.

export interface CouponValidity {
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}

/** In-memory predicate. Used for filtering already-fetched coupon objects. */
export function isCouponValid(coupon: CouponValidity, now: Date = new Date()): boolean {
  if (coupon.is_active === false) return false;
  if (coupon.start_date && new Date(coupon.start_date) > now) return false;
  if (coupon.end_date && new Date(coupon.end_date) < now) return false;
  return true;
}

/**
 * Applies the canonical predicate to a Supabase/PostgREST query builder.
 * Multiple top-level .or() groups are AND-combined by PostgREST, so this is:
 *   is_active = true
 *   AND (start_date IS NULL OR start_date <= now)
 *   AND (end_date   IS NULL OR end_date   >= now)
 * Returns the same (chainable) query so callers can keep adding .limit()/.order().
 */
export function applyActiveCouponFilter(query: any, now: Date = new Date()): any {
  const nowISO = now.toISOString();
  return query
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${nowISO}`)
    .or(`end_date.is.null,end_date.gte.${nowISO}`);
}

/** Same predicate as raw SQL, for RPC/migration parity. Assumes alias `c`. */
export const COUPON_VALIDITY_WHERE_SQL =
  `c.is_active = true ` +
  `AND (c.start_date IS NULL OR c.start_date <= now()) ` +
  `AND (c.end_date IS NULL OR c.end_date >= now())`;

/**
 * All coupon codes for an account, regardless of validity. Used to build the
 * invalid-code scrub set (allCodes − validCodes). is_active is intentionally
 * NOT filtered so deactivated/expired codes are included.
 */
export async function getAllCouponCodes(supabase: any, accountId: string): Promise<string[]> {
  const { data } = await supabase.from('coupons').select('code').eq('account_id', accountId);
  return (data || []).map((r: any) => r.code).filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/coupon-active-filter.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coupons/active-filter.ts tests/unit/coupon-active-filter.test.ts
git commit -m "feat(coupons): canonical validity predicate helper"
```

---

## Task 2: RPC migration — date clauses in get_coupons_with_partnerships

**Files:**
- Create: `supabase/migrations/<NEXT>_rpc_get_coupons_validity.sql`

This is the **primary** live read path (`knowledge-retrieval.ts` calls this RPC). Today it filters `is_active = true` only.

- [ ] **Step 1: Determine the next migration number**

Run: `ls supabase/migrations | sort | tail -1`
Use the next sequential prefix (e.g. if latest is `045_*.sql`, name the file `046_rpc_get_coupons_validity.sql`).

- [ ] **Step 2: Write the migration**

```sql
-- Migration <NEXT>: get_coupons_with_partnerships now enforces date validity.
-- Date is authoritative (expired coupons are invisible even if is_active=true).
CREATE OR REPLACE FUNCTION public.get_coupons_with_partnerships(p_account_id UUID)
RETURNS TABLE (
  id UUID,
  code TEXT,
  description TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  brand_name TEXT,
  category TEXT,
  link TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    c.id,
    c.code,
    c.description,
    c.discount_type,
    c.discount_value,
    COALESCE(c.brand_name, p.brand_name) as brand_name,
    p.category,
    p.link
  FROM coupons c
  LEFT JOIN partnerships p ON c.partnership_id = p.id
  WHERE c.account_id = p_account_id
    AND c.is_active = true
    AND (c.start_date IS NULL OR c.start_date <= now())
    AND (c.end_date IS NULL OR c.end_date >= now())
  ORDER BY c.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_coupons_with_partnerships(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coupons_with_partnerships(UUID) TO anon;

COMMENT ON FUNCTION public.get_coupons_with_partnerships IS 'Active + in-date coupons with brand info (date-authoritative)';
```

- [ ] **Step 3: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name `rpc_get_coupons_validity`, the SQL above), or `supabase db push` if using the CLI.

- [ ] **Step 4: Verify** (LA BEAUTÉ account, where the 4 coupons are now expired/deactivated)

Run this SQL (MCP `execute_sql`):
```sql
SELECT code FROM get_coupons_with_partnerships('432dea15-707f-4cfe-b7e2-331c7a02b228');
```
Expected: returns only currently-valid codes (no `danielamit`/`hen`/`hadar`/`karin`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_rpc_get_coupons_validity.sql
git commit -m "feat(coupons): RPC get_coupons_with_partnerships enforces date validity"
```

---

## Task 3: Harden the remaining chat/DM coupon reads

**Files:**
- Modify: `src/lib/chatbot/knowledge-retrieval.ts:962-968`
- Modify: `src/lib/chatbot/hybrid-retrieval.ts:99-103, 119-124`
- Modify: `src/lib/chatbot/knowledge-sync.ts:61-71`
- Modify: `src/lib/instagram-graph/dm-handler.ts:549-555`

These four bypass the RPC and filter on `is_active` only (dm-handler is missing `start_date`).

- [ ] **Step 1: knowledge-retrieval.ts fallback query**

At the top of the file add (with the other imports):
```ts
import { applyActiveCouponFilter } from '@/lib/coupons/active-filter';
```
Replace the fallback query (currently lines 962-968):
```ts
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('coupons')
        .select('id, code, brand_name, description, discount_type, discount_value, partnership_id, start_date, end_date')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(100);
```
with:
```ts
      const { data: fallbackData, error: fallbackError } = await applyActiveCouponFilter(
        supabase
          .from('coupons')
          .select('id, code, brand_name, description, discount_type, discount_value, partnership_id, start_date, end_date')
          .eq('account_id', accountId)
      )
        .order('created_at', { ascending: false })
        .limit(100);
```

- [ ] **Step 2: hybrid-retrieval.ts — both coupon queries**

Add import at top:
```ts
import { applyActiveCouponFilter } from '@/lib/coupons/active-filter';
```
Replace the first query (lines 99-103):
```ts
    const { data: coupons } = await supabase
      .from('coupons')
      .select('id, code, description, discount_type, discount_value, is_active, created_at')
      .eq('account_id', accountId)
      .eq('is_active', true);
```
with:
```ts
    const { data: coupons } = await applyActiveCouponFilter(
      supabase
        .from('coupons')
        .select('id, code, description, discount_type, discount_value, is_active, created_at')
        .eq('account_id', accountId)
    );
```
Replace the second query (lines 119-124):
```ts
    const { data: coupons } = await supabase
      .from('coupons')
      .select('id, code, description, discount_type, discount_value, is_active, created_at')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .limit(10);
```
with:
```ts
    const { data: coupons } = await applyActiveCouponFilter(
      supabase
        .from('coupons')
        .select('id, code, description, discount_type, discount_value, is_active, created_at')
        .eq('account_id', accountId)
    ).limit(10);
```

- [ ] **Step 3: knowledge-sync.ts**

Add import at top:
```ts
import { applyActiveCouponFilter } from '@/lib/coupons/active-filter';
```
Replace the query (lines 61-71):
```ts
  const { data: coupons, error: couponsError } = await supabase
    .from('coupons')
    .select(`
      *,
      partnership:partnerships(
        brand_name,
        campaign_name
      )
    `)
    .eq('account_id', accountId)
    .eq('is_active', true);
```
with:
```ts
  const { data: coupons, error: couponsError } = await applyActiveCouponFilter(
    supabase
      .from('coupons')
      .select(`
        *,
        partnership:partnerships(
          brand_name,
          campaign_name
        )
      `)
      .eq('account_id', accountId)
  );
```

- [ ] **Step 4: dm-handler.ts (adds the missing start_date check)**

Add import at top:
```ts
import { applyActiveCouponFilter } from '@/lib/coupons/active-filter';
```
Replace the query (lines 549-555):
```ts
  const { data: coupons } = await supabase
    .from('coupons')
    .select('code, description, discount_type, discount_value, tracking_url, partnership_id')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .or('end_date.is.null,end_date.gte.' + new Date().toISOString())
    .limit(5);
```
with:
```ts
  const { data: coupons } = await applyActiveCouponFilter(
    supabase
      .from('coupons')
      .select('code, description, discount_type, discount_value, tracking_url, partnership_id')
      .eq('account_id', accountId)
  ).limit(5);
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no new errors in the four edited files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chatbot/knowledge-retrieval.ts src/lib/chatbot/hybrid-retrieval.ts src/lib/chatbot/knowledge-sync.ts src/lib/instagram-graph/dm-handler.ts
git commit -m "fix(coupons): enforce date validity on all chat/DM coupon reads"
```

---

## Task 4: compact-knowledge-context — full predicate + omit empty + instruction

**Files:**
- Modify: `src/lib/rag/compact-knowledge-context.ts:126-153`

Today it filters `end_date` only and renders the coupon section even if the active list is empty.

- [ ] **Step 1: Add import**

At the top of the file:
```ts
import { isCouponValid } from '@/lib/coupons/active-filter';
```

- [ ] **Step 2: Replace the coupon section (lines 126-153)**

Replace:
```ts
  if (kb.coupons?.length > 0) {
    const now = new Date();
    const activeCoupons = kb.coupons.filter(c => {
      if (c.end_date) {
        return new Date(c.end_date) >= now;
      }
      return true;
    });
    const expiredCount = kb.coupons.length - activeCoupons.length;

    let section = `\n💰 **קופונים זמינים (${activeCoupons.length}) - CRITICAL: שמות המותגים יכולים להיות באנגלית או בעברית:**\n`;
```
with:
```ts
  const now = new Date();
  const activeCoupons = (kb.coupons || []).filter(c => isCouponValid(c as any, now));
  // No valid coupon → say nothing about discounts at all (omit the whole section).
  if (activeCoupons.length > 0) {
    const expiredCount = (kb.coupons?.length || 0) - activeCoupons.length;

    let section = `\n💰 **קופונים זמינים (${activeCoupons.length}) - CRITICAL: השתמש אך ורק בקודים שברשימה הזו, אל תמציא קוד ואל תזכיר קוד שאינו כאן. שמות המותגים יכולים להיות באנגלית או בעברית:**\n`;
```

The rest of the block (the `activeCoupons.forEach(...)`, the `expiredCount` note, the brand-matching line, `context += section;`, `sectionCounts.coupons = activeCoupons.length;`) stays unchanged — only the opening `if`/filter and the header string changed. Ensure the closing brace of the old `if (kb.coupons?.length > 0)` now closes the new `if (activeCoupons.length > 0)`.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 4: Manual verification (LA BEAUTÉ)**

The LA BEAUTÉ live coupon set currently contains only `ORTALAMAR`. Confirm by reasoning: with `isCouponValid`, the deactivated 70% coupons are excluded; if `ORTALAMAR` is the only active one, the section lists only it; if an account had zero valid coupons the section is omitted entirely.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/compact-knowledge-context.ts
git commit -m "fix(coupons): full validity predicate, omit empty coupon section, forbid invented codes"
```

---

## Task 5: Stop ingesting coupons into RAG

**Files:**
- Modify: `src/lib/rag/ingest.ts:401-428` (delete coupon case)
- Modify: `src/lib/rag/ingest.ts:568` (strip `Coupon code:` from partnership text)

- [ ] **Step 1: Delete the coupon ingestion case**

Remove the entire `case 'coupon': { ... break; }` block (lines 401-428). Coupons are no longer ingested as RAG chunks.

- [ ] **Step 2: Remove the baked partnership coupon code**

In `buildPartnershipText` remove line 568:
```ts
  if (p.coupon_code) parts.push(`Coupon code: ${p.coupon_code}`);
```
(Leave the rest of `buildPartnershipText` intact. The partnership chunk still describes the partnership; the code/validity comes only from the live coupon read.)

- [ ] **Step 3: Check for now-unused references**

Run: `grep -n "buildCouponText\|'coupon'" src/lib/rag/ingest.ts`
If `buildCouponText` (lines 577-594) is now unreferenced, delete it. If `'coupon'` remains in the `EntityType` union in `src/lib/rag/types.ts`, leave the type (harmless) but ensure no code path ingests it.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no new errors (a removed-then-deleted `buildCouponText` must not be referenced anywhere; if it is, the type-check will flag it — delete the reference).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/ingest.ts src/lib/rag/types.ts
git commit -m "feat(coupons): stop ingesting coupons into RAG; drop baked partnership codes"
```

---

## Task 6: Purge existing coupon chunks (one-time backfill)

**Files:**
- Create: `scripts/purge-coupon-chunks.ts`

- [ ] **Step 1: Write the script**

```ts
// scripts/purge-coupon-chunks.ts
// One-time: remove every entity_type='coupon' document_chunk + parent document.
// Coupons are no longer RAG content (see ingest.ts). Run with --all or an account id.
//   npx tsx scripts/purge-coupon-chunks.ts --all [--dry-run]
//   npx tsx scripts/purge-coupon-chunks.ts <account_id> [--dry-run]
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const accountId = args.find(a => !a.startsWith('--'));
  if (!all && !accountId) {
    console.error('Usage: purge-coupon-chunks.ts (--all | <account_id>) [--dry-run]');
    process.exit(1);
  }

  const chunkQuery = supabase.from('document_chunks').select('id, document_id', { count: 'exact' }).eq('entity_type', 'coupon');
  if (!all) chunkQuery.eq('account_id', accountId!);
  const { data: chunks, count } = await chunkQuery;
  const docIds = [...new Set((chunks || []).map(c => c.document_id).filter(Boolean))];
  console.log(`Found ${count ?? chunks?.length ?? 0} coupon chunks across ${docIds.length} documents${all ? ' (ALL accounts)' : ` for ${accountId}`}.`);

  if (dryRun) { console.log('Dry run — nothing deleted.'); return; }

  const delChunks = supabase.from('document_chunks').delete().eq('entity_type', 'coupon');
  if (!all) delChunks.eq('account_id', accountId!);
  const { error: e1 } = await delChunks;
  if (e1) throw e1;

  if (docIds.length > 0) {
    const { error: e2 } = await supabase.from('documents').delete().eq('entity_type', 'coupon').in('id', docIds);
    if (e2) throw e2;
  }
  console.log('✅ Purged coupon chunks + documents.');
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run across all accounts**

Run: `npx tsx scripts/purge-coupon-chunks.ts --all --dry-run`
Expected: prints a count of coupon chunks/documents, deletes nothing.

- [ ] **Step 3: Real run**

Run: `npx tsx scripts/purge-coupon-chunks.ts --all`
Expected: `✅ Purged coupon chunks + documents.`

- [ ] **Step 4: Verify zero remain**

MCP `execute_sql`:
```sql
SELECT count(*) FROM document_chunks WHERE entity_type='coupon';
```
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/purge-coupon-chunks.ts
git commit -m "chore(coupons): one-time purge script for legacy coupon RAG chunks"
```

---

## Task 7: Invalid-code KB scrub (reuse the existing scrub mechanism)

**Files:**
- Create: `src/lib/coupons/kb-scrub.ts`
- Test: `tests/unit/coupon-kb-scrub.test.ts`
- Modify: `src/lib/chatbot/sandwichBot.ts:239-278` (refactor bannedTerms to the util + add invalid-code scrub)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/coupon-kb-scrub.test.ts
import { describe, it, expect } from 'vitest';
import { scrubTermsFromKB } from '@/lib/coupons/kb-scrub';

describe('scrubTermsFromKB', () => {
  it('replaces a known invalid code in a post caption with blocks', () => {
    const kb = { posts: [{ caption: 'מבצע ענק! קוד הנחה danielamit ל-70% הנחה' }] };
    const out = scrubTermsFromKB(kb, ['danielamit']);
    expect(out.posts[0].caption).not.toContain('danielamit');
    expect(out.posts[0].caption).toContain('███');
  });
  it('leaves text without the term untouched', () => {
    const kb = { posts: [{ caption: 'קוד קבוע ORTALAMAR' }] };
    const out = scrubTermsFromKB(kb, ['danielamit']);
    expect(out.posts[0].caption).toBe('קוד קבוע ORTALAMAR');
  });
  it('ignores terms shorter than 2 chars', () => {
    const kb = { websites: [{ text: 'a b c' }] };
    const out = scrubTermsFromKB(kb, ['a']);
    expect(out.websites[0].text).toBe('a b c');
  });
  it('drops a post that became >40% redaction noise', () => {
    const kb = { posts: [{ caption: 'hen hen hen hen' }] };
    const out = scrubTermsFromKB(kb, ['hen']);
    expect(out.posts.length).toBe(0);
  });
  it('returns kb unchanged when no usable terms', () => {
    const kb = { posts: [{ caption: 'x' }] };
    expect(scrubTermsFromKB(kb, [])).toEqual(kb);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/coupon-kb-scrub.test.ts`
Expected: FAIL — cannot resolve `@/lib/coupons/kb-scrub`.

- [ ] **Step 3: Write the util (extracted from sandwichBot's inline scrub)**

```ts
// src/lib/coupons/kb-scrub.ts
// Replaces every occurrence of the given terms with ███ across ALL string
// fields of a knowledge-base object, then drops posts that became mostly
// redaction noise. Extracted verbatim from sandwichBot's bannedTerms scrub so
// both banned-terms and invalid-coupon-code scrubbing share one implementation.

export function scrubTermsFromKB<T>(kb: T, terms: string[]): T {
  const clean = (terms || []).map(t => (t || '').trim()).filter(t => t.length >= 2);
  if (clean.length === 0) return kb;
  // Longest-first so multi-word terms match before their prefixes.
  clean.sort((a, b) => b.length - a.length);
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${clean.map(escapeRe).join('|')})`, 'gi');
  const scrub = (s: any): any => (typeof s === 'string' ? s.replace(re, '███') : s);
  const scrubObj = (o: any): any => {
    if (!o || typeof o !== 'object') return o;
    const out: any = Array.isArray(o) ? [] : {};
    for (const k of Object.keys(o)) {
      const v = (o as any)[k];
      if (typeof v === 'string') out[k] = scrub(v);
      else if (Array.isArray(v)) out[k] = v.map((it: any) => (typeof it === 'string' ? scrub(it) : scrubObj(it)));
      else if (v && typeof v === 'object') out[k] = scrubObj(v);
      else out[k] = v;
    }
    return out;
  };
  const scrubbed = scrubObj(kb) as any;
  const tooMuchRedaction = (s: any) => {
    if (typeof s !== 'string' || s.length === 0) return false;
    const blocks = (s.match(/███/g) || []).length;
    return (blocks * 3) / s.length > 0.4;
  };
  if (Array.isArray(scrubbed.posts)) {
    scrubbed.posts = scrubbed.posts.filter((p: any) => !tooMuchRedaction(p?.caption));
  }
  return scrubbed as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/coupon-kb-scrub.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Refactor sandwichBot bannedTerms block to use the util**

In `src/lib/chatbot/sandwichBot.ts`, add imports near the top:
```ts
import { scrubTermsFromKB } from '@/lib/coupons/kb-scrub';
import { getAllCouponCodes } from '@/lib/coupons/active-filter';
```
Replace the body of the `if (input.bannedTerms && input.bannedTerms.length > 0) { ... }` block (lines 240-277, the inline `terms`/`escapeRe`/`scrub`/`scrubObj`/`tooMuchRedaction`/`scrubbed` logic) with:
```ts
      const terms = input.bannedTerms.filter((t) => (t || '').trim().length >= 2);
      if (terms.length > 0) {
        knowledgeBase = scrubTermsFromKB(knowledgeBase, terms);
        console.log(`   🛡  Input redaction: scrubbed ${terms.length} banned terms across KB`);
      }
```

- [ ] **Step 6: Add the invalid-code scrub (after the bannedTerms block)**

Immediately after the closing `}` of the `if (input.bannedTerms ...)` block (≈ line 278), insert:
```ts
    // Coupon validity scrub: strip any coupon code that exists for this account
    // but is NOT currently valid (expired / deactivated / future) from EVERY KB
    // text field before the LLM sees it. Valid codes live in knowledgeBase.coupons
    // (already date-filtered) and are left intact. Covers post captions, website
    // promo terms, highlights, etc. (RAG free-text leaks).
    try {
      const validCodes = new Set(
        (knowledgeBase.coupons || [])
          .map((c: any) => (c.code || '').toLowerCase())
          .filter(Boolean)
      );
      const allCodes = await getAllCouponCodes(supabase, input.accountId);
      const invalidCodes = allCodes.filter((code) => !validCodes.has(code.toLowerCase()));
      if (invalidCodes.length > 0) {
        knowledgeBase = scrubTermsFromKB(knowledgeBase, invalidCodes);
        console.log(`   🛡  Coupon scrub: removed ${invalidCodes.length} invalid coupon code(s) from KB`);
      }
    } catch (err) {
      console.error('[SandwichBot] coupon scrub failed (non-fatal):', err);
    }
```

- [ ] **Step 7: Run the scrub tests + type-check**

Run: `npx vitest run tests/unit/coupon-kb-scrub.test.ts && npm run type-check`
Expected: tests PASS; no new type errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/coupons/kb-scrub.ts tests/unit/coupon-kb-scrub.test.ts src/lib/chatbot/sandwichBot.ts
git commit -m "feat(coupons): scrub invalid coupon codes from KB before generation"
```

---

## Task 8: Nightly auto-deactivate cron

**Files:**
- Create: `src/app/api/cron/expire-coupons/route.ts`
- Modify: `vercel.json` (add to the `crons` array)

- [ ] **Step 1: Write the cron route** (CRON_SECRET pattern matches `daily-persona-update`)

```ts
// src/app/api/cron/expire-coupons/route.ts
// Nightly hygiene: flip is_active=false for coupons whose end_date has passed.
// Correctness does not depend on this (date is authoritative in reads), but it
// keeps dashboards honest and shrinks the invalid-code scrub set.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('coupons')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true)
    .not('end_date', 'is', null)
    .lt('end_date', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('[expire-coupons] failed:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  console.log(`[expire-coupons] deactivated ${data?.length || 0} expired coupons`);
  return NextResponse.json({ ok: true, deactivated: data?.length || 0 });
}
```

- [ ] **Step 2: Register the cron in vercel.json**

Add this object to the `crons` array (runs daily at 02:30 UTC, after daily-persona-update):
```json
    {
      "path": "/api/cron/expire-coupons",
      "schedule": "30 2 * * *"
    }
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 4: Local smoke test** (dev server running)

Run: `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/expire-coupons`
Expected: `{"ok":true,"deactivated":<n>}`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/expire-coupons/route.ts vercel.json
git commit -m "feat(coupons): nightly cron to deactivate expired coupons"
```

---

## Task 9: Gate the persona→coupon sync (stop manufacturing active rows)

**Files:**
- Modify: `src/lib/processing/sync-commerce-data.ts:100-133`

Synthetic coupons extracted from persona metadata are inserted `is_active=true` with no dates — they would live forever. Insert them as drafts instead.

- [ ] **Step 1: Change the insert to draft + provenance**

In the `rows` mapping (lines 112-121), change `is_active: true` to `is_active: false` and add a `metadata` provenance tag:
```ts
      return {
        account_id: accountId,
        code: c.code!.trim(),
        brand_name: c.brand,
        brand_category: null as string | null,
        description: c.description || null,
        discount_type: discountType,
        discount_value: discountValue,
        is_active: false, // draft — a human activates persona-extracted coupons
        metadata: { source: 'persona_sync' },
      };
```
(If the `coupons` table has no `metadata` column, drop that line — verify with the schema; the `is_active: false` change is the essential one.)

- [ ] **Step 2: Update the log line (132) for clarity**

```ts
    console.log(`  - ${couponsCreated} coupons created as DRAFTS (from ${coupons.length} extracted; activate manually)`);
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/processing/sync-commerce-data.ts
git commit -m "fix(coupons): persona-synced coupons are inactive drafts, not auto-active"
```

---

## Task 10: "פג תוקף" badge in the management list

**Files:**
- Modify: `src/app/influencer/[username]/coupons/page.tsx:21-51`

Management list must keep showing expired coupons (so they can be edited/reactivated) but mark them. This needs `end_date` available on the row.

- [ ] **Step 1: Ensure the GET returns end_date + is_active**

Open `src/app/api/influencer/coupons/route.ts`. Confirm the `select(...)` in the GET includes `end_date` and `is_active` (add them if missing, e.g. `.select('*')` already covers it). No other change to that route (management list is intentionally NOT date-filtered).

- [ ] **Step 2: Extend the page Coupon interface (line 21-35)**

Add two fields:
```ts
  is_active: boolean;
  end_date: string | null;
```
(`is_active` already exists at line 28; add `end_date` after it.)

- [ ] **Step 3: Add an isExpired helper near formatDiscount (after line 51)**

```ts
function isExpired(c: { end_date: string | null }): boolean {
  return !!c.end_date && new Date(c.end_date) < new Date();
}
```

- [ ] **Step 4: Render the badge** in the coupon row JSX (wherever the coupon code/brand is shown in the list)

```tsx
{isExpired(coupon) && (
  <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
    {isEn ? 'Expired' : 'פג תוקף'}
  </span>
)}
```
Place it adjacent to the coupon code/brand display. (Find the existing per-coupon render block; insert this span there.)

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/influencer/[username]/coupons/page.tsx src/app/api/influencer/coupons/route.ts
git commit -m "feat(coupons): show 'פג תוקף' badge on expired coupons in management list"
```

---

## Task 11: Full verification

- [ ] **Step 1: Full unit suite**

Run: `npm run test`
Expected: the two new suites pass (`coupon-active-filter`, `coupon-kb-scrub`); pre-existing `rate-limit.test.ts` failures are unrelated (known-broken before this work).

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no new errors introduced by this branch.

- [ ] **Step 3: Regression — the LA BEAUTÉ incident**

With the dev server running, send a widget chat message to the LA BEAUTÉ account asking about discounts (e.g. "יש קופון הנחה?"). Expected: the bot does NOT mention a 70% discount or the codes `danielamit`/`hen`/`hadar`/`karin`; it either mentions only currently-valid coupons (e.g. `ORTALAMAR` if active) or says nothing about discounts. Check server logs for `🛡 Coupon scrub: removed N invalid coupon code(s)` if any caption mentioned an expired code.

- [ ] **Step 4: Push the branch / open PR** (only if the user asks)

```bash
git push -u origin coupon-validity-rag
```

---

## Spec coverage check

| Spec unit | Task |
|-----------|------|
| Unit 1 — canonical helper | Task 1 |
| Unit 1 — RPC + read paths | Tasks 2, 3 |
| Unit 2 — remove from RAG + purge | Tasks 5, 6 |
| Unit 3 — invalid-code scrub | Task 7 |
| Unit 4 — prompt hardening + omit empty | Task 4 |
| Unit 5 — nightly cron | Task 8 |
| Unit 6 — gate sync-commerce | Task 9 |
| Management badge (user-confirmed) | Task 10 |
| Fail-closed, testing, regression | Tasks 4, 11 |
