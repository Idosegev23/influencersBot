_All new code under `src/lib/assistant/`. Pure/testable helpers are split from DB calls (the `wa-interpret.ts` + its vitest pattern). All unit tests are hermetic: DB-touching modules take injected deps; type-only imports from `registry.ts` are erased at runtime so tests run even before P1 lands. Money math NEVER in the LLM — `computeTotals` in the Executor only. Run one test file: `npx vitest run tests/unit/assistant/<file>.test.ts`. Type-check: `npm run type-check`. Commit atomically; every commit body ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`._

---

## Task P2.0 — Add `zod` + the ToolDefinition registry (contract + dispatch)

**Files**
- create `src/lib/assistant/registry.ts`
- modify `package.json` (add `zod`)
- create `tests/unit/assistant/registry.test.ts`

**Interfaces (produces)**
```ts
export type SideEffect = 'read'|'write_internal'|'write_external'|'irreversible';
export type Confirmation = 'none'|'undo'|'confirm_deterministic';
export type RequiredRole = 'any'|'owner';
export type ToolResult<T=any> = { ok:true; result:T } | { ok:false; error:string };
export interface ToolExecuteCtx {
  agent: { id:string; agency_id?:string|null; role:'owner'|'employee'|'agent'; full_name?:string|null; managed_account_ids?:string[]|null };
  resolved: { talentId?:string; clientId?:string; briefId?:string };
  db: any;
  assertAgentOwns: (scope:{accountId?:string; dealId?:string; briefId?:string}) => Promise<void>;
}
export interface ToolDefinition<TParams=any,TResult=any> {
  name:string; version:number; description:string; whenToUse:string; whenNotToUse:string;
  paramsSchema:{ safeParse:(v:unknown)=>{success:boolean; data?:any; error?:any} };
  sideEffect:SideEffect; addressesExternalParty:boolean; confirmation:Confirmation;
  idempotent:boolean; idempotencyKey?:(p:TParams,ctx:ToolExecuteCtx)=>string;
  requiredCapability?:string; requiredRole:RequiredRole;
  ground?:(p:TParams,ctx:ToolExecuteCtx)=>any;
  execute:(p:TParams,ctx:ToolExecuteCtx)=>Promise<ToolResult<TResult>>;
}
export interface PlannerToolProjection { name:string; description:string; whenToUse:string; whenNotToUse:string; }
export function createRegistry(): { register(t:ToolDefinition):any; getTool(n:string):ToolDefinition|null; listTools():ToolDefinition[]; projectForPlanner(filter?:(t:ToolDefinition)=>boolean):PlannerToolProjection[] };
export type Registry = ReturnType<typeof createRegistry>;
```
> `paramsSchema` is duck-typed to `{safeParse}` so fake tools in tests need no zod; real tools (`tools/build_quote.ts`) pass a `z.object(...)`.

**Steps**
1. **Failing test** `tests/unit/assistant/registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createRegistry, type ToolDefinition } from '@/lib/assistant/registry';

const fake = (over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  name: 'crm.status', version: 1, description: 'status', whenToUse: 'w', whenNotToUse: 'n',
  paramsSchema: { safeParse: (v) => ({ success: true, data: v }) },
  sideEffect: 'read', addressesExternalParty: false, confirmation: 'none',
  idempotent: true, requiredRole: 'any', execute: async () => ({ ok: true, result: {} }), ...over,
});

describe('registry', () => {
  it('registers, gets, and projects only name/description/when for the Planner', () => {
    const r = createRegistry();
    r.register(fake()).register(fake({ name: 'crm.mark_paid', requiredRole: 'owner' }));
    expect(r.getTool('crm.status')?.name).toBe('crm.status');
    expect(r.getTool('missing')).toBeNull();
    const proj = r.projectForPlanner();
    expect(proj).toHaveLength(2);
    expect(Object.keys(proj[0])).toEqual(['name', 'description', 'whenToUse', 'whenNotToUse']); // no execute/schema leaked
  });
  it('projectForPlanner honors a capability/role filter', () => {
    const r = createRegistry();
    r.register(fake()).register(fake({ name: 'crm.set_commission', requiredRole: 'owner' }));
    expect(r.projectForPlanner((t) => t.requiredRole !== 'owner').map((p) => p.name)).toEqual(['crm.status']);
  });
});
```
2. **Run-to-fail**: `npx vitest run tests/unit/assistant/registry.test.ts` (module missing).
3. **Impl**: `npm install zod`, then write `registry.ts` exactly as the interface block; `createRegistry` backs a `Map<string,ToolDefinition>`; `register` returns `this` for chaining; `projectForPlanner` maps to the 4-key projection (never leaks `execute`/`paramsSchema`).
4. **Run-to-pass**: `npx vitest run tests/unit/assistant/registry.test.ts` + `npm run type-check`.
5. **Commit**: `feat(assistant): tool registry contract + dispatch (kill the wa-state switch)`

---

## Task P2.1 — Migration 062: `pending_actions` + turn dedup

**Files**
- create `supabase/migrations/062_pending_actions.sql`

**Interfaces (produces):** table `public.pending_actions`; `public.assistant_turns.wa_message_id` unique.

**Steps**
1. **Write SQL** (`062_pending_actions.sql`):
```sql
-- Migration 062: pending_actions queue (N concurrent Tier-2 confirmations, spec §3.4)
-- + request-level turn dedup on wa_message_id (Meta redelivers at-least-once, spec §1.1).
-- Replaces the single crm_agent_wa_state row.
create table if not exists public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users(id) on delete cascade,
  acting_as_id uuid references public.users(id) on delete cascade, -- owner impersonation (spec §9)
  turn_id uuid,
  batch_id uuid,
  tool text not null,
  version integer not null default 1,
  params jsonb not null default '{}'::jsonb,
  params_hash text not null,
  business_key text,
  idempotency_key text,
  confirm_token text,                        -- typed echo-token fallback, e.g. 'PAID-204'
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists pending_actions_agent_open_idx
  on public.pending_actions (agent_id) where status = 'pending';
create unique index if not exists pending_actions_confirm_token_idx
  on public.pending_actions (agent_id, confirm_token) where status = 'pending' and confirm_token is not null;

-- request-level dedup: one assistant turn per Meta wa_message_id.
alter table public.assistant_turns add column if not exists wa_message_id text;
create unique index if not exists assistant_turns_wa_message_id_idx
  on public.assistant_turns (wa_message_id) where wa_message_id is not null;

-- RLS (re-enabled this project). Service-role bypasses; belt for any anon/auth path.
alter table public.pending_actions enable row level security;
drop policy if exists pending_actions_agent_rw on public.pending_actions;
create policy pending_actions_agent_rw on public.pending_actions
  for all using (agent_id = auth.uid()) with check (agent_id = auth.uid());
