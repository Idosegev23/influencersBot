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
