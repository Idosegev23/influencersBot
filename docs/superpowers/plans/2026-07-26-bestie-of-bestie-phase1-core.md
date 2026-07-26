# Bestie of Bestie — Phase 1 (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `bestie` account — a first-class account with its own archetype, a hand-authored persona, and a knowledge base pipeline that turns markdown into retrievable chunks while refusing to ingest anything that is not about Bestie.

**Architecture:** A new `saas_product` archetype is registered in the existing RAG archetype registry. Knowledge lives as markdown under `content/bestie-kb/`, passes a pure redaction filter, and is ingested through the existing `ingestDocument` path as `entity_type='knowledge_base'` with `metadata.source='bestie_kb'`. A screen-inventory reader walks the real route tree so a drift check can name which dashboard screens have no knowledge entry yet.

**Tech Stack:** TypeScript, Next.js 16, Supabase (Postgres + pgvector), Vitest, OpenAI `text-embedding-3-large` (2000 dims, via existing `src/lib/rag/embeddings.ts`), `tsx` for scripts.

**Spec:** [docs/superpowers/specs/2026-07-26-bestie-of-bestie-design.md](../specs/2026-07-26-bestie-of-bestie-design.md)

## Global Constraints

- **The boundary (spec §5.1):** Bestie knows the product's **surface** (screens, buttons, flows, what a feature does, what it costs). She does **not** know its **engine** (code, database, architecture, security work, other accounts' names or data). Enforced at ingest (this phase) and at generation (Phase 2).
- **Archetype name:** `saas_product` — exact string, used in `config.archetype`.
- **Entity type:** `knowledge_base`. `document_chunks.entity_type` has a CHECK constraint that blocks new values — the Bestie discriminator goes in `metadata.source = 'bestie_kb'`, never in a new entity type.
- **Embedding dimension:** 2000 (`text-embedding-3-large`, Matryoshka-truncated). Do not introduce a 1536-dim path — a dimension mismatch has silently produced zero-chunk ingests in this repo before.
- **Coupons:** Bestie has none. The account carries `config.coupons_disabled: true`.
- **No scan sources.** The account must never be picked up by the daily scan crons.
- **Not the LDRS account.** `de38eac6-d2fb-46a7-ac09-5ec860147ca0` is the agency. Bestie is the product and gets its own row.
- **Path alias:** `@/*` → `./src/*` for all internal imports.
- **Commits:** straight to `main`, stage only the files the task touched.

---

### Task 1: Register the `saas_product` archetype

The RAG retrieval layer keys content priorities off an archetype. Bestie's content is almost
entirely `knowledge_base` — there are no posts, no products, no website scrape — so the default
weights would bury the only content it has.

**Files:**
- Modify: `src/lib/rag/archetypes.ts`
- Test: `tests/unit/bestie-archetype.test.ts`

**Interfaces:**
- Consumes: `AccountArchetype`, `ARCHETYPE_CONFIGS`, `getArchetypeConfig` (existing, `src/lib/rag/archetypes.ts`)
- Produces: `'saas_product'` as a valid `AccountArchetype`; `getArchetypeConfig('saas_product')` returns a config whose `knowledge_base` weight is the highest of all entity types.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/bestie-archetype.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ARCHETYPE_CONFIGS, getArchetypeConfig } from '@/lib/rag/archetypes';

