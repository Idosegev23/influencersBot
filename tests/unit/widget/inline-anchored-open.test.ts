import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

/**
 * Opening in place, not in a corner.
 *
 * When Bestie only borrows a slot inside someone's page (`into`), a floating
 * panel is right — the page is still theirs and the conversation is a layer on
 * top. When Bestie has *taken the hero over* (`replace`), the hero **is** the
 * surface, and a 400px box appearing in the bottom-right corner reads as a
 * different, unrelated component: the visitor clicked the middle of the screen
 * and something happened at the edge of it.
 *
 * So an inline-anchored open fills the box the invitation occupied. The
 * customer's video keeps playing behind it, exactly as it did a moment before.
 *
 * Mobile is deliberately unchanged: the full-screen panel already *is* in
 * place on a phone, and a hero-height box would be a cramped place to hold a
 * conversation.
 */
const HERO = `
  <style>
    .video_home-c { position: relative; display: flex; }
    .content_home-c-hero.auto { position: relative; z-index: 5; height: 576px; }
  </style>
  <div class="video_home-c">
    <video id="bg" autoplay loop muted playsinline></video>
    <div class="content_home-c-hero auto"><h1 id="theirs">We Turn Brands Into Leaders</h1></div>
  </div>`;

const BANNER = {
  eyebrow: 'אנחנו פה לכל שאלה', headline: 'היי! אנחנו לידרס!', subline: null,
  valueLine: null, cta: null,
  art: { mode: 'host', image: null, reels: null, from: '#000', to: '#000' },
  starters: { label: null, items: ['אני מותג'] },
};

const REPLACE = {
  enabled: true, selector: '.content_home-c-hero', mode: 'replace', preset: 'hero',
  surface: 'bare', reserve: { desktop: 576, mobile: 460 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll', paths: null, banner: BANNER,
};
const CFG = { inline: REPLACE, placeholder: 'שאלו אותנו הכל' };

/** The host's rect — jsdom returns zeros, so anchoring needs a real one. */
const RECT = { top: 120, left: 200, width: 1040, height: 576, right: 1240, bottom: 696, x: 200, y: 120 };

function stubHostRect() {
  const host = document.querySelector('[data-bestie-inline]') as HTMLElement;
  host.getBoundingClientRect = () => ({ ...RECT, toJSON: () => RECT }) as DOMRect;
  return host;
}
function shadow() {
  return (document.querySelector('[data-bestie-inline]') as HTMLElement).shadowRoot!;
}
function openInline() {
  (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });

describe('opening in place from an inline mount', () => {
  it('puts the conversation exactly where the invitation was', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    stubHostRect();
    openInline();

    const c = document.getElementById('ibot-widget-container')!;
    expect(c.style.top).toBe('120px');
    expect(c.style.left).toBe('200px');
    expect(c.style.width).toBe('1040px');
    expect(c.style.height).toBe('576px');
    // The corner placement must be gone, not merely overridden.
    expect(c.style.bottom).toBe('');
    expect(c.style.right).toBe('');
  });

  it('fills that box with the panel rather than a 400px card', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    stubHostRect();
    openInline();

    // Read the properties, not the serialised string: jsdom normalises
    // `width:100%` to `width: 100%`, so a substring match on the attribute
    // fails against correct output.
    const panel = document.getElementById('ibot-panel')! as HTMLElement;
    expect(panel.style.width).toBe('100%');
    expect(panel.style.height).toBe('100%');
    expect(panel.style.maxHeight).toBe('none');
  });

  it('leaves the customer video untouched behind it', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    stubHostRect();
    openInline();
    expect(document.getElementById('bg')).not.toBeNull();
  });

  it('gives the corner back when the conversation closes', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    stubHostRect();
    openInline();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const c = document.getElementById('ibot-widget-container')!;
    expect(c.style.position).toBe('fixed');
    expect(c.style.height).toBe('');
    expect(c.style.bottom).not.toBe('');
  });

  it('does NOT anchor for an `into` mount — that page is still theirs', async () => {
    await bootWidget({
      html: HERO,
      config: { ...CFG, inline: { ...REPLACE, mode: 'into', reserve: { desktop: 0, mobile: 0 } } },
      viewportWidth: 1440,
    });
    stubHostRect();
    openInline();

    // Presence first — an unopened panel would satisfy the absence for free.
    expect(document.getElementById('ibot-panel')).not.toBeNull();
    expect(document.getElementById('ibot-widget-container')!.style.bottom).not.toBe('');
  });

  it('leaves mobile on the full-screen panel, which is already in place', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 390 });
    stubHostRect();
    openInline();

    const panel = document.getElementById('ibot-panel')! as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.style.height).toBe('100dvh');
  });
});
