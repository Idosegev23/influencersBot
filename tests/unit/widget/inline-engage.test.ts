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
