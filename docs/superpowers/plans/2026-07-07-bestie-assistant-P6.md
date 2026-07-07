_# Phase P6 — Proactivity Engine & Anti-Nag (TDD, bite-sized)

Generalizes the account-centric `crm-reminders` cron + the single `crm_agent_wa_state` row into an **event-sourced outbox → gated ledger → one-batched-digest** pipeline that talks ONLY to the agent (Principle 5), survives Meta at-least-once refire (idempotent triggers), and never sends in quiet hours / Shabbat (hard KPI). Every anti-nag decision is a **pure function taking an injected `nowMs`** so §14 scheduler invariants run with a simulated clock and no LLM.

**Global invariants honored:** digest READS stored totals (never recomputes VAT — money math stays in Executor via `computeTotals`); untrusted DB strings (brand names) are DATA in the digest, never instructions; conservative default (`proactivity_optin=false`) + explicit opt-in gates ALL sends; log to `assistant_actions` before composing reply; service-window gate on every proactive send.

Tests are FLAT under `tests/unit/` (repo convention, e.g. `crm-wa-interpret.test.ts`). Modules under `src/lib/assistant/`. Migrations continue from the assistant band (shown 069–071; **rebase to the next free numbers after P1–P5 land** — see open questions). Commit after every green task, atomic, with the trailer.

---

## Task 1 — `assistant_nag_policy` migration + Jerusalem clock + quiet-hours (PURE)

**Files**
- create `supabase/migrations/071_assistant_nag_policy.sql`
- create `src/lib/assistant/proactivity.ts`
- create `tests/unit/assistant-proactivity.test.ts`

**Interfaces produced**
```ts
export interface NagPolicy {
  agent_id: string; tz: string;
  quiet_start: string; quiet_end: string;      // 'HH:MM' local
  daily_cap: number; digest_hour: number;      // local hour 0-23
  shabbat_quiet: boolean; proactivity_optin: boolean; consent_at: string | null;
}
export function toJerusalem(nowMs: number): { dow: number; minutes: number }; // dow 0=Sun..6=Sat
export function parseHhmm(s: string): number;
export function isQuietHours(nowMs: number, p: NagPolicy): boolean;
```

**Step 1 — migration** (`071_assistant_nag_policy.sql`):
```sql
-- Migration 071: per-agent anti-nag policy (Asia/Jerusalem quiet hours + Shabbat + caps + opt-in).
-- Conservative default: proactivity_optin=false — NO proactive send until the owner opts the agent
-- in at web onboarding (stores consent_at). Digest lands at digest_hour local; quiet window wraps midnight.
create table if not exists public.assistant_nag_policy (
  agent_id uuid primary key references public.users(id) on delete cascade,
  tz text not null default 'Asia/Jerusalem',
  quiet_start text not null default '21:00',
  quiet_end text not null default '08:00',
  daily_cap int not null default 3,
  digest_hour int not null default 9,
  shabbat_quiet boolean not null default true,
  proactivity_optin boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assistant_nag_policy enable row level security; -- service-role only (defense-in-depth, §6.6)
```
Apply: `mcp__supabase__apply_migration` name `071_assistant_nag_policy`. Verify with `mcp__supabase__list_tables`.