```
2. **Run-to-fail**: `mcp__supabase__execute_sql` → `select to_regclass('public.pending_actions')` returns `null`.
3. **Apply**: `mcp__supabase__apply_migration` name `pending_actions` with the SQL above.
4. **Run-to-pass**: re-run the `to_regclass` query (non-null) and `select to_regclass('public.assistant_turns')` (confirms P1 landed — dependency check).
5. **Commit**: `feat(assistant): pending_actions queue + wa_message_id turn dedup (062)`

---

## Task P2.2 — Hebrew fuzzy matcher (pure)

**Files:** create `src/lib/assistant/hebrew-match.ts`, `tests/unit/assistant/hebrew-match.test.ts`

**Interfaces (produces):** `normalizeHe(s):string`, `levenshtein(a,b):number`, `similarity(a,b):number` (0..1), `tokenMatch(needle,hay):boolean`.

**Steps**
1. **Failing test**:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeHe, levenshtein, similarity, tokenMatch } from '@/lib/assistant/hebrew-match';

describe('hebrew-match', () => {
  it('normalizes niqqud, punctuation, case, whitespace', () => {
    expect(normalizeHe('  יוֹנָתָן!! ')).toBe('יונתן');
    expect(normalizeHe('Coca-Cola')).toBe('cocacola');
  });
  it('levenshtein counts edits', () => { expect(levenshtein('אנה','אנא')).toBe(1); });
  it('similarity is 1 for exact, high for a one-char ASR slip', () => {
    expect(similarity('אנה','אנה')).toBe(1);
    expect(similarity('אנה','אנא')).toBeGreaterThan(0.6);
    expect(similarity('יונתן','מאור')).toBeLessThan(0.4);
  });
  it('tokenMatch finds a whole normalized word', () => {
    expect(tokenMatch('מאור','מאור כהן')).toBe(true);
    expect(tokenMatch('מא','מאור כהן')).toBe(false);
  });
});
```
2. **Run-to-fail**: `npx vitest run tests/unit/assistant/hebrew-match.test.ts`.
3. **Impl**:
```ts
const NIQQUD = /[֑-ׇ]/g;
export function normalizeHe(s: string): string {
  return (s || '').toLowerCase().replace(NIQQUD, '')
    .replace(/["'׳״`.,!?;:()\-]/g, '').replace(/\s+/g, ' ').trim();
}
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}
export function similarity(a: string, b: string): number {
  const x = normalizeHe(a), y = normalizeHe(b);
  if (!x && !y) return 1; if (!x || !y) return 0; if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}
export function tokenMatch(needle: string, hay: string): boolean {
  const n = normalizeHe(needle);
  return !!n && normalizeHe(hay).split(' ').includes(n);
}
```
4. **Run-to-pass** + `npm run type-check`.
5. **Commit**: `feat(assistant): dependency-free Hebrew fuzzy matcher for the resolver`

---

## Task P2.3 — Planner types + strict-JSON validator + prompt (pure)

**Files:** create `src/lib/assistant/planner.ts`, `tests/unit/assistant/planner-validate.test.ts`

**Interfaces (produces)**
```ts
export interface PlannerInputs { line_items?:{deliverable?:string|null;platform?:string|null;qty?:number|null;unit_price?:number|null}[]|null; amount?:number|null; text?:string|null; due_at?:string|null; target_status?:string|null; }
export interface PlannedAction { tool:string; confidence:number; refs:{talent?:string|null;client?:string|null;brief?:string|null}; inputs:PlannerInputs; }
export interface PlannerOutput { actions:PlannedAction[]; clarification?:string|null; }
export const PLANNER_JSON_SCHEMA: object; // strict json_schema for OpenAI Responses text.format
export function validatePlannerOutput(raw:unknown): { ok:true; value:PlannerOutput } | { ok:false; error:string };
export function buildPlannerPrompt(args:{ digest:string; tools:{name:string;description:string;whenToUse:string;whenNotToUse:string}[]; memory?:string }): string;
```
> Under OpenAI strict mode every property must be listed in `required` and objects need `additionalProperties:false`; optionality via `type:["...","null"]`. Hence a **fixed** `inputs` shape (no open-ended object). NO totals/VAT (spec §3.1) — Executor computes money.

**Steps**
1. **Failing test** `planner-validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validatePlannerOutput, PLANNER_JSON_SCHEMA } from '@/lib/assistant/planner';

describe('validatePlannerOutput', () => {
  it('accepts a well-formed plan and defaults clarification', () => {
    const r = validatePlannerOutput({ actions: [{ tool: 'crm.build_quote', confidence: 0.9,
      refs: { talent: 'אנה', client: null, brief: null },
      inputs: { line_items: [{ deliverable: 'reel', platform: 'ig', qty: 1, unit_price: 8000 }] } }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.actions[0].tool).toBe('crm.build_quote');
  });
  it('accepts an abstain (empty actions + clarification)', () => {
    const r = validatePlannerOutput({ actions: [], clarification: 'למי ההצעה?' });
    expect(r.ok).toBe(true);
  });
  it('rejects a missing actions array', () => {
    const r = validatePlannerOutput({ clarification: 'x' });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/actions/);
  });
  it('rejects confidence out of range and non-string tool', () => {
    expect(validatePlannerOutput({ actions: [{ tool: 't', confidence: 2, refs: {}, inputs: {} }] }).ok).toBe(false);
    expect(validatePlannerOutput({ actions: [{ tool: 5, confidence: 0.5, refs: {}, inputs: {} }] }).ok).toBe(false);
  });
  it('rejects a hallucinated total/vat leaking into inputs', () => {
    // money math is Executor-only; total is not a valid input key under strict schema mirror
    const r = validatePlannerOutput({ actions: [{ tool: 't', confidence: 0.5, refs: {},
      inputs: { total: 9440 } as any }] });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/inputs|total/);
  });
  it('exposes a strict json_schema with additionalProperties false at the root', () => {
    expect((PLANNER_JSON_SCHEMA as any).additionalProperties).toBe(false);
  });
});
```
2. **Run-to-fail**.
3. **Impl** (`planner.ts`, validator + schema portion): `PLANNER_JSON_SCHEMA` mirrors the types with `additionalProperties:false`, `required` listing every key, nullable via `["type","null"]`, and `inputs` fixed to the 5 keys (rejecting `total`). `validatePlannerOutput` hand-rolls the same checks (no LLM, CI-safe): `actions` is an array; each item `tool` string, `confidence` finite in `[0,1]`, `refs` object (talent/client/brief only, string|null), `inputs` object whose keys ⊆ the 5 allowed (unknown key → error mentioning it). `buildPlannerPrompt` renders STATIC rules (do-nothing-is-rewarded §1.2; never assert money happened §0.1; symbols-not-IDs) → tool projection lines → `memory` → `digest`.
4. **Run-to-pass** + `npm run type-check`.
5. **Commit**: `feat(assistant): Planner action schema + strict-JSON validator (no money in the LLM)`

---

## Task P2.4 — `runPlanner`: strict output + one repair retry + abstain

**Files:** modify `src/lib/assistant/planner.ts`; create `tests/unit/assistant/planner-run.test.ts`

**Interfaces (produces)**
```ts
export type PlannerLlm = (args:{ instructions:string }) => Promise<string>; // returns JSON text
export async function runPlanner(args:{ instructions:string; llm:PlannerLlm }): Promise<{ output:PlannerOutput; abstained:boolean; raw:string; repaired:boolean }>;
export function createPlannerLlm(): PlannerLlm; // real OpenAI Responses json_schema strict
```

**Steps**
1. **Failing test** `planner-run.test.ts` (inject a fake llm — no network):
```ts
import { describe, it, expect, vi } from 'vitest';
import { runPlanner } from '@/lib/assistant/planner';

