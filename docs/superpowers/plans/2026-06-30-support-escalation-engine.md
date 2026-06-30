# Support Escalation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a brand bot detects an angry / abusive / legally-threatening / human-demanding customer, instantly alert that account's configured recipients by email (off the response hot path), logged and deduped.

**Architecture:** A standalone, pure detector (`detect.ts`) classifies the message; a dispatcher (`dispatch.ts`) runs fire-and-forget from the chat/widget paths, resolves account-scoped recipients, sends email, and writes an auditable `support_requests` record. Recipients are configured per account from admin. WhatsApp is a gated fast-follow.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (service-role client), Vitest, Gmail API (`src/lib/email.ts`).

## Global Constraints

- All internal imports use the `@/*` alias (maps to `./src/*`).
- Server-side DB access uses `createClient` from `@/lib/supabase/server` (service-role; bypasses RLS).
- The whole feature is gated by env `ESCALATION_ENABLED === 'true'` AND per-account `config.escalation.enabled !== false`.
- WhatsApp template params must never contain `\n`, `\t`, or 5+ consecutive spaces (Meta 132018) — already enforced at the `runTemplate` chokepoint; do not bypass it.
- Tests are flat files: `tests/unit/<name>.test.ts`, run with `npx vitest run tests/unit/<name>.test.ts`.
- `chat_messages` columns are `role, content` (NOT `message`).
- Detector keyword matching is case-insensitive substring on the lowercased text.

---

### Task 1: Escalation types + detector (pure, TDD)

**Files:**
- Create: `src/engines/escalation/types.ts`
- Create: `src/engines/escalation/detect.ts`
- Test: `tests/unit/escalation-detect.test.ts`

**Interfaces:**
- Produces: `detectEscalation(currentMessage: string, priorUserMessages?: string[]): EscalationVerdict`
- Produces types: `EscalationSeverity`, `EscalationTrigger`, `EscalationVerdict`, `EscalationRecipient`, `EscalationConfig`

- [ ] **Step 1: Write the types file**

```typescript
// src/engines/escalation/types.ts
export type EscalationSeverity = 'critical' | 'high';
export type EscalationTrigger = 'legal' | 'abuse' | 'human_demand' | 'sustained_anger';

export interface EscalationVerdict {
  escalate: boolean;
  severity: EscalationSeverity | null;
  reason: string;            // Hebrew, human-readable
  triggers: EscalationTrigger[];
}

export interface EscalationRecipient {
  name: string;
  email?: string;
  whatsapp?: string;         // E.164 / waId
}

export interface EscalationConfig {
  enabled?: boolean;
  recipients?: EscalationRecipient[];
  dedupeMinutes?: number;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/escalation-detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectEscalation } from '@/engines/escalation/detect';

describe('detectEscalation', () => {
  it('escalates on a legal threat', () => {
    const v = detectEscalation('אם זה לא יסתדר אני אתבע אתכם בבית משפט');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('legal');
    expect(v.severity).toBe('critical');
  });

  it('escalates on abuse / cursing', () => {
    const v = detectEscalation('אתם חרא של חברה, רמאים');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('abuse');
    expect(v.severity).toBe('critical');
  });

  it('escalates on explicit human demand', () => {
    const v = detectEscalation('תפסיקו עם הבוט, אני רוצה לדבר עם נציג אנושי עכשיו');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('human_demand');
    expect(v.severity).toBe('high');
  });

  it('escalates on sustained anger across turns', () => {
    const v = detectEscalation('זה פשוט נורא, עד מתי', ['אני ממש מאוכזבת מהשירות']);
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('sustained_anger');
  });

  it('does NOT escalate a single mildly-negative message', () => {
    const v = detectEscalation('קצת מאוכזבת מהמשלוח', []);
    expect(v.escalate).toBe(false);
    expect(v.severity).toBeNull();
  });

  it('does NOT escalate a benign question', () => {
    const v = detectEscalation('היי, יש לכם שמן לשיער יבש?');
    expect(v.escalate).toBe(false);
  });

  it('matches English legal threats too', () => {
    const v = detectEscalation('I will sue you and call my lawyer');
    expect(v.escalate).toBe(true);
    expect(v.triggers).toContain('legal');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/escalation-detect.test.ts`
Expected: FAIL — cannot resolve `@/engines/escalation/detect`.

- [ ] **Step 4: Write the detector**

