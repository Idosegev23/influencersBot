# Bestie Inline Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Bestie render inside the customer's own page — a centered invitation in their hero — with the conversation still opening as an overlay, driven entirely by account config so no customer touches their site.

**Architecture:** A third surface for the banner schema that already drives the widget and `/chat`. `public/widget.js` gains a second mount: a `<div>` attached to a customer-chosen element, carrying a shadow root, rendering the resolved banner as a resting invitation. The floating bubble stays exactly as it is and is suppressed while the inline mount is on screen. One widget instance, one session, two renderers.

**Tech Stack:** Vanilla ES5 in `public/widget.js` (no build step — match the surrounding style: `var`, `function`, string concatenation, no arrow functions or template literals). TypeScript + Vitest/jsdom for everything under `src/` and `tests/`.

**Spec:** `docs/superpowers/specs/2026-08-24-bestie-inline-surface-design.md`

## Global Constraints

- **`public/widget.js` must never break the host page.** Every new code path is wrapped in `try/catch`. Failures call the existing `report()` diagnostics helper; they never `throw`.
- **ES5 only in `public/widget.js`.** It is served raw to browsers with no transpilation.
- **Absence means today's behavior.** An account with no `config.widget.inline` must produce byte-identical behavior to what ships now. Every task must preserve this.
- **Never set `font-family` inside the inline shadow root.** Inherited properties cross the shadow boundary; that inheritance *is* the type theming.
- **The inline surface's art mode is always `host`.** We draw no background and play no reel there. (The spec scopes this to `into`/`overlay`; this plan narrows further to the whole inline surface — `replace`/`bar` draws no art either way, and a single rule cannot be got wrong.)
- **Mount failure is never silent.** A missing selector falls back to the floating bubble *and* reports.
- **Preview events are not installs.** Any event emitted while `enabled === 'preview'` carries `preview: true`.
- Run a single test file with `npx vitest run <path>` — `npm run test` is watch mode.

---

### Task 1: `inline` becomes a banner surface, with `art: "host"`

**Files:**
- Modify: `src/lib/widget/banner.ts`
- Test: `tests/unit/widget/banner-inline.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `BannerSurface` now includes `'inline'`; `BannerArtMode` now includes `'host'`. `resolveBanner(config, 'inline', ctx, now)` returns a `ResolvedBanner` whose `art.mode === 'host'`, inheriting `config.widget.banner` the way `'chat'` does.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/banner-inline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveBanner } from '@/lib/widget/banner';

const CTX = { brandName: 'LDRS' };

describe('the inline banner surface', () => {
  it('inherits the widget banner, as chat does', () => {
    const config = { widget: { banner: { headline: 'ספרו לי על המותג שלכם' } } };
    const b = resolveBanner(config, 'inline', CTX)!;
    expect(b.headline).toBe('ספרו לי על המותג שלכם');
  });

  it('forces art mode to host — the page behind us owns the background', () => {
    const config = {
      widget: { banner: { headline: 'x', art: { mode: 'gradient', from: '#111', to: '#222' } } },
    };
    expect(resolveBanner(config, 'inline', CTX)!.art.mode).toBe('host');
  });

  it('never returns a reel rotation on the inline surface', () => {
    // Two autoplaying videos in one hero is the failure this prevents.
    const config = {
      widget: { banner: { headline: 'x' } },
      reels: [{ video: 'https://example.com/a.mp4', poster: null }],
    };
    const art = resolveBanner(config, 'inline', CTX)!.art;
    expect(art.mode).toBe('host');
    expect(art.reels).toBeNull();
  });

  it('still gives the widget surface its own art, untouched', () => {
    const config = {
      widget: { banner: { headline: 'x', art: { mode: 'gradient', from: '#111', to: '#222' } } },
    };
    expect(resolveBanner(config, 'widget', CTX)!.art.mode).toBe('gradient');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/banner-inline.test.ts`
Expected: FAIL — TypeScript rejects `'inline'` as a `BannerSurface`, and `art.mode` is `'gradient'`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/widget/banner.ts`, widen the two type unions:

```ts
export type BannerSurface = 'widget' | 'chat' | 'inline';
export type BannerArtMode = 'gradient' | 'image' | 'video' | 'host';
```

In `resolveBanner`, the line that picks the surface's own banner currently reads:

```ts
const own = surface === 'chat' ? config?.chat?.banner : widgetConfig.banner;
```

`'inline'` has no banner of its own, so it must fall to the widget's — which that expression already does. Then, immediately before the function returns its `ResolvedBanner`, override the art:

```ts
  // The inline surface sits inside the customer's own layout. Whatever is
  // behind it — a Webflow background video, a photo, a gradient section — is
  // theirs and is already painted. Drawing our own art there would stack a
  // second autoplaying video on top of theirs.
  if (surface === 'inline') {
    resolved.art = { ...resolved.art, mode: 'host', image: null, reels: null };
  }
  return resolved;
