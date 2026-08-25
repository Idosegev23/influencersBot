import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

/**
 * The hero BECOMES the conversation.
 *
 * A `replace` mount removed the customer's headline, copy and CTAs and took
 * their place. When the visitor engages there, opening the floating widget's
 * own chat panel — its header bar, its opaque panel background, its card
 * chrome — puts a foreign window on top of the hero. The customer rejected
 * exactly that, twice: first as a corner card, then as the same card merely
 * anchored over the hero's box.
 *
 * So an engaged `replace` mount converses in the hero, in the hero's own
 * visual language: the same bare treatment as the resting state, messages over
 * the still-playing video, the input where the pill was. The invitation
 * (headline + chips) gives way, because it has been accepted.
 *
 * `into` is untouched. There Bestie is a guest in someone else's layout, the
 * page is still theirs, and the floating panel is still the right answer.
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
  eyebrow: 'אנחנו פה לכל שאלה', headline: 'היי! אנחנו לידרס!', subline: null,
  valueLine: null, cta: null,
  art: { mode: 'host', image: null, reels: null, from: '#000', to: '#000' },
  starters: { label: null, items: ['אני מותג', 'אני יוצר תוכן'] },
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
function pill() {
  return shadow().getElementById('ibot-inline-pill') as HTMLElement;
}
function engage() {
  pill().click();
}
function composer() {
  return shadow().getElementById('ibot-inline-input') as HTMLInputElement;
}
function msgsText() {
  const el = shadow().getElementById('ibot-inline-msgs');
  return el ? el.textContent || '' : '';
}

/**
 * A streamed chat reply, built from the two things sendMessage() actually
 * touches on the response: `body.getReader()` and NDJSON lines. Returns a
 * promise that resolves once the stream has been fully consumed.
 */
function stubStreamingChat(deltas: string[]) {
  const previous = global.fetch as any;
  let resolveDone: () => void;
  const done = new Promise<void>((r) => { resolveDone = r; });
  (global.fetch as any) = (url: string, init?: any) => {
    if (!String(url).includes('/api/widget/chat')) return previous(url, init);
    let i = 0;
    return Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => {
            if (i >= deltas.length) { resolveDone(); return Promise.resolve({ done: true, value: undefined }); }
            const line = JSON.stringify({ type: 'delta', text: deltas[i++] }) + '\n';
            return Promise.resolve({ done: false, value: new TextEncoder().encode(line) });
          },
        }),
      },
    });
  };
  return done;
}

/**
 * The same stub, but the test decides when each token arrives — so assertions
 * can be made mid-stream, while the reply is still coming in.
 */
function controllableChat() {
  const previous = global.fetch as any;
  let release: ((line: string | null) => void) | null = null;
  const queue: Array<string | null> = [];
  function next(): Promise<string | null> {
    if (queue.length) return Promise.resolve(queue.shift()!);
    return new Promise((r) => { release = r; });
  }
  function feed(line: string | null) {
    if (release) { const r = release; release = null; r(line); }
    else queue.push(line);
  }
  (global.fetch as any) = (url: string, init?: any) => {
    if (!String(url).includes('/api/widget/chat')) return previous(url, init);
    return Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => next().then((text) => (text === null
            ? { done: true, value: undefined }
            : { done: false, value: new TextEncoder().encode(JSON.stringify({ type: 'delta', text }) + '\n') })),
        }),
      },
    });
  };
  return { push: (t: string) => feed(t), end: () => feed(null) };
}

/** One macrotask — drains the microtask queue with it. */
function tick(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Drain until `cond` holds. Streaming paints go through requestAnimationFrame,
 * which jsdom services on a ~16ms timer — a burst of setTimeout(0) ticks
 * returns before a single frame has run.
 */
async function until(cond: () => boolean, what: string) {
  for (let i = 0; i < 40; i++) {
    if (cond()) return;
    await tick(20);
  }
  throw new Error('inline-conversation: ' + what);
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });

describe('a replace mount converses in the hero', () => {
  it('renders the conversation in the shadow root, not the floating panel', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    // Presence baseline: the resting invitation really did render, so the
    // absence assertion below cannot pass because nothing exists at all.
    expect(pill()).not.toBeNull();
    expect(document.getElementById('ibot-panel')).toBeNull();

    engage();

    // Presence: the hero now holds a conversation with a real composer.
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    expect(composer()).not.toBeNull();
    // Absence: none of the floating panel's chrome came with it.
    expect(document.getElementById('ibot-panel')).toBeNull();
  });

  it('keeps the customer video playing behind it', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    expect(document.getElementById('bg')).not.toBeNull();
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
  });

  it('never locks the host page — the conversation is IN the page, not over it', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    document.body.style.overflow = 'auto';
    engage();
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('collapses the invitation away but keeps the page its heading', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    // Presence first: the invitation is on screen and expanded.
    expect(shadow().querySelector('.head')).not.toBeNull();
    expect(shadow().querySelector('.head.away')).toBeNull();
    expect(shadow().querySelectorAll('.chip').length).toBe(2);

    engage();

    // The h1 stays — a `replace` removed the customer's own, so ours is the
    // page's only heading and deleting it would leave the document with none.
    expect(shadow().querySelector('h1.hl')).not.toBeNull();
    // …but it gives way rather than staying in the conversation's space.
    expect(shadow().querySelector('.head.away')).not.toBeNull();
    expect(shadow().querySelectorAll('.chip').length).toBe(0);
  });

  it('sizes the conversation to the reserved height so the host never reflows', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const css = shadow().querySelector('style')!.textContent || '';
    expect(css).toContain('576px');
    // The mobile reserve is a different number; the desktop boot must not use it.
    expect(css).not.toContain('460px');
  });

  it('uses the mobile reserve on a phone, and converses there too', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 390 });
    engage();
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    expect(document.getElementById('ibot-panel')).toBeNull();
    expect(shadow().querySelector('style')!.textContent).toContain('460px');
  });

  it('never declares a font-family, conversing or resting', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    expect(shadow().querySelector('style')!.textContent).not.toContain('font-family');
  });

  it('renders no panel background, header bar or card radius around the messages', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const conv = shadow().getElementById('ibot-inline-conv')!;
    // Presence: the conversation surface exists and holds the composer.
    expect(conv.querySelector('#ibot-inline-input')).not.toBeNull();
    // Absence: the panel's chrome — header row, close button, powered-by —
    // has no counterpart here.
    expect(conv.querySelector('#ibot-close')).toBeNull();
    expect(conv.textContent).not.toContain('Powered by');
  });
});

