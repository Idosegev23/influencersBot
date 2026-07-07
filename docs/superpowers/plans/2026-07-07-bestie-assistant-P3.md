## P3 — Write tools, tiered confirmation & voice (bite-sized TDD)

Generalizes the `crm_agent_wa_state` switch + `handleVoiceCommand` (wa-conversation.ts) into registry-dispatched **write tools** with the spec's consequence-tiered confirmation (§3.3/§3.4), and moves the multi-command voice engine behind the P2 planner with plan-echo readback (§11). **All money math stays in `computeTotals`** (pricing.ts); the Planner/voice layer never returns a total. Every task: failing test → run-to-fail → minimal real impl → run-to-pass → commit.

Global rules honored: Planner proposes / Executor decides; Tier-2 never gated by free-text "כן"; confirmations bound to `pending_action.id` + `params_hash` + expiry; per-item receipts, never "בוצע" on partial failure; log to `assistant_actions` before composing reply.

Test dirs: unit → `tests/unit/assistant/*.test.ts`; env-gated real-branch fixtures → `tests/integration/assistant/*.test.ts` (`describe.skipIf(!process.env.ASSISTANT_TEST_DB)`). vitest `include` already globs `./tests/**/*.test.{ts,tsx}`.

---

### Task 1 — Hebrew spoken-number normalizer (pure, §11)

**Files:** create `src/lib/assistant/voice.ts`; create `tests/unit/assistant/voice-numbers.test.ts`

**Interfaces produced:** `normalizeSpokenNumbers(text:string):string`, `parseHebrewNumberWords(tokens:string[]):number|null`

**Failing test** `tests/unit/assistant/voice-numbers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeSpokenNumbers, parseHebrewNumberWords } from '@/lib/assistant/voice';

describe('parseHebrewNumberWords', () => {
  it('composes tens/hundreds/thousands', () => {
    expect(parseHebrewNumberWords(['עשרים', 'אלף'])).toBe(20000);
    expect(parseHebrewNumberWords(['מאתיים', 'אלף'])).toBe(200000);
    expect(parseHebrewNumberWords(['שמונים'])).toBe(80);
    expect(parseHebrewNumberWords(['מאה', 'עשרים', 'אלף'])).toBe(120000);
    expect(parseHebrewNumberWords(['שלוש', 'מאות'])).toBe(300);
    expect(parseHebrewNumberWords(['אלפיים'])).toBe(2000);
  });
  it('returns null when no number word', () => {
    expect(parseHebrewNumberWords(['נועה', 'פוקס'])).toBeNull();
  });
});

describe('normalizeSpokenNumbers', () => {
  it('replaces spoken runs, keeps digits + text', () => {
    expect(normalizeSpokenNumbers('נועה לפוקס עשרים אלף')).toBe('נועה לפוקס 20000');
    expect(normalizeSpokenNumbers('אנה מאתיים אלף ומאור שמונים אלף')).toBe('אנה 200000 ומאור 80000');
    expect(normalizeSpokenNumbers('מאור 400 לרילס')).toBe('מאור 400 לרילס');
  });
  it('handles the ו- joiner on a number word', () => {
    expect(normalizeSpokenNumbers('עשרים ואחת אלף')).toBe('21000');
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/voice-numbers.test.ts`

**Minimal impl** — append to `src/lib/assistant/voice.ts`:
```ts
/** Deterministic Hebrew spoken-number normalization (§11 — amounts are the highest-risk ASR target). */
const UNIT: Record<string, number> = {
  אפס: 0, אחת: 1, אחד: 1, שתיים: 2, שניים: 2, שני: 2, שתי: 2,
  שלוש: 3, שלושה: 3, שלושת: 3, ארבע: 4, ארבעה: 4, ארבעת: 4,
  חמש: 5, חמישה: 5, חמשת: 5, שש: 6, שישה: 6, ששת: 6,
  שבע: 7, שבעה: 7, שבעת: 7, שמונה: 8, שמונת: 8, תשע: 9, תשעה: 9, תשעת: 9,
};
const TENS: Record<string, number> = {
  עשר: 10, עשרה: 10, עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50,
  שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90,
};
// scale words that MULTIPLY the running "current" value
const DIRECT: Record<string, number> = { מאתיים: 200, אלפיים: 2000 };
const SCALE: Record<string, number> = { מאה: 100, מאות: 100, אלף: 1000, אלפים: 1000, מיליון: 1000000, מיליונים: 1000000 };

function stripVav(tok: string): string {
  return tok.length > 1 && tok.startsWith('ו') ? tok.slice(1) : tok;
}
export function isHebrewNumberWord(tok: string): boolean {
  const t = stripVav(tok);
  return t in UNIT || t in TENS || t in DIRECT || t in SCALE;
}
export function parseHebrewNumberWords(tokens: string[]): number | null {
  let total = 0, current = 0, consumed = false;
  for (const raw of tokens) {
    const tok = stripVav(raw);
    if (tok in UNIT) { current += UNIT[tok]; consumed = true; }
    else if (tok in TENS) { current += TENS[tok]; consumed = true; }
    else if (tok in DIRECT) { current += DIRECT[tok]; consumed = true; }
    else if (tok in SCALE) {
      const scale = SCALE[tok];
      if (scale >= 1000) { total += (current || 1) * scale; current = 0; }
      else { current = (current || 1) * scale; }
      consumed = true;
    } else return consumed ? total + current : null; // run ended
  }
  return consumed ? total + current : null;
}
/** Scan text, collapse maximal runs of Hebrew number words into their numeric value. */
export function normalizeSpokenNumbers(text: string): string {
  const parts = (text || '').split(/(\s+)/); // keep whitespace tokens
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    if (p.trim() && isHebrewNumberWord(p)) {
      const run: string[] = [];
      let j = i;
      while (j < parts.length) {
        if (!parts[j].trim()) { run.push(parts[j]); j++; continue; }
        if (isHebrewNumberWord(parts[j])) { run.push(parts[j]); j++; }
        else break;
      }
      const words = run.filter((w) => w.trim());
      const val = parseHebrewNumberWords(words);
      if (val != null) { out.push(String(val)); i = j; continue; }
    }
    out.push(p); i++;
  }
  return out.join('').replace(/\s+/g, ' ').trim();
}
```
**Run to pass:** `npx vitest run tests/unit/assistant/voice-numbers.test.ts`

**Commit:** `feat(assistant): deterministic Hebrew spoken-number normalizer (§11)`

---

### Task 2 — Money-math property tests (fuzz, §14)

No `fast-check` in the repo → dependency-free seeded LCG fuzz, matching the existing pure-test style. Locks the invariants the write tools depend on (`subtotal+vat=total`, half-up 2dp, `vat_rate=0` exempt).

**Files:** create `tests/unit/assistant/money-math.property.test.ts`

**Test (this is the deliverable — asserting existing `computeTotals`):**
```ts
import { describe, it, expect } from 'vitest';
import { computeTotals, lineSubtotal } from '@/lib/crm/pricing';

function lcg(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

describe('money-math invariants (property)', () => {
  it('subtotal+vat=total, 2dp, non-negative over 2000 fuzzed deals', () => {
    const rnd = lcg(20260707);
    for (let n = 0; n < 2000; n++) {
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({
        qty: 1 + Math.floor(rnd() * 5),
        unit_price: Math.round(rnd() * 5000000) / 100, // agorot precision
        vat_rate: [0, 0.17, 0.18][Math.floor(rnd() * 3)],
      }));
      const t = computeTotals(lines);
      expect(Math.abs(t.total - (t.subtotal + t.vat))).toBeLessThan(0.005);
      for (const v of [t.subtotal, t.vat, t.total]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(Math.round(v * 100)).toBe(v * 100); // exactly 2dp
      }
    }
  });
  it('vat_rate=0 → zero VAT (exported/exempt services)', () => {
    const rnd = lcg(7);
    for (let n = 0; n < 300; n++) {
      const t = computeTotals([{ qty: 1 + Math.floor(rnd() * 9), unit_price: Math.round(rnd() * 900000) / 100, vat_rate: 0 }]);
      expect(t.vat).toBe(0);
      expect(t.total).toBe(t.subtotal);
    }
  });
  it('lineSubtotal is half-up at the 2dp boundary', () => {
    expect(lineSubtotal({ qty: 1, unit_price: 10.005 })).toBe(10.01);
  });
});
```
**Run to fail → pass:** `npx vitest run tests/unit/assistant/money-math.property.test.ts` (passes immediately against current `computeTotals`; if the boundary case fails, `computeTotals`/`round2` is the bug to fix — do NOT weaken the test).

