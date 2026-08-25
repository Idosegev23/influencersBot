import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

/**
 * `replace` mode on a background-video hero.
 *
 * The pilot's hero is a Webflow `w-background-video`: an absolutely-positioned
 * `<video>`, a scrim, and a content layer holding the headline, copy and CTAs.
 * Replacing the content layer is how Bestie takes the hero over while the video
 * keeps playing behind — the video is a sibling of what we replace, not a child.
 *
 * Two things that only matter in this mode:
 *
 * 1. **Stacking.** The element we replace carried `position:relative; z-index:5`,
 *    which is what kept the copy above the absolutely-positioned video. Our host
 *    is static by default, and a positioned element paints above a static one —
 *    so without inheriting that context the video covers Bestie completely.
 *
 * 2. **The headline.** In `into` mode the host page still has its own headline
 *    and ours would be a second one. In `replace` we just removed theirs, so the
 *    resolved banner headline is what fills the space we took.
 */
const HERO = `
  <div class="video_home-c" style="position:relative;display:flex;">
    <video id="bg" autoplay loop muted playsinline></video>
    <div class="overlay_medium"></div>
    <div class="content_home-c-hero auto" style="position:relative;z-index:5;height:576px;">
      <h1 id="their-headline">We Turn Brands Into Leaders</h1>
      <a class="cta" href="#">בואו נדבר</a>
    </div>
  </div>`;

const BANNER = {
  eyebrow: 'אנחנו פה לכל שאלה',
  headline: 'היי! אנחנו לידרס!',
  subline: null,
  valueLine: null,
  cta: null,
  art: { mode: 'host', image: null, reels: null, from: '#000', to: '#000' },
  starters: { label: null, items: ['אני מותג', 'אני יוצר תוכן'] },
};

const MOUNT = {
  enabled: true,
  selector: '.content_home-c-hero',
  mode: 'replace',
  preset: 'hero',
  surface: 'bare',
  reserve: { desktop: 576, mobile: 420 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll',
  paths: null,
  banner: BANNER,
};

function root() {
  return (document.querySelector('[data-bestie-inline]') as HTMLElement).shadowRoot!;
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });

describe('replace mode on a background-video hero', () => {
  it('removes the hero content but leaves the video playing behind', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(w.inlineHost).not.toBeNull();
    expect(document.getElementById('their-headline')).toBeNull();
    expect(document.querySelector('.cta')).toBeNull();
    // The video is a sibling of what we replaced, so it must survive untouched.
    const video = document.getElementById('bg');
    expect(video).not.toBeNull();
    expect(video!.parentElement).toBe(w.inlineHost!.parentElement);
  });

  it('inherits the replaced element positioning so the video cannot cover us', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
    // Without this the host is static, the absolutely-positioned video paints
    // over it, and Bestie is invisible on a hero that looks unchanged.
    expect(w.inlineHost!.style.position).toBe('relative');
    expect(w.inlineHost!.style.zIndex).toBe('5');
  });

  it('reserves the height the replaced element held, so the hero does not collapse', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT }, viewportWidth: 1440 });
    expect(w.inlineHost!.style.minHeight).toBe('576px');
  });

  it('renders the banner headline, because we just removed the page its own', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const text = root().textContent || '';
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
    expect(text).toContain('היי! אנחנו לידרס!');
    expect(text).toContain('אנחנו פה לכל שאלה');
  });

  it('does NOT render a headline in into mode — the host page still has one', async () => {
    await bootWidget({
      html: HERO,
      config: { inline: { ...MOUNT, mode: 'into', reserve: { desktop: 0, mobile: 0 } } },
    });
    // Presence first: an empty shadow root would satisfy the absence on its own.
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
    // What must not happen is a second headline ELEMENT. The banner headline
    // still serves as the input's placeholder here, which is the long-standing
    // behaviour and is not what this guards.
    expect(root().querySelector('.head')).toBeNull();
    expect(root().querySelectorAll('h1,h2,h3')).toHaveLength(0);
    expect(document.getElementById('their-headline')).not.toBeNull();
  });

  it('does not repeat the headline as the input placeholder', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const ph = root().querySelector('.ph')!.textContent || '';
    expect(ph).not.toBe('היי! אנחנו לידרס!');
    expect(ph.length).toBeGreaterThan(0);
  });

  it('still refuses an unsafe replace target', async () => {
    const w = await bootWidget({
      html: '<div class="content_home-c-hero">x</div>',
      config: { inline: { ...MOUNT, selector: 'body' } },
    });
    expect(w.inlineHost).toBeNull();
    expect(document.body.isConnected).toBe(true);
  });
});
