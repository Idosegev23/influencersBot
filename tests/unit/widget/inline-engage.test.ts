import { describe, it, expect } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

// Analytics ride navigator.sendBeacon as a Blob, and only once ANALYTICS_TOKEN
// is set from the config response — so a capturing test must pass
// `analyticsToken` and force the flush itself. `pagehide` is wired to
// flushAnalytics() unconditionally, which is the only way to force a flush from
// outside the IIFE without waiting on the real 3s batch timer. (Same pattern as
// tests/unit/widget/inline-preview.test.ts.)
function captureAnalyticsBeacons(): Blob[] {
  const beacons: Blob[] = [];
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string, body: Blob) => {
      if (String(url).includes('/api/analytics/widget')) beacons.push(body);
      return true;
    },
  });
  return beacons;
}

// jsdom's Blob implements only slice/size/type — FileReader is the only way to
// read the body back out.
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function flushedEvents(beacons: Blob[]): Promise<Array<{ name: string; payload: any }>> {
  window.dispatchEvent(new Event('pagehide'));
  const out: Array<{ name: string; payload: any }> = [];
  for (const b of beacons) {
    const parsed = JSON.parse(await readBlobText(b));
    for (const e of parsed.events || []) out.push(e);
  }
  return out;
}

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
    // A fresh jsdom body's overflow is always '', which cannot distinguish
    // "restored the host's value" from "just cleared it" (review finding).
    // Giving the host page a real, non-default value first makes the
    // restore assertion below actually test something.
    document.body.style.overflow = 'auto';
    const before = document.body.style.overflow;
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    expect(document.body.style.overflow).toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.style.overflow).toBe(before);
  });

  it('does not overwrite the saved scroll value on a double-click', async () => {
    // The desktop panel has no backdrop and the pill stays visible underneath
    // it, so a double-click (or a pill click immediately followed by a chip
    // click) calls openFromInline() twice before any close. The second call
    // must not re-capture 'hidden' as "the host's own value" — that would
    // strand the host page unscrollable forever (review Critical #1).
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    document.body.style.overflow = 'auto';
    const pill = shadow().getElementById('ibot-inline-pill') as HTMLElement;
    pill.click();
    pill.click();
    expect(document.body.style.overflow).toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores scroll when closed via the chat panel\'s own header button', async () => {
    // Escape is a power-user path; the header X is how most visitors actually
    // close a chat panel, and it did not go through closeWidget() before this
    // fix (review Important #5).
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    document.body.style.overflow = 'auto';
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    expect(document.body.style.overflow).toBe('hidden');
    const closeBtn = document.getElementById('ibot-close') as HTMLElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores scroll when closed from a form view reached mid-session', async () => {
    // A visitor can open from the inline pill, then navigate deeper into the
    // widget (e.g. the support form) before closing — that close button also
    // bypassed closeWidget() before this fix (review Important #5).
    await bootWidget({
      html: HERO,
      config: {
        inline: MOUNT,
        banner: { headline: 'Hi', subline: null, valueLine: null },
        modules: { support: { enabled: true } },
      },
    });
    document.body.style.overflow = 'auto';
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    expect(document.body.style.overflow).toBe('hidden');
    const supportBtn = document.getElementById('ibot-banner-support') as HTMLElement;
    expect(supportBtn).not.toBeNull();
    supportBtn.click();
    const closeBtn = document.getElementById('ibot-close') as HTMLElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(document.body.style.overflow).toBe('auto');
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

  it('measures the origin relative to the panel, not the viewport', async () => {
    // jsdom's real getBoundingClientRect() is all zeros, so the test above
    // cannot tell "computed the right point" from "computed A point" — '0px'
    // passes either way (review finding). Stubbing distinct, non-zero rects on
    // both the inline host and the panel makes the panel-relative subtraction
    // itself the thing under test: transform-origin is measured from the
    // PANEL's own border box, not the viewport, so feeding it raw viewport
    // coordinates (the brief's original formula) would land the origin
    // wherever the hero happens to sit on screen instead of on the pill.
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const host = document.querySelector('[data-bestie-inline]') as HTMLElement;
    const hostRect = { left: 500, top: 300, width: 200, height: 60, right: 700, bottom: 360, x: 500, y: 300, toJSON: () => ({}) } as DOMRect;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this === host) return hostRect;
      if ((this as HTMLElement).id === 'ibot-panel') {
        return { left: 1020, top: 200, width: 400, height: 500, right: 1420, bottom: 700, x: 1020, y: 200, toJSON: () => ({}) } as DOMRect;
      }
      return original.call(this);
    };
    try {
      (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
      const panel = document.getElementById('ibot-panel')!;
      // host centre (500+100, 300+30) = (600, 330); panel top-left (1020, 200).
      // Origin relative to the panel = host centre - panel top-left.
      expect(panel.style.getPropertyValue('--ibot-origin-x')).toBe('-420px');
      expect(panel.style.getPropertyValue('--ibot-origin-y')).toBe('130px');
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it('tags the open event with the surface it came from', async () => {
    // Was a readFileSync + toContain match on widget.js, which proved only that
    // a string exists in the file. This asserts the event that actually shipped.
    await bootWidget({ html: HERO, config: { analyticsToken: 'test-token', inline: MOUNT } });
    const beacons = captureAnalyticsBeacons();
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    const opened = (await flushedEvents(beacons)).filter((e) => e.name === 'widget_opened');
    expect(opened).toHaveLength(1);
    expect(opened[0].payload.surface).toBe('inline');
  });

  it('a double-click on the pill emits widget_opened exactly once', async () => {
    // The desktop panel has no backdrop, so the pill stays clickable underneath
    // it. This is the regression shape that actually occurred during the plan
    // and would have shipped green: the re-entrant guard existed, but nothing
    // counted the event it was there to protect.
    await bootWidget({ html: HERO, config: { analyticsToken: 'test-token', inline: MOUNT } });
    const beacons = captureAnalyticsBeacons();
    const pill = shadow().getElementById('ibot-inline-pill') as HTMLElement;
    pill.click();
    pill.click();
    const opened = (await flushedEvents(beacons)).filter((e) => e.name === 'widget_opened');
    expect(opened).toHaveLength(1);
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

  it('a chip click while the panel is already open still prefills, without re-opening', async () => {
    // Review round 2: guarding the whole engage on `isOpen` (not just the
    // scroll lock) stops a double-click from double-counting widget_opened,
    // but the guard must not also break the case where a chip click lands
    // while the panel is already open (pill click, then a chip click before
    // the panel repaints) — that click should still land its prefill.
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    expect(document.getElementById('ibot-panel')).not.toBeNull();
    (shadow().querySelector('[data-inline-chip="1"]') as HTMLElement).click();
    const input = document.querySelector(
      '#ibot-widget-container input, #ibot-widget-container textarea',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('אני יוצר תוכן');
  });

  it('a chip click while a FORM view is open is ignored, not typed into the form', async () => {
    // Open from the pill -> support from the banner -> view is 'support_form'.
    // The inline chips are still visible and clickable under the backdrop-less
    // desktop panel, and container.querySelector('input,textarea') in a form
    // view is that form's FIRST FIELD — so the starter text landed in the
    // customer's name/email box.
    await bootWidget({
      html: HERO,
      config: {
        inline: MOUNT,
        banner: { headline: 'Hi', subline: null, valueLine: null },
        modules: { support: { enabled: true } },
      },
    });
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    (document.getElementById('ibot-banner-support') as HTMLElement).click();
    const fields = Array.from(
      document.querySelectorAll('#ibot-widget-container input, #ibot-widget-container textarea'),
    ) as HTMLInputElement[];
    expect(fields.length).toBeGreaterThan(0);
    const before = fields.map((f) => f.value);
    (shadow().querySelector('[data-inline-chip="0"]') as HTMLElement).click();
    expect(fields.map((f) => f.value)).toEqual(before);
  });

  describe('the mobile panel animation stays exactly as it is for existing customers', () => {
    // The branch changed mobilePanelStyle()'s `animation` from unconditional to
    // panelPainted-gated. The collision it fixes only exists for an
    // inline-originated open (where [data-from-inline]'s grow must win), but
    // the gate also silenced the slide-up that every existing customer's mobile
    // widget replays on each render() — and "any change to the floating
    // widget's own appearance" is out of scope for this branch.
    it('a floating-bubble open still replays the slide-up on a later render', async () => {
      await bootWidget({ html: HERO, viewportWidth: 390 });
      (document.getElementById('ibot-trigger') as HTMLElement).click();
      expect(document.getElementById('ibot-panel')!.getAttribute('style')).toContain('ibot-slide-up');
      // The second render is the one the panelPainted-only gate silenced:
      // sending sets panelPainted (true since the first renderOpen) and
      // re-renders synchronously.
      const input = document.getElementById('ibot-input') as HTMLInputElement;
      input.value = 'hello';
      (document.getElementById('ibot-send') as HTMLElement).click();
      expect(document.getElementById('ibot-panel')!.getAttribute('style')).toContain('ibot-slide-up');
    });

    it('an inline-originated open suppresses it so the grow-from-origin can run', async () => {
      await bootWidget({ html: HERO, viewportWidth: 390, config: { inline: MOUNT } });
      (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
      const panel = document.getElementById('ibot-panel') as HTMLElement;
      expect(panel.getAttribute('data-from-inline')).toBe('1');
      expect(panel.getAttribute('style')).not.toContain('ibot-slide-up');
    });
  });

  it('does not add scrollbar-compensation padding when the lock does not change page width', async () => {
    // jsdom never lays out real content, so document.documentElement.clientWidth
    // does not move across the lock — representative of a host with
    // `scrollbar-gutter:stable` or `html{overflow-y:scroll}`, where the gutter
    // is already reserved and locking body overflow reclaims nothing.
    // Regression test for review round 2's new Important: the previous formula
    // (window.innerWidth - clientWidth, measured only BEFORE the lock)
    // assumed every lock removes a scrollbar and would have padded here with
    // nothing to compensate for, shifting the page on exactly the hosts the
    // original scrollbar-shift fix was meant to help.
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    document.body.style.paddingRight = '';
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    expect(document.body.style.paddingRight).toBe('');
  });

  it('restores host scroll even when the open throws before finishing', async () => {
    // Forces a throw after the scroll lock is taken and render() has painted
    // the panel, but before openFromInline() returns (panel.getBoundingClientRect(),
    // called to compute the grow-from-origin point) — the lock must not
    // survive an aborted open. Regression test for review round 2's Important:
    // "a throw mid-open leaves the host page locked with no way out".
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    document.body.style.overflow = 'auto';
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if ((this as HTMLElement).id === 'ibot-panel') throw new Error('boom');
      return original.call(this);
    };
    try {
      (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
      expect(document.body.style.overflow).toBe('auto');
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
});
