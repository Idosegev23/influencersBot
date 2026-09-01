# Email Deliverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop sending mail to addresses that cannot receive it, by verifying an address exists at capture time and by listening to the bounces we already receive.

**Architecture:** One new verification module (`email-deliverability.ts`, pure logic + a bounded MX probe) and one new persistence module (`email-deliverability-store.ts`, an address-keyed table). Existing sites call into them: the widget forms, `/api/support`, the CS `remember_contact` tool, the admin escalation-recipients form, the support inbox render, and `inbound-email.ts` where bounces already arrive and are currently discarded.

**Tech Stack:** Next.js 16 App Router (Node runtime), TypeScript, Supabase, Upstash Redis (`src/lib/redis.ts`), Node `dns/promises`, Vitest, vanilla ES5 for `public/widget.js`.

**Spec:** `docs/superpowers/specs/2026-08-31-email-deliverability-design.md` — read it first. The tables in §2 are measured production data and are the justification for every layer here.

## Global Constraints

- **An inconclusive DNS result must never block.** Only `ENOTFOUND` / `ENODATA` / an empty MX array is a "no". Timeout, `SERVFAIL`, and every other error map to `unknown`, which every call site treats as `ok`. (Spec §3 D6, §2.3 Trap B: `windowslive.com` took 52 s to time out and is a real domain.)
- **Only `undeliverable` ever blocks. `typo` never does.** (Spec §3 D2a.)
- **A suggestion may only be produced from `EXPLICIT_SQUAT_MAP`, or from edit distance *after* MX has already returned `no_mx`.** Never from edit distance alone — `email.com`, `mail.com` and `ymail.com` are real providers one edit from `gmail.com`. (Spec §4.1.)
- **Store what the user typed, verbatim.** Never overwrite `customer_email` with a normalized or corrected value. "junk value" and "never gave one" must not look the same — the existing rule at `src/app/api/support/route.ts:74-77`.
- **MX probe timeout: 1500 ms.** Redis TTL: 7 days for `has_mx`, 1 day for `no_mx`.
- `public/widget.js` is **ES5, no build step**: `var`, `function`, no arrow functions, no template literals, no `const`/`let`.
- Run tests with `npx vitest run <file>`. `npm run test` is watch mode.
- Migration number: **085**. Latest existing is `084_content_insights.sql`.
- Commit to `main` and push. Stage only the files each task touches.

---

### Task 1: Verification core — normalization and repair map (L0 + L1)

Pure, synchronous, no network, no imports beyond `realEmailOrNull`. This is the layer that closes the invisible-bidi class outright and is the only layer that catches a *live* typosquat.

**Files:**
- Create: `src/lib/support/email-deliverability.ts`
- Test: `tests/unit/email-deliverability.test.ts`

**Interfaces:**
- Consumes: `realEmailOrNull` from `@/lib/support/contact` (existing, unchanged).
- Produces:
  - `export type EmailVerdict` (the four-variant union below)
  - `export function normalizeEmail(raw: unknown): string | null`
  - `export function domainOf(email: string): string`
  - `export function suggestDomain(domain: string, opts?: { mxKnownDead?: boolean }): string | null`
  - `export const EXPLICIT_SQUAT_MAP: Record<string, string>`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/email-deliverability.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeEmail, domainOf, suggestDomain } from '@/lib/support/email-deliverability';