```

Name `resolved` to match whatever the existing local is called at that point; do not restructure the function.

Also widen `activeOverrides`' surface filter so an override written for `both` or `widget` applies to `inline`. Find the comparison that tests `o.surface` and treat `'inline'` as satisfied by `'widget'` and `'both'`:

```ts
function surfaceMatches(want: BannerSurface, got: string | undefined): boolean {
  const s = got || 'both';
  if (s === 'both') return true;
  // The inline surface has no overrides of its own; it follows the widget's.
  if (want === 'inline') return s === 'widget';
  return s === want;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/banner-inline.test.ts tests/unit/widget/banner-resolve.test.ts tests/unit/widget/banner-invitation.test.ts`
Expected: PASS — including the two pre-existing files, which must not regress.

- [ ] **Step 5: Type-check and commit**

```bash
npm run type-check
git add src/lib/widget/banner.ts tests/unit/widget/banner-inline.test.ts
git commit -m "feat(widget): add inline banner surface with host art mode"
```

---

### Task 2: `resolveInlineMount` — the config resolver

**Files:**
- Create: `src/lib/widget/inline.ts`
- Test: `tests/unit/widget/inline-resolve.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type InlineEnabled = true | 'preview'`
  - `type InlineMountMode = 'into' | 'replace' | 'overlay'`
  - `type InlinePreset = 'hero' | 'bar'`
  - `type InlineTreatment = 'bare' | 'glass' | 'solid'`
  - `interface ResolvedInlineMount { enabled: InlineEnabled; selector: string; mode: InlineMountMode; preset: InlinePreset; surface: InlineTreatment; reserve: { desktop: number; mobile: number }; theme: { font: string; accent: string | null; radius: number | null; ground: 'light' | 'dark' }; bubble: 'after-scroll' | 'always' | 'never' }`
  - `function resolveInlineMount(config: any): ResolvedInlineMount | null`
  - `function isStableSelector(sel: string): boolean`
  - `function chipBudget(viewportWidth: number): number`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/inline-resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveInlineMount, isStableSelector, chipBudget } from '@/lib/widget/inline';

const LDRS = {
  widget: {
    inline: {
      enabled: true,
      selector: '.content_home-c-hero',
      mode: 'into',
      preset: 'hero',
      surface: 'bare',
      reserve: { desktop: 0, mobile: 0 },
      theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
      bubble: 'after-scroll',
    },
  },
};

describe('resolveInlineMount', () => {
  it('returns null when the account has no inline config — today behavior', () => {
    expect(resolveInlineMount({})).toBeNull();
    expect(resolveInlineMount({ widget: {} })).toBeNull();
    expect(resolveInlineMount(null)).toBeNull();
  });

  it('returns null when explicitly disabled', () => {
    expect(resolveInlineMount({ widget: { inline: { enabled: false, selector: '#x' } } })).toBeNull();
  });

  it('returns null when there is no selector to mount against', () => {
    expect(resolveInlineMount({ widget: { inline: { enabled: true } } })).toBeNull();
  });

  it('resolves the LDRS config verbatim', () => {
    expect(resolveInlineMount(LDRS)).toEqual(LDRS.widget.inline);
  });

  it('keeps the preview tri-state distinct from true', () => {
    const cfg = { widget: { inline: { enabled: 'preview', selector: '#x' } } };
    expect(resolveInlineMount(cfg)!.enabled).toBe('preview');
  });

  it('falls back to safe defaults for every optional field', () => {
    const r = resolveInlineMount({ widget: { inline: { enabled: true, selector: '#x' } } })!;
    expect(r.mode).toBe('into');
    expect(r.preset).toBe('hero');
    expect(r.surface).toBe('bare');
    expect(r.bubble).toBe('after-scroll');
    expect(r.theme.font).toBe('inherit');
    expect(r.reserve).toEqual({ desktop: 0, mobile: 0 });
  });

  it('rejects unknown enum values rather than passing them to the browser', () => {
    const r = resolveInlineMount({
      widget: { inline: { enabled: true, selector: '#x', mode: 'teleport', preset: 'carousel', surface: 'neon' } },
    })!;
    expect(r.mode).toBe('into');
    expect(r.preset).toBe('hero');
    expect(r.surface).toBe('bare');
  });

  it('drops an accent that is not a hex colour', () => {
    const cfg = { widget: { inline: { enabled: true, selector: '#x', theme: { accent: 'javascript:alert(1)' } } } };
    expect(resolveInlineMount(cfg)!.theme.accent).toBeNull();
  });

  it('clamps a nonsense reserve', () => {
    const cfg = { widget: { inline: { enabled: true, selector: '#x', reserve: { desktop: -40, mobile: 99999 } } } };
    expect(resolveInlineMount(cfg)!.reserve).toEqual({ desktop: 0, mobile: 2000 });
  });

  it('refuses a selector long enough to be a payload', () => {
    const cfg = { widget: { inline: { enabled: true, selector: '#a'.repeat(300) } } };
    expect(resolveInlineMount(cfg)).toBeNull();
  });
});

describe('isStableSelector', () => {
  it('accepts an id and a single readable class', () => {
    expect(isStableSelector('#hero-search')).toBe(true);
    expect(isStableSelector('.content_home-c-hero')).toBe(true);
  });

  it('rejects a deep nth-child chain — it breaks on the next publish', () => {
    expect(isStableSelector('div > div:nth-child(2) > div:nth-child(4) > span')).toBe(false);
  });

  it('rejects a builder-generated hash class', () => {
    expect(isStableSelector('.css-1x9f3ab')).toBe(false);
    expect(isStableSelector('.w-node-a1b2c3d4e5f6-7a8b9c0d')).toBe(false);
  });
});

describe('chipBudget', () => {
  it('gives three chips the room they need on desktop', () => {
    expect(chipBudget(1440)).toBe(3);
  });

  it('drops to two on a phone so the pill stays above the fold', () => {
    expect(chipBudget(390)).toBe(2);
  });

  it('drops to none on the narrowest phones', () => {
    expect(chipBudget(320)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/inline-resolve.test.ts`
Expected: FAIL — `Cannot find module '@/lib/widget/inline'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/widget/inline.ts`:

```ts
/**
 * The inline mount — where, and in what shape, Bestie renders inside the
 * customer's own page.
 *
 * This module is the only place that decides what a stored `config.widget.inline`
 * means. `public/widget.js` receives the resolved object from
 * /api/widget/config and does no interpretation of its own, so a malformed
 * value can never reach a customer's DOM.
 */

export type InlineEnabled = true | 'preview';
export type InlineMountMode = 'into' | 'replace' | 'overlay';
export type InlinePreset = 'hero' | 'bar';
export type InlineTreatment = 'bare' | 'glass' | 'solid';
export type InlineBubble = 'after-scroll' | 'always' | 'never';

export interface ResolvedInlineTheme {
  /** 'inherit' means: set no font-family at all and let the host page cascade in. */
  font: string;
  accent: string | null;
  radius: number | null;
  ground: 'light' | 'dark';
}

export interface ResolvedInlineMount {
  enabled: InlineEnabled;
  selector: string;
  mode: InlineMountMode;
  preset: InlinePreset;
  surface: InlineTreatment;
  reserve: { desktop: number; mobile: number };
  theme: ResolvedInlineTheme;
  bubble: InlineBubble;
}

const MAX_SELECTOR = 200;
const MAX_RESERVE = 2000;

const MODES: InlineMountMode[] = ['into', 'replace', 'overlay'];
const PRESETS: InlinePreset[] = ['hero', 'bar'];
const TREATMENTS: InlineTreatment[] = ['bare', 'glass', 'solid'];
const BUBBLES: InlineBubble[] = ['after-scroll', 'always', 'never'];

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function hex(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * A selector we are willing to store. The failure we are guarding against is
 * not injection — it is a selector that silently stops matching when the
 * customer republishes their site. Builder-generated hashes and deep
 * positional chains are exactly the ones that do.
 */
export function isStableSelector(sel: string): boolean {
  if (!sel || sel.length > MAX_SELECTOR) return false;
  if ((sel.match(/:nth-child/g) || []).length > 1) return false;
  // Known builder prefixes, whatever they generate after the dash. Matching on
  // hex alone misses emotion's base36 (`.css-1x9f3ab`), which is exactly the
  // kind of class that changes on the customer's next build.
  if (/\.(css|sc|w-node|jsx|emotion)-[0-9a-z]{4,}/i.test(sel)) return false;
  // A bare generated hash with no prefix.
  if (/\.[A-Za-z_-]*[0-9a-f]{8,}/.test(sel)) return false;
  return true;
}

/**
 * How many starter chips fit without pushing the input below the fold.
 * The rule from the design: the pill stays above the fold, the chips are
 * expendable.
 */
export function chipBudget(viewportWidth: number): number {
  if (viewportWidth >= 640) return 3;
  if (viewportWidth >= 360) return 2;
  return 0;
}

export function resolveInlineMount(config: any): ResolvedInlineMount | null {
  const raw = config?.widget?.inline;
  if (!raw || typeof raw !== 'object') return null;

  // Tri-state. `true` and 'preview' both mount; anything else does not, which
  // keeps "absent" and "off" on the same, safe side.
  const enabled: InlineEnabled | null =
    raw.enabled === true ? true : raw.enabled === 'preview' ? 'preview' : null;
  if (!enabled) return null;

  const selector = typeof raw.selector === 'string' ? raw.selector.trim() : '';
  if (!selector || selector.length > MAX_SELECTOR) return null;

  const theme = raw.theme || {};
  return {
    enabled,
    selector,
    mode: oneOf(raw.mode, MODES, 'into'),
    preset: oneOf(raw.preset, PRESETS, 'hero'),
    surface: oneOf(raw.surface, TREATMENTS, 'bare'),
    reserve: {
      desktop: clampNumber(raw.reserve?.desktop, 0, MAX_RESERVE, 0),
      mobile: clampNumber(raw.reserve?.mobile, 0, MAX_RESERVE, 0),
    },
    theme: {
      font: typeof theme.font === 'string' && theme.font ? theme.font : 'inherit',
      accent: hex(theme.accent),
      radius: theme.radius === null || theme.radius === undefined
        ? null
        : clampNumber(theme.radius, 0, 999, 0),
      ground: theme.ground === 'light' ? 'light' : 'dark',
    },
    bubble: oneOf(raw.bubble, BUBBLES, 'after-scroll'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/widget/inline-resolve.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
npm run type-check
git add src/lib/widget/inline.ts tests/unit/widget/inline-resolve.test.ts
git commit -m "feat(widget): resolver for the inline mount config"
```

---

### Task 3: `/api/widget/config` serves the resolved inline mount

**Files:**
- Modify: `src/app/api/widget/config/route.ts`
- Test: `tests/unit/widget/inline-config-route.test.ts` (create)

**Interfaces:**
- Consumes: `resolveInlineMount` and `ResolvedInlineMount` from Task 2; `resolveBanner(config, 'inline', ctx)` from Task 1.
- Produces: the config response gains a top-level `inline` key — `null`, or `ResolvedInlineMount & { banner: ResolvedBanner | null }`. `public/widget.js` reads `data.inline` in Task 5.

- [ ] **Step 1: Write the failing test**

The widget test folder tests pure modules, not routes (see `banner-resolve.test.ts`). Follow that: put the composition in a pure helper and test it.

Create `tests/unit/widget/inline-config-route.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildInlinePayload } from '@/lib/widget/inline';

describe('buildInlinePayload', () => {
  it('is null for an account with no inline config', () => {
    expect(buildInlinePayload({}, { brandName: 'LDRS' })).toBeNull();
  });

  it('carries the resolved mount and its own banner', () => {
    const config = {
      widget: {
        banner: { headline: 'ספרו לי על המותג שלכם' },
        inline: { enabled: true, selector: '.content_home-c-hero', preset: 'hero' },
      },
    };
    const payload = buildInlinePayload(config, { brandName: 'LDRS' })!;
    expect(payload.selector).toBe('.content_home-c-hero');
    expect(payload.preset).toBe('hero');
    expect(payload.banner!.headline).toBe('ספרו לי על המותג שלכם');
    expect(payload.banner!.art.mode).toBe('host');
  });

  it('still mounts when the account has no banner copy at all', () => {
    // The host page supplies the headline on LDRS; a missing banner must not
    // stop the input from rendering.
    const config = { widget: { inline: { enabled: true, selector: '#x' } } };
    const payload = buildInlinePayload(config, { brandName: 'LDRS' })!;
    expect(payload.selector).toBe('#x');
    expect(payload.banner).toBeNull();
  });
});

describe('the config route wires it up', () => {
  it('returns inline in the response body', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/widget/config/route.ts', 'utf8'),
    );
    expect(src).toContain('buildInlinePayload');
    expect(src).toContain('inline:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/inline-config-route.test.ts`
Expected: FAIL — `buildInlinePayload` is not exported from `@/lib/widget/inline`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/widget/inline.ts`:

```ts
import { resolveBanner, type BannerContext, type ResolvedBanner } from './banner';

export interface InlinePayload extends ResolvedInlineMount {
  /** null when the account has no banner copy — the host page supplies the headline. */
  banner: ResolvedBanner | null;
}

/**
 * What /api/widget/config sends to the browser for the inline surface: the
 * mount, plus the banner resolved for it (art already forced to `host`).
 */
export function buildInlinePayload(
  config: any,
  ctx: BannerContext = {},
  now: Date = new Date(),
): InlinePayload | null {
  const mount = resolveInlineMount(config);
  if (!mount) return null;
  return { ...mount, banner: resolveBanner(config, 'inline', ctx, now) };
}
```

In `src/app/api/widget/config/route.ts`, add the import beside the existing banner import:

```ts
import { buildInlinePayload } from '@/lib/widget/inline';
```

Resolve it next to where `resolveBanner`/`resolveInvitation` are already called:

```ts
    // The inline surface. `null` for every account that has not opted in,
    // which is all of them until a mount is configured — so the widget's
    // behavior is unchanged by this field's mere presence.
    const inline = buildInlinePayload(config, { brandName: widgetConfig.brandName ?? null });
```

and add `inline,` to the response object returned by `NextResponse.json({ ... })`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/`
Expected: PASS — the whole widget folder, so Task 1 and 2 are still green.

- [ ] **Step 5: Commit**

```bash
npm run type-check
git add src/lib/widget/inline.ts src/app/api/widget/config/route.ts tests/unit/widget/inline-config-route.test.ts
git commit -m "feat(widget): serve the resolved inline mount from the config API"
```

---

### Task 4: A jsdom harness that boots `public/widget.js`

**Files:**
- Create: `tests/unit/widget/helpers/boot-widget.ts`
- Test: `tests/unit/widget/widget-boot.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `bootWidget(options): Promise<BootedWidget>` — used by Tasks 5–8 to exercise `public/widget.js` against a fake host page.
  - `interface BootOptions { accountId?: string; html?: string; config?: any; viewportWidth?: number; search?: string }`
  - `interface BootedWidget { container: HTMLElement | null; inlineHost: HTMLElement | null; reports: Array<{ type: string; message: string }> }`

`public/widget.js` is served raw and has never had DOM-level tests — only source-text assertions (`tests/unit/value-proof-beacon.test.ts`). The inline mount is the first feature whose correctness *is* DOM placement, so it needs a real one. This harness is the reason the following tasks can be TDD'd at all.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/widget-boot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

describe('booting public/widget.js in jsdom', () => {
  it('mounts the floating container on body when there is no inline config', async () => {
    const w = await bootWidget({ config: { inline: null } });
    expect(w.container).not.toBeNull();
    expect(w.container!.parentElement).toBe(document.body);
    expect(w.container!.style.position).toBe('fixed');
  });

  it('renders the launcher', async () => {
    await bootWidget({ config: { inline: null } });
    expect(document.getElementById('ibot-trigger')).not.toBeNull();
  });

  it('reports nothing on a clean boot', async () => {
    const w = await bootWidget({ config: { inline: null } });
    expect(w.reports).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/widget-boot.test.ts`
Expected: FAIL — `Cannot find module './helpers/boot-widget'`.

- [ ] **Step 3: Write minimal implementation**

Create `tests/unit/widget/helpers/boot-widget.ts`:

```ts
/**
 * Boots public/widget.js inside jsdom against a fake host page.
 *
 * widget.js is an IIFE that reads document.currentScript on the first line and
 * returns early without a data-account-id, so it cannot simply be imported. We
 * stand up the globals a browser would provide, define currentScript, then
 * evaluate the file.
 */
import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

export interface BootOptions {
  accountId?: string;
  /** Markup for the fake customer page, written into document.body. */
  html?: string;
  /** Body of the /api/widget/config response. Merged over a minimal default. */
  config?: any;
  viewportWidth?: number;
  /** Query string for the fake page, e.g. '?bestie=1'. */
  search?: string;
}

export interface BootedWidget {
  container: HTMLElement | null;
  inlineHost: HTMLElement | null;
  reports: Array<{ type: string; message: string }>;
}

const ACCOUNT = '00000000-0000-4000-8000-00000000dead';

export async function bootWidget(opts: BootOptions = {}): Promise<BootedWidget> {
  const accountId = opts.accountId || ACCOUNT;
  const width = opts.viewportWidth ?? 1440;
  const reports: Array<{ type: string; message: string }> = [];

  document.head.innerHTML = '';
  document.body.innerHTML = opts.html || '';

  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

  // jsdom implements neither of these; widget.js calls both unguarded.
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({
        matches: false, media: q, onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      }),
    });
  }
  if (!(window as any).IntersectionObserver) {
    (window as any).IntersectionObserver = class {
      constructor(private cb: any) { OBSERVERS.push(this); }
      observe() {}
      disconnect() {}
      fire(isIntersecting: boolean) { this.cb([{ isIntersecting }]); }
    };
  }

  // Diagnostics are a POST; capture them instead of asserting on network calls.
  const configBody = {
    language: 'he', enabled: true, theme: {}, modules: {},
    banner: null, invitation: null, socialLinks: [], inline: null,
    ...(opts.config || {}),
  };

  (global.fetch as any) = vi.fn((url: string, init?: any) => {
    const u = String(url);
    if (u.includes('/api/widget/diagnostics')) {
      try {
        const body = JSON.parse(init?.body || '{}');
        reports.push({ type: body.type, message: body.message });
      } catch { /* a malformed report is still a report we did not want */ }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    if (u.includes('/api/widget/config')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(configBody) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  // sendBeacon is the diagnostics fast path; route it through the same capture.
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string, body: string) => {
      if (String(url).includes('/api/widget/diagnostics')) {
        try { const b = JSON.parse(body); reports.push({ type: b.type, message: b.message }); } catch { /* */ }
      }
      return true;
    },
  });

  const script = document.createElement('script');
  script.setAttribute('data-account-id', accountId);
  if (opts.search) {
    // widget.js reads location.search for the preview gate.
    window.history.replaceState({}, '', '/' + opts.search);
  }
  Object.defineProperty(script, 'src', {
    value: 'https://influencers-bot.vercel.app/widget.js',
    configurable: true,
  });
  document.head.appendChild(script);
  Object.defineProperty(document, 'currentScript', { value: script, configurable: true });

  const src = readFileSync('public/widget.js', 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src)();

  // Let the config fetch's promise chain settle.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  return {
    container: document.getElementById('ibot-widget-container'),
    inlineHost: document.querySelector('[data-bestie-inline]'),
    reports,
  };
}

/** Every IntersectionObserver the harness handed to widget.js, newest last. */
export const OBSERVERS: any[] = [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/widget/widget-boot.test.ts`
Expected: PASS (3 tests).

If a test fails because `widget.js` touches another API jsdom lacks, add the stub to the harness — do not change `widget.js` to suit the test.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/widget/helpers/boot-widget.ts tests/unit/widget/widget-boot.test.ts
git commit -m "test(widget): jsdom harness that boots public/widget.js"
```

---

### Task 5: Mount resolution — found, missing, late

**Files:**
- Modify: `public/widget.js`
- Test: `tests/unit/widget/inline-mount.test.ts` (create)

**Interfaces:**
- Consumes: `bootWidget`/`OBSERVERS` (Task 4); `data.inline` from the config API (Task 3).
- Produces, inside the `public/widget.js` IIFE: `var INLINE` (the resolved payload or `null`), `var inlineHost` (the created element or `null`), `function resolveInlineTarget()`, `function mountInline(target)`, `function watchInlineVisibility()`. Task 6 renders into `inlineHost`.

The created element carries `data-bestie-inline` so tests and the customer's own devtools can find it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/inline-mount.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bootWidget, OBSERVERS } from './helpers/boot-widget';

const HERO = '<section><div class="content_home-c-hero"><h1>We Turn Brands Into Leaders</h1></div></section>';
const MOUNT = { enabled: true, selector: '.content_home-c-hero', mode: 'into', preset: 'hero', surface: 'bare',
  reserve: { desktop: 0, mobile: 0 }, theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll', banner: null };

describe('inline mount resolution', () => {
  it('appends into the target as its last child', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const target = document.querySelector('.content_home-c-hero')!;
    expect(w.inlineHost).not.toBeNull();
    expect(w.inlineHost!.parentElement).toBe(target);
    expect(target.lastElementChild).toBe(w.inlineHost);
  });

  it('does not touch the host element styles in `into` mode', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const target = document.querySelector('.content_home-c-hero') as HTMLElement;
    expect(target.getAttribute('style')).toBeNull();
  });

  it('falls back to the floating bubble and reports when the selector misses', async () => {
    const w = await bootWidget({
      html: '<section><div class="renamed-by-webflow"></div></section>',
      config: { inline: MOUNT },
    });
    expect(w.inlineHost).toBeNull();
    expect(document.getElementById('ibot-trigger')).not.toBeNull();
    expect(w.reports.map((r) => r.type)).toContain('inline_mount_missing');
  });

  it('hides the floating bubble while the inline mount is on screen', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const container = document.getElementById('ibot-widget-container')!;
    expect(container.style.display).toBe('none');
  });

  it('brings the bubble back once the mount is fully out of view', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    OBSERVERS[OBSERVERS.length - 1].fire(false);
    expect(document.getElementById('ibot-widget-container')!.style.display).not.toBe('none');
  });

  it('keeps the bubble visible from the start when bubble is "always"', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, bubble: 'always' } } });
    expect(document.getElementById('ibot-widget-container')!.style.display).not.toBe('none');
  });

  it('sets position:relative only in overlay mode', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, mode: 'overlay' } } });
    const target = document.querySelector('.content_home-c-hero') as HTMLElement;
    expect(target.style.position).toBe('relative');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/inline-mount.test.ts`
Expected: FAIL — `w.inlineHost` is `null`; nothing reads `data.inline` yet.

- [ ] **Step 3: Write minimal implementation**

In `public/widget.js`, beside the other state declarations near the top (`var isOpen = false;` … ), add:

```js
  // ---- Inline surface -------------------------------------------------------
  // Resolved by /api/widget/config; null for every account that has not opted
  // in, which is the state that reproduces today's behavior exactly.
  var INLINE = null;
  var inlineHost = null;      // the <div> we create inside the customer's page
  var inlineRoot = null;      // its shadow root (Task 6)
  var inlineVisible = false;  // is the mount currently on screen?
```

In the config `.then(...)` block, after the `config.enabled = data.enabled !== false;` line and **before** `widgetTrack('widget_loaded', ...)`, add:

```js
      if (data.inline && data.inline.selector) {
        INLINE = data.inline;
        try { setupInline(); } catch (e) { report('inline_setup_failed', e); }
      }
```

Then add the functions, next to `updateContainerPosition`:

```js
  // Resolve the customer's chosen element. Deliberately tolerant: a selector
  // that no longer matches is a fallback, never an exception.
  function resolveInlineTarget() {
    try {
      return document.querySelector(INLINE.selector);
    } catch (e) {
      report('inline_selector_invalid', { message: INLINE.selector });
      return null;
    }
  }

  function setupInline() {
    var target = resolveInlineTarget();
    if (target) { mountInline(target); return; }

    // The element may not exist yet — SPA routing, lazy hydration, a builder
    // that paints the hero after first paint. Watch briefly, then give up
    // loudly rather than leaving a hole where the hero used to be.
    var settled = false;
    var mo = new MutationObserver(function () {
      if (settled) return;
      var el = resolveInlineTarget();
      if (!el) return;
      settled = true;
      mo.disconnect();
      mountInline(el);
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { /* */ }
    setTimeout(function () {
      if (settled) return;
      settled = true;
      try { mo.disconnect(); } catch (e) { /* */ }
      // Falls through to the floating bubble, which is already mounted.
      report('inline_mount_missing', { message: INLINE.selector });
    }, 5000);
  }

  function mountInline(target) {
    inlineHost = document.createElement('div');
    inlineHost.setAttribute('data-bestie-inline', INLINE.preset);
    // The host box carries no font-family: inherited properties cross the
    // shadow boundary, and that inheritance IS how we speak the site's type.
    inlineHost.style.cssText = 'all:initial;display:block;width:100%;font:inherit;color:inherit;';

    var reserve = window.innerWidth < 640 ? INLINE.reserve.mobile : INLINE.reserve.desktop;
    if (reserve > 0) inlineHost.style.minHeight = reserve + 'px';

    if (INLINE.mode === 'replace') {
      if (target.parentNode) target.parentNode.replaceChild(inlineHost, target);
    } else if (INLINE.mode === 'overlay') {
      // The only mode that touches the customer's styles, and only when the
      // element gives us no positioning context of its own.
      var pos = window.getComputedStyle(target).position;
      if (pos === 'static') target.style.position = 'relative';
      inlineHost.style.position = 'absolute';
      inlineHost.style.inset = '0';
      inlineHost.style.zIndex = '5';
      target.appendChild(inlineHost);
    } else {
      target.appendChild(inlineHost);
    }

    inlineRoot = inlineHost.attachShadow({ mode: 'open' });
    renderInline();                 // Task 6 supplies this
    watchInlineVisibility(target);
  }

  // The bubble and the inline mount are the same conversation; showing both at
  // once reads as two assistants. While the mount is on screen the bubble
  // stands down, and it returns once the mount is fully out of view.
  function watchInlineVisibility(target) {
    if (INLINE.bubble === 'always') return;
    if (INLINE.bubble === 'never') { container.style.display = 'none'; return; }

    var apply = function (onScreen) {
      inlineVisible = onScreen;
      // Never hide the bubble while the visitor has the panel open.
      container.style.display = onScreen && !isOpen ? 'none' : '';
    };
    apply(true);

    if (!window.IntersectionObserver) return;   // no observer → bubble stays hidden, mount is present
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) apply(entries[i].isIntersecting);
    }, { threshold: 0 });
    io.observe(inlineHost);
  }
```

Add a placeholder `renderInline` so this task is independently runnable; Task 6 replaces its body:

```js
  function renderInline() {
    if (!inlineRoot) return;
    inlineRoot.innerHTML = '';
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/inline-mount.test.ts tests/unit/widget/widget-boot.test.ts`
Expected: PASS — including `widget-boot.test.ts`, which proves the no-inline path is untouched.

- [ ] **Step 5: Commit**

```bash
git add public/widget.js tests/unit/widget/inline-mount.test.ts
git commit -m "feat(widget): resolve and mount the inline surface, with a loud fallback"
```

---

### Task 6: The resting invitation — shadow root, pill, chips

**Files:**
- Modify: `public/widget.js`
- Test: `tests/unit/widget/inline-render.test.ts` (create)

**Interfaces:**
- Consumes: `INLINE`, `inlineRoot`, `inlineHost` (Task 5); `chipBudget` semantics from Task 2 (reimplemented in ES5 here — `public/widget.js` cannot import TypeScript; the rule is duplicated deliberately and both copies are tested).
- Produces: `function renderInline()` (real body), `function inlineStylesCss()`, `function inlinePillHtml()`, `function inlineChipCount()`. Task 7 attaches the open handler to `#ibot-inline-pill`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/inline-render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

const HERO = '<section><div class="content_home-c-hero"><h1>We Turn Brands Into Leaders</h1></div></section>';
const BANNER = {
  eyebrow: null, headline: 'ספרו לי על המותג שלכם', subline: null, valueLine: null, cta: null,
  art: { mode: 'host', image: null, reels: null, from: '#000', to: '#000' },
  starters: { label: null, items: ['אני מותג', 'אני יוצר תוכן', 'כמה זה עולה?'] },
};
const MOUNT = {
  enabled: true, selector: '.content_home-c-hero', mode: 'into', preset: 'hero', surface: 'bare',
  reserve: { desktop: 0, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll', banner: BANNER,
};

function root() {
  return (document.querySelector('[data-bestie-inline]') as HTMLElement).shadowRoot!;
}

describe('the inline resting state', () => {
  it('renders into a shadow root, not the customer DOM', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(w.inlineHost!.shadowRoot).not.toBeNull();
    expect(w.inlineHost!.innerHTML).toBe('');
  });

  it('renders the input pill', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
  });

  it('never sets a font-family — the host page owns the type', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    // Assert on our stylesheet specifically. avatarHtml() is shared with the
    // floating widget and may carry its own inline styles; what must not
    // happen is our shadow CSS declaring a family and blocking inheritance.
    const css = root().querySelector('style')!.textContent!;
    expect(css).not.toContain('font-family');
  });

  it('shows three starter chips on desktop', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT }, viewportWidth: 1440 });
    expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(3);
  });

  it('drops to two chips on a phone so the pill stays above the fold', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT }, viewportWidth: 390 });
    expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(2);
  });

  it('renders the pill even with no banner copy at all', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, banner: null } } });
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
  });

  it('omits the headline when the host page already has one', async () => {
    // preset `hero` on LDRS sits under their own H1; ours would be a second one.
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(root().querySelectorAll('h2')).toHaveLength(0);
  });

  it('draws no background of its own — art is host', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(root().querySelector('video')).toBeNull();
    expect(root().innerHTML).not.toContain('background-image');
  });

  it('bar preset renders no chips', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, preset: 'bar' } } });
    expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/inline-render.test.ts`
Expected: FAIL — the shadow root is empty (`renderInline` is the Task 5 placeholder).

- [ ] **Step 3: Write minimal implementation**

In `public/widget.js`, replace the placeholder `renderInline` with:

```js
  // How many starter chips fit without pushing the pill below the fold. Mirrors
  // chipBudget() in src/lib/widget/inline.ts — widget.js cannot import it, so
  // both copies carry their own test.
  function inlineChipCount() {
    var w = window.innerWidth;
    if (w >= 640) return 3;
    if (w >= 360) return 2;
    return 0;
  }

  // Styles for the shadow root. Deliberately omits font-family: inherited
  // properties cross the shadow boundary, so the host page's type comes to us
  // for free and the widget looks native without any configuration.
  function inlineStylesCss() {
    var t = INLINE.theme;
    var light = t.ground === 'light';
    var ink = light ? '#141413' : '#f5f4f1';
    var fill = light ? 'rgba(20,20,19,0.06)' : 'rgba(245,244,241,0.11)';
    var edge = light ? 'rgba(20,20,19,0.18)' : 'rgba(245,244,241,0.26)';
    var glass = INLINE.surface === 'glass';
    var solid = INLINE.surface === 'solid';
    var solidBg = light ? '#ffffff' : '#141413';
    var radius = t.radius === null ? 999 : t.radius;

    return ':host{display:block;width:100%;}' +
      '*{box-sizing:border-box;}' +
      '.wrap{display:flex;flex-direction:column;align-items:center;width:100%;' +
        'direction:' + locale.dir + ';}' +
      '.pane{width:100%;max-width:560px;' +
        (glass
          ? 'background:' + fill + ';border:1px solid ' + edge + ';border-radius:22px;padding:16px;' +
            'backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);'
          : solid
            ? 'background:' + solidBg + ';border:1px solid ' + edge + ';border-radius:22px;padding:16px;' +
              'box-shadow:0 10px 30px rgba(0,0,0,0.18);'
            : '') + '}' +
      // No backdrop-filter support, or a visitor who asked for less
      // transparency: fall back to an opaque panel rather than an unreadable one.
      (glass
        ? '@supports not (backdrop-filter:blur(2px)){.pane{background:' +
            (light ? 'rgba(245,244,241,0.94)' : 'rgba(12,12,14,0.9)') + ';}}' +
          '@media (prefers-reduced-transparency:reduce){.pane{background:' +
            (light ? 'rgba(245,244,241,0.96)' : 'rgba(12,12,14,0.94)') + ';backdrop-filter:none;}}'
        : '') +
      '.pill{display:flex;align-items:center;gap:10px;width:100%;cursor:text;' +
        'padding:12px 14px 12px 6px;border-radius:' + radius + 'px;' +
        'background:' + fill + ';border:1px solid ' + edge + ';color:' + ink + ';' +
        'transition:border-color .18s ease,transform .18s ease;}' +
      '.pill:hover,.pill:focus-visible{border-color:' + (light ? 'rgba(20,20,19,0.4)' : 'rgba(245,244,241,0.5)') + ';}' +
      '.pill:active{transform:scale(0.995);}' +
      '.pill:focus-visible{outline:2px solid ' + (t.accent || ink) + ';outline-offset:2px;}' +
      '.ph{flex:1;text-align:' + (locale.dir === 'rtl' ? 'right' : 'left') + ';opacity:.62;font-size:15px;}' +
      '.av{width:28px;height:28px;border-radius:999px;flex:none;display:grid;place-items:center;' +
        'overflow:hidden;background:' + (t.accent || '#9334EB') + ';color:#fff;font-size:11px;font-weight:700;}' +
      '.go{width:34px;height:34px;border-radius:999px;flex:none;display:grid;place-items:center;' +
        'background:' + ink + ';color:' + (light ? '#f5f4f1' : '#141413') + ';font-size:15px;}' +
      '.chips{display:flex;gap:8px;margin-top:10px;justify-content:center;flex-wrap:wrap;}' +
      '.chip{font-size:12.5px;padding:7px 14px;border-radius:999px;cursor:pointer;' +
        'border:1px solid ' + edge + ';background:' + fill + ';color:' + ink + ';' +
        'min-height:32px;display:inline-flex;align-items:center;}' +
      '@media (max-width:639px){.chip{min-height:44px;}.pill{min-height:52px;}}' +
      '@media (prefers-reduced-motion:reduce){.pill{transition:none;}}';
  }

  function inlinePillHtml() {
    var ph = (INLINE.banner && INLINE.banner.headline) || config.placeholder;
    return '<div class="pill" id="ibot-inline-pill" role="button" tabindex="0" ' +
      'aria-label="' + escapeHtml(ph) + '">' +
      '<span class="av">' + avatarHtml(28) + '</span>' +
      '<span class="ph">' + escapeHtml(ph) + '</span>' +
      '<span class="go" aria-hidden="true">&#8593;</span>' +
      '</div>';
  }

  function renderInline() {
    if (!inlineRoot || !INLINE) return;

    var chips = '';
    if (INLINE.preset === 'hero') {
      var items = (INLINE.banner && INLINE.banner.starters && INLINE.banner.starters.items) || [];
      var budget = inlineChipCount();
      var shown = items.slice(0, budget);
      if (shown.length) {
        chips = '<div class="chips">';
        for (var i = 0; i < shown.length; i++) {
          chips += '<button type="button" class="chip" data-inline-chip="' + i + '">' +
            escapeHtml(shown[i]) + '</button>';
        }
        chips += '</div>';
      }
    }

    inlineRoot.innerHTML =
      '<style>' + inlineStylesCss() + '</style>' +
      '<div class="wrap"><div class="pane">' + inlinePillHtml() + chips + '</div></div>';
  }
