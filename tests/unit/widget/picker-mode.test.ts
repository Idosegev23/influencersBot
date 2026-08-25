import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';
// The server-side gate on save. Imported deliberately rather than restated:
// this is the one seam in the feature that fails invisibly — a selector the
// picker emits and this function rejects is a customer's click that vanishes
// with no error anywhere — so the test asserts against the real predicate.
import { isUnsafeSelector } from '@/lib/widget/inline';

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
