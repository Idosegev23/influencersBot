# Widget Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer edit their widget's words, starters, reel and invitation bubbles from their own dashboard, and schedule a promotion that removes itself.

**Architecture:** Overrides are a layer, not an edit. `resolveBanner` — the pure resolver both renderers already share — gains one step that merges any override whose date window is open over the surface's default. The editor is a new dashboard page that previews changes by posting a draft config into the real widget running in an iframe, so the preview cannot drift from production.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind, Supabase (`accounts.config` JSONB), Vitest, vanilla `public/widget.js`.

**Spec:** `docs/superpowers/specs/2026-08-19-widget-editor-design.md`

## Global Constraints

- Date windows are **dates, not timestamps**, evaluated in **`Asia/Jerusalem`** regardless of server timezone.
- `/api/widget/config` must **not** gain cache headers; a cached response delays a window opening or closing.
- Override merging is **per field**. Surface fallback (`chat` → `widget`) stays **whole-object** — do not change it.
- `config.reels` remains the switch for video art. The editor selects from persisted reels; it never uploads.
- Run tests with `npx vitest run` (`npm run test` is watch mode).
- Type-check with `npm run type-check`; the repo has 11 pre-existing `src` errors in admin files — do not treat those as yours.
- Widget edits must be verified on an account whose real site does **not** embed the widget (e.g. `danielamit`); accounts like Argania load the deployed script alongside the injected one.

---

### Task 1: Override resolution in the pure core

**Files:**
- Modify: `src/lib/widget/banner.ts`
- Test: `tests/unit/widget/banner-resolve.test.ts`

**Interfaces:**
- Consumes: existing `resolveBanner(config, surface, ctx)`.
- Produces: `todayInIsrael(now?: Date): string` and `activeOverrides(config, surface, now?): BannerOverride[]`, both exported from `src/lib/widget/banner.ts`. `BannerOverride` is a partial banner plus `{ id?, from?, until?, surface?, teaser?, tooltip? }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/widget/banner-resolve.test.ts`:

