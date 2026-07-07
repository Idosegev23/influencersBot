# Phase P1 — Tool registry, contract & read tools

Builds the `ToolDefinition` data-contract, the registry dispatch that replaces the `crm_agent_wa_state` `switch(stage)`, capability/role filtering, the Planner-facing registry projection, and the four READ tools (`status`, `list_pending`, `sales_summary`, `whats_new`). Pure/testable helpers (registry logic, param validation, result shaping) are split from DB-touching `execute()` exactly like `src/lib/crm/wa-interpret.ts` is split from `wa-conversation.ts`. Pure logic gets vitest unit tests; each tool's `execute()` gets an integration test against a real Supabase branch (spec §14).

**Global invariants honored this phase:** money math never lives in a tool (only `computeTotals`/`statusBucket` reused from CRM); read tools are `sideEffect:'read'`, `confirmation:'none'`, `addressesExternalParty:false`; every read is scoped to `ctx.agent.id` (read-side of Principle 2); `db` is injected into the context so tools are testable and the Executor phase can wrap `dispatch`.

**Conventions:** TypeScript `strict:false`; vitest (`describe/it/expect`, globals on); path alias `@/*`; commits atomic, straight to `main`, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Run a single file with `npx vitest run <path>`.

---

## Task 1 — Add `zod` as a direct dependency

Zod 4.2.1 is already resolved transitively (`node_modules/zod`), and its native `z.toJSONSchema()` works (verified). Promote it to a direct dependency so the registry can import it safely.

**Files**
- modify `package.json` (add to `dependencies`)

**Steps**
1. Run: `npm install zod@^4.2.1 --save-exact=false`
2. Verify it landed under `dependencies`, not `devDependencies`: `node -e "console.log(require('./package.json').dependencies.zod)"` → prints a `^4.x` range.
3. Sanity-check the JSON-schema export the projection relies on:
   `node -e "const {z}=require('zod'); console.log(typeof z.toJSONSchema)"` → `function`.
4. Commit:
   `git add package.json package-lock.json && git commit -m "chore(assistant): add zod as a direct dependency for the tool registry"`

---

## Task 2 — `ToolDefinition` contract + core types

**Files**
- create `src/lib/assistant/registry.ts`

**Interfaces produced** — `ToolDefinition`, `AssistantAgent`, `AssistantContext`, `ToolResult`, `ErrorCategory` (exact signatures in the `produces` list).

### 2a. Failing test (pure — no DB)
Create `tests/unit/assistant/registry-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '@/lib/assistant/registry';

// A minimal read tool literal must satisfy the contract and its paramsSchema must validate.
const sample: ToolDefinition<{ scope?: string }, { count: number }> = {
  name: 'crm.sample',
  version: 1,
  description: 'sample',
  whenToUse: 'when testing',
  whenNotToUse: 'never in prod',
  paramsSchema: z.object({ scope: z.string().optional() }).strict(),
  sideEffect: 'read',
  addressesExternalParty: false,
  confirmation: 'none',
  idempotent: true,
  requiredRole: 'any',
  execute: async () => ({ ok: true, result: { count: 1 } }) as ToolResult<{ count: number }>,
};

describe('ToolDefinition contract', () => {
  it('accepts a well-formed read tool and its schema validates good input', () => {
    expect(sample.paramsSchema.safeParse({ scope: 'open' }).success).toBe(true);
  });
  it('its schema rejects unknown keys (strict) and wrong types', () => {
    expect(sample.paramsSchema.safeParse({ scope: 5 }).success).toBe(false);
    expect(sample.paramsSchema.safeParse({ bogus: 1 }).success).toBe(false);
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/registry-contract.test.ts` → fails (module `@/lib/assistant/registry` missing).

### 2b. Minimal impl
Create `src/lib/assistant/registry.ts` (types only for this task):

```ts
/**
 * Bestie Assistant tool registry — the single source of truth for tools.
 * Replaces the crm_agent_wa_state `switch(stage)` machine (spec §2.1). A tool is
 * DATA (a ToolDefinition), not a branch: the Planner sees a projection of the
 * registry, the Executor dispatches via registry.get(name).execute(...).
 */
import type { ZodType } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SideEffect = 'read' | 'write_internal' | 'write_external' | 'irreversible';
export type Confirmation = 'none' | 'undo' | 'confirm_deterministic';
export type RequiredRole = 'any' | 'owner';

// Closed error taxonomy (spec §10) — new tools inherit recovery UX by category.
export type ErrorCategory =
  | 'validation' | 'not_found' | 'forbidden' | 'conflict'
  | 'auth_expired' | 'rate_limited' | 'internal';

export interface AssistantAgent {
  id: string;
  role: 'owner' | 'employee' | 'agent'; // 'agent' = the legacy users.role value in prod today
  agencyId?: string | null;             // populated once the org phase adds users.agency_id
  managedAccountIds: string[];
  fullName?: string | null;
  capabilities: string[];               // granted OAuth scopes + enabled feature keys
  features: Record<string, boolean>;
}

export interface AssistantContext {
  agent: AssistantAgent;
  db: SupabaseClient;  // injectable: service-role in prod, a Supabase branch client in tests
  now: Date;
}

export type ToolResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: ErrorCategory; message?: string };

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;                 // namespaced: 'crm.status', later 'gcal.create_event'
  version: number;              // pinned into every persisted/queued/logged action
  description: string;          // fed verbatim to the Planner projection
  whenToUse: string;
  whenNotToUse: string;
  paramsSchema: ZodType<TParams>;
  sideEffect: SideEffect;
  addressesExternalParty: boolean;
  confirmation: Confirmation;
  idempotent: boolean;
  idempotencyKey?(p: TParams, ctx: AssistantContext): string;
  requiredCapability?: string;
  requiredRole: RequiredRole;
  ground?(p: TParams, ctx: AssistantContext): Promise<any> | any;
  execute(p: TParams, ctx: AssistantContext): Promise<ToolResult<TResult>>;
}
```

Run-to-pass: `npx vitest run tests/unit/assistant/registry-contract.test.ts` → green.

Commit: `git add src/lib/assistant/registry.ts tests/unit/assistant/registry-contract.test.ts && git commit -m "feat(assistant): ToolDefinition contract + core types"`

---

## Task 3 — `Registry` class (register / get / list, duplicate guard)

**Files**
- modify `src/lib/assistant/registry.ts`

### 3a. Failing test
Append to `tests/unit/assistant/registry.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Registry, type ToolDefinition } from '@/lib/assistant/registry';

function toolFixture(name: string, over: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name, version: 1, description: name, whenToUse: '', whenNotToUse: '',
    paramsSchema: z.object({}).strict(), sideEffect: 'read', addressesExternalParty: false,
    confirmation: 'none', idempotent: true, requiredRole: 'any',
    execute: async () => ({ ok: true, result: {} }),
    ...over,
  };
}

describe('Registry', () => {
  it('registers and retrieves by name', () => {
    const r = new Registry();
    r.register(toolFixture('crm.status'));
    expect(r.get('crm.status')?.name).toBe('crm.status');
    expect(r.get('nope')).toBeUndefined();
  });
  it('list() returns all registered tools', () => {
    const r = new Registry();
    r.register(toolFixture('crm.status'));
    r.register(toolFixture('crm.list_pending'));
    expect(r.list().map((t) => t.name).sort()).toEqual(['crm.list_pending', 'crm.status']);
  });
  it('throws on duplicate registration (a tool name is unique)', () => {
    const r = new Registry();
    r.register(toolFixture('crm.status'));
    expect(() => r.register(toolFixture('crm.status'))).toThrow(/duplicate/);
  });
});

export { toolFixture }; // reused by later test files
```