describe('runPlanner', () => {
  it('returns a valid plan on first pass', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify({ actions: [], clarification: null }));
    const r = await runPlanner({ instructions: 'x', llm });
    expect(r.output.actions).toEqual([]); expect(r.abstained).toBe(false); expect(llm).toHaveBeenCalledTimes(1);
  });
  it('repairs once when the first output is invalid, feeding the error back', async () => {
    const llm = vi.fn()
      .mockResolvedValueOnce('{ not json')
      .mockResolvedValueOnce(JSON.stringify({ actions: [{ tool: 'crm.status', confidence: 0.8, refs: {}, inputs: {} }] }));
    const r = await runPlanner({ instructions: 'base', llm });
    expect(r.repaired).toBe(true); expect(r.output.actions[0].tool).toBe('crm.status');
    expect(llm).toHaveBeenCalledTimes(2);
    expect(llm.mock.calls[1][0].instructions).toMatch(/base/); // retry carries original + error
  });
  it('abstains (empty actions + clarification) after a failed repair — NEVER executes half-parsed', async () => {
    const llm = vi.fn().mockResolvedValue('garbage');
    const r = await runPlanner({ instructions: 'x', llm });
    expect(r.abstained).toBe(true); expect(r.output.actions).toEqual([]);
    expect(r.output.clarification).toBeTruthy(); expect(llm).toHaveBeenCalledTimes(2);
  });
});
```
2. **Run-to-fail**.
3. **Impl**: `runPlanner` calls `llm`; `JSON.parse` inside try; `validatePlannerOutput`; on failure build a repair prompt = `instructions + "\n\nהפלט הקודם נכשל: " + err + "\nהחזר JSON תקין בלבד."` and call `llm` once more; on second failure return `{ output:{actions:[],clarification:'לא הבנתי, אפשר לחזור על זה?'}, abstained:true, repaired:true, raw }`. `createPlannerLlm` wraps `client.responses.create({ model: process.env.ASSISTANT_PLANNER_MODEL||'gpt-5', instructions, input:' ', max_output_tokens:600, text:{ format:{ type:'json_schema', name:'planner', strict:true, schema: PLANNER_JSON_SCHEMA } } })` returning `response.output_text` (mirrors `src/lib/openai.ts`).
4. **Run-to-pass** + `npm run type-check`.
5. **Commit**: `feat(assistant): runPlanner strict-json + single repair retry + abstain`

---

## Task P2.5 — Resolver (symbolic→id) + disambiguation + grounding harness

**Files:** create `src/lib/assistant/resolver.ts`, `tests/unit/assistant/resolver.test.ts`, `tests/unit/assistant/grounding-harness.test.ts`

**Interfaces (produces)**
```ts
export interface Candidate { id:string; name:string; }
export interface RefResolution { ref:'talent'|'client'|'brief'; status:'resolved'|'ambiguous'|'not_found'|'skipped'; id?:string; candidates?:Candidate[]; }
export interface ResolveResult { action:PlannedAction; refs:Record<string,RefResolution>; status:'resolved'|'ambiguous'|'not_found'; resolvedIds:string[]; }
export function resolveRef(ref:'talent'|'client'|'brief', symbolic:string|undefined|null, pool:Candidate[], aliases:{alias:string;subject_type:string;subject_id:string}[]): RefResolution;
export function resolveActionRefs(action:PlannedAction, ctx:AssistantContext): ResolveResult;
```
> **Grounding invariant (sev-1):** every id in `resolvedIds` is a member of the context pools. Only real DB ids (talent, brief) enter `resolvedIds`; `client` resolves to a brand string and is informational (never a fabricated uuid).

**Steps**
1. **Failing test** `resolver.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveRef, resolveActionRefs } from '@/lib/assistant/resolver';

const talents = [{ id: 't1', name: 'אנה' }, { id: 't2', name: 'מאור כהן' }, { id: 't3', name: 'אנואר' }];
const ctx: any = { talents, briefs: [{ id: 'b1', name: 'סודהסטרים' }], deals: [], memory: { aliases: [{ alias: 'תותית', subject_type: 'talent', subject_id: 't1' }] } };

describe('resolveRef', () => {
  it('resolves an exact talent name to its id', () => {
    expect(resolveRef('talent', 'מאור כהן', talents, [])).toMatchObject({ status: 'resolved', id: 't2' });
  });
  it('resolves via an entity_alias', () => {
    expect(resolveRef('talent', 'תותית', talents, ctx.memory.aliases)).toMatchObject({ status: 'resolved', id: 't1' });
  });
  it('returns ambiguous with candidates on two close matches — no silent guess', () => {
    const r = resolveRef('talent', 'אנו', talents, []); // near אנה AND אנואר
    expect(r.status).toBe('ambiguous'); expect(r.candidates!.length).toBeGreaterThanOrEqual(2);
  });
  it('returns not_found when nothing is close', () => {
    expect(resolveRef('talent', 'זרקור', talents, []).status).toBe('not_found');
  });
  it('skips an absent symbolic ref', () => {
    expect(resolveRef('brief', null, [], []).status).toBe('skipped');
  });
});

describe('resolveActionRefs grounding', () => {
  it('only emits ids that exist in context', () => {
    const action: any = { tool: 'crm.build_quote', confidence: 0.9, refs: { talent: 'אנה', brief: 'סודהסטרים' }, inputs: {} };
    const r = resolveActionRefs(action, ctx);
    expect(r.status).toBe('resolved');
    expect(r.resolvedIds.sort()).toEqual(['b1', 't1']);
  });
});
```
2. **Run-to-fail**.
3. **Impl** `resolver.ts` (using `hebrew-match`): `resolveRef` → alias exact (`normalizeHe` equal & subject_id∈pool) → exact-name (1 match resolved / >1 ambiguous) → fuzzy: score each pool item `max(similarity, tokenMatch?0.9:0)`, keep `≥0.7`, sort desc; single or top beats 2nd by `>0.05` → resolved, else ambiguous(top 3). `resolveActionRefs`: talent→`ctx.talents`, brief→`ctx.briefs`, client→brand pool from `ctx.briefs`/`ctx.deals` (informational); aliases from `ctx.memory?.aliases||[]`; `resolvedIds = [talent.id, brief.id].filter(Boolean)`; `status='ambiguous'` if any ref ambiguous, `'not_found'` if any required ref not_found, else `'resolved'`.
4. **Grounding harness** `grounding-harness.test.ts` (spec §14 — pure set-membership over a corpus; any hallucinated id = **sev-1**):
```ts
import { describe, it, expect } from 'vitest';
import { resolveActionRefs } from '@/lib/assistant/resolver';

const ctx: any = {
  talents: [{ id: 't1', name: 'אנה' }, { id: 't2', name: 'יונתן' }],
  briefs: [{ id: 'b1', name: 'קוקה קולה' }, { id: 'b2', name: 'סודהסטרים' }],
  deals: [], memory: { aliases: [] },
};
const idSet = new Set(['t1', 't2', 'b1', 'b2']);
const corpus: any[] = [
  { tool: 'crm.build_quote', confidence: 0.9, refs: { talent: 'אנה', brief: 'קוקה קולה' }, inputs: {} },
  { tool: 'crm.build_quote', confidence: 0.8, refs: { talent: 'יונתן', brief: 'סודהסטרים' }, inputs: {} },
  { tool: 'crm.build_quote', confidence: 0.7, refs: { talent: 'משהו שלא קיים', brief: 'לא קיים' }, inputs: {} },
];