```ts
import { todayInIsrael, activeOverrides } from '@/lib/widget/banner';

describe('todayInIsrael', () => {
  it('returns an ISO date', () => {
    expect(todayInIsrael(new Date('2026-08-19T09:00:00Z'))).toBe('2026-08-19');
  });

  it('is still the 31st just before midnight in Israel, when UTC has moved on', () => {
    // 2026-08-31T21:30Z is 00:30 on the 1st in UTC terms but 00:30 Israel = still Sept 1.
    // 2026-08-31T20:30Z is 23:30 on the 31st in Israel.
    expect(todayInIsrael(new Date('2026-08-31T20:30:00Z'))).toBe('2026-08-31');
  });
});

describe('activeOverrides', () => {
  const base = {
    widget: { banner: { headline: 'רגיל' } },
    overrides: [
      { id: 'sale', from: '2026-08-20', until: '2026-08-31', headline: 'מבצע' },
    ],
  };
  const at = (d: string) => new Date(`${d}T09:00:00Z`);

  it('is empty before the window opens', () => {
    expect(activeOverrides(base, 'widget', at('2026-08-19'))).toHaveLength(0);
  });

  it('includes the override on the first day', () => {
    expect(activeOverrides(base, 'widget', at('2026-08-20'))).toHaveLength(1);
  });

  it('includes the override on the last day — until is inclusive', () => {
    expect(activeOverrides(base, 'widget', at('2026-08-31'))).toHaveLength(1);
  });

  it('is empty after the window closes', () => {
    expect(activeOverrides(base, 'widget', at('2026-09-01'))).toHaveLength(0);
  });

  it('treats a missing from as open-ended in the past, missing until as open-ended in the future', () => {
    const cfg = { overrides: [{ headline: 'x' }] };
    expect(activeOverrides(cfg, 'widget', at('2020-01-01'))).toHaveLength(1);
  });

  it('filters by surface', () => {
    const cfg = { overrides: [{ surface: 'chat', headline: 'x' }] };
    expect(activeOverrides(cfg, 'widget', at('2026-08-20'))).toHaveLength(0);
    expect(activeOverrides(cfg, 'chat', at('2026-08-20'))).toHaveLength(1);
  });

  it('treats "both" and a missing surface as applying everywhere', () => {
    const cfg = { overrides: [{ surface: 'both', headline: 'x' }, { headline: 'y' }] };
    expect(activeOverrides(cfg, 'widget', at('2026-08-20'))).toHaveLength(2);
  });
});

describe('resolveBanner — scheduled overrides', () => {
  const at = (d: string) => new Date(`${d}T09:00:00Z`);
  const cfg = {
    widget: { banner: { headline: 'רגיל', subline: 'תת כותרת', eyebrow: 'רגיל' } },
    overrides: [{ from: '2026-08-20', until: '2026-08-31', eyebrow: 'מבצע החודש' }],
  };

  it('leaves the default alone outside the window', () => {
    const b = resolveBanner(cfg, 'widget', CTX, at('2026-08-19'))!;
    expect(b.eyebrow).toBe('רגיל');
  });

  it('merges per field inside the window — an eyebrow override keeps the headline', () => {
    const b = resolveBanner(cfg, 'widget', CTX, at('2026-08-25'))!;
    expect(b.eyebrow).toBe('מבצע החודש');
    expect(b.headline).toBe('רגיל');
    expect(b.subline).toBe('תת כותרת');
  });

  it('applies later overrides over earlier ones so overlap is predictable', () => {
    const two = {
      widget: { banner: { headline: 'רגיל' } },
      overrides: [
        { from: '2026-08-01', until: '2026-08-31', headline: 'ראשון' },
        { from: '2026-08-20', until: '2026-08-25', headline: 'שני' },
      ],
    };
    expect(resolveBanner(two, 'widget', CTX, at('2026-08-22'))!.headline).toBe('שני');
  });

  it('an override alone can produce a banner for an account that has none', () => {
    const only = { overrides: [{ from: '2026-08-01', until: '2026-08-31', headline: 'מבצע' }] };
    expect(resolveBanner(only, 'widget', CTX, at('2026-08-10'))!.headline).toBe('מבצע');
  });

  it('an override cannot resurrect a banner the account switched off', () => {
    const off = {
      widget: { banner: { enabled: false, headline: 'רגיל' } },
      overrides: [{ from: '2026-08-01', until: '2026-08-31', headline: 'מבצע' }],
    };
    expect(resolveBanner(off, 'widget', CTX, at('2026-08-10'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/widget/banner-resolve.test.ts`
Expected: FAIL — `todayInIsrael is not a function`.

- [ ] **Step 3: Implement**

Add to `src/lib/widget/banner.ts`, above `resolveBanner`:

```ts
export interface BannerOverride {
  id?: string;
  /** Inclusive ISO date (YYYY-MM-DD) in Asia/Jerusalem. Absent = no lower bound. */
  from?: string;
  /** Inclusive ISO date. Absent = no upper bound. */
  until?: string;
  surface?: BannerSurface | 'both';
  /** Invitation bubble copy, read by the widget rather than the banner. */
  teaser?: string;
  tooltip?: string;
  [field: string]: unknown;
}

/**
 * Today's date in Israel, as YYYY-MM-DD.
 *
 * Windows are dates, not instants: a promotion ending on the 31st ends when
 * the 31st ends in Israel. Comparing UTC would close it three hours early in
 * summer, and the failure is silent — the offer simply stops appearing.
 * `en-CA` is used because it formats as YYYY-MM-DD, which string-compares
 * correctly.
 */
export function todayInIsrael(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

/** The overrides whose window is open and whose surface matches. */
export function activeOverrides(
  config: any,
  surface: BannerSurface,
  now: Date = new Date(),
): BannerOverride[] {
  const list = Array.isArray(config?.overrides) ? config.overrides : [];
  const today = todayInIsrael(now);
  return list.filter((o: BannerOverride) => {
    if (!o || typeof o !== 'object') return false;
    const target = o.surface || 'both';
    if (target !== 'both' && target !== surface) return false;
    if (typeof o.from === 'string' && o.from > today) return false;
    if (typeof o.until === 'string' && o.until < today) return false;
    return true;
  });
}
```