Run-to-fail: `npx vitest run tests/unit/assistant/registry.test.ts` → fails (`Registry` not exported).

### 3b. Minimal impl
Append to `registry.ts`:

```ts
export class Registry {
  private tools = new Map<string, ToolDefinition>();
  register(def: ToolDefinition): void {
    if (this.tools.has(def.name)) throw new Error(`duplicate tool: ${def.name}`);
    this.tools.set(def.name, def);
  }
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
```

Run-to-pass: `npx vitest run tests/unit/assistant/registry.test.ts` → green.

Commit: `git add -A && git commit -m "feat(assistant): Registry with duplicate-name guard"`

---

## Task 4 — Capability / role filtering (Planner physically cannot see forbidden tools)

Spec §2.2: `tools.filter(hasCapability & roleAllows & featureFlag)`. Feature flags are folded into `capabilities` (enabled feature keys appended to the list), keeping `ToolDefinition` exactly as the shared contract specifies.

**Files**
- modify `src/lib/assistant/registry.ts`

### 4a. Failing test
Create `tests/unit/assistant/registry-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { roleAllows, hasCapability, filterTools } from '@/lib/assistant/registry';
import { toolFixture } from './registry.test';

describe('roleAllows', () => {
  it('any-role tools run for everyone', () => {
    expect(roleAllows(toolFixture('a', { requiredRole: 'any' }), 'employee')).toBe(true);
  });
  it('owner-only tools deny non-owners', () => {
    const t = toolFixture('a', { requiredRole: 'owner' });
    expect(roleAllows(t, 'owner')).toBe(true);
    expect(roleAllows(t, 'employee')).toBe(false);
    expect(roleAllows(t, 'agent')).toBe(false);
  });
});

describe('hasCapability', () => {
  it('tools with no requiredCapability always pass', () => {
    expect(hasCapability(toolFixture('a'), [])).toBe(true);
  });
  it('gates on the granted capability list', () => {
    const t = toolFixture('gcal.create_event', { requiredCapability: 'google.calendar' });
    expect(hasCapability(t, ['google.calendar'])).toBe(true);
    expect(hasCapability(t, ['google.gmail'])).toBe(false);
  });
});

describe('filterTools', () => {
  it('drops tools the caller cannot run (role + capability)', () => {
    const defs = [
      toolFixture('crm.status'),
      toolFixture('crm.set_commission', { requiredRole: 'owner' }),
      toolFixture('gcal.create_event', { requiredCapability: 'google.calendar' }),
    ];
    const employeeNoCal = filterTools(defs, { role: 'employee', capabilities: [] });
    expect(employeeNoCal.map((t) => t.name)).toEqual(['crm.status']);
    const ownerWithCal = filterTools(defs, { role: 'owner', capabilities: ['google.calendar'] });
    expect(ownerWithCal.map((t) => t.name).sort()).toEqual(['crm.set_commission', 'crm.status', 'gcal.create_event']);
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/registry-filter.test.ts` → fails (helpers undefined).

### 4b. Minimal impl
Append to `registry.ts`:

```ts
export interface CapabilityCtx {
  role: 'owner' | 'employee' | 'agent';
  capabilities: string[]; // OAuth scopes + enabled feature keys
}

export function roleAllows(def: ToolDefinition, role: string): boolean {
  return def.requiredRole === 'any' ? true : role === 'owner';
}

export function hasCapability(def: ToolDefinition, capabilities: string[]): boolean {
  return def.requiredCapability ? capabilities.includes(def.requiredCapability) : true;
}

/** Per-turn resolution: the Planner projection is built ONLY from what survives this. */
export function filterTools(defs: ToolDefinition[], ctx: CapabilityCtx): ToolDefinition[] {
  return defs.filter((d) => roleAllows(d, ctx.role) && hasCapability(d, ctx.capabilities));
}
```

Run-to-pass: `npx vitest run tests/unit/assistant/registry-filter.test.ts` → green.

Commit: `git add -A && git commit -m "feat(assistant): per-turn capability + role tool filtering"`

---

## Task 5 — Planner projection (registry → prompt view via `z.toJSONSchema`)

Spec §2.2/§10: the Planner sees name/description/when/schema; the Executor sees the whole object. Same source, two views.

**Files**
- modify `src/lib/assistant/registry.ts`

### 5a. Failing test
Create `tests/unit/assistant/registry-projection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { projectToolForPlanner, projectForPlanner } from '@/lib/assistant/registry';
import { toolFixture } from './registry.test';

describe('projectToolForPlanner', () => {
  it('emits only the planner-visible fields + a JSON Schema for params', () => {
    const def = toolFixture('crm.status', {
      description: 'סטטוס הפייפליין',
      whenToUse: 'שאלת מצב',
      whenNotToUse: 'לא לשינויים',
      paramsSchema: z.object({ scope: z.enum(['all', 'open']).optional() }).strict(),
    });
    const p = projectToolForPlanner(def);
    expect(p).toMatchObject({
      name: 'crm.status', version: 1, description: 'סטטוס הפייפליין',
      whenToUse: 'שאלת מצב', whenNotToUse: 'לא לשינויים',
    });
    // no execute/sideEffect/confirmation leak into the planner view
    expect(p).not.toHaveProperty('execute');
    expect(p).not.toHaveProperty('sideEffect');
    // params are a real JSON Schema (draft 2020-12) with the enum preserved
    expect(p.paramsJsonSchema.type).toBe('object');
    expect(p.paramsJsonSchema.properties.scope.enum).toEqual(['all', 'open']);
    expect(p.paramsJsonSchema.additionalProperties).toBe(false);
  });
});

describe('projectForPlanner', () => {
  it('projects a list in registration order', () => {
    const out = projectForPlanner([toolFixture('a'), toolFixture('b')]);
    expect(out.map((t) => t.name)).toEqual(['a', 'b']);
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/registry-projection.test.ts` → fails.

### 5b. Minimal impl
Append to `registry.ts` (add `import { z } from 'zod';` at top alongside the type import):

```ts
export interface PlannerToolProjection {
  name: string;
  version: number;
  description: string;
  whenToUse: string;
  whenNotToUse: string;
  paramsJsonSchema: Record<string, any>;
}

export function projectToolForPlanner(def: ToolDefinition): PlannerToolProjection {
  return {
    name: def.name,
    version: def.version,
    description: def.description,
    whenToUse: def.whenToUse,
    whenNotToUse: def.whenNotToUse,
    paramsJsonSchema: z.toJSONSchema(def.paramsSchema) as Record<string, any>,
  };
}

export function projectForPlanner(defs: ToolDefinition[]): PlannerToolProjection[] {
  return defs.map(projectToolForPlanner);
}
```

Run-to-pass: `npx vitest run tests/unit/assistant/registry-projection.test.ts` → green.

Commit: `git add -A && git commit -m "feat(assistant): planner projection of the registry (z.toJSONSchema)"`

---

## Task 6 — `validateParams` + `dispatch` (the switch-killer seam)