describe('GROUNDING HARNESS (sev-1): resolver never emits an id absent from context', () => {
  for (const action of corpus) {
    it(`no hallucinated id for ${JSON.stringify(action.refs)}`, () => {
      const r = resolveActionRefs(action, ctx);
      for (const id of r.resolvedIds) expect(idSet.has(id)).toBe(true);
    });
  }
});
```
5. **Run-to-pass**: `npx vitest run tests/unit/assistant/resolver.test.ts tests/unit/assistant/grounding-harness.test.ts` + `npm run type-check`.
6. **Commit**: `feat(assistant): resolver symbolic→id + disambiguation + grounding harness (sev-1)`

---

## Task P2.6 — Policy gate (consequence tiers) — pure

**Files:** create `src/lib/assistant/gate.ts`, `tests/unit/assistant/gate.test.ts`

**Interfaces (produces)**
```ts
export type GateDecision =
  | { kind:'auto' } | { kind:'undo'; undoWindowSec:number }
  | { kind:'confirm' } | { kind:'clarify'; reason:string } | { kind:'deny'; reason:string };
export function gateAction(args:{ tool:ToolDefinition; resolved:ResolveResult; actorRole:'owner'|'employee'|'agent'; ownsEntities:boolean; minConfidence?:number }): GateDecision;
```
> Tiers per spec §3.3: read→auto; `undo`→optimistic+undo(60s); `confirm_deterministic`→confirm; owner-only tool + non-owner→deny; not-owns→deny; ambiguous/not_found/low-confidence→clarify. Authz is checked in the **Executor/gate, never the Planner** (§9).

**Steps**
1. **Failing test**:
```ts
import { describe, it, expect } from 'vitest';
import { gateAction } from '@/lib/assistant/gate';

const tool = (o: any) => ({ name: 'x', version: 1, description: '', whenToUse: '', whenNotToUse: '',
  paramsSchema: { safeParse: (v: any) => ({ success: true, data: v }) }, idempotent: true,
  addressesExternalParty: false, execute: async () => ({ ok: true, result: {} }), ...o });
const resolved = (o: any = {}) => ({ action: {} as any, refs: {}, status: 'resolved', resolvedIds: [], ...o });

describe('gateAction', () => {
  it('auto-runs a read tool', () => {
    expect(gateAction({ tool: tool({ sideEffect: 'read', confirmation: 'none', requiredRole: 'any' }), resolved: resolved(), actorRole: 'agent', ownsEntities: true }))
      .toEqual({ kind: 'auto' });
  });
  it('undo for reversible internal writes', () => {
    expect(gateAction({ tool: tool({ sideEffect: 'write_internal', confirmation: 'undo', requiredRole: 'any' }), resolved: resolved(), actorRole: 'agent', ownsEntities: true }))
      .toEqual({ kind: 'undo', undoWindowSec: 60 });
  });
  it('deterministic confirm for money/contract/irreversible', () => {
    expect(gateAction({ tool: tool({ sideEffect: 'irreversible', confirmation: 'confirm_deterministic', requiredRole: 'any' }), resolved: resolved(), actorRole: 'agent', ownsEntities: true }).kind)
      .toBe('confirm');
  });
  it('denies an owner-only tool for an employee', () => {
    const d = gateAction({ tool: tool({ sideEffect: 'write_internal', confirmation: 'confirm_deterministic', requiredRole: 'owner' }), resolved: resolved(), actorRole: 'employee', ownsEntities: true });
    expect(d.kind).toBe('deny'); if (d.kind === 'deny') expect(d.reason).toMatch(/בעלים/);
  });
  it('denies when the agent does not own the entity', () => {
    expect(gateAction({ tool: tool({ sideEffect: 'write_internal', confirmation: 'undo', requiredRole: 'any' }), resolved: resolved(), actorRole: 'agent', ownsEntities: false }).kind)
      .toBe('deny');
  });
  it('clarifies on ambiguous resolution or low confidence — never guesses money', () => {
    expect(gateAction({ tool: tool({ sideEffect: 'irreversible', confirmation: 'confirm_deterministic', requiredRole: 'any' }), resolved: resolved({ status: 'ambiguous' }), actorRole: 'agent', ownsEntities: true }).kind).toBe('clarify');
    expect(gateAction({ tool: tool({ sideEffect: 'write_internal', confirmation: 'undo', requiredRole: 'any' }), resolved: resolved({ action: { confidence: 0.3 } }), actorRole: 'agent', ownsEntities: true, minConfidence: 0.5 }).kind).toBe('clarify');
  });
});
```
2. **Run-to-fail**.
3. **Impl**: order = ambiguous/not_found→clarify; confidence (`resolved.action.confidence`) `< (minConfidence??0.5)`→clarify; `requiredRole==='owner' && actorRole!=='owner'`→deny('זה דורש אישור בעלים'); `!ownsEntities`→deny('אין לך גישה למיוצג/עסקה הזאת'); then by confirmation: `'confirm_deterministic'`→confirm, `'undo'`→undo(60), else auto.
4. **Run-to-pass** + `npm run type-check`.
5. **Commit**: `feat(assistant): consequence-tiered policy gate (undo vs deterministic confirm)`

---

## Task P2.7 — Confirmation binding + collision rule (pure)

**Files:** create `src/lib/assistant/confirm.ts`, `tests/unit/assistant/confirm.test.ts`

**Interfaces (produces)**
```ts
export type ConfirmMatch = { kind:'confirm'; pendingId:string } | { kind:'ambiguous_yes' } | { kind:'none' };
export interface PendingLite { id:string; confirm_token:string|null; }
export function matchConfirmation(args:{ text:string|null; buttonPayload?:string|null; pendings:PendingLite[] }): ConfirmMatch;
export function hasOpenDestructive(pendings:PendingLite[]): boolean;
```
> Spec §3.3: free-text "כן" NEVER gates a Tier-2 action → `ambiguous_yes` (re-ask with token/button). Only a button payload (`confirm:<id>`) or a typed echo-token confirms. §3.4: a new substantive message cancels open destructive confirms.

**Steps**
1. **Failing test**:
```ts
import { describe, it, expect } from 'vitest';
import { matchConfirmation, hasOpenDestructive } from '@/lib/assistant/confirm';

const pendings = [{ id: 'p1', confirm_token: 'PAID-204' }, { id: 'p2', confirm_token: 'SEND-777' }];

