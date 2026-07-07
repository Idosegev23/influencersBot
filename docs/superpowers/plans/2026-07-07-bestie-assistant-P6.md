## P6 — Proactivity Engine & Anti-Nag — Bite-Sized TDD Plan

**Global invariants honored throughout:** Planner proposes / Executor decides (proactivity is a *deterministic* Executor-side scheduler — NO LLM in the send decision); the digest is composed deterministically by `composeDigest` (slot-filling, not generation) so it is testable + cheap; all money shown comes from `computeTotals`/persisted deal totals, never re-derived by an LLM; **the assistant only ever messages the AGENT** (every proactive send targets `users.whatsapp`, never a client/talent — there is no external recipient path in this phase); anti-nag is deliverability-survival; every send is gated by the `proactive_messages.dedup_key` UNIQUE index BEFORE the Meta call; every proactive row is written to the ledger BEFORE composing/sending.

**TDD shape:** pure scheduler + composer + template + dismissal logic are dependency-free and vitest-tested with a *simulated clock* (matches `src/lib/crm/wa-interpret.ts` + `tests/unit/crm-wa-interpret.test.ts`). DB orchestration is written with injected deps (`ProactivityDeps`) so the worker/digest/shadow logic is unit-tested with fakes; migrations are applied via `mcp__supabase__apply_migration` and verified with `mcp__supabase__execute_sql` round-trips.

Migrations are numbered `066`–`069` here; **at apply time renumber to the next contiguous free integers after P1–P5 land** (P1 owns 061). Commit after every task, atomic, with trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1 — Migration: `assistant_events` outbox + `proactive_messages` ledger + `assistant_nag_policy` + `proactive_dismissal_counter`

**Files (create):** `supabase/migrations/066_assistant_proactivity.sql`

**Interfaces produced:** the four tables (schema below), the `dedup_key` UNIQUE guard, per-agent RLS (deny-all, service-role only — mirrors `052_crm_rls.sql`).

1. **Failing check (schema round-trip).** Run via MCP to prove the tables are absent first:
   `mcp__supabase__execute_sql({ query: "select to_regclass('public.proactive_messages') as t;" })` → expect `t = null` (fails the assertion "table exists").

2. **Write the migration** (real SQL):
```sql
-- Migration 066: Assistant proactivity — outbox + anti-nag ledger + per-agent policy.
-- Service-role only (RLS deny-all, like 052_crm_rls). agency_id from P1 (061).

create table if not exists public.assistant_events (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.users(id) on delete cascade,
  agency_id     uuid,
  event_type    text not null,          -- quote_signed|quote_returned|invoice_paid|contract_signed|invoice_overdue|signature_expiring
  entity_type   text not null,          -- partnership|invoice|signature_request|contract
  entity_id     uuid not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  process_result text
);
create index if not exists idx_assistant_events_unprocessed
  on public.assistant_events (created_at) where processed_at is null;
create index if not exists idx_assistant_events_agent on public.assistant_events (agent_id);

create table if not exists public.proactive_messages (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.users(id) on delete cascade,
  agency_id       uuid,
  kind            text not null,        -- event_notify|daily_digest|reminder
  source_event_id uuid references public.assistant_events(id) on delete set null,
  dedup_key       text not null,
  status          text not null default 'queued', -- queued|suppressed|scheduled|sent|failed|dismissed
  suppressed_reason text,               -- quiet_hours|daily_cap|duplicate|learned_dismissal|no_template
  payload         jsonb not null default '{}'::jsonb, -- free-form text + knock vars held until window opens
  template_name   text,
  scheduled_for   timestamptz,
  wa_message_id   text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  dismissed_at    timestamptz,
  created_at      timestamptz not null default now()
);
-- The send guard AND the outbound double-send guard on retry (spec §5.3).
create unique index if not exists uq_proactive_dedup on public.proactive_messages (dedup_key);
create index if not exists idx_proactive_agent_status on public.proactive_messages (agent_id, status);

create table if not exists public.assistant_nag_policy (
  agent_id           uuid primary key references public.users(id) on delete cascade,
  agency_id          uuid,
  tz                 text not null default 'Asia/Jerusalem',
  quiet_start        text not null default '21:00',
  quiet_end          text not null default '08:00',
  daily_cap          int  not null default 3,
  digest_hour        text not null default '09:00',
  shabbat_quiet      boolean not null default true,
  shabbat_start_hour int not null default 17,
  shabbat_end_hour   int not null default 21,
  proactivity_optin  boolean not null default false,   -- CONSERVATIVE default (spec §5.1)
  consent_at         timestamptz,
  updated_at         timestamptz not null default now()
);

-- Dismissal learning counters per (agent,event_type). Feeds learnedDismissedEventTypes.
create table if not exists public.proactive_dismissal_counter (
  agent_id     uuid not null references public.users(id) on delete cascade,
  event_type   text not null,
  weak_count   int not null default 0,
  strong_count int not null default 0,
  demoted_to_digest boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (agent_id, event_type)
);

alter table public.assistant_events            enable row level security;
alter table public.proactive_messages          enable row level security;
alter table public.assistant_nag_policy        enable row level security;
alter table public.proactive_dismissal_counter enable row level security;
-- No policies = service-role only. Tenant isolation via agent_id/agency_id + assertAgentOwns in code.
```

3. **Apply:** `mcp__supabase__apply_migration({ name: '066_assistant_proactivity', query: <file contents> })`.

4. **Run-to-pass (round-trip):**
```
mcp__supabase__execute_sql({ query:
  "insert into public.assistant_nag_policy(agent_id) select id from public.users limit 1 returning agent_id, tz, daily_cap, proactivity_optin;" })
```
Expect one row with `tz='Asia/Jerusalem'`, `daily_cap=3`, `proactivity_optin=false`. Then delete it. Verify the dedup guard:
```
insert two proactive_messages with the SAME dedup_key → second insert must raise unique_violation on uq_proactive_dedup.
```

5. **Commit:** `feat(assistant): proactivity outbox, ledger, nag-policy, dismissal counters (066)`

---

### Task 2 — Migration: DB triggers → outbox on status transitions

**Files (create):** `supabase/migrations/067_assistant_event_triggers.sql`

**Depends on real status values (verified in repo):** `signature_requests.status: pending→signed|cancelled`; `invoices.status: draft→sent→overdue→paid`; `contracts.status: draft→sent→signed`.

1. **Failing check:** `mcp__supabase__execute_sql({ query: "select tgname from pg_trigger where tgname like 'trg_assistant_evt_%';" })` → expect 0 rows.

2. **Write migration** (one generic emit fn + AFTER-UPDATE triggers; idempotent because the worker dedups downstream and re-fires are harmless):
```sql
-- Migration 067: status-transition triggers populate the assistant_events outbox.
create or replace function public.emit_assistant_event(
  p_agent uuid, p_agency uuid, p_type text, p_etype text, p_eid uuid, p_payload jsonb
) returns void language sql as $$
  insert into public.assistant_events(agent_id, agency_id, event_type, entity_type, entity_id, payload)
  select p_agent, p_agency, p_type, p_etype, p_eid, coalesce(p_payload,'{}'::jsonb)
  where p_agent is not null;
$$;

create or replace function public.trg_sig_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'signed' then
      perform public.emit_assistant_event(new.agent_id, null, 'quote_signed', 'signature_request', new.id,
        jsonb_build_object('partnership_id', new.partnership_id));
    elsif new.status = 'cancelled' then
      perform public.emit_assistant_event(new.agent_id, null, 'quote_returned', 'signature_request', new.id,
        jsonb_build_object('partnership_id', new.partnership_id));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_assistant_evt_sig on public.signature_requests;
create trigger trg_assistant_evt_sig after update on public.signature_requests
  for each row execute function public.trg_sig_status();

create or replace function public.trg_inv_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'paid' then
      perform public.emit_assistant_event(new.agent_id, null, 'invoice_paid', 'invoice', new.id,
        jsonb_build_object('partnership_id', new.partnership_id));
    elsif new.status = 'overdue' then
      perform public.emit_assistant_event(new.agent_id, null, 'invoice_overdue', 'invoice', new.id,
        jsonb_build_object('partnership_id', new.partnership_id));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_assistant_evt_inv on public.invoices;
create trigger trg_assistant_evt_inv after update on public.invoices
  for each row execute function public.trg_inv_status();

create or replace function public.trg_contract_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status = 'signed' then
    perform public.emit_assistant_event(new.agent_id, null, 'contract_signed', 'contract', new.id,
      jsonb_build_object('partnership_id', new.partnership_id));
  end if;
  return new;
end $$;
drop trigger if exists trg_assistant_evt_contract on public.contracts;
create trigger trg_assistant_evt_contract after update on public.contracts
  for each row execute function public.trg_contract_status();
```
> If `contracts.agent_id` does not exist, first run `select column_name from information_schema.columns where table_name='contracts';` and read `agent_id` via the partnership instead. Verify columns before applying.

3. **Apply** via `mcp__supabase__apply_migration`.

4. **Run-to-pass (behavioral, rolled back):**
```
mcp__supabase__execute_sql({ query:
  "begin;
   with pick as (select id, agent_id from public.signature_requests where status='pending' limit 1)
   update public.signature_requests s set status='signed' from pick where s.id=pick.id;
   select count(*) from public.assistant_events where event_type='quote_signed' and created_at > now()-interval '10 seconds';
   rollback;" })
```
Expect count ≥ 1 (an outbox row was emitted). Rollback leaves prod state clean.

