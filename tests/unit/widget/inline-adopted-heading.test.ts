import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

/**
 * Replace mode keeps the page's own `<h1>`.
 *
 * Taking a hero over used to delete the customer's `<h1>` and render ours in
 * its place — inside a shadow root. Google does flatten shadow DOM for
 * indexing, but "probably indexed" is not a thing to say about a paying
 * customer's homepage, and inventing a replacement headline meant writing copy
 * to stand where their brand statement stood.
 *
 * So the heading is adopted rather than replaced: their actual `<h1>` node
 * moves into our host as a **light-DOM** child and is displayed through a
 * `<slot>`. It never leaves the light DOM, its text is untouched, and its
 * styling survives — verified against their stylesheet, where every rule that
 * paints it is a class selector (`.heading-5`, `.heading-5.cen`) with no
 * descendant rule anchored on the element we replace.
 *
 * Everything else in the hero — the paragraph, the CTAs — still gives way.
 */
const HERO = `
  <style>
    .video_home-c { position: relative; display: flex; }
    .content_home-c-hero.auto { position: relative; z-index: 5; height: 576px; }
    .heading-5 { font-size: 52px; }
  </style>
  <div class="video_home-c">
    <video id="bg" autoplay loop muted playsinline></video>
    <div class="content_home-c-hero auto">
      <div class="home-c_top-tile home">
        <h1 id="theirs" class="heading-5 cen">We Turn Brands Into Leaders</h1>
      </div>
      <div class="headline_home-c"><p id="their-copy">אנחנו LEADERS…</p></div>
      <a id="their-cta" class="cta" href="#">בואו נדבר</a>
    </div>
  </div>`;

const BANNER = {
  eyebrow: 'מ־2009 · 4,000 קמפיינים · 350 מותגים',
  headline: 'כותרת משלנו שלא אמורה להופיע',
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

function host() {
  return document.querySelector('[data-bestie-inline]') as HTMLElement;
}
function shadow() {
  return host().shadowRoot!;
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });

describe('replace mode adopts the page heading', () => {
  it('keeps their h1 node alive in the light DOM', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });

    const h1 = document.getElementById('theirs');
    expect(h1).not.toBeNull();
    // The same element object, not a copy of its text.
    expect(h1!.tagName).toBe('H1');
    expect(h1!.textContent).toBe('We Turn Brands Into Leaders');
    // Light DOM: reachable from the document, not only through a shadow root.
    expect(document.querySelector('h1#theirs')).toBe(h1);
  });

  it('moves it inside our host so it renders in our layout', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });

    const h1 = document.getElementById('theirs')!;
    expect(host().contains(h1)).toBe(true);
    expect(h1.getAttribute('slot')).toBe('ibot-heading');
  });

  it('displays it through a slot instead of writing a headline of its own', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });

    const s = shadow().querySelector('slot[name="ibot-heading"]');
    expect(s).not.toBeNull();
    // Our own banner headline must not appear anywhere — theirs is the heading.
    expect(shadow().textContent || '').not.toContain('כותרת משלנו');
    // And the shadow root writes no h1 of its own.
    expect(shadow().querySelectorAll('h1')).toHaveLength(0);
  });

  it('still clears the paragraph and the CTAs', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });

    expect(document.getElementById('their-copy')).toBeNull();
    expect(document.getElementById('their-cta')).toBeNull();
    // Presence pair: the mount really happened, so the absences above mean
    // something.
    expect(shadow().getElementById('ibot-inline-pill')).not.toBeNull();
  });

  it('keeps the eyebrow, which is ours to write', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    expect(shadow().textContent || '').toContain('מ־2009');
  });

  it('writes its own heading when the page has none to adopt', async () => {
    const noHeading = HERO.replace(/<h1[^>]*>.*?<\/h1>/, '<span>no heading here</span>');
    await bootWidget({ html: noHeading, config: CFG, viewportWidth: 1440 });

    expect(shadow().querySelector('slot[name="ibot-heading"]')).toBeNull();
    expect(shadow().textContent || '').toContain('כותרת משלנו');
  });

  it('leaves an `into` mount alone — the page still owns its own hero', async () => {
    await bootWidget({
      html: HERO,
      config: { ...CFG, inline: { ...REPLACE, mode: 'into', reserve: { desktop: 0, mobile: 0 } } },
      viewportWidth: 1440,
    });

    const h1 = document.getElementById('theirs')!;
    expect(h1).not.toBeNull();
    expect(host().contains(h1)).toBe(false);
    expect(shadow().querySelector('slot[name="ibot-heading"]')).toBeNull();
  });
});
