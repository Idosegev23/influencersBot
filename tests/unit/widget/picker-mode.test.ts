import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';
// The server-side gate on save. Imported deliberately rather than restated:
// this is the one seam in the feature that fails invisibly — a selector the
// picker emits and this function rejects is a customer's click that vanishes
// with no error anywhere — so the test asserts against the real predicate.
import { isUnsafeSelector } from '@/lib/widget/inline';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* */ }
  // The harness rewrites document.body.innerHTML between boots but not the
  // body element's own attributes, so a class one test puts there to exercise
  // the <body> guard would otherwise still be on it in the next.
  document.body.className = '';
});

/**
 * The picker's copy of the storable-selector grammar, lifted out of the file
 * that is actually served rather than restated here. A third copy of the regex
 * living in the test would drift on its own and take the drift check with it.
 */
function pickerStorableRegex(): RegExp {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'public', 'widget.js');
    if (existsSync(candidate)) {
      const m = readFileSync(candidate, 'utf8').match(/var PICKER_STORABLE = (\/.*\/);/);
      if (!m) throw new Error('picker-mode.test: PICKER_STORABLE not found in public/widget.js');
      // eslint-disable-next-line no-new-func
      return new Function('return ' + m[1])() as RegExp;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('picker-mode.test: could not locate public/widget.js from ' + process.cwd());
}

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
    // A bare <body> carries no id and no class, so pickerSelector() returns
    // null for it and the pick is refused whether or not the <body> guard
    // exists — which would make this test green with the guard deleted. Real
    // sites ship <body class="home">, where that guard is the only thing
    // between a click and mounting Bestie into the document body.
    document.body.className = 'home-page';
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
    // The hero's own CTA, not the first <a> it happens to contain: the accent
    // is the whole reason the sampler walks candidates instead of taking
    // querySelector('a') and reading transparent-black off a text link.
    expect(t.accent).toBe('#4c3e5e');
  });

  it('never emits a selector the server would silently refuse to store', async () => {
    // A Hebrew class name is outside STORABLE_SELECTOR's ASCII grammar. Saving
    // it would be dropped with no error the customer can see, so the pick is
    // declined here instead — loudly, into diagnostics.
    const w = await bootWidget({ html: '<div class="כותרת">x</div>', config: { inline: null }, preview: true });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.כותרת') as HTMLElement).click();
    expect(up.filter((m) => m?.type === 'ibot:picked')).toHaveLength(0);
    expect(w.reports.map((r) => r.type)).toContain('picker_no_stable_selector');
  });

  it('emits only selectors that pass the real server-side storable check', async () => {
    for (const html of [
      HERO,
      '<div id="hero-search" class="a b c">x</div>',
      '<div class="a b">1</div><div class="a c">2</div><div class="b c">3</div>',
    ]) {
      await bootWidget({ html, config: { inline: null }, preview: true });
      const up = captureUp();
      post({ type: 'ibot:picker', on: true });
      (document.querySelector('#hero-search, .content_home-c-hero, .a') as HTMLElement).click();
      const picked = up.find((m) => m?.type === 'ibot:picked');
      expect(picked).toBeTruthy();
      expect(isUnsafeSelector(picked.selector)).toBe(false);
    }
  });

  it('falls back to a class chain when no single class is unique', async () => {
    await bootWidget({
      html: '<div class="a b">1</div><div class="a c">2</div><div class="b c">3</div>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.a') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked').selector).toBe('.a.b');
  });

  it('refuses to pick Bestie\'s own chrome', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: null }, preview: true });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (w.container as HTMLElement).click();
    expect(up.filter((m) => m?.type === 'ibot:picked')).toHaveLength(0);
  });

  it('suppresses the click so the customer does not navigate away mid-pick', async () => {
    await bootWidget({ html: HERO + '<a id="away" href="/gone">go</a>', config: { inline: null }, preview: true });
    let navigated = false;
    document.getElementById('away')!.addEventListener('click', (e) => { if (!e.defaultPrevented) navigated = true; });
    post({ type: 'ibot:picker', on: true });
    document.getElementById('away')!.click();
    expect(navigated).toBe(false);
  });

  // ── I2: the class-chain builder on a utility-CSS page ────────────────────
  //
  // The chain loop used to take a PREFIX of the raw class list and never
  // filter it, while the single-class loop above it correctly filtered
  // through pickerSelectorFits. On any Tailwind-shaped page that made every
  // chain unbuildable — one illegal token near the front poisons the whole
  // prefix — and the picker returned null for elements carrying a perfectly
  // storable pair of classes.
  it('builds a chain from the grammar-legal classes on a Tailwind-shaped element', async () => {
    // `md:flex` (colon) and `-mt-4` (leading hyphen) are legal HTML classes
    // and illegal in the storable grammar. `.relative` and `.hero-shell` are
    // each ambiguous on their own — the decoys below see to that — so the
    // ONLY answer is the chain `.relative.hero-shell`, which cannot be built
    // at all unless the illegal tokens are filtered out first.
    await bootWidget({
      html: '<section class="relative md:flex -mt-4 hero-shell"><h1>hero</h1></section>' +
            '<div class="relative">decoy a</div><div class="hero-shell">decoy b</div>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('section.hero-shell') as HTMLElement).click();
    const picked = up.find((m) => m?.type === 'ibot:picked');
    expect(picked).toBeTruthy();
    expect(picked.selector).toBe('.relative.hero-shell');
    // And it is storable by the real server-side predicate, not just by shape.
    expect(isUnsafeSelector(picked.selector)).toBe(false);
  });

  it('combines classes rather than only taking a prefix of them', async () => {
    // `.a.b` is ambiguous; `.a.hero` is unique. A prefix-only walk would skip
    // straight past the two-class answer to the three-class `.a.b.hero`,
    // which is a longer selector with more ways to stop matching. Asserting
    // the exact selector — not merely that SOMETHING was picked — is what
    // makes this test distinguish combinations from prefixes.
    await bootWidget({
      html: '<div class="a b hero">1</div><div class="a b">2</div>' +
            '<div class="a">3</div><div class="hero">4</div>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.a.b.hero') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked').selector).toBe('.a.hero');
  });

  it('does not spend its class budget on tokens the grammar cannot use', async () => {
    // The combination search is capped (PICKER_MAX_CLASSES) so a click never
    // spends a second in querySelectorAll. Counting ILLEGAL tokens against
    // that budget is how a real Tailwind element — utilities first, semantic
    // classes last — exhausts it before reaching anything storable. Eleven
    // illegal tokens here, more than the cap, then the only two that matter.
    await bootWidget({
      html: '<section class="md:flex lg:grid -mt-1 -mt-2 -mt-3 -mt-4 -mt-5 -mt-6 -mt-7 -mt-8 -mt-9 relative hero-shell">' +
            '<h1>hero</h1></section>' +
            '<div class="relative">decoy a</div><div class="hero-shell">decoy b</div>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('section.hero-shell') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked')?.selector).toBe('.relative.hero-shell');
  });

  it('still prefers a single unique class over any chain', async () => {
    // Presence sibling to the two chain tests: filtering and combining must
    // not have moved the cheapest, most stable answer out of first place.
    await bootWidget({
      html: '<section class="relative md:flex hero-shell"><h1>hero</h1></section>' +
            '<div class="relative">decoy</div>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('section.hero-shell') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked').selector).toBe('.hero-shell');
  });

  // ── I3: a refused pick is visible, and a dead click walks up ─────────────

  it('walks up to a storable ancestor instead of dropping a click on a bare child', async () => {
    // Clicking the headline is the obvious thing to aim at, and an <h1>
    // almost never carries an id or a unique class. Before the walk, this
    // click produced nothing at all.
    await bootWidget({
      html: '<section class="picker-outer"><h1>We Turn Brands Into Leaders</h1></section>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.picker-outer h1') as HTMLElement).click();
    const picked = up.find((m) => m?.type === 'ibot:picked');
    expect(picked).toBeTruthy();
    expect(picked.selector).toBe('.picker-outer');
    // The label must name what was actually picked, not what was clicked —
    // otherwise the dashboard summary tells the customer "h1" while the
    // stored selector is the section around it.
    expect(picked.label).toContain('picker-outer');
    expect(up.filter((m) => m?.type === 'ibot:pick-failed')).toHaveLength(0);
  });

  it('picks the clicked element itself when that element is storable', async () => {
    // Presence sibling to the walk: the ancestor search is a FALLBACK. A
    // click on a storable element must still pick exactly what the outline
    // was drawn around, never its parent.
    await bootWidget({
      html: '<section class="picker-outer"><div class="picker-inner">x</div></section>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.picker-inner') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked').selector).toBe('.picker-inner');
  });

  it('gives up after three ancestors rather than picking half the page', async () => {
    // Four bare wrappers between the click and the only storable element:
    // one more than the walk is willing to cross. The three-deep sibling
    // below proves the limit is a limit and not a broken walk.
    await bootWidget({
      html: '<section class="picker-outer"><div><div><div><span>x</span></div></div></div></section>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.picker-outer span') as HTMLElement).click();
    expect(up.filter((m) => m?.type === 'ibot:picked')).toHaveLength(0);
    expect(up.filter((m) => m?.type === 'ibot:pick-failed')).toHaveLength(1);
  });

  it('reaches a storable element exactly three ancestors up', async () => {
    await bootWidget({
      html: '<section class="picker-outer"><div><div><span>x</span></div></div></section>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.picker-outer span') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked').selector).toBe('.picker-outer');
  });

  it('tells the dashboard when it refuses a pick, not only the diagnostics table', async () => {
    // Same Hebrew-class fixture as the storability test above — the class is
    // outside the ASCII grammar and <body> is the only ancestor, so the walk
    // has nowhere to go. The diagnostic alone left the customer with a click
    // that did nothing: the picker stays armed and the dashboard never
    // changed, so they click the same dead element again.
    const w = await bootWidget({ html: '<div class="כותרת">x</div>', config: { inline: null }, preview: true });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.כותרת') as HTMLElement).click();
    const failed = up.find((m) => m?.type === 'ibot:pick-failed');
    expect(failed).toBeTruthy();
    expect(failed.label).toContain('div');
    expect(up.filter((m) => m?.type === 'ibot:picked')).toHaveLength(0);
    // Both channels, not one instead of the other: the diagnostic is still
    // our record of it.
    expect(w.reports.map((r) => r.type)).toContain('picker_no_stable_selector');
  });

  it('stays armed after a refusal so the next click can land', async () => {
    await bootWidget({
      html: '<div class="כותרת">x</div><div class="picker-outer">y</div>',
      config: { inline: null }, preview: true,
    });
    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    (document.querySelector('.כותרת') as HTMLElement).click();
    expect(up.filter((m) => m?.type === 'ibot:pick-failed')).toHaveLength(1);
    (document.querySelector('.picker-outer') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked').selector).toBe('.picker-outer');
  });

  // ── I5: the preview mount is present while picking ───────────────────────

  it('refuses to pick the inline mount it has already rendered into the hero', async () => {
    // The dashboard iframe now loads with ?bestie=1, so an `enabled:
    // "preview"` mount is IN the page while the customer picks. Bestie's own
    // surface must not be a pickable spot, and the rest of the hero must
    // still be.
    await bootWidget({
      html: '<section><div class="content_home-c-hero"><h1>LDRS</h1></div></section>',
      config: {
        inline: {
          enabled: 'preview', selector: '.content_home-c-hero', mode: 'into', preset: 'hero',
          surface: 'bare', reserve: { desktop: 0, mobile: 0 },
          theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'light' },
          bubble: 'after-scroll', banner: null, paths: null,
        },
      },
      preview: true, search: '?bestie=1',
    });
    const host = document.querySelector('[data-bestie-inline]') as HTMLElement;
    // Fixture guard: without a mounted host this test would assert nothing.
    expect(host).toBeTruthy();

    const up = captureUp();
    post({ type: 'ibot:picker', on: true });
    host.click();
    expect(up.filter((m) => m?.type === 'ibot:picked')).toHaveLength(0);

    // ...and `into` appends INSIDE the target, so the hero itself is
    // untouched and still pickable.
    (document.querySelector('.content_home-c-hero') as HTMLElement).click();
    expect(up.find((m) => m?.type === 'ibot:picked').selector).toBe('.content_home-c-hero');
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

/**
 * The one seam in this feature that fails invisibly, pinned from both sides.
 *
 * `PICKER_STORABLE` in public/widget.js and `STORABLE_SELECTOR` behind
 * isUnsafeSelector() in src/lib/widget/inline.ts are two hand-kept copies of
 * one grammar — widget.js is served raw and imports nothing, so they cannot be
 * a shared module. If the widget's copy ever grows looser than the server's,
 * the picker emits selectors the save silently discards and the customer's
 * click vanishes with no error anywhere.
 *
 * Asserting the two agree WITH EACH OTHER is not enough: that stays green if
 * both are loosened. So each case pins the expected verdict, and either copy
 * drifting in either direction turns this red.
 */
describe('picker selector grammar', () => {
  const CORPUS: Array<[string, boolean]> = [
    ['#a', true],           // the simplest id
    ['#2a', false],         // legal HTML, illegal CSS ident — leading digit
    ['#nav:main', false],   // legal HTML id; querySelectorAll on it THROWS
    ['.כותרת', false],  // Hebrew class — common on the sites this pilot targets
    ['.a', true],           // one class
    ['.a.b', true],         // two chained
    ['.a.b.c', true],       // three chained — the ceiling
    ['.a.b.c.d', false],    // four — one past it
    ['body', false],        // a bare tag: what the whole allowlist exists to refuse
    ['', false],            // nothing at all
  ];

  it('is the same grammar the server enforces on save, in both directions', () => {
    const re = pickerStorableRegex();
    for (const [sel, storable] of CORPUS) {
      expect(re.test(sel), 'widget PICKER_STORABLE on ' + JSON.stringify(sel)).toBe(storable);
      expect(isUnsafeSelector(sel), 'server isUnsafeSelector on ' + JSON.stringify(sel)).toBe(!storable);
    }
  });
});
