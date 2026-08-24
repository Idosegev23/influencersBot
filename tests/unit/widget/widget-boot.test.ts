import { describe, it, expect } from 'vitest';
import { bootWidget, OBSERVERS } from './helpers/boot-widget';

describe('booting public/widget.js in jsdom', () => {
  it('mounts the floating container on body when there is no inline config', async () => {
    const w = await bootWidget({ config: { inline: null } });
    expect(w.container).not.toBeNull();
    expect(w.container!.parentElement).toBe(document.body);
    expect(w.container!.style.position).toBe('fixed');
  });

  it('renders the launcher', async () => {
    await bootWidget({ config: { inline: null } });
    expect(document.getElementById('ibot-trigger')).not.toBeNull();
  });

  it('reports nothing on a clean boot', async () => {
    const w = await bootWidget({ config: { inline: null } });
    expect(w.reports).toEqual([]);
  });

  // The three above would all pass against a widget that never received its
  // config: widget.js calls render() synchronously at the end of its IIFE, long
  // before the config fetch resolves. These lock in that bootWidget() waits for
  // the fetched config to be applied, which is the whole premise of Tasks 5-8.
  it('waits for the fetched config to be applied, not just the first paint', async () => {
    const left = await bootWidget({ config: { inline: null, theme: { position: 'bottom-left' } } });
    expect(left.container!.style.left).toBe('20px');
    expect(left.container!.style.right).toBe('');

    const right = await bootWidget({ config: { inline: null } });
    expect(right.container!.style.right).toBe('20px');
    expect(right.container!.style.left).toBe('');
  });

  it('leaves the host page markup untouched', async () => {
    const w = await bootWidget({
      html: '<section class="hero"><h1>Buy stuff</h1></section>',
      config: { inline: null },
    });
    const hero = document.querySelector('.hero')!;
    expect(hero.innerHTML).toBe('<h1>Buy stuff</h1>');
    expect(hero.contains(w.container!)).toBe(false);
  });

  // Each boot evaluates widget.js afresh into the same jsdom window. Without
  // listener isolation, every previous boot's copy stays live and answers the
  // current boot's events — a single error was reported once per boot so far.
  it('isolates boots: a previous boot does not report into a later one', async () => {
    await bootWidget({ config: { inline: null } });
    await bootWidget({ config: { inline: null } });
    const w = await bootWidget({ config: { inline: null } });

    const ev: any = new Event('error');
    ev.filename = 'https://influencers-bot.vercel.app/widget.js';
    ev.message = 'synthetic explosion';
    ev.error = new Error('synthetic explosion');
    window.dispatchEvent(ev);

    expect(w.reports).toEqual([{ type: 'client_error', message: 'synthetic explosion' }]);
  });

  it('does not capture the host page\'s own errors', async () => {
    const w = await bootWidget({ config: { inline: null } });
    const ev: any = new Event('error');
    ev.filename = 'https://customer.example.com/their-bundle.js';
    ev.message = 'their bug, not ours';
    window.dispatchEvent(ev);
    expect(w.reports).toEqual([]);
  });

  it('exposes no inline host while inline is null', async () => {
    const w = await bootWidget({ config: { inline: null } });
    expect(w.inlineHost).toBeNull();
  });

  // Each boot schedules setTimeout(showBubbleTooltip, 2500) and a
  // setInterval(2000) cart watcher. Uncancelled, the tooltip appends #ibot-tip
  // into whatever page is current when it fires — a stale boot mutating the DOM
  // under test, arriving only once a file's runtime crosses 2.5s.
  // showBubbleTooltip early-returns if #ibot-tip already exists, so a stale
  // boot cannot be detected by counting nodes — but it can by whose copy wins.
  // Boot A's timer was scheduled first, so if it is still alive it fires first
  // and its text is what lands. Seeing boot B's text proves A's timer was
  // cancelled. (The 2000ms cart-watcher interval is cancelled by the same
  // mechanism; it has no observable effect without cart data in localStorage.)
  it('cancels a previous boot\'s timers instead of letting them mutate a later page', async () => {
    await bootWidget({ config: { inline: null, tooltip: { text: 'STALE-BOOT-A' } } });
    await bootWidget({
      html: '<section class="hero"><h1>Buy stuff</h1></section>',
      config: { inline: null, tooltip: { text: 'FRESH-BOOT-B' } },
    });

    // Past both the 2500ms tooltip and the 2000ms cart interval.
    await new Promise((r) => setTimeout(r, 2700));

    const tip = document.getElementById('ibot-tip');
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('FRESH-BOOT-B');
    expect(tip!.textContent).not.toContain('STALE-BOOT-A');
  }, 15000);

  // render()'s mobile scroll lock writes inline styles onto body/documentElement
  // and can never restore them under the harness (its restore is gated on a
  // latch each boot resets), so the harness must clear them itself.
  it('clears inline styles left on body and documentElement', async () => {
    document.body.style.position = 'fixed';
    document.body.style.top = '-400px';
    document.documentElement.style.overflow = 'hidden';

    await bootWidget({ config: { inline: null } });

    expect(document.body.getAttribute('style')).toBeNull();
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });

  // OBSERVERS + fire() are a published contract: Tasks 5-8 call
  // `OBSERVERS[OBSERVERS.length - 1].fire(false)` verbatim to simulate
  // scrolling. widget.js uses no IntersectionObserver today, so nothing else
  // here would exercise the stub.
  it('publishes an IntersectionObserver stub that OBSERVERS.fire() drives', async () => {
    await bootWidget({ config: { inline: null } });
    expect(OBSERVERS).toEqual([]);

    const calls: any[] = [];
    const observer = new (window as any).IntersectionObserver((entries: any, self: any) => {
      calls.push({ entries, self });
    });
    const el = document.createElement('div');
    observer.observe(el);

    expect(OBSERVERS.length).toBe(1);
    expect(OBSERVERS[OBSERVERS.length - 1]).toBe(observer);

    OBSERVERS[OBSERVERS.length - 1].fire(false);

    expect(calls).toHaveLength(1);
    expect(calls[0].entries).toMatchObject([{ isIntersecting: false, target: el }]);
    expect(calls[0].self).toBe(observer);

    OBSERVERS[OBSERVERS.length - 1].fire(true);
    expect(calls[1].entries).toMatchObject([{ isIntersecting: true, target: el }]);
  });
});