`dispatch` is the deterministic replacement for `switch(state.stage)` in `wa-conversation.ts`: look up the def, enforce role+capability, validate params via the Zod schema, then run `execute`. The full Executor (idempotency claim + ledger write + WHERE-guarded preconditions, spec §3.2) wraps this seam in a later phase; P1 proves invalid params never reach `execute`.

**Files**
- modify `src/lib/assistant/registry.ts`

### 6a. Failing test
Create `tests/unit/assistant/registry-dispatch.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { Registry, dispatch, validateParams, type AssistantContext } from '@/lib/assistant/registry';
import { toolFixture } from './registry.test';

const ctx = (over: Partial<AssistantContext['agent']> = {}): AssistantContext => ({
  agent: { id: 'a1', role: 'agent', managedAccountIds: [], capabilities: [], features: {}, ...over },
  db: {} as any,
  now: new Date('2026-07-07T09:00:00Z'),
});

describe('validateParams', () => {
  it('passes good input and returns typed data', () => {
    const def = toolFixture('t', { paramsSchema: z.object({ scope: z.enum(['open']).optional() }).strict() });
    expect(validateParams(def, { scope: 'open' })).toEqual({ ok: true, data: { scope: 'open' } });
  });
  it('rejects bad input with a validation category (never throws)', () => {
    const def = toolFixture('t', { paramsSchema: z.object({ scope: z.string() }).strict() });
    const r = validateParams(def, { scope: 5 });
    expect(r.ok).toBe(false);
    expect((r as any).error).toBe('validation');
  });
});

describe('dispatch', () => {
  it('unknown tool → not_found, no execution', async () => {
    const r = new Registry();
    expect(await dispatch(r, { tool: 'ghost' }, ctx())).toEqual({ ok: false, error: 'not_found', message: expect.any(String) });
  });

  it('owner-only tool for a non-owner → forbidden, execute NOT called', async () => {
    const exec = vi.fn(async () => ({ ok: true, result: {} }));
    const r = new Registry();
    r.register(toolFixture('crm.set_commission', { requiredRole: 'owner', execute: exec as any }));
    const res = await dispatch(r, { tool: 'crm.set_commission', inputs: {} }, ctx({ role: 'employee' }));
    expect(res).toMatchObject({ ok: false, error: 'forbidden' });
    expect(exec).not.toHaveBeenCalled();
  });

  it('missing capability → forbidden, execute NOT called', async () => {
    const exec = vi.fn(async () => ({ ok: true, result: {} }));
    const r = new Registry();
    r.register(toolFixture('gcal.x', { requiredCapability: 'google.calendar', execute: exec as any }));
    const res = await dispatch(r, { tool: 'gcal.x', inputs: {} }, ctx());
    expect(res).toMatchObject({ ok: false, error: 'forbidden' });
    expect(exec).not.toHaveBeenCalled();
  });

  it('invalid params → validation error, execute NEVER called', async () => {
    const exec = vi.fn(async () => ({ ok: true, result: {} }));
    const r = new Registry();
    r.register(toolFixture('crm.status', {
      paramsSchema: z.object({ scope: z.enum(['all', 'open']) }).strict(),
      execute: exec as any,
    }));
    const res = await dispatch(r, { tool: 'crm.status', inputs: { scope: 'bogus' } }, ctx());
    expect(res).toMatchObject({ ok: false, error: 'validation' });
    expect(exec).not.toHaveBeenCalled();
  });

  it('valid call → execute runs with parsed params + ctx', async () => {
    const exec = vi.fn(async (p: any) => ({ ok: true, result: { echoed: p.scope } }));
    const r = new Registry();
    r.register(toolFixture('crm.status', {
      paramsSchema: z.object({ scope: z.enum(['all', 'open']).optional() }).strict(),
      execute: exec as any,
    }));
    const res = await dispatch(r, { tool: 'crm.status', inputs: { scope: 'open' } }, ctx());
    expect(res).toEqual({ ok: true, result: { echoed: 'open' } });
    expect(exec).toHaveBeenCalledOnce();
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/registry-dispatch.test.ts` → fails.

### 6b. Minimal impl
Append to `registry.ts`:

```ts
export function validateParams<T>(
  def: ToolDefinition<T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; error: 'validation'; message: string } {
  const parsed = def.paramsSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const message = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  return { ok: false, error: 'validation', message };
}

export interface PlannerAction {
  tool: string;
  inputs?: unknown;
}

/**
 * Registry dispatch — the deterministic replacement for the wa_state switch.
 * Order: resolve def → role gate → capability gate → param validation → execute.
 * The full Executor (idempotency + ledger + WHERE-guarded preconditions) wraps
 * this seam in a later phase; nothing invalid ever reaches execute().
 */
export async function dispatch(
  registry: Registry,
  action: PlannerAction,
  ctx: AssistantContext,
): Promise<ToolResult<any>> {
  const def = registry.get(action.tool);
  if (!def) return { ok: false, error: 'not_found', message: `unknown tool: ${action.tool}` };
  if (!roleAllows(def, ctx.agent.role)) return { ok: false, error: 'forbidden', message: `${def.name} requires owner role` };
  if (!hasCapability(def, ctx.agent.capabilities)) {
    return { ok: false, error: 'forbidden', message: `${def.name} requires capability: ${def.requiredCapability}` };
  }
  const v = validateParams(def, action.inputs ?? {});
  if (!v.ok) return v;
  return def.execute(v.data, ctx);
}
```

Run-to-pass: `npx vitest run tests/unit/assistant/registry-dispatch.test.ts` → green.

Commit: `git add -A && git commit -m "feat(assistant): validateParams + registry dispatch (replaces wa_state switch)"`

---

## Task 7 — Integration harness for real-Supabase branch tests

Spec §14 mandates executor/read fixtures against a **real Supabase branch, not mocks**. The repo's global `tests/setup.ts` mocks `global.fetch`, which would break `supabase-js`; the harness restores a real fetch (via `undici`, already resolved transitively) and gates the suite behind branch env vars so CI without a branch stays green.

**Branch provisioning (author-time, via the Supabase MCP — a Supabase branch already carries the prod schema/migrations):**
1. `mcp__supabase__create_branch` name `bestie-assistant-p1`.
2. `mcp__supabase__get_project_url` + `mcp__supabase__get_publishable_keys` for the branch; also grab the service-role key from the dashboard. Export before running: `TEST_SUPABASE_URL=<branch-url> TEST_SUPABASE_SERVICE_KEY=<branch-service-role>`.
3. Seed rows with `mcp__supabase__execute_sql` (SQL in Task 8b). Tear down later with `mcp__supabase__delete_branch`.

**Files**
- create `tests/integration/helpers/supabase-branch.ts`

### Impl (no standalone test — exercised by Task 8+)
```ts
// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetch as realFetch } from 'undici';
import type { AssistantAgent, AssistantContext } from '@/lib/assistant/registry';

const URL = process.env.TEST_SUPABASE_URL;
const KEY = process.env.TEST_SUPABASE_SERVICE_KEY;

export const hasBranch = Boolean(URL && KEY);

/** A service-role client against the TEST BRANCH, with a REAL fetch (setup.ts mocks the global). */
export function branchClient(): SupabaseClient {
  if (!hasBranch) throw new Error('no branch env: set TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_KEY');
  return createClient(URL!, KEY!, {
    auth: { persistSession: false },
    global: { fetch: realFetch as unknown as typeof fetch },
  });
}

export function branchContext(agent: Partial<AssistantAgent> & { id: string }): AssistantContext {
  return {
    agent: { role: 'agent', managedAccountIds: [], capabilities: [], features: {}, fullName: null, ...agent },
    db: branchClient(),
    now: new Date('2026-07-07T09:00:00Z'),
  };
}
```

