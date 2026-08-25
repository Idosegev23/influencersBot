# Inline Surface Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer point at a spot on their own website and have Bestie mount there — choosing it by clicking, not by someone writing SQL.

**Architecture:** No new plumbing. `/api/widget/preview/[accountId]` already fetches the customer's real site server-side, strips iframe-blocking headers and injects `widget.js` with `data-preview="true"`; `WidgetDraftPreview.tsx` already renders that in an iframe and already exchanges `postMessage` with the widget (`ibot:preview-ready` up, `ibot:draft` down, both origin-checked). The picker adds two messages to that existing channel and a section to the existing widget editor.

**Tech Stack:** Vanilla ES5 in `public/widget.js` (no build step — `var`, `function`, string concatenation; no arrow functions, template literals, `const`/`let`, or optional chaining). TypeScript + React for the dashboard. Vitest/jsdom for tests.

**Spec:** `docs/superpowers/specs/2026-08-24-bestie-inline-surface-design.md` — this plan builds the two pieces that spec explicitly deferred: **the picker** and **the site sampler**.

## Global Constraints

- **`public/widget.js` must never break the host page.** Every new path wrapped in `try/catch`; failures call `report()` and never `throw`. A new diagnostic type must also be added to `DIAGNOSTIC_TYPES` in `src/lib/telemetry/diagnostics.ts` or the server discards it silently.
- **Picker code must be inert outside preview mode.** `PREVIEW_MODE` is already computed from `data-preview="true"`. A visitor on a customer's real site must never be able to enter picker mode, and the no-preview path must stay byte-identical.
- **Never trust the client with a selector.** `/api/influencer/settings` currently spreads `body.widget` into `config.widget` with no validation, so an authenticated customer can today store any `inline` config at all. Every stored mount must pass `resolveInlineMount`, and a selector resolving to `html`/`body`/`head` must be refused at save time as well as at mount time.
- **The sampler proposes, it never applies.** Sampled theme values are shown to the customer and stored only on save. Blind auto-theming is ruled out by the spec.
- **Absence means today's behavior.** An account with no `config.widget.inline` is unchanged. `tests/unit/widget/` is the regression gate.
- **A test that cannot fail is a defect.** This plan's parent shipped three such tests, and two production defects hid behind them. Every test here must be shown to go red when its subject is reverted; say so in the report.
- Run one file with `npx vitest run <path>` — `npm run test` is watch mode. `npm run type-check` before committing; ~93 pre-existing unrelated errors are the baseline.

---

### Task 1: Selector safety, and a validated save path

**Files:**
- Modify: `src/lib/widget/inline.ts`
- Modify: `src/app/api/influencer/settings/route.ts`
- Test: `tests/unit/widget/inline-selector-safety.test.ts` (create)

**Interfaces:**
- Consumes: `resolveInlineMount` (existing).
- Produces: `isStableSelector(sel: string): boolean` and `isUnsafeSelector(sel: string): boolean`, both exported from `@/lib/widget/inline`. `resolveInlineMount` returns `null` for an unsafe selector. `/api/influencer/settings` stores `widget.inline` only as returned by `resolveInlineMount`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveInlineMount, isStableSelector, isUnsafeSelector } from '@/lib/widget/inline';

const mount = (selector: string, extra: Record<string, unknown> = {}) =>
  ({ widget: { inline: { enabled: true, selector, ...extra } } });

