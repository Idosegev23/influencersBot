import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

/**
 * Glass message bubbles in the hero.
 *
 * The look is Apple's Liquid Glass, minus the part the web cannot do. Apple
 * simulates a refracting slab: real edge lensing, specular highlights that
 * track the gyroscope, and — the part that matters here — luminance sampling
 * behind the glass so text contrast adapts to whatever is underneath. A
 * browser has none of that. `backdrop-filter` snapshots the region and blurs
 * it, and there is no adaptive contrast at all, which is why the tint and the
 * text-shadow below are calibrated by hand rather than left to the material.
 *
 * The SVG displacement-map version of this effect was deliberately dropped:
 * it is what fakes the refraction, it re-rasterises on every frame of a
 * playing video, and the reference implementation disables itself on Safari
 * and Firefox anyway — so most visitors would have seen exactly this CSS.
 *
 * Legibility note that runs the other way from the usual worry: the blur
 * strips the high-frequency detail behind a 15px line, so a tint of the same
 * strength reads *better* over video than the flat fill it replaces. The tint
 * is therefore kept, not reduced.
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
  eyebrow: 'מ־2009 · 4,000 קמפיינים · 350 מותגים',
  headline: 'ספרו לנו על המותג.',
  subline: null, valueLine: null, cta: null,
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

function shadow() {
  return (document.querySelector('[data-bestie-inline]') as HTMLElement).shadowRoot!;
}
function css() {
  return shadow().querySelector('style')!.textContent || '';
}
function engage() {
  (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });

describe('glass message bubbles', () => {
  it('gives both speakers the glass material', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();

    // Presence first — an unopened conversation has no stylesheet to inspect.
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    const c = css();
    expect(c).toContain('.say{');
    // The material itself, and its WebKit twin — Safari is a large share of
    // this pilot's mobile traffic and ships only the prefixed property.
    expect(c).toContain('backdrop-filter:blur(');
    expect(c).toContain('-webkit-backdrop-filter:blur(');
    expect(c).toContain('saturate(');
  });

  it('keeps the hand-calibrated legibility the material cannot supply', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const c = css();
    // Apple adapts text colour to the luminance behind the glass; we cannot,
    // so the shadow stays and the visitor's tint stays at its calibrated 0.28.
    expect(c).toContain('text-shadow:0 1px 10px rgba(0,0,0,0.55)');
    expect(c).toContain('rgba(245,244,241,0.28)');
  });

  it('carries the inset edge that reads as thickness', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    // The lit top edge and shaded bottom are what make a flat blur read as a
    // slab with depth. Without them it is just a frosted rectangle.
    expect(css()).toContain('inset');
  });

  it('falls back to an opaque bubble where the material is unsupported', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const c = css();
    expect(c).toContain('@supports not (backdrop-filter:blur(2px))');
    // A visitor who asked for less transparency gets a readable bubble, not a
    // prettier one.
    expect(c).toContain('prefers-reduced-transparency');
  });

  it('leaves the floating panel alone', async () => {
    // Seven live customers run the corner bubble; nobody asked for it to change.
    const src = await import('node:fs').then((fs) => fs.readFileSync('public/widget.js', 'utf8'));
    const inlineCss = src.slice(src.indexOf('function inlineConversationCss'));
    const panelChunk = src.slice(0, src.indexOf('function inlineConversationCss'));
    expect(inlineCss).toContain('backdrop-filter:blur(');
    // The panel's own message bubbles are untouched by this change.
    expect(panelChunk).toContain('botBubbleBg');
  });
});