Note: integration files use `describe.runIf(hasBranch)(...)` so they no-op when env is absent. The `// @vitest-environment node` pragma at the top of each integration test file switches that file off jsdom.

Commit: `git add tests/integration/helpers/supabase-branch.ts && git commit -m "test(assistant): supabase-branch integration harness (real fetch, env-gated)"`

---

## Task 8 — Read tool `crm.status`

Compact pipeline snapshot scoped to the agent. Pure shaping (`formatDealLine`) is unit-tested; `execute()` is branch-tested.

**Files**
- create `src/lib/assistant/tools/status.ts`

**Interfaces produced** — `statusParams` (zod), `StatusParams`, `DealBrief`, `StatusResult`, `formatDealLine`, `statusTool: ToolDefinition`.

### 8a. Failing unit test (pure shaping)
Create `tests/unit/assistant/tool-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDealLine, statusParams, statusTool } from '@/lib/assistant/tools/status';

describe('formatDealLine', () => {
  it('renders "#id · talent · brand · status · amount₪" with grouped thousands', () => {
    expect(formatDealLine({ shortId: 'ab12cd34', talent: 'יונתן', brand: 'סודהסטרים', status: 'proposal', amount: 20000 }))
      .toBe('#ab12cd34 · יונתן · סודהסטרים · proposal · 20,000 ₪');
  });
  it('shows a dash when amount is 0/unknown', () => {
    expect(formatDealLine({ shortId: 'x', talent: 'אנה', brand: 'קוקה קולה', status: 'proposal', amount: 0 }))
      .toBe('#x · אנה · קוקה קולה · proposal · —');
  });
});

describe('statusTool contract', () => {
  it('is a read tool: no confirmation, not external, any-role, idempotent', () => {
    expect(statusTool).toMatchObject({
      name: 'crm.status', sideEffect: 'read', confirmation: 'none',
      addressesExternalParty: false, requiredRole: 'any', idempotent: true,
    });
  });
  it('params: scope enum + optional talentId, strict', () => {
    expect(statusParams.safeParse({ scope: 'open' }).success).toBe(true);
    expect(statusParams.safeParse({ scope: 'nope' }).success).toBe(false);
    expect(statusParams.safeParse({ extra: 1 }).success).toBe(false);
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/tool-status.test.ts` → fails.

### 8b. Impl
Create `src/lib/assistant/tools/status.ts`:

```ts
import { z } from 'zod';
import type { ToolDefinition, ToolResult, AssistantContext } from '@/lib/assistant/registry';

export const statusParams = z
  .object({
    scope: z.enum(['all', 'open', 'signed', 'unpaid']).optional(),
    talentId: z.string().uuid().optional(),
  })
  .strict();
export type StatusParams = z.infer<typeof statusParams>;

export interface DealBrief { shortId: string; talent: string; brand: string; status: string; amount: number }
export interface StatusResult { openCount: number; signedCount: number; deals: DealBrief[]; lines: string[] }

/** Pure: one scannable RTL line per deal (spec §12: IDs/slugs, not blobs). */
export function formatDealLine(d: DealBrief): string {
  const amt = d.amount ? `${d.amount.toLocaleString('en-US')} ₪` : '—';
  return `#${d.shortId} · ${d.talent} · ${d.brand} · ${d.status} · ${amt}`;
}

async function talentNames(ctx: AssistantContext, accountIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(accountIds.filter(Boolean)));
  if (!ids.length) return map;
  const { data } = await ctx.db.from('accounts').select('id, config').in('id', ids);
  for (const a of data || []) {
    map.set(a.id, (a.config as any)?.display_name || (a.config as any)?.username || 'מיוצג');
  }
  return map;
}