```typescript
// src/engines/escalation/detect.ts
import type { EscalationVerdict, EscalationTrigger, EscalationSeverity } from './types';

const LEGAL = [
  'תביעה', 'אתבע', 'נתבע', 'לתבוע', 'עורך דין', 'עו"ד', 'עו״ד', 'עוד', 'משפט',
  'בית משפט', 'תלונה למשרד', 'הגנת הצרכן', 'צרכנות', 'עילה לתביעה',
  'sue', 'lawsuit', 'lawyer', 'attorney', 'court', 'legal action',
];

const ABUSE = [
  'מטומטם', 'מטומטמת', 'אידיוט', 'אידיוטית', 'דפוק', 'דפוקה', 'מניאק',
  'חרא', 'זבל', 'בן זונה', 'זונה', 'שתוק', 'שתקי', 'נמאסתם', 'רמאים',
  'גנבים', 'נוכלים', 'שקרנים', 'מתעללים', 'אפרסם נגדכם', 'אשמיץ',
  'scam', 'scammers', 'liars', 'thieves', 'idiots', 'shut up',
];

const HUMAN_DEMAND = [
  'נציג', 'נציגה', 'בן אדם', 'בנאדם', 'אדם אמיתי', 'מענה אנושי', 'מנהל',
  'מנהלת', 'אחראי', 'אחראית', 'תחזרו אליי', 'תתקשרו אליי', 'דבר איתי',
  'human', 'representative', 'real person', 'manager', 'speak to a person',
];

const NEGATIVE = [
  'כועס', 'כועסת', 'עצבני', 'עצבנית', 'מאוכזב', 'מאוכזבת', 'גרוע', 'גרועה',
  'נורא', 'בושה', 'מזעזע', 'חוצפה', 'עד מתי', 'כמה זמן עוד', 'אף אחד לא עונה',
  'מתעלמים', 'לא מקצועי', 'לא ייאמן', 'disappointed', 'angry', 'furious',
  'unacceptable', 'ridiculous', 'worst', 'terrible',
];

function hasAny(text: string, words: string[]): boolean {
  const t = (text || '').toLowerCase();
  return words.some((w) => t.includes(w.toLowerCase()));
}

const TRIGGER_LABEL: Record<EscalationTrigger, string> = {
  legal: 'איום בתביעה / פנייה משפטית',
  abuse: 'התנהגות פוגענית / קללות',
  human_demand: 'דרישה מפורשת לנציג אנושי',
  sustained_anger: 'כעס מתמשך לאורך השיחה',
};

function buildReason(triggers: EscalationTrigger[]): string {
  return triggers.map((t) => TRIGGER_LABEL[t]).join(' + ');
}

export function detectEscalation(
  currentMessage: string,
  priorUserMessages: string[] = [],
): EscalationVerdict {
  const msg = currentMessage || '';
  const triggers: EscalationTrigger[] = [];

  if (hasAny(msg, LEGAL)) triggers.push('legal');
  if (hasAny(msg, ABUSE)) triggers.push('abuse');
  if (hasAny(msg, HUMAN_DEMAND)) triggers.push('human_demand');

  const currentNegative = hasAny(msg, NEGATIVE);
  const priorNegative = priorUserMessages.some((m) => hasAny(m, NEGATIVE));
  if (currentNegative && priorNegative) triggers.push('sustained_anger');

  const escalate = triggers.length > 0;
  let severity: EscalationSeverity | null = null;
  if (escalate) {
    severity = triggers.includes('legal') || triggers.includes('abuse') ? 'critical' : 'high';
  }

  return { escalate, severity, reason: buildReason(triggers), triggers };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/escalation-detect.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engines/escalation/types.ts src/engines/escalation/detect.ts tests/unit/escalation-detect.test.ts
git commit -m "feat(escalation): standalone risk detector + types"
```

---

### Task 2: Recipient resolution (TDD)

**Files:**
- Create: `src/engines/escalation/recipients.ts`
- Test: `tests/unit/escalation-recipients.test.ts`

**Interfaces:**
- Consumes: `EscalationConfig`, `EscalationRecipient` (Task 1)
- Produces: `resolveRecipients(supabase: any, accountId: string, cfg: EscalationConfig | undefined): Promise<EscalationRecipient[]>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/escalation-recipients.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRecipients } from '@/engines/escalation/recipients';

// Minimal fake matching the chained calls resolveRecipients uses.
function fakeSupabase(agents: any[]) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        then(resolve: any) { return resolve({ data: agents, error: null }); },
      };
    },
  };
}

describe('resolveRecipients', () => {
  it('returns configured recipients when present (ignores DB)', async () => {
    const cfg = { recipients: [{ name: 'יואב', email: 'yoav@x.com', whatsapp: '97250' }] };
    const out = await resolveRecipients(fakeSupabase([]), 'acc', cfg);
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe('yoav@x.com');
  });

  it('drops configured recipients that have neither email nor whatsapp', async () => {
    const cfg = { recipients: [{ name: 'empty' }, { name: 'ok', email: 'a@b.com' }] };
    const out = await resolveRecipients(fakeSupabase([]), 'acc', cfg);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('ok');
  });

  it('falls back to active support_agents with email', async () => {
    const agents = [
      { first_name: 'Dana', last_name: 'Levi', email: 'dana@x.com', is_active: true },
      { first_name: 'NoEmail', last_name: '', email: null, is_active: true },
    ];
    const out = await resolveRecipients(fakeSupabase(agents), 'acc', { recipients: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ name: 'Dana Levi', email: 'dana@x.com' });
  });

  it('returns empty when neither config nor agents resolve', async () => {
    const out = await resolveRecipients(fakeSupabase([]), 'acc', undefined);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/escalation-recipients.test.ts`
