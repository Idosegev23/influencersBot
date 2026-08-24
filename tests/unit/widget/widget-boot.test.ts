import { describe, it, expect } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

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
});