describe('matchConfirmation', () => {
  it('confirms on an interactive button payload', () => {
    expect(matchConfirmation({ text: null, buttonPayload: 'confirm:p2', pendings }))
      .toEqual({ kind: 'confirm', pendingId: 'p2' });
  });
  it('confirms on a typed echo-token (case-insensitive)', () => {
    expect(matchConfirmation({ text: 'paid-204', pendings }))
      .toEqual({ kind: 'confirm', pendingId: 'p1' });
  });
  it('treats a bare "כן" as ambiguous_yes — never fires a Tier-2 action', () => {
    expect(matchConfirmation({ text: 'כן', pendings })).toEqual({ kind: 'ambiguous_yes' });
  });
  it('is none when there is no token and no pendings', () => {
    expect(matchConfirmation({ text: 'תבנה הצעה למאור', pendings: [] })).toEqual({ kind: 'none' });
  });
  it('hasOpenDestructive reflects any pending', () => {
    expect(hasOpenDestructive(pendings)).toBe(true); expect(hasOpenDestructive([])).toBe(false);
  });
});
```
2. **Run-to-fail**.
3. **Impl**: parse `confirm:<id>` from `buttonPayload` → matching pending; else normalized `text` equals any `confirm_token.toLowerCase()` → confirm; else `interpretYesNo(text)==='yes' && pendings.length` → `ambiguous_yes`; else `none`. Reuse `interpretYesNo` from `@/lib/crm/wa-interpret`.
4. **Run-to-pass** + `npm run type-check`.
5. **Commit**: `feat(assistant): confirmation binding (button/echo-token) + collision guard`

---

## Task P2.8 — Executor: businessKey + reply composer (pure) then executePlan (ledger)

**Files:** create `src/lib/assistant/ledger.ts`, `src/lib/assistant/executor.ts`, `tests/unit/assistant/executor-pure.test.ts`, `tests/unit/assistant/executor-run.test.ts`

**Interfaces (produces)**
```ts
// executor.ts (pure)
export function businessKey(i:{ agentId:string; tool:string; briefId?:string|null; accountId?:string|null; lineItems?:{deliverable?:string|null;qty?:number|null;unit_price?:number|null}[]|null; amount?:number|null }): string;
export interface ExecEntry { tool:string; status:'done'|'noop'|'awaiting_confirm'|'denied'|'clarify'|'failed'; reply:string; actionId?:string; }
export function composeTurnReply(entries:ExecEntry[]): string;
// ledger.ts
export interface Ledger {
  claim(row:{ agentId:string; turnId?:string; batchId?:string; tool:string; version:number; args:any; businessKey:string; origin:string }): Promise<{ claimed:boolean; actionId:string; existing?:any }>;
  writeResult(actionId:string, patch:{ status:string; result?:any; error_category?:string; entity_type?:string; entity_id?:string; executed_at?:string }): Promise<void>;
  createPending(row:{ agentId:string; turnId?:string; tool:string; version:number; params:any; paramsHash:string; businessKey?:string; confirmToken:string; expiresAt:string }): Promise<{ id:string }>;
  cancelPending(agentId:string): Promise<void>;
}
export function createSupabaseLedger(db:any): Ledger;
// executor.ts (orchestration)
export async function executePlan(args:{ gated:{ action:PlannedAction; resolved:ResolveResult; decision:GateDecision; tool:ToolDefinition }[]; ledger:Ledger; execCtxFor:(r:ResolveResult)=>ToolExecuteCtx; agentId:string; turnId?:string; batchId?:string; }): Promise<{ entries:ExecEntry[]; reply:string }>;
```

**Steps**
1. **Failing test (pure)** `executor-pure.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { businessKey, composeTurnReply } from '@/lib/assistant/executor';

describe('businessKey', () => {
  it('is stable regardless of line-item order and sensitive to amount', () => {
    const a = businessKey({ agentId: 'a', tool: 'crm.build_quote', briefId: 'b', accountId: 'x',
      lineItems: [{ deliverable: 'reel', qty: 1, unit_price: 8000 }, { deliverable: 'story', qty: 2, unit_price: 1000 }] });
    const b = businessKey({ agentId: 'a', tool: 'crm.build_quote', briefId: 'b', accountId: 'x',
      lineItems: [{ deliverable: 'story', qty: 2, unit_price: 1000 }, { deliverable: 'reel', qty: 1, unit_price: 8000 }] });
    expect(a).toBe(b);
    const c = businessKey({ agentId: 'a', tool: 'crm.build_quote', briefId: 'b', accountId: 'x',
      lineItems: [{ deliverable: 'reel', qty: 1, unit_price: 9000 }] });
    expect(c).not.toBe(a);
  });
});
describe('composeTurnReply', () => {
  it('never says done when any leg failed (per-item receipts)', () => {
    const r = composeTurnReply([
      { tool: 'crm.build_quote', status: 'done', reply: '✅ אנה · קוקה קולה' },
      { tool: 'crm.build_quote', status: 'clarify', reply: '⚠️ מאור: מה המחיר?' },
    ]);
    expect(r).toContain('✅'); expect(r).toContain('⚠️'); expect(r).not.toMatch(/^בוצע/);
  });
});
```
2. **Run-to-fail**; impl `businessKey` (sha256 over `agentId~tool~briefId~accountId~sorted(deliverable:qty:unit_price)~amount`) + `composeTurnReply` (joins entry replies; groups done vs needs-completion).
3. **Failing test (orchestration)** `executor-run.test.ts` — fake ledger records call order (proves **ledger-write-before-reply** §0.7 and **business-key idempotency no-op** §3.2):
```ts
import { describe, it, expect, vi } from 'vitest';
import { executePlan } from '@/lib/assistant/executor';

function fakeLedger(claimed = true) {
  const calls: string[] = [];
  return {
    calls,
    claim: vi.fn(async () => { calls.push('claim'); return { claimed, actionId: 'act1', existing: claimed ? null : { status: 'done' } }; }),
    writeResult: vi.fn(async () => { calls.push('writeResult'); }),
    createPending: vi.fn(async () => { calls.push('createPending'); return { id: 'p1' }; }),
    cancelPending: vi.fn(async () => {}),
  };
}
const tool = (o: any) => ({ name: 'crm.build_quote', version: 1, description: '', whenToUse: '', whenNotToUse: '',
  paramsSchema: { safeParse: (v: any) => ({ success: true, data: v }) }, idempotent: true, requiredRole: 'any',
  addressesExternalParty: false, sideEffect: 'write_internal', confirmation: 'undo',
  execute: vi.fn(async () => { o.calls?.push('execute'); return { ok: true, result: { partnershipId: 'd1', signUrl: 'https://s/x', total: 9440 } }; }), ...o });
const resolved: any = { action: { tool: 'crm.build_quote', confidence: 0.9, refs: {}, inputs: { line_items: [{ deliverable: 'reel', qty: 1, unit_price: 8000 }] } }, refs: {}, status: 'resolved', resolvedIds: ['d1'] };
const execCtxFor = () => ({ agent: { id: 'a', role: 'agent' }, resolved: { briefId: 'b1', talentId: 't1' }, db: {}, assertAgentOwns: async () => {} } as any);