Expected: FAIL — cannot resolve `@/engines/escalation/recipients`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/engines/escalation/recipients.ts
import type { EscalationConfig, EscalationRecipient } from './types';

export async function resolveRecipients(
  supabase: any,
  accountId: string,
  cfg: EscalationConfig | undefined,
): Promise<EscalationRecipient[]> {
  const configured = (cfg?.recipients || []).filter((r) => r.email || r.whatsapp);
  if (configured.length > 0) return configured;

  // Fallback: active support agents with an email.
  const { data } = await supabase
    .from('support_agents')
    .select('first_name, last_name, email, is_active')
    .eq('account_id', accountId)
    .eq('is_active', true);

  return (data || [])
    .filter((a: any) => a.email)
    .map((a: any) => ({
      name: [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Support',
      email: a.email as string,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/escalation-recipients.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engines/escalation/recipients.ts tests/unit/escalation-recipients.test.ts
git commit -m "feat(escalation): account-scoped recipient resolution with support_agents fallback"
```

---

### Task 3: Escalation email template (pure builder, TDD)

**Files:**
- Create: `src/engines/escalation/email-template.ts`
- Test: `tests/unit/escalation-email-template.test.ts`

**Interfaces:**
- Produces: `buildEscalationEmail(p: EscalationEmailParts): { subject: string; html: string }`
- Produces type `EscalationEmailParts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/escalation-email-template.test.ts
import { describe, it, expect } from 'vitest';
import { buildEscalationEmail } from '@/engines/escalation/email-template';

describe('buildEscalationEmail', () => {
  const base = {
    brandName: 'LA BEAUTÉ',
    reason: 'איום בתביעה / פנייה משפטית + כעס מתמשך לאורך השיחה',
    severity: 'critical' as const,
    customerPhone: '0501234567',
    userMessage: 'אני אתבע אתכם',
    lastMessages: [
      { role: 'user', content: 'איפה ההזמנה שלי' },
      { role: 'assistant', content: 'בודקת עבורך' },
    ],
    sessionId: 'sess-123',
  };

  it('puts brand + severity in the subject', () => {
    const { subject } = buildEscalationEmail(base);
    expect(subject).toContain('LA BEAUTÉ');
    expect(subject.toLowerCase()).toContain('אסקלצ');
  });

  it('includes the reason, phone, and triggering message in the html', () => {
    const { html } = buildEscalationEmail(base);
    expect(html).toContain('איום בתביעה');
    expect(html).toContain('0501234567');
    expect(html).toContain('אני אתבע אתכם');
    expect(html).toContain('sess-123');
  });

  it('handles missing phone gracefully', () => {
    const { html } = buildEscalationEmail({ ...base, customerPhone: null });
    expect(html).toContain('לא ידוע');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/escalation-email-template.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder**

```typescript
// src/engines/escalation/email-template.ts
export interface EscalationEmailParts {
  brandName: string;
  reason: string;
  severity: 'critical' | 'high';
  customerName?: string | null;
  customerPhone?: string | null;
  userMessage: string;
  lastMessages: { role: string; content: string }[];
  sessionId?: string | null;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildEscalationEmail(p: EscalationEmailParts): { subject: string; html: string } {
  const sevLabel = p.severity === 'critical' ? 'קריטי' : 'דחוף';
  const sevColor = p.severity === 'critical' ? '#ef4444' : '#f59e0b';
  const phone = p.customerPhone || 'לא ידוע';
  const name = p.customerName || 'לקוח/ה';
  const subject = `🚨 אסקלציה (${sevLabel}) — ${p.brandName}`;

  const history = (p.lastMessages || [])
    .map((m) => {
      const who = m.role === 'user' ? 'לקוח/ה' : 'בוט';
      return `<div style="margin:4px 0;"><b>${esc(who)}:</b> ${esc(m.content)}</div>`;
    })
    .join('');

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:${sevColor};color:#fff;padding:16px 24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:18px;">🚨 פנייה דחופה — ${esc(p.brandName)}</h2>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="font-size:16px;color:#111;"><b>סיבת האסקלציה:</b> ${esc(p.reason)}</p>
        <p style="font-size:15px;color:#111;"><b>לקוח/ה:</b> ${esc(name)} · <b>טלפון:</b> ${esc(phone)}</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:12px 0;">
          <b>ההודעה שהפעילה את ההתראה:</b><br/>${esc(p.userMessage)}
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:12px;">
          <b>הקשר אחרון:</b>${history || '<div>—</div>'}
        </div>
        <p style="font-size:12px;color:#9ca3af;margin-top:16px;">מזהה שיחה: ${esc(p.sessionId || '—')} · BestieAI</p>
      </div>
    </div>
  `;

  return { subject, html };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/escalation-email-template.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engines/escalation/email-template.ts tests/unit/escalation-email-template.test.ts
git commit -m "feat(escalation): RTL escalation alert email builder"
```

---

### Task 4: Dispatcher orchestration (TDD with injected deps)

**Files:**
- Create: `src/engines/escalation/dispatch.ts`
- Test: `tests/unit/escalation-dispatch.test.ts`

**Interfaces:**
- Consumes: `detectEscalation` (Task 1), `resolveRecipients` (Task 2), `buildEscalationEmail` (Task 3), `sendEmail` from `@/lib/email`, `createClient` from `@/lib/supabase/server`.
- Produces: `runEscalationCheck(input: EscalationInput, deps?: Partial<EscalationDeps>): Promise<EscalationOutcome>`
- Produces types: `EscalationInput`, `EscalationDeps`, `EscalationOutcome`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/escalation-dispatch.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runEscalationCheck } from '@/engines/escalation/dispatch';

// Chainable fake: per-table canned responses + captured inserts.
function makeSupabase(opts: {
  config?: any;
  priorMessages?: { role: string; content: string }[];
  recentEscalations?: any[];
  agents?: any[];
}) {
  const inserts: any[] = [];
  const api = {
    inserts,
    from(table: string) {
      const ctx: any = { table, _filters: {} };
      ctx.select = () => ctx;
      ctx.eq = () => ctx;
      ctx.gte = () => ctx;
      ctx.order = () => ctx;
      ctx.limit = () => ctx;
      ctx.single = async () => {
        if (table === 'accounts') return { data: { config: opts.config ?? {} }, error: null };
        return { data: null, error: null };
      };
      ctx.insert = async (row: any) => { inserts.push({ table, row }); return { data: null, error: null }; };
      // Thenable for the non-.single() reads.
      ctx.then = (resolve: any) => {
        if (table === 'chat_messages') return resolve({ data: opts.priorMessages ?? [], error: null });
        if (table === 'support_requests') return resolve({ data: opts.recentEscalations ?? [], error: null });
        if (table === 'support_agents') return resolve({ data: opts.agents ?? [], error: null });
        return resolve({ data: [], error: null });
      };
      return ctx;
    },
  };
  return api;
}

describe('runEscalationCheck', () => {
  beforeEach(() => { process.env.ESCALATION_ENABLED = 'true'; });

  const input = { accountId: 'acc', sessionId: 'sess', userMessage: 'אני אתבע אתכם', source: 'chat' as const };

  it('skips when the feature flag is off', async () => {
    process.env.ESCALATION_ENABLED = 'false';
    const out = await runEscalationCheck(input, { supabase: makeSupabase({}) as any, sendEmail: vi.fn() });
    expect(out.escalated).toBe(false);
    expect(out.skipped).toBe('flag_off');
  });

  it('does not escalate a benign message', async () => {
    const sendEmail = vi.fn();
    const out = await runEscalationCheck(
      { ...input, userMessage: 'יש לכם שמן לשיער?' },
      { supabase: makeSupabase({ config: { escalation: { recipients: [{ name: 'Y', email: 'y@x.com' }] } } }) as any, sendEmail },
    );
    expect(out.escalated).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends email + writes a record on a legal threat', async () => {
    const sendEmail = vi.fn(async () => ({ success: true }));
    const sb = makeSupabase({ config: { escalation: { recipients: [{ name: 'Y', email: 'y@x.com' }] }, brandName: 'LA BEAUTÉ' } });
    const out = await runEscalationCheck(input, { supabase: sb as any, sendEmail });
    expect(out.escalated).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toEqual(['y@x.com']);
    const rec = sb.inserts.find((i) => i.table === 'support_requests');
    expect(rec).toBeTruthy();
    expect(rec.row.source).toBe('auto_escalation');
    expect(rec.row.metadata.escalation.triggers).toContain('legal');
  });

  it('dedups when a recent auto_escalation exists for the session', async () => {
    const sendEmail = vi.fn(async () => ({ success: true }));
    const sb = makeSupabase({
      config: { escalation: { recipients: [{ name: 'Y', email: 'y@x.com' }] } },
      recentEscalations: [{ id: 'prev' }],
    });
    const out = await runEscalationCheck(input, { supabase: sb as any, sendEmail });
    expect(out.deduped).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('respects per-account disabled flag', async () => {
    const sendEmail = vi.fn();
    const out = await runEscalationCheck(input, {
      supabase: makeSupabase({ config: { escalation: { enabled: false } } }) as any,
      sendEmail,
    });
    expect(out.skipped).toBe('disabled');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/escalation-dispatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the dispatcher**

```typescript
// src/engines/escalation/dispatch.ts
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { detectEscalation } from './detect';
import { resolveRecipients } from './recipients';
import { buildEscalationEmail } from './email-template';
import type { EscalationConfig } from './types';

export interface EscalationInput {
  accountId: string;
  sessionId: string | null;
  userMessage: string;
  source: 'chat' | 'widget';
}

export interface EscalationDeps {
  supabase: any;
  sendEmail: typeof sendEmail;
  now: () => number;
}

export interface EscalationOutcome {
  escalated: boolean;
  reason?: string;
  recipientsNotified?: number;
  deduped?: boolean;
  skipped?: string;
}

const PHONE_RE = /0\d{1,2}-?\d{7}|\+972\d{8,9}/;

function extractPhone(text: string): string | null {
  const m = (text || '').match(PHONE_RE);
  return m ? m[0] : null;
}

export async function runEscalationCheck(
  input: EscalationInput,
  depsOverride?: Partial<EscalationDeps>,
): Promise<EscalationOutcome> {
  if (process.env.ESCALATION_ENABLED !== 'true') return { escalated: false, skipped: 'flag_off' };

  const deps: EscalationDeps = {
    supabase: depsOverride?.supabase ?? (await createClient()),
    sendEmail: depsOverride?.sendEmail ?? sendEmail,
    now: depsOverride?.now ?? (() => Date.now()),
  };
  const { supabase } = deps;

  // 1) account config
  const { data: acct } = await supabase.from('accounts').select('config').eq('id', input.accountId).single();
  const config = (acct?.config || {}) as Record<string, any>;
  const escalationConfig = (config.escalation || {}) as EscalationConfig;
  if (escalationConfig.enabled === false) return { escalated: false, skipped: 'disabled' };

  // 2) recent prior user messages (for sustained-anger detection)
  let prior: { role: string; content: string }[] = [];
  if (input.sessionId) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', input.sessionId)
      .order('created_at', { ascending: false })
      .limit(8);
    prior = (msgs || []).reverse();
  }
  const priorUserTexts = prior.filter((m) => m.role === 'user').map((m) => m.content);

  // 3) detect
  const verdict = detectEscalation(input.userMessage, priorUserTexts);
  if (!verdict.escalate) return { escalated: false };

  // 4) dedup (one alert per session per window)
  if (input.sessionId) {
    const dedupeMin = escalationConfig.dedupeMinutes ?? 15;
    const sinceIso = new Date(deps.now() - dedupeMin * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('support_requests')
      .select('id')
      .eq('session_id', input.sessionId)
      .eq('source', 'auto_escalation')
      .gte('created_at', sinceIso)
      .limit(1);
    if (recent && recent.length > 0) return { escalated: false, deduped: true };
  }

  // 5) recipients
  const recipients = await resolveRecipients(supabase, input.accountId, escalationConfig);
  const brandName = config.brandName || config.username || 'Account';
  const phone = extractPhone(input.userMessage);
  const lastMessages = prior.slice(-3);

  // 6) email
  const emailTargets = recipients.flatMap((r) => (r.email ? [r.email] : []));
  let notified = 0;
  const channels: any[] = [];
  if (emailTargets.length > 0) {
    const { subject, html } = buildEscalationEmail({
      brandName,
      reason: verdict.reason,
      severity: verdict.severity ?? 'high',
      customerPhone: phone,
      userMessage: input.userMessage,
      lastMessages,
      sessionId: input.sessionId,
    });
    const res = await deps.sendEmail({ to: emailTargets, subject, html });
    if (res.success) notified = emailTargets.length;
    channels.push({ channel: 'email', success: res.success, error: res.error });
  }

  // 7) never-silent fallback when no recipient resolves
  if (recipients.length === 0) {
    const { sendAdminAlert } = await import('@/lib/email');
    await sendAdminAlert({
      level: 'critical',
      subject: `אסקלציה ללא נמען — ${brandName}`,
      message: verdict.reason,
      details: input.userMessage,
    });
    channels.push({ channel: 'admin_fallback', success: true });
  }

  // 8) auditable record (also powers dedup)
  await supabase.from('support_requests').insert({
    account_id: input.accountId,
    customer_name: null,
    customer_phone: phone,
    message: input.userMessage,
    session_id: input.sessionId,
    status: 'new',
    source: 'auto_escalation',
    metadata: {
      escalation: {
        severity: verdict.severity,
        reason: verdict.reason,
        triggers: verdict.triggers,
        detected_at: new Date(deps.now()).toISOString(),
        recipients_notified: notified,
        channels,
        origin: input.source,
      },
    },
  });

  return { escalated: true, reason: verdict.reason, recipientsNotified: notified };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/escalation-dispatch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engines/escalation/dispatch.ts tests/unit/escalation-dispatch.test.ts
git commit -m "feat(escalation): dispatcher (detect → dedup → recipients → email → record)"
```

---

### Task 5: Wire the chat stream hook

**Files:**
- Modify: `src/app/api/chat/stream/route.ts` (import near line 16; call inside the `after(async () => {...})` block at line 1319)

**Interfaces:**
- Consumes: `runEscalationCheck` (Task 4). In-scope vars at the hook: `accountId`, `currentSessionId`, `displayMessage`.

- [ ] **Step 1: Add the import**

Add to the import block near the top (after the existing `@/engines/understanding` import on line 46):

```typescript
import { runEscalationCheck } from '@/engines/escalation/dispatch';
```

- [ ] **Step 2: Add the fire-and-forget call inside the existing `after()` block**

Inside the `after(async () => { ... })` block that starts at line 1319, add this near the top of the block body (it must not be awaited — it runs alongside the existing save/cleanup work):

```typescript
        // Escalation check — off the hot path; never blocks the response.
        runEscalationCheck({
          accountId,
          sessionId: currentSessionId,
          userMessage: displayMessage,
          source: 'chat',
        }).catch((e: any) => console.error('[escalation] chat hook failed:', e?.message || e));
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors referencing `stream/route.ts` or `@/engines/escalation`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/stream/route.ts
git commit -m "feat(escalation): fire escalation check from chat stream after() block"
```

---

### Task 6: Wire the widget hook

**Files:**
- Modify: `src/lib/chatbot/widget-chat-handler.ts` (import at top; call just before the `return {...}` at line 406)

**Interfaces:**
- Consumes: `runEscalationCheck` (Task 4). In-scope vars: `accountId`, `sessionId`, `message`.

- [ ] **Step 1: Add the import**

Add to the top import block:

```typescript
import { runEscalationCheck } from '@/engines/escalation/dispatch';
```

- [ ] **Step 2: Add the fire-and-forget call before the return**

Immediately before the `return {` statement at line 406:

```typescript
  // Escalation check — fire-and-forget; does not block the widget response.
  runEscalationCheck({
    accountId,
    sessionId: sessionId!,
    userMessage: message,
    source: 'widget',
  }).catch((e: any) => console.error('[escalation] widget hook failed:', e?.message || e));
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors referencing `widget-chat-handler.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/chatbot/widget-chat-handler.ts
git commit -m "feat(escalation): fire escalation check from widget handler"
```

---

### Task 7: Admin API — read/write per-account escalation config

**Files:**
- Create: `src/app/api/admin/accounts/[accountId]/escalation/route.ts`

**Interfaces:**
- Produces HTTP `GET` → `{ escalation: EscalationConfig }` and `PUT` (body `{ enabled, recipients, dedupeMinutes }`) → `{ ok: true }`.
- Mirrors the read-merge-write pattern in the sibling `integrations/route.ts`.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/admin/accounts/[accountId]/escalation/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ accountId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { accountId } = await params;
  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  if (error || !account) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const escalation = ((account.config || {}) as any).escalation || { enabled: true, recipients: [] };
  return NextResponse.json({ escalation });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { accountId } = await params;
  const body = await req.json().catch(() => ({}));
  const supabase = await createClient();

  const { data: account, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  if (error || !account) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const config = ((account.config || {}) as Record<string, any>);
  const existing = (config.escalation || {}) as Record<string, any>;

  const recipients = Array.isArray(body.recipients)
    ? body.recipients
        .map((r: any) => ({
          name: typeof r?.name === 'string' ? r.name.trim() : '',
          email: typeof r?.email === 'string' ? r.email.trim() : '',
          whatsapp: typeof r?.whatsapp === 'string' ? r.whatsapp.trim() : '',
        }))
        .filter((r: any) => r.email || r.whatsapp)
    : existing.recipients || [];

  const next = {
    ...existing,
    enabled: body.enabled === false ? false : true,
    recipients,
    dedupeMinutes:
      typeof body.dedupeMinutes === 'number' && body.dedupeMinutes > 0
        ? body.dedupeMinutes
        : existing.dedupeMinutes ?? 15,
  };

  const updatedConfig = { ...config, escalation: next };
  const { error: writeErr } = await supabase
    .from('accounts')
    .update({ config: updatedConfig })
    .eq('id', accountId);
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, escalation: next });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run the dev server (`npm run dev`), then:

```bash
curl -s -X PUT http://localhost:3000/api/admin/accounts/432dea15-707f-4cfe-b7e2-331c7a02b228/escalation \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"recipients":[{"name":"יואב","email":"triroars@gmail.com","whatsapp":""}]}'
curl -s http://localhost:3000/api/admin/accounts/432dea15-707f-4cfe-b7e2-331c7a02b228/escalation
```
Expected: PUT returns `{"ok":true,...}`; GET returns the saved recipient.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/accounts/\[accountId\]/escalation/route.ts
git commit -m "feat(escalation): admin API to manage per-account escalation recipients"
```

---

### Task 8: Admin UI — escalation contacts form

**Files:**
- Create: `src/app/admin/influencers/[id]/EscalationContactsForm.tsx`
- Modify: `src/app/admin/influencers/[id]/page.tsx` (render the form, passing the account id)

**Interfaces:**
- Consumes: the `GET`/`PUT` route from Task 7. Mirrors the existing `StoreIntegrationForm.tsx` client-component pattern.

- [ ] **Step 1: Write the form component**

```tsx
// src/app/admin/influencers/[id]/EscalationContactsForm.tsx
'use client';

import { useEffect, useState } from 'react';

type Recipient = { name: string; email: string; whatsapp: string };

export default function EscalationContactsForm({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetch(`/api/admin/accounts/${accountId}/escalation`)
      .then((r) => r.json())
      .then((d) => {
        const e = d.escalation || {};
        setEnabled(e.enabled !== false);
        setRecipients(
          (e.recipients || []).map((r: any) => ({
            name: r.name || '',
            email: r.email || '',
            whatsapp: r.whatsapp || '',
          })),
        );
      })
      .catch(() => {});
  }, [accountId]);

  function update(i: number, key: keyof Recipient, val: string) {
    setRecipients((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }
  function addRow() {
    setRecipients((rs) => [...rs, { name: '', email: '', whatsapp: '' }]);
  }
  function removeRow(i: number) {
    setRecipients((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function save() {
    setStatus('saving');
    const res = await fetch(`/api/admin/accounts/${accountId}/escalation`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, recipients }),
    });
    setStatus(res.ok ? 'saved' : 'error');
  }

  return (
    <div dir="rtl" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>אנשי קשר לאסקלציה (תמיכה דחופה)</h3>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        אסקלציה פעילה לחשבון זה
      </label>

      {recipients.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="שם" value={r.name} onChange={(e) => update(i, 'name', e.target.value)} />
          <input placeholder="אימייל" value={r.email} onChange={(e) => update(i, 'email', e.target.value)} />
          <input placeholder="וואטסאפ (E.164)" value={r.whatsapp} onChange={(e) => update(i, 'whatsapp', e.target.value)} />
          <button type="button" onClick={() => removeRow(i)}>הסר</button>
        </div>
      ))}

      <button type="button" onClick={addRow} style={{ marginInlineEnd: 8 }}>+ הוסף נמען</button>
      <button type="button" onClick={save} disabled={status === 'saving'}>
        {status === 'saving' ? 'שומר…' : 'שמור'}
      </button>
      {status === 'saved' && <span style={{ color: '#16a34a', marginInlineStart: 8 }}>נשמר ✓</span>}
      {status === 'error' && <span style={{ color: '#ef4444', marginInlineStart: 8 }}>שגיאה</span>}
    </div>
  );
}
```

- [ ] **Step 2: Render it in the account detail page**

In `src/app/admin/influencers/[id]/page.tsx`, add the import at the top:

```tsx
import EscalationContactsForm from './EscalationContactsForm';
```

Then render it where account settings are shown (the account id is the route param `id`). Add inside the page's main content JSX:

```tsx
<EscalationContactsForm accountId={id} />
```

(If the page reads the id via `useParams()` or props, reuse that same variable instead of `id`.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/admin/influencers/<accountId>`, add a recipient, click שמור, reload — the recipient persists.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/influencers/\[id\]/EscalationContactsForm.tsx src/app/admin/influencers/\[id\]/page.tsx
git commit -m "feat(escalation): admin UI to manage per-account escalation contacts"
```

---

### Task 9: Enable + end-to-end verification + populate recipients

**Files:**
- Modify: `.env.local` (add `ESCALATION_ENABLED=true`) and document in `.env.example` if present.

- [ ] **Step 1: Add the env flag**

Add to `.env.local` (and `.env.example` if it exists):

```bash
ESCALATION_ENABLED=true
```

- [ ] **Step 2: Populate recipients for the three live brands**

Via the admin UI (Task 8) or directly:

```bash
for ACC in c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1 36705ad6-4f82-46af-95e1-fb5ea6f4a44f 432dea15-707f-4cfe-b7e2-331c7a02b228; do
  curl -s -X PUT http://localhost:3000/api/admin/accounts/$ACC/escalation \
    -H 'Content-Type: application/json' \
    -d '{"enabled":true,"recipients":[{"name":"LEADRS","email":"<AGENCY_EMAIL>","whatsapp":""}]}';
done
```
Replace `<AGENCY_EMAIL>` with the real recipient (confirm with Ido).

- [ ] **Step 3: End-to-end test against a brand bot**

With dev running, post an escalating message to the widget chat for LA BEAUTÉ:

```bash
curl -s -X POST http://localhost:3000/api/widget/chat \
  -H 'Content-Type: application/json' \
  -d '{"accountId":"432dea15-707f-4cfe-b7e2-331c7a02b228","message":"אתם רמאים, אני אתבע אתכם בבית משפט","sessionId":null}'
```
Then confirm a record was written:

```sql
SELECT source, customer_phone, metadata->'escalation'->>'reason' AS reason, created_at
FROM support_requests
WHERE account_id='432dea15-707f-4cfe-b7e2-331c7a02b228' AND source='auto_escalation'
ORDER BY created_at DESC LIMIT 3;
```
Expected: one row with `reason` containing "תביעה", and the recipient receives the alert email.

- [ ] **Step 4: Verify the full unit suite still passes**

Run: `npx vitest run tests/unit/escalation-detect.test.ts tests/unit/escalation-recipients.test.ts tests/unit/escalation-email-template.test.ts tests/unit/escalation-dispatch.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "chore(escalation): document ESCALATION_ENABLED flag"
```

---

### Task 10 (fast-follow, optional): WhatsApp channel

**Files:**
- Modify: `src/lib/whatsapp-notify.ts` (add `sendEscalationAlert`)
- Modify: `src/engines/escalation/dispatch.ts` (call WhatsApp for recipients with `whatsapp`)

**Prerequisite:** Register + get Meta approval for an `escalation_alert` template with body params:
`[brand, reason, customerPhone, messageSnippet]`. WhatsApp will be a no-op until approved.

- [ ] **Step 1: Add the WhatsApp sender (mirrors `sendBrandSupportTicket`)**

```typescript
// src/lib/whatsapp-notify.ts  (add near the other senders)
export async function sendEscalationAlert(p: {
  to: string;
  brand: string;
  reason: string;
  customerPhone: string;
  messageSnippet: string;
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'escalation_alert',
    flagName: 'ESCALATION_ALERT',
    to: p.to,
    bodyParams: [p.brand, p.reason, p.customerPhone, p.messageSnippet],
  });
}
```

- [ ] **Step 2: Call it from the dispatcher**

In `dispatch.ts`, after the email block, add:

```typescript
  // WhatsApp (gated on an approved Meta template + WHATSAPP_NOTIFY_ENABLED)
  const waTargets = recipients.flatMap((r) => (r.whatsapp ? [r.whatsapp] : []));
  if (waTargets.length > 0) {
    const { sendEscalationAlert } = await import('@/lib/whatsapp-notify');
    const snippet = input.userMessage.slice(0, 120).replace(/\s+/g, ' ').trim();
    for (const to of waTargets) {
      const r = await sendEscalationAlert({ to, brand: brandName, reason: verdict.reason, customerPhone: phone || 'לא ידוע', messageSnippet: snippet }).catch((e: any) => ({ success: false, error: { message: e?.message } } as any));
      channels.push({ channel: 'whatsapp', to, success: !!r?.success });
    }
  }
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run type-check
git add src/lib/whatsapp-notify.ts src/engines/escalation/dispatch.ts
git commit -m "feat(escalation): WhatsApp alert channel (gated on approved template)"
```

---

## Self-Review

**Spec coverage:**
- Detection (post-response, keyword) → Task 1 + hooks Tasks 5–6. ✓
- Recipients (config + support_agents fallback) → Task 2; admin config Tasks 7–8. ✓
- Channels (email now, WhatsApp later) → Tasks 3–4 (email), Task 10 (WhatsApp). ✓
- Dedup → Task 4 (dispatcher) + test. ✓
- Record / audit (`support_requests` source='auto_escalation') → Task 4. ✓
- In-conversation behavior → unchanged existing empathetic-tone rule (no code needed; noted in spec §3.6). ✓
- Never-silent fallback → Task 4 `sendAdminAlert`. ✓
- Feature flag → Task 4 (`ESCALATION_ENABLED`) + per-account `enabled` + Task 9. ✓

**Severity (spec open question):** single behavioral tier in MVP; `severity` recorded on the record for future use. ✓

**Type consistency:** `EscalationVerdict/Recipient/Config` defined in Task 1 and consumed unchanged in Tasks 2–4; `runEscalationCheck` signature is identical at both call sites (Tasks 5–6). ✓