```

Re-render on resize so the chip budget follows the viewport. Beside the existing scroll/visualViewport listeners:

```js
  if (!window.__ibotInlineResizeBound) {
    window.__ibotInlineResizeBound = true;
    var inlineResizeTimer = null;
    window.addEventListener('resize', function () {
      if (!inlineRoot) return;
      if (inlineResizeTimer) clearTimeout(inlineResizeTimer);
      inlineResizeTimer = setTimeout(function () {
        try { renderInline(); } catch (e) { report('inline_render_failed', e); }
      }, 150);
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/`
Expected: PASS — the whole folder.

- [ ] **Step 5: Commit**

```bash
git add public/widget.js tests/unit/widget/inline-render.test.ts
git commit -m "feat(widget): render the inline resting invitation in a shadow root"
```

---

### Task 7: Engaging — the overlay grows from the box, on one session

**Files:**
- Modify: `public/widget.js`
- Test: `tests/unit/widget/inline-engage.test.ts` (create)

**Interfaces:**
- Consumes: `#ibot-inline-pill` and `[data-inline-chip]` inside `inlineRoot` (Task 6); the existing `isOpen`, `render()`, `widgetTrack`, `sendMessage` in `public/widget.js`.
- Produces: `function openFromInline(prefill)` and `function inlineOriginRect()`. No new session state — this deliberately reuses the existing `sessionId` and `messages`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/inline-engage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

const HERO = '<section><div class="content_home-c-hero"><h1>We Turn Brands Into Leaders</h1></div></section>';
const BANNER = {
  eyebrow: null, headline: 'ספרו לי על המותג שלכם', subline: null, valueLine: null, cta: null,
  art: { mode: 'host', image: null, reels: null, from: '#000', to: '#000' },
  starters: { label: null, items: ['אני מותג', 'אני יוצר תוכן', 'כמה זה עולה?'] },
};
const MOUNT = {
  enabled: true, selector: '.content_home-c-hero', mode: 'into', preset: 'hero', surface: 'bare',
  reserve: { desktop: 0, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll', banner: BANNER,
};

function shadow() {
  return (document.querySelector('[data-bestie-inline]') as HTMLElement).shadowRoot!;
}

describe('engaging from the inline surface', () => {
  it('clicking the pill opens the panel', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    expect(document.getElementById('ibot-panel')).not.toBeNull();
  });

  it('Enter on the pill opens it too', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const pill = shadow().getElementById('ibot-inline-pill') as HTMLElement;
    pill.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.getElementById('ibot-panel')).not.toBeNull();
  });

  it('locks page scroll while open and restores it on close', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const before = document.body.style.overflow;
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    expect(document.body.style.overflow).toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.style.overflow).toBe(before);
  });

  it('returns focus to the pill on close', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const pill = shadow().getElementById('ibot-inline-pill') as HTMLElement;
    pill.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shadow().activeElement).toBe(pill);
  });

  it('records the origin rect so the panel grows from the box, not a corner', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    const panel = document.getElementById('ibot-panel')!;
    expect(panel.style.getPropertyValue('--ibot-origin-x')).not.toBe('');
    expect(panel.style.getPropertyValue('--ibot-origin-y')).not.toBe('');
  });

  it('tags the open event with the surface it came from', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    const src = await import('node:fs').then((fs) => fs.readFileSync('public/widget.js', 'utf8'));
    expect(src).toContain("widgetTrack('widget_opened', { surface: 'inline' })");
  });

  it('a chip click opens the panel with that starter prefilled', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    (shadow().querySelector('[data-inline-chip="0"]') as HTMLElement).click();
    expect(document.getElementById('ibot-panel')).not.toBeNull();
    // Found structurally rather than by id, so this test does not encode an
    // assumption about the composer's markup.
    const input = document.querySelector(
      '#ibot-widget-container input, #ibot-widget-container textarea',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('אני מותג');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/inline-engage.test.ts`
Expected: FAIL — the pill has no click handler; no panel appears.

- [ ] **Step 3: Write minimal implementation**

At the end of `renderInline()` in `public/widget.js`, wire the handlers:

```js
    var pill = inlineRoot.getElementById('ibot-inline-pill');
    if (pill) {
      pill.onclick = function () { openFromInline(null); };
      pill.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          openFromInline(null);
        }
      };
    }
    var chipEls = inlineRoot.querySelectorAll('[data-inline-chip]');
    for (var c = 0; c < chipEls.length; c++) {
      (function (el) {
        el.onclick = function () { openFromInline(el.textContent || ''); };
      })(chipEls[c]);
    }
