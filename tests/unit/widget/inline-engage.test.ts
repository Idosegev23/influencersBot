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
    const before = document.body.style.overflow;
    (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
    expect(document.body.style.overflow).toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.style.overflow).toBe(before);
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
