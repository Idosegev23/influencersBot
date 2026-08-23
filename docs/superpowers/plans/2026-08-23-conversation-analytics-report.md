# Conversation Analytics & Weekly Retro Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify every conversation across every channel once, then surface it as a filterable analytics page with export and a weekly pushed retro report.

**Architecture:** An hourly cron classifies each settled `chat_session` exactly once into an immutable row (closed L1 inquiry type + free L2 topic + complaint/product/sentiment axes). A weekly cron clusters new topics into canonical labels, aggregates the week in SQL, derives evidence-backed insights, freezes a snapshot, and emails it. The page reads the same aggregation for any date range.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), OpenAI Responses API (`gpt-5.6-luna` / `gpt-5.6-terra`), ExcelJS + quickchart.io, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-23-conversation-analytics-report-design.md`](../specs/2026-08-23-conversation-analytics-report-design.md)

## Global Constraints

- **Tests:** `npm run test` is watch mode. Always run `npx vitest run <path>`.
- **Migration:** next number is `080` (latest on disk is `079_inbound_email_routing.sql`).
- **Service-role DB access:** `import { supabase } from '@/lib/supabase'` — the singleton at `src/lib/supabase.ts:61` that bypasses RLS. Cron routes and server libs use this.
- **OpenAI:** this repo uses the **Responses API** (`client.responses.create`), not chat completions. Strict schemas go in `text.format = { type: 'json_schema', name, strict: true, schema }`. Reasoning is `reasoning: { effort: 'low' }`. Token cap is `max_output_tokens`.
- **GPT-5.6 parameter rules:** never pass a custom `temperature`; never pass `max_tokens`; always pass `reasoning` explicitly. Omitting `reasoning` is what silently broke WA CS.
- **Models:** classify = `gpt-5.6-luna`; low-confidence retry = `gpt-5.6-terra`. Both priced in `src/lib/costs/pricing.ts`.
- **Cost accounting:** `estimateCostUsd({ model, inputTokens, cachedInputTokens, outputTokens })` from `@/lib/costs/pricing`.
- **Cron auth:** every cron route verifies `Authorization: Bearer ${process.env.CRON_SECRET}`.
- **Account filter everywhere:** `status = 'active'` AND `config.isDemo` is not `true` AND `config.conversation_analytics.enabled` is `true`.
- **Product matching is exact/alias only.** No fuzzy, no embedding, no model-chosen SKU. Panda ≠ Pandora.
- **Absent data is labelled absent.** A channel with no connection renders "not connected", never `0`.
- **Closed L1 enum (9 values):** `complaint`, `order_status`, `return_refund`, `product_question`, `recommendation`, `pricing_promo`, `availability`, `technical`, `other`.
- **i18n:** dashboard strings live in `src/lib/i18n/dashboard/<section>.ts`, each exporting `{ he, en }`, composed by `index.ts`. Hebrew is default; `accounts.language = 'en'` opts in.

---

### Task 1: Database schema

**Files:**
- Create: `supabase/migrations/080_conversation_analytics.sql`

**Interfaces:**
- Produces: tables `conversation_topics`, `conversation_classifications`, `conversation_report_snapshots`; widened `conversation_insights.insight_type` CHECK.

- [ ] **Step 1: Write the migration**

`conversation_topics` must be created **before** `conversation_classifications` — the latter has an FK to it.

```sql
-- ==================================================
-- Migration 080: Conversation Analytics
-- ==================================================
-- One immutable classification row per chat_session, canonical topic
-- clusters per account, and frozen weekly report snapshots.
-- Replaces the dead migration-028 learner pipeline (see spec §1.3).
-- ==================================================

-- 1. Canonical L2 topic clusters, per account
CREATE TABLE IF NOT EXISTS public.conversation_topics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  aliases       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  session_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (account_id, label)
);

CREATE INDEX idx_conversation_topics_account ON public.conversation_topics(account_id, session_count DESC);
CREATE INDEX idx_conversation_topics_aliases ON public.conversation_topics USING GIN (aliases);

-- 2. One row per classified session
CREATE TABLE IF NOT EXISTS public.conversation_classifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  session_id          UUID NOT NULL UNIQUE REFERENCES public.chat_sessions(id) ON DELETE CASCADE,

  channel             TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  user_message_count  INTEGER NOT NULL DEFAULT 0,

  inquiry_type        TEXT,
  topic_raw           TEXT,
  topic_id            UUID REFERENCES public.conversation_topics(id) ON DELETE SET NULL,

  is_complaint        BOOLEAN NOT NULL DEFAULT FALSE,
  complaint_kind      TEXT,
  sentiment           TEXT,
  urgency             TEXT,
  outcome             TEXT,

  product_id          UUID REFERENCES public.widget_products(id) ON DELETE SET NULL,
  product_mention_raw TEXT,
  product_category    TEXT,

  keywords            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  summary             TEXT,
  confidence          NUMERIC(3,2),

  status              TEXT NOT NULL DEFAULT 'ok',
  error_message       TEXT,
  attempts            INTEGER NOT NULL DEFAULT 1,

  model               TEXT,
  tokens_in           INTEGER,
  tokens_out          INTEGER,
  cost_usd            NUMERIC(10,6),
  classified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT conversation_classifications_status_check
    CHECK (status IN ('ok', 'failed', 'needs_review')),
  CONSTRAINT conversation_classifications_inquiry_type_check
    CHECK (inquiry_type IS NULL OR inquiry_type IN (
      'complaint','order_status','return_refund','product_question',
      'recommendation','pricing_promo','availability','technical','other'))
);

CREATE INDEX idx_conv_class_account_time ON public.conversation_classifications(account_id, started_at DESC);
CREATE INDEX idx_conv_class_account_type ON public.conversation_classifications(account_id, inquiry_type);
CREATE INDEX idx_conv_class_complaints ON public.conversation_classifications(account_id, started_at DESC) WHERE is_complaint;
CREATE INDEX idx_conv_class_product ON public.conversation_classifications(account_id, product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_conv_class_topic ON public.conversation_classifications(account_id, topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX idx_conv_class_keywords ON public.conversation_classifications USING GIN (keywords);
-- Retry sweep: find failed rows still under the attempt cap.
CREATE INDEX idx_conv_class_retry ON public.conversation_classifications(account_id, attempts) WHERE status = 'failed';

-- 3. Frozen weekly issue — guarantees email and page never disagree
CREATE TABLE IF NOT EXISTS public.conversation_report_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, period_start, period_end)
);

CREATE INDEX idx_conv_snapshots_account ON public.conversation_report_snapshots(account_id, period_start DESC);

-- 4. Widen the reused insights enum
ALTER TABLE public.conversation_insights
  DROP CONSTRAINT IF EXISTS conversation_insights_insight_type_check;

ALTER TABLE public.conversation_insights
  ADD CONSTRAINT conversation_insights_insight_type_check
  CHECK (insight_type IN (
    'faq','topic_interest','pain_point','feedback','objection','successful_pitch',
    'language_pattern','sentiment','product_inquiry','coupon_request',
    'rising_topic','complaint_cluster','product_risk','unanswered','channel_shift'
  ));

-- 5. RLS — same shape as migration 028
ALTER TABLE public.conversation_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own topics" ON public.conversation_topics FOR SELECT
  USING (account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));
CREATE POLICY "Owners view own classifications" ON public.conversation_classifications FOR SELECT
  USING (account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));