```

Add the open path beside `renderClosed`/`renderOpen`:

```js
  // Where the panel should appear to grow from. The inline pill is centred in
  // the customer's hero, so the panel scales out of it — a corner pop would
  // read as a different, unrelated component.
  function inlineOriginRect() {
    if (!inlineHost) return null;
    try { return inlineHost.getBoundingClientRect(); } catch (e) { return null; }
  }

  var inlineScrollLock = null;

  function openFromInline(prefill) {
    try {
      isOpen = true;
      inputTouched = false;
      widgetTrack('widget_opened', { surface: 'inline' });
      trackBannerViewed();

      // Lock the page behind the overlay, remembering exactly what we replaced
      // so close() restores the customer's own value rather than clearing it.
      inlineScrollLock = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      container.style.display = '';   // the panel lives in the floating container
      render();

      var panel = document.getElementById('ibot-panel');
      var rect = inlineOriginRect();
      if (panel && rect) {
        panel.style.setProperty('--ibot-origin-x', Math.round(rect.left + rect.width / 2) + 'px');
        panel.style.setProperty('--ibot-origin-y', Math.round(rect.top + rect.height / 2) + 'px');
        panel.setAttribute('data-from-inline', '1');
      }

      if (prefill) {
        // Grab the composer structurally — its id has changed before and the
        // prefill silently becoming a no-op is exactly the failure a chip
        // click must not have.
        var input = container.querySelector('input,textarea');
        if (input) { input.value = prefill; input.focus(); }
        else report('inline_prefill_no_composer', { message: 'composer not found' });
      }
    } catch (e) {
      report('inline_open_failed', e);
    }
  }

  // Close returns the page and the focus to where the visitor left them.
  function restoreAfterInline() {
    if (inlineScrollLock === null) return;
    document.body.style.overflow = inlineScrollLock;
    inlineScrollLock = null;
    var pill = inlineRoot && inlineRoot.getElementById('ibot-inline-pill');
    if (pill) { try { pill.focus(); } catch (e) { /* */ } }
    if (inlineVisible && INLINE && INLINE.bubble === 'after-scroll') container.style.display = 'none';
  }