**Commit:** `test(assistant): property-test money-math invariants for write tools (§14)`

---

### Task 3 — `build_quote` tool (Tier-1, undo) as a registry entry

Generalizes the private `buildQuoteFromBrief` (wa-conversation.ts). Planner passes `line_items` (qty/unit_price/vat_rate) only; the tool computes totals via `computeTotals`, never a Planner total.

**Files:** create `src/lib/assistant/tools/build_quote.ts`; create `tests/unit/assistant/build-quote.test.ts`; create `tests/integration/assistant/build-quote.fixture.test.ts`. If P1 did not add `zod`: `npm i zod` (guarded — check `node -e "require('zod')"` first).

**Interfaces produced:** `buildQuoteTool: ToolDefinition`, `buildLineItemsFromInputs(inputs, seed):LineItem[]`, `buildQuoteBusinessKey(agentId,briefId,accountId,lineItems):string`

**Failing unit test** (pure parts — no DB):
```ts
import { describe, it, expect } from 'vitest';
import { buildLineItemsFromInputs, buildQuoteBusinessKey, buildQuoteTool } from '@/lib/assistant/tools/build_quote';

describe('buildLineItemsFromInputs', () => {
  it('maps planner line_items onto the brief seed, defaulting vat', () => {
    const li = buildLineItemsFromInputs(
      { line_items: [{ deliverable: 'reel', qty: 2, unit_price: 8000 }] },
      [{ platform: 'instagram', deliverable_type: 'reel', qty: 1, notes: '' }]
    );
    expect(li[0]).toMatchObject({ deliverable_type: 'reel', qty: 2, unit_price: 8000, vat_rate: 0.18 });
  });
  it('honors an explicit vat_rate=0 (exported service)', () => {
    const li = buildLineItemsFromInputs({ line_items: [{ deliverable: 'reel', qty: 1, unit_price: 5000, vat_rate: 0 }] }, []);
    expect(li[0].vat_rate).toBe(0);
  });
});

describe('buildQuoteBusinessKey', () => {
  it('is stable under line-item reordering (same deal → same key)', () => {
    const a = buildQuoteBusinessKey('ag', 'br', 'ac', [{ qty: 1, unit_price: 100 }, { qty: 2, unit_price: 50 }]);
    const b = buildQuoteBusinessKey('ag', 'br', 'ac', [{ qty: 2, unit_price: 50 }, { qty: 1, unit_price: 100 }]);
    expect(a).toBe(b);
  });
});

describe('buildQuoteTool contract', () => {
  it('is a Tier-1 undo write_internal tool', () => {
    expect(buildQuoteTool.name).toBe('crm.build_quote');
    expect(buildQuoteTool.sideEffect).toBe('write_internal');
    expect(buildQuoteTool.confirmation).toBe('undo');
    expect(buildQuoteTool.requiredRole).toBe('any');
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/build-quote.test.ts`

**Minimal impl** `src/lib/assistant/tools/build_quote.ts`:
```ts
import { createHash } from 'crypto';
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/assistant/registry';
import { assertAgentOwns } from '@/lib/assistant/gate';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { createQuote } from '@/lib/crm/quotes';
import { computeTotals, lineItemsToDeliverables, DEFAULT_VAT_RATE, type LineItem } from '@/lib/crm/pricing';

type Seed = { platform?: string; deliverable_type?: string; qty?: number; notes?: string };

export function buildLineItemsFromInputs(inputs: any, seed: Seed[]): LineItem[] {
  const rows: any[] = Array.isArray(inputs?.line_items) ? inputs.line_items : [];
  return rows.map((r, i) => {
    const s = seed[i] || {};
    return {
      platform: r.platform ?? s.platform ?? '',
      deliverable_type: r.deliverable ?? r.deliverable_type ?? s.deliverable_type ?? 'תוצר',
      qty: Math.max(1, Math.round(Number(r.qty ?? s.qty ?? 1))),
      unit_price: Math.max(0, Number(r.unit_price) || 0),
      vat_rate: r.vat_rate == null ? DEFAULT_VAT_RATE : Number(r.vat_rate),
      notes: r.notes ?? s.notes ?? null,
    } as LineItem;
  });
}

export function buildQuoteBusinessKey(agentId: string, briefId: string, accountId: string, items: LineItem[]): string {
  const norm = (items || [])
    .map((li) => `${li.deliverable_type}|${li.platform}|${li.qty}|${li.unit_price}|${li.vat_rate}`)
    .sort()
    .join(';');
  const amount = computeTotals(items).total;
  return createHash('sha256').update(`build_quote:${agentId}:${briefId}:${accountId}:${norm}:${amount}`).digest('hex').slice(0, 24);
}

const paramsSchema = z.object({
  brief_id: z.string(),
  account_id: z.string(),
  line_items: z.array(z.object({
    deliverable: z.string().optional(),
    platform: z.string().optional(),
    qty: z.number().optional(),
    unit_price: z.number(),
    vat_rate: z.number().optional(),
    notes: z.string().optional(),
  })).min(1),
});

async function accountName(id: string): Promise<string> {
  const { data } = await supabaseAdmin.from('accounts').select('config').eq('id', id).maybeSingle();
  return (data?.config as any)?.display_name || (data?.config as any)?.username || 'המיוצג';
}

export const buildQuoteTool: ToolDefinition<z.infer<typeof paramsSchema>, { partnershipId: string; signUrl: string; total: number; subtotal: number; vat: number; clientName: string; brandName: string }> = {
  name: 'crm.build_quote',
  version: 1,
  description: 'בונה טיוטת הצעת מחיר למיוצג מול מותג ומחזיר קישור חתימה. התמחור מגיע לפי שורות; הסכומים והמע"מ מחושבים אוטומטית.',
  whenToUse: 'הסוכן נתן מחיר לבריף פתוח (סכום לכל תוצר או סכום כולל).',
  whenNotToUse: 'אין בריף מזוהה, או הסוכן רק שאל שאלה.',
  paramsSchema,
  sideEffect: 'write_internal',
  addressesExternalParty: false,
  confirmation: 'undo',
  idempotent: true,
  idempotencyKey: (p) => buildQuoteBusinessKey('', p.brief_id, p.account_id, buildLineItemsFromInputs(p, [])),
  requiredRole: 'any',
  async ground(p, ctx) {
    await assertAgentOwns(ctx.agent, { accountId: p.account_id, briefId: p.brief_id });
    return { ok: true } as any;
  },
  async execute(p, ctx) {
    const { data: brief } = await supabaseAdmin
      .from('crm_inbound_messages').select('parsed_data, subject, raw_text').eq('id', p.brief_id).maybeSingle();
    const parsed = (brief?.parsed_data as any) || {};
    const lineItems = buildLineItemsFromInputs(p, []);
    const totals = computeTotals(lineItems);
    const brandName = parsed?.brandName || brief?.subject || 'מותג';
    const clientName = await accountName(p.account_id);

    const result = await createQuote({
      agentId: ctx.agent.id,
      accountId: p.account_id,
      brandName,
      clientName,
      campaignName: parsed?.campaignName || null,
      amount: totals.total,
      currency: parsed?.currency || 'ILS',
      deliverables: lineItemsToDeliverables(lineItems),
      notes: brief?.raw_text || null,
      brandContactName: parsed?.contactPerson?.name || null,
      brandContactEmail: parsed?.contactPerson?.email || null,
      brandContactPhone: parsed?.contactPerson?.phone || null,
      agentName: ctx.agent.full_name,
      parsedData: parsed,
    });

    const rows = lineItems.map((li, i) => ({
      partnership_id: result.partnershipId, account_id: p.account_id,
      platform: (li as any).platform || null, deliverable_type: (li as any).deliverable_type || null,
      qty: Math.max(1, Math.round(Number(li.qty) || 1)), unit_price: Math.max(0, Number(li.unit_price) || 0),
      vat_rate: li.vat_rate ?? DEFAULT_VAT_RATE, notes: (li as any).notes || null, sort_order: i,
    }));
    await supabaseAdmin.from('deal_line_items').insert(rows);
    await supabaseAdmin.from('crm_inbound_messages')
      .update({ deal_id: result.partnershipId, partnership_id: result.partnershipId, signature_request_id: result.signatureRequestId, brief_status: 'sent' })
      .eq('id', p.brief_id);

    return { ok: true, result: { partnershipId: result.partnershipId, signUrl: result.signUrl, total: totals.total, subtotal: totals.subtotal, vat: totals.vat, clientName, brandName } };
  },
};
```
**Run to pass (unit):** `npx vitest run tests/unit/assistant/build-quote.test.ts`

