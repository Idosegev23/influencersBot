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

function root() {
  return (document.querySelector('[data-bestie-inline]') as HTMLElement).shadowRoot!;
}

describe('the inline resting state', () => {
  it('renders into a shadow root, not the customer DOM', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(w.inlineHost!.shadowRoot).not.toBeNull();
    expect(w.inlineHost!.innerHTML).toBe('');
  });

  it('renders the input pill', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
  });

  it('never sets a font-family — the host page owns the type', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    // Assert on our stylesheet specifically. avatarHtml() is shared with the
    // floating widget and may carry its own inline styles; what must not
    // happen is our shadow CSS declaring a family and blocking inheritance.
    const css = root().querySelector('style')!.textContent!;
    expect(css).not.toContain('font-family');
  });

  it('shows three starter chips on desktop', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT }, viewportWidth: 1440 });
    expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(3);
  });

  it('drops to two chips on a phone so the pill stays above the fold', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT }, viewportWidth: 390 });
    expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(2);
  });

  it('renders the pill even with no banner copy at all', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, banner: null } } });
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
  });

  it('omits the headline when the host page already has one', async () => {
    // preset `hero` on LDRS sits under their own H1; ours would be a second one.
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(root().querySelectorAll('h2')).toHaveLength(0);
  });

  it('draws no background of its own — art is host', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(root().querySelector('video')).toBeNull();
    expect(root().innerHTML).not.toContain('background-image');
  });

  it('bar preset renders no chips', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, preset: 'bar' } } });
    expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(0);
  });
});