```

Call `restoreAfterInline()` as the first statement inside the existing `closeWidget()`.

Add the Escape handler once, beside the other one-time listeners:

```js
  if (!window.__ibotInlineEscBound) {
    window.__ibotInlineEscBound = true;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (!isOpen || inlineScrollLock === null) return;
      try { closeWidget(); } catch (err) { /* */ }
    });
  }
```

Finally, in the panel style string used by `renderOpen`, give a panel that carries `data-from-inline` its grow-from-origin animation:

```js
    '#ibot-widget-container #ibot-panel[data-from-inline]{transform-origin:var(--ibot-origin-x) var(--ibot-origin-y);' +
      'animation:ibot-inline-grow 0.26s cubic-bezier(.16,1,.3,1);}' +
    '@keyframes ibot-inline-grow{from{opacity:0;transform:scale(0.94);}to{opacity:1;transform:scale(1);}}' +
    '@media (prefers-reduced-motion:reduce){#ibot-widget-container #ibot-panel[data-from-inline]{animation:none;}}' +
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/widget.js tests/unit/widget/inline-engage.test.ts
git commit -m "feat(widget): open the panel from the inline pill, one session, scroll locked"
```

---

### Task 8: Preview mode and the analytics surface dimension

**Files:**
- Modify: `public/widget.js`
- Test: `tests/unit/widget/inline-preview.test.ts` (create)

**Interfaces:**
- Consumes: `INLINE` (Task 5), `widgetTrack` (existing).
- Produces: `function inlinePreviewAllowed()`. Every event emitted while `INLINE.enabled === 'preview'` carries `preview: true`; `widget_loaded` gains `surface` and `mount_preset`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/inline-preview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

const HERO = '<section><div class="content_home-c-hero"><h1>LDRS</h1></div></section>';
const PREVIEW = {
  enabled: 'preview', selector: '.content_home-c-hero', mode: 'into', preset: 'hero', surface: 'bare',
  reserve: { desktop: 0, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll', banner: null,
};

describe('preview mode', () => {
  it('renders nothing inline for an ordinary visitor', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: PREVIEW } });
    expect(w.inlineHost).toBeNull();
    expect(document.getElementById('ibot-trigger')).not.toBeNull();
  });

  it('does not report a missing mount — this is a decision, not a failure', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: PREVIEW } });
    expect(w.reports.map((r) => r.type)).not.toContain('inline_mount_missing');
  });

  it('renders for a visitor who arrived with ?bestie=1', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: PREVIEW }, search: '?bestie=1' });
    expect(w.inlineHost).not.toBeNull();
  });

  it('keeps rendering after navigation, via sessionStorage', async () => {
    await bootWidget({ html: HERO, config: { inline: PREVIEW }, search: '?bestie=1' });
    const w = await bootWidget({ html: HERO, config: { inline: PREVIEW } });   // no query this time
    expect(w.inlineHost).not.toBeNull();
  });

  it('enabled:true needs no query string', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: { ...PREVIEW, enabled: true } } });
    expect(w.inlineHost).not.toBeNull();
  });
});

describe('the analytics surface dimension', () => {
  it('widget_loaded carries the surface and the preset', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('public/widget.js', 'utf8'));
    expect(src).toContain('mount_preset');
    expect(src).toContain("surface: INLINE ? 'inline' : 'floating'");
  });

  it('preview events are marked so they cannot be counted as installs', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('public/widget.js', 'utf8'));
    expect(src).toContain('enriched.preview = true');
  });
});
```