export const statusTool: ToolDefinition<StatusParams, StatusResult> = {
  name: 'crm.status',
  version: 1,
  description: 'סיכום מצב הפייפליין של הסוכן: כמה עסקאות פתוחות/חתומות ורשימה תמציתית.',
  whenToUse: 'הסוכן שואל "מה המצב", "מה פתוח", "מה קורה עם X".',
  whenNotToUse: 'כשצריך לבצע פעולה (בנייה/שליחה/סימון) — זה כלי קריאה בלבד.',
  paramsSchema: statusParams,
  sideEffect: 'read',
  addressesExternalParty: false,
  confirmation: 'none',
  idempotent: true,
  requiredRole: 'any',
  execute: async (p, ctx): Promise<ToolResult<StatusResult>> => {
    // Scoped to this agent (read-side of Principle 2). Owner→agency union lands in the org phase.
    const { data, error } = await ctx.db
      .from('partnerships')
      .select('id, brand_name, status, proposal_amount, account_id, created_at')
      .eq('agent_id', ctx.agent.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return { ok: false, error: 'internal', message: error.message };

    const rows = data || [];
    const names = await talentNames(ctx, rows.map((r) => r.account_id));
    const isSigned = (s: string) => s === 'active' || s === 'completed';

    let view = rows;
    if (p.talentId) view = view.filter((r) => r.account_id === p.talentId);
    if (p.scope === 'signed') view = view.filter((r) => isSigned(r.status));
    else if (p.scope === 'open') view = view.filter((r) => r.status === 'proposal');

    const deals: DealBrief[] = view.map((r) => ({
      shortId: String(r.id).slice(0, 8),
      talent: names.get(r.account_id) || 'מיוצג',
      brand: r.brand_name || 'מותג',
      status: r.status,
      amount: Number(r.proposal_amount) || 0,
    }));

    return {
      ok: true,
      result: {
        openCount: rows.filter((r) => r.status === 'proposal').length,
        signedCount: rows.filter((r) => isSigned(r.status)).length,
        deals,
        lines: deals.map(formatDealLine),
      },
    };
  },
};
```

Run-to-pass (unit): `npx vitest run tests/unit/assistant/tool-status.test.ts` → green.

### 8c. Integration test (branch) + seed SQL
Seed via `mcp__supabase__execute_sql` on the branch (two agents to prove scoping; a talent account):

```sql
insert into public.users (id, role, status, full_name) values
  ('11111111-1111-1111-1111-111111111111','agent','active','Agent One'),
  ('22222222-2222-2222-2222-222222222222','agent','active','Agent Two')
on conflict (id) do nothing;
insert into public.accounts (id, type, config) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','creator','{"display_name":"יונתן"}'::jsonb)
on conflict (id) do nothing;
insert into public.partnerships (id, agent_id, account_id, brand_name, status, proposal_amount, currency, proposal_date) values
  ('d0000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','סודהסטרים','proposal',20000,'ILS',current_date),
  ('d0000002-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','נספרסו','active',35000,'ILS',current_date),
  ('d0000003-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','מותג-של-סוכן-אחר','proposal',9999,'ILS',current_date)
on conflict (id) do nothing;
```

Create `tests/integration/assistant/tool-status.int.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { statusTool } from '@/lib/assistant/tools/status';
import { hasBranch, branchContext } from '../helpers/supabase-branch';

describe.runIf(hasBranch)('crm.status execute (branch)', () => {
  const ctx = branchContext({ id: '11111111-1111-1111-1111-111111111111' });

  it('returns only the calling agent\'s deals (cross-agent isolation)', async () => {
    const r = await statusTool.execute({}, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const brands = r.result.deals.map((d) => d.brand);
    expect(brands).toContain('סודהסטרים');
    expect(brands).not.toContain('מותג-של-סוכן-אחר'); // agent-two's deal must never leak
    expect(r.result.openCount).toBe(1);
    expect(r.result.signedCount).toBe(1);
  });

  it('scope=open filters to proposals and shapes lines', async () => {
    const r = await statusTool.execute({ scope: 'open' }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.deals.every((d) => d.status === 'proposal')).toBe(true);
    expect(r.result.lines[0]).toMatch(/#\w+ · יונתן · .+ · proposal · [\d,]+ ₪/);
  });
});
```

Run-to-pass (branch): `TEST_SUPABASE_URL=<url> TEST_SUPABASE_SERVICE_KEY=<key> npx vitest run tests/integration/assistant/tool-status.int.test.ts`. Without the env, the suite is skipped and still exits 0.

Commit: `git add src/lib/assistant/tools/status.ts tests/unit/assistant/tool-status.test.ts tests/integration/assistant/tool-status.int.test.ts && git commit -m "feat(assistant): crm.status read tool + branch fixture"`

---

## Task 9 — Read tool `crm.list_pending`

"What's stuck": unsigned quotes, unpaid invoices, unassigned briefs. Pure grouping (`groupPending`) unit-tested; `execute()` branch-tested.

**Files**
- create `src/lib/assistant/tools/list_pending.ts`

### 9a. Failing unit test
Create `tests/unit/assistant/tool-list-pending.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupPending, listPendingParams, listPendingTool } from '@/lib/assistant/tools/list_pending';

describe('groupPending', () => {
  it('counts each pending kind and builds a top-line summary', () => {
    const r = groupPending(
      [{ id: 's1', title: 'הצעה — Fox' }],
      [{ id: 'i1', brand: 'H&M', amount: 11800 }],
      [{ id: 'b1', brand: 'סופרפארם' }],
    );
    expect(r.unsignedQuotes).toBe(1);
    expect(r.unpaidInvoices).toBe(1);
    expect(r.unassignedBriefs).toBe(1);
    expect(r.lines).toEqual([
      'הצעות לא חתומות: 1',
      'חשבוניות לא שולמו: 1',
      'בריפים לא משויכים: 1',
    ]);
  });
  it('omits zero-count lines', () => {
    expect(groupPending([], [], []).lines).toEqual([]);
  });
});

describe('listPendingTool contract', () => {
  it('read/none/any', () => {
    expect(listPendingTool).toMatchObject({ name: 'crm.list_pending', sideEffect: 'read', confirmation: 'none', requiredRole: 'any' });
  });
  it('params strict + optional kind filter', () => {
    expect(listPendingParams.safeParse({ kind: 'quotes' }).success).toBe(true);
    expect(listPendingParams.safeParse({ kind: 'bogus' }).success).toBe(false);
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/tool-list-pending.test.ts` → fails.

### 9b. Impl
Create `src/lib/assistant/tools/list_pending.ts`:

```ts
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '@/lib/assistant/registry';

export const listPendingParams = z
  .object({ kind: z.enum(['all', 'quotes', 'invoices', 'briefs']).optional() })
  .strict();
export type ListPendingParams = z.infer<typeof listPendingParams>;

export interface PendingQuote { id: string; title: string }
export interface PendingInvoice { id: string; brand: string; amount: number }
export interface PendingBrief { id: string; brand: string }
export interface PendingResult {
  unsignedQuotes: number;
  unpaidInvoices: number;
  unassignedBriefs: number;
  quotes: PendingQuote[];
  invoices: PendingInvoice[];
  briefs: PendingBrief[];
  lines: string[];
}

/** Pure: counts + a top-line summary (zero-count lines omitted). */
export function groupPending(quotes: PendingQuote[], invoices: PendingInvoice[], briefs: PendingBrief[]): PendingResult {
  const lines: string[] = [];
  if (quotes.length) lines.push(`הצעות לא חתומות: ${quotes.length}`);
  if (invoices.length) lines.push(`חשבוניות לא שולמו: ${invoices.length}`);
  if (briefs.length) lines.push(`בריפים לא משויכים: ${briefs.length}`);
  return {
    unsignedQuotes: quotes.length,
    unpaidInvoices: invoices.length,
    unassignedBriefs: briefs.length,
    quotes, invoices, briefs, lines,
  };
}

export const listPendingTool: ToolDefinition<ListPendingParams, PendingResult> = {
  name: 'crm.list_pending',
  version: 1,
  description: 'מה תקוע: הצעות שלא נחתמו, חשבוניות שלא שולמו, בריפים שלא שויכו.',
  whenToUse: 'הסוכן שואל "מה תקוע", "מה מחכה לי", "מה לא סגור".',
  whenNotToUse: 'לפעולות — כלי קריאה בלבד.',
  paramsSchema: listPendingParams,
  sideEffect: 'read',
  addressesExternalParty: false,
  confirmation: 'none',
  idempotent: true,
  requiredRole: 'any',
  execute: async (p, ctx): Promise<ToolResult<PendingResult>> => {
    const kind = p.kind || 'all';
    const want = (k: string) => kind === 'all' || kind === k;

    let quotes: PendingQuote[] = [];
    let invoices: PendingInvoice[] = [];
    let briefs: PendingBrief[] = [];

    if (want('quotes')) {
      const { data, error } = await ctx.db
        .from('signature_requests')
        .select('id, title, status')
        .eq('agent_id', ctx.agent.id)
        .eq('status', 'pending')
        .limit(50);
      if (error) return { ok: false, error: 'internal', message: error.message };
      quotes = (data || []).map((s) => ({ id: s.id, title: s.title || 'הצעה' }));
    }
    if (want('invoices')) {
      const { data, error } = await ctx.db
        .from('invoices')
        .select('id, status, amount, brand_name')
        .eq('agent_id', ctx.agent.id)
        .eq('status', 'sent')
        .limit(50);
      if (error) return { ok: false, error: 'internal', message: error.message };
      invoices = (data || []).map((i) => ({ id: i.id, brand: (i as any).brand_name || 'מותג', amount: Number((i as any).amount) || 0 }));
    }
    if (want('briefs')) {
      const { data, error } = await ctx.db
        .from('crm_inbound_messages')
        .select('id, brief_status, parsed_data')
        .eq('agent_id', ctx.agent.id)
        .eq('brief_status', 'new')
        .limit(50);
      if (error) return { ok: false, error: 'internal', message: error.message };
      briefs = (data || []).map((b) => ({ id: b.id, brand: (b.parsed_data as any)?.brandName || 'מותג' }));
    }

    return { ok: true, result: groupPending(quotes, invoices, briefs) };
  },
};
```

> Note: if `invoices.brand_name` does not exist on the live table, drop it from the select and default `brand` to `'מותג'` — confirm the column set from `mcp__supabase__list_tables` before the branch run; the pure `groupPending` test is unaffected.

Run-to-pass (unit): `npx vitest run tests/unit/assistant/tool-list-pending.test.ts` → green.

### 9c. Integration test
Seed (extends Task 8 branch): add a pending signature_request + a `sent` invoice + a `new` brief for agent-one, plus the same for agent-two to prove isolation:

```sql
insert into public.signature_requests (id, token, partnership_id, account_id, agent_id, title, status) values
  ('50000001-0000-0000-0000-000000000001','tok-int-1','d0000001-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','הצעה — Fox','pending')
on conflict (id) do nothing;
insert into public.crm_inbound_messages (id, channel, agent_id, sender, brief_status, parsed_data) values
  ('c0000001-0000-0000-0000-000000000001','whatsapp','11111111-1111-1111-1111-111111111111','972500000000','new','{"brandName":"סופרפארם"}'::jsonb)
on conflict (id) do nothing;
```

Create `tests/integration/assistant/tool-list-pending.int.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { listPendingTool } from '@/lib/assistant/tools/list_pending';
import { hasBranch, branchContext } from '../helpers/supabase-branch';

describe.runIf(hasBranch)('crm.list_pending execute (branch)', () => {
  const ctx = branchContext({ id: '11111111-1111-1111-1111-111111111111' });

  it('surfaces the agent\'s pending quotes + briefs, scoped', async () => {
    const r = await listPendingTool.execute({}, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.unsignedQuotes).toBeGreaterThanOrEqual(1);
    expect(r.result.unassignedBriefs).toBeGreaterThanOrEqual(1);
    expect(r.result.quotes.map((q) => q.title)).toContain('הצעה — Fox');
  });

  it('kind=quotes returns only quotes', async () => {
    const r = await listPendingTool.execute({ kind: 'quotes' }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.unassignedBriefs).toBe(0);
    expect(r.result.unpaidInvoices).toBe(0);
  });
});
```

Run-to-pass (branch): `TEST_SUPABASE_URL=<url> TEST_SUPABASE_SERVICE_KEY=<key> npx vitest run tests/integration/assistant/tool-list-pending.int.test.ts`.

Commit: `git add src/lib/assistant/tools/list_pending.ts tests/unit/assistant/tool-list-pending.test.ts tests/integration/assistant/tool-list-pending.int.test.ts && git commit -m "feat(assistant): crm.list_pending read tool + branch fixture"`

---

## Task 10 — Read tool `crm.sales_summary`

Reuses `statusBucket` from `src/lib/crm/overview.ts` (do not reinvent). Pure `summarizeSales` unit-tested; `execute()` branch-tested.

**Files**
- create `src/lib/assistant/tools/sales_summary.ts`

### 10a. Failing unit test
Create `tests/unit/assistant/tool-sales-summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summarizeSales, salesSummaryParams, salesSummaryTool } from '@/lib/assistant/tools/sales_summary';

const now = new Date('2026-07-07T09:00:00Z');

describe('summarizeSales', () => {
  it('sums signed vs open amounts using the CRM statusBucket', () => {
    const r = summarizeSales(
      [
        { status: 'active', proposal_amount: 20000, proposal_date: '2026-07-01' },
        { status: 'completed', proposal_amount: 15000, proposal_date: '2026-07-03' },
        { status: 'proposal', proposal_amount: 8000, proposal_date: '2026-07-05' },
        { status: 'cancelled', proposal_amount: 99999, proposal_date: '2026-07-05' },
      ],
      { now, period: 'month' },
    );
    expect(r.signedTotal).toBe(35000);
    expect(r.pendingTotal).toBe(8000);
    expect(r.dealCount).toBe(3); // cancelled excluded
    expect(r.lines[0]).toBe('נחתם החודש: 35,000 ₪');
  });
  it('period=month drops deals dated before the current month', () => {
    const r = summarizeSales(
      [
        { status: 'active', proposal_amount: 10000, proposal_date: '2026-06-30' }, // prior month
        { status: 'active', proposal_amount: 5000, proposal_date: '2026-07-02' },
      ],
      { now, period: 'month' },
    );
    expect(r.signedTotal).toBe(5000);
  });
});

describe('salesSummaryTool contract', () => {
  it('read/none/any', () => {
    expect(salesSummaryTool).toMatchObject({ name: 'crm.sales_summary', sideEffect: 'read', confirmation: 'none', requiredRole: 'any' });
  });
  it('period enum strict', () => {
    expect(salesSummaryParams.safeParse({ period: 'month' }).success).toBe(true);
    expect(salesSummaryParams.safeParse({ period: 'decade' }).success).toBe(false);
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/tool-sales-summary.test.ts` → fails.

### 10b. Impl
Create `src/lib/assistant/tools/sales_summary.ts`:

```ts
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '@/lib/assistant/registry';
import { statusBucket, type DealLike } from '@/lib/crm/overview';

export const salesSummaryParams = z
  .object({ period: z.enum(['month', 'quarter', 'ytd', 'all']).optional() })
  .strict();
export type SalesSummaryParams = z.infer<typeof salesSummaryParams>;

export interface SalesDeal extends DealLike { proposal_amount?: number | null; proposal_date?: string | null }
export interface SalesResult {
  period: string;
  signedTotal: number;
  pendingTotal: number;
  dealCount: number;
  currency: string;
  lines: string[];
}

function periodStart(now: Date, period: string): Date | null {
  const y = now.getUTCFullYear();
  if (period === 'ytd') return new Date(Date.UTC(y, 0, 1));
  if (period === 'quarter') return new Date(Date.UTC(y, Math.floor(now.getUTCMonth() / 3) * 3, 1));
  if (period === 'month') return new Date(Date.UTC(y, now.getUTCMonth(), 1));
  return null; // 'all'
}

/** Pure: bucket deals via the CRM's statusBucket, sum signed vs open within the period. */
export function summarizeSales(deals: SalesDeal[], opts: { now: Date; period?: string }): SalesResult {
  const period = opts.period || 'month';
  const start = periodStart(opts.now, period);
  const inPeriod = (deals || []).filter((d) => {
    if (!start) return true;
    if (!d.proposal_date) return false;
    return new Date(d.proposal_date) >= start;
  });
  let signedTotal = 0;
  let pendingTotal = 0;
  let dealCount = 0;
  for (const d of inPeriod) {
    const bucket = statusBucket(d);
    if (bucket === 'cancelled' || bucket === 'moved') continue;
    const amt = Number(d.proposal_amount) || 0;
    dealCount += 1;
    if (bucket === 'signed') signedTotal += amt;
    else pendingTotal += amt;
  }
  const label = { month: 'החודש', quarter: 'הרבעון', ytd: 'השנה', all: 'סה״כ' }[period] || 'החודש';
  const lines = [
    `נחתם ${label}: ${signedTotal.toLocaleString('en-US')} ₪`,
    `בצנרת ${label}: ${pendingTotal.toLocaleString('en-US')} ₪`,
  ];
  return { period, signedTotal, pendingTotal, dealCount, currency: 'ILS', lines };
}

export const salesSummaryTool: ToolDefinition<SalesSummaryParams, SalesResult> = {
  name: 'crm.sales_summary',
  version: 1,
  description: 'סיכום מכירות: כמה נחתם וכמה בצנרת בתקופה (חודש/רבעון/שנה).',
  whenToUse: 'הסוכן שואל "כמה עשיתי החודש", "כמה סגרתי", "מה בצנרת".',
  whenNotToUse: 'לפעולות — כלי קריאה בלבד.',
  paramsSchema: salesSummaryParams,
  sideEffect: 'read',
  addressesExternalParty: false,
  confirmation: 'none',
  idempotent: true,
  requiredRole: 'any',
  execute: async (p, ctx): Promise<ToolResult<SalesResult>> => {
    const { data, error } = await ctx.db
      .from('partnerships')
      .select('status, proposal_amount, proposal_date, project_type, moved_to_month')
      .eq('agent_id', ctx.agent.id)
      .limit(500);
    if (error) return { ok: false, error: 'internal', message: error.message };
    return { ok: true, result: summarizeSales((data || []) as any, { now: ctx.now, period: p.period }) };
  },
};
```

Run-to-pass (unit): `npx vitest run tests/unit/assistant/tool-sales-summary.test.ts` → green.

### 10c. Integration test
Reuses the Task-8 seed (agent-one has one `proposal` 20000 + one `active` 35000, both dated `current_date`).

Create `tests/integration/assistant/tool-sales-summary.int.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { salesSummaryTool } from '@/lib/assistant/tools/sales_summary';
import { hasBranch, branchContext } from '../helpers/supabase-branch';

describe.runIf(hasBranch)('crm.sales_summary execute (branch)', () => {
  const ctx = branchContext({ id: '11111111-1111-1111-1111-111111111111' });

  it('sums the agent\'s signed vs pending for the current month', async () => {
    const r = await salesSummaryTool.execute({ period: 'month' }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.signedTotal).toBe(35000);   // the 'active' deal
    expect(r.result.pendingTotal).toBe(20000);  // the 'proposal' deal
    expect(r.result.currency).toBe('ILS');
  });
});
```

Run-to-pass (branch): `TEST_SUPABASE_URL=<url> TEST_SUPABASE_SERVICE_KEY=<key> npx vitest run tests/integration/assistant/tool-sales-summary.int.test.ts`.

Commit: `git add src/lib/assistant/tools/sales_summary.ts tests/unit/assistant/tool-sales-summary.test.ts tests/integration/assistant/tool-sales-summary.int.test.ts && git commit -m "feat(assistant): crm.sales_summary read tool (reuses overview.statusBucket) + branch fixture"`

---

## Task 11 — Read tool `crm.whats_new`

Recent transitions since a timestamp: quotes signed, invoices paid, new briefs. Reads existing tables in P1; will switch to `assistant_events` when the outbox ships (contract unchanged). Pure `formatWhatsNew` unit-tested; `execute()` branch-tested.

**Files**
- create `src/lib/assistant/tools/whats_new.ts`

### 11a. Failing unit test
Create `tests/unit/assistant/tool-whats-new.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatWhatsNew, whatsNewParams, whatsNewTool } from '@/lib/assistant/tools/whats_new';

describe('formatWhatsNew', () => {
  it('renders newest-first with a kind emoji anchor', () => {
    const r = formatWhatsNew([
      { kind: 'quote_signed', entityId: 'q1', label: 'Fox', at: '2026-07-06T10:00:00Z' },
      { kind: 'invoice_paid', entityId: 'i1', label: 'H&M', at: '2026-07-07T08:00:00Z' },
      { kind: 'new_brief', entityId: 'b1', label: 'סופרפארם', at: '2026-07-05T09:00:00Z' },
    ]);
    expect(r.events[0].kind).toBe('invoice_paid'); // sorted desc by at
    expect(r.lines[0]).toBe('💰 חשבונית שולמה — H&M');
    expect(r.lines).toContain('✍️ הצעה נחתמה — Fox');
    expect(r.lines).toContain('📥 בריף חדש — סופרפארם');
  });
  it('empty → empty', () => {
    expect(formatWhatsNew([])).toEqual({ events: [], lines: [] });
  });
});

describe('whatsNewTool contract', () => {
  it('read/none/any', () => {
    expect(whatsNewTool).toMatchObject({ name: 'crm.whats_new', sideEffect: 'read', confirmation: 'none', requiredRole: 'any' });
  });
  it('optional ISO since, strict', () => {
    expect(whatsNewParams.safeParse({ since: '2026-07-01T00:00:00Z' }).success).toBe(true);
    expect(whatsNewParams.safeParse({ since: 'yesterday' }).success).toBe(false);
    expect(whatsNewParams.safeParse({ x: 1 }).success).toBe(false);
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/tool-whats-new.test.ts` → fails.

### 11b. Impl
Create `src/lib/assistant/tools/whats_new.ts`:

```ts
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '@/lib/assistant/registry';

export const whatsNewParams = z
  .object({ since: z.string().datetime().optional() })
  .strict();
export type WhatsNewParams = z.infer<typeof whatsNewParams>;

export type WhatsNewKind = 'quote_signed' | 'invoice_paid' | 'new_brief';
export interface WhatsNewEvent { kind: WhatsNewKind; entityId: string; label: string; at: string }
export interface WhatsNewResult { events: WhatsNewEvent[]; lines: string[] }

const KIND_LABEL: Record<WhatsNewKind, string> = {
  quote_signed: '✍️ הצעה נחתמה',
  invoice_paid: '💰 חשבונית שולמה',
  new_brief: '📥 בריף חדש',
};

/** Pure: sort newest-first, render an emoji-anchored line per event (spec §5.4 skim). */
export function formatWhatsNew(events: WhatsNewEvent[]): WhatsNewResult {
  const sorted = [...(events || [])].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { events: sorted, lines: sorted.map((e) => `${KIND_LABEL[e.kind]} — ${e.label}`) };
}

export const whatsNewTool: ToolDefinition<WhatsNewParams, WhatsNewResult> = {
  name: 'crm.whats_new',
  version: 1,
  description: 'מה חדש: הצעות שנחתמו, חשבוניות ששולמו, בריפים חדשים — מאז נקודת זמן.',
  whenToUse: 'הסוכן שואל "מה חדש", "מה קרה מאתמול", "עדכן אותי".',
  whenNotToUse: 'לפעולות — כלי קריאה בלבד.',
  paramsSchema: whatsNewParams,
  sideEffect: 'read',
  addressesExternalParty: false,
  confirmation: 'none',
  idempotent: true,
  requiredRole: 'any',
  execute: async (p, ctx): Promise<ToolResult<WhatsNewResult>> => {
    // Default window: last 24h. (Later phases swap this for the assistant_events outbox.)
    const since = p.since || new Date(ctx.now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const events: WhatsNewEvent[] = [];

    const { data: signed, error: e1 } = await ctx.db
      .from('signature_requests')
      .select('id, title, signed_at, status')
      .eq('agent_id', ctx.agent.id)
      .eq('status', 'signed')
      .gte('signed_at', since)
      .limit(50);
    if (e1) return { ok: false, error: 'internal', message: e1.message };
    for (const s of signed || []) events.push({ kind: 'quote_signed', entityId: s.id, label: s.title || 'הצעה', at: s.signed_at });

    const { data: paid, error: e2 } = await ctx.db
      .from('invoices')
      .select('id, brand_name, paid_at, status')
      .eq('agent_id', ctx.agent.id)
      .eq('status', 'paid')
      .gte('paid_at', since)
      .limit(50);
    if (e2) return { ok: false, error: 'internal', message: e2.message };
    for (const i of paid || []) events.push({ kind: 'invoice_paid', entityId: i.id, label: (i as any).brand_name || 'מותג', at: (i as any).paid_at });

    const { data: briefs, error: e3 } = await ctx.db
      .from('crm_inbound_messages')
      .select('id, parsed_data, created_at')
      .eq('agent_id', ctx.agent.id)
      .gte('created_at', since)
      .limit(50);
    if (e3) return { ok: false, error: 'internal', message: e3.message };
    for (const b of briefs || []) events.push({ kind: 'new_brief', entityId: b.id, label: (b.parsed_data as any)?.brandName || 'מותג', at: b.created_at });

    return { ok: true, result: formatWhatsNew(events) };
  },
};
```

> Note: `invoices.paid_at` is stored as a date (`nowIso.slice(0,10)` in `invoices.ts`); `gte('paid_at', since)` compares lexicographically against the ISO datetime, which is safe for date-vs-datetime in Postgres (date coerces). If the branch run shows a coercion issue, cast `since` to `.slice(0,10)` for the invoices query only — pure test is unaffected.

Run-to-pass (unit): `npx vitest run tests/unit/assistant/tool-whats-new.test.ts` → green.

### 11c. Integration test
Seed a signed quote + paid invoice dated within 24h of `2026-07-07T09:00Z`:

```sql
update public.signature_requests set status='signed', signed_at='2026-07-07T08:00:00Z'
  where id='50000001-0000-0000-0000-000000000001';
insert into public.invoices (id, agent_id, partnership_id, status, amount, brand_name, paid_at) values
  ('60000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','d0000002-0000-0000-0000-000000000002','paid',35000,'נספרסו','2026-07-07')
on conflict (id) do nothing;
```

Create `tests/integration/assistant/tool-whats-new.int.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { whatsNewTool } from '@/lib/assistant/tools/whats_new';
import { hasBranch, branchContext } from '../helpers/supabase-branch';

describe.runIf(hasBranch)('crm.whats_new execute (branch)', () => {
  const ctx = branchContext({ id: '11111111-1111-1111-1111-111111111111' });

  it('reports the signed quote + paid invoice inside the window', async () => {
    const r = await whatsNewTool.execute({ since: '2026-07-06T09:00:00Z' }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kinds = r.result.events.map((e) => e.kind);
    expect(kinds).toContain('quote_signed');
    expect(kinds).toContain('invoice_paid');
  });
});
```

Run-to-pass (branch): `TEST_SUPABASE_URL=<url> TEST_SUPABASE_SERVICE_KEY=<key> npx vitest run tests/integration/assistant/tool-whats-new.int.test.ts`.

Commit: `git add src/lib/assistant/tools/whats_new.ts tests/unit/assistant/tool-whats-new.test.ts tests/integration/assistant/tool-whats-new.int.test.ts && git commit -m "feat(assistant): crm.whats_new read tool + branch fixture"`

---

## Task 12 — Register the read tools + wire `getRegistry()` singleton

Assemble the four tools into the registry and expose the singleton the Planner/Executor will use. A projection snapshot test locks the Planner-visible surface.

**Files**
- create `src/lib/assistant/tools/index.ts`
- modify `src/lib/assistant/registry.ts` (add `getRegistry()` + default context helper)

### 12a. Failing test
Create `tests/unit/assistant/registry-wiring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getRegistry, projectForPlanner } from '@/lib/assistant/registry';

describe('getRegistry (read tools)', () => {
  it('registers exactly the v1 read tools', () => {
    const names = getRegistry().list().map((t) => t.name).sort();
    expect(names).toEqual(['crm.list_pending', 'crm.sales_summary', 'crm.status', 'crm.whats_new']);
  });
  it('returns a stable singleton', () => {
    expect(getRegistry()).toBe(getRegistry());
  });
  it('every registered tool is projectable for the planner (schema compiles)', () => {
    const proj = projectForPlanner(getRegistry().list());
    for (const p of proj) {
      expect(p.paramsJsonSchema.type).toBe('object');
      expect(typeof p.description).toBe('string');
    }
  });
  it('all v1 tools are read/none/any (no write surface leaks in P1)', () => {
    for (const t of getRegistry().list()) {
      expect(t.sideEffect).toBe('read');
      expect(t.confirmation).toBe('none');
      expect(t.addressesExternalParty).toBe(false);
    }
  });
});
```

Run-to-fail: `npx vitest run tests/unit/assistant/registry-wiring.test.ts` → fails (`getRegistry` / tools index missing).

### 12b. Impl
Create `src/lib/assistant/tools/index.ts`:

```ts
import type { ToolDefinition } from '@/lib/assistant/registry';
import { statusTool } from './status';
import { listPendingTool } from './list_pending';
import { salesSummaryTool } from './sales_summary';
import { whatsNewTool } from './whats_new';

/** v1 read tools (spec §2.3 read row). Write tools land in later phases. */
export const readTools: ToolDefinition[] = [statusTool, listPendingTool, salesSummaryTool, whatsNewTool];
```

Append to `registry.ts` (import `readTools` and the service-role client):

```ts
import { readTools } from '@/lib/assistant/tools';
import { supabase as supabaseAdmin } from '@/lib/supabase';

let _registry: Registry | null = null;

/** Process-wide registry singleton. The Planner projects it; the Executor dispatches on it. */
export function getRegistry(): Registry {
  if (_registry) return _registry;
  const r = new Registry();
  for (const t of readTools) r.register(t);
  _registry = r;
  return r;
}

/** Build a production AssistantContext (service-role db). Tests inject their own db. */
export function buildContext(agent: AssistantAgent, opts: { now?: Date } = {}): AssistantContext {
  return { agent, db: supabaseAdmin, now: opts.now || new Date() };
}
```

> Import-cycle note: `registry.ts` imports `tools/index.ts`, which imports the tools, which import only *types* from `registry.ts` (`import type { ToolDefinition ... }`). Type-only imports are erased at runtime, so there is no runtime cycle. Keep the tool files' registry imports `import type`.

Run-to-pass (unit): `npx vitest run tests/unit/assistant/registry-wiring.test.ts` → green.

### 12c. Full-suite gate (no regressions)
Run the whole assistant unit set + type-check:
- `npx vitest run tests/unit/assistant/`
- `npm run type-check` (must not introduce new assistant errors; `strict:false`)

Commit: `git add src/lib/assistant/tools/index.ts src/lib/assistant/registry.ts tests/unit/assistant/registry-wiring.test.ts && git commit -m "feat(assistant): wire read tools into the registry singleton + projection snapshot"`

---

## Phase exit criteria
- `getRegistry()` returns the four read tools; the Planner projection is a generated view of the registry (no hardcoded tool list, no `switch`).
- `dispatch()` enforces role → capability → param-validation before `execute`; invalid/forbidden calls never reach a tool (unit-proven).
- Each read tool's `execute()` is proven against a real Supabase branch, including cross-agent isolation (agent-two's rows never surface for agent-one).
- Money math is untouched — `sales_summary` reuses `overview.statusBucket`; no tool computes VAT/totals (that stays in `computeTotals`, wired in the Executor phase).
- No migration introduced this phase; the seam (`dispatch`) and the `AssistantContext.db` injection point are ready for the Executor/idempotency/ledger phase to wrap.