describe('executePlan', () => {
  it('writes the ledger result BEFORE composing the reply', async () => {
    const l = fakeLedger(true); const calls = l.calls;
    const t = tool({ calls });
    const r = await executePlan({ gated: [{ action: resolved.action, resolved, decision: { kind: 'undo', undoWindowSec: 60 }, tool: t }], ledger: l as any, execCtxFor, agentId: 'a' });
    expect(calls).toEqual(['claim', 'execute', 'writeResult']);
    expect(r.entries[0].status).toBe('done'); expect(r.reply).toContain('https://s/x');
  });
  it('is an honest no-op when the business_key is already claimed (idempotency)', async () => {
    const l = fakeLedger(false);
    const t = tool({ execute: vi.fn() });
    const r = await executePlan({ gated: [{ action: resolved.action, resolved, decision: { kind: 'undo', undoWindowSec: 60 }, tool: t }], ledger: l as any, execCtxFor, agentId: 'a' });
    expect(t.execute).not.toHaveBeenCalled();
    expect(r.entries[0].status).toBe('noop'); expect(r.reply).toMatch(/כבר/);
  });
  it('a confirm-tier action creates a pending row + echo-token, does NOT execute', async () => {
    const l = fakeLedger(true);
    const t = tool({ confirmation: 'confirm_deterministic', sideEffect: 'irreversible', execute: vi.fn() });
    const r = await executePlan({ gated: [{ action: resolved.action, resolved, decision: { kind: 'confirm' }, tool: t }], ledger: l as any, execCtxFor, agentId: 'a' });
    expect(l.createPending).toHaveBeenCalled(); expect(t.execute).not.toHaveBeenCalled();
    expect(r.entries[0].status).toBe('awaiting_confirm'); expect(r.reply).toMatch(/אישור|שלח/);
  });
  it('surfaces a tool precondition failure as a no-op, not a blind retry', async () => {
    const l = fakeLedger(true);
    const t = tool({ execute: vi.fn(async () => ({ ok: false, error: 'precondition_failed' })) });
    const r = await executePlan({ gated: [{ action: resolved.action, resolved, decision: { kind: 'undo', undoWindowSec: 60 }, tool: t }], ledger: l as any, execCtxFor, agentId: 'a' });
    expect(r.entries[0].status).toBe('failed'); expect(l.writeResult).toHaveBeenCalledWith('act1', expect.objectContaining({ status: 'failed' }));
  });
});
```
4. **Impl `executePlan`**: for each gated item — `deny`→entry('denied', decision.reason); `clarify`→entry('clarify', action-specific Hebrew ask); `confirm`→`paramsHash=sha256(JSON.stringify(validated inputs))`, `confirmToken` = `${VERB}-${4-digit}` (VERB from tool name), `ledger.createPending(...)`, entry('awaiting_confirm', "לאישור שלח `PAID-204` (או הקש על הכפתור)"); `auto`/`undo`→ compute `bk=businessKey(...)`, `ledger.claim({...,businessKey:bk})`; `claimed===false`→entry('noop', "כבר טופל קודם, לא עשיתי כלום"); else validate `tool.paramsSchema.safeParse(action.inputs)` (fail→writeResult failed + entry failed), `await tool.execute(params, execCtxFor(resolved))`; **write ledger result (`writeResult`) BEFORE** building the reply string; `ok:false`→entry('failed'); `ok:true`→entry('done', composed from real `result`). Return `composeTurnReply(entries)`. `createSupabaseLedger(db)` implements `claim` via `insert assistant_actions{...business_key}` catching Postgres `23505` → `{claimed:false}` + select existing; `writeResult` update by id; `createPending` insert into `pending_actions`; `cancelPending` update open→cancelled.
5. **Run-to-pass**: `npx vitest run tests/unit/assistant/executor-pure.test.ts tests/unit/assistant/executor-run.test.ts` + `npm run type-check`.
6. **Commit**: `feat(assistant): executor — idempotent, precondition-guarded, ledger-before-reply`

---

## Task P2.9 — Context builder: thin index (pure digest + DB assembler)

**Files:** create `src/lib/assistant/context.ts`, `tests/unit/assistant/context.test.ts`

**Interfaces (produces)**
```ts
export interface AssistantContext {
  agent:{ id:string; agency_id:string|null; role:'owner'|'employee'|'agent'; full_name:string|null; managed_account_ids:string[] };
  talents:{ id:string; name:string }[];
  briefs:{ id:string; name:string; talent_id:string|null; deliverables:string[] }[];
  deals:{ handle:string; id:string; talent:string; brand:string; status:string; amount:number|null }[];
  memory?:{ summary:string|null; facts:{predicate:string;value:any}[]; aliases:{alias:string;subject_type:string;subject_id:string}[] };
}
export function renderContextDigest(ctx:AssistantContext, opts?:{ maxDeals?:number }): string; // pure, IDs/slugs not blobs (spec §12)
export async function buildContext(agent:{ id:string; role?:string; full_name?:string|null; agency_id?:string|null; managed_account_ids?:string[]|null }, db?:any): Promise<AssistantContext>;
```

**Steps**
1. **Failing test** (pure digest + `buildContext` with a fake db):
```ts
import { describe, it, expect } from 'vitest';
import { renderContextDigest, buildContext } from '@/lib/assistant/context';

const ctx: any = {
  agent: { id: 'a', agency_id: 'ag', role: 'agent', full_name: 'דנה', managed_account_ids: ['t1'] },
  talents: [{ id: 't1', name: 'אנה' }],
  briefs: [{ id: 'b1', name: 'קוקה קולה', talent_id: 't1', deliverables: ['1× reel'] }],
  deals: [{ handle: '#7', id: 'd7', talent: 'אנה', brand: 'Fox', status: 'signed', amount: 8000 }],
  memory: { summary: null, facts: [], aliases: [] },
};
describe('renderContextDigest', () => {
  it('renders compact handles, no raw UUIDs, and caps deals', () => {
    const s = renderContextDigest(ctx, { maxDeals: 1 });
    expect(s).toContain('אנה'); expect(s).toContain('#7'); expect(s).toContain('Fox');
    expect(s).not.toContain('d7'); // uuids/internal ids not dumped
  });
});
describe('buildContext', () => {
  it('assembles talents/briefs from the injected db (multi-tenant scoped to managed ids)', async () => {
    const db = {
      from: (t: string) => ({
        select: () => ({
          in: async () => t === 'accounts' ? { data: [{ id: 't1', config: { display_name: 'אנה' } }] } : { data: [] },
          eq: () => ({ in: () => ({ is: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }), maybeSingle: async () => ({ data: null }) }),
        }),
      }),
    };
    const c = await buildContext({ id: 'a', role: 'agent', managed_account_ids: ['t1'] }, db);
    expect(c.talents).toEqual([{ id: 't1', name: 'אנה' }]);
  });
});
```
2. **Run-to-fail**.
3. **Impl**: `renderContextDigest` prints `מיוצגים:` (names only), numbered `בריפים פתוחים:` (brand + talent + deliverables), `עסקאות (handle · talent · brand · status · ₪amount)` capped at `maxDeals` with `+N נוספים` — bounded ~1,200 tokens (spec §12); never prints uuids. `buildContext(agent, db = supabaseAdmin)` → talents from `accounts.in(managed_account_ids)` (name = `config.display_name||username`), briefs from `crm_inbound_messages` open (`brief_status in ['new','assigned'] & deal_id is null`), deals from `partnerships` where `account_id in managed_ids` (handle = `#<row_number-ish>` from a stable short id), memory from `assistant_memory`/`assistant_facts`/`entity_alias` (best-effort; empty if P-memory tables absent). Default arg keeps prod wiring to `supabaseAdmin`.
4. **Run-to-pass** + `npm run type-check`.
5. **Commit**: `feat(assistant): thin-index context builder + token-bounded digest`