The preview flag lives in `sessionStorage` and would otherwise leak between
tests. Add this once, at the top of the file, above the first `describe`:

```ts
import { beforeEach } from 'vitest';
beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });
```

`beforeEach` runs per test, not per file, so the "keeps rendering after
navigation" test still gets both of its boots inside one clean session — which
is exactly what it is asserting.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/inline-preview.test.ts`
Expected: FAIL — `'preview'` currently mounts unconditionally, so the first test finds an `inlineHost`.

- [ ] **Step 3: Write minimal implementation**

In `public/widget.js`, add beside the other inline helpers:

```js
  var INLINE_PREVIEW_KEY = 'ibot_inline_preview_' + ACCOUNT_ID;

  // `enabled: 'preview'` shows the inline surface only to someone who asked
  // for it with ?bestie=1, remembered for the rest of the browsing session so
  // it survives navigation. Every other visitor sees today's widget. This is
  // how a customer tries the feature on their own live site with no deploy.
  function inlinePreviewAllowed() {
    try {
      if (location.search.indexOf('bestie=1') !== -1) {
        sessionStorage.setItem(INLINE_PREVIEW_KEY, '1');
        return true;
      }
      return sessionStorage.getItem(INLINE_PREVIEW_KEY) === '1';
    } catch (e) {
      // Private mode / storage disabled: the query string alone still works.
      return location.search.indexOf('bestie=1') !== -1;
    }
  }