Change `resolveBanner`'s signature and the `raw` derivation:

```ts
export function resolveBanner(
  config: any,
  surface: BannerSurface,
  ctx: BannerContext = {},
  now: Date = new Date(),
): ResolvedBanner | null {
```

Then, immediately after the existing `const raw = ...` line, insert:

```ts
  // Overrides merge per field over whatever the surface resolved to. Unlike
  // the surface fallback above — which is whole-object on purpose — an
  // override answers "what changed for now", so a promotion that only
  // replaces the eyebrow must not blank the headline.
  const active = activeOverrides(config, surface, now);
  const merged = active.length
    ? active.reduce((acc: any, o: BannerOverride) => {
        const { id, from, until, surface: _s, teaser, tooltip, ...fields } = o;
        return { ...acc, ...fields };
      }, raw || {})
    : raw;

  if (!merged || typeof merged !== 'object') return null;
  if (merged.enabled === false) return null;
```

Then replace every later use of `raw.` in the function body with `merged.`, and delete the now-duplicated `if (!raw ...) return null;` / `if (raw.enabled === false) return null;` pair that preceded it.

Note the ordering this produces: an override alone yields a banner (because `merged` is truthy even when `raw` was `undefined`), while `enabled: false` on the default still wins, because the override's own fields do not include `enabled` unless the customer set it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/widget/banner-resolve.test.ts`
Expected: PASS, all pre-existing tests included.

- [ ] **Step 5: Commit**

```bash
git add src/lib/widget/banner.ts tests/unit/widget/banner-resolve.test.ts
git commit -m "feat(banner): scheduled overrides merge over the default per field"
```

---

### Task 2: Editable invitation copy (teaser and tooltip)

**Files:**
- Modify: `src/app/api/widget/config/route.ts`
- Modify: `public/widget.js`
- Test: `tests/unit/widget/banner-invitation.test.ts` (create)

**Interfaces:**
- Consumes: `activeOverrides` from Task 1.
- Produces: `/api/widget/config` response gains `invitation: { teaser: string | null; tooltip: string | null }`. `widget.js` reads `config.invitation`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/banner-invitation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveInvitation } from '@/lib/widget/banner';

const at = (d: string) => new Date(`${d}T09:00:00Z`);

