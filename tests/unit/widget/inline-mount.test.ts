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

  // ---- Refusing a target that would take the page with it ------------------

  describe('unsafe mount targets', () => {
    // Nothing upstream rejects these: the picker's selector-stability rule moved
    // to a later plan, so `resolveInlineMount` accepts any string that is valid
    // CSS. `replace` on 'body' runs html.replaceChild(div, body) — the page and
    // our own floating container inside it are deleted, unrecoverably.
    for (const selector of ['body', 'html', 'head']) {
      it('refuses `replace` on <' + selector + '> and keeps the page', async () => {
        const w = await bootWidget({
          html: HERO,
          config: { inline: { ...MOUNT, selector, mode: 'replace' } },
        });
        expect(w.inlineHost).toBeNull();
        expect(document.body.isConnected).toBe(true);
        expect(document.documentElement.isConnected).toBe(true);
        expect(document.querySelector('.content_home-c-hero')).not.toBeNull();
        // The floating bubble is still reachable — the whole point of falling back.
        expect(document.getElementById('ibot-widget-container')).not.toBeNull();
        expect(document.getElementById('ibot-trigger')).not.toBeNull();
        const missing = w.reports.filter((r) => r.type === 'inline_mount_missing');
        expect(missing).toHaveLength(1);
        // Distinguishable from a selector that simply did not match.
        expect(missing[0].message).toContain('unsafe');
      });
    }

    it('refuses `into` on <body> too — never renders into a target holding our own container', async () => {
      const w = await bootWidget({ html: HERO, config: { inline: { ...MOUNT, selector: 'body' } } });
      expect(w.inlineHost).toBeNull();
      expect(document.getElementById('ibot-widget-container')!.style.display).not.toBe('none');
    });
  });

  // ---- Nothing is written into the host page until the render succeeds ------

  describe('a render failure never mutates the host page', () => {
    function breakShadowRoot() {
      const original = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function () { throw new Error('no shadow DOM here'); };
      return () => { Element.prototype.attachShadow = original; };
    }

    it('leaves `into` mode\'s target untouched — no empty div in the customer\'s hero', async () => {
      const restore = breakShadowRoot();
      try {
        const w = await bootWidget({ html: HERO, config: { inline: MOUNT } });
        const target = document.querySelector('.content_home-c-hero') as HTMLElement;
        expect(w.inlineHost).toBeNull();
        expect(document.querySelector('[data-bestie-inline]')).toBeNull();
        expect(target.children.length).toBe(1);              // just the <h1>
        expect(w.reports.map((r) => r.type)).toContain('inline_render_failed');
        // The bubble is the fallback and must not have been stood down.
        expect(document.getElementById('ibot-widget-container')!.style.display).not.toBe('none');
      } finally { restore(); }
    });

    it('does not delete the hero in `replace` mode', async () => {
      // The unrecoverable case: the old order replaced the element FIRST and
      // dropped the reference, so a throw one line later lost it for good.
      const restore = breakShadowRoot();
      try {
        const w = await bootWidget({ html: HERO, config: { inline: { ...MOUNT, mode: 'replace' } } });
        expect(w.inlineHost).toBeNull();
        expect(document.querySelector('.content_home-c-hero')).not.toBeNull();
        expect(document.querySelector('.content_home-c-hero')!.querySelector('h1')).not.toBeNull();
      } finally { restore(); }
    });

    it('does not leave position:relative behind in `overlay` mode', async () => {
      const restore = breakShadowRoot();
      try {
        await bootWidget({ html: HERO, config: { inline: { ...MOUNT, mode: 'overlay' } } });
        const target = document.querySelector('.content_home-c-hero') as HTMLElement;
        expect(target.style.position).toBe('');
      } finally { restore(); }
    });

    it('survives a mount config with no theme at all', async () => {
      // A hand-edited config row: INLINE.theme absent used to throw inside
      // inlineStylesCss(), i.e. inside mountInline, i.e. mid-mutation.
      const { theme, ...noTheme } = MOUNT as any;
      const w = await bootWidget({ html: HERO, config: { inline: noTheme } });
      expect(w.inlineHost).not.toBeNull();
      expect(w.inlineHost!.shadowRoot!.getElementById('ibot-inline-pill')).not.toBeNull();
    });
  });

  // ---- Path scoping: the embed is site-wide, the selector is not ------------

  describe('path scope', () => {
    function countMutationObservers() {
      const original = window.MutationObserver;
      let created = 0;
      (window as any).MutationObserver = class extends original {
        constructor(cb: any) { super(cb); created += 1; }
      };
      return { count: () => created, restore: () => { (window as any).MutationObserver = original; } };
    }

    it('mounts on a page whose path matches a configured prefix', async () => {
      const w = await bootWidget({
        html: HERO, path: '/he',
        config: { inline: { ...MOUNT, paths: ['/he', '/en'] } },
      });
      expect(w.inlineHost).not.toBeNull();
    });

    it('mounts everywhere when paths is null — today\'s behavior for existing configs', async () => {
      const w = await bootWidget({ html: HERO, path: '/anything/at/all', config: { inline: MOUNT } });
      expect(w.inlineHost).not.toBeNull();
    });

    it('mounts nothing, observes nothing and reports nothing on an out-of-scope page', async () => {
      // The cost being removed: on every non-home pageview of a Webflow site
      // this ran a childList+subtree observer over the whole document for 5s
      // and then filed a diagnostic into a 90-day table — for a condition that
      // is not a fault.
      const mo = countMutationObservers();
      let w;
      try {
        w = await bootWidget({
          html: HERO, path: '/about',
          config: { inline: { ...MOUNT, paths: ['/products'] } },
        });
      } finally { mo.restore(); }
      expect(w.inlineHost).toBeNull();
      expect(document.getElementById('ibot-trigger')).not.toBeNull();
      expect(mo.count()).toBe(0);
      expect(OBSERVERS).toHaveLength(0);
      expect(w.reports.map((r) => r.type).filter((t) => t.indexOf('inline') === 0)).toEqual([]);
      // And no late report once the deadline that was never scheduled passes.
      await new Promise((r) => setTimeout(r, 5200));
      expect(w.reports.map((r) => r.type)).not.toContain('inline_mount_missing');
    }, 20000);

    it('matches on prefix, not equality', async () => {
      const w = await bootWidget({
        html: HERO, path: '/he/campaigns/spring',
        config: { inline: { ...MOUNT, paths: ['/he/'] } },
      });
      expect(w.inlineHost).not.toBeNull();
    });
  });

  // ---- The mount can be taken out from under us -----------------------------

  describe('the host framework removes the mount', () => {
    it('gives the bubble back when the node is gone, whatever the observer last said', async () => {
      await bootWidget({ html: HERO, config: { inline: MOUNT } });
      const container = document.getElementById('ibot-widget-container')!;
      expect(container.style.display).toBe('none');
      const host = document.querySelector('[data-bestie-inline]')!;
      host.parentNode!.removeChild(host);
      // A stale "still intersecting" entry must not re-hide the bubble.
      OBSERVERS[OBSERVERS.length - 1].fire(true);
      expect(container.style.display).not.toBe('none');
    });

    it('gives the bubble back under bubble:"never", which has no observer at all', async () => {
      // The worst case in the file: display stuck at 'none' with no inline
      // surface left means the visitor cannot reach the chat by any route.
      await bootWidget({ html: HERO, config: { inline: { ...MOUNT, bubble: 'never' } } });
      const container = document.getElementById('ibot-widget-container')!;
      expect(container.style.display).toBe('none');
      const host = document.querySelector('[data-bestie-inline]')!;
      host.parentNode!.removeChild(host);
      await new Promise((r) => setTimeout(r, 0));
      expect(container.style.display).not.toBe('none');
    });
  });

  // ---- The bubble is hidden; its speech bubbles are not --------------------

  describe('the launcher tooltip follows the launcher', () => {
    // #ibot-tip and #ibot-teaser are appended to document.body, OUTSIDE
    // `container`, so container.style.display='none' never reached them. On the
    // pilot config that meant a tooltip appearing in the bottom corner 2.5s
    // after load, pointing at a launcher that is not on the page.
    it('does not show 2.5s after load while the inline mount has stood the bubble down', async () => {
      await bootWidget({ html: HERO, config: { inline: MOUNT, tooltip: { text: 'Ask me anything' } } });
      expect(document.getElementById('ibot-widget-container')!.style.display).toBe('none');
      await new Promise((r) => setTimeout(r, 2700));
      expect(document.getElementById('ibot-tip')).toBeNull();
    }, 10000);

    it('still shows when the bubble is visible — bubble:"always"', async () => {
      // Non-vacuity: without this the test above would pass on a widget that
      // never shows a tooltip at all.
      await bootWidget({
        html: HERO,
        config: { inline: { ...MOUNT, bubble: 'always' }, tooltip: { text: 'Ask me anything' } },
      });
      await new Promise((r) => setTimeout(r, 2700));
      expect(document.getElementById('ibot-tip')).not.toBeNull();
    }, 10000);

    it('is cleared when the visitor opens from the inline pill', async () => {
      // bubble:'always' leaves both on screen at once, so an inline-opened
      // panel could sit under a teaser/tooltip still offering to open a chat.
      const w = await bootWidget({
        html: HERO,
        config: { inline: { ...MOUNT, bubble: 'always' }, tooltip: { text: 'Ask me anything' } },
      });
      await new Promise((r) => setTimeout(r, 2700));
      expect(document.getElementById('ibot-tip')).not.toBeNull();
      const pill = w.inlineHost!.shadowRoot!.getElementById('ibot-inline-pill') as HTMLElement;
      pill.click();
      expect(document.getElementById('ibot-tip')).toBeNull();
      expect(document.getElementById('ibot-teaser')).toBeNull();
    }, 10000);
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
