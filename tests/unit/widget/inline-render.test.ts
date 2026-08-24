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

  it('renders no headline of its own in any case — the banner headline becomes the pill placeholder', async () => {
    // Renamed from "omits the headline when the host page already has one",
    // which stated a conditionality that has no implementation behind it: the
    // `hero` preset never renders a headline element at all, and
    // inlinePillHtml() repurposes the resolved banner headline as the pill's
    // placeholder text. Whether the preset SHOULD grow a conditional headline
    // (spec: "the resolved banner headline (or none, when the host page already
    // has one)") is an open spec question, not a fix — see the final fix report.
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    // Anchor on something actually rendering — an empty shadow root would also
    // satisfy "no h2", which is exactly the no-op-stub state this must rule out.
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
    expect(root().querySelectorAll('h1,h2,h3')).toHaveLength(0);
    // The headline is not dropped, it is relocated: this is what the renderer
    // actually does today.
    expect(root().querySelector('.ph')!.textContent).toBe(BANNER.headline);
  });

  it('draws no background of its own — art is host', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    // Anchor on something actually rendering — same reasoning as above.
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
    expect(root().querySelector('video')).toBeNull();
    expect(root().innerHTML).not.toContain('background-image');
  });

  it('bar preset renders no chips', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, preset: 'bar' } } });
    // Anchor on something actually rendering — same reasoning as above.
    expect(root().getElementById('ibot-inline-pill')).not.toBeNull();
    expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(0);
  });

  describe('glass surface — opaque fallback', () => {
    it('falls back to a fully opaque panel, and resets both backdrop-filter prefixes, when transparency is unsupported or reduced', async () => {
      await bootWidget({ html: HERO, config: { inline: { ...MOUNT, surface: 'glass' } } });
      const css = root().querySelector('style')!.textContent!;
      // Dark theme (MOUNT.theme.ground === 'dark') opaque fallback colour.
      expect(css).toContain('#0c0c0e');
      // Must not contain a translucent rgba(...) fallback — that was the bug:
      // 6-10% of the host's video still bled through.
      expect(css).not.toMatch(/rgba\(12,\s*12,\s*14,\s*0\.9/);
      // Safari/WebKit only honours the prefixed property; the reduced-
      // transparency override must reset both, not just the unprefixed one.
      const reducedBlock = css.slice(css.indexOf('prefers-reduced-transparency'));
      expect(reducedBlock).toContain('backdrop-filter:none');
      expect(reducedBlock).toContain('-webkit-backdrop-filter:none');
    });
  });

  describe('resize re-render', () => {
    it('does not rebuild the shadow root when a resize does not cross a chip-budget breakpoint', async () => {
      await bootWidget({ html: HERO, config: { inline: MOUNT }, viewportWidth: 1440 });
      const pillBefore = root().getElementById('ibot-inline-pill');
      // 1440 -> 1024 stays within the >=640 desktop bucket (budget still 3):
      // a rebuild here would needlessly detach anything bound to the pill.
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      window.dispatchEvent(new Event('resize'));
      await new Promise((r) => setTimeout(r, 250));
      const pillAfter = root().getElementById('ibot-inline-pill');
      expect(pillAfter).toBe(pillBefore);
      expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(3);
    });

    it('does rebuild once a resize crosses a chip-budget breakpoint', async () => {
      await bootWidget({ html: HERO, config: { inline: MOUNT }, viewportWidth: 1440 });
      expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(3);
      // 1440 -> 390 crosses into the phone bucket (budget 2).
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
      window.dispatchEvent(new Event('resize'));
      await new Promise((r) => setTimeout(r, 250));
      expect(root().querySelectorAll('[data-inline-chip]')).toHaveLength(2);
    });
  });
});
