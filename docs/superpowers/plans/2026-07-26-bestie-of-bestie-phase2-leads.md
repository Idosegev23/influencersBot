# Bestie of Bestie — Phase 2 (Meta leads → WhatsApp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lead who fills the Meta form gets a WhatsApp message within seconds, has a real conversation with Bestie about Bestie, and reaches a salesperson's inbox with a summary and the full transcript.

**Architecture:** Make posts the lead to `/api/leads/meta-ads` (live today as capture-only). The route normalises and stores it, then sends the approved intro template. The lead's reply opens the 24-hour window and lands in a **fifth webhook branch** placed before customer service, which queues to a per-`wa_id` FIFO drained by a worker running `runBestieTurn` — a brain-led tool loop modelled on `runCsTurn`. When the brain calls `handoff_to_sales`, one email goes to five recipients and the bot goes silent on that conversation.

**Tech Stack:** TypeScript, Next.js 16, Supabase, Upstash Redis (queue + locks), OpenAI, WhatsApp Cloud API, Vitest.

**Spec:** [docs/superpowers/specs/2026-07-26-bestie-of-bestie-design.md](../specs/2026-07-26-bestie-of-bestie-design.md) §7
**Depends on:** [Phase 1](2026-07-26-bestie-of-bestie-phase1-core.md) — shipped. Account `ce19805e-7f00-429d-af20-f1e479d04ce6`, 32 knowledge chunks, `findRedactionViolations`.

## Global Constraints

- **The boundary (spec §5.1):** Bestie answers about **Bestie** — the product's surface, not its engine, not other customers. Phase 1 enforced this at ingest; **this phase must enforce it in the system prompt.**
- **Bestie never states a price — by policy, not because knowledge is missing** (spec §6.2). No figure, no range, no "starting from", no confirming a number the lead floated. Pricing happens with a salesperson. `content/bestie-kb/pricing.md` contains no numbers and never should; do not "complete" it. This is the highest-stakes rule in the phase: a number Bestie says is a commitment someone has to honour.
- **No consent gate.** Every lead in the form is messaged. Ido's decision, recorded in spec §3.1. Do not add an opt-in check.
- **Templates (already submitted, PENDING):** `bestie_lead_intro_v1`, `bestie_lead_nudge_24h_v1`, `bestie_lead_nudge_72h_v1`. Language `he`, category `MARKETING`, body param `{{1}}` = lead first name, quick-reply buttons. Template **parameters** must not contain `\n`, `\t`, or 5+ consecutive spaces — `runTemplate()` in `src/lib/whatsapp-notify.ts` already sanitises.
- **Handoff recipients (exact):** `kfir@ldrsgroup.com`, `roei@ldrsgroup.com`, `itamar@ldrsgroup.com`, `cto@ldrsgroup.com`, `yoav@ldrsgroup.com`.
- **Branch ordering is a correctness property.** The Bestie branch goes *before* customer service and must never claim Itamar, a registered agent, or an open support ticket.
- **Scripts need Node 22** (`nvm use 22`) and must build the client from `src/lib/supabase/server`, dynamically imported after `loadEnv({ path: '.env.local' })`.
- **Integration checks are scripts, not tests.** `tests/setup.ts` sets `global.fetch = vi.fn()` for the whole suite — nothing under vitest reaches a real service.
- **Commits:** straight to `main`, stage only the files the task touched.

---

### Task 1: Israeli phone normalisation

Meta returns whatever the lead typed. WhatsApp needs E.164 without `+`. Getting this wrong means the message silently goes nowhere.

**Files:**
- Create: `src/lib/bestie/phone.ts`
- Test: `tests/unit/bestie-phone.test.ts`

**Interfaces:**
- Produces: `export function normalizeIsraeliPhone(raw: string | null | undefined): string | null` — returns a WhatsApp `wa_id` (digits only, country code first, no `+`), or `null` when the input cannot be a valid mobile number.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeIsraeliPhone } from '@/lib/bestie/phone';

