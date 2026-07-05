# Widget Phase A — Foundation (Data Integrity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every number in the widget analytics dashboard come from real data — restore the dead recommendation-click attribution pipeline, purge synthetic backfill events, and simplify the admin aggregation to read clean data.

**Architecture:** Three independent fixes on the existing widget stack: (1) add the missing CORS/OPTIONS handling to the recommendation-click endpoint so cross-origin click beacons are no longer blocked; (2) a reversible SQL migration that backs up then deletes the `backfill_reconstructed` events; (3) simplify the `widget_analytics_summary` RPC + admin route + `WidgetTab` now that reconstructed data is gone.

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript, Supabase Postgres (migrations via `supabase/migrations/*.sql` + `mcp__supabase__apply_migration`), Vitest (`npx vitest run`), vanilla `public/widget.js`.

## Global Constraints

- **Backup before destructive DB ops:** copy rows to a `_bkp_<name>_<yyyymmdd>` table before any `DELETE` (repo convention, e.g. `_bkp_*_20260630`).
- **Widget routes are cross-origin:** every `/api/widget/*` handler MUST answer `OPTIONS` and echo `getCorsHeaders(origin)` on all responses — mirror the existing per-route pattern (`src/app/api/widget/chat/route.ts:15,49`). Do not extract a shared helper (follow existing per-route duplication).
- **Privacy:** anonymous only — never log/store input field values, email, or name from the host page. IP is hashed.
- **Git:** commit each task straight to `main` and push; stage only that task's files (Ido's workflow). Commit message co-author line: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Account under test:** `argania_group` = `c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1` (QuickShop, domain `argania-oil.co.il`).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/app/api/widget/recommendations/click/route.ts` | Record a recommendation click; now CORS-enabled | Modify |
| `tests/unit/widget/recommendations-click-cors.test.ts` | Assert OPTIONS + CORS headers on the click route | Create |
| `public/widget.js` | Send a resolvable id (not `null`) on inline product-link clicks | Modify (~line 1461) |
| `supabase/migrations/048_purge_widget_backfill.sql` | Backup + delete `backfill_reconstructed` events | Create |
| `supabase/migrations/049_widget_analytics_summary_clean.sql` | Simplify RPC (drop realtime/backfill split) | Create |
| `src/app/api/admin/analytics/widget-summary/route.ts` | Drop `reconstructed`/`realtimeCount` derivation | Modify (`route.ts:64-70,123-128`) |
| `src/app/admin/influencers/[id]/analytics/WidgetTab.tsx` | Remove the "reconstructed history" banner | Modify (`WidgetTab.tsx:29,245`) |

---

## Task 1: Restore recommendation-click attribution (CORS + OPTIONS)

**Root cause:** `src/app/api/widget/recommendations/click/route.ts` has no `OPTIONS` handler and returns no CORS headers, unlike every sibling widget route. Cross-origin `Content-Type: application/json` POSTs from the customer's site trigger a preflight the endpoint never answers, so the browser blocks the click beacon. Result: 2,136 recommendations, 0 clicks.

**Files:**
- Modify: `src/app/api/widget/recommendations/click/route.ts`
- Test: `tests/unit/widget/recommendations-click-cors.test.ts`

**Interfaces:**
- Produces: `OPTIONS(req: NextRequest): Response` returning `204` + CORS headers; `POST` responses now include `getCorsHeaders(origin)`.
- Consumes: the CORS pattern from `src/app/api/widget/chat/route.ts:15-53`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/widget/recommendations-click-cors.test.ts
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { OPTIONS } from '@/app/api/widget/recommendations/click/route';

describe('recommendations/click CORS', () => {
  it('answers OPTIONS preflight with 204 and ACAO echoing the origin', async () => {
    const req = new NextRequest('https://bestie.ldrsgroup.com/api/widget/recommendations/click', {
      method: 'OPTIONS',
      headers: { origin: 'https://argania-oil.co.il' },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://argania-oil.co.il');
    expect(res.headers.get('access-control-allow-methods') || '').toContain('POST');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/recommendations-click-cors.test.ts`
Expected: FAIL — `OPTIONS is not a function` (route exports no OPTIONS).

- [ ] **Step 3: Add CORS helper + OPTIONS + CORS on all responses**