**Integration fixture** `tests/integration/assistant/build-quote.fixture.test.ts` (real branch; happy + idempotency; gated):
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { buildQuoteTool } from '@/lib/assistant/tools/build_quote';
import { seedAgentBrief, cleanup } from './_seed';

const RUN = !!process.env.ASSISTANT_TEST_DB;
describe.skipIf(!RUN)('build_quote executor fixture', () => {
  let ctx: any, params: any;
  beforeAll(async () => { ({ ctx, params } = await seedAgentBrief()); });
  it('happy path builds a signable quote with computed VAT', async () => {
    const r = await buildQuoteTool.execute(params, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.result.signUrl).toMatch(/\/sign\//); expect(r.result.vat).toBeCloseTo(r.result.subtotal * 0.18, 2); }
  });
  it('same business_key twice does not double-create (idempotency handled by executor claim)', async () => {
    const k1 = buildQuoteTool.idempotencyKey!(params, ctx);
    const k2 = buildQuoteTool.idempotencyKey!(params, ctx);
    expect(k1).toBe(k2);
  });
});
```
Create `tests/integration/assistant/_seed.ts` with real `supabaseAdmin` inserts (agent user role='agent', an `accounts` row into `managed_account_ids`, a `crm_inbound_messages` brief) returning `{ ctx:{ agent, turnId:null, batchId:null }, params }`, plus `cleanup()` deleting the seeded rows.

**Run (gated):** `ASSISTANT_TEST_DB=1 npx vitest run tests/integration/assistant/build-quote.fixture.test.ts`

**Commit:** `feat(assistant): build_quote tool (Tier-1 undo) generalizing buildQuoteFromBrief`

---

### Task 4 — Tier-1 UNDO mechanism (§3.3)

60s "תגיב 'בטל' לביטול". Undo of `build_quote` = `cancelQuote` on the created signature request; of `add_note`/`set_reminder` = delete the row.

**Files:** create `src/lib/assistant/undo.ts`; create `tests/unit/assistant/undo.test.ts`; migration `064` (Task 6) — reuses `assistant_actions` (P1) as the undo log via a lookup by `agent_id` + recent `done` + `entity_id`.

**Interfaces:** `isUndoWord(text):boolean`, `withinUndoWindow(executedAt, now?, windowMs?):boolean`, `undoLast(agentId, now?):Promise<{ok;label?}>`

**Failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { isUndoWord, withinUndoWindow } from '@/lib/assistant/undo';

describe('undo helpers', () => {
  it('recognizes Hebrew undo words only', () => {
    for (const t of ['בטל', 'ביטול', 'תבטל', 'undo']) expect(isUndoWord(t)).toBe(true);
    expect(isUndoWord('כן')).toBe(false);
    expect(isUndoWord('שלח חוזה')).toBe(false);
  });
  it('enforces a 60s window', () => {
    const t0 = '2026-07-07T10:00:00.000Z';
    expect(withinUndoWindow(t0, Date.parse('2026-07-07T10:00:30.000Z'))).toBe(true);
    expect(withinUndoWindow(t0, Date.parse('2026-07-07T10:02:00.000Z'))).toBe(false);
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/undo.test.ts`

**Impl** `src/lib/assistant/undo.ts`:
```ts
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { cancelQuote } from '@/lib/crm/quotes';

const UNDO_WORDS = new Set(['בטל', 'ביטול', 'תבטל', 'תבטלי', 'undo', 'cancel']);
const UNDO_WINDOW_MS = 60_000;

export function isUndoWord(text: string): boolean {
  const toks = (text || '').toLowerCase().split(/[\s,.!?;:()\-]+/).filter(Boolean);
  return toks.length > 0 && toks.every((w) => UNDO_WORDS.has(w));
}
export function withinUndoWindow(executedAt: string, now = Date.now(), windowMs = UNDO_WINDOW_MS): boolean {
  return now - Date.parse(executedAt) <= windowMs;
}
/** Reverse the agent's most recent Tier-1 (confirmation='undo') action inside the window. */
export async function undoLast(agentId: string, now = Date.now()): Promise<{ ok: boolean; label?: string }> {
  const { data } = await supabaseAdmin
    .from('assistant_actions')
    .select('id, tool_name, entity_type, entity_id, result, executed_at, status')
    .eq('agent_id', agentId).eq('status', 'done')
    .order('executed_at', { ascending: false }).limit(1).maybeSingle();
  if (!data || !data.executed_at || !withinUndoWindow(data.executed_at, now)) return { ok: false };
  if (data.tool_name === 'crm.build_quote') {
    const sigId = (data.result as any)?.signatureRequestId;
    if (sigId) { try { await cancelQuote(sigId, agentId); } catch { return { ok: false }; } }
    await supabaseAdmin.from('assistant_actions').update({ status: 'superseded' }).eq('id', data.id);
    return { ok: true, label: 'ההצעה בוטלה' };
  }
  if (data.tool_name === 'crm.add_note' && data.entity_id) {
    await supabaseAdmin.from('partnership_notes').delete().eq('id', data.entity_id);
    await supabaseAdmin.from('assistant_actions').update({ status: 'superseded' }).eq('id', data.id);
    return { ok: true, label: 'ההערה נמחקה' };
  }
  if (data.tool_name === 'crm.set_reminder' && data.entity_id) {
    await supabaseAdmin.from('assistant_reminders').update({ status: 'cancelled' }).eq('id', data.entity_id);
    await supabaseAdmin.from('assistant_actions').update({ status: 'superseded' }).eq('id', data.id);
    return { ok: true, label: 'התזכורת בוטלה' };
  }
  return { ok: false };
}
```
**Run to pass:** `npx vitest run tests/unit/assistant/undo.test.ts`

**Commit:** `feat(assistant): Tier-1 undo mechanism (60s window)`

---

### Task 5 — Deterministic confirmation binding (pure) (§3.3/§3.4)

The heart of Tier-2: `params_hash`, echo-token mint/match, button-id encode/parse, expiry, and the **cancel-pending collision rule**. Free-text "כן" is deliberately NOT accepted here.

**Files:** create `src/lib/assistant/confirm.ts`; create `tests/unit/assistant/confirm.test.ts`

**Interfaces:** `computeParamsHash`, `mintEchoToken`, `matchEchoToken`, `encodeButtonId`, `parseButtonReply`, `isExpired`, `classifyConfirmReply`

**Failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { computeParamsHash, mintEchoToken, matchEchoToken, encodeButtonId, parseButtonReply, isExpired, classifyConfirmReply } from '@/lib/assistant/confirm';

describe('params hash', () => {
  it('is stable under key order + differs on value change', () => {
    expect(computeParamsHash('crm.mark_paid', 1, { invoiceId: 'i1', amount: 100 }))
      .toBe(computeParamsHash('crm.mark_paid', 1, { amount: 100, invoiceId: 'i1' }));
    expect(computeParamsHash('crm.mark_paid', 1, { invoiceId: 'i1', amount: 100 }))
      .not.toBe(computeParamsHash('crm.mark_paid', 1, { invoiceId: 'i1', amount: 200 }));
  });
});
describe('echo token', () => {
  it('mints a verb-number token and matches case/space-insensitively', () => {
    const t = mintEchoToken('crm.mark_paid', 204); // PAID-204
    expect(t).toBe('PAID-204');
    expect(matchEchoToken('שלח  paid-204 ', t)).toBe(true);
    expect(matchEchoToken('204', t)).toBe(false); // bare number must NOT fire
    expect(matchEchoToken('כן', t)).toBe(false);
  });
});
describe('button id', () => {
  it('round-trips decision + pending id', () => {
    const id = encodeButtonId('confirm', 'pa_123');
    expect(parseButtonReply(id)).toEqual({ decision: 'confirm', pendingActionId: 'pa_123' });
    expect(parseButtonReply('garbage')).toBeNull();
  });
});
describe('expiry + collision classification', () => {
  it('expires past the bound time', () => {
    expect(isExpired('2026-07-07T10:00:00.000Z', Date.parse('2026-07-07T10:11:00.000Z'))).toBe(true);
    expect(isExpired('2026-07-07T10:00:00.000Z', Date.parse('2026-07-07T10:05:00.000Z'))).toBe(false);
  });
  it('token→confirm, explicit no→cancel, anything else→unrelated (cancels pending, re-plans)', () => {
    const t = mintEchoToken('crm.send_contract', 31);
    expect(classifyConfirmReply('SEND-31', t)).toBe('confirm');
    expect(classifyConfirmReply('בטל', t)).toBe('cancel');
    expect(classifyConfirmReply('כן', t)).toBe('unrelated');
    expect(classifyConfirmReply('תמחר את אנה 20 אלף', t)).toBe('unrelated');
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/confirm.test.ts`

**Impl** `src/lib/assistant/confirm.ts`:
```ts
import { createHash } from 'crypto';

function stableStringify(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
export function computeParamsHash(tool: string, version: number, params: any): string {
  return createHash('sha256').update(`${tool}@${version}:${stableStringify(params)}`).digest('hex').slice(0, 16);
}

const VERB: Record<string, string> = {
  'crm.mark_paid': 'PAID', 'crm.send_contract': 'SEND', 'crm.cancel': 'CXL',
  'crm.request_invoice': 'INV', 'crm.resend_link': 'LINK', 'crm.set_commission': 'COMM', 'crm.reassign_talent': 'MOVE',
};
export function mintEchoToken(kind: string, seed: number): string {
  const verb = VERB[kind] || 'OK';
  return `${verb}-${String(Math.abs(Math.trunc(seed)) % 1000).padStart(3, '0')}`;
}
function normTok(s: string): string { return (s || '').toUpperCase().replace(/\s+/g, '').replace(/[־–—]/g, '-'); }
export function matchEchoToken(text: string, token: string): boolean {
  return normTok(text).includes(normTok(token));
}
export function encodeButtonId(decision: 'confirm' | 'cancel', pendingId: string): string { return `${decision}:${pendingId}`; }
export function parseButtonReply(buttonId: string): { decision: 'confirm' | 'cancel'; pendingActionId: string } | null {
  const i = (buttonId || '').indexOf(':');
  if (i < 0) return null;
  const decision = buttonId.slice(0, i);
  const pendingActionId = buttonId.slice(i + 1);
  if ((decision !== 'confirm' && decision !== 'cancel') || !pendingActionId) return null;
  return { decision, pendingActionId };
}
export function isExpired(expiresAt: string, now = Date.now()): boolean { return Date.parse(expiresAt) < now; }

const CANCEL_WORDS = new Set(['בטל', 'ביטול', 'לא', 'עזוב', 'תבטל', 'no', 'cancel']);
/** Free-text "כן" is intentionally 'unrelated' — Tier-2 must not be gated by a mis-transcribed/injected yes (§3.3). */
export function classifyConfirmReply(text: string, token: string): 'confirm' | 'cancel' | 'unrelated' {
  if (matchEchoToken(text, token)) return 'confirm';
  const toks = (text || '').toLowerCase().split(/[\s,.!?;:()\-]+/).filter(Boolean);
  if (toks.length > 0 && toks.every((w) => CANCEL_WORDS.has(w))) return 'cancel';
  return 'unrelated';
}
```
**Run to pass:** `npx vitest run tests/unit/assistant/confirm.test.ts`

**Commit:** `feat(assistant): deterministic Tier-2 confirmation binding (hash/echo-token/button/collision)`

---

### Task 6 — Migration 064: pending_actions confirmation columns + DB helpers

**Files:** create `supabase/migrations/064_assistant_confirmations.sql`; extend `src/lib/assistant/confirm.ts` with DB helpers; create `tests/integration/assistant/pending-actions.fixture.test.ts` (gated).

**Migration** `064_assistant_confirmations.sql`:
```sql
-- Migration 064: Tier-2 confirmation workflow columns on pending_actions (P1 created the base table).
alter table public.pending_actions
  add column if not exists status text not null default 'awaiting',   -- awaiting|confirmed|cancelled|expired
  add column if not exists kind text,                                 -- tool name, or 'batch' for a voice plan-echo
  add column if not exists echo_token text,
  add column if not exists confirm_wamid text,                        -- wa_message_id of the button prompt
  add column if not exists batch_id uuid,
  add column if not exists summary_text text,                         -- plan-echo readback / confirm prompt
  add column if not exists resolved_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

create index if not exists pending_actions_agent_status_idx
  on public.pending_actions (agent_id, status);
```
Apply via `mcp__supabase__apply_migration` (name `064_assistant_confirmations`). Verify: `mcp__supabase__list_migrations`.

**DB helpers appended to `confirm.ts`** (`createPendingAction`, `resolvePendingConfirmation`, `cancelAwaitingForAgent`) using `supabaseAdmin`, minting `echo_token` + `params_hash`, default `expires_at = now()+10m`; `resolvePendingConfirmation(agentId, reply)` loads the newest `status='awaiting'` row, `isExpired` → mark `expired`, else `classifyConfirmReply` → `confirmed`/`cancelled`, re-checking `params_hash` equality before returning `confirmed`.

**Gated fixture** asserts: create → confirm via echo-token flips status + returns params; a second substantive message cancels the awaiting row (collision); expired row re-asks.

**Run (gated):** `ASSISTANT_TEST_DB=1 npx vitest run tests/integration/assistant/pending-actions.fixture.test.ts`

**Commit:** `feat(assistant): pending_actions confirmation columns + binding DB helpers (migration 064)`

---

### Task 7 — WhatsApp interactive-button sender (§3.3 preferred mechanism)

Adds `sendInteractiveButtons` to the existing client (the button both confirms unambiguously AND re-opens the 24h window).

**Files:** modify `src/lib/whatsapp-cloud/client.ts`; create `tests/unit/assistant/interactive-buttons.test.ts`

**Failing test** (pure payload builder — factor `buildButtonPayload`):
```ts
import { describe, it, expect } from 'vitest';
import { buildButtonPayload } from '@/lib/whatsapp-cloud/client';

describe('buildButtonPayload', () => {
  it('builds a reply-button interactive payload (ids carry the pending action)', () => {
    const p = buildButtonPayload('972501112222', 'לשלוח חוזה לפוקס?', [
      { id: 'confirm:pa_1', title: 'שלח' }, { id: 'cancel:pa_1', title: 'בטל' },
    ]);
    expect(p.type).toBe('interactive');
    expect(p.interactive.type).toBe('button');
    expect(p.interactive.action.buttons.map((b: any) => b.reply.id)).toEqual(['confirm:pa_1', 'cancel:pa_1']);
    expect(p.to).toBe('972501112222');
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/interactive-buttons.test.ts`

**Impl** — append to `client.ts`:
```ts
export function buildButtonPayload(to: string, body: string, buttons: Array<{ id: string; title: string }>) {
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: toWaId(to),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
    },
  };
}
export async function sendInteractiveButtons(params: {
  to: string; body: string; buttons: Array<{ id: string; title: string }>; contextMessageId?: string;
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId } = getConfig();
  const payload: any = buildButtonPayload(params.to, params.body, params.buttons);
  if (params.contextMessageId) payload.context = { message_id: params.contextMessageId };
  const { ok, data } = await graphFetch(`/${phoneNumberId}/messages`, { method: 'POST', body: JSON.stringify(payload) });
  return parseSendResponse(ok, data);
}
```
**Run to pass:** `npx vitest run tests/unit/assistant/interactive-buttons.test.ts`

**Commit:** `feat(whatsapp): interactive reply-button sender for Tier-2 confirmations`

---

### Task 8 — `mark_paid` tool (irreversible, confirm_deterministic) with WHERE-guard

Canonical Tier-2 tool; precondition `invoice.status='sent'` as a WHERE-guarded update → 0 rows = honest no-op (§3.2). Fully provenanced (§6.8) — origin/turn recorded by executor ledger.

**Files:** create `src/lib/assistant/tools/mark_paid.ts`; create `tests/unit/assistant/mark-paid.test.ts`; create `tests/integration/assistant/mark-paid.fixture.test.ts` (gated — happy, mark-twice idempotency, already-paid no-op).

**Failing unit test** (contract + guarded-update helper):
```ts
import { describe, it, expect } from 'vitest';
import { markPaidTool, markPaidGuarded } from '@/lib/assistant/tools/mark_paid';

describe('markPaidTool contract', () => {
  it('is irreversible, deterministic-confirm', () => {
    expect(markPaidTool.name).toBe('crm.mark_paid');
    expect(markPaidTool.sideEffect).toBe('irreversible');
    expect(markPaidTool.confirmation).toBe('confirm_deterministic');
    expect(markPaidTool.idempotencyKey!({ invoice_id: 'i1' } as any, {} as any)).toBe('mark_paid:i1');
  });
});
describe('markPaidGuarded (0-rows → honest no-op)', () => {
  it('returns already_paid when the guarded update touched 0 rows', async () => {
    const fakeDb = { update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [] }) }) }) }) } as any;
    const r = await markPaidGuarded(fakeDb, 'i1');
    expect(r).toEqual({ ok: false, reason: 'already_paid' });
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/mark-paid.test.ts`

**Impl** `src/lib/assistant/tools/mark_paid.ts`:
```ts
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/assistant/registry';
import { assertAgentOwns } from '@/lib/assistant/gate';
import { supabase as supabaseAdmin } from '@/lib/supabase';

const paramsSchema = z.object({ invoice_id: z.string() });

/** WHERE-guarded transition sent→paid. 0 rows affected = already paid / not sent (never blind re-run). */
export async function markPaidGuarded(db: any, invoiceId: string): Promise<{ ok: boolean; reason?: string; partnershipId?: string }> {
  const nowIso = new Date().toISOString();
  const { data } = await db.from('invoices')
    .update({ status: 'paid', paid_at: nowIso.slice(0, 10), updated_at: nowIso })
    .eq('id', invoiceId).eq('status', 'sent')
    .select('id, partnership_id');
  if (!data || data.length === 0) return { ok: false, reason: 'already_paid' };
  return { ok: true, partnershipId: data[0].partnership_id };
}

export const markPaidTool: ToolDefinition<z.infer<typeof paramsSchema>, { invoiceId: string; partnershipId?: string }> = {
  name: 'crm.mark_paid', version: 1,
  description: 'מסמן חשבונית כשולמה. פעולה בלתי הפיכה — דורשת אישור מפורש (כפתור/קוד).',
  whenToUse: 'הסוכן אישר במפורש שהתקבל תשלום על חשבונית ספציפית.',
  whenNotToUse: 'שאלה על סטטוס תשלום, או חשבונית לא מזוהה.',
  paramsSchema,
  sideEffect: 'irreversible', addressesExternalParty: false, confirmation: 'confirm_deterministic',
  idempotent: true, idempotencyKey: (p) => `mark_paid:${p.invoice_id}`, requiredRole: 'any',
  async ground(p, ctx) {
    const { data: inv } = await supabaseAdmin.from('invoices').select('id, agent_id, partnership_id').eq('id', p.invoice_id).maybeSingle();
    if (!inv) return { ok: false, error: 'not_found' } as any;
    await assertAgentOwns(ctx.agent, { dealId: inv.partnership_id });
    return { ok: true } as any;
  },
  async execute(p, ctx) {
    const r = await markPaidGuarded(supabaseAdmin, p.invoice_id);
    if (!r.ok) return { ok: false, error: 'already_paid' };
    if (r.partnershipId) {
      await supabaseAdmin.from('partnerships').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', r.partnershipId);
    }
    return { ok: true, result: { invoiceId: p.invoice_id, partnershipId: r.partnershipId } };
  },
};
```
**Run to pass (unit):** `npx vitest run tests/unit/assistant/mark-paid.test.ts`

**Gated fixture** seeds an invoice `status='sent'`, asserts: 1st execute → paid + partnership completed; 2nd execute → `{ok:false,error:'already_paid'}` (no state change).

**Run (gated):** `ASSISTANT_TEST_DB=1 npx vitest run tests/integration/assistant/mark-paid.fixture.test.ts`

**Commit:** `feat(assistant): mark_paid tool with WHERE-guarded sent→paid transition`

---

### Task 9 — `send_contract` tool (Tier-2, WHERE-guard precondition)

Precondition per §3.2: quote signed AND no contract yet. Reuses `createContractDraft` + `sendContract`; `addressesExternalParty:false` (produces a signUrl the agent forwards — never messages the brand).

**Files:** create `src/lib/assistant/tools/send_contract.ts`; create `tests/unit/assistant/send-contract.test.ts`; gated fixture `tests/integration/assistant/send-contract.fixture.test.ts`.

**Failing unit test:**
```ts
import { describe, it, expect } from 'vitest';
import { sendContractTool, contractPreconditionOk } from '@/lib/assistant/tools/send_contract';

describe('sendContractTool contract', () => {
  it('is irreversible deterministic-confirm, keyed per deal', () => {
    expect(sendContractTool.confirmation).toBe('confirm_deterministic');
    expect(sendContractTool.sideEffect).toBe('irreversible');
    expect(sendContractTool.idempotencyKey!({ partnership_id: 'd1' } as any, {} as any)).toBe('send_contract:d1');
  });
});
describe('contractPreconditionOk', () => {
  it('requires a signed quote and no existing contract', () => {
    expect(contractPreconditionOk({ status: 'signed' }, null)).toBe(true);
    expect(contractPreconditionOk({ status: 'proposal' }, null)).toBe(false);
    expect(contractPreconditionOk({ status: 'signed' }, { id: 'c1' })).toBe(false);
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/send-contract.test.ts`

**Impl** `src/lib/assistant/tools/send_contract.ts`:
```ts
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/assistant/registry';
import { assertAgentOwns } from '@/lib/assistant/gate';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { createContractDraft, sendContract } from '@/lib/crm/contracts';

const paramsSchema = z.object({ partnership_id: z.string() });

export function contractPreconditionOk(partnership: any, existingContract: any): boolean {
  return partnership?.status === 'signed' && !existingContract;
}

export const sendContractTool: ToolDefinition<z.infer<typeof paramsSchema>, { signUrl: string; partnershipId: string }> = {
  name: 'crm.send_contract', version: 1,
  description: 'מפיק ושולח חוזה לחתימה על עסקה שההצעה בה נחתמה. מחזיר קישור לחתימה שהסוכן מעביר. דורש אישור מפורש.',
  whenToUse: 'ההצעה נחתמה והסוכן אישר לשלוח חוזה.',
  whenNotToUse: 'ההצעה עוד לא נחתמה, או כבר קיים חוזה.',
  paramsSchema,
  sideEffect: 'irreversible', addressesExternalParty: false, confirmation: 'confirm_deterministic',
  idempotent: true, idempotencyKey: (p) => `send_contract:${p.partnership_id}`, requiredRole: 'any',
  async ground(p, ctx) { await assertAgentOwns(ctx.agent, { dealId: p.partnership_id }); return { ok: true } as any; },
  async execute(p, ctx) {
    const { data: partnership } = await supabaseAdmin.from('partnerships').select('id, status').eq('id', p.partnership_id).maybeSingle();
    const { data: existing } = await supabaseAdmin.from('contracts').select('id').eq('partnership_id', p.partnership_id).maybeSingle();
    if (!contractPreconditionOk(partnership, existing)) return { ok: false, error: 'conflict' };
    const draft = await createContractDraft(p.partnership_id, ctx.agent.id);
    const sent = await sendContract((draft as any).id || (draft as any).contract?.id, ctx.agent.id);
    return { ok: true, result: { signUrl: sent.signUrl, partnershipId: p.partnership_id } };
  },
};
```
(If `createContractDraft`'s return shape differs, bind the contract id accordingly — confirm against contracts.ts final signature.)

**Run to pass (unit):** `npx vitest run tests/unit/assistant/send-contract.test.ts`; gated fixture covers happy + double-send conflict.

**Commit:** `feat(assistant): send_contract tool with signed-quote precondition`

---

### Task 10 — `request_invoice`, `resend_link`, `cancel` tools (Tier-2)

Three more registry entries wrapping existing services (`requestInvoice`, `resendQuote`, `cancelQuote`/`cancelInvoice`). Same confirm_deterministic pattern.

**Files:** create `src/lib/assistant/tools/request_invoice.ts`, `resend_link.ts`, `cancel.ts`; create `tests/unit/assistant/tier2-tools.test.ts`; gated `tests/integration/assistant/tier2-tools.fixture.test.ts`.

**Failing unit test** (contracts + idempotency keys):
```ts
import { describe, it, expect } from 'vitest';
import { requestInvoiceTool } from '@/lib/assistant/tools/request_invoice';
import { resendLinkTool } from '@/lib/assistant/tools/resend_link';
import { cancelTool } from '@/lib/assistant/tools/cancel';

describe('tier-2 tool contracts', () => {
  it('all require deterministic confirmation', () => {
    for (const t of [requestInvoiceTool, resendLinkTool, cancelTool]) expect(t.confirmation).toBe('confirm_deterministic');
    expect(requestInvoiceTool.idempotencyKey!({ partnership_id: 'd1' } as any, {} as any)).toBe('request_invoice:d1');
    expect(resendLinkTool.addressesExternalParty).toBe(false);
    expect(cancelTool.sideEffect).toBe('irreversible');
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/tier2-tools.test.ts`

**Impl** — three files following the mark_paid/send_contract shape:
- `request_invoice.ts`: params `{ partnership_id }`, `ground → assertAgentOwns({dealId})`, `execute → requestInvoice({partnershipId, agentId: ctx.agent.id})`, result `{ invoiceId, uploadUrl }`. `sideEffect:'write_external'`, `idempotencyKey: p=>'request_invoice:'+p.partnership_id` (the service already dedups an open invoice).
- `resend_link.ts`: params `{ signature_request_id }`, `execute → resendQuote(sigId, ctx.agent.id)`, result `{ signUrl }`, `sideEffect:'write_external'`, `idempotencyKey: p=>'resend_link:'+p.signature_request_id`.
- `cancel.ts`: params `{ target: z.enum(['quote','invoice']), id: z.string(), partnership_id: z.string().optional() }`; `execute` routes to `cancelQuote(id, agentId)` or `cancelInvoice(partnership_id, agentId)`; `sideEffect:'irreversible'`; `idempotencyKey: p=>'cancel:'+p.target+':'+p.id`.

Each `ground()` calls `assertAgentOwns`. Each returns `{ok:false,error:'conflict'|'not_found'}` when the underlying service throws / returns `{ok:false}`.

**Run to pass (unit):** `npx vitest run tests/unit/assistant/tier2-tools.test.ts`; gated fixture: request-invoice twice returns same invoice (idempotent), resend rotates the token, cancel on a signed quote → conflict.

**Commit:** `feat(assistant): request_invoice, resend_link, cancel Tier-2 tools`

---

### Task 11 — Register write tools + confirm-prompt composer

Wire all six write tools into the registry and add the deterministic-confirm prompt sender (button preferred + echo-token fallback line), bound to a freshly-created `pending_action`.

**Files:** modify/create `src/lib/assistant/tools/index.ts` (register write tools alongside P1 read tools); create `src/lib/assistant/confirm-prompt.ts`; create `tests/unit/assistant/confirm-prompt.test.ts`.

**Failing test** (pure prompt composer):
```ts
import { describe, it, expect } from 'vitest';
import { composeConfirmPrompt } from '@/lib/assistant/confirm-prompt';

describe('composeConfirmPrompt', () => {
  it('renders body + button ids + echo-token fallback line', () => {
    const p = composeConfirmPrompt({ pendingActionId: 'pa_9', echoToken: 'PAID-204', body: 'לסמן את חשבונית פוקס כשולמה?' });
    expect(p.buttons).toEqual([{ id: 'confirm:pa_9', title: 'אישור' }, { id: 'cancel:pa_9', title: 'ביטול' }]);
    expect(p.fallbackText).toContain('PAID-204');
    expect(p.body).toContain('פוקס');
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/confirm-prompt.test.ts`

**Impl** `src/lib/assistant/confirm-prompt.ts`:
```ts
import { encodeButtonId } from '@/lib/assistant/confirm';
export function composeConfirmPrompt(a: { pendingActionId: string; echoToken: string; body: string }) {
  return {
    body: a.body,
    buttons: [
      { id: encodeButtonId('confirm', a.pendingActionId), title: 'אישור' },
      { id: encodeButtonId('cancel', a.pendingActionId), title: 'ביטול' },
    ],
    fallbackText: `${a.body}\nלאישור השב/י: ${a.echoToken}`,
  };
}
```
`tools/index.ts` adds `registry.register(buildQuoteTool, sendContractTool, requestInvoiceTool, resendLinkTool, markPaidTool, cancelTool)` (matching P1's registration convention).

**Run to pass:** `npx vitest run tests/unit/assistant/confirm-prompt.test.ts`; then `npm run type-check` to confirm the registry accepts the new `ToolDefinition`s.

**Commit:** `feat(assistant): register write tools + Tier-2 confirm-prompt composer`

---

### Task 12 — Voice plan-echo readback + per-item receipts (pure, §11)

**Files:** extend `src/lib/assistant/voice.ts`; create `tests/unit/assistant/voice-readback.test.ts`

**Interfaces:** `composePlanEcho(items:PlanEchoItem[]):string`, `composeReceipts(results:ItemReceipt[]):string` (totals come precomputed from `computeTotals` — voice.ts formats only).

**Failing test:**
```ts
import { describe, it, expect } from 'vitest';
import { composePlanEcho, composeReceipts } from '@/lib/assistant/voice';

describe('composePlanEcho', () => {
  it('reads each deal back with VAT expanded (money math from computeTotals)', () => {
    const s = composePlanEcho([
      { seq: 1, talent: 'נועה', brand: 'Fox', subtotal: 20000, vat: 3600, total: 23600 },
      { seq: 2, talent: 'אנה', brand: 'Coca-Cola', subtotal: 80000, vat: 14400, total: 94400 },
    ]);
    expect(s).toContain('הבנתי 2 הצעות');
    expect(s).toContain('נועה');
    expect(s).toContain('₪20,000');
    expect(s).toContain('₪23,600');
  });
});
describe('composeReceipts', () => {
  it('groups successes, flags each failure, never says done on partial', () => {
    const s = composeReceipts([
      { seq: 1, ok: true, label: 'נועה·Fox' },
      { seq: 2, ok: true, label: 'אנה·Coca' },
      { seq: 3, ok: false, label: 'מאור', reason: 'חסר מחיר' },
    ]);
    expect(s).toContain('✅ 1, 2');
    expect(s).toContain('⚠️ 3');
    expect(s).toContain('חסר מחיר');
    expect(s).not.toContain('בוצע הכל');
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/voice-readback.test.ts`

**Impl** — append to `voice.ts`:
```ts
export interface PlanEchoItem { seq: number; talent: string; brand: string; subtotal: number; vat: number; total: number; currency?: string }
export interface ItemReceipt { seq: number; ok: boolean; label: string; reason?: string }
const shekel = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`;

export function composePlanEcho(items: PlanEchoItem[]): string {
  const lines = items.map((it) => `${it.seq}. ${it.talent} — ${it.brand} — ${shekel(it.subtotal)} + מע"מ = ${shekel(it.total)}`);
  return `הבנתי ${items.length} הצעות:\n${lines.join('\n')}\n\nלבנות את כולן? השב/י "אישור" או תקן/י פריט ("רק ה-3", "אנה 90 אלף").`;
}
export function composeReceipts(results: ItemReceipt[]): string {
  const ok = results.filter((r) => r.ok).map((r) => r.seq);
  const bad = results.filter((r) => !r.ok);
  const parts: string[] = [];
  if (ok.length) parts.push(`✅ ${ok.join(', ')}`);
  for (const b of bad) parts.push(`⚠️ ${b.seq} ${b.label}${b.reason ? ' — ' + b.reason : ''}`);
  return parts.join('\n');
}
```
**Run to pass:** `npx vitest run tests/unit/assistant/voice-readback.test.ts`

**Commit:** `feat(assistant): voice plan-echo readback + per-item receipts (§11)`

---

### Task 13 — Voice multi-command orchestrator through the planner (§2.3/§11)

Replaces `handleVoiceCommand` (wa-conversation.ts): transcript → `normalizeSpokenNumbers` → **P2 `plan()`** → `resolveRefs` per action → `gate` → compute per-item totals via `computeTotals` → create ONE `batch` `pending_action` whose `summary_text` = `composePlanEcho(...)` → return the readback. On confirm, `executeVoiceBatch` runs each child via the P1 executor and returns `composeReceipts`. Dependency-injected so it unit-tests without DB/LLM.

**Files:** create `src/lib/assistant/voice-batch.ts`; create `tests/unit/assistant/voice-batch.test.ts`; gated wiring test `tests/integration/assistant/voice-batch.fixture.test.ts`.

**Interfaces:** `runVoiceBatch(input, deps):Promise<{readback?;pendingActionId?;clarification?}>`, `executeVoiceBatch(pendingActionId, deps):Promise<{receipts:string}>`

**Failing test** (fakes for plan/resolve/gate/execute/createPending):
```ts
import { describe, it, expect, vi } from 'vitest';
import { runVoiceBatch, executeVoiceBatch } from '@/lib/assistant/voice-batch';

const twoQuotePlan = {
  actions: [
    { tool: 'crm.build_quote', confidence: 0.9, refs: { talent: 'נועה', brief: 'b1' }, inputs: { line_items: [{ deliverable: 'reel', qty: 1, unit_price: 20000 }] } },
    { tool: 'crm.build_quote', confidence: 0.9, refs: { talent: 'אנה', brief: 'b2' }, inputs: { line_items: [{ deliverable: 'reel', qty: 1, unit_price: 80000 }] } },
  ],
};

describe('runVoiceBatch', () => {
  it('normalizes spoken numbers, plans, and returns a plan-echo bound to a batch pending action', async () => {
    const deps = {
      plan: vi.fn(async (msg: string) => { expect(msg).toContain('20000'); return twoQuotePlan; }),
      resolveRefs: vi.fn(async (a: any) => ({ action: { ...a, inputs: { ...a.inputs, brief_id: a.refs.brief, account_id: 'acc_' + a.refs.talent }, }, ambiguities: [] })),
      labelFor: vi.fn(async (a: any) => ({ talent: a.refs.talent, brand: a.refs.talent === 'נועה' ? 'Fox' : 'Coca-Cola' })),
      createPendingAction: vi.fn(async () => ({ id: 'pa_batch', echoToken: 'OK-777' })),
      context: {},
    };
    const r = await runVoiceBatch({ agent: { id: 'ag' }, transcript: 'נועה לפוקס עשרים אלף, אנה 80 אלף', context: {} }, deps as any);
    expect(deps.plan).toHaveBeenCalled();
    expect(r.pendingActionId).toBe('pa_batch');
    expect(r.readback).toContain('הבנתי 2 הצעות');
    expect(r.readback).toContain('₪23,600'); // computeTotals-derived
  });
});

describe('executeVoiceBatch', () => {
  it('executes each child and returns per-item receipts; partial failure is never "done"', async () => {
    const children = [
      { seq: 1, action: { tool: 'crm.build_quote' }, label: 'נועה·Fox' },
      { seq: 2, action: { tool: 'crm.build_quote' }, label: 'אנה·Coca', fail: true },
    ];
    const deps = {
      loadBatch: vi.fn(async () => ({ children })),
      executeAction: vi.fn(async (c: any) => (c.fail ? { ok: false, error: 'missing_price' } : { ok: true, result: {} })),
      markResolved: vi.fn(async () => {}),
    };
    const r = await executeVoiceBatch('pa_batch', deps as any);
    expect(r.receipts).toContain('✅ 1');
    expect(r.receipts).toContain('⚠️ 2');
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/voice-batch.test.ts`

**Impl** `src/lib/assistant/voice-batch.ts`:
```ts
import { normalizeSpokenNumbers, composePlanEcho, composeReceipts, type PlanEchoItem, type ItemReceipt } from '@/lib/assistant/voice';
import { computeTotals, DEFAULT_VAT_RATE } from '@/lib/crm/pricing';

export async function runVoiceBatch(input: { agent: any; transcript: string; context: any }, deps: any) {
  const normalized = normalizeSpokenNumbers(input.transcript);
  const plan = await deps.plan(normalized, input.context);
  if (!plan?.actions?.length) return { clarification: plan?.clarification || 'לא הבנתי לאיזה בריף מדובר. אפשר שם המותג או המיוצג?' };

  const children: any[] = [];
  const echo: PlanEchoItem[] = [];
  let seq = 0;
  for (const raw of plan.actions) {
    seq++;
    const { action, ambiguities } = await deps.resolveRefs(raw, input.context);
    if (ambiguities?.length) { children.push({ seq, action, label: raw.refs?.talent || 'פריט', blocked: 'ambiguous' }); continue; }
    const items = (action.inputs?.line_items || []).map((li: any) => ({ ...li, vat_rate: li.vat_rate == null ? DEFAULT_VAT_RATE : li.vat_rate }));
    const totals = computeTotals(items);            // money math ONLY in computeTotals
    const meta = await deps.labelFor(action);
    echo.push({ seq, talent: meta.talent, brand: meta.brand, subtotal: totals.subtotal, vat: totals.vat, total: totals.total });
    children.push({ seq, action, label: `${meta.talent}·${meta.brand}` });
  }
  const pending = await deps.createPendingAction({ agentId: input.agent.id, kind: 'batch', summary_text: composePlanEcho(echo), children });
  return { pendingActionId: pending.id, readback: composePlanEcho(echo) };
}

export async function executeVoiceBatch(pendingActionId: string, deps: any): Promise<{ receipts: string }> {
  const batch = await deps.loadBatch(pendingActionId);
  const results: ItemReceipt[] = [];
  for (const child of batch.children) {
    if (child.blocked) { results.push({ seq: child.seq, ok: false, label: child.label, reason: 'מעורפל' }); continue; }
    const r = await deps.executeAction(child, batch);
    results.push({ seq: child.seq, ok: !!r.ok, label: child.label, reason: r.ok ? undefined : (r.error === 'missing_price' ? 'חסר מחיר' : String(r.error || 'נכשל')) });
  }
  await deps.markResolved(pendingActionId);
  return { receipts: composeReceipts(results) };
}
```
**Run to pass (unit):** `npx vitest run tests/unit/assistant/voice-batch.test.ts`

**Gated wiring fixture** injects the real `plan` (P2), `resolveRefs` (P1), `executeAction` (P1), and the Task-6 `createPendingAction`; asserts a two-command voice note yields a readback then two built quotes with per-item receipts.

**Commit:** `feat(assistant): voice multi-command orchestrator via planner + plan-echo (§11)`

---

### Task 14 — Route confirmations from the webhook into the executor

Wire button-reply / echo-token replies from the WhatsApp webhook to `resolvePendingConfirmation` → on `confirmed` run the executor (single tool) or `executeVoiceBatch` (batch); on `unrelated` apply the cancel-pending collision rule then fall through to normal planning. Purely additive to `maybeHandleAgentQuote` in the route.

**Files:** modify `src/app/api/webhooks/whatsapp/route.ts` (extract inbound `interactive.button_reply.id` alongside existing `textBody`); create `src/lib/assistant/handle-confirmation.ts`; create `tests/unit/assistant/handle-confirmation.test.ts`.

**Interfaces:** `extractConfirmationSignal(msg):{buttonId?:string;text?:string}`, `handleConfirmation(agentId, signal, deps):Promise<{reply?:string;handled:boolean}>`

**Failing test** (routing decisions, injected deps):
```ts
import { describe, it, expect, vi } from 'vitest';
import { extractConfirmationSignal, handleConfirmation } from '@/lib/assistant/handle-confirmation';

describe('extractConfirmationSignal', () => {
  it('prefers an interactive button id', () => {
    expect(extractConfirmationSignal({ type: 'interactive', interactive: { button_reply: { id: 'confirm:pa_1', title: 'אישור' } } }))
      .toEqual({ buttonId: 'confirm:pa_1' });
    expect(extractConfirmationSignal({ type: 'text', text: { body: 'PAID-204' } })).toEqual({ text: 'PAID-204' });
  });
});
describe('handleConfirmation', () => {
  it('button-confirm on a single tool runs the executor', async () => {
    const deps = {
      resolveByButton: vi.fn(async () => ({ status: 'confirmed', pending: { kind: 'crm.mark_paid', params: { invoice_id: 'i1' } } })),
      runTool: vi.fn(async () => ({ ok: true, reply: 'סומן כשולם' })),
      runBatch: vi.fn(),
    };
    const r = await handleConfirmation('ag', { buttonId: 'confirm:pa_1' }, deps as any);
    expect(deps.runTool).toHaveBeenCalled();
    expect(r).toEqual({ handled: true, reply: 'סומן כשולם' });
  });
  it('cancel button resolves without executing', async () => {
    const deps = { resolveByButton: vi.fn(async () => ({ status: 'cancelled' })), runTool: vi.fn(), runBatch: vi.fn() };
    const r = await handleConfirmation('ag', { buttonId: 'cancel:pa_1' }, deps as any);
    expect(deps.runTool).not.toHaveBeenCalled();
    expect(r.handled).toBe(true);
  });
});
```
**Run to fail:** `npx vitest run tests/unit/assistant/handle-confirmation.test.ts`

**Impl** `src/lib/assistant/handle-confirmation.ts`:
```ts
import { parseButtonReply } from '@/lib/assistant/confirm';

export function extractConfirmationSignal(msg: any): { buttonId?: string; text?: string } {
  const buttonId = msg?.interactive?.button_reply?.id;
  if (buttonId) return { buttonId };
  const text = msg?.text?.body ?? msg?.button?.text ?? null;
  return text ? { text } : {};
}
/** Returns handled=false when no pending confirmation matches (caller falls through to planning). */
export async function handleConfirmation(agentId: string, signal: { buttonId?: string; text?: string }, deps: any): Promise<{ reply?: string; handled: boolean }> {
  let outcome: any;
  if (signal.buttonId) {
    const parsed = parseButtonReply(signal.buttonId);
    if (!parsed) return { handled: false };
    outcome = await deps.resolveByButton(agentId, parsed);
  } else if (signal.text) {
    outcome = await deps.resolveByText(agentId, signal.text); // resolvePendingConfirmation (echo-token / cancel / unrelated)
    if (!outcome || outcome.status === 'none' || outcome.status === 'unrelated') return { handled: false };
  } else return { handled: false };

  if (outcome.status === 'expired') return { handled: true, reply: 'הבקשה פגה — שלח/י שוב לאישור.' };
  if (outcome.status === 'cancelled') return { handled: true, reply: 'בוטל.' };
  if (outcome.status !== 'confirmed') return { handled: false };

  if (outcome.pending?.kind === 'batch') { const r = await deps.runBatch(outcome.pending.id); return { handled: true, reply: r.receipts }; }
  const r = await deps.runTool(agentId, outcome.pending);
  return { handled: true, reply: r.reply };
}
```
Webhook edit: in `maybeHandleAgentQuote`, before calling `handleAgentMessage`, extract the signal and call `handleConfirmation(agent.id, extractConfirmationSignal(args.msg), realDeps)`; if `handled`, `sendText` the reply and return. `realDeps` wire `resolvePendingConfirmation` (Task 6), the executor single-tool runner, and `executeVoiceBatch` (Task 13).

**Run to pass (unit):** `npx vitest run tests/unit/assistant/handle-confirmation.test.ts`; then `npm run type-check`.

**Commit:** `feat(assistant): route WhatsApp button/echo-token confirmations into the executor`

---

### Final gate (whole phase)

```bash
npx vitest run tests/unit/assistant            # all P3 pure/unit suites green
npx vitest run tests/unit/crm-pricing.test.ts tests/unit/crm-wa-interpret.test.ts   # no regressions
npm run type-check
ASSISTANT_TEST_DB=1 npx vitest run tests/integration/assistant   # real-branch executor fixtures (CI branch only)
```
Grounding invariant (§14): the write tools never emit an ID/amount absent from context — `build_quote` returns only DB-created IDs; every total is `computeTotals`-derived; Tier-2 is gated solely by button/echo-token bound to `pending_action.id` + `params_hash`. Confirm the adversarial "כן"/injected-yes case: `classifyConfirmReply('כן', token) === 'unrelated'` (never `confirm`).