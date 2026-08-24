import { describe, it, expect } from 'vitest';
import { bootWidget, OBSERVERS } from './helpers/boot-widget';

const HERO = '<section><div class="content_home-c-hero"><h1>We Turn Brands Into Leaders</h1></div></section>';
const MOUNT = { enabled: true, selector: '.content_home-c-hero', mode: 'into', preset: 'hero', surface: 'bare',
  reserve: { desktop: 0, mobile: 0 }, theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll', banner: null };

describe('inline mount resolution', () => {
  it('appends into the target as its last child', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const target = document.querySelector('.content_home-c-hero')!;
    expect(w.inlineHost).not.toBeNull();
    expect(w.inlineHost!.parentElement).toBe(target);
    expect(target.lastElementChild).toBe(w.inlineHost);
    // Non-vacuity guard for the miss test below: the happy path must be silent.
    expect(w.reports.map((r) => r.type).filter((t) => t.indexOf('inline') === 0)).toEqual([]);
  });

  it('does not touch the host element styles in `into` mode', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const target = document.querySelector('.content_home-c-hero') as HTMLElement;
    expect(target.getAttribute('style')).toBeNull();
  });

  it('falls back to the floating bubble and reports when the selector misses', async () => {
    const w = await bootWidget({
      html: '<section><div class="renamed-by-webflow"></div></section>',
      config: { inline: MOUNT },
    });
    expect(w.inlineHost).toBeNull();
    expect(document.getElementById('ibot-trigger')).not.toBeNull();
    // The report is deliberately held until the 5s late-mount deadline, so a
    // hero that hydrates late is never reported as missing. It is waited out in
    // real time rather than with fake timers: the timer is scheduled inside
    // widget.js *during* the boot, so any fake-timer install would have to
    // precede bootWidget — and the harness's own setTimeout wrapper is captured
    // on the first boot of the file, which would then capture the fake one and
    // corrupt every later test.
    expect(w.reports.map((r) => r.type)).not.toContain('inline_mount_missing');
    await new Promise((r) => setTimeout(r, 5200));
    expect(w.reports.map((r) => r.type)).toContain('inline_mount_missing');
  }, 20000);

  it('hides the floating bubble while the inline mount is on screen', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const container = document.getElementById('ibot-widget-container')!;
    expect(container.style.display).toBe('none');
  });

  it('brings the bubble back once the mount is fully out of view', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    OBSERVERS[OBSERVERS.length - 1].fire(false);
    expect(document.getElementById('ibot-widget-container')!.style.display).not.toBe('none');
  });

  it('keeps the bubble visible from the start when bubble is "always"', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, bubble: 'always' } } });
    expect(document.getElementById('ibot-widget-container')!.style.display).not.toBe('none');
  });

  it('sets position:relative only in overlay mode', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, mode: 'overlay' } } });
    const target = document.querySelector('.content_home-c-hero') as HTMLElement;
    expect(target.style.position).toBe('relative');
  });

  // ---- Beyond the brief -----------------------------------------------------

  it('leaves the page alone when inline is null (today\'s behavior)', async () => {
    const w = await bootWidget({ html: HERO });
    expect(w.inlineHost).toBeNull();
    expect(document.getElementById('ibot-widget-container')!.style.display).not.toBe('none');
    expect((document.querySelector('.content_home-c-hero') as HTMLElement).children.length).toBe(1);
  });

  it('marks the host with the preset and attaches an open shadow root', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
    expect(w.inlineHost!.getAttribute('data-bestie-inline')).toBe('hero');
    expect(w.inlineHost!.shadowRoot).not.toBeNull();
  });

  it('swaps the target out in `replace` mode', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: { ...MOUNT, mode: 'replace' } } });
    expect(document.querySelector('.content_home-c-hero')).toBeNull();
    expect(w.inlineHost!.parentElement!.tagName).toBe('SECTION');
  });

  it('does not set position on the target in `into` mode even when it is static', async () => {
    await bootWidget({ html: HERO, config: { inline: MOUNT } });
    const target = document.querySelector('.content_home-c-hero') as HTMLElement;
    expect(target.style.position).toBe('');
  });

  it('reports and falls back when the selector is not valid CSS', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: { ...MOUNT, selector: '<<<' } } });
    expect(w.inlineHost).toBeNull();
    expect(document.getElementById('ibot-trigger')).not.toBeNull();
    expect(w.reports.map((r) => r.type)).toContain('inline_selector_invalid');
  });

  it('hides the bubble outright when bubble is "never"', async () => {
    await bootWidget({ html: HERO, config: { inline: { ...MOUNT, bubble: 'never' } } });
    OBSERVERS[OBSERVERS.length - 1]?.fire(false);
    expect(document.getElementById('ibot-widget-container')!.style.display).toBe('none');
  });

  it('mounts late when the hero is painted after the widget boots', async () => {
    const w = await bootWidget({ html: '<section id="late"></section>', config: { inline: MOUNT } });
    expect(w.inlineHost).toBeNull();

    const hero = document.createElement('div');
    hero.className = 'content_home-c-hero';
    document.getElementById('late')!.appendChild(hero);
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('[data-bestie-inline]')).not.toBeNull();
    expect(document.querySelector('[data-bestie-inline]')!.parentElement).toBe(hero);
    // A mount that succeeded must never have been reported as missing — and the
    // deadline must stay stood down now that we have settled.
    expect(w.reports.map((r) => r.type)).not.toContain('inline_mount_missing');
    await new Promise((r) => setTimeout(r, 5200));
    expect(w.reports.map((r) => r.type)).not.toContain('inline_mount_missing');
  }, 20000);

  it('reserves height from the desktop budget above 640px', async () => {
    const w = await bootWidget({
      html: HERO,
      viewportWidth: 1440,
      config: { inline: { ...MOUNT, reserve: { desktop: 220, mobile: 300 } } },
    });
    expect(w.inlineHost!.style.minHeight).toBe('220px');
  });

  it('reserves height from the mobile budget below 640px', async () => {
    const w = await bootWidget({
      html: HERO,
      viewportWidth: 390,
      config: { inline: { ...MOUNT, reserve: { desktop: 220, mobile: 300 } } },
    });
    expect(w.inlineHost!.style.minHeight).toBe('300px');
  });

  it('does not mount at all when the account kill switch is off', async () => {
    const w = await bootWidget({ html: HERO, config: { enabled: false, inline: MOUNT } });
    const target = document.querySelector('.content_home-c-hero') as HTMLElement;
    expect(w.inlineHost).toBeNull();
    expect(target).not.toBeNull();
    expect(target.children.length).toBe(1);          // just the <h1>
    expect(target.getAttribute('style')).toBeNull();
  });

  it('does not delete the hero in `replace` mode when the account is off', async () => {
    const w = await bootWidget({
      html: HERO,
      config: { enabled: false, inline: { ...MOUNT, mode: 'replace' } },
    });
    expect(document.querySelector('.content_home-c-hero')).not.toBeNull();
    expect(w.inlineHost).toBeNull();
  });

  it('never mounts twice when a superseded copy of the widget is still watching', async () => {
    // Boot A misses and leaves its MutationObserver watching the document.
    await bootWidget({ html: '<section id="late"></section>', config: { inline: MOUNT } });
    // Boot B claims the surface and mounts synchronously. Writing B's page also
    // wakes A's observer, which now resolves the same hero.
    const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelectorAll('[data-bestie-inline]').length).toBe(1);
    expect(document.querySelector('[data-bestie-inline]')).toBe(w.inlineHost);
  });
});