describe('isUnsafeSelector', () => {
  it('refuses the document root, body and head — replace mode would delete the page', () => {
    for (const s of ['html', 'body', 'head', 'HTML', ' body ', 'html > body']) {
      expect(isUnsafeSelector(s)).toBe(true);
    }
  });

  it('allows an ordinary content selector', () => {
    expect(isUnsafeSelector('.content_home-c-hero')).toBe(false);
    expect(isUnsafeSelector('#hero-search')).toBe(false);
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

  it('rejects builder-generated hash classes', () => {
    expect(isStableSelector('.css-1x9f3ab')).toBe(false);
    expect(isStableSelector('.w-node-a1b2c3d4e5f6-7a8b9c0d')).toBe(false);
    expect(isStableSelector('.sc-bdVaJa')).toBe(false);
  });
});

describe('resolveInlineMount refuses an unsafe mount', () => {
  it('returns null for body, whatever the mode', () => {
    expect(resolveInlineMount(mount('body', { mode: 'replace' }))).toBeNull();
    expect(resolveInlineMount(mount('html'))).toBeNull();
  });

  it('still resolves an ordinary selector', () => {
    expect(resolveInlineMount(mount('.content_home-c-hero'))!.selector).toBe('.content_home-c-hero');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/inline-selector-safety.test.ts`
Expected: FAIL — `isStableSelector` and `isUnsafeSelector` are not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/widget/inline.ts`:

```ts
const UNSAFE_TARGETS = /(^|[\s,>+~])(html|body|head)\s*$/i;

/**
 * A selector we refuse to store at all.
 *
 * `mode: "replace"` calls `parentNode.replaceChild`, so a selector resolving
 * to the document root, `body` or `head` deletes the customer's page — and
 * our own container with it. The widget refuses these at mount time too;
 * this stops one ever being saved.
 */
export function isUnsafeSelector(sel: string): boolean {
  const s = (sel || '').trim();
  if (!s) return true;
  if (/^(html|body|head)$/i.test(s)) return true;
  return UNSAFE_TARGETS.test(s);
}

/**
 * A selector we are willing to *propose*. The failure guarded against is not
 * injection but a selector that silently stops matching when the customer
 * republishes: builder-generated hashes and deep positional chains are
 * exactly the ones that do.
 *
 * This gates what the picker emits, not what the widget accepts — rejecting a
 * stored selector at read time would kill a mount that was working.
 */
export function isStableSelector(sel: string): boolean {
  if (!sel || sel.length > MAX_SELECTOR) return false;
  if ((sel.match(/:nth-child/g) || []).length > 1) return false;
  if (/\.(css|sc|w-node|jsx|emotion)-[0-9a-z]{4,}/i.test(sel)) return false;
  if (/\.[A-Za-z_-]*[0-9a-f]{8,}/.test(sel)) return false;
  return true;
}
```

and inside `resolveInlineMount`, immediately after the selector length check:

```ts
  if (isUnsafeSelector(selector)) return null;
```

In `src/app/api/influencer/settings/route.ts`, inside the `if (body.widget)` block, replace whatever `inline` the client posted with the resolved form:

```ts
      // The client may post anything. Store only what the resolver returns —
      // this route otherwise spreads body.widget verbatim, which would let an
      // authenticated customer save `{selector:'body', mode:'replace'}` and
      // delete their own page on the next pageview.
      if ('inline' in body.widget) {
        const resolved = resolveInlineMount({ widget: { inline: body.widget.inline } });
        if (resolved) updatedConfig.widget.inline = resolved;
        else delete updatedConfig.widget.inline;
      }
```

with `import { resolveInlineMount } from '@/lib/widget/inline';` at the top.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/`
Expected: PASS — the whole folder, so the existing inline tests stay green.

- [ ] **Step 5: Commit**

```bash
npm run type-check
git add src/lib/widget/inline.ts src/app/api/influencer/settings/route.ts tests/unit/widget/inline-selector-safety.test.ts
git commit -m "feat(widget): refuse unsafe mount selectors, validate inline config on save"
```

---

### Task 2: Picker mode in `public/widget.js`

**Files:**
- Modify: `public/widget.js`
- Modify: `src/lib/telemetry/diagnostics.ts` (only if a new diagnostic type is added)
- Test: `tests/unit/widget/picker-mode.test.ts` (create)

**Interfaces:**
- Consumes: `PREVIEW_MODE` (existing, from `data-preview="true"`), the existing `message` listener at `public/widget.js:1460` and its origin check.
- Produces, over the existing postMessage channel:
  - down (parent → widget): `{ type: 'ibot:picker', on: boolean }`
  - up (widget → parent): `{ type: 'ibot:picked', selector, mode, reserve: {desktop, mobile}, theme: {font, accent, radius, ground}, label }`

`label` is a short human description of the chosen element (tag plus its first class or id) so the dashboard can say what was picked without re-querying.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

const HERO = '<section class="hero"><div class="content_home-c-hero">' +
  '<h1>We Turn Brands Into Leaders</h1>' +
  '<a class="btn" href="#" style="border-radius:8px;background:#4c3e5e">בואו נדבר</a>' +
  '</div></section>';

function post(msg: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data: msg, origin: window.location.origin }));
}
function captureUp(): any[] {
  const seen: any[] = [];
  const orig = window.parent.postMessage.bind(window.parent);
  (window.parent as any).postMessage = (m: any, o: any) => { seen.push(m); return orig(m, o); };
  return seen;
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });

describe('picker mode', () => {
  it('is inert when the widget is not in preview mode', async () => {
    await bootWidget({ html: HERO, config: { inline: null } });   // no data-preview
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.content_home-c-hero') as HTMLElement).click();
    expect(up.filter((m) => m?.type === 'ibot:picked')).toHaveLength(0);
  });

  it('reports the element the customer clicked, with a class selector', async () => {
    await bootWidget({ html: HERO, config: { inline: null }, preview: true });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.content_home-c-hero') as HTMLElement).click();
    const picked = up.find((m) => m?.type === 'ibot:picked');
    expect(picked).toBeTruthy();
    expect(picked.selector).toBe('.content_home-c-hero');
    expect(picked.label).toContain('content_home-c-hero');
  });

  it('prefers an id over a class', async () => {
    await bootWidget({ html: '<div id="hero-search" class="a b c">x</div>', config: { inline: null }, preview: true });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.getElementById('hero-search') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked').selector).toBe('#hero-search');
  });

  it('refuses to pick body, html or head', async () => {
    await bootWidget({ html: HERO, config: { inline: null }, preview: true });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    document.body.click();
    expect(up.filter((m) => m?.type === 'ibot:picked')).toHaveLength(0);
  });

  it('samples the ground and the accent from the page', async () => {
    await bootWidget({ html: HERO, config: { inline: null }, preview: true });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.content_home-c-hero') as HTMLElement).click();
    const t = up.find((m) => m?.type === 'ibot:picked').theme;
    expect(t.font).toBe('inherit');
    expect(['light', 'dark']).toContain(t.ground);
  });

  it('suppresses the click so the customer does not navigate away mid-pick', async () => {
    await bootWidget({ html: HERO + '<a id="away" href="/gone">go</a>', config: { inline: null }, preview: true });
    let navigated = false;
    document.getElementById('away')!.addEventListener('click', (e) => { if (!e.defaultPrevented) navigated = true; });
    post({ type: 'ibot:picker', on: true });
    document.getElementById('away')!.click();
    expect(navigated).toBe(false);
  });

  it('stops picking when told to, and clicks behave normally again', async () => {
    await bootWidget({ html: HERO, config: { inline: null }, preview: true });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    post({ type: 'ibot:picker', on: false });
    (document.querySelector('.content_home-c-hero') as HTMLElement).click();
    expect(up.filter((m) => m?.type === 'ibot:picked')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/picker-mode.test.ts`
Expected: FAIL — the harness has no `preview` option and widget.js has no picker.

Add the `preview?: boolean` option to `tests/unit/widget/helpers/boot-widget.ts`: when true it sets `data-preview="true"` on the fake script element, next to the existing `data-account-id`. That is the only harness change this task needs.

- [ ] **Step 3: Write minimal implementation**

In `public/widget.js`, add near the other one-time listeners. All of it is gated on `PREVIEW_MODE`, so a visitor on a live site can never enter it:

```js
  // ---- Picker mode (preview only) ------------------------------------------
  // The customer clicks the spot on their own site where Bestie should sit.
  // Runs only inside /api/widget/preview/[accountId], which is the dashboard's
  // iframe; `PREVIEW_MODE` comes from data-preview="true" on the script tag, so
  // a visitor on the real site can never reach any of this.
  var pickerOn = false;
  var pickerOutline = null;

  function pickerLabel(el) {
    var tag = (el.tagName || '').toLowerCase();
    if (el.id) return tag + '#' + el.id;
    var cls = (el.className && typeof el.className === 'string') ? el.className.split(/\s+/)[0] : '';
    return cls ? tag + '.' + cls : tag;
  }

  // Prefer an id, then a class that matches exactly one element. Anything less
  // stable than that is not offered — a selector that stops matching on the
  // customer's next publish is worse than no mount, because it fails silently.
  function pickerSelector(el) {
    try {
      if (el.id && document.querySelectorAll('#' + el.id).length === 1) return '#' + el.id;
      var classes = (el.className && typeof el.className === 'string')
        ? el.className.split(/\s+/).filter(Boolean) : [];
      for (var i = 0; i < classes.length; i++) {
        var sel = '.' + classes[i];
        try { if (document.querySelectorAll(sel).length === 1) return sel; } catch (e) { /* */ }
      }
      var combo = classes.length > 1 ? '.' + classes.slice(0, 2).join('.') : '';
      if (combo) { try { if (document.querySelectorAll(combo).length === 1) return combo; } catch (e) { /* */ } }
      return null;
    } catch (e) { return null; }
  }

  function pickerUnsafe(el) {
    return !el || el === document.documentElement || el === document.body || el === document.head;
  }

  // Read the page's own visual language. Inherited properties (the font) need
  // no sampling at all — they cross the shadow boundary on their own. What we
  // sample is what does not: the ground we sit on, and the shape and accent
  // the site already uses for its own calls to action.
  function pickerSampleTheme(el) {
    var ground = 'dark', accent = null, radius = null;
    try {
      var node = el, bg = '';
      while (node && node !== document.documentElement) {
        bg = window.getComputedStyle(node).backgroundColor || '';
        if (bg && bg !== 'transparent' && bg.indexOf('rgba(0, 0, 0, 0)') !== 0) break;
        node = node.parentElement;
      }
      var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        var lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
        ground = lum > 0.5 ? 'light' : 'dark';
      }
      var cta = el.querySelector('a,button,.button,[class*="btn"]') ||
                document.querySelector('a.button,button,.btn');
      if (cta) {
        var cs = window.getComputedStyle(cta);
        var cm = (cs.backgroundColor || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (cm) {
          accent = '#' + [cm[1], cm[2], cm[3]].map(function (n) {
            var h = (+n).toString(16); return h.length === 1 ? '0' + h : h;
          }).join('');
        }
        var r = parseInt(cs.borderTopLeftRadius, 10);
        if (!isNaN(r)) radius = r;
      }
    } catch (e) { /* a sample we cannot take is simply not proposed */ }
    return { font: 'inherit', accent: accent, radius: radius, ground: ground };
  }

  function pickerMeasure(el) {
    try {
      var r = el.getBoundingClientRect();
      var h = Math.round(r.height);
      return { desktop: window.innerWidth >= 640 ? h : 0, mobile: window.innerWidth < 640 ? h : 0 };
    } catch (e) { return { desktop: 0, mobile: 0 }; }
  }

  function pickerHighlight(el) {
    if (!pickerOutline) {
      pickerOutline = document.createElement('div');
      pickerOutline.setAttribute('data-bestie-picker', '1');
      pickerOutline.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;' +
        'border:2px solid #9334EB;background:rgba(147,52,235,0.12);border-radius:4px;' +
        'transition:all .08s ease-out;';
      document.body.appendChild(pickerOutline);
    }
    try {
      var r = el.getBoundingClientRect();
      pickerOutline.style.top = r.top + 'px';
      pickerOutline.style.left = r.left + 'px';
      pickerOutline.style.width = r.width + 'px';
      pickerOutline.style.height = r.height + 'px';
      pickerOutline.style.display = 'block';
    } catch (e) { /* */ }
  }

  function pickerStop() {
    pickerOn = false;
    if (pickerOutline) pickerOutline.style.display = 'none';
  }

  if (PREVIEW_MODE) {
    document.addEventListener('mouseover', function (ev) {
      if (!pickerOn) return;
      try { if (!pickerUnsafe(ev.target)) pickerHighlight(ev.target); } catch (e) { /* */ }
    }, true);

    // Capture phase, and both prevented and stopped: the customer is clicking
    // their own live site, and a pick must not also follow a link or submit a
    // form out from under them.
    document.addEventListener('click', function (ev) {
      if (!pickerOn) return;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        var el = ev.target;
        if (pickerUnsafe(el)) return;
        var selector = pickerSelector(el);
        if (!selector) { report('picker_no_stable_selector', { message: pickerLabel(el) }); return; }
        pickerStop();
        window.parent.postMessage({
          type: 'ibot:picked',
          selector: selector,
          label: pickerLabel(el),
          mode: 'into',
          reserve: pickerMeasure(el),
          theme: pickerSampleTheme(el),
        }, window.location.origin);
      } catch (e) { report('picker_failed', e); }
    }, true);
  }
```

and inside the existing `message` listener (`public/widget.js:1460`), after its origin check, before the `ibot:draft` branch:

```js
      if (msg && msg.type === 'ibot:picker' && PREVIEW_MODE) {
        pickerOn = msg.on === true;
        if (!pickerOn) pickerStop();
        return;
      }
```

Add `'picker_no_stable_selector'` and `'picker_failed'` to `DIAGNOSTIC_TYPES` in `src/lib/telemetry/diagnostics.ts`, and a case to `tests/unit/telemetry/diagnostics.test.ts` asserting both survive `sanitizeDiagnostic` — an unregistered type is discarded silently, which this codebase has already been bitten by.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/ tests/unit/telemetry/`
Expected: PASS.

Then prove the tests can fail: comment out the `if (PREVIEW_MODE) {` guard's body and confirm the picking tests go red; restore. Report what you saw.

- [ ] **Step 5: Commit**

```bash
npx acorn --ecma2020 --silent public/widget.js
npm run type-check
git add public/widget.js src/lib/telemetry/diagnostics.ts tests/unit/widget/picker-mode.test.ts tests/unit/widget/helpers/boot-widget.ts tests/unit/telemetry/diagnostics.test.ts
git commit -m "feat(widget): picker mode — click the spot on your own site"
```

---

### Task 3: Wire the picker through `WidgetDraftPreview`

**Files:**
- Modify: `src/components/influencer/WidgetDraftPreview.tsx`
- Test: `tests/unit/widget/widget-draft-preview-picker.test.tsx` (create)

**Interfaces:**
- Consumes: the `ibot:picker` / `ibot:picked` messages from Task 2.
- Produces: two new optional props on `WidgetDraftPreview` — `picking?: boolean` and `onPick?: (pick: InlinePick) => void`, where

```ts
export interface InlinePick {
  selector: string;
  label: string;
  mode: 'into' | 'replace' | 'overlay';
  reserve: { desktop: number; mobile: number };
  theme: { font: string; accent: string | null; radius: number | null; ground: 'light' | 'dark' };
}
```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import WidgetDraftPreview from '@/components/influencer/WidgetDraftPreview';

const PICK = {
  type: 'ibot:picked', selector: '.hero', label: 'div.hero', mode: 'into',
  reserve: { desktop: 480, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' },
};

describe('WidgetDraftPreview picker wiring', () => {
  it('hands a pick to onPick', async () => {
    const onPick = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={onPick} />);
    window.dispatchEvent(new MessageEvent('message', { data: PICK, origin: window.location.origin }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ selector: '.hero' })));
  });

  it('ignores a pick from another origin', async () => {
    const onPick = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={onPick} />);
    window.dispatchEvent(new MessageEvent('message', { data: PICK, origin: 'https://evil.example' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('ignores a malformed pick rather than passing it on', async () => {
    const onPick = vi.fn();
    render(<WidgetDraftPreview accountId="a" draft={{}} picking onPick={onPick} />);
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'ibot:picked' }, origin: window.location.origin,
    }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/widget-draft-preview-picker.test.tsx`
Expected: FAIL — the props do not exist.

- [ ] **Step 3: Write minimal implementation**

Add the props and two effects to `WidgetDraftPreview.tsx`, following the origin-check pattern already in the file:

```tsx
  // Tell the widget inside the iframe to enter or leave picker mode. Sent on
  // every change of `picking` once the frame has announced itself, the same
  // readiness gate the draft messages already use.
  useEffect(() => {
    if (!ready) return;
    ref.current?.contentWindow?.postMessage(
      { type: 'ibot:picker', on: !!picking },
      window.location.origin,
    );
  }, [picking, ready]);

  // Receive the pick. Validated here rather than trusted: this listener is on
  // window, so anything on the page can post to it.
  useEffect(() => {
    if (!onPick) return;
    const handler = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || d.type !== 'ibot:picked') return;
      if (typeof d.selector !== 'string' || !d.selector) return;
      onPick({
        selector: d.selector,
        label: typeof d.label === 'string' ? d.label : d.selector,
        mode: d.mode === 'replace' || d.mode === 'overlay' ? d.mode : 'into',
        reserve: {
          desktop: Number(d.reserve?.desktop) || 0,
          mobile: Number(d.reserve?.mobile) || 0,
        },
        theme: {
          font: 'inherit',
          accent: typeof d.theme?.accent === 'string' ? d.theme.accent : null,
          radius: Number.isFinite(d.theme?.radius) ? d.theme.radius : null,
          ground: d.theme?.ground === 'light' ? 'light' : 'dark',
        },
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onPick]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/widget/widget-draft-preview-picker.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
npm run type-check
git add src/components/influencer/WidgetDraftPreview.tsx tests/unit/widget/widget-draft-preview-picker.test.tsx
git commit -m "feat(dashboard): carry a picked mount out of the preview iframe"
```

---

### Task 4: The editor section the customer actually uses

**Files:**
- Create: `src/components/influencer/InlineMountSection.tsx`
- Modify: `src/app/influencer/[username]/widget-editor/page.tsx`
- Test: `tests/unit/widget/inline-mount-section.test.tsx` (create)

The editor page is already 1467 lines. Put the new UI in its own component and have the page render it and include `inline` in the payload it already posts to `/api/influencer/settings` — do not grow the page file with the section's internals.

**Interfaces:**
- Consumes: `InlinePick` and the `picking`/`onPick` props from Task 3; `resolveInlineMount`'s shape from Task 1.
- Produces: `<InlineMountSection value={...} onChange={...} onStartPicking={...} picking={...} />` where `value` is the `config.widget.inline` object or `null`.

**Copy is Hebrew, RTL** — match the surrounding editor. Suggested strings, adjust to the page's voice:
- Section title: `איפה בסטי יושב באתר`
- Empty state: `היום בסטי מופיע כבועה בפינה. אפשר להושיב אותו גם בתוך הדף עצמו.`
- Pick button: `בחרו מקום באתר` / while picking: `לחצו על האלמנט באתר…`
- Enable tri-state: `כבוי` · `תצוגה מקדימה (רק עם קישור)` · `פעיל לכל המבקרים`
- Preview-link hint, shown only in preview state: `bestieai.co/…?bestie=1` — the customer's own URL with `?bestie=1`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InlineMountSection from '@/components/influencer/InlineMountSection';

const PICK = {
  selector: '.hero', label: 'div.hero', mode: 'into' as const,
  reserve: { desktop: 480, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' as const },
};

describe('InlineMountSection', () => {
  it('offers to pick a spot when nothing is configured', () => {
    render(<InlineMountSection value={null} onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByRole('button', { name: /בחרו מקום/ })).toBeInTheDocument();
  });

  it('asks the page to start picking', () => {
    const onStartPicking = vi.fn();
    render(<InlineMountSection value={null} onChange={() => {}} onStartPicking={onStartPicking} picking={false} />);
    fireEvent.click(screen.getByRole('button', { name: /בחרו מקום/ }));
    expect(onStartPicking).toHaveBeenCalled();
  });

  it('shows what was picked, so the customer can tell it chose the right thing', () => {
    render(<InlineMountSection value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByText(/div\.hero/)).toBeInTheDocument();
  });

  it('proposes the sampled theme rather than applying it silently', () => {
    render(<InlineMountSection value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByText(/#4c3e5e/i)).toBeInTheDocument();
  });

  it('defaults a brand-new mount to preview, never straight to live', () => {
    const onChange = vi.fn();
    render(<InlineMountSection value={null} onChange={onChange} onStartPicking={() => {}} picking={false} pendingPick={PICK} />);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: 'preview' }));
  });

  it('lets the customer switch between the three states', () => {
    const onChange = vi.fn();
    render(<InlineMountSection value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={onChange} onStartPicking={() => {}} picking={false} />);
    fireEvent.click(screen.getByRole('radio', { name: /פעיל לכל המבקרים/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('can remove the mount entirely', () => {
    const onChange = vi.fn();
    render(<InlineMountSection value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={onChange} onStartPicking={() => {}} picking={false} />);
    fireEvent.click(screen.getByRole('button', { name: /הסרה/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/inline-mount-section.test.tsx`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Write minimal implementation**

Build `InlineMountSection.tsx` to satisfy exactly those tests: the empty state with its pick button, the picked summary showing `label` and the sampled accent, a preset select (`hero` / `bar`), a surface select (`bare` / `glass` / `solid`), the three-state radio group, and a remove button. **A new mount defaults to `enabled: 'preview'`** — going live is a deliberate second act, never the side effect of picking a spot.

Then in `widget-editor/page.tsx`: hold `inlineDraft` and `picking` state, render `<InlineMountSection>`, pass `picking`/`onPick` through to the existing `<WidgetDraftPreview>`, and add `inline: inlineDraft` to the `widget` object in the body it already posts to `/api/influencer/settings`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/widget/`
Expected: PASS — the whole folder.

- [ ] **Step 5: Commit**

```bash
npm run type-check
git add src/components/influencer/InlineMountSection.tsx src/app/influencer/[username]/widget-editor/page.tsx tests/unit/widget/inline-mount-section.test.tsx
git commit -m "feat(dashboard): let a customer choose where Bestie sits on their site"
```

---

### Task 5: Close the loop and record it

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-bestie-inline-surface-design.md`
- Test: `tests/unit/widget/picker-round-trip.test.ts` (create)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing test**

One test that walks the whole path in one file, because each task only proved its own seam:

```ts
import { describe, it, expect } from 'vitest';
import { resolveInlineMount } from '@/lib/widget/inline';

describe('a picked mount survives the round trip', () => {
  it('what the picker emits is what the resolver stores', () => {
    // Exactly the shape public/widget.js posts as `ibot:picked`, plus the
    // fields the editor adds before saving.
    const picked = {
      selector: '.content_home-c-hero',
      mode: 'into',
      reserve: { desktop: 748, mobile: 0 },
      theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' },
      enabled: 'preview',
      preset: 'hero',
      surface: 'bare',
      bubble: 'after-scroll',
    };
    const stored = resolveInlineMount({ widget: { inline: picked } });
    expect(stored).toEqual({
      enabled: 'preview',
      selector: '.content_home-c-hero',
      mode: 'into',
      preset: 'hero',
      surface: 'bare',
      reserve: { desktop: 748, mobile: 0 },
      theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' },
      bubble: 'after-scroll',
    });
  });

  it('a picked `label` never reaches storage — it is display only', () => {
    const stored = resolveInlineMount({
      widget: { inline: { enabled: 'preview', selector: '.hero', label: 'div.hero' } },
    })!;
    expect('label' in stored).toBe(false);
  });

  it('an unsafe pick cannot round-trip even if the client forges it', () => {
    expect(resolveInlineMount({ widget: { inline: { enabled: true, selector: 'body', mode: 'replace' } } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/widget/picker-round-trip.test.ts`
Expected: FAIL if any field name drifted between the picker and the resolver — which is precisely what this test exists to catch.

- [ ] **Step 3: Reconcile**

Fix whichever side is wrong. The resolver is the authority on stored shape; the picker must emit what it accepts.

- [ ] **Step 4: Update the spec**

In `docs/superpowers/specs/2026-08-24-bestie-inline-surface-design.md`, replace the "Not in this plan" text about the picker and the sampler with what was actually built: the two postMessage types, the id-then-unique-class selector rule, what the sampler reads and that it proposes rather than applies, and that a new mount defaults to `preview`.

- [ ] **Step 5: Commit**

```bash
npx vitest run tests/unit/widget/ tests/unit/telemetry/
npm run type-check
git add docs/superpowers/specs/2026-08-24-bestie-inline-surface-design.md tests/unit/widget/picker-round-trip.test.ts
git commit -m "docs(widget): the picker and sampler as built"
```

---

## Not in this plan

Multi-page mounts (the `paths` field exists but the editor offers no UI for it), mount `mode` selection by the customer (the picker always proposes `into`; `replace` and `overlay` stay operator-set), Shopify/WordPress app blocks, and any change to the floating widget's own appearance.
