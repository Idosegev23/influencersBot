# Bestie in the Dashboard — Implementation Plan (Surface B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An assistant inside the brand's dashboard that answers where-to-click questions, tells them what changed in their account this week, shows them the questions their bot failed to answer, and flags what is silently misconfigured — without writing anything.

**Architecture:** The widget posts to an authenticated route. The server resolves the account **from the session**, builds a tool context, and runs the existing `runBestieTurn` brain with a read-only dashboard tool set. No tool accepts an account selector, so cross-account reads cannot be expressed at all.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Supabase, OpenAI, Vitest, Tailwind.

**Spec:** [docs/superpowers/specs/2026-07-26-bestie-dashboard-widget-design.md](../specs/2026-07-26-bestie-dashboard-widget-design.md)
**Depends on:** Phase 1 (knowledge base, `listCustomerScreens`, `findDeadRoutes`) and Phase 2 (`runBestieTurn`) — both shipped.

## Global Constraints

- **Account scoping is structural (spec §4.1).** Every tool is scoped by an `accountId` taken from the authenticated session and injected into the tool context by the server. **No tool definition may expose `accountId`, `username`, `account`, or any other account selector in its JSON-Schema parameters.** A system-prompt instruction is explicitly *not* an acceptable substitute — Bestie will be summarising text the brand's own customers wrote, which is the injection vector. Task 9 asserts this programmatically.
- **Zero writes.** No tool in this surface mutates any table. Not knowledge, not settings, not content. Asserted in Task 9, not maintained by discipline.
- **The boundary (spec §4):** the product's **surface** plus **this one account's own data**. Never another account's data, never the engine (code, database, architecture).
- **Bestie never states a price** (parent spec §6.2) — carried over unchanged.
- **Every emitted route must resolve** against the real route tree via `findDeadRoutes` before it reaches a customer.
- **Path alias:** `@/*` → `./src/*`.
- **Scripts need Node 22** (`nvm use 22`); integration checks are scripts, not vitest tests (`tests/setup.ts` stubs `global.fetch`).
- **Commits:** straight to `main`, stage only the files the task touched.

---

### Task 1: Dashboard tool context, resolved from the session

The foundation of §4.1. Everything downstream reads `accountId` from here and nowhere else.

**Files:**
- Create: `src/lib/bestie/dashboard/context.ts`
- Test: `tests/unit/bestie-dashboard-context.test.ts`

**Interfaces:**
- Produces:
  - `export interface DashboardCtx { accountId: string; username: string; currentRoute: string | null; language: string }`
  - `export function normalizeCurrentRoute(raw: string | null | undefined): string | null` — maps a browser path to a route-tree route, or null.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeCurrentRoute } from '@/lib/bestie/dashboard/context';