Edit `src/app/api/widget/recommendations/click/route.ts`. Add the helper and OPTIONS (mirroring `chat/route.ts`), switch the signature to `NextRequest`, and attach `corsHeaders` to every `NextResponse.json(...)`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function getCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || '*';
  const corsHeaders = getCorsHeaders(origin);
  try {
    const { recommendationId, productId, accountId } = await request.json();
    if (!productId || !accountId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders });
    }
    const supabase = await createClient();
    if (recommendationId) {
      await supabase.from('widget_recommendations')
        .update({ was_clicked: true, clicked_at: new Date().toISOString() })
        .eq('id', recommendationId);
    } else {
      const { data: rec } = await supabase.from('widget_recommendations')
        .select('id').eq('account_id', accountId).eq('product_id', productId)
        .eq('was_clicked', false).order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (rec) {
        await supabase.from('widget_recommendations')
          .update({ was_clicked: true, clicked_at: new Date().toISOString() })
          .eq('id', rec.id);
      }
    }
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('[RecommendationClick] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: corsHeaders });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/widget/recommendations-click-cors.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual cross-origin verification (real DB)**

With dev server running (`npm run dev`), seed nothing new — pick a real unclicked rec:
```bash
# get one product_id for argania
# (run via mcp execute_sql) SELECT product_id FROM widget_recommendations
#   WHERE account_id='c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1' AND was_clicked=false LIMIT 1;
curl -i -X POST http://localhost:3000/api/widget/recommendations/click \
  -H 'Content-Type: application/json' -H 'Origin: https://argania-oil.co.il' \
  -d '{"accountId":"c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1","productId":"<PRODUCT_ID>"}'
```
Expected: `200`, response header `Access-Control-Allow-Origin: https://argania-oil.co.il`. Then verify `was_clicked=true` for that rec via `mcp__supabase__execute_sql`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/widget/recommendations/click/route.ts tests/unit/widget/recommendations-click-cors.test.ts
git commit -m "fix(widget): add CORS/OPTIONS to recommendation-click route (restore click attribution)"
```

---

## Task 2: Fix inline product-link clicks sending `productId: null`

**Root cause:** In `public/widget.js` the inline markdown-link click tracker posts `productId:null` (~line 1461), which the click route rejects with `400` (`if (!productId ...)`). Inline product links therefore never attribute. Since the inline handler has no product id in scope, switch it to a lightweight generic click event instead of a broken attribution call, so it stops 400-ing and still records the interaction.

**Files:**
- Modify: `public/widget.js` (the `formatInline` link `trackAttr`, ~line 1458-1462)

**Interfaces:**
- Consumes: existing global `widgetTrack(name, params)` already defined in `widget.js`.
- Produces: no new exports; inline product-link clicks now emit `widget_product_click` with `{ surface: 'inline_link', href }` and stop calling the attribution endpoint with a null id.

- [ ] **Step 1: Locate the current broken handler**

Run: `grep -n "productId:null" public/widget.js`
Expected: one match inside `formatInline` (`trackAttr` string).

- [ ] **Step 2: Replace the null-id attribution call with a tracked event**

In `public/widget.js`, change the `trackAttr` assignment for product links from the `fetch(... productId:null ...)` inline string to:

```javascript
        var trackAttr = isProductLink
          ? ' onclick="try{window.__ibotInlineProductClick&&window.__ibotInlineProductClick(this.href)}catch(e){}"'
          : '';
```

Then add this global near the other `window.__ibot*` handlers (e.g. after `window.__ibotCardClick`):

```javascript
  // Inline product links carry no product id (they come from free-text markdown),
  // so we record a generic click instead of calling the attribution endpoint with
  // a null id (which 400s). Card clicks remain the attributed path.
  window.__ibotInlineProductClick = function (href) {
    widgetTrack('widget_product_click', { surface: 'inline_link', href: href || null });
  };
```

- [ ] **Step 3: Manual verification**

Load the widget in the admin preview, trigger a bot reply containing a markdown product link, click it. In the Network tab: no `POST /api/widget/recommendations/click` with a `400`; instead the analytics batch (`/api/analytics/widget`) contains a `widget_product_click` event with `surface:"inline_link"`.

- [ ] **Step 4: Commit**

```bash
git add public/widget.js
git commit -m "fix(widget): inline product-link clicks emit tracked event instead of null-id 400"
```

---

## Task 3: Purge `backfill_reconstructed` events (reversible)

**Context:** `argania_group` has ~1,258 synthetic `events` rows (`mode='widget'`, `metadata->>'source'='backfill_reconstructed'`, `payload.reconstructed=true`) from a one-off June-14 reconstruction. They dominate and freeze the dashboard headline numbers. Delete them, backing up first.

**Files:**
- Create: `supabase/migrations/048_purge_widget_backfill.sql`

**Interfaces:**
- Produces: table `_bkp_events_backfill_20260705` containing the deleted rows; the `events` table no longer contains any `backfill_reconstructed` widget rows.

- [ ] **Step 1: Write the migration (backup + delete)**

```sql
-- supabase/migrations/048_purge_widget_backfill.sql
-- Backfill events were synthetic (reconstructed from chat history on 2026-06-14).
-- They froze/inflated the widget dashboard. Back up, then delete.

CREATE TABLE IF NOT EXISTS _bkp_events_backfill_20260705 AS
SELECT * FROM events
WHERE mode = 'widget' AND metadata->>'source' = 'backfill_reconstructed';

DELETE FROM events
WHERE mode = 'widget' AND metadata->>'source' = 'backfill_reconstructed';
```

- [ ] **Step 2: Capture the pre-count (for the assertion)**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT count(*) FROM events WHERE mode='widget' AND metadata->>'source'='backfill_reconstructed';
```
Expected: ~1258. Note the exact number.

- [ ] **Step 3: Apply the migration**

Apply `048_purge_widget_backfill.sql` via `mcp__supabase__apply_migration` (name: `purge_widget_backfill`).

- [ ] **Step 4: Verify backup captured all rows and source is clean**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT
  (SELECT count(*) FROM _bkp_events_backfill_20260705) AS backed_up,
  (SELECT count(*) FROM events WHERE mode='widget' AND metadata->>'source'='backfill_reconstructed') AS remaining;
```
Expected: `backed_up` = the Step 2 count, `remaining` = 0.

- [ ] **Step 5: Commit the migration file**

```bash
git add supabase/migrations/048_purge_widget_backfill.sql
git commit -m "chore(widget): purge synthetic backfill_reconstructed events (backup to _bkp table)"
```

---

## Task 4: Simplify `widget_analytics_summary` RPC + admin route + tab

**Context:** With backfill gone, the realtime/reconstructed split in the RPC and the "figures include reconstructed history" banner are dead weight. Every remaining widget event is organic. Simplify so `engagement` is a plain per-type count.

**Files:**
- Create: `supabase/migrations/049_widget_analytics_summary_clean.sql`
- Modify: `src/app/api/admin/analytics/widget-summary/route.ts` (`:64-70`, `:123-128`)
- Modify: `src/app/admin/influencers/[id]/analytics/WidgetTab.tsx` (`:29`, `:245`)

**Interfaces:**
- Consumes: nothing new.
- Produces: RPC `widget_analytics_summary(p_account_id uuid, p_since timestamptz)` whose `engagement` array items are `{ type, count }` (no `realtime`); route response `engagement` object is `{ active: boolean, events: {type,count}[] }` (drops `reconstructed`, `realtimeCount`).

- [ ] **Step 1: Write the simplified RPC migration**

```sql
-- supabase/migrations/049_widget_analytics_summary_clean.sql
CREATE OR REPLACE FUNCTION public.widget_analytics_summary(p_account_id uuid, p_since timestamptz)
RETURNS json LANGUAGE sql STABLE AS $function$
  SELECT json_build_object(
    'rec_total',  (SELECT count(*) FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since),
    'rec_clicks', (SELECT count(*) FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since AND was_clicked),
    'rec_by_product', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT product_name AS name, count(*)::int AS count,
               count(*) FILTER (WHERE was_clicked)::int AS clicks
        FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since
        GROUP BY product_name ORDER BY count(*) DESC LIMIT 15) t),
    'rec_by_strategy', (
      SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM (
        SELECT coalesce(strategy, 'unknown') AS strategy, count(*)::int AS count,
               count(*) FILTER (WHERE was_clicked)::int AS clicks
        FROM widget_recommendations WHERE account_id = p_account_id AND created_at >= p_since
        GROUP BY strategy ORDER BY count(*) DESC) s),
    'session_count', (SELECT count(*) FROM chat_sessions WHERE account_id = p_account_id AND created_at >= p_since),
    'product_count', (SELECT count(*) FROM widget_products WHERE account_id = p_account_id),
    'engagement', (
      SELECT coalesce(json_agg(row_to_json(e)), '[]'::json) FROM (
        SELECT type, count(*)::int AS count
        FROM events
        WHERE account_id = p_account_id AND mode = 'widget' AND created_at >= p_since
        GROUP BY type ORDER BY count(*) DESC) e)
  );