**Step 2 — failing test** (`tests/unit/assistant-proactivity.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { toJerusalem, parseHhmm, isQuietHours, type NagPolicy } from '@/lib/assistant/proactivity';

const base: NagPolicy = {
  agent_id: 'a', tz: 'Asia/Jerusalem', quiet_start: '21:00', quiet_end: '08:00',
  daily_cap: 3, digest_hour: 9, shabbat_quiet: true, proactivity_optin: true, consent_at: '2026-01-01T00:00:00Z',
};

describe('toJerusalem (DST-correct via Intl)', () => {
  it('winter UTC+2: 2026-01-16T14:00Z → Fri 16:00', () => {
    expect(toJerusalem(Date.parse('2026-01-16T14:00:00Z'))).toEqual({ dow: 5, minutes: 16 * 60 });
  });
  it('summer UTC+3: 2026-07-17T05:00Z → Fri 08:00', () => {
    expect(toJerusalem(Date.parse('2026-07-17T05:00:00Z'))).toEqual({ dow: 5, minutes: 8 * 60 });
  });
});

describe('parseHhmm', () => {
  it('converts to minutes', () => { expect(parseHhmm('08:30')).toBe(510); expect(parseHhmm('21:00')).toBe(1260); });
});

describe('isQuietHours (wraps midnight)', () => {
  it('22:00 local is quiet', () => { expect(isQuietHours(Date.parse('2026-01-15T20:00:00Z'), base)).toBe(true); });   // 22:00 IST
  it('07:00 local is quiet', () => { expect(isQuietHours(Date.parse('2026-01-15T05:00:00Z'), base)).toBe(true); });   // 07:00 IST
  it('08:30 local is NOT quiet', () => { expect(isQuietHours(Date.parse('2026-01-15T06:30:00Z'), base)).toBe(false); }); // 08:30 IST
  it('start===end disables the window', () => {
    expect(isQuietHours(Date.parse('2026-01-15T20:00:00Z'), { ...base, quiet_start: '00:00', quiet_end: '00:00' })).toBe(false);
  });
});
```
Run-to-fail: `npx vitest run tests/unit/assistant-proactivity.test.ts`

**Step 3 — minimal impl** (`src/lib/assistant/proactivity.ts`):
```ts
/**
 * Anti-nag PURE helpers — every decision takes an injected `nowMs` so §14 scheduler
 * invariants run with a simulated clock (no Date.now(), no LLM, no DB). Asia/Jerusalem
 * wall-clock is derived DST-correctly via Intl. Dependency-free + fully unit-tested.
 */
export interface NagPolicy {
  agent_id: string; tz: string;
  quiet_start: string; quiet_end: string;
  daily_cap: number; digest_hour: number;
  shabbat_quiet: boolean; proactivity_optin: boolean; consent_at: string | null;
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function toJerusalem(nowMs: number): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(nowMs));
  const wd = parts.find((p) => p.type === 'weekday')!.value;
  let hh = Number(parts.find((p) => p.type === 'hour')!.value);
  const mm = Number(parts.find((p) => p.type === 'minute')!.value);
  if (hh === 24) hh = 0; // Intl hour12:false can emit '24' at midnight
  return { dow: DOW[wd], minutes: hh * 60 + mm };
}

export function parseHhmm(s: string): number {
  const [h, m] = String(s || '0:0').split(':').map((x) => Number(x) || 0);
  return h * 60 + m;
}

export function isQuietHours(nowMs: number, p: NagPolicy): boolean {
  const { minutes } = toJerusalem(nowMs);
  const start = parseHhmm(p.quiet_start);
  const end = parseHhmm(p.quiet_end);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
```
Run-to-pass: `npx vitest run tests/unit/assistant-proactivity.test.ts`

**Commit:** `feat(assistant/proactivity): nag-policy table + Jerusalem clock + quiet-hours gate`

---

## Task 2 — Shabbat hard quiet zone (PURE)

**Files:** modify `src/lib/assistant/proactivity.ts`, `tests/unit/assistant-proactivity.test.ts`.

**Interface produced:** `export function isShabbat(nowMs: number, p: NagPolicy): boolean;`

**Step 1 — failing test** (append):
```ts
import { isShabbat } from '@/lib/assistant/proactivity';
describe('isShabbat (Fri 16:00 → Sat 20:30, conservative, per-agent toggle)', () => {
  it('Fri 16:00 IST is Shabbat', () => { expect(isShabbat(Date.parse('2026-01-16T14:00:00Z'), base)).toBe(true); });
  it('Fri 15:59 IST is NOT yet', () => { expect(isShabbat(Date.parse('2026-01-16T13:59:00Z'), base)).toBe(false); });
  it('Sat 20:00 IST still Shabbat', () => { expect(isShabbat(Date.parse('2026-01-17T18:00:00Z'), base)).toBe(true); });
  it('Sat 20:30 IST is over', () => { expect(isShabbat(Date.parse('2026-01-17T18:30:00Z'), base)).toBe(false); });
  it('toggle off disables it entirely', () => { expect(isShabbat(Date.parse('2026-01-16T14:00:00Z'), { ...base, shabbat_quiet: false })).toBe(false); });
});
```
Run-to-fail: `npx vitest run tests/unit/assistant-proactivity.test.ts`

**Step 2 — impl** (append to proactivity.ts):
```ts
// Conservative fixed window (errs toward silence). v1 does NOT call a zmanim API so the
// scheduler invariant stays deterministic; real candle-lighting/havdalah is a later refinement.
const FRIDAY_QUIET_FROM = 16 * 60;        // 16:00
const SATURDAY_QUIET_UNTIL = 20 * 60 + 30; // 20:30

export function isShabbat(nowMs: number, p: NagPolicy): boolean {
  if (!p.shabbat_quiet) return false;
  const { dow, minutes } = toJerusalem(nowMs);
  if (dow === 5 && minutes >= FRIDAY_QUIET_FROM) return true;
  if (dow === 6 && minutes < SATURDAY_QUIET_UNTIL) return true;
  return false;
}
```
Run-to-pass; **commit:** `feat(assistant/proactivity): Shabbat hard quiet zone (Fri 16:00→Sat 20:30, per-agent toggle)`

---

## Task 3 — `gateProactiveSend` core anti-nag gate (PURE)

The heart of §5.4. Precedence is exhaustive & ordered so the invariant tests pin behavior.

**Files:** modify `src/lib/assistant/proactivity.ts`, `tests/unit/assistant-proactivity.test.ts`.

**Interfaces produced:**
```ts
export type SuppressReason = 'not_opted_in'|'duplicate'|'daily_cap'|'learned_dismissal'|'quiet_hours'|'shabbat'|'no_template';
export interface GateInput {
  nowMs: number; policy: NagPolicy;
  kind: 'event_notify'|'daily_digest'|'reminder';
  dedupExists: boolean; interruptionsToday: number;
  learnedDismissed: boolean; severityFloor: boolean; hasTemplate: boolean;
}
export type GateDecision =
  | { decision: 'send' }
  | { decision: 'suppress'; reason: SuppressReason }
  | { decision: 'schedule'; reason: SuppressReason; scheduledFor: number };
export function nextAllowedSend(nowMs: number, p: NagPolicy): number;
export function gateProactiveSend(input: GateInput): GateDecision;
```

**Step 1 — failing test** (append):
```ts
import { gateProactiveSend, nextAllowedSend, type GateInput } from '@/lib/assistant/proactivity';
const gi = (o: Partial<GateInput>): GateInput => ({
  nowMs: Date.parse('2026-01-15T10:00:00Z'), policy: base, kind: 'event_notify',
  dedupExists: false, interruptionsToday: 0, learnedDismissed: false, severityFloor: false, hasTemplate: true, ...o,
});
describe('gateProactiveSend precedence', () => {
  it('opt-out suppresses everything', () => {
    expect(gateProactiveSend(gi({ policy: { ...base, proactivity_optin: false } }))).toEqual({ decision: 'suppress', reason: 'not_opted_in' });
  });
  it('duplicate dedup_key suppressed', () => {
    expect(gateProactiveSend(gi({ dedupExists: true }))).toEqual({ decision: 'suppress', reason: 'duplicate' });
  });
  it('event beyond daily_cap folds into digest (suppressed)', () => {
    expect(gateProactiveSend(gi({ interruptionsToday: 3 }))).toEqual({ decision: 'suppress', reason: 'daily_cap' });
  });
  it('daily_digest is EXEMPT from the cap', () => {
    expect(gateProactiveSend(gi({ kind: 'daily_digest', interruptionsToday: 9 }))).toEqual({ decision: 'send' });
  });
  it('learned dismissal suppresses a normal event', () => {
    expect(gateProactiveSend(gi({ learnedDismissed: true }))).toEqual({ decision: 'suppress', reason: 'learned_dismissal' });
  });
  it('severity floor overrides learned dismissal AND cap', () => {
    expect(gateProactiveSend(gi({ learnedDismissed: true, interruptionsToday: 9, severityFloor: true }))).toEqual({ decision: 'send' });
  });
  it('quiet hours SCHEDULE, never send (0-sends-in-quiet KPI)', () => {
    const d = gateProactiveSend(gi({ nowMs: Date.parse('2026-01-15T20:00:00Z') })); // 22:00 IST
    expect(d.decision).toBe('schedule'); expect((d as any).reason).toBe('quiet_hours');
    expect(isQuietHours((d as any).scheduledFor, base)).toBe(false);
  });
  it('Shabbat SCHEDULE, even for severity floor (hard zone)', () => {
    const d = gateProactiveSend(gi({ nowMs: Date.parse('2026-01-16T14:00:00Z'), severityFloor: true })); // Fri 16:00
    expect(d.decision).toBe('schedule'); expect((d as any).reason).toBe('shabbat');
    expect(isShabbat((d as any).scheduledFor, base)).toBe(false);
  });
  it('no approved template suppressed', () => {
    expect(gateProactiveSend(gi({ hasTemplate: false }))).toEqual({ decision: 'suppress', reason: 'no_template' });
  });
});
describe('nextAllowedSend', () => {
  it('advances past quiet window to a clear slot', () => {
    const t = nextAllowedSend(Date.parse('2026-01-15T20:00:00Z'), base);
    expect(isQuietHours(t, base)).toBe(false); expect(isShabbat(t, base)).toBe(false); expect(t).toBeGreaterThan(Date.parse('2026-01-15T20:00:00Z'));
  });
});
```
Run-to-fail.

**Step 2 — impl** (append):
```ts
export function nextAllowedSend(nowMs: number, p: NagPolicy): number {
  const STEP = 15 * 60 * 1000;
  let t = nowMs;
  for (let i = 0; i < 4 * 24 * 4; i++) { // ≤4 days of 15-min steps
    if (!isQuietHours(t, p) && !isShabbat(t, p)) return t;
    t += STEP;
  }
  return t;
}

export function gateProactiveSend(input: GateInput): GateDecision {
  const { nowMs, policy, kind, dedupExists, interruptionsToday, learnedDismissed, severityFloor, hasTemplate } = input;
  // 1. opt-in is the master switch (§5.1, §7.3 explicit consent)
  if (!policy.proactivity_optin || !policy.consent_at) return { decision: 'suppress', reason: 'not_opted_in' };
  // 2. approved he UTILITY template must exist (§7.3 blast-radius)
  if (!hasTemplate) return { decision: 'suppress', reason: 'no_template' };
  // 3. idempotent ledger dedup (also the outbound double-send guard)
  if (dedupExists) return { decision: 'suppress', reason: 'duplicate' };
  // 4. hard time zones — SCHEDULE, never send (KPI: 0 sends in quiet/Shabbat; severity floor still deferred)
  if (isShabbat(nowMs, policy)) return { decision: 'schedule', reason: 'shabbat', scheduledFor: nextAllowedSend(nowMs, policy) };
  if (isQuietHours(nowMs, policy)) return { decision: 'schedule', reason: 'quiet_hours', scheduledFor: nextAllowedSend(nowMs, policy) };
  // 5. severity floor overrides the LEARNING layer + the cap (§5.4 severity floor)
  if (!severityFloor) {
    if (learnedDismissed) return { decision: 'suppress', reason: 'learned_dismissal' };
    // digest is 1/day regardless of item count → exempt from the interruption cap
    if (kind !== 'daily_digest' && interruptionsToday >= policy.daily_cap) return { decision: 'suppress', reason: 'daily_cap' };
  }
  return { decision: 'send' };
}
```
Run-to-pass; **commit:** `feat(assistant/proactivity): consequence-ordered anti-nag gate (opt-in/dedup/cap/dismissal/quiet/Shabbat/severity-floor)`

---

## Task 4 — Digest scheduling + dedup keys + percentile (PURE)

**Files:** modify proactivity.ts + test.

**Interfaces produced:**
```ts
export function computeDigestScheduledFor(nowMs: number, p: NagPolicy): number; // today/tomorrow at digest_hour, skipping quiet/Shabbat
export function eventDedupKey(eventType: string, entityId: string): string;
export function proactiveDedupKey(agencyId: string | null, agentId: string, kind: string, sourceKey: string): string;
export function percentile(nums: number[], q: number): number;
```

**Step 1 — failing test** (append):
```ts
import { computeDigestScheduledFor, eventDedupKey, proactiveDedupKey, percentile } from '@/lib/assistant/proactivity';
describe('digest scheduling + dedup', () => {
  it('lands at digest_hour local, in the future', () => {
    const now = Date.parse('2026-01-15T05:00:00Z');              // 07:00 IST Thu, before 09:00
    const t = computeDigestScheduledFor(now, base);
    expect(toJerusalem(t).minutes).toBe(9 * 60); expect(t).toBeGreaterThan(now);
    expect(isQuietHours(t, base)).toBe(false); expect(isShabbat(t, base)).toBe(false);
  });
  it('agency-level dedup: owner & employee collapse to ONE key (multi-user dedup §5.4)', () => {
    expect(proactiveDedupKey('agency-1', 'owner', 'daily_digest', '2026-01-15'))
      .toEqual(proactiveDedupKey('agency-1', 'employee', 'daily_digest', '2026-01-15'));
  });
  it('event dedup key is stable per entity transition (refire-idempotent)', () => {
    expect(eventDedupKey('quote_signed', 'sig-9')).toBe('quote_signed:sig-9');
  });
  it('percentile p95', () => { expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10); });
});
```
Run-to-fail.

**Step 2 — impl** (append):
```ts
export function computeDigestScheduledFor(nowMs: number, p: NagPolicy): number {
  // Walk forward in 1-min steps to the first future instant at digest_hour:00 local that clears quiet+Shabbat.
  const STEP = 60 * 1000;
  let t = nowMs + STEP;
  for (let i = 0; i < 5 * 24 * 60; i++) {
    const j = toJerusalem(t);
    if (j.minutes === p.digest_hour * 60 && !isQuietHours(t, p) && !isShabbat(t, p)) return t;
    t += STEP;
  }
  return t;
}
export function eventDedupKey(eventType: string, entityId: string): string { return `${eventType}:${entityId}`; }
export function proactiveDedupKey(agencyId: string | null, agentId: string, kind: string, sourceKey: string): string {
  return `${agencyId || agentId}:${kind}:${sourceKey}`; // agency-scoped so owner+employee never double-ping
}
export function percentile(nums: number[], q: number): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
}
```
Run-to-pass; **commit:** `feat(assistant/proactivity): digest scheduling + agency-scoped dedup keys + p95`

---

## Task 5 — `composeDigest` RTL-Hebrew 3-second skim (PURE, bidi-safe)

**Files:** modify proactivity.ts + test.

**Interfaces produced:**
```ts
export interface DigestItem { emoji: string; brand: string; talent: string | null; amountText: string | null; priority: number; }
export function composeDigest(items: DigestItem[]): string;
```

**Step 1 — failing test** (append):
```ts
import { composeDigest, type DigestItem } from '@/lib/assistant/proactivity';
const ISO = '⁨', PDI = '⁩'; // FSI/PDI isolate Latin+₪+digits inside RTL
const mk = (brand: string, amt: string | null, pr: number): DigestItem => ({ emoji: '🖊️', brand, talent: null, amountText: amt, priority: pr });
describe('composeDigest (RTL, top-3, collapse, one action)', () => {
  it('isolates brand+amount so bidi does not mangle "Argania 11,800 ₪"', () => {
    const out = composeDigest([mk('Argania', '11,800 ₪', 5)]);
    expect(out).toContain(`${ISO}Argania${PDI}`); expect(out).toContain(`${ISO}11,800 ₪${PDI}`);
  });
  it('shows top-3 by priority and collapses the rest', () => {
    const out = composeDigest([mk('A', null, 5), mk('B', null, 4), mk('C', null, 3), mk('D', null, 2), mk('E', null, 1)]);
    expect(out).toContain('A'); expect(out).toContain('B'); expect(out).toContain('C');
    expect(out).toContain('ועוד 2 פריטים'); expect(out).not.toContain(' מ-E');
  });
  it('exactly 3 items → no collapse line', () => {
    expect(composeDigest([mk('A', null, 3), mk('B', null, 2), mk('C', null, 1)])).not.toContain('ועוד');
  });
  it('always ends with ONE suggested next action', () => {
    expect(composeDigest([mk('A', null, 1)])).toContain('מה תרצה לעשות?');
  });
  it('empty → nothing-new line', () => { expect(composeDigest([])).toContain('אין עדכונים חדשים'); });
});
```
Run-to-fail.

**Step 2 — impl** (append):
```ts
export interface DigestItem { emoji: string; brand: string; talent: string | null; amountText: string | null; priority: number; }
const iso = (s: string) => `⁨${s}⁩`; // First-Strong Isolate + Pop Directional Isolate

export function composeDigest(items: DigestItem[]): string {
  if (!items.length) return '📋 סיכום יומי\nאין עדכונים חדשים היום. שבת שלום 🙂';
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const top = sorted.slice(0, 3);
  const lines = top.map((it) => {
    const who = it.talent ? `${iso(it.brand)} ↔ ${iso(it.talent)}` : iso(it.brand);
    const amt = it.amountText ? ` — ${iso(it.amountText)}` : '';
    return `${it.emoji} ${who}${amt}`;
  });
  const rest = sorted.length - top.length;
  const body = [`📋 סיכום יומי — ${items.length} עדכונים`, ...lines];
  if (rest > 0) body.push(`ועוד ${rest} פריטים`);
  body.push('', 'מה תרצה לעשות?');
  return body.join('\n');
}
```
Note: `amountText` is passed **pre-formatted** by the worker from stored totals — `composeDigest` performs zero arithmetic (invariant: money math only in Executor).
Run-to-pass; **commit:** `feat(assistant/proactivity): bidi-safe RTL daily-digest composer (top-3 + collapse + one action)`

---

## Task 6 — Dismissal taxonomy + learning counters (PURE)

**Files:** modify proactivity.ts + test.

**Interfaces produced:**
```ts
export function classifyDismissalText(text: string): 'strong' | null;
export function nextDismissalCount(prev: number, signal: 'strong'|'weak'|'ambiguous'): number;
export function isDemoted(count: number): boolean; // 3 ignores → digest-only
```

**Step 1 — failing test** (append):
```ts
import { classifyDismissalText, nextDismissalCount, isDemoted } from '@/lib/assistant/proactivity';
describe('dismissal taxonomy (button-less medium, §5.4)', () => {
  it('explicit Hebrew negatives = strong', () => {
    for (const t of ['די', 'עזוב', 'לא עכשיו', 'תפסיק', 'מספיק', 'שקט']) expect(classifyDismissalText(t)).toBe('strong');
  });
  it('normal reply = not a dismissal', () => { expect(classifyDismissalText('כן תשלח את החוזה')).toBeNull(); });
  it('strong jumps straight to demotion; ambiguous never counts', () => {
    expect(nextDismissalCount(0, 'strong')).toBe(3);
    expect(nextDismissalCount(2, 'weak')).toBe(3);
    expect(nextDismissalCount(2, 'ambiguous')).toBe(2);
    expect(isDemoted(3)).toBe(true); expect(isDemoted(2)).toBe(false);
  });
});
```
Run-to-fail.

**Step 2 — impl** (append):
```ts
const STRONG_DISMISS = ['די', 'עזוב', 'לא עכשיו', 'תפסיק', 'מספיק', 'שקט'];
export function classifyDismissalText(text: string): 'strong' | null {
  const t = (text || '').trim().toLowerCase();
  return t && STRONG_DISMISS.some((w) => t.includes(w)) ? 'strong' : null;
}
export function nextDismissalCount(prev: number, signal: 'strong' | 'weak' | 'ambiguous'): number {
  if (signal === 'ambiguous') return prev;       // sent-unread ≠ dismissal
  if (signal === 'strong') return Math.max(prev, 3); // one explicit "די" demotes immediately
  return prev + 1;                                // weak: read-no-action
}
export function isDemoted(count: number): boolean { return count >= 3; }
```
Run-to-pass; **commit:** `feat(assistant/proactivity): dismissal taxonomy + demotion counters (3 ignores → digest-only)`

---

## Task 7 — `assistant_events` outbox migration + idempotent DB triggers

**Files**
- create `supabase/migrations/069_assistant_events_outbox.sql`
- create `tests/integration/assistant-events-trigger.test.ts` (env-gated integration; asserts refire idempotency on a real branch)

**Step 1 — migration** (`069_assistant_events_outbox.sql`):
```sql
-- Migration 069: assistant_events outbox — DB triggers on CRM status transitions.
-- Decouples "something happened" from "should we tell the agent". ON CONFLICT(dedup_key)
-- makes signature/invoice webhook re-fires a NO-OP (Meta + provider both re-deliver).
create table if not exists public.assistant_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.users(id) on delete set null,
  agency_id uuid,
  event_type text not null,   -- quote_signed | quote_returned | invoice_paid | contract_uploaded
  entity_type text not null,  -- signature_request | invoice | contract
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  dedup_key text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists assistant_events_dedup_uidx on public.assistant_events(dedup_key);
create index if not exists assistant_events_unprocessed_idx on public.assistant_events(created_at) where processed_at is null;
alter table public.assistant_events enable row level security;

-- contracts may lack agent_id on older rows; ensure the column + backfill so the trigger resolves.
alter table public.contracts add column if not exists agent_id uuid references public.users(id);
update public.contracts c set agent_id = p.agent_id
  from public.partnerships p where c.partnership_id = p.id and c.agent_id is null;

create or replace function public.emit_assistant_event() returns trigger as $$
declare
  v_agent uuid := new.agent_id;
  v_agency uuid;
begin
  select agency_id into v_agency from public.users where id = v_agent;
  insert into public.assistant_events(agent_id, agency_id, event_type, entity_type, entity_id, dedup_key, payload)
  values (v_agent, v_agency, tg_argv[0], tg_argv[1], new.id,
          tg_argv[0] || ':' || new.id::text,
          jsonb_build_object('entity_id', new.id, 'status', new.status))
  on conflict (dedup_key) do nothing;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_sig_signed on public.signature_requests;
create trigger trg_sig_signed after update on public.signature_requests
  for each row when (old.status is distinct from new.status and new.status = 'signed')
  execute function public.emit_assistant_event('quote_signed', 'signature_request');

drop trigger if exists trg_sig_returned on public.signature_requests;
create trigger trg_sig_returned after update on public.signature_requests
  for each row when (old.status is distinct from new.status and new.status in ('expired', 'cancelled'))
  execute function public.emit_assistant_event('quote_returned', 'signature_request');

drop trigger if exists trg_inv_paid on public.invoices;
create trigger trg_inv_paid after update on public.invoices
  for each row when (old.paid_at is null and new.paid_at is not null)
  execute function public.emit_assistant_event('invoice_paid', 'invoice');

drop trigger if exists trg_contract_uploaded on public.contracts;
create trigger trg_contract_uploaded after update on public.contracts
  for each row when (old.status is distinct from new.status and new.status in ('sent', 'signed'))
  execute function public.emit_assistant_event('contract_uploaded', 'contract');
```
Apply via `mcp__supabase__apply_migration` name `069_assistant_events_outbox`.

**Step 2 — idempotency verification** (run-to-fail = run BEFORE the migration is applied). Integration test (`tests/integration/assistant-events-trigger.test.ts`), gated on env so CI without creds skips:
```ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const d = url && key ? describe : describe.skip;

d('assistant_events trigger idempotency (real branch)', () => {
  const sb = createClient(url!, key!);
  it('signing twice yields exactly ONE quote_signed event (refire NO-OP)', async () => {
    // seed a signature_request via the CRM factories, capture sigId (see helper), then:
    const sigId = process.env.TEST_SIG_ID!; // provisioned by the fixture step below
    await sb.from('signature_requests').update({ status: 'opened' }).eq('id', sigId);
    await sb.from('signature_requests').update({ status: 'signed' }).eq('id', sigId);
    await sb.from('signature_requests').update({ status: 'signed' }).eq('id', sigId); // refire
    const { data } = await sb.from('assistant_events').select('id').eq('dedup_key', `quote_signed:${sigId}`);
    expect(data?.length).toBe(1);
  });
});
```
Because vitest cannot reach the branch in this repo's CI, ALSO verify inline via `mcp__supabase__execute_sql`:
```sql
-- against the branch: update a known signature_request to 'signed' twice, then:
select count(*) from public.assistant_events where dedup_key = 'quote_signed:<known-uuid>'; -- expect 1
```
Run-to-pass: `npx vitest run tests/unit/assistant-proactivity.test.ts && npx vitest run tests/integration/assistant-events-trigger.test.ts` (integration auto-skips without creds; the pure `eventDedupKey` test from Task 4 already pins the key shape in CI).

**Commit:** `feat(assistant/events): status-transition outbox + idempotent DB triggers (quote_signed/returned/invoice_paid/contract_uploaded)`

---

## Task 8 — `proactive_messages` ledger migration

**Files:** create `supabase/migrations/070_proactive_messages.sql`.

**Step 1 — migration**:
```sql
-- Migration 070: proactive_messages — the anti-nag ledger. Every proactive send is gated by
-- dedup_key BEFORE the Meta call (also the outbound double-send guard on retry). body is stored
-- so a knocked message can be flushed safely and a failed delivery can be re-sent.
create table if not exists public.proactive_messages (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users(id) on delete cascade,
  agency_id uuid,
  kind text not null check (kind in ('event_notify', 'daily_digest', 'reminder')),
  source_event_id uuid references public.assistant_events(id) on delete set null,
  dedup_key text not null,
  status text not null check (status in ('queued', 'suppressed', 'scheduled', 'sent', 'failed', 'dismissed')),
  suppressed_reason text check (suppressed_reason in ('not_opted_in', 'quiet_hours', 'shabbat', 'daily_cap', 'duplicate', 'learned_dismissal', 'no_template')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  wa_message_id text,
  body text,
  created_at timestamptz not null default now()
);
create unique index if not exists proactive_messages_dedup_uidx on public.proactive_messages(dedup_key);
create index if not exists proactive_messages_agent_day_idx on public.proactive_messages(agent_id, created_at);
create index if not exists proactive_messages_scheduled_idx on public.proactive_messages(scheduled_for) where status = 'scheduled';
create index if not exists proactive_messages_wamid_idx on public.proactive_messages(wa_message_id);
alter table public.proactive_messages enable row level security;
```
Apply via `mcp__supabase__apply_migration` name `070_proactive_messages`. This migration has no code test — verify with `mcp__supabase__list_tables` that the unique index exists.

**Commit:** `feat(assistant/proactive): proactive_messages anti-nag ledger (dedup_key unique, suppression reasons)`

---

## Task 9 — Hebrew UTILITY template registry (≥3, blast-radius isolation)

**Files**
- create `src/lib/assistant/proactive-templates.ts`
- create `docs/whatsapp-templates/bestie-proactive-he.md`
- create `tests/unit/assistant-proactive-templates.test.ts`

**Interfaces produced:**
```ts
export type ProactiveKind = 'event_notify' | 'daily_digest' | 'reminder';
export interface ProactiveTemplate { name: string; languageCode: 'he'; }
export const TEMPLATES: Record<ProactiveKind, ProactiveTemplate>;
export function templateFor(kind: ProactiveKind): ProactiveTemplate;
```

**Step 1 — failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { TEMPLATES, templateFor } from '@/lib/assistant/proactive-templates';
describe('proactive templates (≥3 he UTILITY, one per kind for blast-radius isolation §7.3)', () => {
  it('has a distinct he template per kind', () => {
    const names = Object.values(TEMPLATES).map((t) => t.name);
    expect(new Set(names).size).toBe(3);
    for (const t of Object.values(TEMPLATES)) expect(t.languageCode).toBe('he');
  });
  it('templateFor resolves each kind', () => {
    expect(templateFor('daily_digest').name).toBe('bestie_daily_digest_knock');
    expect(templateFor('event_notify').name).toBe('bestie_event_notify');
    expect(templateFor('reminder').name).toBe('bestie_reminder');
  });
});
```
Run-to-fail.

**Step 2 — impl** (`proactive-templates.ts`):
```ts
/** he UTILITY templates. Meta PAUSES templates individually on blocks/reports — one per proactive
 * kind so an annoyed agency can't kill the whole channel. languageCode MUST be 'he' (client.ts
 * defaults to en_US → 132001 otherwise). The knock template merely re-opens the 24h window; the
 * rich LLM-composed digest is delivered free-form after the agent taps (§7.2). */
export type ProactiveKind = 'event_notify' | 'daily_digest' | 'reminder';
export interface ProactiveTemplate { name: string; languageCode: 'he'; }
export const TEMPLATES: Record<ProactiveKind, ProactiveTemplate> = {
  daily_digest: { name: 'bestie_daily_digest_knock', languageCode: 'he' },
  event_notify: { name: 'bestie_event_notify', languageCode: 'he' },
  reminder: { name: 'bestie_reminder', languageCode: 'he' },
};
export function templateFor(kind: ProactiveKind): ProactiveTemplate { return TEMPLATES[kind]; }
```

**Step 3 — doc** (`docs/whatsapp-templates/bestie-proactive-he.md`) — the exact bodies to submit in Meta Business Manager (category UTILITY, language Hebrew), business register not machine-translated:
```md
# Bestie proactive templates (submit as category=UTILITY, language=he)
1. bestie_daily_digest_knock — body: "יש לי סיכום יומי מוכן בשבילך 📋" · button: quick_reply "הצג סיכום"
2. bestie_event_notify — body: "עדכון על {{1}} מוכן ב-Bestie." ({{1}} = brand)
3. bestie_reminder — body: "תזכורת: {{1}}." ({{1}} = subject)
```
Run-to-pass; **commit:** `feat(assistant/proactive): 3 he UTILITY template defs + Meta submission doc`

---

## Task 10 — `sendProactiveMessage`: ledger-dedup + service-window gate + knock→free-form (DI)

**Files**
- create `src/lib/assistant/proactive-send.ts`
- create `tests/unit/assistant-proactive-send.test.ts`

**Interfaces produced:**
```ts
export interface ProactiveDeps {
  ledgerHas(dedupKey: string): Promise<boolean>;
  insertLedger(row: { agent_id: string; agency_id: string | null; kind: ProactiveKind; source_event_id?: string | null;
    dedup_key: string; status: string; suppressed_reason?: string | null; scheduled_for?: string | null;
    sent_at?: string | null; wa_message_id?: string | null; body: string }): Promise<void>;
  isWindowOpen(waId: string): Promise<boolean>;
  sendText: typeof import('@/lib/whatsapp-cloud/client').sendText;
  sendTemplate: typeof import('@/lib/whatsapp-cloud/client').sendTemplate;
  logAction(row: { agent_id: string; tool_name: string; origin: string; entity_type: string; entity_id: string | null; result: any }): Promise<void>;
}
export interface SendArgs { agentId: string; agencyId: string | null; waId: string; kind: ProactiveKind;
  body: string; dedupKey: string; sourceEventId?: string | null; }
export async function sendProactiveMessage(args: SendArgs, deps?: Partial<ProactiveDeps>): Promise<{ status: 'sent'|'suppressed'|'scheduled'|'failed'; reason?: string }>;
```
`deps` defaults to real Supabase/client impls (below); tests inject fakes — no supabase mocking, mirroring the pure-helper/DB-call separation in `wa-interpret.ts`.

**Step 1 — failing test:**
```ts
import { describe, it, expect, vi } from 'vitest';
import { sendProactiveMessage, type ProactiveDeps } from '@/lib/assistant/proactive-send';
function fakeDeps(over: Partial<ProactiveDeps> = {}): ProactiveDeps {
  return {
    ledgerHas: vi.fn().mockResolvedValue(false),
    insertLedger: vi.fn().mockResolvedValue(undefined),
    isWindowOpen: vi.fn().mockResolvedValue(true),
    sendText: vi.fn().mockResolvedValue({ success: true, wa_message_id: 'wamid.text' }),
    sendTemplate: vi.fn().mockResolvedValue({ success: true, wa_message_id: 'wamid.knock' }),
    logAction: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}
const args = { agentId: 'ag', agencyId: 'agency', waId: '972500000000', kind: 'daily_digest' as const, body: 'סיכום', dedupKey: 'agency:daily_digest:2026-01-15' };
describe('sendProactiveMessage', () => {
  it('window OPEN → free-form sendText, ledger sent, NO template', async () => {
    const d = fakeDeps();
    const r = await sendProactiveMessage(args, d);
    expect(r.status).toBe('sent'); expect(d.sendText).toHaveBeenCalledOnce(); expect(d.sendTemplate).not.toHaveBeenCalled();
    expect(d.insertLedger).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', wa_message_id: 'wamid.text' }));
    expect(d.logAction).toHaveBeenCalled(); // logged before returning (Principle 7)
  });
  it('window CLOSED → knock template, ledger scheduled with body stashed', async () => {
    const d = fakeDeps({ isWindowOpen: vi.fn().mockResolvedValue(false) });
    const r = await sendProactiveMessage(args, d);
    expect(r.status).toBe('scheduled'); expect(d.sendTemplate).toHaveBeenCalledOnce(); expect(d.sendText).not.toHaveBeenCalled();
    expect(d.insertLedger).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled', body: 'סיכום' }));
  });
  it('dedup_key already present → suppress(duplicate), NO Meta call (double-send guard)', async () => {
    const d = fakeDeps({ ledgerHas: vi.fn().mockResolvedValue(true) });
    const r = await sendProactiveMessage(args, d);
    expect(r).toEqual({ status: 'suppressed', reason: 'duplicate' });
    expect(d.sendText).not.toHaveBeenCalled(); expect(d.sendTemplate).not.toHaveBeenCalled();
  });
  it('sendText failure → ledger failed', async () => {
    const d = fakeDeps({ sendText: vi.fn().mockResolvedValue({ success: false }) });
    expect((await sendProactiveMessage(args, d)).status).toBe('failed');
    expect(d.insertLedger).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});
```
Run-to-fail.

**Step 2 — impl** (`proactive-send.ts`):
```ts
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { sendText, sendTemplate, toWaId } from '@/lib/whatsapp-cloud/client';
import { templateFor, type ProactiveKind } from '@/lib/assistant/proactive-templates';

export interface ProactiveDeps { /* ...as in Interfaces above... */ }
export interface SendArgs { agentId: string; agencyId: string | null; waId: string; kind: ProactiveKind; body: string; dedupKey: string; sourceEventId?: string | null; }

async function defaultIsWindowOpen(waId: string): Promise<boolean> {
  const { data: contact } = await supabaseAdmin.from('whatsapp_contacts').select('id').eq('wa_id', toWaId(waId)).maybeSingle();
  if (!contact) return false;
  const { data: convo } = await supabaseAdmin.from('whatsapp_conversations').select('service_window_expires_at').eq('contact_id', contact.id).maybeSingle();
  const exp = convo?.service_window_expires_at ? new Date(convo.service_window_expires_at).getTime() : 0;
  return exp > Date.now();
}
const realDeps: ProactiveDeps = {
  ledgerHas: async (k) => { const { data } = await supabaseAdmin.from('proactive_messages').select('id').eq('dedup_key', k).maybeSingle(); return !!data; },
  insertLedger: async (row) => { await supabaseAdmin.from('proactive_messages').insert(row); },
  isWindowOpen: defaultIsWindowOpen,
  sendText, sendTemplate,
  logAction: async (row) => { await supabaseAdmin.from('assistant_actions').insert({ ...row, status: 'done', executed_at: new Date().toISOString() }); },
};

export async function sendProactiveMessage(args: SendArgs, override: Partial<ProactiveDeps> = {}): Promise<{ status: 'sent'|'suppressed'|'scheduled'|'failed'; reason?: string }> {
  const d: ProactiveDeps = { ...realDeps, ...override };
  // 1. ledger dedup BEFORE any Meta call (idempotent double-send guard)
  if (await d.ledgerHas(args.dedupKey)) return { status: 'suppressed', reason: 'duplicate' };
  const base = { agent_id: args.agentId, agency_id: args.agencyId, kind: args.kind, source_event_id: args.sourceEventId ?? null, dedup_key: args.dedupKey, body: args.body };
  // 2. service-window gate (§7.1) — NEVER sendText without it (else 131047 silent failure)
  if (await d.isWindowOpen(args.waId)) {
    const res = await d.sendText({ to: args.waId, body: args.body });
    const status = res.success ? 'sent' : 'failed';
    await d.insertLedger({ ...base, status, sent_at: res.success ? new Date().toISOString() : null, wa_message_id: res.wa_message_id ?? null });
    await d.logAction({ agent_id: args.agentId, tool_name: 'proactive.send', origin: 'assistant_auto', entity_type: 'proactive_message', entity_id: args.sourceEventId ?? null, result: { status, kind: args.kind } });
    return { status };
  }
  // 3. window closed → knock template (UTILITY he), stash body for flush on the agent's reply (§7.2)
  const tpl = templateFor(args.kind);
  const knock = await d.sendTemplate({ to: args.waId, templateName: tpl.name, languageCode: tpl.languageCode });
  await d.insertLedger({ ...base, status: 'scheduled', wa_message_id: knock.wa_message_id ?? null });
  await d.logAction({ agent_id: args.agentId, tool_name: 'proactive.knock', origin: 'assistant_auto', entity_type: 'proactive_message', entity_id: args.sourceEventId ?? null, result: { kind: args.kind } });
  return { status: 'scheduled', reason: 'knock_sent' };
}
```
Run-to-pass; **commit:** `feat(assistant/proactive): service-window-gated send with knock-template→free-form + ledger double-send guard`

---

## Task 11 — Event-outbox worker + daily-digest composer (the heartbeat) + cron

**Files**
- modify `src/lib/assistant/proactive-send.ts` (add `consumeAssistantEvents`, `runDailyDigest`)
- create `src/app/api/cron/assistant-proactive/route.ts`
- create `tests/unit/assistant-proactive-worker.test.ts`

**Interfaces produced:**
```ts
export interface WorkerDeps extends ProactiveDeps {
  fetchUnprocessedEvents(): Promise<Array<{ id: string; agent_id: string; agency_id: string | null; event_type: string; entity_type: string; entity_id: string; payload: any }>>;
  markEventProcessed(id: string): Promise<void>;
  loadPolicy(agentId: string): Promise<NagPolicy | null>;
  interruptionsToday(agentId: string, nowMs: number): Promise<number>;
  learnedDismissed(agentId: string, eventType: string): Promise<boolean>;
  enrichEvent(e: any): Promise<{ brand: string; talent: string | null; amountText: string | null }>; // reads stored totals — no math
  waIdForAgent(agentId: string): Promise<string | null>;
  fetchDigestItems(agentId: string, nowMs: number): Promise<DigestItem[]>;
  listOptedInAgents(): Promise<Array<{ agent_id: string; agency_id: string | null }>>;
}
export async function consumeAssistantEvents(nowMs: number, deps?: Partial<WorkerDeps>): Promise<{ sent: number; scheduled: number; suppressed: number }>;
export async function runDailyDigest(nowMs: number, deps?: Partial<WorkerDeps>): Promise<{ digestsSent: number }>;
```

Worker flow per event (§5.2 Lane-B folds into digest, so event-notify here is ONLY for Lane-A-style immediate transitions the agent should see now): resolve policy → `gateProactiveSend({ kind:'event_notify', dedupExists via ledgerHas(proactiveDedupKey), interruptionsToday, learnedDismissed, severityFloor:false, hasTemplate:true })` → on `send` compose one-line body from `enrichEvent` + `sendProactiveMessage`; on `schedule` insert ledger `scheduled_for`; on `suppress` insert ledger `suppressed` (transparent, so §5.4 "transparent suppression" can surface it). Always `markEventProcessed`. `runDailyDigest` iterates opted-in agents whose local time == digest_hour, dedup_key `proactiveDedupKey(agencyId, agentId, 'daily_digest', localDate)` (agency-level → one digest for owner+employee), `composeDigest(fetchDigestItems)`, `sendProactiveMessage(kind:'daily_digest')`.

**Step 1 — failing test** (fakes injected; simulated clock):
```ts
import { describe, it, expect, vi } from 'vitest';
import { consumeAssistantEvents, runDailyDigest } from '@/lib/assistant/proactive-send';
const policy = { agent_id: 'ag', tz: 'Asia/Jerusalem', quiet_start: '21:00', quiet_end: '08:00', daily_cap: 3, digest_hour: 9, shabbat_quiet: true, proactivity_optin: true, consent_at: 'x' };
function wdeps(over = {}) {
  return {
    fetchUnprocessedEvents: vi.fn().mockResolvedValue([{ id: 'e1', agent_id: 'ag', agency_id: 'agency', event_type: 'quote_signed', entity_type: 'signature_request', entity_id: 's1', payload: {} }]),
    markEventProcessed: vi.fn().mockResolvedValue(undefined),
    loadPolicy: vi.fn().mockResolvedValue(policy),
    interruptionsToday: vi.fn().mockResolvedValue(0),
    learnedDismissed: vi.fn().mockResolvedValue(false),
    enrichEvent: vi.fn().mockResolvedValue({ brand: 'Fox', talent: 'נועה', amountText: '23,600 ₪' }),
    waIdForAgent: vi.fn().mockResolvedValue('972500000000'),
    fetchDigestItems: vi.fn(), listOptedInAgents: vi.fn(),
    ledgerHas: vi.fn().mockResolvedValue(false), insertLedger: vi.fn().mockResolvedValue(undefined),
    isWindowOpen: vi.fn().mockResolvedValue(true),
    sendText: vi.fn().mockResolvedValue({ success: true, wa_message_id: 'w1' }),
    sendTemplate: vi.fn().mockResolvedValue({ success: true, wa_message_id: 'w2' }),
    logAction: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}
const NOON = Date.parse('2026-01-15T10:00:00Z'); // 12:00 IST Thu — not quiet, not Shabbat
describe('consumeAssistantEvents', () => {
  it('signed event inside window → one free-form send + event processed', async () => {
    const d = wdeps();
    const r = await consumeAssistantEvents(NOON, d);
    expect(r.sent).toBe(1); expect(d.sendText).toHaveBeenCalledOnce(); expect(d.markEventProcessed).toHaveBeenCalledWith('e1');
  });
  it('learned-dismissed event → suppressed, not sent, still processed', async () => {
    const d = wdeps({ learnedDismissed: vi.fn().mockResolvedValue(true) });
    const r = await consumeAssistantEvents(NOON, d);
    expect(r.suppressed).toBe(1); expect(d.sendText).not.toHaveBeenCalled(); expect(d.markEventProcessed).toHaveBeenCalledWith('e1');
  });
  it('quiet hours → scheduled, not sent', async () => {
    const d = wdeps();
    const r = await consumeAssistantEvents(Date.parse('2026-01-15T20:00:00Z'), d); // 22:00 IST
    expect(r.scheduled).toBe(1); expect(d.sendText).not.toHaveBeenCalled();
  });
});
describe('runDailyDigest', () => {
  it('one agency-scoped digest at digest_hour', async () => {
    const items = [{ emoji: '🖊️', brand: 'Fox', talent: null, amountText: '23,600 ₪', priority: 5 }];
    const d = wdeps({ listOptedInAgents: vi.fn().mockResolvedValue([{ agent_id: 'ag', agency_id: 'agency' }]), fetchDigestItems: vi.fn().mockResolvedValue(items), loadPolicy: vi.fn().mockResolvedValue(policy) });
    const at9 = Date.parse('2026-01-15T07:00:00Z'); // 09:00 IST
    const r = await runDailyDigest(at9, d);
    expect(r.digestsSent).toBe(1); expect(d.sendText).toHaveBeenCalledOnce();
    expect(d.insertLedger).toHaveBeenCalledWith(expect.objectContaining({ kind: 'daily_digest', dedup_key: 'agency:daily_digest:2026-01-15' }));
  });
  it('skips agents whose local hour != digest_hour', async () => {
    const d = wdeps({ listOptedInAgents: vi.fn().mockResolvedValue([{ agent_id: 'ag', agency_id: 'agency' }]), loadPolicy: vi.fn().mockResolvedValue(policy) });
    expect((await runDailyDigest(NOON, d)).digestsSent).toBe(0);
  });
});
```
Run-to-fail.

**Step 2 — impl** (append to proactive-send.ts): real `WorkerDeps` defaults wired to Supabase (`fetchUnprocessedEvents` = `assistant_events` where `processed_at is null`; `interruptionsToday` counts `proactive_messages` with `status='sent'` and `kind in ('event_notify','reminder')` created today local; `learnedDismissed` reads `assistant_facts` predicate `dismisses_event_type` value.count>=3 via `isDemoted`; `enrichEvent` joins `partnerships.brand_name` + stored `total_amount` formatted with `toLocaleString('en-US')`+' ₪' — **no `computeTotals` call**; `fetchDigestItems` aggregates today's `assistant_events` for the agent into `DigestItem[]`; `listOptedInAgents` = `assistant_nag_policy` where `proactivity_optin` and `consent_at not null`). Core orchestration uses the pure gate:
```ts
export async function consumeAssistantEvents(nowMs, override = {}) {
  const d = { ...realWorkerDeps, ...override };
  let sent = 0, scheduled = 0, suppressed = 0;
  for (const e of await d.fetchUnprocessedEvents()) {
    const policy = await d.loadPolicy(e.agent_id);
    if (!policy) { await d.markEventProcessed(e.id); continue; }
    const sourceKey = eventDedupKey(e.event_type, e.entity_id);
    const dedupKey = proactiveDedupKey(e.agency_id, e.agent_id, 'event_notify', sourceKey);
    const dec = gateProactiveSend({ nowMs, policy, kind: 'event_notify',
      dedupExists: await d.ledgerHas(dedupKey), interruptionsToday: await d.interruptionsToday(e.agent_id, nowMs),
      learnedDismissed: await d.learnedDismissed(e.agent_id, e.event_type), severityFloor: false, hasTemplate: true });
    if (dec.decision === 'send') {
      const en = await d.enrichEvent(e); const wa = await d.waIdForAgent(e.agent_id);
      if (wa) { await sendProactiveMessage({ agentId: e.agent_id, agencyId: e.agency_id, waId: wa, kind: 'event_notify',
        body: composeDigest([{ emoji: emojiFor(e.event_type), brand: en.brand, talent: en.talent, amountText: en.amountText, priority: 1 }]),
        dedupKey, sourceEventId: e.id }, d); sent++; }
    } else if (dec.decision === 'schedule') {
      await d.insertLedger({ agent_id: e.agent_id, agency_id: e.agency_id, kind: 'event_notify', source_event_id: e.id, dedup_key: dedupKey, status: 'scheduled', suppressed_reason: dec.reason, scheduled_for: new Date(dec.scheduledFor).toISOString(), body: '' }); scheduled++;
    } else {
      await d.insertLedger({ agent_id: e.agent_id, agency_id: e.agency_id, kind: 'event_notify', source_event_id: e.id, dedup_key: dedupKey, status: 'suppressed', suppressed_reason: dec.reason, body: '' }); suppressed++;
    }
    await d.markEventProcessed(e.id);
  }
  return { sent, scheduled, suppressed };
}
export async function runDailyDigest(nowMs, override = {}) {
  const d = { ...realWorkerDeps, ...override }; let digestsSent = 0;
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(nowMs)); // YYYY-MM-DD
  for (const a of await d.listOptedInAgents()) {
    const policy = await d.loadPolicy(a.agent_id); if (!policy) continue;
    if (toJerusalem(nowMs).minutes !== policy.digest_hour * 60) continue;
    if (isShabbat(nowMs, policy) || isQuietHours(nowMs, policy)) continue;
    const items = await d.fetchDigestItems(a.agent_id, nowMs);
    const wa = await d.waIdForAgent(a.agent_id); if (!wa) continue;
    const r = await sendProactiveMessage({ agentId: a.agent_id, agencyId: a.agency_id, waId: wa, kind: 'daily_digest',
      body: composeDigest(items), dedupKey: proactiveDedupKey(a.agency_id, a.agent_id, 'daily_digest', localDate) }, d);
    if (r.status === 'sent' || r.status === 'scheduled') digestsSent++;
  }
  return { digestsSent };
}
```
(`emojiFor` + `import { gateProactiveSend, composeDigest, proactiveDedupKey, eventDedupKey, isShabbat, isQuietHours, toJerusalem, type DigestItem, type NagPolicy } from './proactivity'`.)

**Step 3 — cron route** (`src/app/api/cron/assistant-proactive/route.ts`) — mirror `crm-reminders`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { consumeAssistantEvents, runDailyDigest } from '@/lib/assistant/proactive-send';
export const runtime = 'nodejs'; export const maxDuration = 300; export const dynamic = 'force-dynamic';
function ok(req: NextRequest) { const h = req.headers.get('authorization'); return !!h && h === `Bearer ${process.env.CRON_SECRET}`; }
export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = Date.now();
  const events = await consumeAssistantEvents(now);
  const digest = await runDailyDigest(now);
  return NextResponse.json({ ok: true, ...events, ...digest });
}
```
Run-to-pass: `npx vitest run tests/unit/assistant-proactive-worker.test.ts`; **commit:** `feat(assistant/proactive): event-outbox worker + agency-scoped daily-digest heartbeat + cron`

---

## Task 12 — Lane-A in-flow nudge (in-window only, never knocks)

**Files:** modify `src/lib/assistant/proactive-send.ts` (`queueLaneANudge`), `tests/unit/assistant-proactive-send.test.ts`.

**Interface produced:**
```ts
export async function queueLaneANudge(args: { agentId: string; agencyId: string | null; waId: string;
  eventType: string; entityId: string; body: string; midNegotiation: boolean }, deps?: Partial<ProactiveDeps & { loadPolicy(id:string):Promise<NagPolicy|null>; isWindowOpen(w:string):Promise<boolean> }>): Promise<{ status: 'sent'|'held'|'suppressed' }>;
```
Called from the **Executor** (P2) right after a `write_external` tool success (e.g. `build_quote` DRAFT → "לשלוח חוזה?"). Lane-A fires ONLY inside the live window and is HELD if the agent is mid-negotiation (`midNegotiation` = active typing thread). It never sends a knock template (that's Lane-B/digest only).

**Step 1 — failing test** (append):
```ts
import { queueLaneANudge } from '@/lib/assistant/proactive-send';
const pol = { agent_id: 'ag', tz: 'Asia/Jerusalem', quiet_start: '21:00', quiet_end: '08:00', daily_cap: 3, digest_hour: 9, shabbat_quiet: true, proactivity_optin: true, consent_at: 'x' };
describe('queueLaneANudge (Lane A — in-flow only)', () => {
  const a = { agentId: 'ag', agencyId: 'agency', waId: '972500000000', eventType: 'quote_built', entityId: 'q1', body: 'לשלוח חוזה?', midNegotiation: false };
  it('inside window + not negotiating → sent', async () => {
    const d = fakeDeps(); (d as any).loadPolicy = vi.fn().mockResolvedValue(pol);
    expect((await queueLaneANudge(a, d)).status).toBe('sent'); expect(d.sendText).toHaveBeenCalledOnce();
  });
  it('mid-negotiation → held, no send (do-not-interrupt)', async () => {
    const d = fakeDeps(); (d as any).loadPolicy = vi.fn().mockResolvedValue(pol);
    expect((await queueLaneANudge({ ...a, midNegotiation: true }, d)).status).toBe('held'); expect(d.sendText).not.toHaveBeenCalled();
  });
  it('window closed → suppressed, NEVER a knock template', async () => {
    const d = fakeDeps({ isWindowOpen: vi.fn().mockResolvedValue(false) }); (d as any).loadPolicy = vi.fn().mockResolvedValue(pol);
    expect((await queueLaneANudge(a, d)).status).toBe('suppressed'); expect(d.sendTemplate).not.toHaveBeenCalled();
  });
});
```
Run-to-fail.

**Step 2 — impl** (append):
```ts
export async function queueLaneANudge(args, override = {}) {
  const d = { ...realWorkerDeps, ...realDeps, ...override };
  const policy = await d.loadPolicy(args.agentId);
  if (!policy) return { status: 'suppressed' as const };
  if (args.midNegotiation) return { status: 'held' as const }; // do-not-interrupt an active thread (§5.2)
  const dedupKey = proactiveDedupKey(args.agencyId, args.agentId, 'event_notify', eventDedupKey(args.eventType, args.entityId));
  const dec = gateProactiveSend({ nowMs: Date.now(), policy, kind: 'event_notify',
    dedupExists: await d.ledgerHas(dedupKey), interruptionsToday: await d.interruptionsToday(args.agentId, Date.now()),
    learnedDismissed: await d.learnedDismissed(args.agentId, args.eventType), severityFloor: false, hasTemplate: true });
  if (dec.decision !== 'send') return { status: 'suppressed' as const };
  if (!(await d.isWindowOpen(args.waId))) return { status: 'suppressed' as const }; // Lane A is window-bound; no knock
  const r = await sendProactiveMessage({ agentId: args.agentId, agencyId: args.agencyId, waId: args.waId, kind: 'event_notify', body: args.body, dedupKey }, d);
  return { status: r.status === 'sent' ? 'sent' as const : 'suppressed' as const };
}
```
Run-to-pass; **commit:** `feat(assistant/proactive): Lane-A in-flow nudge (window-bound, do-not-interrupt, no knock)`

---

## Task 13 — Dismissal-learning writer + knock flush (webhook signals)

**Files:** modify `src/lib/assistant/proactive-send.ts` (`recordDeliverySignal`, `flushKnockedProactive`), `tests/unit/assistant-proactive-dismissal.test.ts`.

**Interfaces produced:**
```ts
export async function recordDeliverySignal(waMessageId: string, signal: 'strong'|'weak'|'ambiguous', deps?): Promise<{ demoted: boolean }>;
export async function flushKnockedProactive(agentId: string, waId: string, deps?): Promise<{ flushed: number }>;
```
`recordDeliverySignal` maps a Meta delivered/read webhook (or an explicit Hebrew "די") on a proactive `wa_message_id` → looks up the ledger row's `agent_id`+event_type → `nextDismissalCount` → upserts `assistant_facts` (provenance `inferred`, predicate `dismisses_event_type`) → returns `demoted` per `isDemoted`. `flushKnockedProactive` sends the stashed `body` of any `status='scheduled'` knocked rows for the agent the instant they reply (§7.2), marking them `sent`.

**Step 1 — failing test:**
```ts
import { describe, it, expect, vi } from 'vitest';
import { recordDeliverySignal, flushKnockedProactive } from '@/lib/assistant/proactive-send';
describe('recordDeliverySignal → assistant_facts inferred dismissal', () => {
  it('strong "די" demotes immediately (count→3)', async () => {
    const upsertFact = vi.fn().mockResolvedValue(undefined);
    const d = { ledgerRowByWamid: vi.fn().mockResolvedValue({ agent_id: 'ag', kind: 'event_notify', source_event_type: 'invoice_paid' }),
      currentDismissCount: vi.fn().mockResolvedValue(0), upsertFact };
    const r = await recordDeliverySignal('w1', 'strong', d);
    expect(r.demoted).toBe(true);
    expect(upsertFact).toHaveBeenCalledWith(expect.objectContaining({ predicate: 'dismisses_event_type', provenance: 'inferred' }));
  });
  it('weak read-no-action from 2 → 3 demotes', async () => {
    const d = { ledgerRowByWamid: vi.fn().mockResolvedValue({ agent_id: 'ag', kind: 'event_notify', source_event_type: 'invoice_paid' }),
      currentDismissCount: vi.fn().mockResolvedValue(2), upsertFact: vi.fn().mockResolvedValue(undefined) };
    expect((await recordDeliverySignal('w1', 'weak', d)).demoted).toBe(true);
  });
  it('ambiguous does not count', async () => {
    const d = { ledgerRowByWamid: vi.fn().mockResolvedValue({ agent_id: 'ag', kind: 'event_notify', source_event_type: 'invoice_paid' }),
      currentDismissCount: vi.fn().mockResolvedValue(2), upsertFact: vi.fn().mockResolvedValue(undefined) };
    expect((await recordDeliverySignal('w1', 'ambiguous', d)).demoted).toBe(false);
  });
});
describe('flushKnockedProactive', () => {
  it('sends stashed body + marks sent', async () => {
    const markSent = vi.fn().mockResolvedValue(undefined);
    const d = { fetchScheduledKnocks: vi.fn().mockResolvedValue([{ id: 'p1', body: 'סיכום' }]),
      sendText: vi.fn().mockResolvedValue({ success: true, wa_message_id: 'w9' }), markSent };
    const r = await flushKnockedProactive('ag', '972500000000', d);
    expect(r.flushed).toBe(1); expect(d.sendText).toHaveBeenCalledOnce(); expect(markSent).toHaveBeenCalledWith('p1', 'w9');
  });
});
```
Run-to-fail.

**Step 2 — impl** (append; uses `nextDismissalCount`/`isDemoted`/`classifyDismissalText` from proactivity.ts). Real deps wire `ledgerRowByWamid` → `proactive_messages` join; `currentDismissCount`/`upsertFact` → `assistant_facts`; `fetchScheduledKnocks` → `proactive_messages status='scheduled'` for the agent; `markSent` updates row `status='sent', wa_message_id, sent_at`.
Run-to-pass; **commit:** `feat(assistant/proactive): dismissal-learning writer (inferred fact) + knock-flush on reply`

---

## Task 14 — Shadow-mode simulator (launch gate) + zero-side-effect proof

**Files:** create `src/lib/assistant/shadow-proactivity.ts`, `scripts/shadow-proactivity.ts`, `tests/unit/assistant-shadow.test.ts`.

**Interfaces produced:**
```ts
export interface SimEvent { agent_id: string; agency_id: string | null; event_type: string; entity_id: string; at: number; }
export interface SimSend { agent_id: string; localDate: string; kind: string; }
export function simulateProactivity(input: { events: SimEvent[]; policies: Record<string, NagPolicy>; nowMs: number }): { wouldSend: SimSend[]; perAgentDaily: Record<string, number>; p95: number };
```
Replays historical `assistant_events` through the SAME pure `gateProactiveSend`, tracking dedup in-memory, sending NOTHING (§13 launch gate: p95 daily volume under cap AND no Meta calls). Imports ONLY `./proactivity` — statically no `whatsapp-cloud/client` import (the test asserts this).

**Step 1 — failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { simulateProactivity } from '@/lib/assistant/shadow-proactivity';
const pol = { agent_id: 'ag', tz: 'Asia/Jerusalem', quiet_start: '21:00', quiet_end: '08:00', daily_cap: 3, digest_hour: 9, shabbat_quiet: true, proactivity_optin: true, consent_at: 'x' };
describe('shadow-mode simulator', () => {
  it('respects the daily cap and never exceeds it', () => {
    const day = Date.parse('2026-01-15T10:00:00Z');
    const events = Array.from({ length: 8 }, (_, i) => ({ agent_id: 'ag', agency_id: 'a', event_type: 'quote_signed', entity_id: 'e' + i, at: day + i * 60000 }));
    const r = simulateProactivity({ events, policies: { ag: pol }, nowMs: day });
    expect(r.perAgentDaily.ag).toBeLessThanOrEqual(pol.daily_cap);
    expect(r.p95).toBeLessThanOrEqual(pol.daily_cap);
  });
  it('opted-out agent → zero would-send', () => {
    const r = simulateProactivity({ events: [{ agent_id: 'ag', agency_id: 'a', event_type: 'quote_signed', entity_id: 'e1', at: Date.parse('2026-01-15T10:00:00Z') }], policies: { ag: { ...pol, proactivity_optin: false } }, nowMs: 0 });
    expect(r.wouldSend.length).toBe(0);
  });
  it('imports no Meta client (pure, side-effect-free)', async () => {
    const src = await import('fs').then((fs) => fs.readFileSync('src/lib/assistant/shadow-proactivity.ts', 'utf8'));
    expect(src).not.toContain('whatsapp-cloud/client');
  });
});
```
Run-to-fail.

**Step 2 — impl** (`shadow-proactivity.ts`): loop events, per agent+localDate track sent count + dedup set; call `gateProactiveSend` with `interruptionsToday` = running count, `dedupExists` from the set; count `decision==='send'`; aggregate `perAgentDaily` (max per day) + `percentile(values, 0.95)`. Script `scripts/shadow-proactivity.ts` pulls real `assistant_events` + `assistant_nag_policy` via service-role client and prints `perAgentDaily` + `p95` + a sample `wouldSend` log.
Run-to-pass; **commit:** `feat(assistant/proactive): shadow-mode simulator + p95 launch-gate + zero-side-effect proof`

---

## Task 15 — Wire cron + webhook flush/dismissal + type-check

**Files:** modify `vercel.json`, `src/app/api/webhooks/whatsapp/route.ts`.

**Step 1 — cron entry** — add to `vercel.json` `crons` (worker every 15 min covers digest_hour minute-match + event drain):
```json
{ "path": "/api/cron/assistant-proactive", "schedule": "*/15 * * * *" }
```

**Step 2 — webhook wiring** (`route.ts`):
- In `maybeHandleAgentQuote`, after the agent is resolved and BEFORE `handleAgentMessage`, call `await flushKnockedProactive(agent.id, args.waId).catch(...)` (fire-and-forget) so a knocked digest flushes the instant the agent replies (§7.2).
- Also on inbound text, `const dz = classifyDismissalText(args.textBody || ''); if (dz === 'strong' && msg.context?.id) await recordDeliverySignal(msg.context.id, 'strong').catch(...)` — an explicit "די" in reply to a proactive message demotes that event_type.
- In the outbound `statuses` loop, when `status.status === 'read'` on a proactive `wa_message_id`, `await recordDeliverySignal(status.id, 'weak').catch(...)` (read-no-action weak signal); `delivered`-only after N hours stays ambiguous (handled by a later reaper, not here).

**Step 3** — no new unit test (integration wiring); guard with the existing suite + `npm run type-check`. Run: `npm run type-check && npx vitest run tests/unit/assistant-proactivity.test.ts tests/unit/assistant-proactive-send.test.ts tests/unit/assistant-proactive-worker.test.ts tests/unit/assistant-proactive-dismissal.test.ts tests/unit/assistant-proactive-templates.test.ts tests/unit/assistant-shadow.test.ts`

**Commit:** `feat(assistant/proactive): schedule cron + webhook knock-flush + read/dismissal learning signals`

---

## Invariant checklist (must hold at phase end)
- 0 sends in quiet hours / Shabbat — `gateProactiveSend` returns `schedule`, never `send`, in both zones (Tasks 1–3, pinned by tests).
- Every proactive send passes the ledger `dedup_key` check AND the service-window gate before any Meta call (Task 10).
- Conservative default: `proactivity_optin=false` suppresses everything until onboarding opt-in + `consent_at` (Task 3).
- Digest is agency-scoped dedup (owner+employee → one) and exempt from the interruption cap (Tasks 4, 3).
- Money is never recomputed in P6 — `amountText` is pre-formatted from stored totals; `composeDigest` does zero arithmetic (Tasks 5, 11).
- Assistant only messages the agent — no tool addresses a client/talent; every send targets `agent.whatsapp` (all tasks).
- Every proactive send logs to `assistant_actions` before returning (Task 10, Principle 7).
- Severity floor overrides learned-dismissal + cap, but still defers in quiet/Shabbat (Task 3)._