describe('normalizeIsraeliPhone', () => {
  it('accepts the formats Israelis actually type', () => {
    expect(normalizeIsraeliPhone('0501234567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('050-123-4567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('050 123 4567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('+972501234567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('972-50-1234567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('00972501234567')).toBe('972501234567');
  });

  it('handles a local number written without the leading zero', () => {
    expect(normalizeIsraeliPhone('501234567')).toBe('972501234567');
  });

  it('keeps a non-Israeli number that already carries a country code', () => {
    expect(normalizeIsraeliPhone('+1 415 555 0123')).toBe('14155550123');
  });

  it('rejects what cannot be dialled', () => {
    expect(normalizeIsraeliPhone('')).toBeNull();
    expect(normalizeIsraeliPhone(null)).toBeNull();
    expect(normalizeIsraeliPhone('   ')).toBeNull();
    expect(normalizeIsraeliPhone('12345')).toBeNull();          // too short
    expect(normalizeIsraeliPhone('לא מספר')).toBeNull();
    expect(normalizeIsraeliPhone('03-1234567')).toBeNull();     // landline, not WhatsApp
  });

  it('rejects the placeholder Meta sends for test leads', () => {
    expect(normalizeIsraeliPhone('<test lead: dummy data for מספר_טלפון>')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-phone.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/phone`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Meta hands back whatever the lead typed into the form. WhatsApp wants E.164
 * digits with no plus. A number that fails to normalise must return null rather
 * than a best guess: sending to a wrong number is worse than not sending, and a
 * silent failure here looks exactly like a lead who ignored us.
 *
 * Israeli mobile prefixes are 05X. Landlines (02/03/04/08/09) are rejected —
 * they cannot receive WhatsApp, so treating them as valid just burns a template.
 */
export function normalizeIsraeliPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);       // 00972… → 972…

  // Already Israeli with country code: 972 + 9 digits, mobile only.
  if (digits.startsWith('972')) {
    const local = digits.slice(3);
    return /^5\d{8}$/.test(local) ? `972${local}` : null;
  }

  // Local Israeli mobile: 05X-XXXXXXX (10 digits).
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;

  // Local Israeli mobile typed without the leading zero (9 digits).
  if (/^5\d{8}$/.test(digits)) return `972${digits}`;

  // Israeli landline — valid number, cannot receive WhatsApp.
  if (/^0[23489]\d{7,8}$/.test(digits)) return null;

  // Anything else is only usable if it already looks like a full international
  // number. 10 digits is the shortest real E.164 we should accept.
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-phone.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/phone.ts tests/unit/bestie-phone.test.ts
git commit -m "feat(bestie): normalise the phone formats Israeli lead forms actually produce"
```

---

### Task 2: Lead and session tables

**Files:**
- Create: `supabase/migrations/071_bestie_leads.sql`

**Interfaces:**
- Produces: tables `bestie_leads` and `bestie_lead_sessions`, both used by every later task.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/071_bestie_leads.sql`:

```sql
-- Bestie lead funnel: Meta instant-form leads and their WhatsApp conversations.
--
-- Split in two on purpose. bestie_leads is the durable record of a person who
-- filled a form — it outlives any conversation. bestie_lead_sessions is the
-- live conversation state keyed by wa_id, which is what the webhook has in hand
-- when a message arrives and all it can look up by.

create table if not exists public.bestie_leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Meta identity. leadgen_id is unique so a webhook redelivery is a no-op.
  leadgen_id    text unique,
  form_id       text,
  -- Empty on Meta test leads, populated in production. Never depend on these.
  ad_id         text,
  adset_id      text,
  campaign_id   text,

  full_name     text,
  email         text,
  phone_raw     text,          -- exactly what Meta sent, for debugging
  wa_id         text,          -- normalised; null when the number was unusable

  raw_payload   jsonb not null default '{}'::jsonb,

  -- pending  → stored, template not sent yet
  -- greeted  → intro template sent
  -- engaged  → the lead replied at least once
  -- handed_off → email sent to sales; the bot is silent on this conversation
  -- unresponsive → both nudges sent, no reply
  -- undeliverable → no usable phone number
  status        text not null default 'pending'
                check (status in ('pending','greeted','engaged','handed_off','unresponsive','undeliverable')),

  greeted_at      timestamptz,
  nudge_24h_at    timestamptz,
  nudge_72h_at    timestamptz,
  last_inbound_at timestamptz,
  handed_off_at   timestamptz,

  -- What the brain learned: business type, size, what they want, urgency.
  qualification jsonb not null default '{}'::jsonb
);

create index if not exists bestie_leads_wa_id_idx     on public.bestie_leads (wa_id);
create index if not exists bestie_leads_status_idx    on public.bestie_leads (status);
create index if not exists bestie_leads_created_at_idx on public.bestie_leads (created_at desc);

-- Conversation state, keyed the way the webhook can find it.
create table if not exists public.bestie_lead_sessions (
  wa_id                 text primary key,
  lead_id               uuid references public.bestie_leads(id) on delete cascade,
  chat_session_id       uuid,
  -- Set when handoff fires. The worker refuses to reply while true, so a
  -- salesperson never finds the bot still working the thread beside them.
  bot_paused            boolean not null default false,
  bot_paused_reason     text,
  context               jsonb not null default '{}'::jsonb,
  last_activity_at      timestamptz not null default now(),
  version               integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists bestie_lead_sessions_lead_id_idx on public.bestie_lead_sessions (lead_id);

alter table public.bestie_leads         enable row level security;
alter table public.bestie_lead_sessions enable row level security;

revoke all on public.bestie_leads         from anon, authenticated;
revoke all on public.bestie_lead_sessions from anon, authenticated;
```

- [ ] **Step 2: Apply it**

Apply via the Supabase MCP `apply_migration` tool with name `bestie_leads`, or `npx supabase db push`.

- [ ] **Step 3: Verify**

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name like 'bestie_%';
```

Expected: `bestie_leads`, `bestie_lead_sessions`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/071_bestie_leads.sql
git commit -m "feat(bestie): lead and conversation-session tables"
```

---

### Task 3: Map a Meta payload to a lead

Pure mapping, separated from the route so the field-name handling is testable without HTTP.

**Files:**
- Create: `src/lib/bestie/lead-intake.ts`
- Test: `tests/unit/bestie-lead-intake.test.ts`

**Interfaces:**
- Consumes: `normalizeIsraeliPhone` (Task 1).
- Produces:
  - `export interface MappedLead { leadgenId: string | null; formId: string | null; adId: string | null; adsetId: string | null; campaignId: string | null; fullName: string | null; firstName: string | null; email: string | null; phoneRaw: string | null; waId: string | null; deliverable: boolean }`
  - `export function mapMetaLead(payload: Record<string, any>): MappedLead`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { mapMetaLead } from '@/lib/bestie/lead-intake';

// Shape confirmed from a real Meta test lead, 2026-07-26.
const realTestLead = {
  ad_id: '', email: 'test@meta.com', form_id: '1816400769736719',
  adset_id: '', form_name: '', full_name: '<test lead: dummy data for שם_מלא>',
  leadgen_id: '1726215075243575', campaign_id: '',
  created_time: '2026-07-26T13:47:53.000Z',
  phone_number: '<test lead: dummy data for מספר_טלפון>',
};

describe('mapMetaLead', () => {
  it('maps a production-shaped lead', () => {
    const mapped = mapMetaLead({
      full_name: 'ישראל ישראלי', phone_number: '050-123-4567',
      email: 'israel@example.com', form_id: '1816400769736719',
      leadgen_id: 'L1', ad_id: 'A1', adset_id: 'S1', campaign_id: 'C1',
    });
    expect(mapped.waId).toBe('972501234567');
    expect(mapped.firstName).toBe('ישראל');
    expect(mapped.deliverable).toBe(true);
    expect(mapped.campaignId).toBe('C1');
  });

  it('marks a Meta test lead undeliverable instead of messaging a placeholder', () => {
    const mapped = mapMetaLead(realTestLead);
    expect(mapped.waId).toBeNull();
    expect(mapped.deliverable).toBe(false);
    expect(mapped.leadgenId).toBe('1726215075243575');
  });

  it('treats empty attribution fields as absent, not as empty strings', () => {
    const mapped = mapMetaLead(realTestLead);
    expect(mapped.adId).toBeNull();
    expect(mapped.adsetId).toBeNull();
    expect(mapped.campaignId).toBeNull();
  });

  it('accepts the alternate field names Make setups produce', () => {
    const mapped = mapMetaLead({ name: 'דנה כהן', phone: '0521112222' });
    expect(mapped.fullName).toBe('דנה כהן');
    expect(mapped.waId).toBe('972521112222');
  });

  it('derives a usable first name, falling back when there is no name', () => {
    expect(mapMetaLead({ full_name: 'דנה כהן לוי' }).firstName).toBe('דנה');
    expect(mapMetaLead({}).firstName).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-lead-intake.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/lead-intake`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Turn whatever Make posts into a lead we can act on.
 *
 * Field names vary with how the Make scenario was wired, so each value is read
 * from a small set of aliases rather than one hard-coded key. Attribution IDs
 * come back as empty strings on Meta test leads and are normalised to null so
 * nothing downstream mistakes "" for a real campaign.
 */
import { normalizeIsraeliPhone } from './phone';

export interface MappedLead {
  leadgenId: string | null;
  formId: string | null;
  adId: string | null;
  adsetId: string | null;
  campaignId: string | null;
  fullName: string | null;
  firstName: string | null;
  email: string | null;
  phoneRaw: string | null;
  waId: string | null;
  deliverable: boolean;
}

function pick(payload: Record<string, any>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function firstNameOf(fullName: string | null): string | null {
  if (!fullName) return null;
  // Meta's test-lead placeholders are not names and must not be greeted by one.
  if (fullName.startsWith('<test lead')) return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first || null;
}

export function mapMetaLead(payload: Record<string, any>): MappedLead {
  const fullName = pick(payload, 'full_name', 'fullName', 'name', 'שם_מלא');
  const phoneRaw = pick(payload, 'phone_number', 'phoneNumber', 'phone', 'מספר_טלפון');
  const waId = normalizeIsraeliPhone(phoneRaw);

  return {
    leadgenId: pick(payload, 'leadgen_id', 'leadgenId', 'id'),
    formId: pick(payload, 'form_id', 'formId'),
    adId: pick(payload, 'ad_id', 'adId'),
    adsetId: pick(payload, 'adset_id', 'adsetId'),
    campaignId: pick(payload, 'campaign_id', 'campaignId'),
    fullName: fullName && !fullName.startsWith('<test lead') ? fullName : null,
    firstName: firstNameOf(fullName),
    email: pick(payload, 'email', 'email_address'),
    phoneRaw,
    waId,
    deliverable: Boolean(waId),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-lead-intake.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/lead-intake.ts tests/unit/bestie-lead-intake.test.ts
git commit -m "feat(bestie): map a Meta lead payload to a lead we can act on"
```

---

### Task 4: Intake route stores the lead and sends the intro template

Turns the capture-only endpoint into the real intake. Keep writing to `meta_lead_captures` — it stays useful for debugging Make.

**Files:**
- Modify: `src/app/api/leads/meta-ads/route.ts`
- Create: `src/lib/bestie/lead-greeting.ts`
- Test: `tests/unit/bestie-lead-greeting.test.ts`

**Interfaces:**
- Consumes: `mapMetaLead` (Task 3), `runTemplate` pattern from `src/lib/whatsapp-notify.ts`.
- Produces: `export async function sendLeadIntro(p: { waId: string; firstName: string | null }): Promise<{ success: boolean }>` and `export function introTemplateParams(firstName: string | null): string[]`.

- [ ] **Step 1: Write the failing test for the parameter builder**

```typescript
import { describe, it, expect } from 'vitest';
import { introTemplateParams } from '@/lib/bestie/lead-greeting';

describe('introTemplateParams', () => {
  it('uses the first name when there is one', () => {
    expect(introTemplateParams('ישראל')).toEqual(['ישראל']);
  });

  it('falls back to a neutral greeting rather than an empty parameter', () => {
    // Meta rejects an empty template parameter outright.
    expect(introTemplateParams(null)).toEqual(['שלום']);
    expect(introTemplateParams('   ')).toEqual(['שלום']);
  });

  it('strips what Meta rejects inside a parameter', () => {
    // Error 132018: no newlines, tabs, or runs of 5+ spaces.
    expect(introTemplateParams('דנה\nכהן')).toEqual(['דנה כהן']);
    expect(introTemplateParams('דנה\t\tכהן')).toEqual(['דנה כהן']);
    expect(introTemplateParams('דנה      כהן')).toEqual(['דנה כהן']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-lead-greeting.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/lead-greeting`.

- [ ] **Step 3: Write the greeting module**

Read `src/lib/whatsapp-notify.ts` first — copy how `runTemplate` is called and how the outbound is persisted, rather than calling the Graph API directly.

```typescript
/**
 * The opening move.
 *
 * After a form fill there is no open conversation, so this must be a template.
 * bestie_lead_intro_v1 carries quick-reply buttons because the tap is itself an
 * inbound message — and that inbound is what opens the 24h window in which the
 * bot can finally speak freely.
 */
import { runTemplate } from '@/lib/whatsapp-notify';

export const INTRO_TEMPLATE = 'bestie_lead_intro_v1';

/**
 * Meta rejects a template parameter containing newlines, tabs, or 5+ spaces
 * (error 132018), and rejects an empty one outright.
 */
export function introTemplateParams(firstName: string | null): string[] {
  const cleaned = (firstName ?? '').replace(/[\n\t]+/g, ' ').replace(/ {5,}/g, ' ').trim();
  return [cleaned || 'שלום'];
}

export async function sendLeadIntro(p: {
  waId: string;
  firstName: string | null;
}): Promise<{ success: boolean }> {
  return runTemplate({
    to: p.waId,
    template: INTRO_TEMPLATE,
    language: 'he',
    bodyParams: introTemplateParams(p.firstName),
  } as any);
}
```

> `runTemplate` is module-private in `whatsapp-notify.ts` today. Export it, or add
> a `sendBestieLeadIntro` beside the other `send*` helpers in that file and call
> it from here. Follow whichever matches the file's existing shape — do not
> duplicate the Graph call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-lead-greeting.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Upgrade the route**

In `src/app/api/leads/meta-ads/route.ts`, after the existing capture insert, add:

```typescript
    // Capture stays — it is what let us design against a real payload, and it
    // remains the fastest way to see what Make is actually sending.
    const mapped = mapMetaLead(body ?? {});

    // leadgen_id is unique, so Meta's at-least-once delivery is a no-op here.
    const { data: lead } = await supabase
      .from('bestie_leads')
      .upsert(
        {
          leadgen_id: mapped.leadgenId,
          form_id: mapped.formId,
          ad_id: mapped.adId,
          adset_id: mapped.adsetId,
          campaign_id: mapped.campaignId,
          full_name: mapped.fullName,
          email: mapped.email,
          phone_raw: mapped.phoneRaw,
          wa_id: mapped.waId,
          raw_payload: body ?? {},
          status: mapped.deliverable ? 'pending' : 'undeliverable',
        },
        { onConflict: 'leadgen_id', ignoreDuplicates: false }
      )
      .select('id, status, greeted_at')
      .single();

    // Greet in the background so Make gets its 200 immediately. Only once —
    // greeted_at guards a redelivery that slipped past the upsert.
    if (lead && mapped.deliverable && !lead.greeted_at) {
      after(async () => {
        const sent = await sendLeadIntro({ waId: mapped.waId!, firstName: mapped.firstName });
        if (sent.success) {
          await supabase.from('bestie_leads')
            .update({ status: 'greeted', greeted_at: new Date().toISOString() })
            .eq('id', lead.id);
          await supabase.from('bestie_lead_sessions')
            .upsert({ wa_id: mapped.waId!, lead_id: lead.id }, { onConflict: 'wa_id' });
        }
      });
    }
```

Add the imports at the top: `after` from `next/server`, `mapMetaLead` from `@/lib/bestie/lead-intake`, `sendLeadIntro` from `@/lib/bestie/lead-greeting`. Add `export const maxDuration = 60;` so the `after()` callback has room.

Extend the JSON response with `leadId: lead?.id ?? null` and `deliverable: mapped.deliverable`.

- [ ] **Step 6: Verify with a real test lead**

**Do not test by inventing a payload** — use Meta's Lead Ads Testing Tool
(`developers.facebook.com/tools/lead-ads-testing`) against form `1816400769736719`
so the whole Make chain runs.

Expected: the response shows `deliverable: false` (test leads carry a placeholder
phone), a `bestie_leads` row lands with `status='undeliverable'`, and **no WhatsApp
message is sent**. That is the correct outcome and proves the guard works.

Then verify a real send by posting a payload with your own phone number:

```bash
curl -s -X POST https://bestie.ldrsgroup.com/api/leads/meta-ads \
  -H 'Content-Type: application/json' -H "X-Bestie-Secret: $META_LEADS_WEBHOOK_SECRET" \
  -d '{"full_name":"בדיקה","phone_number":"05XXXXXXXX","leadgen_id":"manual-test-1"}'
```

Expected: the intro template arrives on that phone. **This requires the template to
be APPROVED** — check with `scripts/` or Business Manager first.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/leads/meta-ads/route.ts src/lib/bestie/lead-greeting.ts tests/unit/bestie-lead-greeting.test.ts src/lib/whatsapp-notify.ts
git commit -m "feat(bestie): intake stores the lead and sends the intro template"
```

---

### Task 5: Queue, lock and drain for the lead conversation

Mirrors the customer-service pipeline on its own Redis namespace. **Read these three files and mirror them, changing only the namespace and the job type** — they encode redelivery guards and lock handling that are easy to get subtly wrong:

- `src/lib/cs/wa-cs-queue.ts` → `src/lib/bestie/wa-lead-queue.ts` (`cs:wa:` → `bestie:wa:`)
- `src/lib/cs/wa-cs-locks.ts` → `src/lib/bestie/wa-lead-locks.ts`
- `src/lib/cs/wa-cs-publish.ts` → `src/lib/bestie/wa-lead-publish.ts`

**Files:**
- Create: the three modules above
- Create: `src/app/api/bestie/lead-worker/route.ts` (mirror `src/app/api/cs/wa-worker/route.ts`)
- Test: `tests/unit/bestie-lead-queue.test.ts`

**Interfaces:**
- Produces:
  - `export interface BestieLeadJob { waId: string; msg: any; textBody: string | null; leadId?: string | null; attempt?: number }`
  - `export async function enqueueLeadMessage(job: BestieLeadJob): Promise<{ enqueued: boolean; queueLen: number }>`
  - `export async function dequeueLeadMessage(waId: string): Promise<BestieLeadJob | null>`
  - `export async function acquireLeadLock(waId: string): Promise<boolean>` / `releaseLeadLock(waId: string): Promise<void>`
  - `export async function publishLeadDrain(waId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Model it on `tests/unit/crm-wa-agent-queue.test.ts`, which already mocks `@/lib/redis`. The behaviour that must be asserted:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: Record<string, string[]> = {};
const setnx: Record<string, boolean> = {};

vi.mock('@/lib/redis', () => ({
  redisRPush: vi.fn(async (key: string, items: string[]) => {
    store[key] = [...(store[key] ?? []), ...items];
    return store[key].length;
  }),
  redisLPopCount: vi.fn(async (key: string, count: number) => (store[key] ?? []).splice(0, count)),
  redisLLen: vi.fn(async (key: string) => (store[key] ?? []).length),
  redisSetNx: vi.fn(async (key: string) => (setnx[key] ? false : (setnx[key] = true))),
  redisDel: vi.fn(async () => 1),
  redisGet: vi.fn(async () => null),
}));

import { enqueueLeadMessage, dequeueLeadMessage } from '@/lib/bestie/wa-lead-queue';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(setnx)) delete setnx[k];
});

describe('lead queue', () => {
  it('queues a message and hands it back in arrival order', async () => {
    await enqueueLeadMessage({ waId: '972501234567', msg: { id: 'm1' }, textBody: 'שלום' });
    await enqueueLeadMessage({ waId: '972501234567', msg: { id: 'm2' }, textBody: 'עוד' });
    expect((await dequeueLeadMessage('972501234567'))!.textBody).toBe('שלום');
    expect((await dequeueLeadMessage('972501234567'))!.textBody).toBe('עוד');
  });

  it('makes a redelivered webhook a no-op', async () => {
    const job = { waId: '972501234567', msg: { id: 'same' }, textBody: 'היי' };
    expect((await enqueueLeadMessage(job)).enqueued).toBe(true);
    expect((await enqueueLeadMessage(job)).enqueued).toBe(false);
  });

  it('keeps two leads in separate queues', async () => {
    await enqueueLeadMessage({ waId: '972500000001', msg: { id: 'a' }, textBody: 'A' });
    await enqueueLeadMessage({ waId: '972500000002', msg: { id: 'b' }, textBody: 'B' });
    expect((await dequeueLeadMessage('972500000001'))!.textBody).toBe('A');
    expect(await dequeueLeadMessage('972500000001')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-lead-queue.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/wa-lead-queue`.

- [ ] **Step 3: Write the three modules**

Copy each CS file and change the key prefix from `cs:wa:` to `bestie:wa:` and the
job type to `BestieLeadJob`. Keep the per-`wamid` SETNX guard exactly as it is —
that is what makes Meta's at-least-once delivery safe.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-lead-queue.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/wa-lead-queue.ts src/lib/bestie/wa-lead-locks.ts src/lib/bestie/wa-lead-publish.ts src/app/api/bestie/lead-worker/route.ts tests/unit/bestie-lead-queue.test.ts
git commit -m "feat(bestie): per-lead FIFO queue, lock and drain endpoint"
```

---

### Task 6: The fifth webhook branch

The highest-risk change in this phase: it edits a file that four production flows run through. The test matters more than the code.

**Files:**
- Create: `src/lib/bestie/route-inbound-lead.ts`
- Modify: `src/app/api/webhooks/whatsapp/route.ts`
- Test: `tests/unit/bestie-webhook-branch.test.ts`

**Interfaces:**
- Consumes: `enqueueLeadMessage`, `publishLeadDrain` (Task 5).
- Produces:
  - `export async function routeInboundToBestieLead(input: { waId: string; contactId: string | null; msg: any; textBody: string | null }): Promise<{ claimed: boolean }>`
  - `export async function maybeRouteBestieLead(args: { isItamar: boolean; handledAsAgent: boolean; ticketId: string | null; waId: string; contactId: string | null; msg: any; textBody: string | null }): Promise<{ claimed: boolean }>` — returns `claimed: false` unless this `wa_id` has a lead session.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enqueue = vi.fn(async () => ({ enqueued: true, queueLen: 1 }));
const publish = vi.fn(async () => {});
let sessionRow: any = null;

vi.mock('@/lib/bestie/wa-lead-queue', () => ({ enqueueLeadMessage: enqueue }));
vi.mock('@/lib/bestie/wa-lead-publish', () => ({ publishLeadDrain: publish }));
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendReaction: vi.fn(async () => ({ success: true })),
  sendTyping: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sessionRow }) }) }),
    }),
  }),
}));

import { maybeRouteBestieLead } from '@/lib/bestie/route-inbound-lead';

const base = {
  isItamar: false, handledAsAgent: false, ticketId: null,
  waId: '972501234567', contactId: 'c1',
  msg: { id: 'm1', type: 'text' }, textBody: 'כן, ספרו לי',
};

beforeEach(() => { enqueue.mockClear(); publish.mockClear(); sessionRow = null; });

describe('the fifth branch', () => {
  it('claims an inbound from a known lead', async () => {
    sessionRow = { wa_id: '972501234567', lead_id: 'L1', bot_paused: false };
    expect((await maybeRouteBestieLead(base)).claimed).toBe(true);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('does not claim a stranger — that is customer service', async () => {
    sessionRow = null;
    expect((await maybeRouteBestieLead(base)).claimed).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  // These three protect flows already running in production.
  it('never claims Itamar', async () => {
    sessionRow = { wa_id: '972501234567', lead_id: 'L1', bot_paused: false };
    expect((await maybeRouteBestieLead({ ...base, isItamar: true })).claimed).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('never claims a registered agent', async () => {
    sessionRow = { wa_id: '972501234567', lead_id: 'L1', bot_paused: false };
    expect((await maybeRouteBestieLead({ ...base, handledAsAgent: true })).claimed).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('never claims a message that matched an open support ticket', async () => {
    sessionRow = { wa_id: '972501234567', lead_id: 'L1', bot_paused: false };
    expect((await maybeRouteBestieLead({ ...base, ticketId: 'T1' })).claimed).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('claims but stays silent once handed off to a salesperson', async () => {
    sessionRow = { wa_id: '972501234567', lead_id: 'L1', bot_paused: true };
    const result = await maybeRouteBestieLead(base);
    // Claimed so customer service does not pick it up, but not queued for a reply.
    expect(result.claimed).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-webhook-branch.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/route-inbound-lead`.

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * The fifth webhook branch: an inbound from someone who filled a Meta lead form.
 *
 * Sits BEFORE customer service. Both branches see an unknown sender, so the
 * discriminator is explicit — does this wa_id have a lead session? A lead asking
 * about Bestie is not a shopper asking about a brand, and must not reach the CS
 * brain, which would try to bind them to a client's store.
 *
 * The three "never claims" guards mirror the CS branch and exist to protect
 * flows already running in production.
 */
import { sendReaction, sendTyping } from '@/lib/whatsapp-cloud/client';
import { createClient } from '@/lib/supabase/server';
import { enqueueLeadMessage } from '@/lib/bestie/wa-lead-queue';
import { publishLeadDrain } from '@/lib/bestie/wa-lead-publish';

export async function routeInboundToBestieLead(input: {
  waId: string;
  contactId: string | null;
  msg: any;
  textBody: string | null;
  leadId?: string | null;
}): Promise<{ claimed: boolean }> {
  if (input.msg?.id) {
    void sendReaction({ to: input.waId, messageId: input.msg.id, emoji: '👀' }).catch(() => {});
    void sendTyping(input.msg.id).catch(() => {});
  }

  try {
    await enqueueLeadMessage({
      waId: input.waId,
      msg: input.msg,
      textBody: input.textBody,
      leadId: input.leadId ?? null,
    });
  } catch (e) {
    console.error('[bestie-lead] failed to enqueue', e);
    return { claimed: false };
  }

  try { await publishLeadDrain(input.waId); }
  catch (e) { console.error('[bestie-lead] publishLeadDrain failed (queued; next trigger drains)', e); }

  return { claimed: true };
}

export async function maybeRouteBestieLead(args: {
  isItamar: boolean;
  handledAsAgent: boolean;
  ticketId: string | null;
  waId: string;
  contactId: string | null;
  msg: any;
  textBody: string | null;
}): Promise<{ claimed: boolean }> {
  if (args.isItamar || args.handledAsAgent || args.ticketId) return { claimed: false };

  const supabase = createClient();
  const { data: session } = await supabase
    .from('bestie_lead_sessions')
    .select('wa_id, lead_id, bot_paused')
    .eq('wa_id', args.waId)
    .maybeSingle();

  if (!session) return { claimed: false };

  // Handed off: a human owns this thread now. Claim it so customer service does
  // not adopt the conversation, but say nothing.
  if (session.bot_paused) return { claimed: true };

  return routeInboundToBestieLead({
    waId: args.waId,
    contactId: args.contactId,
    msg: args.msg,
    textBody: args.textBody,
    leadId: session.lead_id,
  });
}
```

- [ ] **Step 4: Wire it into the webhook**

In `src/app/api/webhooks/whatsapp/route.ts`, immediately **before** the existing
`await maybeRouteCs({...})` call (around line 290), insert:

```typescript
        // 5th branch — a Meta lead replying to us. Must precede CS: both see an
        // unknown sender, and a lead is not a brand's shopper.
        const leadClaim = await maybeRouteBestieLead({
          isItamar: isItamarSender(waId),
          handledAsAgent,
          ticketId: ticketMatch,
          waId,
          contactId: contact.id,
          msg,
          textBody,
        });

        if (leadClaim.claimed) continue;
```

Import `maybeRouteBestieLead` from `@/lib/bestie/route-inbound-lead` at the top.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-webhook-branch.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Prove nothing that already works broke**

Run: `npx vitest run tests/unit/ 2>&1 | tail -5`

Expected: the same 5 pre-existing failures as before (`scans-list`, `agent-brain`,
`agent-tools`, `crm-wa-worker`, `pipeline/run-route`) and **no new ones**. If a CS
or support routing test fails, the branch ordering is wrong — fix it before moving on.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bestie/route-inbound-lead.ts src/app/api/webhooks/whatsapp/route.ts tests/unit/bestie-webhook-branch.test.ts
git commit -m "feat(bestie): fifth webhook branch for lead replies, ahead of customer service"
```

---

### Task 7: The brain and its tools

**Files:**
- Create: `src/lib/bestie/tools/types.ts`, `src/lib/bestie/tools/index.ts`
- Create: `src/lib/bestie/bestie-agent.ts`
- Test: `tests/unit/bestie-agent.test.ts`

**Interfaces:**
- Consumes: `retrieveContext` from `@/lib/rag`; `findRedactionViolations` (Phase 1).
- Produces:
  - `export interface BestieToolCtx { waId: string; leadId: string | null; accountId: string; chatSessionId: string | null; leadName: string | null }`
  - `export interface BestieToolResult { ok: boolean; data?: unknown; qualification?: Record<string, unknown>; handedOff?: boolean }`
  - `export interface BestieTurnResult { reply: { kind: 'text'; body: string } | { kind: 'none' }; handedOff: boolean }`
  - `export async function runBestieTurn(job: BestieLeadJob, deps?: Partial<BestieAgentDeps>): Promise<BestieTurnResult>`
  - `export const BESTIE_TOOL_DEFS: OpenAIFunctionDef[]`

Three tools:

| Tool | Purpose |
|---|---|
| `search_bestie_knowledge` | Retrieve from the Bestie account's chunks. The only source of factual claims. |
| `note_lead_detail` | Record what was learned (business type, size, need, urgency) onto `bestie_leads.qualification`. |
| `handoff_to_sales` | Email the five, mark the lead handed off, pause the bot. Terminal. |

- [ ] **Step 1: Write the failing test**

Model the injected-`callModel` style on `tests/unit/agent-brain.test.ts`.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runBestieTurn } from '@/lib/bestie/bestie-agent';

const job = { waId: '972501234567', msg: { id: 'm1' }, textBody: 'כמה זה עולה?', leadId: 'L1' };

describe('runBestieTurn', () => {
  it('calls a tool, then answers from what it returned', async () => {
    const turns = [
      { toolCalls: [{ name: 'search_bestie_knowledge', args: { query: 'מחיר' } }], text: null },
      { toolCalls: [], text: 'המחיר נקבע לפי היקף. אעביר אותך לאיש מכירות שייתן הצעה מדויקת.' },
    ];
    let i = 0;
    const result = await runBestieTurn(job as any, {
      callModel: async () => turns[i++] as any,
      runTool: async () => ({ ok: true, data: { sources: [] } }),
    });
    expect(result.reply.kind).toBe('text');
    expect(i).toBe(2);
  });

  it('goes silent after handoff — a salesperson owns the thread now', async () => {
    const turns = [
      { toolCalls: [{ name: 'handoff_to_sales', args: { summary: 'מוכן' } }], text: null },
      { toolCalls: [], text: 'תודה! נציג יחזור אליך.' },
    ];
    let i = 0;
    const result = await runBestieTurn(job as any, {
      callModel: async () => turns[i++] as any,
      runTool: async () => ({ ok: true, handedOff: true }),
    });
    expect(result.handedOff).toBe(true);
  });

  it('stops instead of looping forever when the model keeps calling tools', async () => {
    const result = await runBestieTurn(job as any, {
      callModel: async () => ({ toolCalls: [{ name: 'search_bestie_knowledge', args: {} }], text: null }),
      runTool: async () => ({ ok: true, data: {} }),
    });
    // A loop that never terminates burns tokens and leaves the lead unanswered.
    expect(['text', 'none']).toContain(result.reply.kind);
  }, 20_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-agent.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/bestie-agent`.

- [ ] **Step 3: Write the agent**

Read `src/lib/cs/cs-agent.ts` and mirror its loop: injected `callModel`, bounded
iterations, tool results fed back, final text returned. The system prompt must
carry these rules verbatim:

```
את בסטי. את עונה על שאלות על בסטי בלבד.

מה שאת יודעת: מה בסטי עושה, למי היא מתאימה, איך משתמשים בה, ומה קורה בכל מסך.
מה שאת לא יודעת ולא מנחשת: לקוחות אחרים, איך המערכת בנויה מבפנים, וכל דבר
שלא הופיע בידע שקיבלת.

מחירים: אם המחיר לא הופיע בידע — אל תנקבי במספר. תגידי שאיש מכירות ייתן הצעה
מדויקת ותציעי להעביר. מספר שתמציאי הופך להתחייבות שמישהו יצטרך לכבד.

כשהליד בשל — קרא ל-handoff_to_sales, תודי ותסיימי. אל תמשיכי לנהל את השיחה
אחרי זה.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-agent.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/bestie-agent.ts src/lib/bestie/tools/ tests/unit/bestie-agent.test.ts
git commit -m "feat(bestie): brain-led sales turn with knowledge, qualification and handoff tools"
```

---

### Task 8: Handoff email

**Files:**
- Create: `src/lib/bestie/handoff-email.ts`
- Test: `tests/unit/bestie-handoff-email.test.ts`

**Interfaces:**
- Consumes: `sendEmail` from `@/lib/email` (`{ to: string | string[]; subject: string; html: string }`).
- Produces:
  - `export const SALES_RECIPIENTS: string[]`
  - `export function buildHandoffEmail(p: { lead: any; summary: string; transcript: Array<{ role: string; text: string }> }): { subject: string; html: string }`
  - `export async function sendHandoffEmail(p: {...}): Promise<{ success: boolean }>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildHandoffEmail, SALES_RECIPIENTS } from '@/lib/bestie/handoff-email';

const lead = {
  full_name: 'ישראל ישראלי', wa_id: '972501234567', email: 'i@example.com',
  campaign_id: 'C1', qualification: { business: 'חנות בגדים', size: '3 עובדים' },
};
const transcript = [
  { role: 'user', text: 'כמה זה עולה?' },
  { role: 'assistant', text: 'תלוי בהיקף — אעביר אותך לאיש מכירות.' },
];

describe('buildHandoffEmail', () => {
  it('goes to all five recipients', () => {
    expect(SALES_RECIPIENTS).toEqual([
      'kfir@ldrsgroup.com', 'roei@ldrsgroup.com', 'itamar@ldrsgroup.com',
      'cto@ldrsgroup.com', 'yoav@ldrsgroup.com',
    ]);
  });

  it('puts the name and phone in the subject so it is actionable from a notification', () => {
    const { subject } = buildHandoffEmail({ lead, summary: 'מוכן לשיחה', transcript });
    expect(subject).toContain('ישראל ישראלי');
    expect(subject).toContain('972501234567');
  });

  it('carries the full transcript, not just the summary', () => {
    const { html } = buildHandoffEmail({ lead, summary: 'מוכן לשיחה', transcript });
    expect(html).toContain('כמה זה עולה?');
    expect(html).toContain('אעביר אותך לאיש מכירות');
    expect(html).toContain('מוכן לשיחה');
  });

  it('includes what was learned about the business', () => {
    const { html } = buildHandoffEmail({ lead, summary: 's', transcript });
    expect(html).toContain('חנות בגדים');
  });

  it('escapes user text so a lead cannot inject markup into the email', () => {
    const { html } = buildHandoffEmail({
      lead: { ...lead, full_name: '<script>alert(1)</script>' },
      summary: 's', transcript: [],
    });
    expect(html).not.toContain('<script>');
  });

  it('survives a lead with almost nothing filled in', () => {
    const { subject, html } = buildHandoffEmail({ lead: { wa_id: '972500000000' }, summary: '', transcript: [] });
    expect(subject).toBeTruthy();
    expect(html).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-handoff-email.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/handoff-email`.

- [ ] **Step 3: Write the implementation**

Escape every interpolated value. Recipients are a pinned constant — not env —
so a stray variable cannot silently redirect leads.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-handoff-email.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/handoff-email.ts tests/unit/bestie-handoff-email.test.ts
git commit -m "feat(bestie): handoff email with summary, qualification and full transcript"
```

---

### Task 9: Nudges and giving up

**Files:**
- Create: `src/lib/bestie/nudges.ts`
- Create: `src/app/api/cron/bestie-lead-nudge/route.ts`
- Modify: `vercel.json` (schedule)
- Test: `tests/unit/bestie-nudges.test.ts`

**Interfaces:**
- Produces: `export function selectNudge(lead: {...}, now: Date): 'nudge_24h' | 'nudge_72h' | 'give_up' | null`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { selectNudge } from '@/lib/bestie/nudges';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const now = new Date();

describe('selectNudge', () => {
  it('sends nothing before 24h have passed', () => {
    expect(selectNudge({ status: 'greeted', greeted_at: hoursAgo(3) } as any, now)).toBeNull();
  });

  it('sends the first nudge after 24h of silence', () => {
    expect(selectNudge({ status: 'greeted', greeted_at: hoursAgo(25) } as any, now)).toBe('nudge_24h');
  });

  it('sends the second after 72h', () => {
    expect(selectNudge(
      { status: 'greeted', greeted_at: hoursAgo(80), nudge_24h_at: hoursAgo(55) } as any, now
    )).toBe('nudge_72h');
  });

  it('gives up after the second nudge goes unanswered', () => {
    expect(selectNudge(
      { status: 'greeted', greeted_at: hoursAgo(130), nudge_24h_at: hoursAgo(105), nudge_72h_at: hoursAgo(30) } as any,
      now
    )).toBe('give_up');
  });

  it('never nudges someone who replied', () => {
    expect(selectNudge(
      { status: 'engaged', greeted_at: hoursAgo(50), last_inbound_at: hoursAgo(40) } as any, now
    )).toBeNull();
  });

  it('never nudges someone already handed to sales', () => {
    expect(selectNudge({ status: 'handed_off', greeted_at: hoursAgo(200) } as any, now)).toBeNull();
  });

  it('never nudges a lead we could not message in the first place', () => {
    expect(selectNudge({ status: 'undeliverable', greeted_at: null } as any, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-nudges.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/nudges`.

- [ ] **Step 3: Write the selector and the cron route**

The cron reads leads in `status='greeted'`, applies `selectNudge`, sends the
matching template via `runTemplate`, and stamps `nudge_24h_at` / `nudge_72h_at`.
On `give_up` it sets `status='unresponsive'` and emails sales once.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-nudges.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Schedule it**

Add to `vercel.json` alongside the existing crons — hourly is enough for
day-granularity thresholds:

```json
{ "path": "/api/cron/bestie-lead-nudge", "schedule": "0 * * * *" }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/bestie/nudges.ts src/app/api/cron/bestie-lead-nudge/route.ts vercel.json tests/unit/bestie-nudges.test.ts
git commit -m "feat(bestie): 24h and 72h nudges, then stop and tell sales"
```

---

### Task 10: End-to-end verification

**Files:**
- Create: `scripts/bestie-lead-e2e.ts`
- Modify: `package.json`

A script, not a test — it sends real WhatsApp messages.

- [ ] **Step 1: Write the script**

Takes a phone number as argv, posts a synthetic lead to the live intake, then
polls `bestie_leads` and prints each state transition so a human can watch the
funnel move and reply from their own phone.

```bash
npx tsx scripts/bestie-lead-e2e.ts 05XXXXXXXX
```

- [ ] **Step 2: Run the full funnel by hand**

1. Run the script with your own number.
2. Confirm the intro template arrives.
3. Tap **"כן, ספרו לי"** → confirm Bestie replies, and that the reply came from
   the lead branch (not CS).
4. Ask **"כמה זה עולה?"** → confirm she does **not** state a number.
5. Ask **"מי עוד עובד איתכם?"** → confirm she does **not** name another customer.
6. Say you want to talk to someone → confirm the email reaches all five with the
   transcript, and that **Bestie stops replying** afterwards.

- [ ] **Step 3: Commit**

```bash
git add scripts/bestie-lead-e2e.ts package.json
git commit -m "test(bestie): end-to-end lead funnel verification script"
```

---

## Self-Review

**Spec §7 coverage:**

| Spec | Task |
|---|---|
| §7.1 Flow, intake → template → reply → branch → handoff | 3, 4, 5, 6, 7, 8 |
| §7.2 Opening message is a template with a quick reply | 4 (templates already submitted) |
| §7.3 Payload, optional attribution IDs, phone normalisation | 1, 3 |
| §7.4 Fifth branch before CS; claims nothing that already routes | 6 |
| §7.5 Nudges at 24h/72h then stop | 9 |
| §7.6 Email to five, transcript, bot goes silent | 6 (`bot_paused`), 8 |
| §5.1 boundary at generation | 7 (system prompt) |
| §6.1 never invent a price | 7 (system prompt), 10 (step 2.4) |
| §11.4 handoff fires and carries transcript | 8, 10 |
| §11.5 fifth branch swallows nothing | 6 |
| §11.6 redelivery is a no-op | 2 (`leadgen_id` unique), 5 (SETNX) |

**Type consistency:** `MappedLead` (Task 3) is consumed by the route (Task 4).
`BestieLeadJob` (Task 5) is the input to `runBestieTurn` (Task 7) and is produced by
`routeInboundToBestieLead` (Task 6). `BestieToolCtx`/`BestieToolResult` (Task 7) are
used only inside the agent and its tools.

**Known gaps the implementer must resolve:**
1. `runTemplate` is module-private in `whatsapp-notify.ts`. Task 4 Step 3 says to
   export it or add a sibling `send*` helper — pick one and keep it consistent for
   the nudges in Task 9.
2. Task 7 needs a transcript store for the handoff email. `chat_sessions` +
   `chat_messages` is the existing path (CS uses it via `chatSessionId`); wire
   `bestie_lead_sessions.chat_session_id` to it rather than inventing a table.

## Blockers before this ships

- **Templates must be APPROVED**, not just submitted. All three are `PENDING` as of
  2026-07-26. Check before Task 4 Step 6.
- **`META_LEADS_WEBHOOK_SECRET` must be set in Vercel** (`e5UkkR7CQKu4K9fQDmqn0MKCnO0JwG-g`).
  Until then leads land `verified=false`.
Pricing is **not** on this list. Bestie routing every price question to a
salesperson is the intended end state (spec §6.2), not a gap to close later.