CREATE POLICY "Owners view own snapshots" ON public.conversation_report_snapshots FOR SELECT
  USING (account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Service role manages topics" ON public.conversation_topics FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role manages classifications" ON public.conversation_classifications FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role manages snapshots" ON public.conversation_report_snapshots FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- No `authenticated` write grants on any of these three tables (security-audit rule).
REVOKE INSERT, UPDATE, DELETE ON public.conversation_topics FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_classifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_report_snapshots FROM authenticated;

COMMENT ON TABLE public.conversation_classifications IS 'One immutable classification per chat_session. UNIQUE(session_id) is the idempotency guarantee.';
COMMENT ON TABLE public.conversation_topics IS 'Canonical L2 topic clusters per account; aliases map raw variants without an LLM call.';
COMMENT ON TABLE public.conversation_report_snapshots IS 'Frozen weekly aggregation so the pushed email and the live page cannot disagree.';
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool with name `080_conversation_analytics`, or paste into the SQL editor.

- [ ] **Step 3: Verify the schema landed**

Run this query and confirm it returns 3 rows:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('conversation_topics','conversation_classifications','conversation_report_snapshots');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/080_conversation_analytics.sql
git commit -m "feat(analytics): schema for conversation classifications, topics and weekly snapshots"
```

---

### Task 2: Taxonomy module

**Files:**
- Create: `src/lib/conversation-analytics/taxonomy.ts`
- Test: `tests/unit/conversation-taxonomy.test.ts`

**Interfaces:**
- Produces:
  - `type InquiryType` (the 9 L1 values)
  - `type ComplaintKind = 'defective' | 'wrong_item' | 'shipping' | 'quality' | 'service' | 'billing'`
  - `type Sentiment = 'negative' | 'neutral' | 'positive'`
  - `type Urgency = 'low' | 'normal' | 'high'`
  - `type Outcome = 'resolved_by_bot' | 'escalated' | 'abandoned' | 'unknown'`
  - `INQUIRY_TYPES: readonly InquiryType[]`
  - `INQUIRY_TYPE_LABEL_HE: Record<InquiryType, string>`
  - `COMPLAINT_KIND_LABEL_HE: Record<ComplaintKind, string>`
  - `coerceInquiryType(v: unknown): InquiryType` — unknown ⇒ `'other'`
  - `coerceComplaintKind(v: unknown): ComplaintKind | null`
  - `coerceSentiment(v: unknown): Sentiment`
  - `coerceUrgency(v: unknown): Urgency`
  - `coerceOutcome(v: unknown): Outcome`
  - `normalizeKeywords(v: unknown): string[]` — trims, drops empties, lowercases ASCII, dedupes, caps at 8

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-taxonomy.test.ts
import { describe, it, expect } from 'vitest';
import {
  INQUIRY_TYPES,
  INQUIRY_TYPE_LABEL_HE,
  coerceInquiryType,
  coerceComplaintKind,
  coerceSentiment,
  coerceUrgency,
  coerceOutcome,
  normalizeKeywords,
} from '@/lib/conversation-analytics/taxonomy';

describe('inquiry type taxonomy', () => {
  it('has exactly the nine agreed values', () => {
    expect([...INQUIRY_TYPES]).toEqual([
      'complaint', 'order_status', 'return_refund', 'product_question',
      'recommendation', 'pricing_promo', 'availability', 'technical', 'other',
    ]);
  });

  it('labels every value in Hebrew', () => {
    for (const t of INQUIRY_TYPES) {
      expect(INQUIRY_TYPE_LABEL_HE[t]).toBeTruthy();
    }
  });

  // The model will occasionally invent a category. It must never reach the DB:
  // the CHECK constraint would reject the row and we would lose the session.
  it('coerces anything outside the enum to other', () => {
    expect(coerceInquiryType('complaint')).toBe('complaint');
    expect(coerceInquiryType('COMPLAINT')).toBe('complaint');
    expect(coerceInquiryType('  order_status ')).toBe('order_status');
    expect(coerceInquiryType('shipping_delay')).toBe('other');
    expect(coerceInquiryType('תלונה')).toBe('other');
    expect(coerceInquiryType(null)).toBe('other');
    expect(coerceInquiryType(undefined)).toBe('other');
    expect(coerceInquiryType(42)).toBe('other');
  });
});

describe('secondary axes', () => {
  it('coerces complaint kind, allowing null', () => {
    expect(coerceComplaintKind('shipping')).toBe('shipping');
    expect(coerceComplaintKind('none')).toBeNull();
    expect(coerceComplaintKind('')).toBeNull();
    expect(coerceComplaintKind('exploded')).toBeNull();
    expect(coerceComplaintKind(null)).toBeNull();
  });

  it('defaults sentiment to neutral and urgency to normal', () => {
    expect(coerceSentiment('negative')).toBe('negative');
    expect(coerceSentiment('furious')).toBe('neutral');
    expect(coerceSentiment(null)).toBe('neutral');
    expect(coerceUrgency('high')).toBe('high');
    expect(coerceUrgency('immediate')).toBe('normal');
  });

  it('defaults outcome to unknown', () => {
    expect(coerceOutcome('escalated')).toBe('escalated');
    expect(coerceOutcome('solved')).toBe('unknown');
    expect(coerceOutcome(undefined)).toBe('unknown');
  });
});

describe('normalizeKeywords', () => {
  it('trims, drops empties and dedupes', () => {
    expect(normalizeKeywords(['  משלוח ', 'משלוח', '', '   ', 'החזר']))
      .toEqual(['משלוח', 'החזר']);
  });

  it('lowercases latin keywords so Shipping and shipping merge', () => {
    expect(normalizeKeywords(['Shipping', 'shipping'])).toEqual(['shipping']);
  });

  it('caps at eight', () => {
    const many = Array.from({ length: 20 }, (_, i) => `k${i}`);
    expect(normalizeKeywords(many)).toHaveLength(8);
  });

  it('returns an empty array for non-arrays', () => {
    expect(normalizeKeywords(null)).toEqual([]);
    expect(normalizeKeywords('משלוח')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-taxonomy.test.ts`
Expected: FAIL — cannot resolve `@/lib/conversation-analytics/taxonomy`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/conversation-analytics/taxonomy.ts
/**
 * The two classification axes.
 *
 * Axis 1 (inquiry type) is a CLOSED list shared by every account — that is what
 * makes week-over-week and account-over-account comparison possible. Axis 2
 * (topic) is free text discovered per account and lives in conversation_topics.
 *
 * "Complaint" is deliberately NOT just an inquiry type: a shipping complaint is
 * both `order_status` and a complaint. It is carried as a separate boolean so
 * neither the complaint breakdown nor the general picture loses it.
 */

export const INQUIRY_TYPES = [
  'complaint',
  'order_status',
  'return_refund',
  'product_question',
  'recommendation',
  'pricing_promo',
  'availability',
  'technical',
  'other',
] as const;

export type InquiryType = (typeof INQUIRY_TYPES)[number];

export const INQUIRY_TYPE_LABEL_HE: Record<InquiryType, string> = {
  complaint: 'תלונה',
  order_status: 'סטטוס הזמנה ומשלוח',
  return_refund: 'החזרה/החלפה/זיכוי',
  product_question: 'שאלה על מוצר',
  recommendation: 'בקשת המלצה והתאמה',
  pricing_promo: 'מחיר/מבצע/קופון',
  availability: 'זמינות ומלאי',
  technical: 'בעיה טכנית ותשלום',
  other: 'אחר',
};

export const COMPLAINT_KINDS = [
  'defective', 'wrong_item', 'shipping', 'quality', 'service', 'billing',
] as const;
export type ComplaintKind = (typeof COMPLAINT_KINDS)[number];

export const COMPLAINT_KIND_LABEL_HE: Record<ComplaintKind, string> = {
  defective: 'מוצר פגום',
  wrong_item: 'מוצר שגוי',
  shipping: 'בעיית משלוח',
  quality: 'איכות מוצר',
  service: 'שירות',
  billing: 'חיוב ותשלום',
};

export const SENTIMENTS = ['negative', 'neutral', 'positive'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const URGENCIES = ['low', 'normal', 'high'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const OUTCOMES = ['resolved_by_bot', 'escalated', 'abandoned', 'unknown'] as const;
export type Outcome = (typeof OUTCOMES)[number];

const MAX_KEYWORDS = 8;

function pick<T extends string>(allowed: readonly T[], v: unknown): T | null {
  if (typeof v !== 'string') return null;
  const k = v.trim().toLowerCase();
  return (allowed as readonly string[]).includes(k) ? (k as T) : null;
}

/** Anything the model invents lands in `other` — the DB CHECK would reject it otherwise. */
export function coerceInquiryType(v: unknown): InquiryType {
  return pick(INQUIRY_TYPES, v) ?? 'other';
}

export function coerceComplaintKind(v: unknown): ComplaintKind | null {
  return pick(COMPLAINT_KINDS, v);
}

export function coerceSentiment(v: unknown): Sentiment {
  return pick(SENTIMENTS, v) ?? 'neutral';
}

export function coerceUrgency(v: unknown): Urgency {
  return pick(URGENCIES, v) ?? 'normal';
}

export function coerceOutcome(v: unknown): Outcome {
  return pick(OUTCOMES, v) ?? 'unknown';
}

/** Latin keywords are lowercased so `Shipping` and `shipping` do not become two slices. */
export function normalizeKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (typeof raw !== 'string') continue;
    const k = raw.trim().replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/conversation-taxonomy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conversation-analytics/taxonomy.ts tests/unit/conversation-taxonomy.test.ts
git commit -m "feat(analytics): conversation taxonomy with strict coercion of model output"
```

---

### Task 3: Product resolver

**Files:**
- Create: `src/lib/conversation-analytics/product-resolver.ts`
- Test: `tests/unit/conversation-product-resolver.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface CatalogProduct { id: string; name: string | null; name_he: string | null; slug: string | null; category: string | null }`
  - `interface ProductIndex { byKey: Map<string, CatalogProduct>; products: CatalogProduct[] }`
  - `buildProductIndex(products: CatalogProduct[]): ProductIndex`
  - `resolveProduct(index: ProductIndex, mention: string | null | undefined): { productId: string | null; category: string | null }`
  - `productCatalogPrompt(index: ProductIndex): string` — the cacheable catalog block

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-product-resolver.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildProductIndex,
  resolveProduct,
  productCatalogPrompt,
  type CatalogProduct,
} from '@/lib/conversation-analytics/product-resolver';

const CATALOG: CatalogProduct[] = [
  { id: 'p1', name: 'Argan Oil Shampoo', name_he: 'שמפו שמן ארגן', slug: 'argan-oil-shampoo', category: 'hair_care' },
  { id: 'p2', name: 'Argan Oil Conditioner', name_he: 'מרכך שמן ארגן', slug: 'argan-oil-conditioner', category: 'hair_care' },
  { id: 'p3', name: 'Panda Face Mask', name_he: 'מסכת פנדה', slug: 'panda-face-mask', category: 'face_care' },
];

describe('resolveProduct', () => {
  const index = buildProductIndex(CATALOG);

  it('matches the Hebrew name exactly', () => {
    expect(resolveProduct(index, 'שמפו שמן ארגן')).toEqual({ productId: 'p1', category: 'hair_care' });
  });

  it('matches the English name case- and space-insensitively', () => {
    expect(resolveProduct(index, '  argan oil CONDITIONER ')).toEqual({ productId: 'p2', category: 'hair_care' });
  });

  it('matches the slug', () => {
    expect(resolveProduct(index, 'panda-face-mask')).toEqual({ productId: 'p3', category: 'face_care' });
  });

  // The brand_logos lesson: a near miss must resolve to nothing, never to a
  // neighbour. A silent wrong SKU is worse than an honest "unidentified".
  it('refuses near misses instead of guessing', () => {
    expect(resolveProduct(index, 'Pandora Face Mask')).toEqual({ productId: null, category: null });
    expect(resolveProduct(index, 'שמפו')).toEqual({ productId: null, category: null });
    expect(resolveProduct(index, 'argan')).toEqual({ productId: null, category: null });
    expect(resolveProduct(index, 'שמפו שמן ארגן 500 מל')).toEqual({ productId: null, category: null });
  });

  it('returns nulls for empty input', () => {
    expect(resolveProduct(index, null)).toEqual({ productId: null, category: null });
    expect(resolveProduct(index, '')).toEqual({ productId: null, category: null });
    expect(resolveProduct(index, '   ')).toEqual({ productId: null, category: null });
  });

  it('never invents an id for an empty catalog', () => {
    expect(resolveProduct(buildProductIndex([]), 'שמפו שמן ארגן'))
      .toEqual({ productId: null, category: null });
  });
});

describe('productCatalogPrompt', () => {
  it('lists every product name for the cacheable prefix', () => {
    const text = productCatalogPrompt(buildProductIndex(CATALOG));
    expect(text).toContain('שמפו שמן ארגן');
    expect(text).toContain('Panda Face Mask');
    expect(text.split('\n').length).toBeGreaterThanOrEqual(3);
  });

  it('is stable across calls so the prompt cache actually hits', () => {
    const a = productCatalogPrompt(buildProductIndex(CATALOG));
    const b = productCatalogPrompt(buildProductIndex([...CATALOG].reverse()));
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-product-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/conversation-analytics/product-resolver.ts
/**
 * Maps a free-text product mention onto a catalog row.
 *
 * Exact-key only: the normalised mention must equal a normalised name, Hebrew
 * name or slug. No fuzzy matching, no embeddings, and the model never picks the
 * SKU itself — it only reports what the customer wrote. This is the brand_logos
 * lesson: fuzzy matching happily mapped Panda onto Pandora, and a silently wrong
 * product attribution is worse for the brand than an honest "unidentified".
 */

export interface CatalogProduct {
  id: string;
  name: string | null;
  name_he: string | null;
  slug: string | null;
  category: string | null;
}

export interface ProductIndex {
  byKey: Map<string, CatalogProduct>;
  products: CatalogProduct[];
}

/** Collapse whitespace, lowercase latin, strip surrounding punctuation. */
function key(s: string): string {
  return s
    .trim()
    .replace(/[\s ]+/g, ' ')
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '')
    .replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
}

export function buildProductIndex(products: CatalogProduct[]): ProductIndex {
  const byKey = new Map<string, CatalogProduct>();
  for (const p of products) {
    for (const candidate of [p.name, p.name_he, p.slug]) {
      if (!candidate) continue;
      const k = key(candidate);
      if (!k) continue;
      // First writer wins: a duplicate key across two SKUs is ambiguous, and
      // guessing between them is exactly what this module refuses to do.
      if (!byKey.has(k)) byKey.set(k, p);
    }
  }
  return { byKey, products };
}

export function resolveProduct(
  index: ProductIndex,
  mention: string | null | undefined
): { productId: string | null; category: string | null } {
  if (typeof mention !== 'string') return { productId: null, category: null };
  const k = key(mention);
  if (!k) return { productId: null, category: null };
  const hit = index.byKey.get(k);
  return hit ? { productId: hit.id, category: hit.category } : { productId: null, category: null };
}

/**
 * The catalog block for the model's system prefix. Sorted so the string is
 * byte-identical between runs — otherwise the prompt cache never hits and the
 * catalog costs 10x more per call.
 */
export function productCatalogPrompt(index: ProductIndex): string {
  const names = new Set<string>();
  for (const p of index.products) {
    const label = p.name_he || p.name || p.slug;
    if (label) names.add(label.trim());
  }
  return [...names].sort().map((n) => `- ${n}`).join('\n');
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/conversation-product-resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conversation-analytics/product-resolver.ts tests/unit/conversation-product-resolver.test.ts
git commit -m "feat(analytics): exact-key product resolver, no fuzzy matching"
```

---

### Task 4: Session classifier

**Files:**
- Create: `src/lib/conversation-analytics/classify.ts`
- Test: `tests/unit/conversation-classify.test.ts`

**Interfaces:**
- Consumes: `taxonomy.ts` coercers; `product-resolver.ts` (`ProductIndex`, `resolveProduct`, `productCatalogPrompt`).
- Produces:
  - `interface SessionForClassification { id: string; accountId: string; channel: string; startedAt: string; messages: Array<{ role: string; content: string }>; intentHints: any[] }`
  - `interface ClassificationRow` — the shape written to `conversation_classifications` (snake_case keys, no `id`)
  - `buildClassifyPrompt(catalogBlock: string): string`
  - `classifySession(session, index, deps): Promise<ClassificationRow>` where `deps = { callModel: (args: { model: string; instructions: string; input: string }) => Promise<{ json: any; usage: { input_tokens: number; cached_input_tokens?: number; output_tokens: number } }> }`
  - `CLASSIFY_MODEL = 'gpt-5.6-luna'`, `RETRY_MODEL = 'gpt-5.6-terra'`, `CONFIDENCE_FLOOR = 0.6`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-classify.test.ts
import { describe, it, expect, vi } from 'vitest';
import { classifySession, CLASSIFY_MODEL, RETRY_MODEL } from '@/lib/conversation-analytics/classify';
import { buildProductIndex, type CatalogProduct } from '@/lib/conversation-analytics/product-resolver';

const CATALOG: CatalogProduct[] = [
  { id: 'p1', name: 'Argan Oil Shampoo', name_he: 'שמפו שמן ארגן', slug: 'argan-oil-shampoo', category: 'hair_care' },
];
const index = buildProductIndex(CATALOG);

const SESSION = {
  id: 's1',
  accountId: 'a1',
  channel: 'web',
  startedAt: '2026-08-20T10:00:00.000Z',
  messages: [
    { role: 'user', content: 'קיבלתי שמפו שמן ארגן פגום, הבקבוק דלף' },
    { role: 'assistant', content: 'מצטערת לשמוע, אעביר לשירות הלקוחות' },
  ],
  intentHints: [],
};

const USAGE = { input_tokens: 1200, cached_input_tokens: 1000, output_tokens: 120 };

function modelReturning(json: any, usage = USAGE) {
  return vi.fn(async () => ({ json, usage }));
}

const GOOD = {
  inquiry_type: 'complaint',
  topic: 'בקבוק שמפו דלף',
  is_complaint: true,
  complaint_kind: 'defective',
  sentiment: 'negative',
  urgency: 'high',
  outcome: 'escalated',
  product_mention: 'שמפו שמן ארגן',
  keywords: ['פגום', 'דליפה'],
  summary: 'לקוחה קיבלה בקבוק שמפו דלוף וביקשה החלפה',
  confidence: 0.93,
};

describe('classifySession', () => {
  it('maps a clean model answer onto a storable row', async () => {
    const callModel = modelReturning(GOOD);
    const row = await classifySession(SESSION, index, { callModel });

    expect(row.session_id).toBe('s1');
    expect(row.account_id).toBe('a1');
    expect(row.channel).toBe('web');
    expect(row.inquiry_type).toBe('complaint');
    expect(row.topic_raw).toBe('בקבוק שמפו דלף');
    expect(row.is_complaint).toBe(true);
    expect(row.complaint_kind).toBe('defective');
    expect(row.product_id).toBe('p1');
    expect(row.product_category).toBe('hair_care');
    expect(row.product_mention_raw).toBe('שמפו שמן ארגן');
    expect(row.keywords).toEqual(['פגום', 'דליפה']);
    expect(row.status).toBe('ok');
    expect(row.user_message_count).toBe(1);
    expect(row.model).toBe(CLASSIFY_MODEL);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it('prices the call using cached input tokens', async () => {
    const row = await classifySession(SESSION, index, { callModel: modelReturning(GOOD) });
    // 200 uncached @ $0.20/M + 1000 cached @ $0.02/M + 120 out @ $1.20/M
    expect(row.cost_usd).toBeCloseTo(0.0002044, 7);
    expect(row.tokens_in).toBe(1200);
    expect(row.tokens_out).toBe(120);
  });

  // A hallucinated category would violate the CHECK constraint and lose the row.
  it('coerces an out-of-enum inquiry type to other', async () => {
    const row = await classifySession(SESSION, index, {
      callModel: modelReturning({ ...GOOD, inquiry_type: 'shipping_delay' }),
    });
    expect(row.inquiry_type).toBe('other');
  });

  it('leaves the product unresolved rather than guessing a neighbour', async () => {
    const row = await classifySession(SESSION, index, {
      callModel: modelReturning({ ...GOOD, product_mention: 'שמפו ארגן' }),
    });
    expect(row.product_id).toBeNull();
    expect(row.product_category).toBeNull();
    expect(row.product_mention_raw).toBe('שמפו ארגן'); // what the customer said is kept
  });

  it('retries once on the stronger model when confidence is below the floor', async () => {
    const callModel = vi.fn()
      .mockResolvedValueOnce({ json: { ...GOOD, confidence: 0.4 }, usage: USAGE })
      .mockResolvedValueOnce({ json: { ...GOOD, confidence: 0.88 }, usage: USAGE });

    const row = await classifySession(SESSION, index, { callModel });

    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0][0].model).toBe(CLASSIFY_MODEL);
    expect(callModel.mock.calls[1][0].model).toBe(RETRY_MODEL);
    expect(row.model).toBe(RETRY_MODEL);
    expect(row.status).toBe('ok');
  });

  it('marks needs_review when even the retry stays unconfident', async () => {
    const callModel = vi.fn(async () => ({ json: { ...GOOD, confidence: 0.3 }, usage: USAGE }));
    const row = await classifySession(SESSION, index, { callModel });
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(row.status).toBe('needs_review');
  });

  it('records a failed row instead of throwing when the model errors', async () => {
    const callModel = vi.fn(async () => { throw new Error('429 rate limited'); });
    const row = await classifySession(SESSION, index, { callModel });
    expect(row.status).toBe('failed');
    expect(row.error_message).toContain('429');
    expect(row.inquiry_type).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-classify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/conversation-analytics/classify.ts
/**
 * Classifies one settled conversation into one immutable row.
 *
 * The model call is injected (`deps.callModel`) so the mapping, coercion,
 * pricing and retry policy are testable without a network.
 */

import { estimateCostUsd } from '@/lib/costs/pricing';
import {
  coerceInquiryType, coerceComplaintKind, coerceSentiment,
  coerceUrgency, coerceOutcome, normalizeKeywords,
  INQUIRY_TYPES, COMPLAINT_KINDS,
} from './taxonomy';
import { resolveProduct, productCatalogPrompt, type ProductIndex } from './product-resolver';

export const CLASSIFY_MODEL = 'gpt-5.6-luna';
export const RETRY_MODEL = 'gpt-5.6-terra';
export const CONFIDENCE_FLOOR = 0.6;

export interface SessionForClassification {
  id: string;
  accountId: string;
  channel: string;
  startedAt: string;
  messages: Array<{ role: string; content: string }>;
  intentHints: any[];
}

export interface ClassificationRow {
  account_id: string;
  session_id: string;
  channel: string;
  started_at: string;
  user_message_count: number;
  inquiry_type: string | null;
  topic_raw: string | null;
  is_complaint: boolean;
  complaint_kind: string | null;
  sentiment: string | null;
  urgency: string | null;
  outcome: string | null;
  product_id: string | null;
  product_mention_raw: string | null;
  product_category: string | null;
  keywords: string[];
  summary: string | null;
  confidence: number | null;
  status: 'ok' | 'failed' | 'needs_review';
  error_message: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
}

export interface ClassifyDeps {
  callModel: (args: { model: string; instructions: string; input: string }) => Promise<{
    json: any;
    usage: { input_tokens: number; cached_input_tokens?: number; output_tokens: number };
  }>;
}

/**
 * The catalog block goes LAST in the instructions but the instructions are
 * otherwise byte-stable, so the whole prefix is cacheable. 128 product names
 * across 2,000 weekly calls is $0.48 uncached versus $0.05 cached.
 */
export function buildClassifyPrompt(catalogBlock: string): string {
  return `אתה מסווג שיחות שירות ומכירה של מותג. קבל תמלול שיחה והחזר סיווג מובנה.

סוגי פנייה מותרים (בחר בדיוק אחד): ${INQUIRY_TYPES.join(', ')}
סוגי תלונה מותרים: ${COMPLAINT_KINDS.join(', ')} או none

כללים:
- is_complaint הוא ציר נפרד מסוג הפנייה. תלונה על משלוח היא order_status וגם is_complaint=true.
- topic הוא ניסוח חופשי קצר בעברית של מה שהלקוח באמת רצה, לא קטגוריה.
- product_mention: העתק את שם המוצר כפי שהלקוח כתב אותו. אל תנחש ואל תתקן. אם לא הוזכר מוצר — החזר מחרוזת ריקה.
- keywords: עד 8 מילות מפתח לחיתוך.
- summary: משפט אחד בעברית.
- confidence: 0 עד 1, כמה אתה בטוח בסיווג.

קטלוג המוצרים של המותג (לזיהוי בלבד — אל תבחר מוצר שלא הוזכר):
${catalogBlock}`;
}

export const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    inquiry_type: { type: 'string', enum: [...INQUIRY_TYPES] },
    topic: { type: 'string' },
    is_complaint: { type: 'boolean' },
    complaint_kind: { type: 'string', enum: [...COMPLAINT_KINDS, 'none'] },
    sentiment: { type: 'string', enum: ['negative', 'neutral', 'positive'] },
    urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
    outcome: { type: 'string', enum: ['resolved_by_bot', 'escalated', 'abandoned', 'unknown'] },
    product_mention: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'inquiry_type', 'topic', 'is_complaint', 'complaint_kind', 'sentiment',
    'urgency', 'outcome', 'product_mention', 'keywords', 'summary', 'confidence',
  ],
  additionalProperties: false,
} as const;

function transcript(session: SessionForClassification): string {
  const lines = session.messages.map((m) => `${m.role === 'user' ? 'לקוח' : 'בוט'}: ${m.content}`);
  const hints = session.intentHints.length
    ? `\n\nרמזים מהמערכת (לא מחייבים): ${JSON.stringify(session.intentHints).slice(0, 500)}`
    : '';
  return lines.join('\n') + hints;
}

function emptyRow(session: SessionForClassification): ClassificationRow {
  return {
    account_id: session.accountId,
    session_id: session.id,
    channel: session.channel,
    started_at: session.startedAt,
    user_message_count: session.messages.filter((m) => m.role === 'user').length,
    inquiry_type: null, topic_raw: null, is_complaint: false, complaint_kind: null,
    sentiment: null, urgency: null, outcome: null,
    product_id: null, product_mention_raw: null, product_category: null,
    keywords: [], summary: null, confidence: null,
    status: 'ok', error_message: null,
    model: null, tokens_in: null, tokens_out: null, cost_usd: null,
  };
}

export async function classifySession(
  session: SessionForClassification,
  index: ProductIndex,
  deps: ClassifyDeps
): Promise<ClassificationRow> {
  const row = emptyRow(session);
  const instructions = buildClassifyPrompt(productCatalogPrompt(index));
  const input = transcript(session);

  let json: any = null;
  let usage = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
  let model = CLASSIFY_MODEL;

  try {
    const first = await deps.callModel({ model: CLASSIFY_MODEL, instructions, input });
    json = first.json;
    usage = { cached_input_tokens: 0, ...first.usage };

    // One retry on the stronger model — at these volumes it costs cents and
    // buys back the tail of ambiguous conversations.
    if (Number(json?.confidence ?? 0) < CONFIDENCE_FLOOR) {
      const second = await deps.callModel({ model: RETRY_MODEL, instructions, input });
      json = second.json;
      usage = { cached_input_tokens: 0, ...second.usage };
      model = RETRY_MODEL;
    }
  } catch (e: any) {
    row.status = 'failed';
    row.error_message = String(e?.message || e).slice(0, 500);
    return row;
  }

  const mention = typeof json?.product_mention === 'string' ? json.product_mention.trim() : '';
  const resolved = resolveProduct(index, mention);
  const confidence = Number(json?.confidence);

  row.inquiry_type = coerceInquiryType(json?.inquiry_type);
  row.topic_raw = typeof json?.topic === 'string' ? json.topic.trim() || null : null;
  row.is_complaint = json?.is_complaint === true;
  row.complaint_kind = coerceComplaintKind(json?.complaint_kind);
  row.sentiment = coerceSentiment(json?.sentiment);
  row.urgency = coerceUrgency(json?.urgency);
  row.outcome = coerceOutcome(json?.outcome);
  row.product_mention_raw = mention || null;
  row.product_id = resolved.productId;
  row.product_category = resolved.category;
  row.keywords = normalizeKeywords(json?.keywords);
  row.summary = typeof json?.summary === 'string' ? json.summary.trim() || null : null;
  row.confidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null;
  row.status = (row.confidence ?? 0) < CONFIDENCE_FLOOR ? 'needs_review' : 'ok';
  row.model = model;
  row.tokens_in = usage.input_tokens ?? 0;
  row.tokens_out = usage.output_tokens ?? 0;
  row.cost_usd = estimateCostUsd({
    model,
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cached_input_tokens,
    outputTokens: usage.output_tokens,
  });

  return row;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/conversation-classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conversation-analytics/classify.ts tests/unit/conversation-classify.test.ts
git commit -m "feat(analytics): per-session classifier with confidence retry and cached-token pricing"
```

---

### Task 5: Stage-1 runner and cron route

**Files:**
- Create: `src/lib/conversation-analytics/openai-call.ts`
- Create: `src/lib/conversation-analytics/run-classification.ts`
- Create: `src/app/api/cron/classify-conversations/route.ts`
- Test: `tests/unit/conversation-run-classification.test.ts`

**Interfaces:**
- Consumes: `classifySession`, `ClassificationRow`, `CLASSIFY_SCHEMA`, `buildProductIndex`.
- Produces:
  - `callClassifyModel(args: { model: string; instructions: string; input: string })` — the real Responses API adapter matching `ClassifyDeps['callModel']`
  - `channelOf(anonId: string | null): 'web' | 'whatsapp' | 'instagram' | 'unknown'`
  - `runClassification(opts: { accountId: string; sinceIso?: string; limit?: number; budgetUsd?: number; deps }): Promise<{ classified: number; skipped: number; failed: number; spentUsd: number; stoppedOnBudget: boolean }>`
  - `DEFAULT_BUDGET_USD = 5`, `SETTLE_MINUTES = 30`, `MAX_ATTEMPTS = 3`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-run-classification.test.ts
import { describe, it, expect, vi } from 'vitest';
import { channelOf, runClassification } from '@/lib/conversation-analytics/run-classification';

describe('channelOf', () => {
  it('reads the channel off the anon id prefix', () => {
    expect(channelOf('wa_972501234567_acc')).toBe('whatsapp');
    expect(channelOf('ig_17841400000000')).toBe('instagram');
    expect(channelOf('aw_wxjdyhrzmt18914r')).toBe('web');
    expect(channelOf('a_lmb12hfy97msx6171l')).toBe('web');
  });

  // 304 of Argania's last-30-day sessions have a null anon_id. They are real
  // conversations, so they must be classified — just not attributed to a channel.
  it('returns unknown rather than guessing for a null anon id', () => {
    expect(channelOf(null)).toBe('unknown');
    expect(channelOf('')).toBe('unknown');
  });
});

function fakeDeps(sessions: any[], opts: { costPerRow?: number } = {}) {
  const inserted: any[] = [];
  return {
    inserted,
    deps: {
      fetchPendingSessions: vi.fn(async () => sessions),
      fetchCatalog: vi.fn(async () => []),
      classify: vi.fn(async (s: any) => ({
        account_id: 'a1', session_id: s.id, channel: 'web',
        started_at: s.startedAt, user_message_count: 1,
        inquiry_type: 'other', topic_raw: 'x', is_complaint: false,
        complaint_kind: null, sentiment: 'neutral', urgency: 'normal',
        outcome: 'unknown', product_id: null, product_mention_raw: null,
        product_category: null, keywords: [], summary: 's', confidence: 0.9,
        status: 'ok' as const, error_message: null, model: 'gpt-5.6-luna',
        tokens_in: 100, tokens_out: 10, cost_usd: opts.costPerRow ?? 0.0002,
      })),
      saveRows: vi.fn(async (rows: any[]) => { inserted.push(...rows); return rows.length; }),
    },
  };
}

const session = (id: string) => ({
  id, accountId: 'a1', channel: 'web', startedAt: '2026-08-20T10:00:00.000Z',
  messages: [{ role: 'user', content: 'שאלה' }], intentHints: [],
});

describe('runClassification', () => {
  it('classifies and saves every pending session', async () => {
    const { deps, inserted } = fakeDeps([session('s1'), session('s2')]);
    const res = await runClassification({ accountId: 'a1', deps });

    expect(res.classified).toBe(2);
    expect(res.failed).toBe(0);
    expect(inserted).toHaveLength(2);
  });

  it('does nothing and issues no model call when nothing is pending', async () => {
    const { deps } = fakeDeps([]);
    const res = await runClassification({ accountId: 'a1', deps });

    expect(res.classified).toBe(0);
    expect(deps.classify).not.toHaveBeenCalled();
    expect(deps.saveRows).not.toHaveBeenCalled();
  });

  // The $205 day was one uncapped chain. Every run carries a ceiling.
  it('stops at the budget ceiling and reports it', async () => {
    const many = Array.from({ length: 50 }, (_, i) => session(`s${i}`));
    const { deps, inserted } = fakeDeps(many, { costPerRow: 1 });
    const res = await runClassification({ accountId: 'a1', budgetUsd: 3, deps });

    expect(res.stoppedOnBudget).toBe(true);
    expect(res.classified).toBeLessThanOrEqual(3);
    expect(inserted.length).toBe(res.classified);
    expect(deps.classify.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('counts failed rows separately but still saves them for retry', async () => {
    const { deps, inserted } = fakeDeps([session('s1'), session('s2')]);
    deps.classify = vi.fn(async (s: any) => ({
      account_id: 'a1', session_id: s.id, channel: 'web',
      started_at: s.startedAt, user_message_count: 1,
      inquiry_type: null, topic_raw: null, is_complaint: false,
      complaint_kind: null, sentiment: null, urgency: null, outcome: null,
      product_id: null, product_mention_raw: null, product_category: null,
      keywords: [], summary: null, confidence: null,
      status: 'failed' as const, error_message: 'boom',
      model: null, tokens_in: null, tokens_out: null, cost_usd: null,
    }));

    const res = await runClassification({ accountId: 'a1', deps });
    expect(res.failed).toBe(2);
    expect(res.classified).toBe(0);
    expect(inserted).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-run-classification.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the OpenAI adapter**

```ts
// src/lib/conversation-analytics/openai-call.ts
/**
 * Responses-API adapter for the classifier.
 *
 * GPT-5.6 rules encoded here so no call site can forget them: no custom
 * `temperature`, `max_output_tokens` (never `max_tokens`), and an explicit
 * `reasoning` block — omitting it is what silently broke the CS lane.
 */

import OpenAI from 'openai';
import { CLASSIFY_SCHEMA } from './classify';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function callClassifyModel(args: {
  model: string;
  instructions: string;
  input: string;
}): Promise<{
  json: any;
  usage: { input_tokens: number; cached_input_tokens?: number; output_tokens: number };
}> {
  const response = await getClient().responses.create({
    model: args.model,
    instructions: args.instructions,
    input: args.input,
    max_output_tokens: 600,
    reasoning: { effort: 'low' },
    text: {
      format: {
        type: 'json_schema',
        name: 'conversation_classification',
        strict: true,
        schema: CLASSIFY_SCHEMA as any,
      },
    },
  });

  const usage = (response as any).usage || {};
  return {
    json: JSON.parse(response.output_text),
    usage: {
      input_tokens: usage.input_tokens || 0,
      cached_input_tokens: usage.input_tokens_details?.cached_tokens || 0,
      output_tokens: usage.output_tokens || 0,
    },
  };
}
```

- [ ] **Step 4: Write the runner**

```ts
// src/lib/conversation-analytics/run-classification.ts
/**
 * Stage 1: classify every settled, unclassified session for one account.
 *
 * Idempotent by construction — the selection query excludes sessions that
 * already have a row, and `conversation_classifications.session_id` is UNIQUE,
 * so a concurrent run collides at the DB rather than double-billing.
 *
 * A retro backfill is this same function with a wider `sinceIso`. There is no
 * separate backfill code path.
 */

import { supabase } from '@/lib/supabase';
import { buildProductIndex, type CatalogProduct } from './product-resolver';
import { classifySession, type ClassificationRow, type SessionForClassification } from './classify';
import { callClassifyModel } from './openai-call';

export const DEFAULT_BUDGET_USD = 5;
export const SETTLE_MINUTES = 30;
export const MAX_ATTEMPTS = 3;

export function channelOf(anonId: string | null | undefined): 'web' | 'whatsapp' | 'instagram' | 'unknown' {
  if (!anonId) return 'unknown';
  if (anonId.startsWith('wa_')) return 'whatsapp';
  if (anonId.startsWith('ig_')) return 'instagram';
  return 'web';
}

export interface RunDeps {
  fetchPendingSessions: (accountId: string, sinceIso: string | undefined, limit: number) => Promise<SessionForClassification[]>;
  fetchCatalog: (accountId: string) => Promise<CatalogProduct[]>;
  classify: (s: SessionForClassification, index: ReturnType<typeof buildProductIndex>) => Promise<ClassificationRow>;
  saveRows: (rows: ClassificationRow[]) => Promise<number>;
}

export async function runClassification(opts: {
  accountId: string;
  sinceIso?: string;
  limit?: number;
  budgetUsd?: number;
  deps?: Partial<RunDeps>;
}): Promise<{ classified: number; skipped: number; failed: number; spentUsd: number; stoppedOnBudget: boolean }> {
  const limit = opts.limit ?? 300;
  const budget = opts.budgetUsd ?? DEFAULT_BUDGET_USD;
  const deps: RunDeps = { ...defaultDeps(), ...(opts.deps || {}) } as RunDeps;

  const sessions = await deps.fetchPendingSessions(opts.accountId, opts.sinceIso, limit);
  if (!sessions.length) {
    return { classified: 0, skipped: 0, failed: 0, spentUsd: 0, stoppedOnBudget: false };
  }

  const index = buildProductIndex(await deps.fetchCatalog(opts.accountId));

  const rows: ClassificationRow[] = [];
  let spentUsd = 0;
  let stoppedOnBudget = false;

  for (const s of sessions) {
    if (spentUsd >= budget) { stoppedOnBudget = true; break; }
    const row = await deps.classify(s, index);
    spentUsd += row.cost_usd || 0;
    rows.push(row);
  }

  if (rows.length) await deps.saveRows(rows);

  const failed = rows.filter((r) => r.status === 'failed').length;
  return {
    classified: rows.length - failed,
    skipped: sessions.length - rows.length,
    failed,
    spentUsd,
    stoppedOnBudget,
  };
}

function defaultDeps(): RunDeps {
  return {
    async fetchPendingSessions(accountId, sinceIso, limit) {
      const settledBefore = new Date(Date.now() - SETTLE_MINUTES * 60_000).toISOString();

      let q = supabase
        .from('chat_sessions')
        .select('id, anon_id, created_at, last_turn_at, chat_messages(role, content, intent, created_at)')
        .eq('account_id', accountId)
        .lt('last_turn_at', settledBefore)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (sinceIso) q = q.gte('created_at', sinceIso);

      const { data, error } = await q;
      if (error) throw new Error(`fetchPendingSessions: ${error.message}`);

      const ids = (data || []).map((s: any) => s.id);
      if (!ids.length) return [];

      // Exclude anything already classified, or failed past the attempt cap.
      const { data: done } = await supabase
        .from('conversation_classifications')
        .select('session_id, status, attempts')
        .in('session_id', ids);

      const blocked = new Set(
        (done || [])
          .filter((d: any) => d.status !== 'failed' || d.attempts >= MAX_ATTEMPTS)
          .map((d: any) => d.session_id)
      );

      return (data || [])
        .filter((s: any) => !blocked.has(s.id))
        .map((s: any) => {
          const msgs = (s.chat_messages || [])
            .slice()
            .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
          return {
            id: s.id,
            accountId,
            channel: channelOf(s.anon_id),
            startedAt: s.created_at,
            messages: msgs.map((m: any) => ({ role: m.role, content: m.content || '' })),
            intentHints: msgs.map((m: any) => m.intent).filter(Boolean),
          } as SessionForClassification;
        })
        .filter((s: SessionForClassification) => s.messages.some((m) => m.role === 'user'));
    },

    async fetchCatalog(accountId) {
      const { data } = await supabase
        .from('widget_products')
        .select('id, name, name_he, slug, category')
        .eq('account_id', accountId);
      return (data || []) as CatalogProduct[];
    },

    classify(s, index) {
      return classifySession(s, index, { callModel: callClassifyModel });
    },

    async saveRows(rows) {
      const { error } = await supabase
        .from('conversation_classifications')
        .upsert(rows, { onConflict: 'session_id' });
      if (error) throw new Error(`saveRows: ${error.message}`);
      return rows.length;
    },
  };
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/unit/conversation-run-classification.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the cron route**

```ts
// src/app/api/cron/classify-conversations/route.ts
/**
 * GET /api/cron/classify-conversations — hourly stage 1.
 *
 * Retro/backfill is the same endpoint with a wider window:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "$HOST/api/cron/classify-conversations?account_id=<uuid>&since=2026-01-01&limit=500&budget=3"
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runClassification } from '@/lib/conversation-analytics/run-classification';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get('authorization') === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get('account_id');
  const since = req.nextUrl.searchParams.get('since') || undefined;
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '300', 10);
  const budget = parseFloat(req.nextUrl.searchParams.get('budget') || '5');

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('status', 'active');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (accounts || []).filter((a: any) => {
    if (accountId && a.id !== accountId) return false;
    if (a.config?.isDemo === true) return false;
    return a.config?.conversation_analytics?.enabled === true;
  });

  const results: any[] = [];
  for (const a of targets) {
    try {
      const r = await runClassification({
        accountId: a.id,
        sinceIso: since,
        limit: Number.isFinite(limit) ? limit : 300,
        budgetUsd: Number.isFinite(budget) ? budget : 5,
      });
      results.push({ accountId: a.id, ...r });
    } catch (e: any) {
      console.error('[classify-conversations]', a.id, e?.message || e);
      results.push({ accountId: a.id, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, accounts: targets.length, results });
}
```

- [ ] **Step 7: Register the cron**

Add to `vercel.json` `crons`:

```json
{ "path": "/api/cron/classify-conversations", "schedule": "10 * * * *" }
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/conversation-analytics/openai-call.ts \
        src/lib/conversation-analytics/run-classification.ts \
        src/app/api/cron/classify-conversations/route.ts \
        tests/unit/conversation-run-classification.test.ts \
        vercel.json
git commit -m "feat(analytics): hourly stage-1 classification runner with budget ceiling"
```

---

### Task 6: Topic clustering

**Files:**
- Create: `src/lib/conversation-analytics/topics.ts`
- Create: `src/app/api/cron/cluster-conversation-topics/route.ts`
- Test: `tests/unit/conversation-topics.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except the DB tables.
- Produces:
  - `matchAlias(topics: Array<{ id: string; label: string; aliases: string[] }>, raw: string): string | null`
  - `clusterTopics(opts: { accountId: string; deps }): Promise<{ matchedByAlias: number; clustered: number; newTopics: number }>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-topics.test.ts
import { describe, it, expect, vi } from 'vitest';
import { matchAlias, clusterTopics } from '@/lib/conversation-analytics/topics';

const TOPICS = [
  { id: 't1', label: 'נשירת שיער', aliases: ['שיער נושר', 'נשירה'] },
  { id: 't2', label: 'בעיית משלוח', aliases: [] },
];

describe('matchAlias', () => {
  it('matches the canonical label', () => {
    expect(matchAlias(TOPICS, 'נשירת שיער')).toBe('t1');
  });

  it('matches a known alias, whitespace-insensitively', () => {
    expect(matchAlias(TOPICS, '  שיער נושר ')).toBe('t1');
  });

  // The whole point of aliases: an already-seen phrasing costs zero tokens.
  it('returns null for an unseen phrasing so it goes to the model', () => {
    expect(matchAlias(TOPICS, 'התקרחות')).toBeNull();
    expect(matchAlias(TOPICS, '')).toBeNull();
  });
});

describe('clusterTopics', () => {
  it('assigns known phrasings without calling the model at all', async () => {
    const callModel = vi.fn();
    const assign = vi.fn(async () => {});
    const res = await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => TOPICS,
        fetchUnassignedRaw: async () => ['נשירת שיער', 'שיער נושר'],
        callModel,
        upsertTopic: vi.fn(async () => 't1'),
        assignTopicToRaw: assign,
      },
    });

    expect(callModel).not.toHaveBeenCalled();
    expect(res.matchedByAlias).toBe(2);
    expect(res.newTopics).toBe(0);
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it('sends only unseen phrasings to the model and records the merge as an alias', async () => {
    const callModel = vi.fn(async () => ({
      assignments: [{ raw: 'התקרחות', label: 'נשירת שיער' }],
    }));
    const upsertTopic = vi.fn(async () => 't1');
    const assign = vi.fn(async () => {});

    const res = await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => TOPICS,
        fetchUnassignedRaw: async () => ['נשירת שיער', 'התקרחות'],
        callModel,
        upsertTopic,
        assignTopicToRaw: assign,
      },
    });

    expect(callModel).toHaveBeenCalledTimes(1);
    expect(callModel.mock.calls[0][0].rawTopics).toEqual(['התקרחות']);
    expect(res.matchedByAlias).toBe(1);
    expect(res.clustered).toBe(1);
    expect(upsertTopic).toHaveBeenCalledWith('a1', 'נשירת שיער', 'התקרחות');
  });

  it('does nothing when there is nothing unassigned', async () => {
    const callModel = vi.fn();
    const res = await clusterTopics({
      accountId: 'a1',
      deps: {
        fetchTopics: async () => TOPICS,
        fetchUnassignedRaw: async () => [],
        callModel,
        upsertTopic: vi.fn(),
        assignTopicToRaw: vi.fn(),
      },
    });
    expect(callModel).not.toHaveBeenCalled();
    expect(res).toEqual({ matchedByAlias: 0, clustered: 0, newTopics: 0 });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-topics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/conversation-analytics/topics.ts
/**
 * Stage 2: fold raw L2 topic strings into canonical per-account clusters.
 *
 * Every merge the model makes is written back as an alias, so the same phrasing
 * next week costs nothing. Only genuinely new phrasings ever reach the model.
 */

import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

const CLUSTER_MODEL = 'gpt-5.6-luna';

export interface TopicRow { id: string; label: string; aliases: string[] }

const norm = (s: string) => s.trim().replace(/[\s ]+/g, ' ');

export function matchAlias(topics: TopicRow[], raw: string): string | null {
  const k = norm(raw || '');
  if (!k) return null;
  for (const t of topics) {
    if (norm(t.label) === k) return t.id;
    if (t.aliases.some((a) => norm(a) === k)) return t.id;
  }
  return null;
}

export interface ClusterDeps {
  fetchTopics: (accountId: string) => Promise<TopicRow[]>;
  fetchUnassignedRaw: (accountId: string) => Promise<string[]>;
  callModel: (args: { existingLabels: string[]; rawTopics: string[] }) => Promise<{
    assignments: Array<{ raw: string; label: string }>;
  }>;
  upsertTopic: (accountId: string, label: string, alias: string | null) => Promise<string>;
  assignTopicToRaw: (accountId: string, raw: string, topicId: string) => Promise<void>;
}

export async function clusterTopics(opts: {
  accountId: string;
  deps?: Partial<ClusterDeps>;
}): Promise<{ matchedByAlias: number; clustered: number; newTopics: number }> {
  const deps: ClusterDeps = { ...defaultDeps(), ...(opts.deps || {}) } as ClusterDeps;
  const { accountId } = opts;

  const raws = await deps.fetchUnassignedRaw(accountId);
  if (!raws.length) return { matchedByAlias: 0, clustered: 0, newTopics: 0 };

  const topics = await deps.fetchTopics(accountId);
  const known = new Set(topics.map((t) => t.label));

  let matchedByAlias = 0;
  const unseen: string[] = [];

  for (const raw of raws) {
    const hit = matchAlias(topics, raw);
    if (hit) {
      await deps.assignTopicToRaw(accountId, raw, hit);
      matchedByAlias++;
    } else {
      unseen.push(raw);
    }
  }

  if (!unseen.length) return { matchedByAlias, clustered: 0, newTopics: 0 };

  const { assignments } = await deps.callModel({
    existingLabels: topics.map((t) => t.label),
    rawTopics: unseen,
  });

  let clustered = 0;
  let newTopics = 0;
  for (const a of assignments || []) {
    if (!a?.raw || !a?.label) continue;
    if (!known.has(a.label)) { known.add(a.label); newTopics++; }
    const topicId = await deps.upsertTopic(accountId, a.label, a.raw === a.label ? null : a.raw);
    await deps.assignTopicToRaw(accountId, a.raw, topicId);
    clustered++;
  }

  return { matchedByAlias, clustered, newTopics };
}

function defaultDeps(): ClusterDeps {
  let client: OpenAI | null = null;
  const openai = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

  return {
    async fetchTopics(accountId) {
      const { data } = await supabase
        .from('conversation_topics')
        .select('id, label, aliases')
        .eq('account_id', accountId);
      return (data || []).map((t: any) => ({ id: t.id, label: t.label, aliases: t.aliases || [] }));
    },

    async fetchUnassignedRaw(accountId) {
      const { data } = await supabase
        .from('conversation_classifications')
        .select('topic_raw')
        .eq('account_id', accountId)
        .is('topic_id', null)
        .not('topic_raw', 'is', null)
        .limit(2000);
      return [...new Set((data || []).map((r: any) => r.topic_raw).filter(Boolean))];
    },

    async callModel({ existingLabels, rawTopics }) {
      const response = await openai().responses.create({
        model: CLUSTER_MODEL,
        instructions: `אתה מאחד נושאי שיחה לקטגוריות קנוניות.
לכל נושא גולמי החזר label: או אחד מהתוויות הקיימות אם המשמעות זהה, או תווית חדשה קצרה בעברית.
אל תמציא איחוד בין נושאים שונים במהותם.

תוויות קיימות:
${existingLabels.map((l) => `- ${l}`).join('\n') || '(אין)'}`,
        input: JSON.stringify({ rawTopics }),
        max_output_tokens: 2000,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'topic_assignments',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                assignments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { raw: { type: 'string' }, label: { type: 'string' } },
                    required: ['raw', 'label'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['assignments'],
              additionalProperties: false,
            },
          },
        },
      });
      return JSON.parse(response.output_text);
    },

    async upsertTopic(accountId, label, alias) {
      const { data: existing } = await supabase
        .from('conversation_topics')
        .select('id, aliases')
        .eq('account_id', accountId)
        .eq('label', label)
        .maybeSingle();

      if (existing) {
        if (alias && !(existing.aliases || []).includes(alias)) {
          await supabase
            .from('conversation_topics')
            .update({ aliases: [...(existing.aliases || []), alias], last_seen_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
        return existing.id;
      }

      const { data, error } = await supabase
        .from('conversation_topics')
        .insert({ account_id: accountId, label, aliases: alias ? [alias] : [] })
        .select('id')
        .single();
      if (error) throw new Error(`upsertTopic: ${error.message}`);
      return data.id;
    },

    async assignTopicToRaw(accountId, raw, topicId) {
      await supabase
        .from('conversation_classifications')
        .update({ topic_id: topicId })
        .eq('account_id', accountId)
        .eq('topic_raw', raw)
        .is('topic_id', null);
    },
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/conversation-topics.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the cron route**

```ts
// src/app/api/cron/cluster-conversation-topics/route.ts
/** GET /api/cron/cluster-conversation-topics — weekly stage 2. */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { clusterTopics } from '@/lib/conversation-analytics/topics';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get('account_id');
  const { data: accounts } = await supabase.from('accounts').select('id, config').eq('status', 'active');

  const targets = (accounts || []).filter((a: any) =>
    (!accountId || a.id === accountId) &&
    a.config?.isDemo !== true &&
    a.config?.conversation_analytics?.enabled === true);

  const results: any[] = [];
  for (const a of targets) {
    try {
      results.push({ accountId: a.id, ...(await clusterTopics({ accountId: a.id })) });
    } catch (e: any) {
      console.error('[cluster-conversation-topics]', a.id, e?.message || e);
      results.push({ accountId: a.id, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
```

Add to `vercel.json` `crons`:

```json
{ "path": "/api/cron/cluster-conversation-topics", "schedule": "30 5 * * 0" }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/conversation-analytics/topics.ts \
        src/app/api/cron/cluster-conversation-topics/route.ts \
        tests/unit/conversation-topics.test.ts vercel.json
git commit -m "feat(analytics): weekly topic clustering with alias short-circuit"
```

---

### Task 7: Aggregation builder

**Files:**
- Create: `src/lib/conversation-analytics/aggregate.ts`
- Test: `tests/unit/conversation-aggregate.test.ts`

**Interfaces:**
- Consumes: `taxonomy.ts` labels.
- Produces:
  - `interface ClassificationLite` — the row fields the aggregator reads
  - `interface ConversationReport` — `{ range, coverage, kpis, inquiryTypes, topics, complaints, products, channels, keywords, deltas }`
  - `buildReport(opts: { current: ClassificationLite[]; previous: ClassificationLite[]; connectedChannels: string[] }): ConversationReport`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-aggregate.test.ts
import { describe, it, expect } from 'vitest';
import { buildReport, type ClassificationLite } from '@/lib/conversation-analytics/aggregate';

const row = (o: Partial<ClassificationLite>): ClassificationLite => ({
  session_id: Math.random().toString(36).slice(2),
  channel: 'web',
  started_at: '2026-08-20T10:00:00.000Z',
  inquiry_type: 'product_question',
  topic_label: 'נושא',
  is_complaint: false,
  complaint_kind: null,
  sentiment: 'neutral',
  outcome: 'resolved_by_bot',
  product_id: null,
  product_name: null,
  product_category: null,
  keywords: [],
  status: 'ok',
  ...o,
});

describe('coverage', () => {
  // 17 of 936 tickets carry a product today. Without this number on screen a
  // partial sample reads as a complete one.
  it('excludes needs_review and failed rows from the classified numerator', () => {
    const r = buildReport({
      current: [row({}), row({ status: 'needs_review' }), row({ status: 'failed' })],
      previous: [],
      connectedChannels: ['web'],
    });
    expect(r.coverage.total).toBe(3);
    expect(r.coverage.classified).toBe(1);
    expect(r.coverage.classifiedPct).toBe(33);
  });

  it('reports product attribution as a share of complaints only', () => {
    const r = buildReport({
      current: [
        row({ is_complaint: true, product_id: 'p1', product_name: 'שמפו' }),
        row({ is_complaint: true, product_id: null }),
        row({ is_complaint: false, product_id: 'p1', product_name: 'שמפו' }),
      ],
      previous: [],
      connectedChannels: ['web'],
    });
    expect(r.coverage.complaintsWithProductPct).toBe(50);
  });

  it('reports zero percent rather than NaN for an empty range', () => {
    const r = buildReport({ current: [], previous: [], connectedChannels: ['web'] });
    expect(r.coverage.classifiedPct).toBe(0);
    expect(r.coverage.complaintsWithProductPct).toBe(0);
  });
});

describe('products', () => {
  // A bestseller accrues complaints by virtue of selling. Sorting by count
  // points the brand at its hit product instead of its faulty one.
  it('ranks by complaint rate, not complaint count', () => {
    const current = [
      ...Array.from({ length: 100 }, () => row({ product_id: 'hit', product_name: 'רב מכר' })),
      ...Array.from({ length: 10 }, () => row({ product_id: 'hit', product_name: 'רב מכר', is_complaint: true })),
      ...Array.from({ length: 4 }, () => row({ product_id: 'bad', product_name: 'בעייתי' })),
      ...Array.from({ length: 6 }, () => row({ product_id: 'bad', product_name: 'בעייתי', is_complaint: true })),
    ];
    const r = buildReport({ current, previous: [], connectedChannels: ['web'] });

    expect(r.products.byComplaintRate[0].productId).toBe('bad');
    expect(r.products.byComplaintRate[0].complaintRate).toBe(60);
    expect(r.products.byComplaintRate[1].productId).toBe('hit');
    // Most-discussed is still available, and there the bestseller leads.
    expect(r.products.byMentions[0].productId).toBe('hit');
  });

  it('ignores unresolved products in the product ranking', () => {
    const r = buildReport({
      current: [row({ product_id: null, product_mention_raw: 'משהו', is_complaint: true } as any)],
      previous: [],
      connectedChannels: ['web'],
    });
    expect(r.products.byComplaintRate).toEqual([]);
  });
});

describe('deltas and channels', () => {
  it('computes topic movement against the previous period', () => {
    const r = buildReport({
      current: [row({ topic_label: 'נשירת שיער' }), row({ topic_label: 'נשירת שיער' }), row({ topic_label: 'משלוח' })],
      previous: [row({ topic_label: 'נשירת שיער' })],
      connectedChannels: ['web'],
    });
    const hair = r.topics.find((t) => t.label === 'נשירת שיער')!;
    expect(hair.count).toBe(2);
    expect(hair.previousCount).toBe(1);
    expect(hair.delta).toBe(1);

    const shipping = r.topics.find((t) => t.label === 'משלוח')!;
    expect(shipping.previousCount).toBe(0);
    expect(shipping.isNew).toBe(true);
  });

  // "0 Instagram inquiries" and "Instagram was never connected" are different
  // facts and must not render the same.
  it('marks an unconnected channel as unconnected, not zero', () => {
    const r = buildReport({
      current: [row({ channel: 'web' })],
      previous: [],
      connectedChannels: ['web', 'whatsapp'],
    });
    const ig = r.channels.find((c) => c.channel === 'instagram')!;
    expect(ig.connected).toBe(false);
    expect(ig.count).toBe(0);

    const wa = r.channels.find((c) => c.channel === 'whatsapp')!;
    expect(wa.connected).toBe(true);
    expect(wa.count).toBe(0);
  });
});

describe('kpis', () => {
  it('counts complaints, escalations and negative sentiment', () => {
    const r = buildReport({
      current: [
        row({ is_complaint: true, sentiment: 'negative', outcome: 'escalated' }),
        row({ outcome: 'resolved_by_bot' }),
      ],
      previous: [],
      connectedChannels: ['web'],
    });
    expect(r.kpis.total).toBe(2);
    expect(r.kpis.complaints).toBe(1);
    expect(r.kpis.escalated).toBe(1);
    expect(r.kpis.resolvedByBot).toBe(1);
    expect(r.kpis.negative).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-aggregate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/conversation-analytics/aggregate.ts
/**
 * Turns classification rows into the payload every surface renders: the page,
 * the xlsx, the frozen snapshot and the weekly email all read this one shape,
 * so they cannot disagree.
 */

import { INQUIRY_TYPE_LABEL_HE, COMPLAINT_KIND_LABEL_HE, type InquiryType } from './taxonomy';

export const ALL_CHANNELS = ['web', 'whatsapp', 'instagram'] as const;

export interface ClassificationLite {
  session_id: string;
  channel: string;
  started_at: string;
  inquiry_type: string | null;
  topic_label: string | null;
  is_complaint: boolean;
  complaint_kind: string | null;
  sentiment: string | null;
  outcome: string | null;
  product_id: string | null;
  product_name: string | null;
  product_category: string | null;
  keywords: string[];
  status: string;
}

export interface ConversationReport {
  coverage: {
    total: number;
    classified: number;
    classifiedPct: number;
    complaints: number;
    complaintsWithProduct: number;
    complaintsWithProductPct: number;
  };
  kpis: {
    total: number; complaints: number; resolvedByBot: number;
    escalated: number; negative: number;
    previous: { total: number; complaints: number; resolvedByBot: number; escalated: number; negative: number };
  };
  inquiryTypes: Array<{ type: string; label: string; count: number; previousCount: number; delta: number }>;
  topics: Array<{ label: string; count: number; previousCount: number; delta: number; isNew: boolean }>;
  complaints: {
    byKind: Array<{ kind: string; label: string; count: number }>;
    byProduct: Array<{ productId: string; productName: string; count: number }>;
    kindByCategory: Array<{ kind: string; category: string; count: number }>;
  };
  products: {
    byMentions: Array<{ productId: string; productName: string; mentions: number; complaints: number; complaintRate: number }>;
    byComplaintRate: Array<{ productId: string; productName: string; mentions: number; complaints: number; complaintRate: number }>;
  };
  channels: Array<{ channel: string; count: number; connected: boolean }>;
  keywords: Array<{ keyword: string; count: number }>;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function tally<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

export function buildReport(opts: {
  current: ClassificationLite[];
  previous: ClassificationLite[];
  connectedChannels: string[];
}): ConversationReport {
  const { current, previous, connectedChannels } = opts;

  const usable = current.filter((r) => r.status === 'ok');
  const complaints = current.filter((r) => r.is_complaint);
  const complaintsWithProduct = complaints.filter((r) => !!r.product_id);

  const kpisFor = (rows: ClassificationLite[]) => ({
    total: rows.length,
    complaints: rows.filter((r) => r.is_complaint).length,
    resolvedByBot: rows.filter((r) => r.outcome === 'resolved_by_bot').length,
    escalated: rows.filter((r) => r.outcome === 'escalated').length,
    negative: rows.filter((r) => r.sentiment === 'negative').length,
  });

  const curTypes = tally(current, (r) => r.inquiry_type);
  const prevTypes = tally(previous, (r) => r.inquiry_type);
  const inquiryTypes = [...curTypes.entries()]
    .map(([type, count]) => ({
      type,
      label: INQUIRY_TYPE_LABEL_HE[type as InquiryType] || type,
      count,
      previousCount: prevTypes.get(type) || 0,
      delta: count - (prevTypes.get(type) || 0),
    }))
    .sort((a, b) => b.count - a.count);

  const curTopics = tally(current, (r) => r.topic_label);
  const prevTopics = tally(previous, (r) => r.topic_label);
  const topics = [...curTopics.entries()]
    .map(([label, count]) => {
      const previousCount = prevTopics.get(label) || 0;
      return { label, count, previousCount, delta: count - previousCount, isNew: previousCount === 0 };
    })
    .sort((a, b) => b.count - a.count);

  // Product stats: mentions and complaints per resolved SKU.
  const perProduct = new Map<string, { productName: string; mentions: number; complaints: number }>();
  for (const r of current) {
    if (!r.product_id) continue;
    const e = perProduct.get(r.product_id) || { productName: r.product_name || r.product_id, mentions: 0, complaints: 0 };
    e.mentions++;
    if (r.is_complaint) e.complaints++;
    perProduct.set(r.product_id, e);
  }
  const productStats = [...perProduct.entries()].map(([productId, e]) => ({
    productId,
    productName: e.productName,
    mentions: e.mentions,
    complaints: e.complaints,
    complaintRate: pct(e.complaints, e.mentions),
  }));

  const kindByCategory = new Map<string, number>();
  for (const r of complaints) {
    if (!r.complaint_kind || !r.product_category) continue;
    const k = `${r.complaint_kind}|${r.product_category}`;
    kindByCategory.set(k, (kindByCategory.get(k) || 0) + 1);
  }

  const kwMap = new Map<string, number>();
  for (const r of current) for (const k of r.keywords || []) kwMap.set(k, (kwMap.get(k) || 0) + 1);

  const channelCounts = tally(current, (r) => r.channel);

  return {
    coverage: {
      total: current.length,
      classified: usable.length,
      classifiedPct: pct(usable.length, current.length),
      complaints: complaints.length,
      complaintsWithProduct: complaintsWithProduct.length,
      complaintsWithProductPct: pct(complaintsWithProduct.length, complaints.length),
    },
    kpis: { ...kpisFor(current), previous: kpisFor(previous) },
    inquiryTypes,
    topics,
    complaints: {
      byKind: [...tally(complaints, (r) => r.complaint_kind).entries()]
        .map(([kind, count]) => ({
          kind,
          label: COMPLAINT_KIND_LABEL_HE[kind as keyof typeof COMPLAINT_KIND_LABEL_HE] || kind,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      byProduct: [...tally(complaintsWithProduct, (r) => r.product_id).entries()]
        .map(([productId, count]) => ({
          productId,
          productName: complaintsWithProduct.find((r) => r.product_id === productId)?.product_name || productId,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      kindByCategory: [...kindByCategory.entries()]
        .map(([k, count]) => {
          const [kind, category] = k.split('|');
          return { kind, category, count };
        })
        .sort((a, b) => b.count - a.count),
    },
    products: {
      byMentions: [...productStats].sort((a, b) => b.mentions - a.mentions),
      // Rate first, mentions as the tie-breaker so a 1-of-1 fluke does not top the list.
      byComplaintRate: [...productStats]
        .filter((p) => p.complaints > 0)
        .sort((a, b) => b.complaintRate - a.complaintRate || b.mentions - a.mentions),
    },
    channels: ALL_CHANNELS.map((channel) => ({
      channel,
      count: channelCounts.get(channel) || 0,
      connected: connectedChannels.includes(channel),
    })),
    keywords: [...kwMap.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40),
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/conversation-aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conversation-analytics/aggregate.ts tests/unit/conversation-aggregate.test.ts
git commit -m "feat(analytics): report aggregation with coverage math and complaint-rate ranking"
```

---

### Task 8: Insights generator

**Files:**
- Create: `src/lib/conversation-analytics/insights.ts`
- Test: `tests/unit/conversation-insights.test.ts`

**Interfaces:**
- Consumes: `ConversationReport` from Task 7.
- Produces:
  - `interface GeneratedInsight { insight_type: string; title: string; content: string; occurrence_count: number; confidence_score: number; examples: any[]; tags: string[] }`
  - `generateInsights(report: ConversationReport, deps: { callModel: (summary: any) => Promise<{ insights: any[] }>; }): Promise<GeneratedInsight[]>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-insights.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateInsights } from '@/lib/conversation-analytics/insights';
import { buildReport } from '@/lib/conversation-analytics/aggregate';

const report = buildReport({
  current: [
    {
      session_id: 's1', channel: 'web', started_at: '2026-08-20T10:00:00Z',
      inquiry_type: 'complaint', topic_label: 'בקבוק דלף', is_complaint: true,
      complaint_kind: 'defective', sentiment: 'negative', outcome: 'escalated',
      product_id: 'p1', product_name: 'שמפו', product_category: 'hair_care',
      keywords: ['דליפה'], status: 'ok',
    },
  ],
  previous: [],
  connectedChannels: ['web'],
});

describe('generateInsights', () => {
  it('keeps insights that carry evidence', async () => {
    const callModel = vi.fn(async () => ({
      insights: [{
        insight_type: 'complaint_cluster',
        title: 'בקבוקים דולפים',
        content: 'לקוחות מדווחים על בקבוקי שמפו דלופים',
        occurrence_count: 1,
        confidence: 0.9,
        evidence: ['שמפו: 1 תלונת פגם'],
      }],
    }));

    const out = await generateInsights(report, { callModel });
    expect(out).toHaveLength(1);
    expect(out[0].insight_type).toBe('complaint_cluster');
    expect(out[0].occurrence_count).toBe(1);
    expect(out[0].examples.length).toBeGreaterThan(0);
  });

  // An insight with no numbers behind it is an opinion. It does not ship.
  it('drops insights with no evidence and no count', async () => {
    const callModel = vi.fn(async () => ({
      insights: [
        { insight_type: 'rising_topic', title: 'תחושה כללית', content: 'נראה שיש מגמה', occurrence_count: 0, confidence: 0.8, evidence: [] },
        { insight_type: 'rising_topic', title: 'ללא ראיה', content: 'משהו', occurrence_count: 5, confidence: 0.8, evidence: [] },
      ],
    }));

    const out = await generateInsights(report, { callModel });
    expect(out).toHaveLength(0);
  });

  it('coerces an unknown insight_type into the allowed set', async () => {
    const callModel = vi.fn(async () => ({
      insights: [{ insight_type: 'vibes', title: 't', content: 'c', occurrence_count: 3, confidence: 0.9, evidence: ['x'] }],
    }));
    const out = await generateInsights(report, { callModel });
    expect(out[0].insight_type).toBe('pain_point');
  });

  it('returns an empty list when the model fails rather than throwing', async () => {
    const callModel = vi.fn(async () => { throw new Error('500'); });
    await expect(generateInsights(report, { callModel })).resolves.toEqual([]);
  });

  it('sends aggregates, never raw conversation text', async () => {
    const callModel = vi.fn(async () => ({ insights: [] }));
    await generateInsights(report, { callModel });
    const payload = JSON.stringify(callModel.mock.calls[0][0]);
    expect(payload).not.toContain('s1');       // no session ids
    expect(payload).toContain('complaint');    // aggregates only
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-insights.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/conversation-analytics/insights.ts
/**
 * Stage 3a: derive a handful of insights from the aggregates.
 *
 * The model sees counts and movements — never raw conversation text. Anything
 * it returns without a number or a piece of evidence behind it is discarded:
 * an insight without evidence is an opinion, and the brand will act on it.
 */

import type { ConversationReport } from './aggregate';

const ALLOWED_TYPES = new Set([
  'rising_topic', 'complaint_cluster', 'product_risk', 'unanswered', 'channel_shift',
  'faq', 'topic_interest', 'pain_point', 'objection', 'sentiment', 'product_inquiry',
]);

export interface GeneratedInsight {
  insight_type: string;
  title: string;
  content: string;
  occurrence_count: number;
  confidence_score: number;
  examples: any[];
  tags: string[];
}

/** The aggregate slice handed to the model — deliberately free of session ids. */
export function insightInput(report: ConversationReport) {
  return {
    kpis: report.kpis,
    inquiryTypes: report.inquiryTypes,
    topTopics: report.topics.slice(0, 20),
    complaintsByKind: report.complaints.byKind,
    productsByComplaintRate: report.products.byComplaintRate.slice(0, 10),
    channels: report.channels,
    topKeywords: report.keywords.slice(0, 20),
  };
}

export async function generateInsights(
  report: ConversationReport,
  deps: { callModel: (summary: ReturnType<typeof insightInput>) => Promise<{ insights: any[] }> }
): Promise<GeneratedInsight[]> {
  let raw: any[] = [];
  try {
    const res = await deps.callModel(insightInput(report));
    raw = Array.isArray(res?.insights) ? res.insights : [];
  } catch (e: any) {
    console.error('[insights] model failed:', e?.message || e);
    return [];
  }

  const out: GeneratedInsight[] = [];
  for (const i of raw) {
    const count = Number(i?.occurrence_count) || 0;
    const evidence = Array.isArray(i?.evidence) ? i.evidence.filter(Boolean) : [];
    if (count <= 0 || evidence.length === 0) continue; // no evidence, no insight
    if (!i?.title || !i?.content) continue;

    const type = ALLOWED_TYPES.has(i.insight_type) ? i.insight_type : 'pain_point';
    const conf = Number(i?.confidence);

    out.push({
      insight_type: type,
      title: String(i.title).slice(0, 200),
      content: String(i.content).slice(0, 2000),
      occurrence_count: count,
      confidence_score: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
      examples: evidence.slice(0, 10),
      tags: Array.isArray(i?.tags) ? i.tags.filter((t: any) => typeof t === 'string').slice(0, 5) : [],
    });
  }
  return out.slice(0, 6);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/conversation-insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conversation-analytics/insights.ts tests/unit/conversation-insights.test.ts
git commit -m "feat(analytics): evidence-gated insight generation from aggregates"
```

---

### Task 9: Shared report builders (xlsx + charts) extracted from daily-support-report

**Files:**
- Create: `src/lib/reports/charts.ts`
- Create: `src/lib/reports/xlsx.ts`
- Modify: `src/app/api/cron/daily-support-report/route.ts` — replace its local chart/sheet helpers with imports
- Test: `tests/unit/reports-xlsx.test.ts`

**Interfaces:**
- Produces:
  - `renderChartPng(config: any, w?: number, h?: number): Promise<Buffer | null>`
  - `pieChartConfig(title: string, labels: string[], data: number[]): any`
  - `barChartConfig(title: string, labels: string[], data: number[], color?: string): any`
  - `lineChartConfig(title: string, labels: string[], data: number[]): any`
  - `addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: Array<Array<string | number>>): ExcelJS.Worksheet` — RTL, bold header, auto widths

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/reports-xlsx.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { addSheet } from '@/lib/reports/xlsx';
import { pieChartConfig, barChartConfig } from '@/lib/reports/charts';

describe('addSheet', () => {
  it('writes a right-to-left sheet with a bold header row', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addSheet(wb, 'סקירה', ['סוג', 'כמות'], [['תלונה', 5], ['משלוח', 3]]);

    expect(ws.views[0].rightToLeft).toBe(true);
    expect(ws.getRow(1).getCell(1).value).toBe('סוג');
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getRow(2).getCell(2).value).toBe(5);
    expect(ws.rowCount).toBe(3);
  });

  it('creates a sheet even with no data rows', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addSheet(wb, 'ריק', ['א'], []);
    expect(ws.rowCount).toBe(1);
  });

  it('truncates a sheet name to the 31-char Excel limit', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addSheet(wb, 'א'.repeat(40), ['א'], []);
    expect(ws.name.length).toBeLessThanOrEqual(31);
  });
});

describe('chart configs', () => {
  it('builds an RTL doughnut config', () => {
    const c = pieChartConfig('פילוח', ['א', 'ב'], [1, 2]);
    expect(c.type).toBe('doughnut');
    expect(c.data.labels).toEqual(['א', 'ב']);
    expect(c.options.legend.rtl).toBe(true);
  });

  it('builds a horizontal bar config that starts at zero', () => {
    const c = barChartConfig('נושאים', ['א'], [3]);
    expect(c.type).toBe('horizontalBar');
    expect(c.options.scales.xAxes[0].ticks.beginAtZero).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/reports-xlsx.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Extract the chart helpers**

Create `src/lib/reports/charts.ts` by moving `renderChartPng`, `pieChartConfig`, `barChartConfig` and `lineChartConfig` verbatim out of `src/app/api/cron/daily-support-report/route.ts` (they are at roughly lines 140–250 of that file) and adding `export` to each. Do not change their behaviour — `daily-support-report` keeps running for the accounts that use it.

- [ ] **Step 4: Write the sheet helper**

```ts
// src/lib/reports/xlsx.ts
/**
 * Shared workbook helpers. Extracted from daily-support-report so the weekly
 * conversation report renders identically without copying 900 lines.
 */

import ExcelJS from 'exceljs';

/** Excel rejects sheet names over 31 characters. */
const MAX_SHEET_NAME = 31;

export function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | null>>
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name.slice(0, MAX_SHEET_NAME), {
    views: [{ rightToLeft: true }],
  });

  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);

  ws.columns.forEach((col, i) => {
    const widest = Math.max(
      String(headers[i] ?? '').length,
      ...rows.map((r) => String(r[i] ?? '').length)
    );
    col.width = Math.min(50, Math.max(12, widest + 2));
  });

  return ws;
}
```

- [ ] **Step 5: Point daily-support-report at the shared helpers**

In `src/app/api/cron/daily-support-report/route.ts`, delete the four local chart functions and add:

```ts
import { renderChartPng, pieChartConfig, barChartConfig, lineChartConfig } from '@/lib/reports/charts';
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run tests/unit/reports-xlsx.test.ts`
Expected: PASS.

Run: `npm run type-check`
Expected: no new errors in `daily-support-report/route.ts` or `src/lib/reports/`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reports/charts.ts src/lib/reports/xlsx.ts \
        src/app/api/cron/daily-support-report/route.ts \
        tests/unit/reports-xlsx.test.ts
git commit -m "refactor(reports): extract shared xlsx and chart helpers from daily-support-report"
```

---

### Task 10: Weekly snapshot, insight persistence and push

**Files:**
- Create: `src/lib/conversation-analytics/weekly.ts`
- Create: `src/app/api/cron/weekly-conversation-report/route.ts`
- Test: `tests/unit/conversation-weekly.test.ts`

**Interfaces:**
- Consumes: `buildReport`, `generateInsights`, `addSheet`.
- Produces:
  - `lastFullWeek(now: Date): { startIso: string; endIso: string; prevStartIso: string; prevEndIso: string }` — Sunday-to-Saturday, Asia/Jerusalem
  - `runWeeklyReport(opts: { accountId: string; now?: Date; deps }): Promise<{ periodStart: string; periodEnd: string; total: number; insights: number; emailed: boolean }>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-weekly.test.ts
import { describe, it, expect, vi } from 'vitest';
import { lastFullWeek, runWeeklyReport } from '@/lib/conversation-analytics/weekly';

describe('lastFullWeek', () => {
  // Sunday 2026-08-23 → the closed week is Sun 16 Aug through Sat 22 Aug.
  it('returns the previous Sunday-to-Saturday window', () => {
    const w = lastFullWeek(new Date('2026-08-23T06:00:00.000Z'));
    expect(w.startIso.slice(0, 10)).toBe('2026-08-16');
    expect(w.endIso.slice(0, 10)).toBe('2026-08-23');
    expect(w.prevStartIso.slice(0, 10)).toBe('2026-08-09');
    expect(w.prevEndIso.slice(0, 10)).toBe('2026-08-16');
  });

  it('gives the comparison window the same length as the reported one', () => {
    const w = lastFullWeek(new Date('2026-08-23T06:00:00.000Z'));
    const len = (a: string, b: string) => Date.parse(b) - Date.parse(a);
    expect(len(w.startIso, w.endIso)).toBe(len(w.prevStartIso, w.prevEndIso));
  });
});

const rows = [{
  session_id: 's1', channel: 'web', started_at: '2026-08-18T10:00:00Z',
  inquiry_type: 'complaint', topic_label: 'דליפה', is_complaint: true,
  complaint_kind: 'defective', sentiment: 'negative', outcome: 'escalated',
  product_id: 'p1', product_name: 'שמפו', product_category: 'hair_care',
  keywords: ['דליפה'], status: 'ok',
}];

function deps(over: any = {}) {
  return {
    fetchRows: vi.fn(async () => rows),
    fetchPreviousRows: vi.fn(async () => []),
    fetchConnectedChannels: vi.fn(async () => ['web']),
    generate: vi.fn(async () => ([{
      insight_type: 'complaint_cluster', title: 't', content: 'c',
      occurrence_count: 1, confidence_score: 0.9, examples: ['x'], tags: [],
    }])),
    saveSnapshot: vi.fn(async () => {}),
    saveInsights: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => true),
    ...over,
  };
}

describe('runWeeklyReport', () => {
  it('freezes a snapshot, persists insights and emails once', async () => {
    const d = deps();
    const res = await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });

    expect(res.total).toBe(1);
    expect(res.insights).toBe(1);
    expect(res.emailed).toBe(true);
    expect(d.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(d.saveInsights).toHaveBeenCalledTimes(1);
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
  });

  // The pushed email must not carry conversation bodies (spec §6.3).
  it('emails aggregates only — no summaries, no session ids', async () => {
    const d = deps();
    await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });
    const payload = JSON.stringify(d.sendEmail.mock.calls[0][0]);
    expect(payload).not.toContain('s1');
  });

  it('writes a snapshot but sends nothing for an empty week', async () => {
    const d = deps({ fetchRows: vi.fn(async () => []) });
    const res = await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });

    expect(res.total).toBe(0);
    expect(res.emailed).toBe(false);
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(d.saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it('still writes the snapshot when insight generation returns nothing', async () => {
    const d = deps({ generate: vi.fn(async () => []) });
    const res = await runWeeklyReport({ accountId: 'a1', now: new Date('2026-08-23T06:00:00Z'), deps: d });
    expect(res.insights).toBe(0);
    expect(d.saveSnapshot).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-weekly.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/conversation-analytics/weekly.ts
/**
 * Stage 3: freeze the closed week, persist its insights, and push it.
 *
 * The snapshot is what makes the email and the page agree — both render the
 * same stored payload rather than each recomputing its own version of "last
 * week".
 */

import { supabase } from '@/lib/supabase';
import { buildReport, type ClassificationLite, type ConversationReport } from './aggregate';
import { generateInsights, type GeneratedInsight } from './insights';
import { sendEmail } from '@/lib/email';
import OpenAI from 'openai';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sunday-to-Saturday, the week that closed before `now`. */
export function lastFullWeek(now: Date): {
  startIso: string; endIso: string; prevStartIso: string; prevEndIso: string;
} {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - end.getUTCDay()); // back to this week's Sunday
  const start = new Date(end.getTime() - 7 * DAY_MS);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    prevStartIso: new Date(start.getTime() - 7 * DAY_MS).toISOString(),
    prevEndIso: start.toISOString(),
  };
}

export interface WeeklyDeps {
  fetchRows: (accountId: string, fromIso: string, toIso: string) => Promise<ClassificationLite[]>;
  fetchPreviousRows: (accountId: string, fromIso: string, toIso: string) => Promise<ClassificationLite[]>;
  fetchConnectedChannels: (accountId: string) => Promise<string[]>;
  generate: (report: ConversationReport) => Promise<GeneratedInsight[]>;
  saveSnapshot: (accountId: string, periodStart: string, periodEnd: string, payload: any) => Promise<void>;
  saveInsights: (accountId: string, insights: GeneratedInsight[]) => Promise<void>;
  sendEmail: (payload: any, accountId: string) => Promise<boolean>;
}

export async function runWeeklyReport(opts: {
  accountId: string;
  now?: Date;
  deps?: Partial<WeeklyDeps>;
}): Promise<{ periodStart: string; periodEnd: string; total: number; insights: number; emailed: boolean }> {
  const now = opts.now ?? new Date();
  const w = lastFullWeek(now);
  const deps: WeeklyDeps = { ...defaultDeps(), ...(opts.deps || {}) } as WeeklyDeps;

  const [current, previous, connected] = await Promise.all([
    deps.fetchRows(opts.accountId, w.startIso, w.endIso),
    deps.fetchPreviousRows(opts.accountId, w.prevStartIso, w.prevEndIso),
    deps.fetchConnectedChannels(opts.accountId),
  ]);

  const report = buildReport({ current, previous, connectedChannels: connected });
  const insights = current.length ? await deps.generate(report) : [];

  const periodStart = w.startIso.slice(0, 10);
  const periodEnd = w.endIso.slice(0, 10);
  const payload = { periodStart, periodEnd, report, insights };

  await deps.saveSnapshot(opts.accountId, periodStart, periodEnd, payload);
  if (insights.length) await deps.saveInsights(opts.accountId, insights);

  // Aggregates only — the pushed email never carries conversation bodies.
  const emailed = current.length
    ? await deps.sendEmail({ periodStart, periodEnd, report, insights }, opts.accountId)
    : false;

  return { periodStart, periodEnd, total: current.length, insights: insights.length, emailed };
}

function defaultDeps(): WeeklyDeps {
  let client: OpenAI | null = null;
  const openai = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

  const selectRows = async (accountId: string, fromIso: string, toIso: string) => {
    const { data } = await supabase
      .from('conversation_classifications')
      .select('session_id, channel, started_at, inquiry_type, topic_raw, is_complaint, complaint_kind, sentiment, outcome, product_id, product_category, keywords, status, conversation_topics(label), widget_products(name_he, name)')
      .eq('account_id', accountId)
      .gte('started_at', fromIso)
      .lt('started_at', toIso);

    return (data || []).map((r: any) => ({
      session_id: r.session_id,
      channel: r.channel,
      started_at: r.started_at,
      inquiry_type: r.inquiry_type,
      topic_label: r.conversation_topics?.label || r.topic_raw || null,
      is_complaint: !!r.is_complaint,
      complaint_kind: r.complaint_kind,
      sentiment: r.sentiment,
      outcome: r.outcome,
      product_id: r.product_id,
      product_name: r.widget_products?.name_he || r.widget_products?.name || null,
      product_category: r.product_category,
      keywords: r.keywords || [],
      status: r.status,
    })) as ClassificationLite[];
  };

  return {
    fetchRows: selectRows,
    fetchPreviousRows: selectRows,

    async fetchConnectedChannels(accountId) {
      const out = ['web'];
      const { data: acc } = await supabase.from('accounts').select('config').eq('id', accountId).single();
      if (acc?.config?.whatsapp_cs?.enabled === true) out.push('whatsapp');
      const { count } = await supabase
        .from('ig_graph_connections')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('is_active', true);
      if ((count || 0) > 0) out.push('instagram');
      return out;
    },

    generate(report) {
      return generateInsights(report, {
        callModel: async (summary) => {
          const response = await openai().responses.create({
            model: 'gpt-5.6-luna',
            instructions: `אתה מנתח דוח שבועי של שיחות לקוחות ומחזיר 3 עד 6 תובנות פעולתיות בעברית.
כל תובנה חייבת להישען על מספר מתוך הנתונים. אם אין מספר — אל תחזיר את התובנה.
evidence: רשימת מחרוזות קצרות עם המספרים עצמם.`,
            input: JSON.stringify(summary),
            max_output_tokens: 2000,
            reasoning: { effort: 'low' },
            text: {
              format: {
                type: 'json_schema',
                name: 'weekly_insights',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    insights: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          insight_type: { type: 'string' },
                          title: { type: 'string' },
                          content: { type: 'string' },
                          occurrence_count: { type: 'number' },
                          confidence: { type: 'number' },
                          evidence: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['insight_type', 'title', 'content', 'occurrence_count', 'confidence', 'evidence'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['insights'],
                  additionalProperties: false,
                },
              },
            },
          });
          return JSON.parse(response.output_text);
        },
      });
    },

    async saveSnapshot(accountId, periodStart, periodEnd, payload) {
      const { error } = await supabase
        .from('conversation_report_snapshots')
        .upsert({ account_id: accountId, period_start: periodStart, period_end: periodEnd, payload },
                { onConflict: 'account_id,period_start,period_end' });
      if (error) throw new Error(`saveSnapshot: ${error.message}`);
    },

    async saveInsights(accountId, insights) {
      await supabase.from('conversation_insights').insert(
        insights.map((i) => ({
          account_id: accountId,
          insight_type: i.insight_type,
          title: i.title,
          content: i.content,
          examples: i.examples,
          occurrence_count: i.occurrence_count,
          confidence_score: i.confidence_score,
          tags: i.tags,
        }))
      );
    },

    async sendEmail(payload, accountId) {
      const { data: acc } = await supabase.from('accounts').select('config').eq('id', accountId).single();
      const to = acc?.config?.conversation_analytics?.report_email
        || acc?.config?.escalation?.recipients?.[0]?.email;
      if (!to) return false;

      const username = acc?.config?.username || '';
      const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/influencer/${username}/analytics/conversations?from=${payload.periodStart}&to=${payload.periodEnd}`;
      const r = payload.report;

      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif">
          <h2>דוח שיחות שבועי · ${payload.periodStart} – ${payload.periodEnd}</h2>
          <p>${r.kpis.total} פניות · ${r.kpis.complaints} תלונות · ${r.kpis.escalated} הוסלמו</p>
          <p>כיסוי: ${r.coverage.classifiedPct}% מהשיחות סווגו · ${r.coverage.complaintsWithProductPct}% מהתלונות שויכו למוצר</p>
          <h3>תובנות</h3>
          <ul>${payload.insights.map((i: any) => `<li><b>${i.title}</b> — ${i.content}</li>`).join('')}</ul>
          <p><a href="${link}">לדוח המלא</a></p>
        </div>`;

      const res = await sendEmail({
        to,
        subject: `דוח שיחות שבועי · ${payload.periodStart} – ${payload.periodEnd}`,
        html,
      });
      return !!res?.success;
    },
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/conversation-weekly.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the cron route**

```ts
// src/app/api/cron/weekly-conversation-report/route.ts
/** GET /api/cron/weekly-conversation-report — Sunday 06:00 UTC, stage 3. */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runWeeklyReport } from '@/lib/conversation-analytics/weekly';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get('account_id');
  const { data: accounts } = await supabase.from('accounts').select('id, config').eq('status', 'active');

  const targets = (accounts || []).filter((a: any) =>
    (!accountId || a.id === accountId) &&
    a.config?.isDemo !== true &&
    a.config?.conversation_analytics?.enabled === true);

  const results: any[] = [];
  for (const a of targets) {
    try {
      results.push({ accountId: a.id, ...(await runWeeklyReport({ accountId: a.id })) });
    } catch (e: any) {
      console.error('[weekly-conversation-report]', a.id, e?.message || e);
      results.push({ accountId: a.id, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
```

Add to `vercel.json` `crons`:

```json
{ "path": "/api/cron/weekly-conversation-report", "schedule": "0 6 * * 0" }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/conversation-analytics/weekly.ts \
        src/app/api/cron/weekly-conversation-report/route.ts \
        tests/unit/conversation-weekly.test.ts vercel.json
git commit -m "feat(analytics): weekly snapshot, insight persistence and aggregate-only email push"
```

---

### Task 11: API routes

**Files:**
- Create: `src/app/api/influencer/[username]/analytics/conversations/route.ts`
- Create: `src/app/api/influencer/[username]/analytics/conversations/sessions/route.ts`
- Create: `src/app/api/influencer/[username]/analytics/conversations/export/route.ts`
- Test: `tests/unit/conversation-analytics-route.test.ts`

**Interfaces:**
- Consumes: `buildReport`, `addSheet`, `barChartConfig`, `renderChartPng`, `checkInfluencerAuth`, `getInfluencerByUsername`.
- Produces: `parseRange(searchParams: URLSearchParams, now: Date): { fromIso: string; toIso: string; prevFromIso: string; prevToIso: string }` exported from the aggregation route for reuse and testing.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/conversation-analytics-route.test.ts
import { describe, it, expect } from 'vitest';
import { parseRange } from '@/app/api/influencer/[username]/analytics/conversations/route';

const NOW = new Date('2026-08-23T12:00:00.000Z');

describe('parseRange', () => {
  it('defaults to the last 30 days', () => {
    const r = parseRange(new URLSearchParams(), NOW);
    expect(r.toIso).toBe(NOW.toISOString());
    expect(r.fromIso.slice(0, 10)).toBe('2026-07-24');
  });

  it('honours an explicit days window', () => {
    const r = parseRange(new URLSearchParams('days=7'), NOW);
    expect(r.fromIso.slice(0, 10)).toBe('2026-08-16');
  });

  it('honours explicit from/to dates', () => {
    const r = parseRange(new URLSearchParams('from=2026-08-01&to=2026-08-08'), NOW);
    expect(r.fromIso.slice(0, 10)).toBe('2026-08-01');
    expect(r.toIso.slice(0, 10)).toBe('2026-08-08');
  });

  // The comparison window must match the reported one or every delta lies.
  it('makes the comparison window the same length as the reported one', () => {
    const r = parseRange(new URLSearchParams('from=2026-08-01&to=2026-08-08'), NOW);
    const len = (a: string, b: string) => Date.parse(b) - Date.parse(a);
    expect(len(r.prevFromIso, r.prevToIso)).toBe(len(r.fromIso, r.toIso));
    expect(r.prevToIso).toBe(r.fromIso);
  });

  it('falls back to 30 days for a nonsense window', () => {
    const r = parseRange(new URLSearchParams('days=abc'), NOW);
    expect(r.fromIso.slice(0, 10)).toBe('2026-07-24');
    const r2 = parseRange(new URLSearchParams('from=2026-08-08&to=2026-08-01'), NOW);
    expect(Date.parse(r2.toIso)).toBeGreaterThan(Date.parse(r2.fromIso));
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/conversation-analytics-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the aggregation route**

```ts
// src/app/api/influencer/[username]/analytics/conversations/route.ts
/**
 * GET /api/influencer/[username]/analytics/conversations
 * Aggregated conversation report for a date range. Same auth shape as the
 * existing analytics/summary route: influencer cookie + ownership.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { supabase } from '@/lib/supabase';
import { buildReport, type ClassificationLite } from '@/lib/conversation-analytics/aggregate';

export const runtime = 'nodejs';

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseRange(sp: URLSearchParams, now: Date): {
  fromIso: string; toIso: string; prevFromIso: string; prevToIso: string;
} {
  const from = sp.get('from');
  const to = sp.get('to');

  let start: Date;
  let end: Date;

  if (from && to && !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to))) {
    start = new Date(from);
    end = new Date(to);
    if (end <= start) end = new Date(start.getTime() + DAY_MS); // never an inverted window
  } else {
    const days = parseInt(sp.get('days') || '30', 10);
    const span = Number.isFinite(days) && days > 0 ? days : 30;
    end = new Date(now);
    start = new Date(now.getTime() - span * DAY_MS);
  }

  const span = end.getTime() - start.getTime();
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    prevFromIso: new Date(start.getTime() - span).toISOString(),
    prevToIso: start.toISOString(),
  };
}

async function fetchRows(accountId: string, fromIso: string, toIso: string, sp: URLSearchParams): Promise<ClassificationLite[]> {
  let q = supabase
    .from('conversation_classifications')
    .select('session_id, channel, started_at, inquiry_type, topic_raw, is_complaint, complaint_kind, sentiment, outcome, product_id, product_category, keywords, status, conversation_topics(label), widget_products(name_he, name)')
    .eq('account_id', accountId)
    .gte('started_at', fromIso)
    .lt('started_at', toIso);

  const channel = sp.get('channel');
  const inquiryType = sp.get('inquiry_type');
  if (channel) q = q.eq('channel', channel);
  if (inquiryType) q = q.eq('inquiry_type', inquiryType);
  if (sp.get('complaints') === '1') q = q.eq('is_complaint', true);

  const { data, error } = await q.limit(20000);
  if (error) throw new Error(error.message);

  return (data || []).map((r: any) => ({
    session_id: r.session_id,
    channel: r.channel,
    started_at: r.started_at,
    inquiry_type: r.inquiry_type,
    topic_label: r.conversation_topics?.label || r.topic_raw || null,
    is_complaint: !!r.is_complaint,
    complaint_kind: r.complaint_kind,
    sentiment: r.sentiment,
    outcome: r.outcome,
    product_id: r.product_id,
    product_name: r.widget_products?.name_he || r.widget_products?.name || null,
    product_category: r.product_category,
    keywords: r.keywords || [],
    status: r.status,
  }));
}

async function connectedChannels(accountId: string): Promise<string[]> {
  const out = ['web'];
  const { data: acc } = await supabase.from('accounts').select('config').eq('id', accountId).single();
  if (acc?.config?.whatsapp_cs?.enabled === true) out.push('whatsapp');
  const { count } = await supabase
    .from('ig_graph_connections')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('is_active', true);
  if ((count || 0) > 0) out.push('instagram');
  return out;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  try {
    const sp = req.nextUrl.searchParams;
    const range = parseRange(sp, new Date());
    const [current, previous, channels] = await Promise.all([
      fetchRows(influencer.id, range.fromIso, range.toIso, sp),
      fetchRows(influencer.id, range.prevFromIso, range.prevToIso, sp),
      connectedChannels(influencer.id),
    ]);

    return NextResponse.json({
      range,
      report: buildReport({ current, previous, connectedChannels: channels }),
    });
  } catch (e: any) {
    console.error('[analytics/conversations]', e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Write the drill-down route**

```ts
// src/app/api/influencer/[username]/analytics/conversations/sessions/route.ts
/**
 * GET …/conversations/sessions — paginated conversation table behind the page.
 * Accepts the same filters as the aggregation route, plus `topic`, `product_id`,
 * `keyword`, `page` and `page_size`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername, supabase } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { parseRange } from '../route';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const range = parseRange(sp, new Date());
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.get('page_size') || '50', 10) || 50));

  let q = supabase
    .from('conversation_classifications')
    .select('session_id, started_at, channel, inquiry_type, topic_raw, is_complaint, complaint_kind, sentiment, outcome, summary, product_category, conversation_topics(label), widget_products(name_he, name)', { count: 'exact' })
    .eq('account_id', influencer.id)
    .gte('started_at', range.fromIso)
    .lt('started_at', range.toIso)
    .order('started_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (sp.get('channel')) q = q.eq('channel', sp.get('channel')!);
  if (sp.get('inquiry_type')) q = q.eq('inquiry_type', sp.get('inquiry_type')!);
  if (sp.get('product_id')) q = q.eq('product_id', sp.get('product_id')!);
  if (sp.get('keyword')) q = q.contains('keywords', [sp.get('keyword')!]);
  if (sp.get('complaints') === '1') q = q.eq('is_complaint', true);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data || [], total: count || 0, page, pageSize });
}
```

- [ ] **Step 5: Write the export route**

```ts
// src/app/api/influencer/[username]/analytics/conversations/export/route.ts
/**
 * GET …/conversations/export?format=xlsx
 *
 * `include_messages=1` adds the per-conversation summary sheet. It is a
 * separate, explicitly-requested flag because that sheet carries customer text
 * (spec §6.3); the automated weekly push never sets it.
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getInfluencerByUsername, supabase } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { addSheet } from '@/lib/reports/xlsx';
import { buildReport, type ClassificationLite } from '@/lib/conversation-analytics/aggregate';
import { parseRange } from '../route';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!(await checkInfluencerAuth(username))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const range = parseRange(sp, new Date());

  const { data } = await supabase
    .from('conversation_classifications')
    .select('session_id, channel, started_at, inquiry_type, topic_raw, is_complaint, complaint_kind, sentiment, outcome, summary, product_id, product_category, keywords, status, conversation_topics(label), widget_products(name_he, name)')
    .eq('account_id', influencer.id)
    .gte('started_at', range.fromIso)
    .lt('started_at', range.toIso)
    .limit(20000);

  const rows: ClassificationLite[] = (data || []).map((r: any) => ({
    session_id: r.session_id, channel: r.channel, started_at: r.started_at,
    inquiry_type: r.inquiry_type,
    topic_label: r.conversation_topics?.label || r.topic_raw || null,
    is_complaint: !!r.is_complaint, complaint_kind: r.complaint_kind,
    sentiment: r.sentiment, outcome: r.outcome, product_id: r.product_id,
    product_name: r.widget_products?.name_he || r.widget_products?.name || null,
    product_category: r.product_category, keywords: r.keywords || [], status: r.status,
  }));

  const report = buildReport({ current: rows, previous: [], connectedChannels: [] });
  const wb = new ExcelJS.Workbook();

  addSheet(wb, 'סקירה', ['מדד', 'ערך'], [
    ['סה"כ פניות', report.kpis.total],
    ['תלונות', report.kpis.complaints],
    ['נפתרו ע"י הבוט', report.kpis.resolvedByBot],
    ['הוסלמו', report.kpis.escalated],
    ['סנטימנט שלילי', report.kpis.negative],
    ['אחוז שיחות שסווגו', report.coverage.classifiedPct],
    ['אחוז תלונות ששויכו למוצר', report.coverage.complaintsWithProductPct],
  ]);

  addSheet(wb, 'סוגי פנייה', ['סוג', 'כמות', 'תקופה קודמת', 'שינוי'],
    report.inquiryTypes.map((t) => [t.label, t.count, t.previousCount, t.delta]));

  addSheet(wb, 'נושאים', ['נושא', 'כמות', 'תקופה קודמת', 'שינוי'],
    report.topics.map((t) => [t.label, t.count, t.previousCount, t.delta]));

  addSheet(wb, 'תלונות לפי סוג', ['סוג תלונה', 'כמות'],
    report.complaints.byKind.map((c) => [c.label, c.count]));

  addSheet(wb, 'תלונה מול קטגוריה', ['סוג תלונה', 'קטגוריה', 'כמות'],
    report.complaints.kindByCategory.map((c) => [c.kind, c.category, c.count]));

  addSheet(wb, 'מוצרים', ['מוצר', 'אזכורים', 'תלונות', 'שיעור תלונה %'],
    report.products.byComplaintRate.map((p) => [p.productName, p.mentions, p.complaints, p.complaintRate]));

  addSheet(wb, 'ערוצים', ['ערוץ', 'כמות', 'מחובר'],
    report.channels.map((c) => [c.channel, c.count, c.connected ? 'כן' : 'לא מחובר']));

  addSheet(wb, 'מילות מפתח', ['מילה', 'כמות'],
    report.keywords.map((k) => [k.keyword, k.count]));

  if (sp.get('include_messages') === '1') {
    addSheet(wb, 'שיחות', ['תאריך', 'ערוץ', 'סוג פנייה', 'נושא', 'תלונה', 'תקציר'],
      (data || []).map((r: any) => [
        r.started_at, r.channel, r.inquiry_type,
        r.conversation_topics?.label || r.topic_raw || '',
        r.is_complaint ? 'כן' : 'לא', r.summary || '',
      ]));
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="conversations-${range.fromIso.slice(0, 10)}-${range.toIso.slice(0, 10)}.xlsx"`,
    },
  });
}
```

- [ ] **Step 6: Run the test and the type check**

Run: `npx vitest run tests/unit/conversation-analytics-route.test.ts`
Expected: PASS.

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/influencer/[username]/analytics/conversations" tests/unit/conversation-analytics-route.test.ts
git commit -m "feat(analytics): conversation report, drill-down and xlsx export routes"
```

---

### Task 12: Page UI and i18n

**Files:**
- Create: `src/lib/i18n/dashboard/conversationAnalytics.ts`
- Modify: `src/lib/i18n/dashboard/index.ts` — import and compose the new section
- Create: `src/app/influencer/[username]/analytics/conversations/page.tsx`
- Modify: `src/app/influencer/[username]/analytics/page.tsx` — add a link to the new page

**Interfaces:**
- Consumes: `GET …/analytics/conversations`, `GET …/analytics/conversations/sessions`, `GET …/analytics/conversations/export`.

- [ ] **Step 1: Write the i18n catalog**

```ts
// src/lib/i18n/dashboard/conversationAnalytics.ts
// Conversation analytics page (weekly retro report).
export const conversationAnalytics = {
  he: {
    pageTitle: 'ניתוח שיחות',
    linkFromAnalytics: 'ניתוח שיחות מפורט',
    coverage: '{total} שיחות בטווח · {classified}% סווגו · {product}% מהתלונות שויכו למוצר',
    kpiTotal: 'סה"כ פניות',
    kpiComplaints: 'תלונות',
    kpiResolved: 'נפתרו ע"י הבוט',
    kpiEscalated: 'הוסלמו',
    kpiNegative: 'סנטימנט שלילי',
    sectionInsights: 'תובנות התקופה',
    insightShowSessions: 'הצג את {n} השיחות',
    sectionWhatTheyTalkedAbout: 'על מה דיברו',
    sectionInquiryTypes: 'סוגי פנייה',
    sectionTopics: 'נושאים מובילים',
    topicNew: 'חדש',
    sectionComplaints: 'תלונות',
    complaintsByKind: 'לפי סוג תלונה',
    complaintsByProduct: 'תלונה מול מוצר',
    complaintsByCategory: 'תלונה מול קטגוריה',
    sectionProducts: 'מוצרים',
    productsByRate: 'לפי שיעור תלונה',
    productsByMentions: 'הכי מדוברים',
    colProduct: 'מוצר',
    colMentions: 'אזכורים',
    colComplaints: 'תלונות',
    colComplaintRate: 'שיעור תלונה',
    sectionChannels: 'ערוצים',
    channelNotConnected: 'לא מחובר',
    sectionKeywords: 'מילות מפתח',
    sectionTable: 'פירוט השיחות',
    colDate: 'תאריך',
    colChannel: 'ערוץ',
    colInquiryType: 'סוג פנייה',
    colTopic: 'נושא',
    colComplaint: 'תלונה',
    colSummary: 'תקציר',
    export: 'ייצוא',
    exportAggregates: 'ייצוא נתונים מצרפיים',
    exportWithMessages: 'ייצוא כולל תוכן שיחות',
    exportWithMessagesWarning: 'הקובץ יכיל תוכן פניות של לקוחות',
    filterAll: 'הכל',
    filterComplaintsOnly: 'תלונות בלבד',
    empty: 'אין נתונים בטווח שנבחר',
    yes: 'כן',
    no: 'לא',
  },
  en: {
    pageTitle: 'Conversation analysis',
    linkFromAnalytics: 'Detailed conversation analysis',
    coverage: '{total} conversations in range · {classified}% classified · {product}% of complaints matched to a product',
    kpiTotal: 'Total inquiries',
    kpiComplaints: 'Complaints',
    kpiResolved: 'Resolved by bot',
    kpiEscalated: 'Escalated',
    kpiNegative: 'Negative sentiment',
    sectionInsights: 'Insights',
    insightShowSessions: 'Show the {n} conversations',
    sectionWhatTheyTalkedAbout: 'What they talked about',
    sectionInquiryTypes: 'Inquiry types',
    sectionTopics: 'Top topics',
    topicNew: 'new',
    sectionComplaints: 'Complaints',
    complaintsByKind: 'By complaint kind',
    complaintsByProduct: 'Complaint by product',
    complaintsByCategory: 'Complaint by category',
    sectionProducts: 'Products',
    productsByRate: 'By complaint rate',
    productsByMentions: 'Most discussed',
    colProduct: 'Product',
    colMentions: 'Mentions',
    colComplaints: 'Complaints',
    colComplaintRate: 'Complaint rate',
    sectionChannels: 'Channels',
    channelNotConnected: 'not connected',
    sectionKeywords: 'Keywords',
    sectionTable: 'Conversation detail',
    colDate: 'Date',
    colChannel: 'Channel',
    colInquiryType: 'Inquiry type',
    colTopic: 'Topic',
    colComplaint: 'Complaint',
    colSummary: 'Summary',
    export: 'Export',
    exportAggregates: 'Export aggregates',
    exportWithMessages: 'Export including conversation content',
    exportWithMessagesWarning: 'This file will contain customer inquiry content',
    filterAll: 'All',
    filterComplaintsOnly: 'Complaints only',
    empty: 'No data in the selected range',
    yes: 'Yes',
    no: 'No',
  },
};
```

- [ ] **Step 2: Compose it into the catalog index**

In `src/lib/i18n/dashboard/index.ts`, add the import next to the existing ones and include `conversationAnalytics` in the composed object exactly the way `analytics` and `conversations` are composed. Follow the file's existing pattern verbatim.

- [ ] **Step 3: Build the page**

Create `src/app/influencer/[username]/analytics/conversations/page.tsx` as a client component following the structure of `src/app/influencer/[username]/analytics/page.tsx` (same shell, same date-range control, same `KpiTile` styling). Sections in this exact order:

1. Coverage line — `t.conversationAnalytics.coverage` with `{total}`, `{classified}`, `{product}` interpolated from `report.coverage`.
2. KPI row — five tiles from `report.kpis`, each showing ▲/▼ against `report.kpis.previous`.
3. Insights — cards from the latest snapshot's `insights`; each card renders `title`, `content`, `occurrence_count`, and a button that sets the table filter.
4. Inquiry types + top topics side by side; a topic with `isNew` gets the `topicNew` badge.
5. Complaints — `byKind`, `byProduct`, `kindByCategory`.
6. Products — default tab `productsByRate` reading `report.products.byComplaintRate`; second tab `productsByMentions`.
7. Channels — `report.channels`; when `connected === false` render `channelNotConnected` **instead of** the count.
8. Keywords — clickable chips that set `keyword` on the table query.
9. Conversation table — fed by the `/sessions` route, honouring every active filter.

Two export buttons: `exportAggregates` → `/export?format=xlsx`, and `exportWithMessages` → `/export?format=xlsx&include_messages=1` behind a confirm dialog showing `exportWithMessagesWarning`.

- [ ] **Step 4: Link it from the analytics page**

In `src/app/influencer/[username]/analytics/page.tsx`, add a link to `./analytics/conversations` labelled `t.conversationAnalytics.linkFromAnalytics`, placed alongside the existing report link.

- [ ] **Step 5: Verify it renders**

Run `npm run dev`, open `/influencer/argania_group/analytics/conversations`, and confirm: the coverage line renders, Instagram shows "לא מחובר" rather than 0, and both export buttons download a file.

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/dashboard/conversationAnalytics.ts src/lib/i18n/dashboard/index.ts \
        "src/app/influencer/[username]/analytics/conversations/page.tsx" \
        "src/app/influencer/[username]/analytics/page.tsx"
git commit -m "feat(analytics): conversation analysis page with insights, complaint zoom-in and export"
```

---

### Task 13: Remove the dead learner pipeline

**Files:**
- Delete: `src/app/api/cron/analyze-conversations/route.ts`
- Delete: `src/lib/chatbot/conversation-learner.ts`
- Modify: `vercel.json` — remove the `/api/cron/analyze-conversations` entry
- Modify: `src/app/api/influencer/chatbot/insights/route.ts` and `src/lib/chatbot/knowledge-retrieval.ts` if they import the learner

- [ ] **Step 1: Find every reference**

```bash
grep -rn "conversation-learner\|analyze-conversations\|ConversationLearner\|analyzeConversations" src scripts vercel.json
```

- [ ] **Step 2: Delete the two dead files and the cron entry**

```bash
git rm src/app/api/cron/analyze-conversations/route.ts src/lib/chatbot/conversation-learner.ts
```

Remove this line from `vercel.json`:

```json
{ "path": "/api/cron/analyze-conversations", "schedule": "0 6 * * *" }
```

- [ ] **Step 3: Fix any remaining importers**

`src/app/api/influencer/chatbot/insights/route.ts` and `src/lib/chatbot/knowledge-retrieval.ts` read `conversation_insights` — the table stays, so they keep working. Only remove imports of the deleted `conversation-learner` module itself. If either file imports it, delete that import and the call site; the insights table is now written by the weekly job.

- [ ] **Step 4: Verify nothing is broken**

Run: `npm run type-check`
Expected: no unresolved imports.

Run: `npx vitest run`
Expected: the full suite is no worse than before this task (record the before/after counts).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(analytics): remove the dead conversation-learner pipeline

The cron selected accounts.instagram_username, a column that does not
exist, so it returned 500 daily; the learner it would have called read
chatbot_conversations_v2/_messages_v2, both empty platform-wide. It never
produced an insight for any account. Replaced by the classification
pipeline in src/lib/conversation-analytics/."
```

---

### Task 14: Enable Argania and run the retro

**Files:**
- Create: `scripts/backfill-conversation-analytics.ts`

**Interfaces:**
- Consumes: the `classify-conversations` and `cluster-conversation-topics` cron endpoints.

- [ ] **Step 1: Turn the flag on for Argania only**

```sql
UPDATE public.accounts
SET config = jsonb_set(
  config,
  '{conversation_analytics}',
  '{"enabled": true, "report_email": "service@argania-oil.com"}'::jsonb,
  true
)
WHERE id = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1';
```

Verify no other account was touched:

```sql
SELECT id, config->'conversation_analytics' FROM public.accounts
WHERE config->'conversation_analytics' IS NOT NULL;
```

Expected: exactly one row.

- [ ] **Step 2: Write the backfill driver**

```ts
// scripts/backfill-conversation-analytics.ts
/**
 * Retro backfill. Stage 1 is idempotent, so this can be re-run safely and
 * stopped at any point.
 *
 *   npx tsx scripts/backfill-conversation-analytics.ts \
 *     --account c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1 --since 2026-01-01 --budget 3
 */

const HOST = process.env.BACKFILL_HOST || 'http://localhost:3000';
const SECRET = process.env.CRON_SECRET;

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  if (!SECRET) throw new Error('CRON_SECRET is required');
  const account = arg('account');
  const since = arg('since', '2026-01-01');
  const budget = arg('budget', '3');
  if (!account) throw new Error('--account is required');

  let spent = 0;
  for (let round = 1; round <= 40; round++) {
    const url = `${HOST}/api/cron/classify-conversations?account_id=${account}&since=${since}&limit=200&budget=${budget}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${SECRET}` } });
    const json: any = await res.json();
    const r = json.results?.[0];
    if (!r) throw new Error(`no result: ${JSON.stringify(json)}`);

    spent += r.spentUsd || 0;
    console.log(`round ${round}: classified=${r.classified} failed=${r.failed} spent=$${spent.toFixed(4)}`);

    if (r.stoppedOnBudget) { console.log('budget ceiling hit — stopping'); break; }
    if ((r.classified || 0) + (r.failed || 0) === 0) { console.log('nothing left'); break; }
  }

  const c = await fetch(`${HOST}/api/cron/cluster-conversation-topics?account_id=${account}`,
    { headers: { Authorization: `Bearer ${SECRET}` } });
  console.log('clustering:', JSON.stringify(await c.json()));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run the retro against Argania**

```bash
BACKFILL_HOST=https://<prod-host> npx tsx scripts/backfill-conversation-analytics.ts \
  --account c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1 --since 2026-01-01 --budget 3
```

Expected: roughly 3,592 sessions classified for about $1.50.

- [ ] **Step 4: Verify the result before showing anyone**

```sql
SELECT status, count(*) FROM public.conversation_classifications
WHERE account_id = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1' GROUP BY 1;

SELECT inquiry_type, count(*) FROM public.conversation_classifications
WHERE account_id = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1' GROUP BY 1 ORDER BY 2 DESC;

SELECT count(*) FILTER (WHERE product_id IS NOT NULL)::float
     / NULLIF(count(*), 0) AS product_match_rate
FROM public.conversation_classifications
WHERE account_id = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1' AND is_complaint;
```

Then **hand-check about 20 classifications against the real conversations.** This is the acceptance gate: if the inquiry types or complaint flags are wrong, the taxonomy or the prompt needs work before Argania sees the page. Do not skip it — every number on that page inherits this pass's accuracy.

- [ ] **Step 5: Replay past weeks so week-over-week works on day one**

```bash
for d in 2026-07-05 2026-07-12 2026-07-19 2026-07-26 2026-08-02 2026-08-09 2026-08-16 2026-08-23; do
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
    "https://<prod-host>/api/cron/weekly-conversation-report?account_id=c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1&as_of=$d" | head -c 200
  echo
done
```

Note: this needs `weekly-conversation-report` to accept an `as_of` parameter passed through to `runWeeklyReport({ now })`. Add it in Task 10's route if it is not already there — it is two lines:

```ts
const asOf = req.nextUrl.searchParams.get('as_of');
const now = asOf && !Number.isNaN(Date.parse(asOf)) ? new Date(asOf) : undefined;
// …then pass `now` into runWeeklyReport({ accountId: a.id, now })
```

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-conversation-analytics.ts
git commit -m "feat(analytics): retro backfill driver, enabled for Argania"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §3 taxonomy (both axes, flags) | Task 2 |
| §4.1–4.3 tables, §4.5 RLS | Task 1 |
| §4.4 widened insight_type | Task 1 |
| §5.1 stage 1, caching, code-side product match, 5.6 params, budget | Tasks 3, 4, 5 |
| §5.2 stage 2 clustering | Task 6 |
| §5.3 stage 3 snapshot/insights/push | Tasks 7, 8, 10 |
| §5.4 retro | Tasks 5 (`since` param), 14 |
| §5.5 removal of dead pipeline | Task 13 |
| §6.1 page order, coverage bar, complaint-rate sort, "not connected" | Tasks 7, 12 |
| §6.2 API routes | Task 11 |
| §6.3 export + PII split | Tasks 9, 11, 12 |
| §7 rollout flag, Argania first | Tasks 5, 6, 10, 14 |
| §8 testing | Tasks 2–8, 11 unit tests; Task 14 step 4 manual acceptance |

**Known gap, deliberately left:** the spec's PDF export (§6.3) reuses the existing print template and is not given its own task — the xlsx path is the one the weekly push depends on. Add the print view after the page ships if Argania asks for PDF specifically.