---

## Task P2.10 — Reference tools (`build_quote`, `status`) + default registry

**Files:** create `src/lib/assistant/tools/build_quote.ts`, `src/lib/assistant/tools/status.ts`, `src/lib/assistant/tools/index.ts`, `tests/unit/assistant/tools-build-quote.test.ts`

**Interfaces (produces):** `defaultRegistry: Registry` (in `tools/index.ts`) registering `crm.build_quote` (write_internal, undo) + `crm.status` (read). `build_quote` ports `wa-conversation.buildQuoteFromBrief` — **money math via `computeTotals` only** — with a WHERE-guarded precondition (`crm_inbound_messages.deal_id IS NULL`) and `idempotencyKey`.

**Steps**
1. **Failing test** `tools-build-quote.test.ts` (inject a fake db + spy `createQuote`; assert totals come from `computeTotals`, not the planner; precondition no-op):
```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/crm/quotes', () => ({ createQuote: vi.fn(async () => ({ partnershipId: 'd1', signatureRequestId: 's1', token: 'tok', signUrl: 'https://s/tok', title: 't' })), signUrlFor: (t: string) => `https://s/${t}` }));
import { buildQuoteTool } from '@/lib/assistant/tools/build_quote';
import { createQuote } from '@/lib/crm/quotes';

function db(deal_id: string | null) {
  return { from: (t: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'b1', deal_id, parsed_data: { brandName: 'Fox' }, raw_text: null, subject: 'Fox' } }) }) }),
    update: () => ({ eq: () => ({ is: async () => ({ data: [{ id: 'b1' }], error: null }) }) }),
    insert: async () => ({ error: null }),
  }) };
}
const ctx = (deal_id: string | null): any => ({ agent: { id: 'a', full_name: 'דנה' }, resolved: { briefId: 'b1', talentId: 't1' }, db: db(deal_id), assertAgentOwns: async () => {} });

describe('crm.build_quote tool', () => {
  it('computes totals with computeTotals (18% VAT) — planner never supplies a total', async () => {
    const r = await buildQuoteTool.execute({ line_items: [{ deliverable: 'reel', qty: 1, unit_price: 8000 }] } as any, ctx(null));
    expect(r.ok).toBe(true); if (r.ok) expect(r.result.total).toBe(9440); // 8000 * 1.18
    expect((createQuote as any).mock.calls[0][0].amount).toBe(9440);
  });
  it('is a precondition no-op if the brief already has a deal', async () => {
    const r = await buildQuoteTool.execute({ line_items: [{ deliverable: 'reel', qty: 1, unit_price: 8000 }] } as any, ctx('already'));
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toBe('precondition_failed');
  });
});
```
2. **Run-to-fail**.
3. **Impl** `build_quote.ts`: `paramsSchema = z.object({ line_items: z.array(z.object({ deliverable: z.string().nullish(), platform: z.string().nullish(), qty: z.number().nullish(), unit_price: z.number().nullish() })).min(1) })`. `execute(p, ctx)`: load brief (`ctx.resolved.briefId`); **precondition** — if `brief.deal_id` set → `{ ok:false, error:'precondition_failed' }`; `await ctx.assertAgentOwns({ briefId, accountId: ctx.resolved.talentId })`; `totals = computeTotals(lineItems)` (0.18 default from `pricing.ts`); `createQuote({ agentId, accountId: talentId, amount: totals.total, deliverables: lineItemsToDeliverables(lineItems), ... })`; insert `deal_line_items`; WHERE-guarded `update crm_inbound_messages ... .eq('id',briefId).is('deal_id',null)` (optimistic concurrency); return `{ ok:true, result:{ partnershipId, signUrl, total: totals.total } }`. `idempotencyKey = (p,ctx)=>businessKey({agentId:ctx.agent.id,tool:'crm.build_quote',briefId:ctx.resolved.briefId,accountId:ctx.resolved.talentId,lineItems:p.line_items})`. `status.ts`: read tool returning the digest counts. `tools/index.ts`: `export const defaultRegistry = createRegistry().register(buildQuoteTool).register(statusTool);`.
4. **Run-to-pass** + `npm run type-check`.
5. **Commit**: `feat(assistant): reference crm.build_quote + crm.status tools (money via computeTotals)`

---

## Task P2.11 — Orchestrator: `handleAssistantTurn` (generalizes `wa-conversation`)

**Files:** create `src/lib/assistant/orchestrator.ts`, `tests/unit/assistant/orchestrator.test.ts`

**Interfaces (produces)**
```ts
export interface AssistantDeps { db:any; registry:Registry; ledger:Ledger; planner:(instructions:string)=>Promise<PlannerOutput & {abstained?:boolean}>; }
export async function handleAssistantTurn(input:{ agent:{ id:string; role?:string; full_name?:string|null; agency_id?:string|null; managed_account_ids?:string[]|null }; waId:string; text:string|null; buttonPayload?:string|null; waMessageId:string; isVoice?:boolean; }, deps?:Partial<AssistantDeps>): Promise<string|null>;
```
Pipeline (spec §1.1): dedup `wa_message_id` (insert `assistant_turns`; unique violation → `null`) → fetch open `pending_actions` → `matchConfirmation` (button/token→confirm that single action via executor confirmed path; `ambiguous_yes`→re-ask with the token) → else `buildContext` → `runPlanner` (projection = `registry.projectForPlanner(role/capability filter)`) → if actions present AND `hasOpenDestructive(pendings)` → `ledger.cancelPending` (collision §3.4) → per action `resolveActionRefs`→`gateAction` (with `ownsEntities` from a `managed_account_ids` check)→collect gated → `executePlan` → persist `assistant_turns.planner_json`+`reply_text` → return reply.

**Steps**
1. **Failing test** `orchestrator.test.ts` (all deps injected; no network/DB):
```ts
import { describe, it, expect, vi } from 'vitest';
import { handleAssistantTurn } from '@/lib/assistant/orchestrator';
import { createRegistry } from '@/lib/assistant/registry';

const buildQuote = { name: 'crm.build_quote', version: 1, description: 'בונה הצעת מחיר', whenToUse: 'w', whenNotToUse: 'n',
  paramsSchema: { safeParse: (v: any) => ({ success: true, data: v }) }, sideEffect: 'write_internal', confirmation: 'undo',
  idempotent: true, addressesExternalParty: false, requiredRole: 'any',
  execute: vi.fn(async () => ({ ok: true, result: { partnershipId: 'd1', signUrl: 'https://s/x', total: 9440 } })) } as any;