$function$;
```

- [ ] **Step 2: Apply the migration**

Apply via `mcp__supabase__apply_migration` (name: `widget_analytics_summary_clean`). Verify:
```sql
SELECT (widget_analytics_summary('c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1', now() - interval '90 days')::jsonb) -> 'engagement';
```
Expected: array of `{type,count}` with no `realtime` key; counts reflect only organic events (much smaller than before).

- [ ] **Step 3: Simplify the admin route**

In `src/app/api/admin/analytics/widget-summary/route.ts`, replace the engagement block (`:64-70`) with:

```typescript
  // Engagement: organic per-type counts (backfill purged; no reconstructed split).
  const engRows = (a.engagement || []) as Array<{ type: string; count: number }>;
  const engagementEvents = engRows.map((e) => ({ type: e.type, count: e.count }));
  const widgetPipelineActive = engagementEvents.some((e) => e.count > 0);
```

And replace the response `engagement` object (`:123-128`) with:

```typescript
    engagement: {
      active: widgetPipelineActive,
      events: engagementEvents,
    },
```

- [ ] **Step 4: Remove the reconstructed banner from the tab**

In `src/app/admin/influencers/[id]/analytics/WidgetTab.tsx`: delete the `reconstructed?: boolean;` field from the engagement type (`:29`) and delete the `{data.engagement.reconstructed && ( ... )}` banner block (`:245`).

- [ ] **Step 5: Typecheck + run the widget unit tests**

Run: `npm run type-check && npx vitest run tests/unit/widget`
Expected: type-check clean; tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/049_widget_analytics_summary_clean.sql src/app/api/admin/analytics/widget-summary/route.ts src/app/admin/influencers/[id]/analytics/WidgetTab.tsx
git commit -m "refactor(widget-analytics): drop reconstructed split now that backfill is purged"
```