describe('resolveInvitation', () => {
  it('is null on both when nothing is configured', () => {
    expect(resolveInvitation({}, 'widget')).toEqual({ teaser: null, tooltip: null });
  });

  it('reads the account defaults', () => {
    const cfg = { widget: { teaser: 'שלום', tooltip: 'דברו איתי' } };
    expect(resolveInvitation(cfg, 'widget')).toEqual({ teaser: 'שלום', tooltip: 'דברו איתי' });
  });

  it('an open override replaces the teaser', () => {
    const cfg = {
      widget: { teaser: 'שלום' },
      overrides: [{ from: '2026-08-01', until: '2026-08-31', teaser: 'מבצע!' }],
    };
    expect(resolveInvitation(cfg, 'widget', at('2026-08-10')).teaser).toBe('מבצע!');
  });

  it('a closed override leaves the default', () => {
    const cfg = {
      widget: { teaser: 'שלום' },
      overrides: [{ from: '2026-08-01', until: '2026-08-05', teaser: 'מבצע!' }],
    };
    expect(resolveInvitation(cfg, 'widget', at('2026-08-10')).teaser).toBe('שלום');
  });

  it('trims and caps long copy', () => {
    const cfg = { widget: { teaser: '  ' + 'א'.repeat(200) + '  ' } };
    expect(resolveInvitation(cfg, 'widget').teaser!.length).toBe(140);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/widget/banner-invitation.test.ts`
Expected: FAIL — `resolveInvitation is not a function`.

- [ ] **Step 3: Implement the resolver**

Add to `src/lib/widget/banner.ts`:

```ts
const MAX_INVITATION = 140;

export interface ResolvedInvitation {
  /** Proactive bubble copy. null = keep the locale default in widget.js. */
  teaser: string | null;
  /** Closed-launcher bubble copy. null = keep the locale default. */
  tooltip: string | null;
}

/**
 * The two bubbles shown beside a closed launcher. Kept out of ResolvedBanner
 * because they belong to the launcher rather than the panel, and the widget
 * needs them before any banner is on screen.
 */
export function resolveInvitation(
  config: any,
  surface: BannerSurface,
  now: Date = new Date(),
): ResolvedInvitation {
  const widgetConfig = config?.widget || {};
  let teaser = copy(widgetConfig.teaser, MAX_INVITATION);
  let tooltip = copy(widgetConfig.tooltip, MAX_INVITATION);

  for (const o of activeOverrides(config, surface, now)) {
    const t = copy(o.teaser, MAX_INVITATION);
    const p = copy(o.tooltip, MAX_INVITATION);
    if (t) teaser = t;
    if (p) tooltip = p;
  }
  return { teaser, tooltip };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/widget/banner-invitation.test.ts`
Expected: PASS.

- [ ] **Step 5: Return it from the config route**

In `src/app/api/widget/config/route.ts`, change the import to
`import { resolveBanner, resolveInvitation } from '@/lib/widget/banner';`
and add to the JSON body, directly after the existing `banner:` line:

```ts
        // The launcher's own copy. Separate from `tooltip` below, which is the
        // legacy string field the manage page writes; this one honours an
        // active promotion.
        invitation: resolveInvitation(config, 'widget'),
```

- [ ] **Step 6: Consume it in the widget**

In `public/widget.js`, in the config normalize block, after the `if (data.banner ...)` block, add:

```js
      if (data.invitation) config.invitation = data.invitation;
```

Add `invitation: null,` to the `var config = {` defaults block, beside `tooltip: null,`.

Then in `showBubbleTooltip`, replace the text resolution line with:

```js
      var text = (config.invitation && config.invitation.tooltip)
        || (config.tooltip && config.tooltip.text)
        || (locale.teaser && locale.teaser.generic)
        || '';
```

And in the teaser text selection inside `showTeaser`, replace the assignment of `text` with:

```js
      var text = (config.invitation && config.invitation.teaser) || (ctx && ctx.product && ctx.product.name
        ? locale.teaser.product.replace('{product}', String(ctx.product.name).slice(0, 40))
        : (modules.customerService.enabled ? locale.teaser.cs : locale.teaser.generic));
```

- [ ] **Step 7: Verify in a browser**

Set a teaser on the demo account, then load the preview:

```bash
npm run dev  # separate shell
node -e "0" # placeholder; use the DB to set config.widget.teaser = 'בדיקה'
```

Run a Playwright check from the repo root (not the scratchpad — `@playwright/test` will not resolve there) against `http://localhost:3000/api/widget/preview/038fd490-906d-431f-b428-ff9203ce4968`, assert `document.getElementById('ibot-tip').innerText` contains the configured text.

- [ ] **Step 8: Commit**

```bash
git add src/lib/widget/banner.ts src/app/api/widget/config/route.ts public/widget.js tests/unit/widget/banner-invitation.test.ts
git commit -m "feat(widget): teaser and tooltip copy come from config and honour promotions"
```

---

### Task 3: Draft preview channel

**Files:**
- Modify: `public/widget.js`
- Modify: `src/app/api/widget/preview/[accountId]/route.ts`

**Interfaces:**
- Produces: the widget listens for `postMessage({ type: 'ibot:draft', config })` from its parent and re-renders with those fields merged over its loaded config. Only active when the script tag carries `data-preview="true"`.

- [ ] **Step 1: Add the listener**

In `public/widget.js`, after the config fetch `.then()` block, add:

```js
  // ---- Draft preview channel ----
  // The editor renders the real widget in an iframe and pushes unsaved changes
  // in. Gated on data-preview so a customer's site can never be driven by a
  // message from an embedding page.
  if (SCRIPT_EL && SCRIPT_EL.getAttribute('data-preview') === 'true') {
    window.addEventListener('message', function (ev) {
      var msg = ev && ev.data;
      if (!msg || msg.type !== 'ibot:draft' || !msg.config) return;
      try {
        if (msg.config.banner !== undefined) config.banner = msg.config.banner;
        if (msg.config.invitation !== undefined) config.invitation = msg.config.invitation;
        if (msg.config.primaryColor) config.primaryColor = msg.config.primaryColor;
        pickBannerReel();
        applyLocaleAssets();
        bannerViewTracked = true;   // a draft is not a visitor impression
        if (!isOpen) { isOpen = true; }
        render();
      } catch (e) { /* never break the editor */ }
    });
  }
```

Find the existing variable that holds the script element (search for `data-account-id`); if it is not already in a variable, capture it as `SCRIPT_EL` where the account id is read.

- [ ] **Step 2: Verify manually**

With `npm run dev` running, open the preview URL in a browser, then from the console of the *parent* page post a draft and confirm the headline changes:

```js
document.querySelector('iframe').contentWindow.postMessage(
  { type: 'ibot:draft', config: { banner: { headline: 'טיוטה', art: { mode: 'gradient', from: '#9334EB', to: '#6d28d9' }, starters: null, cta: null, eyebrow: null, subline: null, valueLine: null } } }, '*');
```

- [ ] **Step 3: Commit**

```bash
git add public/widget.js
git commit -m "feat(widget): accept draft config over postMessage in preview mode"
```

---

### Task 4: Save path for overrides, starters and reel selection

**Files:**
- Modify: `src/app/api/influencer/settings/route.ts`
- Test: `tests/unit/widget/widget-editor-save.test.ts` (create)

**Interfaces:**
- Consumes: existing session-token auth in that route.
- Produces: the route accepts `body.overrides` (array), `body.reels` (array of `{video, poster}`), and `body.widget.banner.starters.items` (string array). Produces exported `sanitizeOverrides(input: unknown): BannerOverride[]` from `src/lib/widget/banner.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/widget/widget-editor-save.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeOverrides } from '@/lib/widget/banner';

describe('sanitizeOverrides', () => {
  it('drops non-arrays', () => {
    expect(sanitizeOverrides(null)).toEqual([]);
    expect(sanitizeOverrides({})).toEqual([]);
  });

  it('keeps a well-formed override', () => {
    const out = sanitizeOverrides([
      { id: 'sale', from: '2026-08-20', until: '2026-08-31', surface: 'both', headline: 'מבצע' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].headline).toBe('מבצע');
  });

  it('rejects malformed dates rather than storing a window that never closes', () => {
    const out = sanitizeOverrides([{ from: '20/08/2026', headline: 'x' }]);
    expect(out[0].from).toBeUndefined();
  });

  it('rejects a window that ends before it starts', () => {
    expect(sanitizeOverrides([{ from: '2026-08-31', until: '2026-08-01', headline: 'x' }])).toEqual([]);
  });

  it('normalises an unknown surface to both', () => {
    expect(sanitizeOverrides([{ surface: 'sms', headline: 'x' }])[0].surface).toBe('both');
  });

  it('caps the list so config cannot balloon', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ headline: `x${i}` }));
    expect(sanitizeOverrides(many)).toHaveLength(20);
  });

  it('drops an override with no content — a window over nothing is not a promotion', () => {
    expect(sanitizeOverrides([{ from: '2026-08-01', until: '2026-08-31' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/widget/widget-editor-save.test.ts`
Expected: FAIL — `sanitizeOverrides is not a function`.

- [ ] **Step 3: Implement**

Add to `src/lib/widget/banner.ts`:

```ts
const MAX_OVERRIDES = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate overrides on the way in. A malformed date is dropped rather than
 * stored, because an unparseable `until` reads as "no upper bound" at render
 * time — a promotion that never ends, with no error anywhere to explain it.
 */
export function sanitizeOverrides(input: unknown): BannerOverride[] {
  if (!Array.isArray(input)) return [];
  const out: BannerOverride[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;

    const from = typeof o.from === 'string' && ISO_DATE.test(o.from) ? o.from : undefined;
    const until = typeof o.until === 'string' && ISO_DATE.test(o.until) ? o.until : undefined;
    if (from && until && until < from) continue;

    const surface: BannerOverride['surface'] =
      o.surface === 'widget' || o.surface === 'chat' ? o.surface : 'both';

    const entry: BannerOverride = { surface };
    if (from) entry.from = from;
    if (until) entry.until = until;
    if (typeof o.id === 'string' && o.id.trim()) entry.id = o.id.trim().slice(0, 60);

    const eyebrow = copy(o.eyebrow, MAX_EYEBROW);
    const headline = copy(o.headline, MAX_HEADLINE);
    const subline = copy(o.subline, MAX_SUBLINE);
    const teaser = copy(o.teaser, MAX_INVITATION);
    const tooltip = copy(o.tooltip, MAX_INVITATION);
    if (eyebrow) entry.eyebrow = eyebrow;
    if (headline) entry.headline = headline;
    if (subline) entry.subline = subline;
    if (teaser) entry.teaser = teaser;
    if (tooltip) entry.tooltip = tooltip;

    const starters = resolveStarters(o.starters);
    if (starters) entry.starters = starters;

    const hasContent = eyebrow || headline || subline || teaser || tooltip || starters;
    if (!hasContent) continue;

    out.push(entry);
    if (out.length >= MAX_OVERRIDES) break;
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/widget/widget-editor-save.test.ts`
Expected: PASS.

- [ ] **Step 5: Accept the new fields in the save route**

In `src/app/api/influencer/settings/route.ts`, after the existing `if (body.widget) { ... }` block, add:

```ts
    // Account-level, not per-surface: an override applies to whichever
    // surfaces it names, and the reel rotation is shared by both.
    if (body.overrides !== undefined) {
      updatedConfig.overrides = sanitizeOverrides(body.overrides);
    }
    if (Array.isArray(body.reels)) {
      updatedConfig.reels = body.reels
        .filter((r: any) => r && typeof r.video === 'string' && /^https:\/\//.test(r.video))
        .slice(0, 5)
        .map((r: any) => ({ video: r.video, poster: typeof r.poster === 'string' ? r.poster : null }));
    }
```

Import it: `import { sanitizeOverrides } from '@/lib/widget/banner';`

- [ ] **Step 6: Type-check and commit**

```bash
npm run type-check 2>&1 | grep -E "settings/route|widget/banner"
git add src/lib/widget/banner.ts src/app/api/influencer/settings/route.ts tests/unit/widget/widget-editor-save.test.ts
git commit -m "feat(api): accept scheduled overrides, pinned starters and reel selection"
```

---

### Task 5: Editor page shell with live preview

**Files:**
- Create: `src/app/influencer/[username]/widget-editor/page.tsx`
- Create: `src/components/influencer/WidgetDraftPreview.tsx`

**Interfaces:**
- Consumes: `/api/influencer/profile?username=` for `accountId` and current config (the pattern used by `chatbot-settings/page.tsx`); `/api/influencer/settings` POST from Task 4.
- Produces: `<WidgetDraftPreview accountId={string} draft={object} />`, which renders the preview iframe and posts `ibot:draft` on every `draft` change.

- [ ] **Step 1: Create the preview component**

```tsx
'use client';

import { useEffect, useRef } from 'react';

/**
 * The real widget, running in an iframe, driven by unsaved edits.
 *
 * Deliberately not a React re-implementation of the widget chrome. One of
 * those exists — `src/components/manage/WidgetPreview.tsx` — and it has
 * already drifted from `public/widget.js`: wrong cover height, wrong avatar
 * size, a hardcoded palette. Anything that redraws the widget by hand will
 * drift again the next time the widget changes.
 */
export function WidgetDraftPreview({ accountId, draft }: { accountId: string; draft: unknown }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);

  useEffect(() => {
    const post = () => ref.current?.contentWindow?.postMessage(
      { type: 'ibot:draft', config: draft }, '*',
    );
    if (ready.current) post();
    // The widget only starts listening after its own config request resolves,
    // so the first draft is repeated briefly rather than sent once and lost.
    const t = setInterval(() => { if (ready.current) post(); }, 400);
    const stop = setTimeout(() => clearInterval(t), 4000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [draft]);

  return (
    <iframe
      ref={ref}
      onLoad={() => { ready.current = true; }}
      src={`/api/widget/preview/${accountId}`}
      className="h-[720px] w-full rounded-2xl border border-[#e5e5ea]"
      title="תצוגה מקדימה"
    />
  );
}
```

- [ ] **Step 2: Create the page shell**

`src/app/influencer/[username]/widget-editor/page.tsx` — a two-column layout: form on the inline-start, `<WidgetDraftPreview>` sticky on the inline-end. Load the account with the same `fetch('/api/influencer/profile?username=' + username)` call `chatbot-settings/page.tsx` uses, hold a `draft` state initialised from `config.widget.banner`, and a Save button posting to `/api/influencer/settings`.

The page must show, above the form, which layer is live right now:

```tsx
{liveOverride ? (
  <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: '#FFF4E5', color: '#7a4b00' }}>
    כרגע פעיל מבצע מתוזמן ({liveOverride.from} – {liveOverride.until}) שדורס חלק מהשדות למטה.
  </div>
) : null}
```

Without this the customer edits the default while a promotion covers it and concludes the editor is broken. Compute `liveOverride` with `activeOverrides(config, 'widget')` from Task 1.

- [ ] **Step 3: Add it to the dashboard navigation**

Find how `chatbot-settings` is linked from the dashboard (grep for `chatbot-settings` under `src/app/influencer` and `src/components`) and add a sibling entry labelled `עורך הווידג׳ט` pointing at `/influencer/${username}/widget-editor`.

- [ ] **Step 4: Verify**

With `npm run dev`, open `/influencer/danielamit/widget-editor`, type in the headline field, confirm the iframe headline changes without saving, then save and reload to confirm it persisted.

- [ ] **Step 5: Commit**

```bash
git add "src/app/influencer/[username]/widget-editor/page.tsx" src/components/influencer/WidgetDraftPreview.tsx
git commit -m "feat(dashboard): widget editor shell with live preview of the real widget"
```

---

### Task 6: Banner, starter and invitation fields

**Files:**
- Modify: `src/app/influencer/[username]/widget-editor/page.tsx`

**Interfaces:**
- Consumes: `draft` state and `WidgetDraftPreview` from Task 5.
- Produces: no new exports.

- [ ] **Step 1: Add the copy fields**

Inputs bound to `draft.banner`: `eyebrow` (32), `headline` (70), `subline` (110), `cta.label` (32), `cta.value` (200), `starters.label` (40). Each shows a live character count, matching the caps enforced in `src/lib/widget/banner.ts` — a field silently truncated on save is worse than one that will not accept the 71st character.

- [ ] **Step 2: Add the starter question editor**

Up to four rows, each an input with a remove button, plus an "add question" button. Above them:

```tsx
<p className="text-xs text-[#655e51]">
  בלי שאלות משלכם, הוויג׳ט מציע שאלות שמתעדכנות לבד לפי התוכן שלכם.
  ברגע שתכתבו שאלות כאן, הן יוצגו כמו שהן ולא יתעדכנו.
</p>
```

Empty list saves as `starters.items = null`, which restores the dynamic chips. Do not save an empty array — `resolveStarters` treats a present-but-empty list and an absent one differently at the boundary, and `null` is the one that means "go back to automatic".

- [ ] **Step 3: Add the invitation fields**

Two inputs, `teaser` and `tooltip` (140 each), written to `draft.invitation`. Label them by where they appear — "בועה שמופיעה מעצמה" and "בועה ליד הכפתור הסגור" — rather than by their internal names, which mean nothing to a customer.

- [ ] **Step 4: Verify each field drives the preview**

Type in each field; confirm the iframe updates. The teaser will not appear in preview until its trigger fires, so verify that one by reading `config.invitation` inside the iframe rather than by eye.

- [ ] **Step 5: Commit**

```bash
git add "src/app/influencer/[username]/widget-editor/page.tsx"
git commit -m "feat(dashboard): edit banner copy, starter questions and invitation bubbles"
```

---

### Task 7: Reel selection

**Files:**
- Create: `src/app/api/influencer/reels/route.ts`
- Modify: `src/app/influencer/[username]/widget-editor/page.tsx`

**Interfaces:**
- Produces: `GET /api/influencer/reels?username=` returns `{ reels: { shortcode, poster, video, selected }[] }` — every reel already persisted for the account plus whether it is in `config.reels`.

- [ ] **Step 1: Build the route**

Authenticate with `verifySessionToken` / `influencerSubject` exactly as `src/app/api/influencer/settings/route.ts` does. Read `config.reels` for the current selection, and list candidates from `instagram_posts` where `type in ('reel','video')` and `stored_media_urls is not null`, ordered by `views_count` descending, limit 30.

Return the persisted video URL only when one exists — a reel that has never been through `scripts/persist-reel-videos.ts` has a poster but no playable mp4, and offering it would let a customer select something that cannot play.

- [ ] **Step 2: Add the grid**

A grid of poster frames with a selected state, capped at 5 selections (`MAX_REELS` in `src/lib/widget/banner.ts`). Selecting writes `draft.reels`; the preview picks one at random per draft push, as production does.

Show, under the grid:

```tsx
<p className="text-xs text-[#655e51]">
  נבחרו {selected.length} מתוך 5. הסרטונים מתחלפים בין מבקרים.
</p>
```

- [ ] **Step 3: Handle the empty case**

An account with no persisted reels sees an explanation, not an empty grid:

```tsx
<p className="text-sm text-[#655e51]">
  עוד לא הופקו סרטונים לחשבון הזה. אחרי הסריקה הבאה הם יופיעו כאן.
</p>
```

- [ ] **Step 4: Verify**

On `danielamit` (which has five persisted reels) confirm the grid shows them, selection changes the preview, and saving then reloading keeps the selection.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/influencer/reels/route.ts" "src/app/influencer/[username]/widget-editor/page.tsx"
git commit -m "feat(dashboard): choose which reels play behind the banner"
```

---

### Task 8: Scheduled promotions

**Files:**
- Modify: `src/app/influencer/[username]/widget-editor/page.tsx`

**Interfaces:**
- Consumes: `sanitizeOverrides` semantics from Task 4, `activeOverrides` from Task 1.

- [ ] **Step 1: Add the promotions list**

A section below the default fields listing `config.overrides`, each row showing its window, which surfaces it covers, which fields it replaces, and a state badge computed with `activeOverrides`: `פעיל עכשיו`, `מתוזמן`, or `הסתיים`. Rows are added, edited and removed; order is preserved because later overrides win.

- [ ] **Step 2: Add the editor for one promotion**

Fields: `from`, `until` (both `<input type="date">`), `surface` (widget / chat / both), and the same copy fields as the default plus `teaser` and `tooltip`. Every field is optional — an empty one means "leave the default alone", which is the whole point of the layer, so the form must not require them.

- [ ] **Step 3: Make an ended promotion visibly inert**

Render finished rows at reduced opacity with the badge `הסתיים`, and do not delete them automatically. A customer re-running last year's sale should be able to copy it; silent deletion of their own content is worse than a tidy list.

- [ ] **Step 4: Preview a promotion before its window opens**

Add a "preview this promotion" control per row that merges that row into the draft pushed to the iframe, without changing the dates. Otherwise a promotion cannot be checked until the day it goes live, which is the day it is too late.

- [ ] **Step 5: Verify end to end**

Create a promotion for today, save, reload `/chat/danielamit` and the widget preview, and confirm the override's copy appears on both. Change `until` to yesterday, save, reload, and confirm the default returns.

- [ ] **Step 6: Commit**

```bash
git add "src/app/influencer/[username]/widget-editor/page.tsx"
git commit -m "feat(dashboard): schedule promotions that expire on their own"
```

---

## Phase 3 (not in this plan)

Persona detail and knowledge-base inventory on `/influencer/[username]/chatbot-persona`: what the bot knows and from where — website pages, Instagram, documents, manual knowledge — with counts, last-updated dates and per-source toggles. Needs its own design; the source inventory does not exist as a queryable shape today.