describe('normalizeEmail (L0)', () => {
  it('strips the invisible bidi mark that Hebrew keyboards append', () => {
    // Three real production addresses carried U+202C. The regex passed; DNS did not.
    expect(normalizeEmail('alice2692@gmail.com\u202C')).toBe('alice2692@gmail.com');
  });

  it('strips a leading RTL embedding mark too', () => {
    expect(normalizeEmail('\u202Balice2692@gmail.com')).toBe('alice2692@gmail.com');
  });

  it('leaves an already-clean address byte-identical', () => {
    // Companion to the assertions above: proves the stripper is not simply mangling everything.
    expect(normalizeEmail('alice2692@gmail.com')).toBe('alice2692@gmail.com');
  });

  it('lowercases and trims', () => {
    expect(normalizeEmail('  Lili.Levy42@GMAIL.com  ')).toBe('lili.levy42@gmail.com');
  });

  it('drops a trailing dot', () => {
    expect(normalizeEmail('a@gmail.com.')).toBe('a@gmail.com');
  });

  it('returns null for a non-address', () => {
    expect(normalizeEmail('לא רוצה')).toBeNull();
    expect(normalizeEmail('0545989978')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('domainOf', () => {
  it('returns the part after the last @', () => {
    expect(domainOf('lililevy42@gmail.com.il')).toBe('gmail.com.il');
  });
});

describe('suggestDomain (L1) — map hits', () => {
  it('repairs the address from the incident', () => {
    expect(suggestDomain('gmail.com.il')).toBe('gmail.com');
  });

  it('repairs live typosquats that HAVE valid MX', () => {
    // Measured: gamil.com -> mail.gamil.com, gnail.com -> mx2.oweb.cn (CN).
    // MX can never catch these; only the map can.
    expect(suggestDomain('gamil.com')).toBe('gmail.com');
    expect(suggestDomain('gnail.com')).toBe('gmail.com');
    expect(suggestDomain('gmail.co.il')).toBe('gmail.com');
    expect(suggestDomain('gmail.co')).toBe('gmail.com');
  });

  it('repairs the dead-domain typos', () => {
    expect(suggestDomain('gmail.con')).toBe('gmail.com');
    expect(suggestDomain('gmai.com')).toBe('gmail.com');
    expect(suggestDomain('gmail.cim')).toBe('gmail.com');
    expect(suggestDomain('gmali.com')).toBe('gmail.com');
  });
});

describe('suggestDomain (L1) — the false-positive guard', () => {
  // This block is the whole reason suggestDomain takes an opts argument. Spec review
  // measured these at Levenshtein 1 from gmail.com, and all three are real providers.
  it.each(['email.com', 'mail.com', 'ymail.com'])(
    'never suggests for the real provider %s when MX is unknown',
    (domain) => {
      expect(suggestDomain(domain)).toBeNull();
    },
  );

  it('never suggests for a domain that is itself a known provider', () => {
    expect(suggestDomain('gmail.com')).toBeNull();
    expect(suggestDomain('walla.co.il')).toBeNull();
  });

  it('never suggests for the lookalikes that are genuinely Microsoft', () => {
    // outlook.co.il -> eur.olc.protection.outlook.com; windowslive.com is Microsoft legacy.
    expect(suggestDomain('outlook.co.il')).toBeNull();
    expect(suggestDomain('windowslive.com')).toBeNull();
  });

  it.each([
    'jerusalem.muni.il', 'sviva.gov.il', 'akko.muni.il', 'egged.co.il', 'clalit.org.il',
    'zutacore.com', 'bmc.com', 'orian.com', 'haviv-adv.co.il', 'hfs.school',
    'elishevaph.org', 'mvav.org', 'vatel.co.il', 'ern.co.il', 'kerencohen.co.il',
    'shir-ben.co.il', 'ay-adir.co.il', 'dalitkatzir.com', 'tzlev.com',
    'ldrsgroup.com', 'triroars.co.il',
  ])('never suggests for the real corporate domain %s', (domain) => {
    // Every one of these is a genuine correspondent in support_requests (spec §2.3 Trap A).
    // An allowlist or a naive distance check rejects all 21.
    expect(suggestDomain(domain)).toBeNull();
  });
});

describe('suggestDomain (L1) — distance repair, only once MX has ruled', () => {
  it('proposes the nearest provider for a domain MX proved dead', () => {
    expect(suggestDomain('gmial.com', { mxKnownDead: true })).toBe('gmail.com');
    expect(suggestDomain('wallla.co.il', { mxKnownDead: true })).toBe('walla.co.il');
  });

  it('still refuses when nothing is within distance 2', () => {
    expect(suggestDomain('zev-ev.com', { mxKnownDead: true })).toBeNull();
  });

  it('does NOT propose for a live provider even when told MX is dead', () => {
    // Defence in depth: the provider guard runs before the distance check.
    expect(suggestDomain('mail.com', { mxKnownDead: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/unit/email-deliverability.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/support/email-deliverability"`.

Do not proceed until you have seen this fail. A test file that cannot import its subject passes nothing.

- [ ] **Step 3: Implement L0 + L1**

Create `src/lib/support/email-deliverability.ts`:

```ts
/**
 * Does this address exist, and can we actually deliver to it?
 *
 * `realEmailOrNull` in ./contact answers a different question — is this the SHAPE of an
 * address — and it must keep answering only that, because a dozen synchronous callers
 * depend on it. This module sits above it.
 *
 * The distinction is the whole point. `lililevy42@gmail.com.il` is shape-perfect: `.il` is
 * a real TLD, and every regex in this repo accepts it. What was wrong is that the domain
 * does not exist. No regex can see that.
 *
 * Four failure classes were measured in production (spec §2.2), and no single check covers
 * more than one of them:
 *
 *   invisible bidi suffix   gmail.com<U+202C>            -> normalizeEmail
 *   live typosquat          gamil.com, gnail.com          -> EXPLICIT_SQUAT_MAP  (these HAVE MX)
 *   dead domain             gmail.com.il, gmail.con       -> probeMx
 *   good domain, bad inbox  (invisible until it bounces)  -> inbound-email.ts
 */

import { realEmailOrNull } from '@/lib/support/contact';

export type EmailVerdict =
  | { status: 'ok'; email: string }
  | { status: 'typo'; email: string; suggestion: string }
  | { status: 'undeliverable'; email: string; reason: 'no_mx' | 'nxdomain' | 'bounced'; suggestion?: string }
  | { status: 'unknown'; email: string };

// ── L0: normalization ──────────────────────────────────────────────────────

/**
 * Bidi and zero-width controls. A Hebrew keyboard, and Hebrew text pasted around a
 * Latin address, leave these behind invisibly: U+202C (pop directional formatting)
 * closed three real production addresses. The address LOOKS right in every UI, passes
 * every regex, and fails at DNS with a domain nobody can see is different.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(INVISIBLE, '').trim().replace(/\.+$/, '');
  return realEmailOrNull(cleaned);
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

// ── L1: repair ─────────────────────────────────────────────────────────────

/**
 * Consumer mail providers. Two jobs: they are the targets of the distance check, AND
 * they are the suppression list — a domain that IS one of these is never "corrected".
 */
const PROVIDERS = [
  'gmail.com', 'googlemail.com', 'walla.co.il', 'walla.com', 'hotmail.com', 'hotmail.co.il',
  'outlook.com', 'outlook.co.il', 'live.com', 'msn.com', 'windowslive.com', 'yahoo.com',
  'yahoo.co.il', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com',
  'mail.com', 'email.com', 'protonmail.com', 'proton.me', 'zoho.com', 'yandex.com',
  '012.net.il', 'bezeqint.net', 'netvision.net.il', 'zahav.net.il', 'inter.net.il',
  'barak.net.il', 'nana.co.il', 'nana10.co.il', 'actcom.net.il', 'trendline.co.il',
];
const PROVIDER_SET = new Set(PROVIDERS);

/**
 * Domains observed in production that are dead, or are live lookalikes.
 *
 * Every entry was verified before being added: either MX returned nothing, or the domain
 * resolves somewhere that is provably not the provider it imitates. `gamil.com` serves its
 * own MX and `gnail.com` points at a Chinese host — both deliver mail, so MX will never
 * flag them, and the map is the only thing standing between a shopper and a stranger's
 * mailbox. Never add an entry without checking MX first (spec §2.3 Trap C): `outlook.co.il`
 * and `windowslive.com` look exactly like typos and are genuinely Microsoft.
 */
export const EXPLICIT_SQUAT_MAP: Record<string, string> = {
  // gmail — dead
  'gmail.con': 'gmail.com', 'gmail.cim': 'gmail.com', 'gmail.vom': 'gmail.com',
  'gmail.comm': 'gmail.com', 'gmail.coms': 'gmail.com', 'gmail.come': 'gmail.com',
  'gmail.comn': 'gmail.com', 'gmail.comt': 'gmail.com', 'gmail.coml': 'gmail.com',
  'gmail.comtt': 'gmail.com', 'gmail.comdd': 'gmail.com', 'gmail.comcom': 'gmail.com',
  'gmail.com.com': 'gmail.com', 'gmail.com.il': 'gmail.com', 'gmail.co.m': 'gmail.com',
  'gmail.c': 'gmail.com', 'gmail.frcom': 'gmail.com', 'gmail': 'gmail.com',
  'gmai.com': 'gmail.com', 'gmai.con': 'gmail.com', 'gmal.com': 'gmail.com',
  'gmali.com': 'gmail.com', 'gmaii.com': 'gmail.com', 'gmial.com': 'gmail.com',
  'ail.com': 'gmail.com',
  // gmail — live lookalikes, MX-verified as NOT Google
  'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.co.il': 'gmail.com',
  // others
  'yahoo.con': 'yahoo.com', 'walla.com.il': 'walla.co.il', 'walla.co': 'walla.co.il',
  'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
};

/** Levenshtein, capped — we only ever care whether the distance is ≤ 2. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * The correct spelling of `domain`, or null.
 *
 * The ordering here is load-bearing and was corrected during spec review. Matching by edit
 * distance alone is UNSAFE: email.com, mail.com and ymail.com are each one edit from
 * gmail.com and all three are real, deliverable providers. That detector tells a mail.com
 * customer she mistyped her own address.
 *
 * So the distance check never DECIDES a domain is wrong — it only proposes a repair for a
 * domain something else already proved wrong. Pass `mxKnownDead` only after probeMx has
 * returned 'no_mx'.
 */
export function suggestDomain(domain: string, opts?: { mxKnownDead?: boolean }): string | null {
  const d = domain.toLowerCase();
  // A real provider is never "corrected", whatever else we think we know about it.
  if (PROVIDER_SET.has(d)) return null;

  const mapped = EXPLICIT_SQUAT_MAP[d];
  if (mapped) return mapped;

  if (!opts?.mxKnownDead) return null;

  let best: string | null = null;
  let bestDist = 3;
  for (const p of PROVIDERS) {
    const dist = distance(d, p);
    if (dist < bestDist) { bestDist = dist; best = p; }
  }
  return best;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/email-deliverability.test.ts`
Expected: PASS, all cases.

If the 21-corporate-domain block fails, do **not** add those domains to a skip list — that would rebuild the allowlist the spec forbids. The bug is in the guard ordering.

- [ ] **Step 5: Commit**

```bash
git add src/lib/support/email-deliverability.ts tests/unit/email-deliverability.test.ts
git commit -m "feat(email): normalize invisible bidi marks and repair known-dead domains"
```

---

### Task 2: Bounded MX probe with Redis cache (L2)

**Files:**
- Modify: `src/lib/support/email-deliverability.ts` (append)
- Test: `tests/unit/email-deliverability-mx.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`, `domainOf`, `suggestDomain`, `EmailVerdict` (Task 1); `redisGet`, `redisSet` from `@/lib/redis`.
- Produces:
  - `export async function probeMx(domain: string): Promise<'has_mx' | 'no_mx' | 'unknown'>`
  - `export async function verifyEmail(raw: unknown): Promise<EmailVerdict>`
  - `export function verifyEmailSync(raw: unknown): EmailVerdict` — L0+L1 only, for callers that cannot await or have no network.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/email-deliverability-mx.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable DNS. Each test sets what resolveMx does for the domain under test.
const mxBehaviour = new Map<string, 'ok' | 'nxdomain' | 'nodata' | 'timeout' | 'servfail'>();

vi.mock('node:dns/promises', () => ({
  default: {
    resolveMx: async (domain: string) => {
      const b = mxBehaviour.get(domain) || 'ok';
      if (b === 'ok') return [{ exchange: 'mx.example.com', priority: 10 }];
      if (b === 'nodata') return [];
      if (b === 'timeout') return new Promise(() => {});           // never settles
      const err: any = new Error(b);
      err.code = b === 'nxdomain' ? 'ENOTFOUND' : 'ESERVFAIL';
      throw err;
    },
  },
}));

const cache = new Map<string, unknown>();
vi.mock('@/lib/redis', () => ({
  redisGet: async (k: string) => (cache.has(k) ? cache.get(k) : null),
  redisSet: async (k: string, v: unknown) => { cache.set(k, v); return true; },
}));

import { probeMx, verifyEmail, verifyEmailSync } from '@/lib/support/email-deliverability';

beforeEach(() => { mxBehaviour.clear(); cache.clear(); });

describe('probeMx', () => {
  it('reports no_mx for NXDOMAIN', async () => {
    mxBehaviour.set('gmail.com.il', 'nxdomain');
    expect(await probeMx('gmail.com.il')).toBe('no_mx');
  });

  it('reports no_mx for an empty MX set', async () => {
    mxBehaviour.set('ail.com', 'nodata');
    expect(await probeMx('ail.com')).toBe('no_mx');
  });

  it('reports has_mx for a domain that answers', async () => {
    mxBehaviour.set('jerusalem.muni.il', 'ok');
    expect(await probeMx('jerusalem.muni.il')).toBe('has_mx');
  });

  it('reports unknown — not no_mx — when the lookup times out', async () => {
    // windowslive.com and clalit.org.il are real domains that timed out when measured.
    // Mapping a timeout to no_mx rejects real customers.
    mxBehaviour.set('windowslive.com', 'timeout');
    expect(await probeMx('windowslive.com')).toBe('unknown');
  });

  it('returns from the timeout in well under the 1.5s cap plus slack', async () => {
    mxBehaviour.set('slow.example', 'timeout');
    const started = Date.now();
    await probeMx('slow.example');
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('reports unknown for SERVFAIL', async () => {
    mxBehaviour.set('flaky.example', 'servfail');
    expect(await probeMx('flaky.example')).toBe('unknown');
  });

  it('serves a repeat lookup from cache without touching DNS again', async () => {
    mxBehaviour.set('gmail.com', 'ok');
    expect(await probeMx('gmail.com')).toBe('has_mx');
    mxBehaviour.set('gmail.com', 'nxdomain');   // DNS now lies; cache should win
    expect(await probeMx('gmail.com')).toBe('has_mx');
  });

  it('does not cache an unknown result', async () => {
    mxBehaviour.set('flaky.example', 'timeout');
    expect(await probeMx('flaky.example')).toBe('unknown');
    mxBehaviour.set('flaky.example', 'ok');
    expect(await probeMx('flaky.example')).toBe('has_mx');
  });
});

describe('verifyEmail', () => {
  it('returns undeliverable WITH a suggestion for the incident address', async () => {
    mxBehaviour.set('gmail.com.il', 'nxdomain');
    const v = await verifyEmail('lililevy42@gmail.com.il');
    expect(v.status).toBe('undeliverable');
    expect(v).toMatchObject({ reason: 'no_mx', suggestion: 'gmail.com' });
  });

  it('returns typo — NOT undeliverable — for a squat that still has MX', async () => {
    mxBehaviour.set('gamil.com', 'ok');
    const v = await verifyEmail('dana@gamil.com');
    // Only `undeliverable` blocks. A live squat must be suggested, never enforced.
    expect(v).toEqual({ status: 'typo', email: 'dana@gamil.com', suggestion: 'gmail.com' });
  });

  it('returns ok for a real corporate domain', async () => {
    mxBehaviour.set('jerusalem.muni.il', 'ok');
    expect(await verifyEmail('a@jerusalem.muni.il')).toEqual({
      status: 'ok', email: 'a@jerusalem.muni.il',
    });
  });

  it('returns unknown, carrying the normalized address through, on a timeout', async () => {
    mxBehaviour.set('clalit.org.il', 'timeout');
    const v = await verifyEmail('  Nurse@Clalit.org.il ');
    // Presence assertion beside the absence one: the address survives, normalized.
    expect(v).toEqual({ status: 'unknown', email: 'nurse@clalit.org.il' });
  });

  it('normalizes before probing, so an invisible mark cannot fake a dead domain', async () => {
    mxBehaviour.set('gmail.com', 'ok');
    expect(await verifyEmail('alice2692@gmail.com\u202C')).toEqual({
      status: 'ok', email: 'alice2692@gmail.com',
    });
  });

  it('returns undeliverable with reason nxdomain for a shape that is not an address', async () => {
    expect(await verifyEmail('לא רוצה')).toMatchObject({ status: 'undeliverable' });
  });
});

describe('verifyEmailSync', () => {
  it('flags a mapped squat without any network call', () => {
    expect(verifyEmailSync('dana@gamil.com')).toEqual({
      status: 'typo', email: 'dana@gamil.com', suggestion: 'gmail.com',
    });
  });

  it('returns unknown for anything it cannot judge locally', () => {
    // Not 'ok' — the sync path has not checked MX, and must not claim it has.
    expect(verifyEmailSync('a@jerusalem.muni.il')).toEqual({
      status: 'unknown', email: 'a@jerusalem.muni.il',
    });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/unit/email-deliverability-mx.test.ts`
Expected: FAIL — `probeMx is not a function`.

- [ ] **Step 3: Implement L2**

Append to `src/lib/support/email-deliverability.ts`:

```ts
// ── L2: MX probe ───────────────────────────────────────────────────────────

import dns from 'node:dns/promises';
import { redisGet, redisSet } from '@/lib/redis';

/**
 * Hard cap. Measured against production domains: the decisive negatives answer fast
 * (gmail.com.il NXDOMAIN in 103 ms, gmail.con in 160 ms), while a slow resolver can sit
 * on a REAL domain for the better part of a minute — elishevaph.org took 49.7 s and
 * windowslive.com 52.7 s. Waiting is never worth it, because a slow answer and a missing
 * answer are treated identically anyway: as 'unknown', which passes.
 */
const MX_TIMEOUT_MS = 1500;
const TTL_HAS_MX = 7 * 24 * 60 * 60;
const TTL_NO_MX = 24 * 60 * 60;

export async function probeMx(domain: string): Promise<'has_mx' | 'no_mx' | 'unknown'> {
  const key = `email_mx:${domain}`;
  const cached = await redisGet<'has_mx' | 'no_mx'>(key);
  if (cached === 'has_mx' || cached === 'no_mx') return cached;

  let verdict: 'has_mx' | 'no_mx' | 'unknown';
  try {
    const timeout = new Promise<'unknown'>((resolve) =>
      setTimeout(() => resolve('unknown'), MX_TIMEOUT_MS).unref?.(),
    );
    const lookup = dns.resolveMx(domain).then((records) =>
      records && records.length > 0 ? ('has_mx' as const) : ('no_mx' as const),
    );
    verdict = await Promise.race([lookup, timeout]);
  } catch (err: any) {
    // ENOTFOUND = the domain does not exist. ENODATA = it exists with no MX. Both mean
    // no mail can be delivered. Everything else — SERVFAIL, ETIMEOUT, a resolver that is
    // simply having a bad day — is OUR failure to find out, not proof of anything.
    verdict = err?.code === 'ENOTFOUND' || err?.code === 'ENODATA' ? 'no_mx' : 'unknown';
  }

  // 'unknown' is deliberately not cached: it is a statement about this moment, not the domain.
  if (verdict !== 'unknown') {
    await redisSet(key, verdict, verdict === 'has_mx' ? TTL_HAS_MX : TTL_NO_MX);
  }
  return verdict;
}

// ── Orchestration ──────────────────────────────────────────────────────────

/** L0 + L1 only. For callers with no network budget; never claims 'ok'. */
export function verifyEmailSync(raw: unknown): EmailVerdict {
  const email = normalizeEmail(raw);
  if (!email) return { status: 'undeliverable', email: String(raw ?? ''), reason: 'nxdomain' };
  const suggestion = suggestDomain(domainOf(email));
  if (suggestion) return { status: 'typo', email, suggestion };
  // Not 'ok': MX has not been checked, so we do not know that it is.
  return { status: 'unknown', email };
}

/** The full verdict. Never throws. */
export async function verifyEmail(raw: unknown): Promise<EmailVerdict> {
  const email = normalizeEmail(raw);
  if (!email) return { status: 'undeliverable', email: String(raw ?? ''), reason: 'nxdomain' };

  const domain = domainOf(email);
  const mapped = suggestDomain(domain);
  const mx = await probeMx(domain);

  if (mx === 'no_mx') {
    // Now, and only now, edit distance is allowed to propose a repair.
    const suggestion = mapped ?? suggestDomain(domain, { mxKnownDead: true }) ?? undefined;
    return { status: 'undeliverable', email, reason: 'no_mx', suggestion };
  }
  // Has MX (or we could not tell) but the domain is a known lookalike: suggest, never block.
  if (mapped) return { status: 'typo', email, suggestion: mapped };
  return mx === 'has_mx' ? { status: 'ok', email } : { status: 'unknown', email };
}
```

Move the two new `import` lines to the top of the file with the existing import.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/email-deliverability.test.ts tests/unit/email-deliverability-mx.test.ts`
Expected: PASS, both files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/support/email-deliverability.ts tests/unit/email-deliverability-mx.test.ts
git commit -m "feat(email): bounded MX probe that fails open when DNS cannot answer"
```

---

### Task 3: The `email_deliverability` table and its store

**Files:**
- Create: `supabase/migrations/085_email_deliverability.sql`
- Create: `src/lib/support/email-deliverability-store.ts`
- Test: `tests/unit/email-deliverability-store.test.ts`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase`; `normalizeEmail` (Task 1).
- Produces:
  - `export type DeliverabilityStatus = 'ok' | 'no_mx' | 'bounced'`
  - `export async function recordDeliverability(address: string, status: DeliverabilityStatus, reason?: string): Promise<void>`
  - `export async function markBounced(address: string, reason: string): Promise<void>`
  - `export async function getDeliverability(addresses: string[]): Promise<Map<string, DeliverabilityStatus>>`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/085_email_deliverability.sql`:

```sql
-- Whether mail to an address can actually be delivered.
--
-- Keyed by ADDRESS, not by ticket, deliberately: "this address is dead" is a fact about the
-- address, and the same address turns up in support_requests, bestie_leads, service_briefs
-- and client_contacts at once. One probe serves every surface, the backfill sweep, and the
-- support inbox render without anyone re-probing.
create table if not exists email_deliverability (
  address        text primary key,
  status         text not null check (status in ('ok', 'no_mx', 'bounced')),
  reason         text,
  checked_at     timestamptz not null default now(),
  bounce_count   int not null default 0,
  last_bounce_at timestamptz
);

-- Every read is "show me the addresses that are a problem" — the ok rows are the bulk and
-- are never scanned.
create index if not exists email_deliverability_bad_idx
  on email_deliverability (status) where status <> 'ok';
```

- [ ] **Step 2: Apply the migration**

Apply `supabase/migrations/085_email_deliverability.sql` against the project using the
Supabase MCP `apply_migration` tool, with name `085_email_deliverability`.

Verify: `select count(*) from email_deliverability;` returns `0` rather than an error.

- [ ] **Step 3: Write the failing test**

Create `tests/unit/email-deliverability-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows = new Map<string, any>();
const calls: string[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: async (row: any) => { calls.push(`upsert:${table}`); rows.set(row.address, row); return { error: null }; },
      select: () => ({
        in: async (_col: string, values: string[]) => ({
          data: values.map((v) => rows.get(v)).filter(Boolean),
          error: null,
        }),
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  },
}));

import { recordDeliverability, markBounced, getDeliverability } from '@/lib/support/email-deliverability-store';

beforeEach(() => { rows.clear(); calls.length = 0; });

describe('recordDeliverability', () => {
  it('stores a dead address under its normalized form', async () => {
    await recordDeliverability('  LiliLevy42@Gmail.com.IL ', 'no_mx', 'nxdomain');
    expect(rows.get('lililevy42@gmail.com.il')).toMatchObject({ status: 'no_mx', reason: 'nxdomain' });
  });

  it('stores a good address as ok — the table is not a deny-list', async () => {
    // Companion presence assertion: without this, a store that silently dropped every
    // write except failures would still pass the test above.
    await recordDeliverability('nurse@clalit.org.il', 'ok');
    expect(rows.get('nurse@clalit.org.il')).toMatchObject({ status: 'ok' });
  });

  it('writes nothing for an unusable value', async () => {
    await recordDeliverability('לא רוצה', 'no_mx');
    expect(calls).toHaveLength(0);
  });
});

describe('markBounced', () => {
  it('records the bounce with a count and a timestamp', async () => {
    await markBounced('lililevy42@gmail.com.il', 'Address not found');
    const row = rows.get('lililevy42@gmail.com.il');
    expect(row).toMatchObject({ status: 'bounced', reason: 'Address not found', bounce_count: 1 });
    expect(row.last_bounce_at).toBeTruthy();
  });
});

describe('getDeliverability', () => {
  it('returns only the addresses it knows about, keyed normalized', async () => {
    await recordDeliverability('lililevy42@gmail.com.il', 'no_mx');
    const map = await getDeliverability(['LiliLevy42@gmail.com.il', 'someone@gmail.com']);
    expect(map.get('lililevy42@gmail.com.il')).toBe('no_mx');
    expect(map.has('someone@gmail.com')).toBe(false);
  });

  it('returns an empty map for an empty input without querying', async () => {
    expect((await getDeliverability([])).size).toBe(0);
  });
});
```

- [ ] **Step 4: Run the test and watch it fail**

Run: `npx vitest run tests/unit/email-deliverability-store.test.ts`
Expected: FAIL — cannot resolve `@/lib/support/email-deliverability-store`.

- [ ] **Step 5: Implement the store**

Create `src/lib/support/email-deliverability-store.ts`:

```ts
/**
 * Persistence for what we know about an address's deliverability.
 *
 * Split from ./email-deliverability so the verification logic stays pure and testable
 * without a database, and so the widget-facing validate route can import the checks
 * without dragging Supabase in behind them.
 */

import { supabase } from '@/lib/supabase';
import { normalizeEmail } from '@/lib/support/email-deliverability';

export type DeliverabilityStatus = 'ok' | 'no_mx' | 'bounced';

export async function recordDeliverability(
  address: string,
  status: DeliverabilityStatus,
  reason?: string,
): Promise<void> {
  const key = normalizeEmail(address);
  if (!key) return;
  await supabase.from('email_deliverability').upsert({
    address: key,
    status,
    reason: reason ?? null,
    checked_at: new Date().toISOString(),
  }).then(undefined, () => {});
}

/**
 * A bounce is ground truth and outranks any probe: the domain may resolve perfectly while
 * the mailbox behind it does not exist, and nothing before the send can see that.
 */
export async function markBounced(address: string, reason: string): Promise<void> {
  const key = normalizeEmail(address);
  if (!key) return;
  const { data: existing } = await supabase
    .from('email_deliverability')
    .select('bounce_count')
    .eq('address', key)
    .maybeSingle();
  const now = new Date().toISOString();
  await supabase.from('email_deliverability').upsert({
    address: key,
    status: 'bounced',
    reason: reason.slice(0, 500),
    checked_at: now,
    bounce_count: ((existing as any)?.bounce_count ?? 0) + 1,
    last_bounce_at: now,
  }).then(undefined, () => {});
}

export async function getDeliverability(addresses: string[]): Promise<Map<string, DeliverabilityStatus>> {
  const out = new Map<string, DeliverabilityStatus>();
  const keys = addresses.map((a) => normalizeEmail(a)).filter((a): a is string => !!a);
  if (!keys.length) return out;
  const { data } = await supabase
    .from('email_deliverability')
    .select('address, status')
    .in('address', keys);
  for (const row of (data as any[]) || []) out.set(row.address, row.status);
  return out;
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run tests/unit/email-deliverability-store.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/085_email_deliverability.sql src/lib/support/email-deliverability-store.ts tests/unit/email-deliverability-store.test.ts
git commit -m "feat(email): address-keyed deliverability table and store"
```

---

### Task 4: `POST /api/widget/validate-email`

The widget's live check. Stateless, and deliberately says nothing an attacker could not learn by running `dig` themselves.

**Files:**
- Create: `src/app/api/widget/validate-email/route.ts`
- Test: `tests/unit/validate-email-route.test.ts`

**Interfaces:**
- Consumes: `verifyEmail` (Task 2).
- Produces: `POST { email: string }` → `200 { status, email, suggestion? }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/validate-email-route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/support/email-deliverability', () => ({
  verifyEmail: async (raw: string) =>
    raw.includes('gmail.com.il')
      ? { status: 'undeliverable', email: raw, reason: 'no_mx', suggestion: 'gmail.com' }
      : { status: 'ok', email: raw },
}));

import { POST, OPTIONS } from '@/app/api/widget/validate-email/route';

const post = (body: unknown, origin = 'https://argania-oil.co.il') =>
  POST(new Request('http://x/api/widget/validate-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  }) as any);

describe('POST /api/widget/validate-email', () => {
  it('reports the suggestion for a dead domain', async () => {
    const res = await post({ email: 'lililevy42@gmail.com.il' });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'undeliverable', suggestion: 'gmail.com',
    });
  });

  it('reports ok for a good address', async () => {
    const res = await post({ email: 'a@gmail.com' });
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('echoes the request origin so an embedded widget can read the response', async () => {
    const res = await post({ email: 'a@gmail.com' }, 'https://shop.example');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://shop.example');
  });

  it('answers the CORS preflight', async () => {
    const res = await OPTIONS(new Request('http://x', { method: 'OPTIONS', headers: { origin: 'https://shop.example' } }) as any);
    expect(res.status).toBe(204);
  });

  it('rejects a missing email with 400 rather than guessing', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it('rejects an oversized payload without calling the verifier', async () => {
    const res = await post({ email: 'a'.repeat(400) + '@gmail.com' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/validate-email-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/widget/validate-email/route.ts`:

```ts
/**
 * Live deliverability check for the widget's email fields.
 *
 * Under /api/widget on purpose: middleware.ts already rate-limits that prefix, so this
 * inherits the bucket instead of needing its own.
 *
 * Stateless, and it discloses nothing — every answer is derivable from a public MX lookup
 * by anyone who cares to run one. Nothing is stored: the authoritative check, and the only
 * one that records anything, happens in /api/support.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyEmail } from '@/lib/support/email-deliverability';

export const runtime = 'nodejs';   // dns/promises is unavailable on edge

function corsHeadersFor(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeadersFor(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const cors = corsHeadersFor(req.headers.get('origin') || '');
  try {
    const body = await req.json();
    const email = body?.email;
    if (typeof email !== 'string' || !email.trim() || email.length > 254) {
      return NextResponse.json({ error: 'email required' }, { status: 400, headers: cors });
    }
    const verdict = await verifyEmail(email);
    return NextResponse.json(verdict, { status: 200, headers: cors });
  } catch {
    // A validator that 500s must not take the form down with it. "I could not tell" is
    // always a safe answer here, because 'unknown' never blocks anyone.
    return NextResponse.json({ status: 'unknown' }, { status: 200, headers: cors });
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/validate-email-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/widget/validate-email/route.ts tests/unit/validate-email-route.test.ts
git commit -m "feat(email): live validate-email endpoint for widget forms"
```

---

### Task 5: Enforce at `/api/support` (D2 + D2a)

The authoritative check. The widget's is UX; anyone can POST here directly.

**Files:**
- Modify: `src/app/api/support/route.ts:78-81` (the `sanitizedEmail` derivation) and `:203-221` (the insert)
- Test: `tests/unit/support-route-email-gate.test.ts`

**Interfaces:**
- Consumes: `verifyEmail` (Task 2), `recordDeliverability` (Task 3), `realPhoneOrNull` (existing).
- Produces: a `400 { error, code: 'undeliverable_email', suggestion?: string }` response shape that Task 6 renders.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/support-route-email-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emailGate } from '@/app/api/support/route';

// The gate is exported separately from the route handler so it can be tested without
// standing up Supabase, Gmail and WhatsApp behind it.
describe('emailGate — only `undeliverable` blocks, and only with no phone', () => {
  it('blocks a dead address when there is no dialable phone', () => {
    const r = emailGate({ status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx', suggestion: 'gmail.com' }, null, true);
    expect(r).toMatchObject({ blocked: true, suggestion: 'gmail.com' });
  });

  it('lets a dead address through when a dialable phone exists', () => {
    // לילי's real ticket: gmail.com.il, but 0526936571 was right there. Losing the ticket
    // would have been strictly worse than filing it with a note.
    const r = emailGate({ status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx' }, '0526936571', true);
    expect(r).toMatchObject({ blocked: false });
  });

  it('never blocks on a typo verdict, even with no phone', () => {
    const r = emailGate({ status: 'typo', email: 'a@gamil.com', suggestion: 'gmail.com' }, null, true);
    expect(r).toMatchObject({ blocked: false });
  });

  it('never blocks on unknown, even with no phone', () => {
    const r = emailGate({ status: 'unknown', email: 'a@clalit.org.il' }, null, true);
    expect(r).toMatchObject({ blocked: false });
  });

  it('never blocks a good address', () => {
    expect(emailGate({ status: 'ok', email: 'a@gmail.com' }, null, true)).toMatchObject({ blocked: false });
  });

  it('ignores an undialable phone when deciding', () => {
    // 'aw_1a2b3c' is a widget visitor id, not a number — realPhoneOrNull rejects it, so it
    // must not count as a fallback route.
    const r = emailGate({ status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx' }, 'aw_1a2b3c', true);
    expect(r).toMatchObject({ blocked: true });
  });
});

describe('emailGate — the per-account rollout switch', () => {
  it('does not block when the account has not opted in', () => {
    // Spec §7: absence means permissive. Every existing account keeps today's behaviour
    // until someone turns this on for them.
    const r = emailGate({ status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx' }, null, false);
    expect(r).toMatchObject({ blocked: false });
  });

  it('blocks once the account has opted in', () => {
    // Companion: without this, a gate hard-wired to never block would pass the test above.
    const r = emailGate({ status: 'undeliverable', email: 'a@gmail.com.il', reason: 'no_mx' }, null, true);
    expect(r).toMatchObject({ blocked: true });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/support-route-email-gate.test.ts`
Expected: FAIL — `emailGate` is not exported.

- [ ] **Step 3: Add the gate and wire it into the handler**

In `src/app/api/support/route.ts`, add to the imports:

```ts
import { realPhoneOrNull } from '@/lib/support/contact';   // already imported — leave as is
import { verifyEmail, type EmailVerdict } from '@/lib/support/email-deliverability';
import { recordDeliverability } from '@/lib/support/email-deliverability-store';
```

Add above `export async function POST`:

```ts
/**
 * Should this submission be refused because we have no way to answer it?
 *
 * Two rules, and the second is the one that matters. A `typo` verdict is a GUESS — the
 * address may well be fine — and blocking on a guess is how a mail.com customer gets told
 * she mistyped her own address. Only `undeliverable`, where MX has actually reported that
 * no mail server exists, is fact enough to refuse.
 *
 * And even then, only when there is no phone. A ticket with a dead email and a real number
 * is answerable; refusing it loses the customer entirely, which is the failure this whole
 * feature exists to prevent.
 */
export function emailGate(
  verdict: EmailVerdict,
  phone: string | null | undefined,
  enforce: boolean,
): { blocked: boolean; suggestion?: string } {
  // Off unless the account opted in. Absence means permissive, so no account that exists
  // today changes behaviour the moment this ships.
  if (!enforce) return { blocked: false };
  if (verdict.status !== 'undeliverable') return { blocked: false };
  if (realPhoneOrNull(phone)) return { blocked: false };
  return { blocked: true, suggestion: (verdict as any).suggestion };
}
```

Replace the `sanitizedEmail` derivation at line 78-81:

```ts
    // Deliverability, not shape. `lililevy42@gmail.com.il` satisfies every regex in this
    // repo — .il is a real TLD — and bounced. See email-deliverability.ts.
    const emailVerdict = await verifyEmail(customerEmail);
    // Stored VERBATIM, exactly like the phone above: a corrected or blanked value would
    // hide from the agent what the customer actually typed.
    const sanitizedEmail = typeof customerEmail === 'string' && customerEmail.trim()
      ? customerEmail.trim()
      : null;
```

Immediately after `const dialablePhone = realPhoneOrNull(sanitizedPhone);` and the
`sanitizedEmail` block, add the gate:

```ts
    const enforceEmail = ((influencer as any)?._rawConfig?.email_validation?.enforce) === true;
    const gate = emailGate(emailVerdict, sanitizedPhone, enforceEmail);
    if (gate.blocked) {
      return NextResponse.json(
        {
          error: gate.suggestion
            ? `כתובת המייל לא קיימת. התכוונת ל-${gate.suggestion}?`
            : 'כתובת המייל לא קיימת. אפשר לתקן אותה, או להשאיר מספר טלפון.',
          code: 'undeliverable_email',
          suggestion: gate.suggestion || null,
        },
        { status: 400, headers: cors },
      );
    }
```

After the insert succeeds (right after the `void autoAssignNewTicket(...)` line), record
what we learned:

```ts
    // Best-effort, fire-and-forget: the support inbox reads this to show the agent that a
    // reply by email will not arrive, and to point them at the phone instead.
    if (sanitizedEmail && emailVerdict.status !== 'unknown') {
      void recordDeliverability(
        sanitizedEmail,
        emailVerdict.status === 'undeliverable' ? 'no_mx' : 'ok',
        emailVerdict.status === 'undeliverable' ? (emailVerdict as any).reason : undefined,
      );
    }
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/support-route-email-gate.test.ts && npm run type-check`
Expected: tests PASS; `type-check` reports no new errors.

- [ ] **Step 5: Turn it on for Argania only**

Every other account keeps today's behaviour, because `config.email_validation` is absent
for them and `emailGate` reads absence as permissive.

```sql
update accounts
set config = jsonb_set(
  coalesce(config, '{}'::jsonb),
  '{email_validation}',
  '{"enforce": true}'::jsonb,
  true
)
where id = 'c68ef2bd-f294-4c8c-83dc-abd5f9cbf6d1';   -- Argania (ticket 99bb08a1's account)
```

Verify, and confirm nobody else was touched:

```sql
select id, config->'email_validation' from accounts where config ? 'email_validation';
```

Expected: exactly one row.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/support/route.ts tests/unit/support-route-email-gate.test.ts
git commit -m "feat(support): refuse a ticket only when the email is dead AND no phone was left"
```

---

### Task 6: Widget — one email check replacing five copies

**Files:**
- Modify: `public/widget.js` — lines 4816, 5269, 5499, 5584, 5666 plus the support form's submit/render.

**Interfaces:**
- Consumes: `POST /api/widget/validate-email` (Task 4); the `400 { code: 'undeliverable_email', suggestion }` shape (Task 5).
- Produces: nothing other modules consume.

ES5 only: `var`, `function`, string concatenation. No arrow functions, no template literals.

- [ ] **Step 1: Add the shared helpers**

Insert near the other form helpers, above `function openSupportForm(`:

```js
  // ============================================
  // Email deliverability
  //
  // Five copies of /^[^\s@]+@[^\s@]+\.[^\s@]+$/ used to live in this file, and every one
  // of them accepted lililevy42@gmail.com.il — which is shape-perfect and does not exist.
  // Shape is still checked (cheaply, below), but "can we deliver to it" is a question only
  // the server can answer, so it is asked there.
  // ============================================
  var emailCheckCache = {};
  var emailCheckTimer = null;

  function isEmailShape(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  }

  // Strips the invisible bidi/zero-width marks a Hebrew keyboard leaves around a Latin
  // address. Three real addresses reached us carrying U+202C: they look correct in every
  // field, pass every regex, and fail at DNS.
  function stripInvisible(v) {
    return String(v || '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();
  }

  // Asks the server whether the address is deliverable, then calls cb(verdict).
  // Never blocks the form: any failure answers 'unknown', which every caller treats as fine.
  function checkEmailRemote(email, cb) {
    var addr = stripInvisible(email).toLowerCase();
    if (!isEmailShape(addr)) { cb({ status: 'unknown', email: addr }); return; }
    if (emailCheckCache[addr]) { cb(emailCheckCache[addr]); return; }
    fetch(BASE_URL + '/api/widget/validate-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addr }),
    })
      .then(function (r) { return r.json(); })
      .then(function (v) {
        var verdict = v && v.status ? v : { status: 'unknown', email: addr };
        if (verdict.status !== 'unknown') emailCheckCache[addr] = verdict;
        cb(verdict);
      })
      .catch(function () { cb({ status: 'unknown', email: addr }); });
  }

  // Renders the inline hint under an email input. `suggestion` null clears it.
  function renderEmailHint(inputId, suggestion) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var hintId = inputId + '-hint';
    var existing = document.getElementById(hintId);
    if (existing) existing.parentNode.removeChild(existing);
    if (!suggestion) return;
    var local = stripInvisible(input.value).split('@')[0];
    var fixed = local + '@' + suggestion;
    var hint = document.createElement('div');
    hint.id = hintId;
    hint.style.cssText = 'margin-top:6px;font-size:12px;color:#b45309;display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
    hint.innerHTML = escapeHtml(locale.support.emailMaybe || 'התכוונת ל-') +
      '<button type="button" id="' + hintId + '-fix" style="background:none;border:none;padding:0;' +
      'font:inherit;color:#2563eb;text-decoration:underline;cursor:pointer;" dir="ltr">' +
      escapeHtml(fixed) + '</button>';
    input.parentNode.appendChild(hint);
    var btn = document.getElementById(hintId + '-fix');
    if (btn) btn.onclick = function () {
      input.value = fixed;
      renderEmailHint(inputId, null);
    };
  }

  // Wires blur + debounced input on an email field to the remote check.
  function attachEmailCheck(inputId) {
    var input = document.getElementById(inputId);
    if (!input || input.getAttribute('data-ibot-checked') === '1') return;
    input.setAttribute('data-ibot-checked', '1');
    var run = function () {
      var value = input.value;
      checkEmailRemote(value, function (verdict) {
        // Re-read: the visitor may have typed on while the request was in flight.
        if (stripInvisible(input.value).toLowerCase() !== stripInvisible(value).toLowerCase()) return;
        renderEmailHint(inputId, verdict.suggestion || null);
      });
    };
    input.addEventListener('blur', run);
    input.addEventListener('input', function () {
      renderEmailHint(inputId, null);
      if (emailCheckTimer) clearTimeout(emailCheckTimer);
      emailCheckTimer = setTimeout(run, 400);
    });
  }
```

- [ ] **Step 2: Replace the five inline regexes**

Each site keeps its shape check but routes through the helpers. Replace, exactly:

Line 4816 (`validateSupportForm`):
```js
    if (!isEmailShape(supportForm.email)) return s.invalidEmail;
```

Line 5269 (transcript prompt) — replace the `if (!email || !/…/.test(email.trim())) return;` with:
```js
    if (!email || !isEmailShape(email)) return;
    email = stripInvisible(email);
```

Line 5499 (`submitLeadTicket`):
```js
    if (!isEmailShape(leadForm.email)) { leadForm.error = s.invalidEmail; render(); return; }
```

Line 5584 (`submitBookDemo`):
```js
    if (!isEmailShape(bookDemoForm.email)) { bookDemoForm.error = s.invalidEmail; render(); return; }
```

Line 5666 (`submitOrderLookup`):
```js
    if (!isEmailShape(orderForm.email)) { orderForm.error = s.invalidEmail; render(); return; }
    orderForm.email = stripInvisible(orderForm.email);
```

Order lookup gets **normalization only, no suggestion**: it matches against an order the
merchant already holds, so a "dead" domain there is not an error — it is what the customer
genuinely used at checkout. Stripping invisible marks strictly helps the match; correcting
the domain would break it.

- [ ] **Step 3: Attach the live check to the four capture fields**

After each form's `container.innerHTML = …` assignment and its existing event wiring, add
the matching call. In `renderSupportForm`, next to the other `document.getElementById`
handlers at the end of the function:

```js
    attachEmailCheck('ibot-sf-email');
```

And likewise `attachEmailCheck('ibot-lf-email');` in the lead form's render, and
`attachEmailCheck('ibot-bd-email');` in the book-demo render. Do **not** attach it to
`ibot-of-email` (order lookup) — see Step 2.

- [ ] **Step 4: Surface the server's 400 without destroying the form**

In `submitSupportTicket`, replace the `.then(function (r) { return r.ok ? … })` line with:

```js
      .then(function (r) {
        if (r.ok) return r.json();
        return r.json().then(function (j) {
          var err = new Error(j.error || 'submit failed');
          err.code = j.code;
          err.suggestion = j.suggestion;
          throw err;
        });
      })
```

and replace the `.catch` body with:

```js
      .catch(function (e) {
        supportForm.submitting = false;
        // A rejected email must NOT empty the form. The shopper has typed a name, a
        // message and possibly an order number; making her retype all of it to fix one
        // character loses the ticket, which is the exact outcome this gate exists to
        // prevent. supportForm still holds every field, and render() repaints them.
        supportForm.error = (e && e.code === 'undeliverable_email')
          ? e.message
          : locale.support.submitError;
        widgetTrack('widget_support_failed', { error: String(e && e.message || e).slice(0, 200) });
        render();
        if (e && e.code === 'undeliverable_email' && e.suggestion) {
          setTimeout(function () { renderEmailHint('ibot-sf-email', e.suggestion); }, 0);
        }
      });
```

- [ ] **Step 5: Add the copy string in both locales**

In the `he` locale's `support` block, beside `invalidEmail`:
```js
        emailMaybe: 'התכוונת ל-',
```
In the `en` locale's `support` block:
```js
        emailMaybe: 'Did you mean ',
```

- [ ] **Step 6: Verify in a browser**

Start the dev server (`npm run dev`), open a page with the widget, open the support form and:

1. Type `test@gmail.com.il`, blur → the hint appears offering `test@gmail.com`.
2. Click the suggestion → the field becomes `test@gmail.com`, the hint disappears.
3. Type `test@gmail.com`, blur → **no hint** (the companion check: a helper that suggests
   for everything would pass step 1 and fail here).
4. Type `test@mail.com`, blur → **no hint**. This is the false-positive guard from Task 1
   reaching the UI.
5. Fill name + message, set email `x@gmail.com.il`, leave phone empty, submit → the error
   appears **and the name, message and order number are still in their fields**.
6. Add a phone, submit again → the ticket is created.

- [ ] **Step 7: Commit**

```bash
git add public/widget.js
git commit -m "feat(widget): one email check, live suggestions, and a 400 that keeps the form"
```

---

### Task 7: Stop discarding the bounces we already receive (L3)

The highest-value task in this plan and the smallest: the signal already arrives on a cron
that already runs, into a function that already identifies it correctly.

**Files:**
- Modify: `src/lib/support/inbound-email.ts` (the `InboundEmail` interface, `isAutomated`, and `routeInboundCustomerEmail` at :200-203)
- Modify: `src/app/api/cron/poll-gmail/route.ts` (pass the `X-Failed-Recipients` header through)
- Test: `tests/unit/support-inbound-bounce.test.ts`

**Interfaces:**
- Consumes: `markBounced` (Task 3), `normalizeEmail` (Task 1).
- Produces: `export function extractBouncedRecipient(email: InboundEmail): string | null`; `InboundEmail` gains an optional `failedRecipient?: string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/support-inbound-bounce.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractBouncedRecipient } from '@/lib/support/inbound-email';

const mk = (over: Partial<any>) => ({
  providerMessageId: 'm1', from: 'mailer-daemon@googlemail.com',
  subject: 'Delivery Status Notification (Failure)', body: '', ...over,
});

describe('extractBouncedRecipient', () => {
  it('reads the address out of a real Gmail failure notice', () => {
    // This is the body shape of the bounce logged at 2026-08-31 10:01:05.
    const body = [
      'Address not found',
      '',
      "Your message wasn't delivered to lililevy42@gmail.com.il because the domain",
      "gmail.com.il couldn't be found. Check for typos or unnecessary spaces and try again.",
      '',
      'The response was:',
      "DNS Error: 2320449 DNS type 'mx' lookup of gmail.com.il responded with code NXDOMAIN",
    ].join('\n');
    expect(extractBouncedRecipient(mk({ body }))).toBe('lililevy42@gmail.com.il');
  });

  it('prefers the RFC 3464 Final-Recipient field when present', () => {
    const body = 'Final-Recipient: rfc822; dana@gamil.com\nAction: failed\nStatus: 5.1.1';
    expect(extractBouncedRecipient(mk({ body }))).toBe('dana@gamil.com');
  });

  it('prefers the X-Failed-Recipients header over any body text', () => {
    expect(extractBouncedRecipient(mk({
      failedRecipient: 'header@example.com',
      body: "Your message wasn't delivered to body@example.com because…",
    }))).toBe('header@example.com');
  });

  it('returns null for a DELAY notice — a delay is not a failure', () => {
    expect(extractBouncedRecipient(mk({
      subject: 'Delivery Status Notification (Delay)',
      body: "Your message to slow@example.com has been delayed.",
    }))).toBeNull();
  });

  it('returns null for a genuine customer reply', () => {
    // Companion presence assertion: proves the extractor is discriminating, not just
    // returning null because it is broken.
    expect(extractBouncedRecipient(mk({
      from: 'shopper@gmail.com',
      subject: 'Re: הפנייה שלך',
      body: 'תודה רבה! מתי זה יגיע?',
    }))).toBeNull();
  });

  it('returns null when the daemon writes about no address at all', () => {
    expect(extractBouncedRecipient(mk({ body: 'Message rejected by policy.' }))).toBeNull();
  });

  it('ignores the postmaster address the daemon signs itself with', () => {
    const body = 'Reporting-MTA: dns; googlemail.com\nFinal-Recipient: rfc822; real@dead.example';
    expect(extractBouncedRecipient(mk({ body }))).toBe('real@dead.example');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/support-inbound-bounce.test.ts`
Expected: FAIL — `extractBouncedRecipient` is not exported.

- [ ] **Step 3: Implement the extractor and wire it in**

In `src/lib/support/inbound-email.ts`, add to the imports:

```ts
import { markBounced } from '@/lib/support/email-deliverability-store';
import { normalizeEmail } from '@/lib/support/email-deliverability';
```

Add `failedRecipient?: string;` to the `InboundEmail` interface, documented:

```ts
export interface InboundEmail {
  providerMessageId: string;
  from: string;          // already lowercased bare address
  subject: string;
  body: string;          // plain-text body, quoted history included
  /** Gmail's X-Failed-Recipients header, when this is a bounce. The strongest signal. */
  failedRecipient?: string;
}
```

Add above `routeInboundCustomerEmail`:

```ts
/** Gmail's own wording, and the Hebrew locale's, around the address that failed. */
const BOUNCE_BODY_PATTERNS = [
  /Final-Recipient:\s*rfc822;\s*([^\s<>,;]+@[^\s<>,;]+)/i,
  /wasn'?t delivered to\s+([^\s<>,;]+@[^\s<>,;]+)/i,
  /couldn'?t be delivered to\s+([^\s<>,;]+@[^\s<>,;]+)/i,
  /ההודעה שלך לא נשלחה אל\s+([^\s<>,;]+@[^\s<>,;]+)/,
];

/**
 * The address that could not be reached, when this message is a hard bounce.
 *
 * A bounce is the only signal that sees past a valid domain to a mailbox that does not
 * exist, and it arrives here already — poll-gmail read the failure notice for ticket
 * 99bb08a1 six minutes after the ticket was filed, and isAutomated() dropped it.
 *
 * Deliberately narrow. A (Delay) notice is not a failure — mail delayed is still mail
 * that may be delivered — and marking an address dead on a delay would take a working
 * route away from a brand.
 */
export function extractBouncedRecipient(email: InboundEmail): string | null {
  const from = (email.from || '').toLowerCase();
  const isDaemon = /^(mailer-daemon|postmaster)/.test(from);
  const subject = email.subject || '';
  const isFailure = /delivery status notification \(failure\)|undelivered mail|delivery incomplete|returned mail/i.test(subject)
    || /^address not found/i.test((email.body || '').trim());
  if (!isDaemon || !isFailure) return null;
  if (/\(delay\)/i.test(subject)) return null;

  if (email.failedRecipient) {
    const fromHeader = normalizeEmail(email.failedRecipient);
    if (fromHeader) return fromHeader;
  }
  for (const re of BOUNCE_BODY_PATTERNS) {
    const m = re.exec(email.body || '');
    if (!m) continue;
    const addr = normalizeEmail(m[1].replace(/[.,;]+$/, ''));
    // Never mark our own mailbox or the reporting daemon as dead.
    if (addr && !/^(mailer-daemon|postmaster)@/.test(addr) && !isSelfSent(addr)) return addr;
  }
  return null;
}
```

Replace the `isAutomated` branch at lines 200-203:

```ts
  if (isAutomated(email)) {
    // Still never forwarded to a brand — but no longer thrown away. A hard bounce is the
    // only evidence that a syntactically perfect address has no mailbox behind it.
    const bounced = extractBouncedRecipient(email);
    if (bounced) {
      await markBounced(bounced, (email.subject || 'bounce').slice(0, 200));
      await log({ outcome: 'not_a_customer_reply', note: `bounce recorded for ${bounced}` });
      return { outcome: 'not_a_customer_reply' };
    }
    await log({ outcome: 'not_a_customer_reply', note: 'automated sender or auto-reply subject' });
    return { outcome: 'not_a_customer_reply' };
  }
```

In `src/app/api/cron/poll-gmail/route.ts`, pass the header through — inside the `for` loop
where `routeInboundCustomerEmail` is called, add the field:

```ts
          routed = await routeInboundCustomerEmail({
            providerMessageId: m.id,
            from,
            subject,
            body: collected.text || full.data.snippet || '',
            failedRecipient: headerValue(headers, 'X-Failed-Recipients') || undefined,
          }, { deferAlerts: unroutable }).catch((e: any) => ({ outcome: 'error', note: String(e?.message || e) }));
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/support-inbound-bounce.test.ts tests/unit/support-inbound-email.test.ts`
Expected: PASS both — the second is the existing suite, which must not regress.

- [ ] **Step 5: Commit**

```bash
git add src/lib/support/inbound-email.ts src/app/api/cron/poll-gmail/route.ts tests/unit/support-inbound-bounce.test.ts
git commit -m "fix(email): record the bounce instead of binning it"
```

---

### Task 8: CS tool `remember_contact`

**Files:**
- Modify: `src/lib/cs/tools/index.ts:164`
- Test: `tests/unit/cs-remember-contact.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `verifyEmail` (Task 2).

- [ ] **Step 1: Read the existing tool and its test**

Run: `sed -n '150,190p' src/lib/cs/tools/index.ts && sed -n '1,40p' tests/unit/cs-remember-contact.test.ts`

Note the existing shape of the tool's return value before changing it.

- [ ] **Step 2: Add the failing test**

Append to `tests/unit/cs-remember-contact.test.ts` a case asserting that an undeliverable
address is not stored and the tool reports back asking for a correction, plus its companion:

```ts
it('refuses to store an address whose domain does not exist, and says why', async () => {
  const res = await runTool('remember_contact', { email: 'lililevy42@gmail.com.il' }, ctx);
  expect(res.ok).toBe(false);
  expect(String(res.message)).toContain('gmail.com');
});

it('still stores a perfectly good address', async () => {
  // Companion: without this, a tool that rejected everything would pass the test above.
  const res = await runTool('remember_contact', { email: 'shopper@gmail.com' }, ctx);
  expect(res.ok).toBe(true);
});
```

Adapt `runTool`/`ctx` to whatever the existing file already uses — do not invent a new harness.

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run tests/unit/cs-remember-contact.test.ts`
Expected: FAIL — the dead address is currently accepted.

- [ ] **Step 4: Implement**

At `src/lib/cs/tools/index.ts:164`, replace `const email = realEmailOrNull(args?.email);` with:

```ts
    // Shape is not enough: gmail.com.il passes realEmailOrNull and has no mail server.
    const emailVerdict = await verifyEmail(args?.email);
    const email = emailVerdict.status === 'undeliverable' ? null : realEmailOrNull(emailVerdict.email);
    if (emailVerdict.status === 'undeliverable' && args?.email) {
      return {
        ok: false,
        message: (emailVerdict as any).suggestion
          ? `הכתובת ${emailVerdict.email} לא קיימת. אולי התכוונת ל-${(emailVerdict as any).suggestion}?`
          : `הכתובת ${emailVerdict.email} לא קיימת — אפשר לבדוק שוב?`,
      };
    }
```

Add `import { verifyEmail } from '@/lib/support/email-deliverability';` to the imports.

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run tests/unit/cs-remember-contact.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cs/tools/index.ts tests/unit/cs-remember-contact.test.ts
git commit -m "feat(cs): the bot asks again when the address it was given has no mail server"
```

---

### Task 9: Brand escalation recipients — hard block

The one place the spec calls for a hard block, because there is no phone to fall back to
and a typo here silently swallows every escalation for a whole brand.

**Files:**
- Modify: `src/app/admin/influencers/[id]/EscalationContactsForm.tsx`

**Interfaces:**
- Consumes: `POST /api/widget/validate-email` (Task 4).

- [ ] **Step 1: Add validation state and the check**

In `EscalationContactsForm.tsx`, add below the existing `hasEmptyRow`:

```tsx
  const [badEmails, setBadEmails] = useState<Record<number, string>>({});

  /**
   * Unlike a shopper's address, a recipient here has no phone fallback: if this address
   * does not exist, every escalation for this brand is delivered to nobody and nothing
   * says so. Blocking the save is the only signal available.
   */
  async function checkRow(i: number, email: string) {
    if (!email.trim()) {
      setBadEmails((b) => { const n = { ...b }; delete n[i]; return n; });
      return;
    }
    try {
      const res = await fetch('/api/widget/validate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const v = await res.json();
      setBadEmails((b) => {
        const n = { ...b };
        if (v.status === 'undeliverable') {
          n[i] = v.suggestion ? `הדומיין לא קיים — התכוונת ל-${v.suggestion}?` : 'הדומיין לא קיים';
        } else {
          delete n[i];
        }
        return n;
      });
    } catch {
      // A validator outage must not stop an admin from saving a recipient.
      setBadEmails((b) => { const n = { ...b }; delete n[i]; return n; });
    }
  }
```

- [ ] **Step 2: Wire it to the email input and the save button**

On the email `<input>` at line ~105, add `onBlur={(e) => checkRow(i, e.target.value)}`.

Below that input, render the message when present:

```tsx
{badEmails[i] && (
  <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{badEmails[i]}</div>
)}
```

Disable saving while any row is bad — extend the existing disabled condition on the save
button with `|| Object.keys(badEmails).length > 0`, and guard `save()` itself:

```tsx
  async function save() {
    if (Object.keys(badEmails).length > 0) return;
    setStatus('saving');
    // …existing body unchanged
```

- [ ] **Step 3: Verify in a browser**

`npm run dev`, open an account's admin page, Escalation Contacts:

1. Enter `alerts@gmail.com.il`, blur → the red message appears and Save is disabled.
2. Correct it to `alerts@gmail.com`, blur → the message clears and Save is enabled again.
   (Step 2 is the companion assertion: a form that disabled Save unconditionally would
   pass step 1.)
3. Enter `alerts@jerusalem.muni.il`, blur → **no message**, Save enabled.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/influencers/[id]/EscalationContactsForm.tsx"
git commit -m "feat(admin): block saving a brand escalation recipient whose domain is dead"
```

---

### Task 10: Show the agent that the email is dead

**Files:**
- Modify: `src/app/influencer/[username]/support/page.tsx` (the ticket detail: :1206, :1449-1467, and the `reachable` computation at :1209)
- Modify: `src/lib/i18n/dashboard/` — add the two copy keys beside `contactPhoneUnusable`

**Interfaces:**
- Consumes: `getDeliverability` (Task 3).

- [ ] **Step 1: Add the copy keys**

Find the catalog entry for `contactPhoneUnusable` and add beside it, in both `he` and `en`:

```
contactEmailUndeliverable → he: 'המייל לא נמסר' / en: 'email undeliverable'
contactEmailUseThePhone   → he: 'אפשר לחייג במקום' / en: 'call instead'
```

- [ ] **Step 2: Load the status alongside the ticket**

In the ticket-detail component, add state and a fetch keyed on the ticket's email:

```tsx
  const [emailDead, setEmailDead] = useState(false);
  useEffect(() => {
    const addr = ticket?.customer_email;
    if (!addr) { setEmailDead(false); return; }
    fetch(`/api/influencer/${username}/email-status?address=${encodeURIComponent(addr)}`)
      .then((r) => r.json())
      .then((d) => setEmailDead(d.status === 'no_mx' || d.status === 'bounced'))
      .catch(() => setEmailDead(false));
  }, [ticket?.customer_email, username]);
```

Create the reading route `src/app/api/influencer/[username]/email-status/route.ts`:

```ts
/**
 * Is this address one we know bounces?
 *
 * Read-only, one address at a time, and behind the same auth as every sibling route in this
 * directory — a customer's address is not public, and an unauthenticated caller could
 * otherwise use this to test which addresses a brand holds.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { getDeliverability } from '@/lib/support/email-deliverability-store';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const auth = await checkInfluencerAuth(req, username);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const address = req.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ status: 'unknown' });
  const map = await getDeliverability([address]);
  const status = [...map.values()][0] || 'unknown';
  return NextResponse.json({ status });
}
```

Check `checkInfluencerAuth`'s real signature first — run
`grep -n "export async function checkInfluencerAuth" -A6 src/lib/auth/influencer-auth.ts`
and match it. Copy the calling convention from
`src/app/api/influencer/[username]/support-tickets/route.ts` rather than the sketch above if
the two disagree; that file is the authority for how this directory authenticates.

- [ ] **Step 3: Render it, mirroring the phone pattern**

Replace the `{customerEmail && (…)}` block at :1449 with a version that strikes the address
through when dead, and change the reachability computation at :1209:

```tsx
  // An address we know bounces is not a contact route, however well-formed it looks.
  const reachable = canWhatsApp || (!!customerEmail && !emailDead);
```

```tsx
        {customerEmail && emailDead && (
          <div className="flex items-center gap-2 text-sm" style={{ color: '#fbbf24' }}>
            <Mail className="w-4 h-4" />
            <span dir="ltr" className="line-through opacity-70">{customerEmail}</span>
            <span className="text-[11px]">
              {t.contactEmailUndeliverable}
              {canWhatsApp ? ` · ${t.contactEmailUseThePhone}` : ''}
            </span>
          </div>
        )}
        {customerEmail && !emailDead && (
          /* …the existing mailto block, unchanged… */
        )}
```

- [ ] **Step 4: Verify in a browser**

`npm run dev`, open Argania's support inbox and find ticket `99bb08a1` (לילי לוי):

1. The email shows struck through with "המייל לא נמסר · אפשר לחייג במקום".
2. The phone `0526936571` is still shown as a live WhatsApp button.
3. Open any other ticket with a working email → it renders as a normal blue `mailto:` link.
   (Companion assertion: a render that struck every address through would pass step 1.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/influencer/[username]/support/page.tsx" "src/app/api/influencer/[username]/email-status/route.ts" src/lib/i18n/dashboard/
git commit -m "feat(inbox): show a dead email struck through and point the agent at the phone"
```

---

### Task 11: Sweep the addresses already stored

**Files:**
- Create: `scripts/verify-stored-emails.ts`

**Interfaces:**
- Consumes: `verifyEmail` (Task 2), `recordDeliverability` (Task 3).

- [ ] **Step 1: Write the script**

Create `scripts/verify-stored-emails.ts`:

```ts
/**
 * One-off sweep: MX-check every address we have stored, and record the verdict.
 *
 * Read-only with respect to customer data — it writes only to email_deliverability, and
 * contacts nobody. The point is that an agent opening an old ticket sees "this address
 * bounces" instead of spending a reply on it.
 *
 * Resumable: re-running skips anything already recorded, so it can be interrupted.
 *
 *   npx tsx scripts/verify-stored-emails.ts [--limit N] [--recheck]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { verifyEmail, normalizeEmail } from '../src/lib/support/email-deliverability';
import { recordDeliverability } from '../src/lib/support/email-deliverability-store';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SOURCES: { table: string; column: string }[] = [
  { table: 'support_requests', column: 'customer_email' },
  { table: 'bestie_leads', column: 'email' },
  { table: 'service_briefs', column: 'email' },
  { table: 'client_contacts', column: 'email' },
];

async function main() {
  const limit = Number(process.argv.includes('--limit') ? process.argv[process.argv.indexOf('--limit') + 1] : 0) || Infinity;
  const recheck = process.argv.includes('--recheck');

  const addresses = new Set<string>();
  for (const { table, column } of SOURCES) {
    const { data, error } = await supabase.from(table).select(column).not(column, 'is', null);
    if (error) { console.error(`[skip] ${table}: ${error.message}`); continue; }
    for (const row of (data as any[]) || []) {
      const a = normalizeEmail(row[column]);
      if (a) addresses.add(a);
    }
    console.log(`${table}.${column}: ${data?.length ?? 0} rows`);
  }

  let known = new Set<string>();
  if (!recheck) {
    const { data } = await supabase.from('email_deliverability').select('address');
    known = new Set(((data as any[]) || []).map((r) => r.address));
  }

  const todo = [...addresses].filter((a) => !known.has(a)).slice(0, limit === Infinity ? undefined : limit);
  console.log(`\n${addresses.size} distinct addresses, ${todo.length} to check\n`);

  const counts: Record<string, number> = {};
  for (let i = 0; i < todo.length; i++) {
    const addr = todo[i];
    const v = await verifyEmail(addr);
    counts[v.status] = (counts[v.status] || 0) + 1;
    // 'unknown' is not recorded: it is a statement about the resolver, not the address.
    if (v.status !== 'unknown') {
      await recordDeliverability(addr, v.status === 'undeliverable' ? 'no_mx' : 'ok');
    }
    if (v.status === 'undeliverable') {
      console.log(`  ✗ ${addr}${(v as any).suggestion ? `  → ${(v as any).suggestion}` : ''}`);
    }
    if ((i + 1) % 100 === 0) console.log(`… ${i + 1}/${todo.length}`);
  }

  console.log('\ndone:', counts);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run against a small slice**

Run: `npx tsx scripts/verify-stored-emails.ts --limit 25`

Expected: it prints per-table row counts, then a verdict tally. Confirm that at least one
known-bad address (`gmail.con`, `gmai.con`, `gamil.com`) is reported with `✗`, **and** that
the tally shows a majority of `ok` — a run that marked everything dead would be a bug, not
a finding.

- [ ] **Step 3: Full run**

Run: `npx tsx scripts/verify-stored-emails.ts`

Then confirm in SQL:

```sql
select status, count(*) from email_deliverability group by 1;
select address, reason from email_deliverability where status <> 'ok' order by address limit 50;
```

Expected: roughly 15–20 `no_mx` rows on our own capture surfaces (spec §2.2), and the
corporate domains from §2.3 all present as `ok`.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-stored-emails.ts
git commit -m "chore(email): sweep stored addresses and record deliverability"
```

---

### Task 12: Full-suite check and push

- [ ] **Step 1: Type-check**

Run: `npm run type-check`
Expected: no new errors. The repo builds with `typescript.ignoreBuildErrors: true`, so this
is the only gate that catches a type mistake.

- [ ] **Step 2: Run the whole unit suite**

Run: `npx vitest run`
Expected: no regressions. `tests/unit/support-contact.test.ts`,
`tests/unit/support-inbound-email.test.ts` and `tests/unit/cs-remember-contact.test.ts` all
touch code this plan changed — they must still pass.

- [ ] **Step 3: Push**

```bash
git push origin main
```