---

## Task 5: Verify the conversions pipeline is wired

**Context:** The dashboard reads `widget_conversions` (Direct/Assisted/Influenced/None). Confirm the pipeline exists end-to-end so #3 can trust it; if the table is absent, record that as the one wiring gap (do not build the full attribution here — that is its own spec).

**Files:**
- Read only: `public/widget.js` (thank-you detection), `src/app/api/widget/conversion/` (if present)

**Interfaces:**
- Produces: a written verdict in the plan's execution notes — `widget_conversions` exists & reachable OR the specific missing piece.

- [ ] **Step 1: Check the table exists**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT to_regclass('public.widget_conversions') AS tbl;
```

- [ ] **Step 2: Check the ingest route + client detection exist**

Run: `ls src/app/api/widget/conversion 2>/dev/null; grep -n "thank-you\|thank_you\|/conversion" public/widget.js`

- [ ] **Step 3: Record the verdict**

If the table + route + client detection all exist → conversions are wired; note it. If any is missing → record exactly which, so it becomes the first task of the conversion-attribution spec (already drafted: `docs/superpowers/specs/2026-06-11-widget-conversion-attribution-design.md`). No code change in this task unless a one-line wiring gap is found and trivially closeable.

- [ ] **Step 4: Commit (only if a change was made)**

```bash
git add -A && git commit -m "chore(widget): note/close conversions pipeline wiring gap"
```

---

## Self-Review

**Spec coverage (§9 Foundation):** ✅ purge backfill (Task 3), ✅ fix click pipeline (Tasks 1+2), ✅ verify conversions (Task 5), ✅ update RPC + admin route (Task 4). All §9 items mapped.

**Placeholder scan:** No "TBD/TODO". `<PRODUCT_ID>` in Task 1 Step 5 is an explicit runtime value the operator fills from the preceding query — acceptable (verification input, not code).

**Type consistency:** `getCorsHeaders(origin)` signature matches `chat/route.ts`. RPC `engagement` shape `{type,count}` (Task 4 Step 1) matches the route's `engRows` type (Task 4 Step 3). `widget_product_click` (Task 2) is an existing catalog event already emitted by `onCardClick`.

**Out of scope (correctly deferred to Phase B/C):** partitioned `widget_events`, Redis buffer/drain, rollups, cart watcher, complementary recs. This plan only makes existing numbers trustworthy.