```

Guard `setupInline`'s entry:

```js
  function setupInline() {
    // Not a failure — an explicit decision by the account. No report().
    if (INLINE.enabled === 'preview' && !inlinePreviewAllowed()) { INLINE = null; return; }
    var target = resolveInlineTarget();
    ...
```

Setting `INLINE = null` matters: it keeps every later `INLINE ?` branch — bubble suppression, the analytics surface — on the floating path.

In `widgetTrack`, mark preview traffic at the single place every event passes through:

```js
    var enriched = {
      widget_version: WIDGET_VERSION,
      attribution: WIDGET_ATTRIBUTION,
    };
    // Preview traffic is the account owner looking at their own site. Counting
    // it as an install would make /admin/health claim a customer deployed
    // something they are still deciding about.
    if (INLINE && INLINE.enabled === 'preview') enriched.preview = true;
```

And extend the `widget_loaded` call:

```js
      widgetTrack('widget_loaded', {
        modules: modules,
        widget_version: WIDGET_VERSION,
        surface: INLINE ? 'inline' : 'floating',
        mount_preset: INLINE ? INLINE.preset : null,
      });
```

Note the ordering constraint: `INLINE` is assigned and `setupInline()` runs **before** the `widget_loaded` call in the config `.then` block (Task 5 placed it there deliberately), so both fields are already correct.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/`
Expected: PASS — all files.

- [ ] **Step 5: Full suite and commit**

```bash
npx vitest run
npm run type-check
git add public/widget.js tests/unit/widget/inline-preview.test.ts
git commit -m "feat(widget): preview gate for the inline surface + analytics surface dimension"
```

---

### Task 9: LDRS pilot — configure, verify, hand over a link

**Files:**
- Modify: nothing in the repo. This task changes one row of production data and verifies the result.
- Reference: `docs/superpowers/specs/2026-08-24-bestie-inline-surface-design.md` § LDRS pilot

**Interfaces:**
- Consumes: everything above, deployed.
- Produces: a preview URL to send to LDRS, and a go/no-go on flipping to `enabled: true`.

**Account:** `de38eac6-d2fb-46a7-ac09-5ec860147ca0` · `ldrsgroup.com` · `widget.js` already installed in their `<head>` with `defer`. Nothing is installed on their side for this feature.

- [ ] **Step 1: Fix the wrong brand colour first**

`config.widget.primaryColor` is `#6ec1e4` — Elementor's stock blue, seeded automatically, present nowhere on their site. The floating bubble survives it by hovering above the page; an inline hero will not.

Read it back before writing, then set the accent sampled from their own CSS:

```sql
select config->'widget'->>'primaryColor'
from accounts where id = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

update accounts
set config = jsonb_set(config, '{widget,primaryColor}', '"#4c3e5e"')
where id = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';
```

- [ ] **Step 2: Write the pilot mount config, in preview mode**

`enabled` is `"preview"`, not `true`. No LDRS visitor sees anything until we deliberately flip it.

```sql
update accounts
set config = jsonb_set(config, '{widget,inline}', '{
  "enabled": "preview",
  "selector": ".content_home-c-hero",
  "mode": "into",
  "preset": "hero",
  "surface": "bare",
  "reserve": { "desktop": 0, "mobile": 0 },
  "theme": { "font": "inherit", "accent": "#4c3e5e", "radius": 999, "ground": "dark" },
  "bubble": "after-scroll"
}'::jsonb)
where id = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';
```

- [ ] **Step 3: Confirm the API serves it**

```bash
curl -s "https://influencers-bot.vercel.app/api/widget/config?accountId=de38eac6-d2fb-46a7-ac09-5ec860147ca0" \
  | python3 -m json.tool | sed -n '/"inline"/,/}/p'
```

Expected: the `inline` object above, with `"enabled": "preview"`.

- [ ] **Step 4: Verify on the real site, both states**

Open `https://ldrsgroup.com/he` in a normal window. Expected: **no** inline surface, floating bubble as today.

Open `https://ldrsgroup.com/he?bestie=1`. Expected, and each is a pass/fail gate:

- The pill renders centred inside their hero, beneath the H1.
- Their background video keeps playing — during the check, and while the overlay is open.
- Page height is unchanged (`.content_home-c-hero` has a fixed `46.75rem`, so this must hold exactly).
- Their H1 blur-in animation completes without competition from Bestie's entrance.
- The floating bubble is absent until the hero scrolls fully out of view, then appears.
- A conversation started in the hero continues in the bubble after scrolling.
- On a phone: two chips, pill above the fold, full-screen panel, keyboard does not cover the composer.

- [ ] **Step 5: Check the lead lanes actually route**

Run one brand-side conversation through to contact capture and confirm it reaches Itamar, Roei and Kfir — not Sharon. Then one creator-side and confirm the reverse. The lanes already exist; this proves the inline surface feeds them.

- [ ] **Step 6: Confirm preview traffic is not counted as an install**

```sql
select payload->>'surface' as surface,
       payload->>'preview' as preview,
       count(*)
from widget_events
where account_id = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0'
  and event_type = 'widget_loaded'
  and created_at > now() - interval '1 day'
group by 1, 2;
```

Expected: the `?bestie=1` loads appear with `surface = inline` and `preview = true`. Verify `/admin/health` still reports LDRS by its floating-widget traffic and has not gained a phantom install.

- [ ] **Step 7: Hand over — and stop**

Send LDRS one link: `https://ldrsgroup.com/he?bestie=1`.

**Do not flip `enabled` to `true`.** Going live on a customer's home page is Ido's call and needs two answers from LDRS that this plan cannot supply: whether they accept losing the two hero CTAs, and who approves the Hebrew copy. Both are recorded as open questions in the spec.

- [ ] **Step 8: Record the sampler evidence**

Before the picker is built, note whether an automatic sampler *would* have derived `#4c3e5e`, `ground: dark` and the inherited Google Sans from their page unaided. That comparison is the cheapest evidence we will get about whether automatic theming can be trusted, and LDRS is a safer place to learn it than a paying account.

---

## Not in this plan

The **visual picker** — picker mode in `/api/widget/preview/[accountId]`, element highlighting, selector generation from a click, and the dashboard UI that saves `config.widget.inline` — is a separate subsystem and gets its own plan. It is not on the pilot's critical path: LDRS's selector is already known and set by hand in Task 9.

The **site sampler** goes with it. The spec has the sampler deriving `ground`, `text`, `radius` and `accent` from the host page via `getComputedStyle` — but its output is a *proposal a customer approves in the picker*, never something applied at runtime. Without the picker there is nowhere for that proposal to be seen or accepted, so building the sampler now would either strand it or push it into exactly the blind auto-theming the spec forbids. In this plan the theme is read from `config.widget.inline.theme`, set by hand for the pilot; Task 9 Step 8 gathers the evidence that decides how much the sampler can be trusted when it is built.

One piece of the sampler is already here and is the important one: `font-family` is never set inside the shadow root, so the host page's type is inherited with no sampling at all.

Also deferred, per the spec's "Out of scope": Shopify/WordPress app blocks, an npm React component, auto-detecting a site's search input, go-to-market for the `bar` preset, and extracting `@bestie/core`.