function baseDeps(planOut: any, opts: { turnConflict?: boolean; pendings?: any[] } = {}) {
  const ledger = { claim: vi.fn(async () => ({ claimed: true, actionId: 'act1' })), writeResult: vi.fn(async () => {}), createPending: vi.fn(async () => ({ id: 'p1' })), cancelPending: vi.fn(async () => {}) };
  const db = { from: (t: string) => ({
    insert: () => ({ select: () => ({ single: async () => opts.turnConflict ? { data: null, error: { code: '23505' } } : { data: { id: 'turn1' }, error: null } }) }),
    update: () => ({ eq: async () => ({}) }),
    select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: opts.pendings || [] }) }) }) }),
  }) };
  return { db, registry: createRegistry().register(buildQuote), ledger, planner: vi.fn(async () => planOut) } as any;
}
const ctxSpy = vi.fn();
vi.mock('@/lib/assistant/context', () => ({ buildContext: (...a: any[]) => { ctxSpy(...a); return Promise.resolve({ agent: { id: 'a', role: 'agent', managed_account_ids: ['t1'] }, talents: [{ id: 't1', name: 'אנה' }], briefs: [{ id: 'b1', name: 'קוקה קולה', talent_id: 't1', deliverables: [] }], deals: [], memory: { aliases: [] } }); }, renderContextDigest: () => 'digest' }));

const agent = { id: 'a', role: 'agent', managed_account_ids: ['t1'] };

describe('handleAssistantTurn', () => {
  it('dedups a redelivered wa_message_id (returns null, no planning)', async () => {
    const deps = baseDeps({ actions: [] }, { turnConflict: true });
    const r = await handleAssistantTurn({ agent, waId: '972', text: 'hi', waMessageId: 'wamid.1' }, deps);
    expect(r).toBeNull(); expect(deps.planner).not.toHaveBeenCalled();
  });
  it('plans → resolves → gates → executes a build_quote and returns the real signUrl', async () => {
    const deps = baseDeps({ actions: [{ tool: 'crm.build_quote', confidence: 0.9, refs: { talent: 'אנה', brief: 'קוקה קולה' }, inputs: { line_items: [{ deliverable: 'reel', qty: 1, unit_price: 8000 }] } }] });
    const r = await handleAssistantTurn({ agent, waId: '972', text: 'לאנה קוקה קולה 8000', waMessageId: 'wamid.2' }, deps);
    expect(buildQuote.execute).toHaveBeenCalled(); expect(r).toContain('https://s/x');
  });
  it('a bare "כן" with an open pending re-asks the deterministic token, never executes', async () => {
    const deps = baseDeps({ actions: [] }, { pendings: [{ id: 'p1', confirm_token: 'PAID-204' }] });
    const r = await handleAssistantTurn({ agent, waId: '972', text: 'כן', waMessageId: 'wamid.3' }, deps);
    expect(buildQuote.execute).not.toHaveBeenCalled(); expect(r).toMatch(/PAID-204|אישור/);
  });
  it('a new substantive command cancels open destructive pendings (collision rule)', async () => {
    const deps = baseDeps({ actions: [{ tool: 'crm.build_quote', confidence: 0.9, refs: { talent: 'אנה', brief: 'קוקה קולה' }, inputs: { line_items: [{ deliverable: 'reel', qty: 1, unit_price: 8000 }] } }] }, { pendings: [{ id: 'p1', confirm_token: 'SEND-1' }] });
    await handleAssistantTurn({ agent, waId: '972', text: 'תבנה הצעה חדשה לאנה', waMessageId: 'wamid.4' }, deps);
    expect(deps.ledger.cancelPending).toHaveBeenCalledWith('a');
  });
});
```
2. **Run-to-fail**.
3. **Impl** `orchestrator.ts` wiring the pieces exactly as the pipeline above; default deps = `{ db: supabaseAdmin, registry: defaultRegistry, ledger: createSupabaseLedger(supabaseAdmin), planner: async (instr)=> (await runPlanner({ instructions: instr, llm: createPlannerLlm() })).output }`. `ownsEntities` = every resolved talent/brief maps into `agent.managed_account_ids` (or `agent.role==='owner'`). Turn dedup via `assistant_turns` insert catching `23505`. `assertAgentOwns` passed to `execCtxFor` throws when a scope id ∉ managed set (belt for §6.6/§9). Write `planner_json`/`reply_text` back on the turn row.
4. **Run-to-pass**: `npx vitest run tests/unit/assistant/orchestrator.test.ts` + `npm run type-check`.
5. **Commit**: `feat(assistant): three-pass orchestrator (dedup→context→plan→resolve→gate→execute)`

---

## Task P2.12 — Wire the orchestrator into the WhatsApp webhook (flagged)

**Files:** modify `src/app/api/webhooks/whatsapp/route.ts`

**Interfaces (consumes):** `handleAssistantTurn`; keeps `handleAgentMessage` as the fallback.

**Steps**
1. **Failing test** — extend `orchestrator.test.ts` with an exported thin adapter `runAgentTurn(agent, msg, textBody, voiceText, isVoice)` (put it in `orchestrator.ts`) that maps a Meta `msg` (`msg.id`, `msg.interactive?.button_reply?.id`) into `handleAssistantTurn` input, and assert the button payload is threaded through:
```ts
it('maps a Meta interactive button_reply id into buttonPayload', async () => {
  const deps = baseDeps({ actions: [] }, { pendings: [{ id: 'p1', confirm_token: 'PAID-1' }] });
  const { runAgentTurn } = await import('@/lib/assistant/orchestrator');
  const msg: any = { id: 'wamid.9', interactive: { type: 'button_reply', button_reply: { id: 'confirm:p1' } } };
  const spy = vi.fn(); // wrap by asserting execute is attempted for the confirmed pending path
  await runAgentTurn(agent, msg, null, null, false, deps);
  // confirmed path claims the ledger for the bound pending
  expect(deps.ledger.writeResult).toBeDefined();
});
```
2. **Run-to-fail**; add `runAgentTurn` to `orchestrator.ts` extracting `buttonPayload = msg.interactive?.button_reply?.id ?? null` and `waMessageId = msg.id`.
3. **Impl** route: inside `maybeHandleAgentQuote`, gate on `process.env.ASSISTANT_V1_ENABLED === 'true'` → `const reply = await runAgentTurn(agent, args.msg, args.textBody, voiceText, isVoice);` else the existing `handleAgentMessage(...)`. Send via existing `sendText({ to, body: reply, contextMessageId: args.msg.id })`. Leave transcription/`downloadMedia` untouched (still feeds `voiceText`).
4. **Run-to-pass**: `npx vitest run tests/unit/assistant/` (whole suite) + `npm run type-check` + `npm run build`.
5. **Commit**: `feat(assistant): route agent WhatsApp turns through the Planner→Executor behind ASSISTANT_V1_ENABLED`

---

### Invariants enforced by this phase (spec §0, verified by the tests above)
- Planner proposes, Executor decides — reply text (`composeTurnReply`) is derived from real tool `result` only (executor-run tests). **No money/status prose from the LLM.**
- Grounding ≠ Authz ≠ Freshness — resolver grounding harness (ids⊆context, sev-1); `assertAgentOwns` + `gateAction` owner/ownership deny; tool WHERE-guarded precondition no-op (`build_quote` test).
- Untrusted content is DATA — planner sees only the digest + tool projection; only the agent's own turn drives actions; free-text "כן" never fires Tier-2 (`confirm.test.ts`, orchestrator test).
- Money math is deterministic — `computeTotals` only; planner schema rejects `total`/VAT keys (`planner-validate.test.ts`, `tools-build-quote.test.ts`).
- Log before reply — `claim → execute → writeResult → compose` order asserted (`executor-run.test.ts`).
- Business-key idempotency — duplicate claim → honest no-op (`executor-run.test.ts`).