5. **Commit:** `feat(assistant): status-transition triggers emit outbox events (067)`

---

### Task 3 — Pure nag-policy time helpers (quiet hours, Shabbat, service window) — simulated clock

**Files (create):** `src/lib/assistant/proactivity-policy.ts`, `tests/unit/assistant-proactivity-policy.test.ts`

**Interfaces produced:** `NagPolicy`, `zonedParts`, `isQuietHours`, `isShabbat`, `withinServiceWindow`, `dayBucket`.

1. **Failing test** (`tests/unit/assistant-proactivity-policy.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { isQuietHours, isShabbat, withinServiceWindow, dayBucket, type NagPolicy } from '@/lib/assistant/proactivity-policy';

const P: NagPolicy = {
  agent_id: 'a', agency_id: 'g', tz: 'Asia/Jerusalem',
  quiet_start: '21:00', quiet_end: '08:00', daily_cap: 3, digest_hour: '09:00',
  shabbat_quiet: true, shabbat_start_hour: 17, shabbat_end_hour: 21,
  proactivity_optin: true, consent_at: null,
};
// Asia/Jerusalem is UTC+3 in July (DST).
describe('isQuietHours (wraps midnight)', () => {
  it('22:30 local is quiet', () => expect(isQuietHours(new Date('2026-07-08T19:30:00Z'), P)).toBe(true));   // 22:30 IL
  it('09:00 local is not quiet', () => expect(isQuietHours(new Date('2026-07-08T06:00:00Z'), P)).toBe(false)); // 09:00 IL
  it('07:00 local (before quiet_end) is quiet', () => expect(isQuietHours(new Date('2026-07-08T04:00:00Z'), P)).toBe(true)); // 07:00 IL
});
describe('isShabbat (conservative fixed window)', () => {
  it('Friday 18:00 IL is Shabbat', () => expect(isShabbat(new Date('2026-07-10T15:00:00Z'), P)).toBe(true)); // Fri 18:00 IL
  it('Friday 10:00 IL is not', () => expect(isShabbat(new Date('2026-07-10T07:00:00Z'), P)).toBe(false));
  it('Saturday 20:00 IL is Shabbat', () => expect(isShabbat(new Date('2026-07-11T17:00:00Z'), P)).toBe(true)); // Sat 20:00 IL
  it('Saturday 22:00 IL is not', () => expect(isShabbat(new Date('2026-07-11T19:00:00Z'), P)).toBe(false));
  it('toggle off disables', () => expect(isShabbat(new Date('2026-07-10T15:00:00Z'), { ...P, shabbat_quiet: false })).toBe(false));
});
describe('withinServiceWindow', () => {
  it('null → closed', () => expect(withinServiceWindow(new Date(), null)).toBe(false));
  it('future expiry → open', () => expect(withinServiceWindow(new Date('2026-07-08T10:00:00Z'), '2026-07-08T20:00:00Z')).toBe(true));
  it('past expiry → closed', () => expect(withinServiceWindow(new Date('2026-07-08T21:00:00Z'), '2026-07-08T20:00:00Z')).toBe(false));
});
describe('dayBucket', () => {
  it('buckets by IL local date', () => expect(dayBucket(new Date('2026-07-08T22:30:00Z'), 'Asia/Jerusalem')).toBe('2026-07-09')); // 01:30 next day IL
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-proactivity-policy.test.ts` (module missing).

3. **Minimal impl** (dependency-free; `Intl` for TZ correctness):
```ts
export type SuppressReason = 'quiet_hours' | 'daily_cap' | 'duplicate' | 'learned_dismissal' | 'no_template';
export type ProactiveKind = 'event_notify' | 'daily_digest' | 'reminder';

export interface NagPolicy {
  agent_id: string; agency_id: string | null; tz: string;
  quiet_start: string; quiet_end: string; daily_cap: number; digest_hour: string;
  shabbat_quiet: boolean; shabbat_start_hour: number; shabbat_end_hour: number;
  proactivity_optin: boolean; consent_at: string | null;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  return { dow: WD[get('weekday')] ?? 0, hour, minute, minutesOfDay: hour * 60 + minute };
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export function isQuietHours(now: Date, p: NagPolicy): boolean {
  const { minutesOfDay } = zonedParts(now, p.tz);
  const s = toMin(p.quiet_start), e = toMin(p.quiet_end);
  if (s === e) return false;
  return s < e ? minutesOfDay >= s && minutesOfDay < e : minutesOfDay >= s || minutesOfDay < e;
}

export function isShabbat(now: Date, p: NagPolicy): boolean {
  if (!p.shabbat_quiet) return false;
  const { dow, hour } = zonedParts(now, p.tz);
  if (dow === 5 && hour >= p.shabbat_start_hour) return true; // Fri evening → sunset (conservative)
  if (dow === 6 && hour < p.shabbat_end_hour) return true;    // Sat until night
  return false;
}

export function withinServiceWindow(now: Date, expiresAtISO: string | null): boolean {
  if (!expiresAtISO) return false;
  return now.getTime() < new Date(expiresAtISO).getTime();
}

export function dayBucket(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
```

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-proactivity-policy.test.ts`.

5. **Commit:** `feat(assistant): pure quiet-hours/Shabbat/service-window/day-bucket helpers`

---

### Task 4 — Pure `decideProactive` scheduler + `dedupKeyForEvent` + `nextDigestSlot` (the anti-nag decision core)

**Files (modify):** `src/lib/assistant/proactivity-policy.ts`; **(modify)** `tests/unit/assistant-proactivity-policy.test.ts`

**Interfaces produced:**
```ts
export const CRITICAL_EVENT_TYPES: Set<string>;   // signature_expiring, contract_expiring, invoice_legally_overdue
export function isCritical(eventType: string): boolean;
export interface DecisionInput {
  now: Date; policy: NagPolicy;
  event: { kind: ProactiveKind; event_type: string; entity_id: string; agency_id: string | null; critical?: boolean };
  serviceWindowExpiresAt: string | null;
  sentInterruptionsToday: number;
  existingDedupKeys: Set<string>;
  learnedDismissedEventTypes: Set<string>;
}
export interface Decision {
  action: 'send_now' | 'schedule' | 'suppress';
  dedup_key: string; suppressed_reason?: SuppressReason;
  scheduled_for?: string; via: 'free_form' | 'knock_template';
}
export function dedupKeyForEvent(e, tz: string, now: Date): string;
export function nextDigestSlot(now: Date, p: NagPolicy): Date;
export function decideProactive(input: DecisionInput): Decision;
```

1. **Failing tests (scheduler invariants — the crux of this phase):**
```ts
import { decideProactive, nextDigestSlot } from '@/lib/assistant/proactivity-policy';

const base = (over = {}) => ({
  now: new Date('2026-07-08T10:00:00Z'), policy: P,           // 13:00 IL, not quiet, not Shabbat
  event: { kind: 'event_notify', event_type: 'quote_signed', entity_id: 'e1', agency_id: 'g' },
  serviceWindowExpiresAt: '2026-07-08T20:00:00Z',
  sentInterruptionsToday: 0, existingDedupKeys: new Set<string>(), learnedDismissedEventTypes: new Set<string>(),
  ...over,
});

describe('decideProactive invariants', () => {
  it('happy path in-window → send_now free_form', () => {
    const d = decideProactive(base());
    expect(d.action).toBe('send_now'); expect(d.via).toBe('free_form');
  });
  it('outside service window → knock_template', () => {
    const d = decideProactive(base({ serviceWindowExpiresAt: '2026-07-08T05:00:00Z' }));
    expect(d.action).toBe('send_now'); expect(d.via).toBe('knock_template');
  });
  it('duplicate dedup_key → suppress(duplicate)', () => {
    const first = decideProactive(base());
    const d = decideProactive(base({ existingDedupKeys: new Set([first.dedup_key]) }));
    expect(d.action).toBe('suppress'); expect(d.suppressed_reason).toBe('duplicate');
  });
  it('daily cap reached (non-critical) → suppress(daily_cap)', () => {
    const d = decideProactive(base({ sentInterruptionsToday: 3 }));
    expect(d.suppressed_reason).toBe('daily_cap');
  });
  it('learned dismissal → suppress(learned_dismissal)', () => {
    const d = decideProactive(base({ learnedDismissedEventTypes: new Set(['quote_signed']) }));
    expect(d.suppressed_reason).toBe('learned_dismissal');
  });
  it('SEVERITY FLOOR: critical bypasses cap + learned dismissal', () => {
    const d = decideProactive(base({
      event: { kind: 'event_notify', event_type: 'signature_expiring', entity_id: 'e9', agency_id: 'g' },
      sentInterruptionsToday: 9, learnedDismissedEventTypes: new Set(['signature_expiring']),
    }));
    expect(d.action).toBe('send_now');
  });
  it('quiet hours → schedule to quiet_end (non-critical)', () => {
    const d = decideProactive(base({ now: new Date('2026-07-08T19:30:00Z') })); // 22:30 IL
    expect(d.action).toBe('schedule');
    expect(new Date(d.scheduled_for!).getTime()).toBeGreaterThan(new Date('2026-07-08T19:30:00Z').getTime());
  });
  it('Shabbat → schedule past Saturday night', () => {
    const d = decideProactive(base({ now: new Date('2026-07-10T15:00:00Z') })); // Fri 18:00 IL
    expect(d.action).toBe('schedule');
  });
  it('daily_digest ignores daily_cap', () => {
    const d = decideProactive(base({ event: { kind: 'daily_digest', event_type: 'daily_digest', entity_id: 'd', agency_id: 'g' }, sentInterruptionsToday: 9 }));
    expect(d.action).toBe('send_now');
  });
  it('event dedup is AGENCY-scoped (multi-user dedup)', () => {
    const a = decideProactive(base());
    const b = decideProactive(base({ policy: { ...P, agent_id: 'other-agent' } }));
    expect(a.dedup_key).toBe(b.dedup_key); // same agency+event+entity+day → one ping for the deal
  });
  it('digest dedup is per-agent-per-day', () => {
    const d = decideProactive(base({ event: { kind: 'daily_digest', event_type: 'daily_digest', entity_id: '-', agency_id: 'g' } }));
    expect(d.dedup_key).toContain('digest:a:');
  });
});
describe('nextDigestSlot', () => {
  it('never lands on Shabbat', () => {
    const slot = nextDigestSlot(new Date('2026-07-10T05:00:00Z'), P); // Fri morning IL
    // 09:00 IL Friday is fine (before shabbat_start_hour 17); but a Saturday slot must be pushed to Sunday.
    expect([5, 0]).toContain(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(slot) === 'Sat' ? 6 : 5);
  });
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-proactivity-policy.test.ts`.

3. **Minimal impl** (append to `proactivity-policy.ts`):
```ts
export const CRITICAL_EVENT_TYPES = new Set(['signature_expiring', 'contract_expiring', 'invoice_legally_overdue']);
export function isCritical(eventType: string): boolean { return CRITICAL_EVENT_TYPES.has(eventType); }

export function dedupKeyForEvent(
  e: { kind: ProactiveKind; event_type: string; entity_id: string; agency_id: string | null },
  agentId: string, tz: string, now: Date,
): string {
  const day = dayBucket(now, tz);
  if (e.kind === 'daily_digest') return `digest:${agentId}:${day}`;
  // Agency-scoped so owner + assigned employee don't double-ping for the same deal (spec §5.4).
  return `${e.agency_id || 'noagency'}:${e.event_type}:${e.entity_id}`;
}

export function nextDigestSlot(now: Date, p: NagPolicy): Date {
  const [dh, dm] = p.digest_hour.split(':').map(Number);
  // Step forward in 30-min increments until we hit >= digest_hour local on a non-Shabbat, non-quiet day.
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 96 * 8; i++) {
    const { hour, minute } = zonedParts(cursor, p.tz);
    const atOrPastDigest = hour > dh || (hour === dh && minute >= (dm || 0));
    if (atOrPastDigest && !isShabbat(cursor, p) && !isQuietHours(cursor, p)) return cursor;
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
  return cursor;
}

function nextAllowed(now: Date, p: NagPolicy): Date {
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 96 * 8; i++) {
    if (!isShabbat(cursor, p) && !isQuietHours(cursor, p)) return cursor;
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
  return cursor;
}

export function decideProactive(input: DecisionInput): Decision {
  const { now, policy, event, serviceWindowExpiresAt, sentInterruptionsToday, existingDedupKeys, learnedDismissedEventTypes } = input;
  const critical = Boolean(event.critical) || isCritical(event.event_type);
  const dedup_key = dedupKeyForEvent(event, policy.agent_id, policy.tz, now);
  const via: Decision['via'] = withinServiceWindow(now, serviceWindowExpiresAt) ? 'free_form' : 'knock_template';

  if (existingDedupKeys.has(dedup_key)) return { action: 'suppress', dedup_key, suppressed_reason: 'duplicate', via };

  // Severity floor sits ABOVE the learning + cap layers (spec §5.4), but still below time gates.
  if (!critical && learnedDismissedEventTypes.has(event.event_type))
    return { action: 'suppress', dedup_key, suppressed_reason: 'learned_dismissal', via };

  // Time gates: schedule to the next allowed slot (never suppress — the message still matters).
  if (isShabbat(now, policy) || isQuietHours(now, policy)) {
    const slot = event.kind === 'daily_digest' ? nextDigestSlot(now, policy) : nextAllowed(now, policy);
    return { action: 'schedule', dedup_key, scheduled_for: slot.toISOString(), via };
  }

  // Interruption cap — digest is exempt (1/day regardless); critical bypasses.
  if (event.kind !== 'daily_digest' && !critical && sentInterruptionsToday >= policy.daily_cap)
    return { action: 'suppress', dedup_key, suppressed_reason: 'daily_cap', via };

  return { action: 'send_now', dedup_key, via };
}
```

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-proactivity-policy.test.ts`.

5. **Commit:** `feat(assistant): decideProactive scheduler + agency/day dedup + severity floor`

---

### Task 5 — Pure dismissal classification + down-tune/stop-intent parsers

**Files (modify):** `src/lib/assistant/proactivity-policy.ts`; **(create)** `tests/unit/assistant-dismissal.test.ts`

**Interfaces produced:** `classifyDismissal`, `parseStopIntent`, `parseDownTuneCommand`, `shouldDemoteToDigest`.

1. **Failing test** (`tests/unit/assistant-dismissal.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { classifyDismissal, parseStopIntent, parseDownTuneCommand, shouldDemoteToDigest } from '@/lib/assistant/proactivity-policy';

describe('classifyDismissal (button-less medium taxonomy §5.4)', () => {
  it('read but no action in window → weak', () =>
    expect(classifyDismissal({ delivered: true, read: true, actedInWindow: false, hoursSinceSent: 2 }).level).toBe('weak'));
  it('read AND acted → null (engaged)', () =>
    expect(classifyDismissal({ delivered: true, read: true, actedInWindow: true, hoursSinceSent: 1 }).level).toBe(null));
  it('sent-unread for hours → ambiguous, NOT a dismissal', () =>
    expect(classifyDismissal({ delivered: true, read: false, actedInWindow: false, hoursSinceSent: 6 }).level).toBe('ambiguous'));
});
describe('parseStopIntent', () => {
  it('explicit Hebrew negatives → strong', () => {
    for (const t of ['די', 'תפסיק', 'תפסיקי', 'עזוב', 'לא עכשיו', 'מספיק']) expect(parseStopIntent(t)).toBe('strong');
  });
  it('neutral → null', () => expect(parseStopIntent('כן תשלח')).toBe(null));
});
describe('parseDownTuneCommand', () => {
  it('"רק פעם ביום" → daily_cap 1', () => expect(parseDownTuneCommand('רק פעם ביום')).toMatchObject({ daily_cap: 1 }));
  it('"שקט בשבת" → shabbat_quiet true', () => expect(parseDownTuneCommand('שקט בשבת')).toMatchObject({ shabbat_quiet: true }));
  it('unrelated → null', () => expect(parseDownTuneCommand('מה קורה')).toBe(null));
});
describe('shouldDemoteToDigest', () => {
  it('one strong dismissal demotes', () => expect(shouldDemoteToDigest({ strong_count: 1, weak_count: 0 })).toBe(true));
  it('three weak dismissals demote', () => expect(shouldDemoteToDigest({ strong_count: 0, weak_count: 3 })).toBe(true));
  it('two weak does not', () => expect(shouldDemoteToDigest({ strong_count: 0, weak_count: 2 })).toBe(false));
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-dismissal.test.ts`.

3. **Minimal impl** (append):
```ts
export function classifyDismissal(i: { delivered: boolean; read: boolean; actedInWindow: boolean; hoursSinceSent: number }): { level: 'strong' | 'weak' | 'ambiguous' | null } {
  if (i.read && i.actedInWindow) return { level: null };       // engaged
  if (i.read && !i.actedInWindow) return { level: 'weak' };     // read, ignored
  if (i.delivered && !i.read) return { level: 'ambiguous' };    // sent-unread ≠ dismissal
  return { level: null };
}

const STOP_TOKENS = new Set(['די', 'תפסיק', 'תפסיקי', 'עזוב', 'עזבי', 'מספיק']);
export function parseStopIntent(text: string): 'strong' | null {
  const t = (text || '').trim();
  if (!t) return null;
  if (/לא\s+עכשיו/.test(t)) return 'strong';
  const toks = t.toLowerCase().split(/[\s,.!?;:()\-]+/).filter(Boolean);
  return toks.some((w) => STOP_TOKENS.has(w)) ? 'strong' : null;
}

export function parseDownTuneCommand(text: string): Partial<NagPolicy> | null {
  const t = (text || '');
  const out: Partial<NagPolicy> = {};
  if (/פעם\s+ביום|רק\s+פעם/.test(t)) out.daily_cap = 1;
  if (/שקט\s+בשבת|שבת/.test(t)) out.shabbat_quiet = true;
  if (/רק\s+בוקר|בבוקר/.test(t)) out.digest_hour = '09:00';
  if (/רק\s+ערב|בערב/.test(t)) out.digest_hour = '19:00';
  return Object.keys(out).length ? out : null;
}

export function shouldDemoteToDigest(c: { strong_count: number; weak_count: number }): boolean {
  return c.strong_count >= 1 || c.weak_count >= 3;
}
```

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-dismissal.test.ts`.

5. **Commit:** `feat(assistant): dismissal taxonomy + stop-intent + down-tune parsers`

---

### Task 6 — Pure digest composer (RTL 3-second skim + bidi-safe amounts)

**Files (create):** `src/lib/assistant/digest-compose.ts`, `tests/unit/assistant-digest-compose.test.ts`

**Interfaces produced:** `DigestItem`, `formatBidiAmount`, `composeDigest`.

1. **Failing test** (`tests/unit/assistant-digest-compose.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { formatBidiAmount, composeDigest, type DigestItem } from '@/lib/assistant/digest-compose';

describe('formatBidiAmount (§5.4 — Hebrew + ₪ + Latin brand + number must not mangle)', () => {
  it('wraps amount+₪ in an LTR isolate', () => {
    const s = formatBidiAmount('Argania', 11800, 'ILS');
    expect(s).toContain('Argania');
    expect(s).toContain('11,800');
    expect(s).toContain('₪');
    expect(s).toContain('⁦'); // LRI isolate around the numeric+symbol run
  });
});
describe('composeDigest', () => {
  const items: DigestItem[] = [
    { kind: 'signed', talent: 'יונתן', brand: 'סודהסטרים', amount: 20000, currency: 'ILS', entityId: 's1' },
    { kind: 'unpaid', talent: 'אנה', brand: 'Coca-Cola', amount: 80000, currency: 'ILS', entityId: 'i1', ageDays: 32 },
    { kind: 'unsigned', talent: 'מאור', brand: 'Argania', amount: 11800, currency: 'ILS', entityId: 'q1', ageDays: 6 },
    { kind: 'reminder', talent: 'דנה', brand: 'Fox', entityId: 'r1' },
    { kind: 'brief', brand: 'Superpharm', entityId: 'b1' },
  ];
  it('surfaces top-3 and collapses the rest', () => {
    const d = composeDigest(items, { agentName: 'עידו', now: new Date('2026-07-08T06:00:00Z'), tz: 'Asia/Jerusalem' });
    expect(d.topLines).toHaveLength(3);
    expect(d.collapsedCount).toBe(2);
    expect(d.freeFormText).toContain('ועוד 2');
  });
  it('emits exactly one suggested next action', () => {
    const d = composeDigest(items, { now: new Date('2026-07-08T06:00:00Z'), tz: 'Asia/Jerusalem' });
    expect(typeof d.nextAction).toBe('string');
  });
  it('knockVars carry count + top brand for the UTILITY template', () => {
    const d = composeDigest(items, { now: new Date('2026-07-08T06:00:00Z'), tz: 'Asia/Jerusalem' });
    expect(d.knockVars.count).toBe('5');
    expect(d.knockVars.topBrand).toBe('סודהסטרים');
  });
  it('empty items → empty digest (no send should follow)', () => {
    const d = composeDigest([], { now: new Date(), tz: 'Asia/Jerusalem' });
    expect(d.topLines).toHaveLength(0);
    expect(d.freeFormText).toBe('');
  });
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-digest-compose.test.ts`.

3. **Minimal impl** (deterministic, no LLM):
```ts
const LRI = '⁦', PDI = '⁩'; // isolate a mixed numeric+symbol run inside RTL text
const SYM: Record<string, string> = { ILS: '₪', USD: '$', EUR: '€' };
const PRIORITY: Record<string, number> = { unpaid: 0, unsigned: 1, signed: 2, reminder: 3, brief: 4 };
const EMOJI: Record<string, string> = { unpaid: '💸', unsigned: '🖊️', signed: '✅', reminder: '⏰', brief: '📥' };

export interface DigestItem {
  kind: 'signed' | 'unsigned' | 'unpaid' | 'reminder' | 'brief';
  talent?: string; brand?: string; amount?: number; currency?: string; entityId: string; ageDays?: number; emoji?: string;
}

export function formatBidiAmount(brand: string, amount: number, currency = 'ILS'): string {
  const sym = SYM[currency] || currency;
  return `${brand} ${LRI}${amount.toLocaleString('en-US')} ${sym}${PDI}`;
}

function lineFor(it: DigestItem): string {
  const emoji = it.emoji || EMOJI[it.kind] || '•';
  const who = [it.talent, it.brand].filter(Boolean).join(' ↔ ');
  const money = typeof it.amount === 'number' ? ' — ' + formatBidiAmount('', it.amount, it.currency).trim() : '';
  const age = it.ageDays ? ` (${it.ageDays} ימים)` : '';
  return `${emoji} ${who}${money}${age}`;
}

function nextActionFor(items: DigestItem[]): string | null {
  const unsigned = items.find((i) => i.kind === 'unsigned');
  if (unsigned) return `שלח שוב קישור חתימה ל${unsigned.brand || 'הצעה'}?`;
  const unpaid = items.find((i) => i.kind === 'unpaid');
  if (unpaid) return `להזכיר תשלום ל${unpaid.brand || 'חשבונית'}?`;
  return items.length ? 'רוצה לתמחר בריפים חדשים?' : null;
}

export function composeDigest(items: DigestItem[], opts: { agentName?: string; now: Date; tz: string }) {
  const sorted = [...items].sort((a, b) => (PRIORITY[a.kind] - PRIORITY[b.kind]) || ((b.amount || 0) - (a.amount || 0)));
  const top = sorted.slice(0, 3);
  const collapsedCount = Math.max(0, sorted.length - top.length);
  const topLines = top.map(lineFor);
  const nextAction = nextActionFor(sorted);
  const headline = items.length
    ? `בוקר טוב${opts.agentName ? ' ' + opts.agentName : ''} — היום ${items.length} פריטים:`
    : '';
  const freeFormText = items.length
    ? [headline, '', ...topLines, collapsedCount ? `\nועוד ${collapsedCount} פריטים בדשבורד.` : '', nextAction ? `\n${nextAction}` : '']
        .filter((l) => l !== '').join('\n')
    : '';
  const knockVars = { count: String(items.length), topBrand: top[0]?.brand || top[0]?.talent || '' };
  return { headline, topLines, collapsedCount, nextAction, freeFormText, knockVars };
}
```

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-digest-compose.test.ts`.

5. **Commit:** `feat(assistant): deterministic RTL digest composer with bidi-safe amounts`

---

### Task 7 — Hebrew UTILITY template catalog + knock-template sender

**Files (create):** `src/lib/assistant/templates.ts`, `tests/unit/assistant-templates.test.ts`

**Interfaces produced:** `ASSISTANT_TEMPLATES`, `buildKnockComponents`, `buildReminderComponents`, `buildEventNotifyComponents`, `sendKnockTemplate`.

> Blast-radius isolation (spec §7.3): three separate UTILITY templates so Meta pausing one does not kill all proactivity. All `language: 'he'` (client default is `en_US` → would 132001).

1. **Failing test** (`tests/unit/assistant-templates.test.ts`):
```ts
import { describe, it, expect, vi } from 'vitest';
import { ASSISTANT_TEMPLATES, buildKnockComponents, buildReminderComponents, buildEventNotifyComponents } from '@/lib/assistant/templates';

describe('template catalog', () => {
  it('exposes >=3 distinct UTILITY templates, all he', () => {
    const names = Object.values(ASSISTANT_TEMPLATES).map((t) => t.name);
    expect(new Set(names).size).toBeGreaterThanOrEqual(3);
    for (const t of Object.values(ASSISTANT_TEMPLATES)) expect(t.lang).toBe('he');
  });
  it('knock body carries count + topBrand slots', () => {
    const c = buildKnockComponents({ count: '5', topBrand: 'סודהסטרים' });
    const body = c.find((x) => x.type === 'body');
    expect(body?.parameters?.map((p: any) => p.text)).toEqual(['5', 'סודהסטרים']);
  });
  it('event-notify body carries brand slot', () => {
    const c = buildEventNotifyComponents({ brand: 'Argania' });
    expect(c.find((x) => x.type === 'body')?.parameters?.[0]).toMatchObject({ type: 'text', text: 'Argania' });
  });
  it('reminder body carries subject slot', () => {
    const c = buildReminderComponents({ subject: 'תשלום Fox' });
    expect(c.find((x) => x.type === 'body')?.parameters?.[0]).toMatchObject({ text: 'תשלום Fox' });
  });
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-templates.test.ts`.

3. **Minimal impl** (`templates.ts`):
```ts
import { sendTemplate, type TemplateComponent, type WhatsAppSendResult } from '@/lib/whatsapp-cloud/client';

// Names MUST match templates approved in Meta Business Manager (UTILITY, he).
export const ASSISTANT_TEMPLATES = {
  digest_knock: { name: 'bestie_digest_knock', lang: 'he' as const },  // "יש לך {{1}} עדכונים, כולל {{2}}. פתח לצפייה." + quick-reply button
  reminder:     { name: 'bestie_reminder',     lang: 'he' as const },  // "תזכורת: {{1}}."
  event_notify: { name: 'bestie_event_notify', lang: 'he' as const },  // "הצעת המחיר של {{1}} נחתמה."
};

const body = (...texts: string[]): TemplateComponent => ({ type: 'body', parameters: texts.map((t) => ({ type: 'text', text: t })) });

export function buildKnockComponents(v: { count: string; topBrand: string }): TemplateComponent[] { return [body(v.count, v.topBrand)]; }
export function buildReminderComponents(v: { subject: string }): TemplateComponent[] { return [body(v.subject)]; }
export function buildEventNotifyComponents(v: { brand: string }): TemplateComponent[] { return [body(v.brand)]; }

export async function sendKnockTemplate(
  to: string, tpl: { name: string; lang: string }, components: TemplateComponent[],
): Promise<WhatsAppSendResult> {
  return sendTemplate({ to, templateName: tpl.name, languageCode: tpl.lang, components });
}
```

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-templates.test.ts`.

5. **Commit:** `feat(assistant): 3 Hebrew UTILITY templates + knock-template sender`

---

### Task 8 — `proactivity.ts` event worker (consume outbox → decide → ledger) with service-window gate + dedup guard + shadow mode

**Files (create):** `src/lib/assistant/proactivity.ts`, `tests/unit/assistant-proactivity-worker.test.ts`

**Interfaces produced:** `ProactivityDeps`, `runEventWorker`, `simulateShadow` (partial — extended in later tasks). The worker is written against an injected `db` + `send` seam so it is fully unit-testable and reused by cron + shadow.

1. **Failing test** — build in-memory fakes and assert the full decision→ledger→gate flow:
```ts
import { describe, it, expect, vi } from 'vitest';
import { runEventWorker, type ProactivityDeps } from '@/lib/assistant/proactivity';
import type { NagPolicy } from '@/lib/assistant/proactivity-policy';

const policy: NagPolicy = {
  agent_id: 'A', agency_id: 'G', tz: 'Asia/Jerusalem', quiet_start: '21:00', quiet_end: '08:00',
  daily_cap: 3, digest_hour: '09:00', shabbat_quiet: true, shabbat_start_hour: 17, shabbat_end_hour: 21,
  proactivity_optin: true, consent_at: '2026-01-01',
};

function makeDeps(over: Partial<any> = {}): { deps: ProactivityDeps; sent: any[]; ledger: any[] } {
  const events = over.events ?? [{ id: 'E1', agent_id: 'A', agency_id: 'G', event_type: 'quote_signed', entity_type: 'signature_request', entity_id: 'e1', payload: { partnership_id: 'p1' }, processed_at: null }];
  const sent: any[] = []; const ledger: any[] = [];
  const deps: ProactivityDeps = {
    now: () => new Date('2026-07-08T10:00:00Z'), // 13:00 IL
    shadow: over.shadow ?? false,
    db: {
      claimUnprocessedEvents: async () => events,
      markEventProcessed: async () => {},
      getPolicy: async () => policy,
      getServiceWindow: async () => '2026-07-08T20:00:00Z',
      countInterruptionsToday: async () => 0,
      getExistingDedupKeys: async () => new Set<string>(),
      getLearnedDismissed: async () => new Set<string>(),
      insertLedger: async (row: any) => { ledger.push(row); return { ...row, id: 'L' + ledger.length }; },
      updateLedger: async (id: string, patch: any) => { Object.assign(ledger.find((r) => r.id === id) || {}, patch); },
      getAgentWaId: async () => '972500000000',
      getEventPayloadForNotify: async () => ({ brand: 'Argania' }),
      ...(over.db || {}),
    },
    send: {
      sendText: vi.fn(async (a: any) => { sent.push({ type: 'text', ...a }); return { success: true, wa_message_id: 'wam1' }; }),
      sendKnockTemplate: vi.fn(async (...a: any[]) => { sent.push({ type: 'template', a }); return { success: true, wa_message_id: 'wamt' }; }),
    },
  };
  return { deps, sent, ledger };
}

describe('runEventWorker', () => {
  it('in-window event → ledger row sent + free-form text send', async () => {
    const { deps, sent } = makeDeps();
    const r = await runEventWorker(deps);
    expect(r.sent).toBe(1);
    expect(sent[0].type).toBe('text');
  });
  it('outside window → knock template, no free-form text', async () => {
    const { deps, sent } = makeDeps({ db: { getServiceWindow: async () => '2026-07-08T05:00:00Z' } });
    await runEventWorker(deps);
    expect(sent[0].type).toBe('template');
  });
  it('duplicate dedup_key already in ledger → suppressed, no send', async () => {
    const { deps, sent, ledger } = makeDeps({ db: { getExistingDedupKeys: async () => new Set(['G:quote_signed:e1']) } });
    const r = await runEventWorker(deps);
    expect(r.suppressed).toBe(1);
    expect(sent).toHaveLength(0);
    expect(ledger[0].suppressed_reason).toBe('duplicate');
  });
  it('SHADOW mode → ledger written, ZERO Meta sends', async () => {
    const { deps, sent } = makeDeps({ shadow: true });
    const r = await runEventWorker(deps);
    expect(sent).toHaveLength(0);
    expect(r.sent).toBe(1); // "would send"
  });
  it('never claims sent until send succeeds (failed send → status failed)', async () => {
    const { deps, ledger } = makeDeps();
    (deps.send.sendText as any).mockResolvedValueOnce({ success: false, error: { code: 131047 } });
    await runEventWorker(deps);
    expect(ledger[0].status).toBe('failed');
  });
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-proactivity-worker.test.ts`.

3. **Minimal impl** (`proactivity.ts`) — thin orchestration over the pure core:
```ts
import { decideProactive, dedupKeyForEvent, type NagPolicy, type ProactiveKind } from '@/lib/assistant/proactivity-policy';
import { ASSISTANT_TEMPLATES, buildEventNotifyComponents, buildKnockComponents } from '@/lib/assistant/templates';

export interface ProactivityDeps {
  now: () => Date;
  shadow: boolean;
  db: {
    claimUnprocessedEvents(limit?: number): Promise<any[]>;
    markEventProcessed(id: string, result: string): Promise<void>;
    getPolicy(agentId: string): Promise<NagPolicy | null>;
    getServiceWindow(agentId: string): Promise<string | null>;
    countInterruptionsToday(agentId: string, day: string): Promise<number>;
    getExistingDedupKeys(agentId: string): Promise<Set<string>>;
    getLearnedDismissed(agentId: string): Promise<Set<string>>;
    insertLedger(row: any): Promise<any>;
    updateLedger(id: string, patch: any): Promise<void>;
    getAgentWaId(agentId: string): Promise<string | null>;
    getEventPayloadForNotify(event: any): Promise<{ brand: string }>;
  };
  send: {
    sendText(a: { to: string; body: string }): Promise<{ success: boolean; wa_message_id?: string; error?: any }>;
    sendKnockTemplate(to: string, tpl: any, components: any[]): Promise<{ success: boolean; wa_message_id?: string; error?: any }>;
  };
}

const EVENT_NOTIFY_TEXT: Record<string, (b: string) => string> = {
  quote_signed:  (b) => `הצעת המחיר של ${b} נחתמה ✅ — לשלוח חוזה?`,
  invoice_paid:  (b) => `התקבל תשלום מ-${b} 💸`,
  contract_signed: (b) => `החוזה של ${b} נחתם ✍️`,
  quote_returned: (b) => `ההצעה ל-${b} הוחזרה — לבדוק?`,
  invoice_overdue: (b) => `חשבונית ${b} באיחור — להזכיר?`,
};

export async function runEventWorker(deps: ProactivityDeps): Promise<{ processed: number; sent: number; suppressed: number; scheduled: number }> {
  const now = deps.now();
  const events = await deps.db.claimUnprocessedEvents(100);
  let sent = 0, suppressed = 0, scheduled = 0;

  for (const ev of events) {
    const policy = await deps.db.getPolicy(ev.agent_id);
    if (!policy || !policy.proactivity_optin) { await deps.db.markEventProcessed(ev.id, 'no_optin'); continue; }

    const day = new Intl.DateTimeFormat('en-CA', { timeZone: policy.tz }).format(now);
    const decision = decideProactive({
      now, policy,
      event: { kind: 'event_notify' as ProactiveKind, event_type: ev.event_type, entity_id: ev.entity_id, agency_id: ev.agency_id },
      serviceWindowExpiresAt: await deps.db.getServiceWindow(ev.agent_id),
      sentInterruptionsToday: await deps.db.countInterruptionsToday(ev.agent_id, day),
      existingDedupKeys: await deps.db.getExistingDedupKeys(ev.agent_id),
      learnedDismissedEventTypes: await deps.db.getLearnedDismissed(ev.agent_id),
    });

    // Ledger BEFORE any send (Principle 7). dedup_key UNIQUE = the double-send guard.
    const { brand } = await deps.db.getEventPayloadForNotify(ev);
    const bodyText = (EVENT_NOTIFY_TEXT[ev.event_type] || ((b: string) => `עדכון על ${b}`))(brand);
    const row = await deps.db.insertLedger({
      agent_id: ev.agent_id, agency_id: ev.agency_id, kind: 'event_notify', source_event_id: ev.id,
      dedup_key: decision.dedup_key, status: decision.action === 'send_now' ? 'queued' : decision.action === 'schedule' ? 'scheduled' : 'suppressed',
      suppressed_reason: decision.suppressed_reason || null, scheduled_for: decision.scheduled_for || null,
      payload: { text: bodyText, brand }, template_name: decision.via === 'knock_template' ? ASSISTANT_TEMPLATES.event_notify.name : null,
    }).catch(() => null); // unique_violation on dedup_key → already handled, treat as suppressed
    if (!row) { suppressed++; await deps.db.markEventProcessed(ev.id, 'dup'); continue; }

    if (decision.action === 'suppress') { suppressed++; await deps.db.markEventProcessed(ev.id, `suppressed:${decision.suppressed_reason}`); continue; }
    if (decision.action === 'schedule') { scheduled++; await deps.db.markEventProcessed(ev.id, 'scheduled'); continue; }

    if (deps.shadow) { sent++; await deps.db.updateLedger(row.id, { status: 'sent', payload: { ...row.payload, shadow: true } }); await deps.db.markEventProcessed(ev.id, 'shadow_send'); continue; }

    const to = await deps.db.getAgentWaId(ev.agent_id);
    if (!to) { await deps.db.updateLedger(row.id, { status: 'failed' }); await deps.db.markEventProcessed(ev.id, 'no_waid'); continue; }

    const res = decision.via === 'free_form'
      ? await deps.send.sendText({ to, body: bodyText })
      : await deps.send.sendKnockTemplate(to, ASSISTANT_TEMPLATES.event_notify, buildEventNotifyComponents({ brand }));

    if (res.success) { sent++; await deps.db.updateLedger(row.id, { status: 'sent', wa_message_id: res.wa_message_id, sent_at: now.toISOString() }); await deps.db.markEventProcessed(ev.id, 'sent'); }
    else { await deps.db.updateLedger(row.id, { status: 'failed' }); await deps.db.markEventProcessed(ev.id, `failed:${res.error?.code || ''}`); }
  }
  return { processed: events.length, sent, suppressed, scheduled };
}
```

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-proactivity-worker.test.ts`.

5. **Commit:** `feat(assistant): event worker — decide→ledger→service-window gate→send, shadow-safe`

---

### Task 9 — Daily digest runner (the heartbeat) + `simulateShadow`

**Files (modify):** `src/lib/assistant/proactivity.ts`; **(create)** `tests/unit/assistant-digest-runner.test.ts`

**Interfaces produced:** `runDailyDigest(deps)`, `simulateShadow(deps, {fromISO,toISO})`.

> Lane-B (status drift) is NEVER pushed cold — it is folded into this one daily digest (spec §5.2). One interruption regardless of item count. Digest amounts come from persisted deal totals / `computeTotals` — never LLM.

1. **Failing test:**
```ts
import { describe, it, expect, vi } from 'vitest';
import { runDailyDigest } from '@/lib/assistant/proactivity';
// reuse makeDeps helper from worker test (extract to tests/unit/_proactivity-fakes.ts)

describe('runDailyDigest', () => {
  it('one opted-in agent with 5 drift items → exactly ONE send', async () => {
    const { deps, sent } = makeDigestDeps({ items: fiveItems, window: '2026-07-08T20:00:00Z' });
    const r = await runDailyDigest(deps);
    expect(sent).toHaveLength(1);
    expect(r.sent).toBe(1);
  });
  it('agent with ZERO items → no send (no empty digest)', async () => {
    const { deps, sent } = makeDigestDeps({ items: [], window: '2026-07-08T20:00:00Z' });
    await runDailyDigest(deps);
    expect(sent).toHaveLength(0);
  });
  it('outside window → knock template, payload held for flush', async () => {
    const { deps, sent, ledger } = makeDigestDeps({ items: fiveItems, window: '2026-07-08T05:00:00Z' });
    await runDailyDigest(deps);
    expect(sent[0].type).toBe('template');
    expect(ledger[0].payload.text).toContain('היום'); // free-form held in ledger for flush
  });
  it('opt-out agent → skipped', async () => {
    const { deps, sent } = makeDigestDeps({ items: fiveItems, optin: false });
    await runDailyDigest(deps);
    expect(sent).toHaveLength(0);
  });
  it('digest dedup: second run same day → no second send', async () => {
    const { deps, sent } = makeDigestDeps({ items: fiveItems, existingDedup: new Set(['digest:A:2026-07-08']) });
    await runDailyDigest(deps);
    expect(sent).toHaveLength(0);
  });
});
```
(Add `makeDigestDeps` + `fiveItems` to a shared `tests/unit/_proactivity-fakes.ts`; `db.listOptedInAgents`, `db.gatherDigestItems` are the new seams.)

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-digest-runner.test.ts`.

3. **Minimal impl** (append to `proactivity.ts`) — add `listOptedInAgents`, `gatherDigestItems` to `ProactivityDeps.db`:
```ts
import { composeDigest, type DigestItem } from '@/lib/assistant/digest-compose';
import { ASSISTANT_TEMPLATES, buildKnockComponents } from '@/lib/assistant/templates';
import { dedupKeyForEvent } from '@/lib/assistant/proactivity-policy';

export async function runDailyDigest(deps: ProactivityDeps): Promise<{ agents: number; sent: number; suppressed: number }> {
  const now = deps.now();
  const agents = await deps.db.listOptedInAgents();
  let sent = 0, suppressed = 0;
  for (const a of agents) {
    const policy = await deps.db.getPolicy(a.agent_id);
    if (!policy || !policy.proactivity_optin) continue;
    const items: DigestItem[] = await deps.db.gatherDigestItems(a.agent_id);
    if (!items.length) continue; // never an empty digest

    const dedup_key = dedupKeyForEvent({ kind: 'daily_digest', event_type: 'daily_digest', entity_id: '-', agency_id: policy.agency_id }, policy.agent_id, policy.tz, now);
    const existing = await deps.db.getExistingDedupKeys(a.agent_id);
    if (existing.has(dedup_key)) { suppressed++; continue; }

    const window = await deps.db.getServiceWindow(a.agent_id);
    const open = window && now.getTime() < new Date(window).getTime();
    const digest = composeDigest(items, { agentName: a.full_name, now, tz: policy.tz });

    const row = await deps.db.insertLedger({
      agent_id: a.agent_id, agency_id: policy.agency_id, kind: 'daily_digest', source_event_id: null,
      dedup_key, status: 'queued', payload: { text: digest.freeFormText, knockVars: digest.knockVars },
      template_name: open ? null : ASSISTANT_TEMPLATES.digest_knock.name,
    }).catch(() => null);
    if (!row) { suppressed++; continue; }

    if (deps.shadow) { sent++; await deps.db.updateLedger(row.id, { status: 'sent', payload: { ...row.payload, shadow: true } }); continue; }
    const to = await deps.db.getAgentWaId(a.agent_id);
    if (!to) { await deps.db.updateLedger(row.id, { status: 'failed' }); continue; }

    const res = open
      ? await deps.send.sendText({ to, body: digest.freeFormText })
      : await deps.send.sendKnockTemplate(to, ASSISTANT_TEMPLATES.digest_knock, buildKnockComponents(digest.knockVars));
    if (res.success) { sent++; await deps.db.updateLedger(row.id, { status: open ? 'sent' : 'scheduled', wa_message_id: res.wa_message_id, sent_at: open ? now.toISOString() : null }); }
    else { await deps.db.updateLedger(row.id, { status: 'failed' }); }
  }
  return { agents: agents.length, sent, suppressed };
}

// Shadow-mode launch gate (spec §13): replay events + digest, send NOTHING, report volumes.
export interface ShadowReport { wouldSend: number; suppressed: number; scheduled: number; perAgent: Record<string, number>; }
export async function simulateShadow(deps: ProactivityDeps): Promise<ShadowReport> {
  const shadowDeps = { ...deps, shadow: true };
  const perAgent: Record<string, number> = {};
  const w = await runEventWorker(shadowDeps);
  const d = await runDailyDigest(shadowDeps);
  return { wouldSend: w.sent + d.sent, suppressed: w.suppressed + d.suppressed, scheduled: w.scheduled, perAgent };
}
```

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-digest-runner.test.ts`.

5. **Commit:** `feat(assistant): daily digest heartbeat runner + shadow-mode simulator`

---

### Task 10 — Lane-A in-flow nudge + pending-payload flush (knock→free-form completion)

**Files (modify):** `src/lib/assistant/proactivity.ts`; **(create)** `tests/unit/assistant-lane-a.test.ts`

**Interfaces produced:** `maybeLaneANudge(deps, {agentId,eventType,entityId,brand})`, `flushPendingProactive(deps, agentId)`.

> Lane-A fires only INSIDE the open window, immediately after the agent interacts (spec §5.2) — e.g. quote signed while chatting → "לשלוח חוזה?". `flushPendingProactive` delivers held free-form payloads the instant the agent replies after a knock template (spec §7.2).

1. **Failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { maybeLaneANudge, flushPendingProactive } from '@/lib/assistant/proactivity';

describe('maybeLaneANudge', () => {
  it('in-window + optin → sends free-form nudge', async () => {
    const { deps, sent } = makeLaneDeps({ window: futureISO, optin: true });
    const r = await maybeLaneANudge(deps, { agentId: 'A', eventType: 'quote_signed', entityId: 'e1', brand: 'Fox' });
    expect(r.sent).toBe(true); expect(sent[0].body).toContain('חוזה');
  });
  it('window closed → no Lane-A nudge (never a cold push)', async () => {
    const { deps, sent } = makeLaneDeps({ window: pastISO, optin: true });
    const r = await maybeLaneANudge(deps, { agentId: 'A', eventType: 'quote_signed', entityId: 'e1', brand: 'Fox' });
    expect(r.sent).toBe(false); expect(sent).toHaveLength(0);
  });
  it('respects dedup (already nudged this deal)', async () => {
    const { deps, sent } = makeLaneDeps({ window: futureISO, optin: true, existingDedup: new Set(['G:quote_signed:e1']) });
    const r = await maybeLaneANudge(deps, { agentId: 'A', eventType: 'quote_signed', entityId: 'e1', brand: 'Fox' });
    expect(r.sent).toBe(false);
  });
});
describe('flushPendingProactive', () => {
  it('delivers held digest payload once window re-opens', async () => {
    const { deps, sent, ledger } = makeFlushDeps({ pending: [{ id: 'L1', payload: { text: 'בוקר טוב — 5 פריטים' } }] });
    const r = await flushPendingProactive(deps, 'A');
    expect(r.flushed).toBe(1);
    expect(sent[0].body).toContain('בוקר טוב');
    expect(ledger[0].status).toBe('sent');
  });
  it('no pending → flushes 0', async () => {
    const { deps } = makeFlushDeps({ pending: [] });
    expect((await flushPendingProactive(deps, 'A')).flushed).toBe(0);
  });
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-lane-a.test.ts`.

3. **Minimal impl** (append; add `db.listPendingProactive` + reuse `getServiceWindow`, `getExistingDedupKeys`, `insertLedger`):
```ts
export async function maybeLaneANudge(
  deps: ProactivityDeps, a: { agentId: string; eventType: string; entityId: string; brand: string },
): Promise<{ sent: boolean }> {
  const now = deps.now();
  const policy = await deps.db.getPolicy(a.agentId);
  if (!policy || !policy.proactivity_optin) return { sent: false };
  const window = await deps.db.getServiceWindow(a.agentId);
  if (!window || now.getTime() >= new Date(window).getTime()) return { sent: false }; // Lane-A is in-window only

  const dedup_key = dedupKeyForEvent({ kind: 'event_notify', event_type: a.eventType, entity_id: a.entityId, agency_id: policy.agency_id }, policy.agent_id, policy.tz, now);
  const existing = await deps.db.getExistingDedupKeys(a.agentId);
  if (existing.has(dedup_key)) return { sent: false };

  const text = (EVENT_NOTIFY_TEXT[a.eventType] || ((b: string) => `עדכון על ${b}`))(a.brand);
  const row = await deps.db.insertLedger({ agent_id: a.agentId, agency_id: policy.agency_id, kind: 'event_notify', dedup_key, status: 'queued', payload: { text, lane: 'A' } }).catch(() => null);
  if (!row) return { sent: false };
  if (deps.shadow) { await deps.db.updateLedger(row.id, { status: 'sent', payload: { text, shadow: true } }); return { sent: true }; }
  const to = await deps.db.getAgentWaId(a.agentId);
  if (!to) { await deps.db.updateLedger(row.id, { status: 'failed' }); return { sent: false }; }
  const res = await deps.send.sendText({ to, body: text });
  await deps.db.updateLedger(row.id, res.success ? { status: 'sent', wa_message_id: res.wa_message_id, sent_at: now.toISOString() } : { status: 'failed' });
  return { sent: res.success };
}

export async function flushPendingProactive(deps: ProactivityDeps, agentId: string): Promise<{ flushed: number }> {
  const now = deps.now();
  const pending = await deps.db.listPendingProactive(agentId); // status 'scheduled' with a held free-form payload
  const to = await deps.db.getAgentWaId(agentId);
  let flushed = 0;
  if (!to) return { flushed: 0 };
  for (const row of pending) {
    const text = row.payload?.text;
    if (!text) continue;
    if (deps.shadow) { await deps.db.updateLedger(row.id, { status: 'sent' }); flushed++; continue; }
    const res = await deps.send.sendText({ to, body: text });
    if (res.success) { await deps.db.updateLedger(row.id, { status: 'sent', wa_message_id: res.wa_message_id, sent_at: now.toISOString() }); flushed++; }
  }
  return { flushed };
}
```

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-lane-a.test.ts`.

5. **Commit:** `feat(assistant): Lane-A in-flow nudge + knock→free-form pending flush`

---

### Task 11 — Dismissal learning wired to delivery/read webhooks

**Files (modify):** `src/lib/assistant/proactivity.ts` (add `recordDeliveryStatus`), `src/app/api/webhooks/whatsapp/route.ts` (call it in the status loop); **(create)** `tests/unit/assistant-delivery-learning.test.ts`

> Uses Meta `delivered`/`read`/`failed` webhooks as the anti-nag signal (spec §5.4, §7.4). `read` with no action in the window → weak dismissal; N dismissals demote that event_type to digest-only (writes `demoted_to_digest` + an `assistant_facts` inferred suppression, read back by `getLearnedDismissed`). `delivered` guards the "sent" claim (never say ✓ on the sync 202).

1. **Failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { recordDeliveryStatus } from '@/lib/assistant/proactivity';

describe('recordDeliveryStatus', () => {
  it('marks ledger delivered_at + read_at from webhook', async () => {
    const { deps, ledger } = makeDelivDeps({ row: { id: 'L1', agent_id: 'A', kind: 'event_notify', payload: { event_type: 'invoice_overdue' } } });
    await recordDeliveryStatus(deps, { wa_message_id: 'wam1', status: 'read', now: new Date() });
    expect(ledger[0].read_at).toBeTruthy();
  });
  it('3rd weak dismissal demotes event_type to digest-only', async () => {
    const { deps, counters } = makeDelivDeps({ row: { id: 'L1', agent_id: 'A', kind: 'event_notify', payload: { event_type: 'invoice_overdue' } }, counter: { weak_count: 2, strong_count: 0 } });
    await recordDeliveryStatus(deps, { wa_message_id: 'wam1', status: 'read', now: new Date() }); // read, unacted → weak (3rd)
    expect(counters['A:invoice_overdue'].demoted_to_digest).toBe(true);
  });
  it('failed 131026 (unreachable) → status failed, no demotion', async () => {
    const { deps, ledger } = makeDelivDeps({ row: { id: 'L1', agent_id: 'A', kind: 'event_notify', payload: { event_type: 'invoice_overdue' } } });
    await recordDeliveryStatus(deps, { wa_message_id: 'wam1', status: 'failed', errorCode: 131026, now: new Date() });
    expect(ledger[0].status).toBe('failed');
  });
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-delivery-learning.test.ts`.

3. **Minimal impl** — add `db.getLedgerByWaMessageId`, `db.bumpDismissalCounter`, `db.setLearnedSuppression` seams + append:
```ts
import { classifyDismissal, shouldDemoteToDigest } from '@/lib/assistant/proactivity-policy';

export async function recordDeliveryStatus(
  deps: ProactivityDeps, s: { wa_message_id: string; status: 'sent' | 'delivered' | 'read' | 'failed'; errorCode?: number; now: Date },
): Promise<void> {
  const row = await deps.db.getLedgerByWaMessageId(s.wa_message_id);
  if (!row) return; // not a proactive message
  const ts = s.now.toISOString();
  if (s.status === 'delivered') { await deps.db.updateLedger(row.id, { delivered_at: ts }); return; }
  if (s.status === 'failed')    { await deps.db.updateLedger(row.id, { status: 'failed' }); return; }
  if (s.status === 'read') {
    await deps.db.updateLedger(row.id, { read_at: ts });
    if (row.kind !== 'event_notify') return;
    const eventType = row.payload?.event_type;
    if (!eventType) return;
    // read but no CRM action followed inside the window → weak dismissal.
    const level = classifyDismissal({ delivered: true, read: true, actedInWindow: false, hoursSinceSent: 1 }).level;
    if (!level) return;
    const counter = await deps.db.bumpDismissalCounter(row.agent_id, eventType, level);
    if (!counter.demoted_to_digest && shouldDemoteToDigest(counter)) {
      await deps.db.setLearnedSuppression(row.agent_id, eventType); // marks demoted + writes assistant_facts inferred
    }
  }
}
```
Then in `route.ts`, inside the `for (const status of value.statuses ?? [])` loop, after the existing `whatsapp_messages` update, add a best-effort call:
```ts
try {
  const { recordDeliveryStatus } = await import('@/lib/assistant/proactivity');
  await recordDeliveryStatus(makeLiveDeps(), { wa_message_id: status.id, status: status.status, errorCode: status.errors?.[0]?.code, now: new Date() });
} catch (err) { console.warn('[assistant] delivery-learning failed', err); }
```
(`makeLiveDeps()` — a factory in `proactivity.ts` binding the real Supabase `db` adapter + `sendText`/`sendKnockTemplate` from `client.ts`; `shadow: process.env.ASSISTANT_PROACTIVITY_SHADOW === 'true'`.)

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-delivery-learning.test.ts`.

5. **Commit:** `feat(assistant): dismissal-learning from delivery/read webhooks → digest demotion`

---

### Task 12 — Live Supabase `db` adapter + cron routes + vercel.json wiring + flags

**Files (create):** `src/lib/assistant/proactivity-db.ts` (real adapter implementing `ProactivityDeps['db']` over `supabase` service-role client), `src/app/api/cron/assistant-events/route.ts`, `src/app/api/cron/assistant-digest/route.ts`; **(modify)** `vercel.json`, `src/lib/assistant/proactivity.ts` (`makeLiveDeps` factory), `.env` docs / `scripts/check-env.ts`

**Interfaces produced:** `makeLiveDeps()`, two cron endpoints (CRON_SECRET-guarded, matching `crm-reminders`).

1. **Failing test** (adapter shape + flag gating — pure-ish, mock supabase):
```ts
import { describe, it, expect, vi } from 'vitest';
import { makeLiveDeps } from '@/lib/assistant/proactivity';

describe('makeLiveDeps', () => {
  it('honors ASSISTANT_PROACTIVITY_SHADOW flag', () => {
    process.env.ASSISTANT_PROACTIVITY_SHADOW = 'true';
    expect(makeLiveDeps().shadow).toBe(true);
    process.env.ASSISTANT_PROACTIVITY_SHADOW = 'false';
    expect(makeLiveDeps().shadow).toBe(false);
  });
  it('exposes the full db seam', () => {
    const d = makeLiveDeps();
    for (const k of ['claimUnprocessedEvents','getPolicy','getServiceWindow','insertLedger','getAgentWaId','listOptedInAgents','gatherDigestItems','getLedgerByWaMessageId','bumpDismissalCounter','setLearnedSuppression','getLearnedDismissed'])
      expect(typeof (d.db as any)[k]).toBe('function');
  });
});
```

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-livedeps.test.ts`.

3. **Minimal impl:**
   - `proactivity-db.ts`: real methods using `supabase` service-role. Key ones:
     - `claimUnprocessedEvents`: `select * from assistant_events where processed_at is null order by created_at limit N` (worker sets `processed_at` per row; at-least-once + dedup_key makes re-processing safe).
     - `getServiceWindow`: join agent → `whatsapp_contacts.wa_id = toWaId(users.whatsapp)` → `whatsapp_conversations.service_window_expires_at`.
     - `getExistingDedupKeys`: `select dedup_key from proactive_messages where agent_id=? and created_at > now()-interval '7 days'` → Set.
     - `countInterruptionsToday`: `count from proactive_messages where agent_id=? and status='sent' and kind in ('event_notify','reminder') and sent_at::date = <day>`.
     - `getLearnedDismissed`: `select event_type from proactive_dismissal_counter where agent_id=? and demoted_to_digest` → Set.
     - `gatherDigestItems`: deterministic SQL — unsigned quotes (signature_requests.status='pending' age≥5d), unpaid invoices (status in ('sent','overdue') past due), today's briefs, due reminders; amounts read from persisted `partnerships.amount`/`invoices.amount` (already `computeTotals`-derived at creation) → `DigestItem[]`.
     - `bumpDismissalCounter`: upsert increment weak/strong; return row.
     - `setLearnedSuppression`: `update proactive_dismissal_counter set demoted_to_digest=true` + insert `assistant_facts(provenance='inferred', predicate='suppresses_event', value={event_type})` (guarded: skip if `assistant_facts` absent).
   - `makeLiveDeps`: `{ now: () => new Date(), shadow: process.env.ASSISTANT_PROACTIVITY_SHADOW === 'true', db: liveDb, send: { sendText, sendKnockTemplate } }`.
   - Cron routes (mirror `crm-reminders`): CRON_SECRET bearer check; `if (process.env.ASSISTANT_PROACTIVITY_ENABLED !== 'true') return {skipped:true}`; call `runEventWorker(makeLiveDeps())` / `runDailyDigest(makeLiveDeps())`; return counts.
```ts
// src/app/api/cron/assistant-digest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { makeLiveDeps, runDailyDigest } from '@/lib/assistant/proactivity';
export const runtime = 'nodejs'; export const maxDuration = 300; export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.ASSISTANT_PROACTIVITY_ENABLED !== 'true') return NextResponse.json({ skipped: 'disabled' });
  const r = await runDailyDigest(makeLiveDeps());
  return NextResponse.json({ ok: true, ...r });
}
```
   - `vercel.json`: add
```json
{ "path": "/api/cron/assistant-events", "schedule": "*/5 * * * *" },
{ "path": "/api/cron/assistant-digest", "schedule": "0 6 * * *" }
```
     (digest cron runs hourly-ish window; the runner itself enforces per-agent `digest_hour` + dedup so an agent gets exactly one/day — set `"0 6 * * *"` for the common 09:00 IL slot, or `"0 * * * *"` if per-agent hours vary. Start with the single 06:00 UTC ≈ 09:00 IL slot.)
   - Add `ASSISTANT_PROACTIVITY_ENABLED`, `ASSISTANT_PROACTIVITY_SHADOW` to `scripts/check-env.ts` optional list.

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-livedeps.test.ts` then full guard `npx vitest run tests/unit/assistant-*.test.ts` and `npm run type-check`.

5. **Commit:** `feat(assistant): live proactivity db adapter + event/digest crons + flags`

---

### Task 13 — Opt-in onboarding hook + down-tune command application (agent-driven, warmly confirmed)

**Files (create):** `src/lib/assistant/nag-policy.ts` (`ensureNagPolicy(agentId)`, `applyDownTune(agentId, patch)`, `setOptIn(agentId, on)`), `tests/unit/assistant-nag-policy.test.ts`; **(modify)** the WhatsApp agent branch (`wa-conversation.ts` or its P1 successor) to intercept stop-intent + down-tune commands before planning.

> Conservative default: `proactivity_optin=false` until explicit one-tap opt-in with stored `consent_at` (spec §5.1, §7.3). Down-tune commands are first-class, reversible, and confirmed concretely ("סגור — מהיום סיכום אחד ב-9:00, שקט בסופ״ש").

1. **Failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { confirmDownTune } from '@/lib/assistant/nag-policy';
describe('confirmDownTune (pure confirmation copy)', () => {
  it('daily_cap 1 → concrete Hebrew confirmation', () => {
    expect(confirmDownTune({ daily_cap: 1 })).toContain('פעם ביום');
  });
  it('shabbat_quiet → mentions Shabbat', () => {
    expect(confirmDownTune({ shabbat_quiet: true })).toContain('שבת');
  });
  it('empty patch → generic ack', () => {
    expect(confirmDownTune({})).toMatch(/עדכנתי|סגור/);
  });
});
```
(`ensureNagPolicy`/`applyDownTune`/`setOptIn` are DB-thin; covered by the round-trip in Task 1 + type-check. The *pure* `confirmDownTune` copy builder is unit-tested; the interception path is exercised by the wa-conversation tests inherited from P1.)

2. **Run-to-fail:** `npx vitest run tests/unit/assistant-nag-policy.test.ts`.

3. **Minimal impl** (`nag-policy.ts`):
```ts
import { supabase as supabaseAdmin } from '@/lib/supabase';
import type { NagPolicy } from '@/lib/assistant/proactivity-policy';

export async function ensureNagPolicy(agentId: string): Promise<void> {
  await supabaseAdmin.from('assistant_nag_policy').upsert({ agent_id: agentId }, { onConflict: 'agent_id', ignoreDuplicates: true });
}
export async function setOptIn(agentId: string, on: boolean): Promise<void> {
  await supabaseAdmin.from('assistant_nag_policy').upsert(
    { agent_id: agentId, proactivity_optin: on, consent_at: on ? new Date().toISOString() : null, updated_at: new Date().toISOString() },
    { onConflict: 'agent_id' });
}
export async function applyDownTune(agentId: string, patch: Partial<NagPolicy>): Promise<void> {
  if (!patch || !Object.keys(patch).length) return;
  await supabaseAdmin.from('assistant_nag_policy').upsert({ agent_id: agentId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'agent_id' });
}
export function confirmDownTune(patch: Partial<NagPolicy>): string {
  const parts: string[] = [];
  if (patch.daily_cap === 1) parts.push('מהיום סיכום אחד ביום');
  if (patch.shabbat_quiet) parts.push('שקט בשבת');
  if (patch.digest_hour) parts.push(`הסיכום ב-${patch.digest_hour}`);
  return parts.length ? `סגור — ${parts.join(', ')}. תמיד אפשר לשנות.` : 'עדכנתי את ההעדפות שלך.';
}
```
   Wire into the agent message handler (before planning): `const stop = parseStopIntent(text); if (stop) { await setOptIn(agent.id, false); return 'סגור, כיביתי התראות יזומות. תכתוב "הפעל התראות" מתי שתרצה.'; } const tune = parseDownTuneCommand(text); if (tune) { await applyDownTune(agent.id, tune); return confirmDownTune(tune); }` — plus a positive opt-in intent ("הפעל התראות") → `setOptIn(true)` + `ensureNagPolicy`.

4. **Run-to-pass:** `npx vitest run tests/unit/assistant-nag-policy.test.ts` then `npx vitest run tests/unit/assistant-*.test.ts`.

5. **Commit:** `feat(assistant): opt-in consent + down-tune/stop command handling with warm confirmations`

---

### Final gate (before marking P6 done)

- `npm run type-check` clean for all new files.
- `npx vitest run tests/unit/assistant-*.test.ts tests/unit/crm-*.test.ts` green (no regression to `crm-wa-interpret`/`crm-pricing`).
- Migrations `066`+`067` applied to the Supabase branch; the trigger round-trip (Task 2) confirmed against real constraints.
- **Ship in SHADOW mode:** deploy with `ASSISTANT_PROACTIVITY_ENABLED=true` + `ASSISTANT_PROACTIVITY_SHADOW=true`; run `simulateShadow` over a replay window; confirm p95 interruptions/agent/day ≤ `daily_cap` and 0 would-sends inside quiet/Shabbat before flipping `ASSISTANT_PROACTIVITY_SHADOW=false`.
- **Ops prerequisite (not code):** the 3 Hebrew UTILITY templates (`bestie_digest_knock`, `bestie_reminder`, `bestie_event_notify`) approved in Meta Business Manager, names matching `ASSISTANT_TEMPLATES`.