describe('saas_product archetype', () => {
  it('is registered', () => {
    expect(ARCHETYPE_CONFIGS.saas_product).toBeDefined();
  });

  it('ranks knowledge_base above every other entity type', () => {
    const { typeWeights } = getArchetypeConfig('saas_product');
    const kb = typeWeights.knowledge_base ?? 0;
    const others = Object.entries(typeWeights)
      .filter(([type]) => type !== 'knowledge_base')
      .map(([, weight]) => weight ?? 0);

    expect(kb).toBeGreaterThan(0);
    for (const weight of others) expect(kb).toBeGreaterThan(weight);
  });

  it('gives knowledge_base enough room to answer a how-to question', () => {
    // A "where do I click" answer needs the screen entry plus neighbours.
    expect(getArchetypeConfig('saas_product').typeCaps.knowledge_base).toBeGreaterThanOrEqual(10);
  });

  it('still falls back to default for an unknown archetype', () => {
    expect(getArchetypeConfig('not_a_real_archetype')).toEqual(ARCHETYPE_CONFIGS.default);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-archetype.test.ts`
Expected: FAIL — `expected undefined to be defined` on the first test.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/rag/archetypes.ts`, add `'saas_product'` to the `AccountArchetype` union (after `'tech_creator'`):

```typescript
export type AccountArchetype =
  | 'influencer'
  | 'brand'
  | 'service_provider'
  | 'government_ministry'
  | 'media_news'
  | 'local_business'
  | 'tech_creator'
  | 'saas_product'
  | 'default';
```

Then add the config to `ARCHETYPE_CONFIGS`:

```typescript
  /**
   * SaaS product that has no scraped assets of its own (Bestie).
   * Every chunk is hand-authored knowledge_base — product surface and commercial
   * facts. There is no website scrape, no catalog, no Instagram. So knowledge_base
   * carries the whole answer and gets both the top weight and a wide cap: a
   * "where do I click" reply needs the screen's entry plus its neighbours, and a
   * cap of 4 (the influencer default) truncates exactly the part that matters.
   */
  saas_product: {
    typeWeights: {
      knowledge_base: +0.30,
      document: +0.05,
      website: 0,
      post: -0.10,
      transcription: -0.10,
      product: -0.10,
      coupon: -0.20,   // Bestie has none; a stray one must never surface
      partnership: -0.10,
      highlight: -0.10,
    },
    typeCaps: {
      knowledge_base: 12,
      document: 3,
      website: 2,
      post: 0,
      transcription: 0,
      product: 0,
      coupon: 0,
      partnership: 0,
      highlight: 0,
    },
    docCap: 6,
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-archetype.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npm run type-check
git add src/lib/rag/archetypes.ts tests/unit/bestie-archetype.test.ts
git commit -m "feat(rag): saas_product archetype for accounts with no scraped assets"
```

---

### Task 2: The redaction filter

The boundary from spec §5.1 is the product definition, not a nicety. This is its first
enforcement point: content that describes the engine rather than the surface, or that names another
customer, never becomes a chunk.

Pure function, no I/O — the caller supplies the forbidden names it read from the database, which
keeps the rules testable and the function fast.

**Files:**
- Create: `src/lib/bestie/redaction.ts`
- Test: `tests/unit/bestie-redaction.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface RedactionViolation { rule: string; match: string }`
  - `export function findRedactionViolations(text: string, forbiddenNames?: string[]): RedactionViolation[]` — empty array means the text is clean.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/bestie-redaction.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findRedactionViolations } from '@/lib/bestie/redaction';

const clean = (text: string, names?: string[]) =>
  findRedactionViolations(text, names).length === 0;

describe('findRedactionViolations', () => {
  it('passes ordinary product-surface knowledge', () => {
    expect(clean('כדי לשנות את אישיות הבוט: הגדרות הבוט ← לשונית אישיות ← שמור.')).toBe(true);
    expect(clean('Bestie answers your customers on WhatsApp, Instagram and your website.')).toBe(true);
  });

  it('blocks another customer being named', () => {
    const names = ['Argania', 'LA BEAUTÉ', 'Carolina Lemke'];
    expect(clean('Argania uses this feature for their orders.', names)).toBe(false);
    expect(clean('לדוגמה אצל Carolina Lemke יש 200 מוצרים.', names)).toBe(false);
  });

  it('matches forbidden names case-insensitively but not inside a longer word', () => {
    expect(clean('argania is a client', ['Argania'])).toBe(false);
    // Substring inside an unrelated word is not a customer reference.
    expect(clean('The organization chart', ['Arga'])).toBe(true);
  });

  it('blocks infrastructure detail', () => {
    expect(clean('The value is read from process.env.SUPABASE_SERVICE_ROLE_KEY.')).toBe(false);
    expect(clean('See src/lib/rag/ingest.ts for how chunks are written.')).toBe(false);
    expect(clean('We store it in the document_chunks table.')).toBe(false);
    expect(clean('It runs as a Vercel cron via QStash.')).toBe(false);
  });

  it('blocks security-work language', () => {
    expect(clean('This closed an IDOR vulnerability in the profile route.')).toBe(false);
    expect(clean('RLS is disabled on that table.')).toBe(false);
    expect(clean('תוקנה פרצת אבטחה בטוקן.')).toBe(false);
  });

  it('reports every violation it found, not just the first', () => {
    const found = findRedactionViolations(
      'Argania hit an RLS bug in document_chunks.',
      ['Argania']
    );
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.map(v => v.rule)).toContain('forbidden-name');
  });

  it('treats empty and whitespace input as clean', () => {
    expect(clean('')).toBe(true);
    expect(clean('   \n  ')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-redaction.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/redaction`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bestie/redaction.ts`:

```typescript
/**
 * The boundary, enforced at ingest.
 *
 * Bestie knows the product's SURFACE — screens, buttons, flows, what a feature
 * does and what it costs. She does not know its ENGINE — code, database,
 * architecture, security work, or other customers.
 *
 * This runs before text becomes a chunk, because a chunk that exists will
 * eventually be retrieved: a stranger who arrived from a Facebook ad asks an
 * innocent question and gets an answer assembled out of whatever was in the
 * index. Keeping it out of the index is the only reliable control.
 *
 * Pure by design. Customer names are passed in rather than read here, so the
 * rules stay testable and the caller decides how fresh that list needs to be.
 */

export interface RedactionViolation {
  rule: string;
  match: string;
}

/** Infrastructure and implementation detail — the engine, not the surface. */
const INFRA_PATTERNS: Array<[string, RegExp]> = [
  ['env-var',      /\b(?:process\.env\b|[A-Z][A-Z0-9]*_(?:KEY|SECRET|TOKEN|URL|ID)\b)/g],
  ['source-path',  /\b(?:src|scripts|supabase)\/[\w./[\]-]+\.(?:ts|tsx|sql|mjs)\b/g],
  ['db-object',    /\b(?:document_chunks|chatbot_persona|whatsapp_\w+|accounts|service_briefs|instagram_\w+)\s+table\b/gi],
  ['db-object',    /\b(?:document_chunks|whatsapp_cs_sessions|meta_lead_captures|crm_agent_embeddings)\b/g],
  ['platform',     /\b(?:Supabase|Postgres|PostgreSQL|pgvector|Redis|Upstash|QStash|Vercel|Apify)\b/g],
  ['code-shape',   /\b(?:webhook|API endpoint|migration|SQL query|embedding dimension)\b/gi],
];

/** Language that only appears when discussing security work. */
const SECURITY_PATTERNS: Array<[string, RegExp]> = [
  ['security', /\b(?:vulnerability|vulnerabilities|IDOR|CSRF|XSS|SQL injection|RLS|service.role|exploit|CVE)\b/gi],
  ['security', /(?:פרצ(?:ה|ת)\s*אבטחה|חור\s*אבטחה|דליפ(?:ה|ת)\s*(?:מידע|טוקן))/g],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-ish boundaries that also work for Hebrew, where \b is unreliable because
 * Hebrew letters are not \w in some engines. We require the match to be flanked
 * by something that is not a letter or digit in any script.
 */
function nameRegExp(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu');
}

export function findRedactionViolations(
  text: string,
  forbiddenNames: string[] = []
): RedactionViolation[] {
  if (!text || !text.trim()) return [];

  const violations: RedactionViolation[] = [];
  const seen = new Set<string>();

  const record = (rule: string, match: string) => {
    const key = `${rule}::${match.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ rule, match });
  };

  for (const [rule, pattern] of [...INFRA_PATTERNS, ...SECURITY_PATTERNS]) {
    for (const found of text.matchAll(pattern)) record(rule, found[0]);
  }

  for (const name of forbiddenNames) {
    if (!name || name.trim().length < 3) continue; // too short to be a safe signal
    for (const found of text.matchAll(nameRegExp(name.trim()))) {
      record('forbidden-name', found[0]);
    }
  }

  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-redaction.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/redaction.ts tests/unit/bestie-redaction.test.ts
git commit -m "feat(bestie): redaction filter — surface knowledge in, engine detail out"
```

---

### Task 3: Knowledge-file format and parser

Knowledge is markdown with frontmatter so each entry can declare what it is and, for a screen
entry, which route it documents. The parser is deliberately tiny and dependency-free.

**Files:**
- Create: `src/lib/bestie/kb-source.ts`
- Test: `tests/unit/bestie-kb-source.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type KbKind = 'commercial' | 'screen'`
  - `export interface KbEntry { id: string; kind: KbKind; title: string; route?: string; body: string }`
  - `export function parseKbFile(fileName: string, raw: string): KbEntry` — throws `Error` with a message naming the file when required frontmatter is missing.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/bestie-kb-source.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseKbFile } from '@/lib/bestie/kb-source';

const screenFile = `---
kind: screen
title: הגדרות הבוט
route: /influencer/[username]/chatbot-settings
---
כאן מדליקים ומכבים את הבוט בכל ערוץ.

**איך מכבים את הבוט בוואטסאפ:** לשונית ערוצים ← המתג "וואטסאפ פעיל".
`;

const commercialFile = `---
kind: commercial
title: מה בסטי עושה
---
בסטי עונה ללקוחות שלך בוואטסאפ, באינסטגרם ובאתר.
`;

describe('parseKbFile', () => {
  it('parses a screen entry including its route', () => {
    const entry = parseKbFile('chatbot-settings.md', screenFile);
    expect(entry.kind).toBe('screen');
    expect(entry.title).toBe('הגדרות הבוט');
    expect(entry.route).toBe('/influencer/[username]/chatbot-settings');
    expect(entry.id).toBe('chatbot-settings');
    expect(entry.body).toContain('וואטסאפ פעיל');
    expect(entry.body).not.toContain('---');
  });

  it('parses a commercial entry, which has no route', () => {
    const entry = parseKbFile('what-bestie-does.md', commercialFile);
    expect(entry.kind).toBe('commercial');
    expect(entry.route).toBeUndefined();
  });

  it('names the offending file when frontmatter is missing', () => {
    expect(() => parseKbFile('broken.md', 'just a body, no frontmatter'))
      .toThrow(/broken\.md/);
  });

  it('rejects an unknown kind', () => {
    const bad = `---\nkind: nonsense\ntitle: x\n---\nbody\n`;
    expect(() => parseKbFile('bad.md', bad)).toThrow(/kind/);
  });

  it('requires a route on a screen entry', () => {
    const bad = `---\nkind: screen\ntitle: x\n---\nbody\n`;
    expect(() => parseKbFile('bad.md', bad)).toThrow(/route/);
  });

  it('rejects an empty body — a title alone teaches nothing', () => {
    const bad = `---\nkind: commercial\ntitle: x\n---\n\n`;
    expect(() => parseKbFile('bad.md', bad)).toThrow(/body/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-kb-source.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/kb-source`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bestie/kb-source.ts`:

```typescript
/**
 * Bestie's knowledge files: markdown with a small frontmatter block.
 *
 * Two kinds. `commercial` answers "what is Bestie, who is it for, what does it
 * cost". `screen` documents one dashboard screen and MUST declare the route it
 * describes — that route is what lets a later check assert the link Bestie hands
 * a customer still resolves to a page that exists.
 *
 * Parsing is strict and fails loudly with the file name. A knowledge file that
 * silently half-loads becomes a bot that half-knows something, which is worse
 * than one that admits it does not know.
 */

export type KbKind = 'commercial' | 'screen';

export interface KbEntry {
  id: string;
  kind: KbKind;
  title: string;
  route?: string;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function parseKbFile(fileName: string, raw: string): KbEntry {
  const matched = FRONTMATTER.exec(raw);
  if (!matched) {
    throw new Error(`${fileName}: missing frontmatter block (expected --- ... --- at the top)`);
  }

  const meta = parseFrontmatter(matched[1]);
  const body = matched[2].trim();

  const kind = meta.kind as KbKind;
  if (kind !== 'commercial' && kind !== 'screen') {
    throw new Error(`${fileName}: kind must be "commercial" or "screen", got "${meta.kind ?? ''}"`);
  }
  if (!meta.title) throw new Error(`${fileName}: title is required`);
  if (kind === 'screen' && !meta.route) {
    throw new Error(`${fileName}: route is required on a screen entry`);
  }
  if (!body) throw new Error(`${fileName}: body is empty`);

  return {
    id: fileName.replace(/\.md$/, ''),
    kind,
    title: meta.title,
    route: meta.route || undefined,
    body,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-kb-source.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/kb-source.ts tests/unit/bestie-kb-source.test.ts
git commit -m "feat(bestie): strict parser for knowledge-base markdown files"
```

---

### Task 4: Screen inventory from the real route tree

Spec §11 requires that every link Bestie emits resolves. That check needs a list of routes that
actually exist, read from the filesystem rather than from a hand-maintained list which would drift
the moment a screen is added.

**Files:**
- Create: `src/lib/bestie/screen-inventory.ts`
- Test: `tests/unit/bestie-screen-inventory.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Screen { route: string; file: string }`
  - `export function listCustomerScreens(appDir?: string): Screen[]` — defaults to `src/app/influencer`, returns routes like `/influencer/[username]/chatbot-settings`, sorted.
  - `export function findMissingScreens(screens: Screen[], documentedRoutes: string[]): string[]` — routes with no knowledge entry.
  - `export function findDeadRoutes(screens: Screen[], documentedRoutes: string[]): string[]` — documented routes that no longer exist.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/bestie-screen-inventory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listCustomerScreens,
  findMissingScreens,
  findDeadRoutes,
} from '@/lib/bestie/screen-inventory';

function fixtureApp(): string {
  const root = mkdtempSync(join(tmpdir(), 'bestie-screens-'));
  const make = (segments: string) => {
    const dir = join(root, segments);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'page.tsx'), 'export default function P() { return null }');
  };
  make('[username]');
  make('[username]/chatbot-settings');
  make('[username]/documents/upload');
  make('insights');
  // A layout or component file must not be mistaken for a screen.
  writeFileSync(join(root, 'layout.tsx'), 'export default function L() { return null }');
  return root;
}

describe('listCustomerScreens', () => {
  it('finds every page.tsx and nothing else', () => {
    const routes = listCustomerScreens(fixtureApp()).map(s => s.route);
    expect(routes).toEqual([
      '/influencer/[username]',
      '/influencer/[username]/chatbot-settings',
      '/influencer/[username]/documents/upload',
      '/influencer/insights',
    ]);
  });

  it('reads the real app tree by default and includes a known screen', () => {
    const routes = listCustomerScreens().map(s => s.route);
    expect(routes).toContain('/influencer/[username]/chatbot-settings');
    expect(routes.length).toBeGreaterThan(20);
  });
});

describe('drift detection', () => {
  const screens = [
    { route: '/influencer/[username]/settings', file: 'x' },
    { route: '/influencer/[username]/coupons', file: 'y' },
  ];

  it('names screens that have no knowledge entry', () => {
    expect(findMissingScreens(screens, ['/influencer/[username]/settings']))
      .toEqual(['/influencer/[username]/coupons']);
  });

  it('names documented routes that no longer exist', () => {
    expect(findDeadRoutes(screens, ['/influencer/[username]/deleted-screen']))
      .toEqual(['/influencer/[username]/deleted-screen']);
  });

  it('reports nothing when knowledge and routes agree', () => {
    const documented = screens.map(s => s.route);
    expect(findMissingScreens(screens, documented)).toEqual([]);
    expect(findDeadRoutes(screens, documented)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-screen-inventory.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/screen-inventory`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bestie/screen-inventory.ts`:

```typescript
/**
 * The customer dashboard's real screens, read from the route tree.
 *
 * Bestie's whole support value is "go to this screen and press this button", so
 * the set of screens has to come from the filesystem rather than a list someone
 * maintains by hand. A list drifts the day a screen is added; the tree cannot.
 *
 * Used two ways: to find screens with no knowledge entry yet, and to catch
 * knowledge that still points at a screen which has since been deleted.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

export interface Screen {
  route: string;
  file: string;
}

const DEFAULT_APP_DIR = join(process.cwd(), 'src', 'app', 'influencer');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

export function listCustomerScreens(appDir: string = DEFAULT_APP_DIR): Screen[] {
  if (!existsSync(appDir)) return [];

  return walk(appDir)
    .map(file => {
      const relative = file.slice(appDir.length).split(sep).slice(0, -1).filter(Boolean);
      return { route: ['/influencer', ...relative].join('/'), file };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function findMissingScreens(screens: Screen[], documentedRoutes: string[]): string[] {
  const documented = new Set(documentedRoutes);
  return screens.map(s => s.route).filter(route => !documented.has(route));
}

export function findDeadRoutes(screens: Screen[], documentedRoutes: string[]): string[] {
  const real = new Set(screens.map(s => s.route));
  return documentedRoutes.filter(route => !real.has(route));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-screen-inventory.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestie/screen-inventory.ts tests/unit/bestie-screen-inventory.test.ts
git commit -m "feat(bestie): screen inventory read from the route tree, plus drift detection"
```

---

### Task 5: Create the `bestie` account and persona

**Files:**
- Create: `scripts/create-bestie-account.ts`
- Create: `content/bestie-kb/.gitkeep`

**Interfaces:**
- Consumes: `@/lib/supabase` (existing service-role client).
- Produces: an `accounts` row and a `chatbot_persona` row. Writes the resulting account UUID to stdout; later tasks and Phase 2 read it from `config.username = 'bestie'`.

- [ ] **Step 1: Write the script**

Create `scripts/create-bestie-account.ts`:

```typescript
/**
 * Creates the `bestie` account — Bestie's own account, the one it never got.
 *
 * Idempotent: re-running finds the existing row by config.username and updates
 * it rather than creating a second Bestie.
 *
 * Run: npx tsx scripts/create-bestie-account.ts
 */
import { supabase } from '@/lib/supabase';

const USERNAME = 'bestie';

async function main() {
  const { data: existing } = await supabase
    .from('accounts')
    .select('id, config')
    .eq('config->>username', USERNAME)
    .maybeSingle();

  const config = {
    username: USERNAME,
    display_name: 'Bestie',
    archetype: 'saas_product',
    // Bestie sells a product, not discounts. Without this the coupon paths
    // would happily invent one, and an invented coupon is an obligation.
    coupons_disabled: true,
    // Deliberately empty: nothing to scan. This is what keeps the daily scan
    // crons from picking the account up.
    sources: {},
  };

  const accountId = existing
    ? (await supabase.from('accounts').update({ config }).eq('id', existing.id).select('id').single()).data!.id
    : (await supabase.from('accounts').insert({
        type: 'creator',
        status: 'active',
        language: 'he',
        timezone: 'Asia/Jerusalem',
        config,
      }).select('id').single()).data!.id;

  await supabase.from('chatbot_persona').upsert({
    account_id: accountId,
    name: 'בסטי',
    language: 'he',
    tone: 'ידידותית, ישירה, בלי פלצנות',
    bio: 'בסטי — עוזרת AI שעונה ללקוחות של עסקים בוואטסאפ, באינסטגרם ובאתר.',
    description:
      'אני בסטי. אני עונה על שאלות על בסטי עצמה: מה היא עושה, למי היא מתאימה, ' +
      'כמה היא עולה, ואיך משתמשים בה — באיזה מסך ואיזה כפתור.',
    boundaries:
      'עונה על בסטי בלבד. לא על לקוחות אחרים, לא על איך המערכת בנויה מבפנים. ' +
      'מה שלא ידוע — אומרת שלא יודעת ומציעה לחבר לאדם. לא ממציאה מחירים.',
    response_style: 'קצר, קונקרטי, עם הפניה מדויקת למסך ולכפתור כשרלוונטי.',
  }, { onConflict: 'account_id' });

  console.log(accountId);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/create-bestie-account.ts`
Expected: a UUID on stdout, no error.

- [ ] **Step 3: Verify idempotency**

Run it a second time. Expected: **the same UUID**, not a new one.

Then confirm exactly one row exists:

```bash
npx tsx -e "import {supabase} from './src/lib/supabase'; supabase.from('accounts').select('id,config').eq('config->>username','bestie').then(r=>console.log(r.data))"
```

Expected: exactly one row, `archetype: 'saas_product'`, `coupons_disabled: true`.

- [ ] **Step 4: Commit**

```bash
mkdir -p content/bestie-kb && touch content/bestie-kb/.gitkeep
git add scripts/create-bestie-account.ts content/bestie-kb/.gitkeep
git commit -m "feat(bestie): create the bestie account and its hand-authored persona"
```

---

### Task 6: The ingest script

Reads `content/bestie-kb/*.md`, runs every entry through the redaction filter, and ingests what
passes. A violation aborts the whole run rather than skipping the file — a partial knowledge base
that nobody noticed is exactly the failure this filter exists to prevent.

**Files:**
- Create: `src/lib/bestie/kb-ingest.ts`
- Create: `scripts/bestie-kb.ts`
- Modify: `package.json` (add the `bestie:kb` script)
- Test: `tests/unit/bestie-kb-ingest.test.ts`

**Interfaces:**
- Consumes: `parseKbFile`, `KbEntry` (Task 3); `findRedactionViolations` (Task 2); `ingestDocument` from `@/lib/rag` (existing).
- Produces:
  - `export interface KbIngestPlan { entries: KbEntry[]; blocked: Array<{ id: string; violations: RedactionViolation[] }> }`
  - `export function planKbIngest(files: Array<{ name: string; raw: string }>, forbiddenNames: string[]): KbIngestPlan`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/bestie-kb-ingest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { planKbIngest } from '@/lib/bestie/kb-ingest';

const ok = {
  name: 'chatbot-settings.md',
  raw: `---\nkind: screen\ntitle: הגדרות הבוט\nroute: /influencer/[username]/chatbot-settings\n---\nלשונית ערוצים ← המתג "וואטסאפ פעיל".\n`,
};

const leaky = {
  name: 'internals.md',
  raw: `---\nkind: commercial\ntitle: איך זה עובד\n---\nהנתונים נשמרים ב-document_chunks.\n`,
};

const namesAnotherCustomer = {
  name: 'example.md',
  raw: `---\nkind: commercial\ntitle: דוגמה\n---\nArgania משתמשים בזה.\n`,
};

describe('planKbIngest', () => {
  it('passes clean entries through', () => {
    const plan = planKbIngest([ok], []);
    expect(plan.entries.map(e => e.id)).toEqual(['chatbot-settings']);
    expect(plan.blocked).toEqual([]);
  });

  it('blocks an entry that leaks infrastructure', () => {
    const plan = planKbIngest([ok, leaky], []);
    expect(plan.entries.map(e => e.id)).toEqual(['chatbot-settings']);
    expect(plan.blocked.map(b => b.id)).toEqual(['internals']);
    expect(plan.blocked[0].violations.length).toBeGreaterThan(0);
  });

  it('blocks an entry naming another customer', () => {
    const plan = planKbIngest([namesAnotherCustomer], ['Argania']);
    expect(plan.entries).toEqual([]);
    expect(plan.blocked.map(b => b.id)).toEqual(['example']);
  });

  it('checks the title as well as the body', () => {
    const titled = {
      name: 'x.md',
      raw: `---\nkind: commercial\ntitle: Argania onboarding\n---\nתוכן תמים לגמרי.\n`,
    };
    expect(planKbIngest([titled], ['Argania']).blocked.map(b => b.id)).toEqual(['x']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/bestie-kb-ingest.test.ts`
Expected: FAIL — cannot resolve `@/lib/bestie/kb-ingest`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bestie/kb-ingest.ts`:

```typescript
/**
 * Decide what may become a chunk.
 *
 * Split from the script so the decision is unit-testable without touching the
 * database or the embedding API. The script does I/O; this decides.
 */
import { parseKbFile, type KbEntry } from './kb-source';
import { findRedactionViolations, type RedactionViolation } from './redaction';

export interface KbIngestPlan {
  entries: KbEntry[];
  blocked: Array<{ id: string; violations: RedactionViolation[] }>;
}

export function planKbIngest(
  files: Array<{ name: string; raw: string }>,
  forbiddenNames: string[]
): KbIngestPlan {
  const plan: KbIngestPlan = { entries: [], blocked: [] };

  for (const file of files) {
    const entry = parseKbFile(file.name, file.raw);
    // Title as well as body: a heading is retrieved and shown like any other text.
    const violations = findRedactionViolations(
      `${entry.title}\n${entry.body}`,
      forbiddenNames
    );
    if (violations.length) plan.blocked.push({ id: entry.id, violations });
    else plan.entries.push(entry);
  }

  return plan;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/bestie-kb-ingest.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write the script**

Create `scripts/bestie-kb.ts`:

```typescript
/**
 * Rebuild Bestie's knowledge base from content/bestie-kb/*.md.
 *
 * Manual by design (spec §3.1): nothing runs this for you. If the dashboard UI
 * changes and this is not run, Bestie will keep giving directions to a screen
 * that moved — and will sound just as certain as when it is right.
 *
 * Run: npm run bestie:kb          (add --dry-run to check without writing)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { supabase } from '@/lib/supabase';
import { ingestDocument } from '@/lib/rag';
import { planKbIngest } from '@/lib/bestie/kb-ingest';
import { listCustomerScreens, findMissingScreens, findDeadRoutes } from '@/lib/bestie/screen-inventory';

const KB_DIR = join(process.cwd(), 'content', 'bestie-kb');
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { data: account } = await supabase
    .from('accounts').select('id').eq('config->>username', 'bestie').single();
  if (!account) throw new Error('bestie account not found — run scripts/create-bestie-account.ts first');

  // Every other account's display name is forbidden vocabulary for Bestie.
  const { data: others } = await supabase.from('accounts').select('config').neq('id', account.id);
  const forbiddenNames = (others ?? [])
    .flatMap(row => [(row.config as any)?.display_name, (row.config as any)?.username])
    .filter((name): name is string => typeof name === 'string' && name.trim().length >= 3);

  const files = readdirSync(KB_DIR)
    .filter(name => name.endsWith('.md'))
    .map(name => ({ name, raw: readFileSync(join(KB_DIR, name), 'utf8') }));

  const plan = planKbIngest(files, forbiddenNames);

  if (plan.blocked.length) {
    console.error('BLOCKED — these files cross the boundary and nothing was ingested:');
    for (const b of plan.blocked) {
      console.error(`  ${b.id}: ${b.violations.map(v => `${v.rule}("${v.match}")`).join(', ')}`);
    }
    process.exit(1);
  }

  // Drift: what the customer can see but Bestie cannot explain, and the reverse.
  const screens = listCustomerScreens();
  const documented = plan.entries.filter(e => e.kind === 'screen').map(e => e.route!);
  const missing = findMissingScreens(screens, documented);
  const dead = findDeadRoutes(screens, documented);
  if (missing.length) console.warn(`⚠ ${missing.length} screens with no entry:\n  ${missing.join('\n  ')}`);
  if (dead.length) console.error(`✖ ${dead.length} entries point at screens that no longer exist:\n  ${dead.join('\n  ')}`);

  if (dryRun) {
    console.log(`dry run — ${plan.entries.length} entries would be ingested`);
    return;
  }

  // Replace wholesale: the markdown is the source of truth, so a deleted file
  // must take its chunks with it rather than lingering in the index.
  await supabase.from('document_chunks')
    .delete().eq('account_id', account.id).eq('metadata->>source', 'bestie_kb');

  for (const entry of plan.entries) {
    await ingestDocument({
      accountId: account.id,
      entityType: 'knowledge_base',
      sourceId: entry.id,
      title: entry.title,
      text: entry.body,
      metadata: { source: 'bestie_kb', kind: entry.kind, route: entry.route ?? null },
    });
  }

  console.log(`ingested ${plan.entries.length} entries`);
  if (dead.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: Add the npm script**

In `package.json`, add to `"scripts"` after `"check:env"`:

```json
    "bestie:kb": "npx tsx scripts/bestie-kb.ts",
```

- [ ] **Step 7: Verify the script runs on an empty knowledge base**

Run: `npm run bestie:kb -- --dry-run`
Expected: `dry run — 0 entries would be ingested`, plus a warning listing all 25 screens as
undocumented. Both are correct at this point — Task 7 fills them in.

- [ ] **Step 8: Commit**

```bash
git add src/lib/bestie/kb-ingest.ts scripts/bestie-kb.ts package.json tests/unit/bestie-kb-ingest.test.ts
git commit -m "feat(bestie): knowledge-base ingest with boundary enforcement and drift reporting"
```

---

### Task 7: Seed the knowledge base

**Files:**
- Create: `content/bestie-kb/*.md` — commercial entries plus one per customer screen.

- [ ] **Step 1: List the screens that need an entry**

Run: `npm run bestie:kb -- --dry-run`

Copy the warning's route list. That is the work queue; every route needs one file.

- [ ] **Step 2: Write the commercial entries**

Create these files under `content/bestie-kb/`, each `kind: commercial`:
`what-bestie-does.md`, `who-its-for.md`, `pricing.md`, `what-you-need-to-start.md`,
`channels.md`, `what-results-to-expect.md`, `common-objections.md`.

Format (`what-bestie-does.md` shown in full; the rest follow the same shape):

```markdown
---
kind: commercial
title: מה בסטי עושה
---
בסטי היא עוזרת AI שעונה ללקוחות שלך בוואטסאפ, באינסטגרם ובאתר — 24/7, בשפה שלך,
מתוך הידע האמיתי של העסק שלך.

היא לומדת את העסק מהאתר ומהרשתות, ומשם עונה על שאלות, ממליצה על מוצרים, ומעבירה
לאדם כשצריך.
```

**Pricing is the one to be careful with.** Write only numbers that are actually true and current.
Anything Bestie states as a price becomes a commitment someone has to honour — that is why §6.1
of the spec forbids guessing. If a number is uncertain, leave it out entirely; the bot will
correctly say a person will confirm.

- [ ] **Step 3: Write one entry per screen**

For each route from Step 1, create a file named after the last route segment
(`chatbot-settings.md`, `conversations.md`, …). Read the matching catalog file in
`src/lib/i18n/dashboard/` for the real section and button labels — quoting a label that does not
exist on screen is the failure mode this whole phase is built to avoid.

Template:

```markdown
---
kind: screen
title: הגדרות הבוט
route: /influencer/[username]/chatbot-settings
---
כאן מדליקים ומכבים את הבוט בכל ערוץ, וקובעים איך הוא מתנהג.

**מתי נכנסים לכאן:** כשרוצים להשתיק את הבוט, לחבר ערוץ חדש, או לשנות את הודעת הפתיחה.

**איך מכבים את הבוט בוואטסאפ:** לשונית "ערוצים" ← המתג "וואטסאפ פעיל" ← לכבות. נשמר מיד.

**אם המתג לא זמין:** הערוץ עדיין לא חובר. קודם מחברים אותו במסך ההגדרות.
```

- [ ] **Step 4: Verify nothing crosses the boundary**

Run: `npm run bestie:kb -- --dry-run`

Expected: no `BLOCKED` output, and the undocumented-screens warning is gone. If a file is blocked,
the message names the file and the exact match — rewrite that sentence in customer language rather
than weakening the filter.

- [ ] **Step 5: Ingest for real**

Run: `npm run bestie:kb`
Expected: `ingested N entries`, where N is the number of markdown files.

- [ ] **Step 6: Verify the chunks landed**

```bash
npx tsx -e "import {supabase} from './src/lib/supabase'; supabase.from('accounts').select('id').eq('config->>username','bestie').single().then(async ({data}) => { const {count} = await supabase.from('document_chunks').select('*',{count:'exact',head:true}).eq('account_id',data.id).eq('metadata->>source','bestie_kb'); console.log('chunks:', count); })"
```

Expected: a count greater than the number of files (each entry chunks into one or more).
**A count of 0 means the embedding dimension is wrong** — check that `EMBEDDING_DIMENSIONS` is
2000, not 1536.

- [ ] **Step 7: Commit**

```bash
git add content/bestie-kb/
git commit -m "content(bestie): seed knowledge base — commercial facts and every customer screen"
```

---

### Task 8: End-to-end retrieval check

Proves the phase actually delivered something: a real question retrieves the right screen entry.

**Files:**
- Test: `tests/unit/bestie-kb-retrieval.test.ts`

**Interfaces:**
- Consumes: `retrieveContext` from `@/lib/rag` (existing), the seeded knowledge from Task 7.

- [ ] **Step 1: Write the test**

Create `tests/unit/bestie-kb-retrieval.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { supabase } from '@/lib/supabase';
import { retrieveContext } from '@/lib/rag';

// Hits the real database and embedding API — this is the phase's acceptance
// check, not a unit test. Skipped when credentials are absent so CI stays green.
const live = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.OPENAI_API_KEY;

describe.skipIf(!live)('bestie knowledge retrieval', () => {
  it('answers a "where do I click" question with the right screen', async () => {
    const { data: account } = await supabase
      .from('accounts').select('id').eq('config->>username', 'bestie').single();

    const result = await retrieveContext({
      accountId: account!.id,
      query: 'איך מכבים את הבוט בוואטסאפ?',
    } as any);

    const text = JSON.stringify(result);
    expect(text).toContain('chatbot-settings');
  }, 30_000);
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/unit/bestie-kb-retrieval.test.ts`
Expected: PASS. If it retrieves the wrong screen, the screen entry needs the words a real customer
would use — customers ask "לכבות את הבוט", not "לנטרל את מודול השיחה".

- [ ] **Step 3: Run the whole suite**

Run: `npm run test -- --run`
Expected: no new failures.

- [ ] **Step 4: Type-check and commit**

```bash
npm run type-check
git add tests/unit/bestie-kb-retrieval.test.ts
git commit -m "test(bestie): end-to-end check that a real question retrieves the right screen"
```

---

## Self-Review

**Spec coverage (§ by §):**

| Spec section | Task |
|---|---|
| §4 The `bestie` account — archetype, no scan sources, coupons off | 1, 5 |
| §4 `chatbot_persona` authored by hand | 5 |
| §5.1 The boundary, enforced at ingest | 2, 6 |
| §5.1 The boundary, enforced at generation | **Phase 2** — system prompt |
| §5.2 Two bodies of knowledge, `metadata.source='bestie_kb'` | 3, 6, 7 |
| §5.3 Spine from the i18n catalog; `npm run bestie:kb` | 4, 6, 7 |
| §9 Data model — account, persona, chunks | 1, 5, 6 |
| §11.2 Every emitted link resolves | 4 (`findDeadRoutes`), enforced on emission in Phase 3 |
| §11.3 The boundary holds | 2, 6 |
| §13 Embedding dimension is 2000 | Global Constraints; verified in Task 7 Step 6 |

Deliberately **not** in this phase, and correctly so: the brain (§6), Surface A (§7), Surface B
(§8), and the acceptance items that depend on them (§11.1, §11.4, §11.5, §11.6).

**Type consistency:** `KbEntry` (Task 3) is consumed unchanged by `planKbIngest` (Task 6).
`RedactionViolation` (Task 2) is re-exported through `KbIngestPlan.blocked`. `Screen` (Task 4)
feeds `findMissingScreens` / `findDeadRoutes`, both used in Task 6's script. `listCustomerScreens`
is called with no argument in the script and with a fixture path in tests — the parameter is
optional in the signature.

**One known rough edge:** Task 8 calls `retrieveContext` with an `as any` cast because its exact
input type was not verified while writing this plan. The implementer should open
`src/lib/rag/retrieve.ts`, use the real type, and drop the cast.

---

## What Phase 2 will need from this phase

- The account UUID, resolved by `config.username = 'bestie'`.
- `findRedactionViolations` — reused as the generation-side guard.
- `listCustomerScreens` — reused by Surface B's `route_to_screen` to assert links resolve.
- Seeded knowledge, since Surface A's whole job is answering from it.