describe('normalizeCurrentRoute', () => {
  it('maps a real dashboard path to its route-tree form', () => {
    expect(normalizeCurrentRoute('/influencer/argania/chatbot-settings'))
      .toBe('/influencer/[username]/chatbot-settings');
    expect(normalizeCurrentRoute('/influencer/studiopasha_fashion/analytics'))
      .toBe('/influencer/[username]/analytics');
  });

  it('handles the account root', () => {
    expect(normalizeCurrentRoute('/influencer/argania')).toBe('/influencer/[username]');
  });

  it('keeps nested segments', () => {
    expect(normalizeCurrentRoute('/influencer/argania/documents/upload'))
      .toBe('/influencer/[username]/documents/upload');
  });

  it('strips query strings and trailing slashes', () => {
    expect(normalizeCurrentRoute('/influencer/argania/analytics?tab=x'))
      .toBe('/influencer/[username]/analytics');
    expect(normalizeCurrentRoute('/influencer/argania/analytics/'))
      .toBe('/influencer/[username]/analytics');
  });

  it('leaves non-dashboard paths alone by returning null', () => {
    expect(normalizeCurrentRoute('/admin/accounts')).toBeNull();
    expect(normalizeCurrentRoute('/')).toBeNull();
    expect(normalizeCurrentRoute(null)).toBeNull();
    expect(normalizeCurrentRoute('')).toBeNull();
  });

  it('does not mistake /influencer/insights for an account route', () => {
    // /influencer/insights is a real screen, not a username.
    expect(normalizeCurrentRoute('/influencer/insights')).toBe('/influencer/insights');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-context.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/dashboard/context`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Who is asking, and where are they standing.
 *
 * accountId is resolved server-side from the authenticated session and lives
 * only here. No tool takes it as an argument (spec §4.1) — the model has no way
 * to name an account, so it has no way to read one it should not see.
 *
 * currentRoute is what makes this feel unlike documentation: "the switch is on
 * this screen, second tab" instead of "go to bot settings".
 */

export interface DashboardCtx {
  accountId: string;
  username: string;
  currentRoute: string | null;
  language: string;
}

/** /influencer/insights is a screen, not someone's username. */
const NON_ACCOUNT_SEGMENTS = new Set(['insights']);

export function normalizeCurrentRoute(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const path = String(raw).split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);

  if (parts[0] !== 'influencer' || parts.length < 2) return null;
  if (NON_ACCOUNT_SEGMENTS.has(parts[1])) return `/influencer/${parts[1]}`;

  const rest = parts.slice(2);
  return ['/influencer/[username]', ...rest].join('/');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-context.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/dashboard/context.ts tests/unit/bestie-dashboard-context.test.ts
git commit -m "feat(bestie): dashboard tool context resolved from the session"
```

---

### Task 2: Account pulse — what changed this week

Spec §5.2. Pure aggregation over rows the caller supplies, so the *shape* of the narration is testable without a database.

**Files:**
- Create: `src/lib/bestie/dashboard/pulse.ts`
- Test: `tests/unit/bestie-dashboard-pulse.test.ts`

**Interfaces:**
- Produces:
  - `export interface PulseInput { conversations: Array<{ created_at: string }>; tickets: Array<{ created_at: string; source: string | null; escalation_reason: string | null }>; now: Date }`
  - `export interface Pulse { thisWeek: { conversations: number; tickets: number }; lastWeek: { conversations: number; tickets: number }; conversationDeltaPct: number | null; deflectionPct: number | null; topEscalationReasons: Array<{ reason: string; count: number }> }`
  - `export function buildPulse(input: PulseInput): Pulse`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildPulse } from '@/lib/bestie/dashboard/pulse';

const now = new Date('2026-07-26T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

describe('buildPulse', () => {
  it('counts this week against last week', () => {
    const pulse = buildPulse({
      conversations: [
        { created_at: daysAgo(1) }, { created_at: daysAgo(3) }, { created_at: daysAgo(6) },
        { created_at: daysAgo(9) }, { created_at: daysAgo(12) },
      ],
      tickets: [],
      now,
    });
    expect(pulse.thisWeek.conversations).toBe(3);
    expect(pulse.lastWeek.conversations).toBe(2);
    expect(pulse.conversationDeltaPct).toBe(50);
  });

  it('reports deflection as the share of conversations with no ticket', () => {
    const pulse = buildPulse({
      conversations: Array.from({ length: 10 }, () => ({ created_at: daysAgo(2) })),
      tickets: Array.from({ length: 2 }, () => ({ created_at: daysAgo(2), source: 'widget_support', escalation_reason: null })),
      now,
    });
    expect(pulse.deflectionPct).toBe(80);
  });

  it('ranks escalation reasons', () => {
    const pulse = buildPulse({
      conversations: [{ created_at: daysAgo(1) }],
      tickets: [
        { created_at: daysAgo(1), source: 'auto_escalation', escalation_reason: 'shipping' },
        { created_at: daysAgo(2), source: 'auto_escalation', escalation_reason: 'shipping' },
        { created_at: daysAgo(2), source: 'auto_escalation', escalation_reason: 'returns' },
      ],
      now,
    });
    expect(pulse.topEscalationReasons[0]).toEqual({ reason: 'shipping', count: 2 });
  });

  it('returns null deltas rather than a fake 0% when there is no baseline', () => {
    // A brand live for three days has no "last week". Saying 0% would be a lie.
    const pulse = buildPulse({ conversations: [{ created_at: daysAgo(1) }], tickets: [], now });
    expect(pulse.conversationDeltaPct).toBeNull();
  });

  it('returns null deflection rather than 100% when there were no conversations', () => {
    const pulse = buildPulse({ conversations: [], tickets: [], now });
    expect(pulse.deflectionPct).toBeNull();
  });

  it('ignores tickets with no recorded reason instead of inventing one', () => {
    const pulse = buildPulse({
      conversations: [{ created_at: daysAgo(1) }],
      tickets: [{ created_at: daysAgo(1), source: 'widget_support', escalation_reason: null }],
      now,
    });
    expect(pulse.topEscalationReasons).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-pulse.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/dashboard/pulse`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * What changed in this account, in the two or three facts a person would have
 * noticed if they had looked.
 *
 * Pure: rows in, summary out. Nulls are load-bearing — a brand live for three
 * days has no "last week", and reporting 0% change would be a fabrication
 * dressed as a measurement. Every consumer must render null as "not enough
 * history", never as zero.
 */
const WEEK_MS = 7 * 86400_000;

export interface PulseInput {
  conversations: Array<{ created_at: string }>;
  tickets: Array<{ created_at: string; source: string | null; escalation_reason: string | null }>;
  now: Date;
}

export interface Pulse {
  thisWeek: { conversations: number; tickets: number };
  lastWeek: { conversations: number; tickets: number };
  conversationDeltaPct: number | null;
  deflectionPct: number | null;
  topEscalationReasons: Array<{ reason: string; count: number }>;
}

function inWindow(iso: string, now: Date, fromDaysAgo: number, toDaysAgo: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= fromDaysAgo && age < toDaysAgo;
}

export function buildPulse(input: PulseInput): Pulse {
  const { conversations, tickets, now } = input;

  const thisWeekConvos = conversations.filter(c => inWindow(c.created_at, now, 0, WEEK_MS)).length;
  const lastWeekConvos = conversations.filter(c => inWindow(c.created_at, now, WEEK_MS, 2 * WEEK_MS)).length;
  const thisWeekTickets = tickets.filter(t => inWindow(t.created_at, now, 0, WEEK_MS)).length;
  const lastWeekTickets = tickets.filter(t => inWindow(t.created_at, now, WEEK_MS, 2 * WEEK_MS)).length;

  const reasonCounts = new Map<string, number>();
  for (const ticket of tickets) {
    const reason = ticket.escalation_reason?.trim();
    if (!reason) continue; // no reason recorded — do not guess one
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  return {
    thisWeek: { conversations: thisWeekConvos, tickets: thisWeekTickets },
    lastWeek: { conversations: lastWeekConvos, tickets: lastWeekTickets },
    conversationDeltaPct: lastWeekConvos > 0
      ? Math.round(((thisWeekConvos - lastWeekConvos) / lastWeekConvos) * 100)
      : null,
    deflectionPct: thisWeekConvos > 0
      ? Math.round(((thisWeekConvos - thisWeekTickets) / thisWeekConvos) * 100)
      : null,
    topEscalationReasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-pulse.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/dashboard/pulse.ts tests/unit/bestie-dashboard-pulse.test.ts
git commit -m "feat(bestie): account pulse — this week against last, nulls where there is no baseline"
```

---

### Task 3: Knowledge gaps — what the bot could not answer

Spec §5.3. The capability with the highest ceiling, because Bestie is the only party who knows where she failed.

`support_requests.escalation_reason` now exists (added by the value-proof work), which is what makes grouping possible.

**Files:**
- Create: `src/lib/bestie/dashboard/gaps.ts`
- Test: `tests/unit/bestie-dashboard-gaps.test.ts`

**Interfaces:**
- Produces:
  - `export interface GapSource { escalation_reason: string | null; source: string | null; message: string | null; created_at: string }`
  - `export interface KnowledgeGap { topic: string; count: number; examples: string[] }`
  - `export function groupKnowledgeGaps(rows: GapSource[], maxExamples?: number): KnowledgeGap[]`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { groupKnowledgeGaps } from '@/lib/bestie/dashboard/gaps';

const row = (over: Partial<any> = {}) => ({
  escalation_reason: 'shipping',
  source: 'auto_escalation',
  message: 'מתי מגיע המשלוח שלי?',
  created_at: '2026-07-20T10:00:00Z',
  ...over,
});

describe('groupKnowledgeGaps', () => {
  it('groups failures by reason, most common first', () => {
    const gaps = groupKnowledgeGaps([
      row(), row(), row({ escalation_reason: 'returns', message: 'איך מחזירים?' }),
    ]);
    expect(gaps[0]).toMatchObject({ topic: 'shipping', count: 2 });
    expect(gaps[1]).toMatchObject({ topic: 'returns', count: 1 });
  });

  it('carries real customer wording as examples', () => {
    const gaps = groupKnowledgeGaps([row({ message: 'מתי זה מגיע?' })]);
    expect(gaps[0].examples).toContain('מתי זה מגיע?');
  });

  it('caps examples so one loud topic cannot flood the answer', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ message: `שאלה ${i}` }));
    expect(groupKnowledgeGaps(rows, 3)[0].examples).toHaveLength(3);
  });

  it('drops rows with no recorded reason instead of bucketing them as "unknown"', () => {
    // A fake bucket would read as a real, actionable gap. It is not one.
    expect(groupKnowledgeGaps([row({ escalation_reason: null })])).toEqual([]);
  });

  it('ignores empty and whitespace messages as examples', () => {
    const gaps = groupKnowledgeGaps([row({ message: '   ' }), row({ message: 'שאלה אמיתית' })]);
    expect(gaps[0].examples).toEqual(['שאלה אמיתית']);
  });

  it('returns nothing for no input rather than a placeholder gap', () => {
    expect(groupKnowledgeGaps([])).toEqual([]);
  });

  it('does not deduplicate distinct customers asking the same thing', () => {
    // Ten people asking the same question is the signal, not noise.
    const gaps = groupKnowledgeGaps(Array.from({ length: 10 }, () => row()));
    expect(gaps[0].count).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-gaps.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/dashboard/gaps`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * The questions this account's bot could not answer, grouped so they can be
 * fixed one topic at a time instead of one ticket at a time.
 *
 * Only rows with a recorded escalation_reason count. A row without one is not a
 * gap we understand, and bucketing it as "unknown" would put a fake, unfixable
 * item at the top of a list whose entire value is that every item is actionable.
 */

export interface GapSource {
  escalation_reason: string | null;
  source: string | null;
  message: string | null;
  created_at: string;
}

export interface KnowledgeGap {
  topic: string;
  count: number;
  examples: string[];
}

export function groupKnowledgeGaps(rows: GapSource[], maxExamples = 5): KnowledgeGap[] {
  const byTopic = new Map<string, { count: number; examples: string[] }>();

  for (const row of rows) {
    const topic = row.escalation_reason?.trim();
    if (!topic) continue;

    const entry = byTopic.get(topic) ?? { count: 0, examples: [] };
    entry.count++;

    const message = row.message?.trim();
    if (message && entry.examples.length < maxExamples) entry.examples.push(message);

    byTopic.set(topic, entry);
  }

  return [...byTopic.entries()]
    .map(([topic, e]) => ({ topic, count: e.count, examples: e.examples }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-gaps.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/dashboard/gaps.ts tests/unit/bestie-dashboard-gaps.test.ts
git commit -m "feat(bestie): group the questions the bot failed to answer, by topic"
```

---

### Task 4: Health check — what is silently wrong

Spec §5.4. Needs no history, only current state, so it is useful on an account's first day.

**Files:**
- Create: `src/lib/bestie/dashboard/health.ts`
- Test: `tests/unit/bestie-dashboard-health.test.ts`

**Interfaces:**
- Produces:
  - `export interface HealthInput { coupons: Array<{ code: string; end_date: string | null; is_active: boolean }>; productCount: number; instagramConnected: boolean; openTickets: Array<{ created_at: string }>; now: Date }`
  - `export interface HealthFinding { kind: string; severity: 'warn' | 'info'; detail: string; route: string | null }`
  - `export function runHealthCheck(input: HealthInput): HealthFinding[]`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { runHealthCheck } from '@/lib/bestie/dashboard/health';

const now = new Date('2026-07-26T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();
const base = { coupons: [], productCount: 5, instagramConnected: true, openTickets: [], now };

describe('runHealthCheck', () => {
  it('flags an expired coupon that is still active', () => {
    const findings = runHealthCheck({
      ...base,
      coupons: [{ code: 'SUMMER20', end_date: daysAgo(10), is_active: true }],
    });
    expect(findings.some(f => f.kind === 'expired_coupon_active')).toBe(true);
    expect(findings.find(f => f.kind === 'expired_coupon_active')!.detail).toContain('SUMMER20');
  });

  it('does not flag an expired coupon that was already switched off', () => {
    const findings = runHealthCheck({
      ...base,
      coupons: [{ code: 'OLD', end_date: daysAgo(10), is_active: false }],
    });
    expect(findings.some(f => f.kind === 'expired_coupon_active')).toBe(false);
  });

  it('does not flag a coupon with no end date', () => {
    const findings = runHealthCheck({
      ...base,
      coupons: [{ code: 'FOREVER', end_date: null, is_active: true }],
    });
    expect(findings.some(f => f.kind === 'expired_coupon_active')).toBe(false);
  });

  it('flags a disconnected Instagram and an empty catalog', () => {
    const findings = runHealthCheck({ ...base, instagramConnected: false, productCount: 0 });
    const kinds = findings.map(f => f.kind);
    expect(kinds).toContain('instagram_disconnected');
    expect(kinds).toContain('empty_catalog');
  });

  it('flags tickets left waiting more than two days', () => {
    const findings = runHealthCheck({
      ...base,
      openTickets: [{ created_at: daysAgo(3) }, { created_at: daysAgo(4) }, { created_at: daysAgo(1) }],
    });
    const stale = findings.find(f => f.kind === 'stale_tickets');
    expect(stale).toBeDefined();
    expect(stale!.detail).toContain('2'); // two of the three
  });

  it('points every finding at a real screen', () => {
    const findings = runHealthCheck({
      ...base, instagramConnected: false, productCount: 0,
      coupons: [{ code: 'X', end_date: daysAgo(1), is_active: true }],
      openTickets: [{ created_at: daysAgo(5) }],
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.route).toMatch(/^\/influencer\/\[username\]/);
  });

  it('says nothing when the account is healthy', () => {
    expect(runHealthCheck(base)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-health.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/dashboard/health`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Things that are silently wrong.
 *
 * Every finding carries the route that fixes it, because a finding without a
 * destination is a complaint. Routes are validated against the real route tree
 * by the tool layer before any of this reaches a customer.
 *
 * An empty result is a real answer — "nothing is wrong" is worth saying.
 */

export interface HealthInput {
  coupons: Array<{ code: string; end_date: string | null; is_active: boolean }>;
  productCount: number;
  instagramConnected: boolean;
  openTickets: Array<{ created_at: string }>;
  now: Date;
}

export interface HealthFinding {
  kind: string;
  severity: 'warn' | 'info';
  detail: string;
  route: string | null;
}

const STALE_TICKET_MS = 2 * 86400_000;

export function runHealthCheck(input: HealthInput): HealthFinding[] {
  const findings: HealthFinding[] = [];

  const expired = input.coupons.filter(c => {
    if (!c.is_active || !c.end_date) return false;
    const end = Date.parse(c.end_date);
    return !Number.isNaN(end) && end < input.now.getTime();
  });
  if (expired.length) {
    findings.push({
      kind: 'expired_coupon_active',
      severity: 'warn',
      detail: `${expired.length} קופונים פגי תוקף עדיין פעילים: ${expired.map(c => c.code).join(', ')}`,
      route: '/influencer/[username]/coupons',
    });
  }

  if (!input.instagramConnected) {
    findings.push({
      kind: 'instagram_disconnected',
      severity: 'warn',
      detail: 'חשבון האינסטגרם לא מחובר — הבוט לא עונה על הודעות DM',
      route: '/influencer/[username]/instagram',
    });
  }

  if (input.productCount === 0) {
    findings.push({
      kind: 'empty_catalog',
      severity: 'warn',
      detail: 'אין מוצרים בקטלוג — הבוט לא ימליץ על כלום',
      route: '/influencer/[username]/products',
    });
  }

  const stale = input.openTickets.filter(t => {
    const created = Date.parse(t.created_at);
    return !Number.isNaN(created) && input.now.getTime() - created > STALE_TICKET_MS;
  });
  if (stale.length) {
    findings.push({
      kind: 'stale_tickets',
      severity: 'warn',
      detail: `${stale.length} פניות פתוחות מעל יומיים`,
      route: '/influencer/[username]/support',
    });
  }

  return findings;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-health.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/dashboard/health.ts tests/unit/bestie-dashboard-health.test.ts
git commit -m "feat(bestie): health check — expired coupons, disconnected IG, empty catalog, stale tickets"
```

---

### Task 5: Validated screen routing

Spec §5.1 and acceptance §8.2. A link to a screen that no longer exists is worse than no link.

**Files:**
- Create: `src/lib/bestie/dashboard/routing.ts`
- Test: `tests/unit/bestie-dashboard-routing.test.ts`

**Interfaces:**
- Consumes: `listCustomerScreens`, `findDeadRoutes` from `@/lib/bestie/screen-inventory` (Phase 1).
- Produces:
  - `export interface ScreenLink { route: string; href: string; isCurrentScreen: boolean }`
  - `export function buildScreenLink(route: string, username: string, currentRoute: string | null, knownRoutes: string[]): ScreenLink | null` — null when the route does not exist.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildScreenLink } from '@/lib/bestie/dashboard/routing';
import { listCustomerScreens } from '@/lib/bestie/screen-inventory';

const known = [
  '/influencer/[username]/chatbot-settings',
  '/influencer/[username]/coupons',
];

describe('buildScreenLink', () => {
  it('turns a route into a real href for this account', () => {
    const link = buildScreenLink('/influencer/[username]/coupons', 'argania', null, known);
    expect(link!.href).toBe('/influencer/argania/coupons');
  });

  it('knows when the customer is already on that screen', () => {
    const link = buildScreenLink(
      '/influencer/[username]/coupons', 'argania', '/influencer/[username]/coupons', known
    );
    expect(link!.isCurrentScreen).toBe(true);
  });

  it('refuses a route that does not exist', () => {
    // Sending someone to a deleted screen is worse than not linking at all.
    expect(buildScreenLink('/influencer/[username]/deleted', 'argania', null, known)).toBeNull();
  });

  it('refuses anything outside the dashboard', () => {
    expect(buildScreenLink('/admin/accounts', 'argania', null, known)).toBeNull();
    expect(buildScreenLink('https://evil.example.com', 'argania', null, known)).toBeNull();
  });

  it('validates against the real route tree, not a hand-written list', () => {
    const real = listCustomerScreens().map(s => s.route);
    expect(buildScreenLink('/influencer/[username]/chatbot-settings', 'argania', null, real)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-routing.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/dashboard/routing`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Turn a route from the knowledge base into a link this account can click.
 *
 * Returns null rather than a broken link. Bestie's whole support value is "go
 * here and press this" — a confident pointer to a screen that was deleted two
 * months ago costs more trust than saying nothing.
 */
export interface ScreenLink {
  route: string;
  href: string;
  isCurrentScreen: boolean;
}

export function buildScreenLink(
  route: string,
  username: string,
  currentRoute: string | null,
  knownRoutes: string[]
): ScreenLink | null {
  if (!route.startsWith('/influencer/')) return null;
  if (!knownRoutes.includes(route)) return null;

  return {
    route,
    href: route.replace('[username]', username),
    isCurrentScreen: currentRoute === route,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-routing.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/dashboard/routing.ts tests/unit/bestie-dashboard-routing.test.ts
git commit -m "feat(bestie): screen links validated against the real route tree"
```

---

### Task 6: The dashboard tool set

Where §4.1 becomes real. Five tools, all read-only, none of which can name an account.

**Files:**
- Create: `src/lib/bestie/dashboard/tools.ts`
- Test: `tests/unit/bestie-dashboard-tools.test.ts`

**Interfaces:**
- Consumes: `DashboardCtx` (Task 1), `buildPulse` (2), `groupKnowledgeGaps` (3), `runHealthCheck` (4), `buildScreenLink` (5), `BESTIE_TOOL_DEFS[0]` (the knowledge search from Phase 2).
- Produces:
  - `export const DASHBOARD_TOOL_DEFS: OpenAIFunctionDef[]` — `search_bestie_knowledge`, `route_to_screen`, `read_account_pulse`, `find_knowledge_gaps`, `run_health_check`
  - `export function getDashboardTools(): Array<{ def: OpenAIFunctionDef; handler(args: any, ctx: DashboardCtx): Promise<{ ok: boolean; data?: unknown }> }>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { DASHBOARD_TOOL_DEFS, getDashboardTools } from '@/lib/bestie/dashboard/tools';

// Spec §4.1 — the model must have no way to *express* "read another account".
const ACCOUNT_SELECTORS = ['accountid', 'account_id', 'account', 'username', 'user', 'brand', 'tenant'];

describe('dashboard tool definitions', () => {
  it('exposes exactly the five read-only tools', () => {
    expect(DASHBOARD_TOOL_DEFS.map(d => d.function.name).sort()).toEqual([
      'find_knowledge_gaps', 'read_account_pulse', 'route_to_screen',
      'run_health_check', 'search_bestie_knowledge',
    ]);
  });

  it('NO tool accepts an account selector as a parameter', () => {
    for (const def of DASHBOARD_TOOL_DEFS) {
      const params = Object.keys((def.function.parameters as any)?.properties ?? {});
      for (const p of params) {
        expect(
          ACCOUNT_SELECTORS.includes(p.toLowerCase()),
          `${def.function.name} exposes "${p}" — the model could then name another account`
        ).toBe(false);
      }
    }
  });

  it('has a handler for every definition and no orphan handlers', () => {
    const defNames = DASHBOARD_TOOL_DEFS.map(d => d.function.name).sort();
    const toolNames = getDashboardTools().map(t => t.def.function.name).sort();
    expect(toolNames).toEqual(defNames);
  });

  it('names no mutating verb in any tool', () => {
    // Spec: this surface has no write path at all.
    const forbidden = /(^|_)(create|update|delete|write|set|add|remove|save|send|pause|toggle)(_|$)/;
    for (const def of DASHBOARD_TOOL_DEFS) {
      expect(forbidden.test(def.function.name), `${def.function.name} looks mutating`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-tools.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/dashboard/tools`.

- [ ] **Step 3: Write minimal implementation**

Write `src/lib/bestie/dashboard/tools.ts` with the five definitions. Parameters are limited to:
`search_bestie_knowledge` → `{ query: string }`; `route_to_screen` → `{ route: string }`;
the other three take **no parameters at all** (`{ type: 'object', properties: {} }`).

Each handler reads `ctx.accountId` and queries with `.eq('account_id', ctx.accountId)`. Open the file
with this note:

```typescript
/**
 * Five read-only tools. None of them takes an account.
 *
 * ctx.accountId comes from the authenticated session and is injected by the
 * route. It is deliberately absent from every parameter schema: Bestie will be
 * summarising text this brand's own customers wrote, so a prompt instruction
 * not to read other accounts is instruction to an attacker's audience. An
 * absent parameter cannot be filled in.
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-tools.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/dashboard/tools.ts tests/unit/bestie-dashboard-tools.test.ts
git commit -m "feat(bestie): five read-only dashboard tools, none able to name an account"
```

---

### Task 7: The dashboard brain

**Files:**
- Create: `src/lib/bestie/dashboard/dashboard-agent.ts`
- Test: `tests/unit/bestie-dashboard-agent.test.ts`

**Interfaces:**
- Consumes: `runBestieTurn`'s loop shape (`src/lib/bestie/bestie-agent.ts`), `DASHBOARD_TOOL_DEFS`, `DashboardCtx`.
- Produces:
  - `export const DASHBOARD_SYSTEM_PROMPT: string`
  - `export async function runDashboardTurn(input: { ctx: DashboardCtx; message: string; history?: Array<{ role: string; content: string }> }, deps?: Partial<DashboardAgentDeps>): Promise<{ reply: string }>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runDashboardTurn, DASHBOARD_SYSTEM_PROMPT } from '@/lib/bestie/dashboard/dashboard-agent';

const ctx = {
  accountId: 'A1', username: 'argania',
  currentRoute: '/influencer/[username]/chatbot-settings', language: 'he',
};

describe('runDashboardTurn', () => {
  it('calls a tool and answers from the result', async () => {
    const turns = [
      { toolCalls: [{ id: 't1', name: 'run_health_check', args: {} }], text: null },
      { toolCalls: [], text: 'יש לך 3 קופונים פגי תוקף.' },
    ];
    let i = 0;
    const result = await runDashboardTurn(
      { ctx, message: 'מה לא בסדר אצלי?' },
      { callModel: async () => turns[i++] as any, runTool: async () => ({ ok: true, data: {} }) }
    );
    expect(result.reply).toContain('קופונים');
  });

  it('tells the model which screen the customer is on', async () => {
    const callModel = vi.fn(async () => ({ toolCalls: [], text: 'ok' }));
    await runDashboardTurn({ ctx, message: 'איפה המתג?' }, { callModel, runTool: async () => ({ ok: true }) });
    const system = (callModel.mock.calls[0] as any)[0].system;
    expect(system).toContain('chatbot-settings');
  });

  it('stops instead of looping forever', async () => {
    const callModel = vi.fn(async () => ({ toolCalls: [{ id: 't', name: 'run_health_check', args: {} }], text: null }));
    await runDashboardTurn({ ctx, message: 'x' }, { callModel, runTool: async () => ({ ok: true }) });
    expect(callModel.mock.calls.length).toBeLessThanOrEqual(5);
  });
});

describe('the dashboard system prompt', () => {
  it('allows this account and forbids others', () => {
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('החשבון הזה');
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('חשבונות אחרים');
  });

  it('still forbids prices and still refuses to act', () => {
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('מחיר');
    expect(DASHBOARD_SYSTEM_PROMPT).toContain('לא משנה');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-agent.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/dashboard/dashboard-agent`.

- [ ] **Step 3: Write minimal implementation**

Mirror the loop in `src/lib/bestie/bestie-agent.ts` (injected `callModel`/`runTool`, `MAX_ITERS = 5`).
The system prompt is built per turn so it can name the current screen, and must contain verbatim:

```
את בסטי, בתוך הדשבורד של המותג. מולך לקוח מזוהה שמשלם על המוצר.

מה את יודעת: איך בסטי עובדת ומה יש בכל מסך, ועוד הדאטה של החשבון הזה בלבד —
השיחות שלו, הפניות שלו, ההגדרות שלו.

מה את לא יודעת: חשבונות אחרים ומה קורה אצלם, ואיך המערכת בנויה מבפנים.

את לא משנה כלום. לא הגדרות, לא ידע, לא תוכן. את מראה בדיוק מה לעשות, נותנת את
הניסוח המלא, ומפנה למסך ולשדה — והוא מבצע.

מחירים: לעולם אל תנקבי במחיר.

כשאת מפנה למסך — תמיד דרך route_to_screen, אף פעם לא מהזיכרון. אם הוא כבר על
המסך הזה, תגידי לו את זה במקום לשלוח אותו לטיול.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-agent.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/dashboard/dashboard-agent.ts tests/unit/bestie-dashboard-agent.test.ts
git commit -m "feat(bestie): dashboard brain — knows the account and the current screen, changes nothing"
```

---

### Task 8: The authenticated route

**Files:**
- Create: `src/app/api/bestie/dashboard/route.ts`
- Test: `tests/unit/bestie-dashboard-route.test.ts`

**Interfaces:**
- Consumes: `requireInfluencerAuth` from `@/lib/auth/influencer-auth`, `normalizeCurrentRoute` (Task 1), `runDashboardTurn` (Task 7).
- Produces: `POST /api/bestie/dashboard` accepting `{ username, message, currentPath }` and returning `{ reply }`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ authorized: true as const, username: 'argania', influencer: { id: 'A1', language: 'he' } })),
  turn: vi.fn(async () => ({ reply: 'שלום' })),
}));

vi.mock('@/lib/auth/influencer-auth', () => ({ requireInfluencerAuth: h.auth }));
vi.mock('@/lib/bestie/dashboard/dashboard-agent', () => ({ runDashboardTurn: h.turn }));

import { POST } from '@/app/api/bestie/dashboard/route';

const post = (body: any) =>
  POST(new Request('https://x/api/bestie/dashboard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as any);

describe('POST /api/bestie/dashboard', () => {
  it('answers an authenticated request', async () => {
    const res = await post({ username: 'argania', message: 'איפה המתג?', currentPath: '/influencer/argania/chatbot-settings' });
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('שלום');
  });

  it('takes the account from the session, never from the body', async () => {
    h.turn.mockClear();
    await post({ username: 'argania', message: 'x', accountId: 'SOMEONE-ELSE', account_id: 'SOMEONE-ELSE' });
    const ctx = (h.turn.mock.calls[0] as any)[0].ctx;
    expect(ctx.accountId).toBe('A1');          // from the session
    expect(ctx.accountId).not.toBe('SOMEONE-ELSE');
  });

  it('rejects an unauthenticated caller', async () => {
    h.auth.mockResolvedValueOnce({
      authorized: false as const, username: 'argania', influencer: null,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any);
    expect((await post({ username: 'argania', message: 'x' })).status).toBe(401);
  });

  it('rejects an empty message', async () => {
    expect((await post({ username: 'argania', message: '   ' })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-route.test.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Write minimal implementation**

The route reads `username` from the body only to pass to `requireInfluencerAuth` (which validates the
cookie against it). **`accountId` is taken from the returned `influencer`, and any `accountId` in the
body is ignored** — add a comment saying so, since the next reader will wonder why it is not read.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-route.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bestie/dashboard/route.ts tests/unit/bestie-dashboard-route.test.ts
git commit -m "feat(bestie): authenticated dashboard endpoint, account taken only from the session"
```

---

### Task 9: The isolation and no-write gate

Spec §8.1 and §8.3. This task exists to fail loudly if anyone later adds a write tool or an account
parameter.

**Files:**
- Create: `scripts/bestie-dashboard-verify.ts`
- Modify: `package.json`

A script, not a vitest test — it queries two real accounts.

- [ ] **Step 1: Write the script**

It must:

1. Pick two real accounts with data (e.g. Argania and Studio Pasha).
2. Run each dashboard tool handler with account A's context and assert **no returned row belongs to
   account B** — by id, by conversation, by ticket.
3. Assert every tool definition's parameter schema contains no account selector.
4. Snapshot row counts for a set of tables before and after a full run, and assert **nothing
   changed** — the no-write property, measured rather than promised.
5. Exit non-zero on any failure.

- [ ] **Step 2: Add the npm script**

```json
    "bestie:dashboard-verify": "npx tsx scripts/bestie-dashboard-verify.ts",
```

- [ ] **Step 3: Run it**

Run: `npm run bestie:dashboard-verify`
Expected: all checks pass; the row-count snapshot is identical before and after.

- [ ] **Step 4: Commit**

```bash
git add scripts/bestie-dashboard-verify.ts package.json
git commit -m "test(bestie): cross-account isolation and no-write verification"
```

---

### Task 10: The widget

**Files:**
- Create: `src/components/bestie/DashboardAssistant.tsx`
- Modify: the dashboard layout that wraps `/influencer/[username]/*`

**Interfaces:**
- Consumes: `POST /api/bestie/dashboard` (Task 8).

- [ ] **Step 1: Build the component**

A launcher button fixed bottom-left (bottom-right is taken by the customer-facing widget on brand
sites — do not collide), opening a panel with the conversation. It sends `window.location.pathname`
as `currentPath` on every turn, so moving between screens changes the answers without a reload.

Four starter chips, one per capability, so the first use is not a blank box:
**"מה קרה השבוע?"** · **"על מה הבוט לא ידע לענות?"** · **"יש משהו לא תקין?"** · **"איך משנים…"**

Render a link in the reply when the server returns one. When `isCurrentScreen` is true, say so
instead of linking — sending someone to the page they are on reads as not listening.

- [ ] **Step 2: Mount it**

Wrap it so it appears on every `/influencer/[username]/*` screen and nowhere else. It must not
render on `/admin/*` or on public chat pages.

- [ ] **Step 3: Verify by hand**

Run `npm run dev`, log into a brand dashboard, and check:
1. It appears on the dashboard and **not** on an admin page.
2. Each of the four chips returns something real.
3. Asking about another brand by name is refused.
4. Asking a price gets no number.
5. Standing on chatbot-settings and asking "where do I turn the bot off" gets "you are on that
   screen" rather than a link back to it.

- [ ] **Step 4: Commit**

```bash
git add src/components/bestie/DashboardAssistant.tsx src/app/influencer
git commit -m "feat(bestie): dashboard assistant widget"
```

---

### Task 11: Escalation destination

Spec §9 — the one decision left open. **Default chosen here; confirm with Ido before shipping.**

**Files:**
- Modify: `src/lib/bestie/dashboard/tools.ts` (add `open_bestie_support_ticket`)
- Test: `tests/unit/bestie-dashboard-escalation.test.ts`

**Default:** a support ticket on **Bestie's own account** (`config.username = 'bestie'`), not on the
brand's account and not to the five sales recipients. A stuck paying customer is not a lead, and the
brand's own ticket queue is for *their* customers. Bestie now has a real account with a working
support screen, so brands become Bestie's own support queue — which is what they are.

This is the **one exception** to zero-writes, and it is deliberately narrow: it creates a support
request and nothing else. It touches no account setting, no knowledge, no content.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildBestieSupportTicket } from '@/lib/bestie/dashboard/tools';

describe('buildBestieSupportTicket', () => {
  it('files against the bestie account, not the brand', () => {
    const t = buildBestieSupportTicket({
      bestieAccountId: 'BESTIE', brandUsername: 'argania',
      brandAccountId: 'ARGANIA', message: 'הבוט לא עונה',
    });
    expect(t.account_id).toBe('BESTIE');
    expect(t.account_id).not.toBe('ARGANIA');
  });

  it('names the brand so whoever picks it up knows who is stuck', () => {
    const t = buildBestieSupportTicket({
      bestieAccountId: 'BESTIE', brandUsername: 'argania',
      brandAccountId: 'ARGANIA', message: 'הבוט לא עונה',
    });
    expect(t.brand).toBe('argania');
    expect(t.message).toContain('הבוט לא עונה');
    expect(t.source).toBe('dashboard_assistant');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-dashboard-escalation.test.ts`
Expected: FAIL — `buildBestieSupportTicket` is not exported.

- [ ] **Step 3: Write minimal implementation**

Export a pure `buildBestieSupportTicket(...)` returning the `support_requests` row, plus a thin tool
that inserts it. Keep the row builder pure so the destination is asserted without a database.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-dashboard-escalation.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/dashboard/tools.ts tests/unit/bestie-dashboard-escalation.test.ts
git commit -m "feat(bestie): stuck brands file a ticket on Bestie's own account"
```

---

## Self-Review

**Spec coverage:**

| Spec | Task |
|---|---|
| §4.1 structural account scoping | 1, 6, 8, 9 |
| §5.1 guidance + current screen | 1, 5, 7, 10 |
| §5.2 account narration | 2, 6 |
| §5.3 knowledge gaps | 3, 6 |
| §5.4 health check | 4, 6 |
| §6 architecture, reuse of `runBestieTurn` | 7 |
| §7 widget-only delivery | 10 (nothing else built) |
| §8.1 no cross-account read | 6, 8, 9 |
| §8.2 every link resolves | 5 |
| §8.3 no write path | 6, 9 (Task 11 is the one narrow exception) |
| §8.4 gaps are real | 3 |
| §8.5 boundary holds | 7, 10 |
| §8.6 health findings true | 4 |
| §9 escalation destination | 11 |

**Type consistency:** `DashboardCtx` (Task 1) is the context for every handler in Task 6, the input
to Task 7, and built by Task 8. `HealthFinding.route` and `KnowledgeGap` feed `buildScreenLink`
(Task 5) through the tool layer.

**Known gaps for the implementer:**
1. Task 6 needs the account's Instagram connection state and product count. Read them the way the
   existing dashboard screens do rather than inventing a query — check
   `src/app/api/influencer/instagram` and `.../products`.
2. Task 10's mounting point depends on how the `/influencer/[username]` layout is structured; open it
   before deciding where to wrap.

## Blockers before shipping

- **Task 11's destination needs Ido's confirmation.** A ticket on Bestie's own account is the
  default this plan chose, not a decision he made.
- Everything else is buildable now — Phases 1 and 2 shipped, and no external approval is involved.