describe('the hero composer drives the real message loop', () => {
  it('sends what the visitor typed and shows it in the hero', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const input = composer();
    input.value = 'כמה זה עולה?';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const calls = (global.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('/api/widget/chat'));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body).message).toBe('כמה זה עולה?');
    expect(msgsText()).toContain('כמה זה עולה?');
    // The composer is cleared for the next turn, not left holding the sent text.
    expect(composer().value).toBe('');
  });

  it('sends on the arrow button too', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    composer().value = 'היי';
    (shadow().getElementById('ibot-inline-send') as HTMLElement).click();
    const calls = (global.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('/api/widget/chat'));
    expect(calls).toHaveLength(1);
    expect(msgsText()).toContain('היי');
  });

  it('streams the reply into the hero as it arrives', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const streamed = stubStreamingChat(['שלום', ' וברוכים', ' הבאים']);
    composer().value = 'היי';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await streamed;
    await until(() => msgsText().indexOf('שלום וברוכים הבאים') >= 0, 'the stream never reached the hero');
    expect(msgsText()).toContain('שלום וברוכים הבאים');
    // Presence of the reply is not enough on its own — the visitor's own turn
    // must still be above it, i.e. the list is a conversation, not a repaint
    // that dropped everything before the last token.
    expect(msgsText()).toContain('היי');
  });

  it('does not rebuild the floating launcher on every streamed token', async () => {
    // With no panel open, the hero owns the stream. Falling through to a full
    // render() would repaint the closed-state launcher once per animation
    // frame — and the launcher carries `animation:ibot-slide-up`, so it would
    // visibly re-play its entrance ~60 times a second beside a hero that is
    // quietly streaming text.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const chat = controllableChat();
    composer().value = 'היי';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    chat.push('שלום');
    await until(() => msgsText().indexOf('שלום') >= 0, 'first token never painted');
    const launcher = document.getElementById('ibot-trigger');
    expect(launcher).not.toBeNull();

    chat.push(' עולם');
    // Presence: the hero really did repaint for the second token…
    await until(() => msgsText().indexOf('שלום עולם') >= 0, 'second token never painted');
    // …and the launcher beside it is the very same node, untouched.
    expect(document.getElementById('ibot-trigger')).toBe(launcher);
    chat.end();
  });

  it('a chip starts the conversation with that question already in the composer', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    const chip = shadow().querySelector('[data-inline-chip]') as HTMLElement;
    expect(chip).not.toBeNull();
    chip.click();
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    expect(composer().value).toBe('אני מותג');
  });

  it('is one conversation and one session — the corner bubble continues it', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    composer().value = 'שאלה מהגיבור';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const chatCalls = () => (global.fetch as any).mock.calls
      .filter((c: any[]) => String(c[0]).includes('/api/widget/chat'))
      .map((c: any[]) => JSON.parse(c[1].body));
    const heroSession = chatCalls()[0].sessionId;
    // Let that turn settle — sendMessage() refuses a second send while the
    // first is still in flight, which would make the assertion below fail for
    // a reason that has nothing to do with session continuity.
    await until(() => !!shadow().getElementById('ibot-inline-send') &&
      !shadow().getElementById('ibot-inline-send')!.hasAttribute('disabled'), 'first turn never settled');

    // The visitor scrolls past the hero and opens the floating bubble.
    (document.getElementById('ibot-trigger') as HTMLElement).click();
    const panel = document.getElementById('ibot-panel');
    expect(panel).not.toBeNull();
    // Same messages, carried over — not a fresh thread.
    expect(panel!.textContent).toContain('שאלה מהגיבור');

    const panelInput = document.getElementById('ibot-input') as HTMLInputElement;
    panelInput.value = 'המשך בפינה';
    panelInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const all = chatCalls();
    expect(all).toHaveLength(2);
    expect(all[1].message).toBe('המשך בפינה');
    expect(all[1].sessionId).toBe(heroSession);
    // And the hero shows what was said in the corner.
    expect(msgsText()).toContain('המשך בפינה');
  });

  it('reports a diagnostic rather than throwing when a send blows up', async () => {
    const booted = await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const previous = global.fetch as any;
    (global.fetch as any) = (url: string, init?: any) => {
      if (String(url).includes('/api/widget/chat')) throw new Error('network is on fire');
      return previous(url, init);
    };
    composer().value = 'היי';
    expect(() => {
      composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }).not.toThrow();
    expect(booted.reports.map((r) => r.type)).toContain('inline_send_failed');
  });
});

describe('what does not change', () => {
  it('an `into` mount still opens the floating panel', async () => {
    await bootWidget({
      html: HERO,
      config: { ...CFG, inline: { ...REPLACE, mode: 'into', reserve: { desktop: 0, mobile: 0 } } },
      viewportWidth: 1440,
    });
    engage();
    // Presence: the panel opened. Absence: the hero did not take the
    // conversation instead.
    expect(document.getElementById('ibot-panel')).not.toBeNull();
    expect(shadow().getElementById('ibot-inline-conv')).toBeNull();
  });

  it('an account with no inline config is untouched', async () => {
    await bootWidget({ html: HERO, config: { inline: null }, viewportWidth: 1440 });
    expect(document.querySelector('[data-bestie-inline]')).toBeNull();
    (document.getElementById('ibot-trigger') as HTMLElement).click();
    expect(document.getElementById('ibot-panel')).not.toBeNull();
  });
});
