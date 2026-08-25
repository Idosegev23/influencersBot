import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
const OPEN_STREAMS: Array<() => void> = [];
// ABANDON, do not end. Ending a leftover stream resolves its reader, which runs
// the previous boot's `done` handler -> scheduleRender -> renderClosed on a
// container that document.body.innerHTML has since detached, and the null
// #ibot-trigger throws inside whichever test is running by then. Leaving the
// read forever-pending is inert.
afterEach(() => { while (OPEN_STREAMS.length) OPEN_STREAMS.pop()!(); });

function controllableChat() {
  const previous = global.fetch as any;
  const sent: any[] = [];
  let release: ((line: string | null) => void) | null = null;
  const queue: Array<string | null> = [];
  let abandoned = false;
  function next(): Promise<string | null> {
    if (abandoned) return new Promise(() => { /* never settles — see afterEach */ });
    if (queue.length) return Promise.resolve(queue.shift()!);
    return new Promise((r) => { release = r; });
  }
  function feed(line: string | null) {
    if (release) { const r = release; release = null; r(line); }
    else queue.push(line);
  }
  (global.fetch as any) = (url: string, init?: any) => {
    if (!String(url).includes('/api/widget/chat')) return previous(url, init);
    sent.push(JSON.parse(init.body));
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
  OPEN_STREAMS.push(() => { abandoned = true; release = null; });
  return { push: (t: string) => feed(t), end: () => feed(null), sent };
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

  it('took over the hero content layer and left the video beside it', async () => {
    // `#bg` surviving is on its own a tautology — it is a SIBLING of the
    // replaced element, so nothing in this commit could remove it. What is
    // worth asserting is that the replace happened around it: their headline is
    // gone, our host stands where it stood, and the video is still its sibling.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const host = document.querySelector('[data-bestie-inline]') as HTMLElement;
    const video = document.getElementById('bg')!;
    expect(document.getElementById('theirs')).toBeNull();   // their <h1> is gone
    expect(host).not.toBeNull();
    expect(host.parentElement).toBe(video.parentElement);   // we stand where it stood
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

  it('renders no panel background, no card radius and no shadow around the conversation', async () => {
    // The first version of this test asserted `#ibot-close` was absent from the
    // shadow root and that the text did not contain 'Powered by'. Neither could
    // ever fail: #ibot-close is only ever emitted into `container` in the
    // document, and the footer renders the Hebrew half of
    // wlbl('מבוסס על','Powered by') under this boot's language:'he'. Both were
    // dead. These assert the three things the title actually names, against the
    // stylesheet rules that would carry them.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const conv = shadow().getElementById('ibot-inline-conv')!;
    expect(conv.querySelector('#ibot-inline-input')).not.toBeNull();

    const rule = (selector: string) => {
      const css = shadow().querySelector('style')!.textContent || '';
      const at = css.indexOf(selector + '{');
      expect(at, 'no rule for ' + selector).toBeGreaterThan(-1);
      return css.slice(at + selector.length + 1, css.indexOf('}', at));
    };

    // The conversation container and the message list are bare: the customer's
    // video shows through both.
    for (const sel of ['.conv', '.msgs', '.say']) {
      const body = rule(sel);
      expect(body, sel + ' must not paint a panel').not.toContain('background');
      expect(body, sel + ' must not be a card').not.toContain('border-radius');
      expect(body, sel + ' must not be a card').not.toContain('box-shadow');
    }
    // Paired presence — the same reader DOES find a fill and a radius on the
    // one rule that is supposed to have them, so the absences above are
    // discriminating rather than a broken selector lookup.
    const me = rule('.row.me .say');
    expect(me).toContain('background');
    expect(me).toContain('border-radius');
  });

  it('keeps the visitor\'s own words legible over a bright video frame', async () => {
    // 11% white over a white-ish frame is effectively zero contrast, and the
    // first version of this rule also removed the text-shadow that every other
    // line keeps. This is the visitor reading back what they just typed.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const css = shadow().querySelector('style')!.textContent || '';
    const me = css.slice(css.indexOf('.row.me .say{'), css.indexOf('}', css.indexOf('.row.me .say{')));
    expect(me).toContain('rgba(245,244,241,0.28)');
    expect(me).not.toContain('text-shadow:none');
    // Presence pairing: the shadow really is declared for this ground, so
    // "not text-shadow:none" is not passing against a stylesheet with no
    // shadows in it at all.
    expect(css).toContain('text-shadow:0 1px 10px rgba(0,0,0,0.55)');
  });

  it('never contains the page scroll — the hero is in the customer\'s own flow', async () => {
    // The panel may contain its scroll; it is a dismissible overlay. This list
    // is 395px of a 460px mobile hero, in the page's own scroll flow, and
    // `contain` would refuse to chain a swipe that started inside it — leaving
    // a phone visitor with only a narrow strip beside it to get past the hero.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 390 });
    engage();
    const css = shadow().querySelector('style')!.textContent || '';
    expect(css).toContain('.msgs{');
    expect(css).not.toContain('overscroll-behavior');
  });

  it('clips the collapsing invitation so the host page never shifts', async () => {
    // .head.away animates max-height 260px -> 0. .conv is a hard 576px and the
    // host is height:auto, so for those 300ms the host would be ~836px tall and
    // the customer's whole page below the hero would slide down and back.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const css = shadow().querySelector('style')!.textContent || '';
    const at = css.indexOf('.wrap.talking{');
    expect(at, 'no .wrap.talking rule').toBeGreaterThan(-1);
    const body = css.slice(at + '.wrap.talking{'.length, css.indexOf('}', at));
    expect(body).toContain('max-height:576px');
    expect(body).toContain('overflow:hidden');
    // And the class is actually on the element, not just in the stylesheet.
    expect(shadow().querySelector('.wrap.talking')).not.toBeNull();
  });

  it('puts the live region on the streaming row, never on the whole thread', async () => {
    // aria-live on the list container, whose innerHTML was replaced every
    // animation frame, makes a screen reader re-read the entire thread from the
    // top ~60x a second. The panel's own #ibot-messages carries no aria-live at
    // all; this must not be worse than the panel.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const chat = controllableChat();
    composer().value = 'היי';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    chat.push('תשובתי');
    await until(() => msgsText().indexOf('תשובתי') >= 0, 'token never painted');

    // Presence: there IS a live region, on the one node that is changing.
    const streaming = shadow().getElementById('ibot-inline-streaming')!;
    expect(streaming).not.toBeNull();
    expect(streaming.getAttribute('aria-live')).toBe('polite');
    // Absence: not on the container around the whole thread.
    expect(shadow().getElementById('ibot-inline-msgs')!.getAttribute('aria-live')).toBeNull();
    chat.end();
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
    const streamed = stubStreamingChat(['תשובתי', ' וברוכים', ' הבאים']);
    composer().value = 'היי';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await streamed;
    await until(() => msgsText().indexOf('תשובתי וברוכים הבאים') >= 0, 'the stream never reached the hero');
    expect(msgsText()).toContain('תשובתי וברוכים הבאים');
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

    chat.push('תשובתי');
    await until(() => msgsText().indexOf('תשובתי') >= 0, 'first token never painted');
    const launcher = document.getElementById('ibot-trigger');
    expect(launcher).not.toBeNull();

    chat.push(' ממשיכה');
    // Presence: the hero really did repaint for the second token…
    await until(() => msgsText().indexOf('תשובתי ממשיכה') >= 0, 'second token never painted');
    // …and the launcher beside it is the very same node, untouched.
    expect(document.getElementById('ibot-trigger')).toBe(launcher);
    chat.end();
  });

  it('keeps sending — a second turn goes out from the hero', async () => {
    // Every other multi-turn test sends its second message from the PANEL. If
    // the hero could only ever send once (a composer replaced mid-stream, a
    // stuck isLoading, a listener lost to a rebuild) nothing would have caught
    // it.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const chat = controllableChat();
    composer().value = 'שאלה ראשונה';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    chat.push('נענתה');
    chat.end();
    await until(() => !shadow().getElementById('ibot-inline-send')!.hasAttribute('disabled'),
      'first turn never settled');

    composer().value = 'שאלה שנייה';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const all = chat.sent;
    expect(all).toHaveLength(2);
    expect(all[1].message).toBe('שאלה שנייה');
    expect(all[1].sessionId).toBe(all[0].sessionId);
    // Both turns and the reply are all still on screen — a second send that
    // wiped the thread would be its own defect.
    expect(msgsText()).toContain('שאלה ראשונה');
    expect(msgsText()).toContain('נענתה');
    expect(msgsText()).toContain('שאלה שנייה');
    chat.end();
  });

  it('rewrites only the streaming row, not the whole thread, per token', async () => {
    // A full list rebuild per animation frame is tens of KB of parse + layout
    // at turn 8, on top of a playing video — and it is what made the live
    // region re-read the thread from the top. The observable consequence is
    // node identity: with a targeted repaint every row EXCEPT the streaming one
    // survives a token untouched.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const chat = controllableChat();
    composer().value = 'שאלתי';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    chat.push('תשובתי');
    await until(() => msgsText().indexOf('תשובתי') >= 0, 'first token never painted');
    const myRow = shadow().querySelector('#ibot-inline-msgs .row.me')!;
    const streamRow = shadow().getElementById('ibot-inline-streaming')!;
    expect(myRow).not.toBeNull();
    expect(streamRow).not.toBeNull();

    chat.push(' ממשיכה');
    await until(() => msgsText().indexOf('תשובתי ממשיכה') >= 0, 'second token never painted');
    // Presence: the streaming row's own text really did change…
    expect(streamRow.textContent).toContain('תשובתי ממשיכה');
    // …while the visitor's row beside it was never re-created.
    expect(shadow().querySelector('#ibot-inline-msgs .row.me')).toBe(myRow);
    chat.end();
  });

  it('does not replace the composer on a streamed paint', async () => {
    // The launcher-identity test proves this for the wrong node. THIS is the
    // one whose replacement eats focus and whatever the visitor was half-way
    // through typing while a reply streamed in.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const chat = controllableChat();
    composer().value = 'היי';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    chat.push('תשובתי');
    await until(() => msgsText().indexOf('תשובתי') >= 0, 'first token never painted');
    const input = composer();
    // The visitor starts typing their next question mid-reply.
    input.value = 'ובאמת';

    chat.push(' ממשיכה');
    await until(() => msgsText().indexOf('תשובתי ממשיכה') >= 0, 'second token never painted');
    // Presence: the hero demonstrably repainted…
    expect(msgsText()).toContain('תשובתי ממשיכה');
    // …and the composer is the very same node, still holding the draft.
    expect(composer()).toBe(input);
    expect(composer().value).toBe('ובאמת');
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

    // …and, more importantly, the surface RECOVERS. sendMessage() had already
    // pushed both rows and set isLoading before it threw; catching the throw
    // without resetting it leaves the button disabled and the dots spinning
    // forever — the conversation still stops accepting input, it is just no
    // longer silent about it.
    expect(shadow().getElementById('ibot-inline-send')!.hasAttribute('disabled')).toBe(false);
    expect(msgsText()).not.toContain('undefined');
    (global.fetch as any) = previous;
    composer().value = 'ניסיון שני';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const sent = (global.fetch as any).mock.calls
      .filter((c: any[]) => String(c[0]).includes('/api/widget/chat'))
      .map((c: any[]) => JSON.parse(c[1].body));
    expect(sent[sent.length - 1].message).toBe('ניסיון שני');
  });

  it('shows Bestie\'s seeded greeting as the first thing in the hero', async () => {
    // NOT a change made by this commit, and NOT previously asserted anywhere:
    // `messages` is seeded with config.welcomeMessage at boot, so the greeting
    // is already on screen the instant the pill is clicked. Pinned here so it
    // is a decision on the record rather than an accident. See the report — it
    // stutters against the headline it just collapsed, and is Ido's call.
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const rows = shadow().querySelectorAll('#ibot-inline-msgs .row');
    expect(rows.length).toBe(1);
    expect(rows[0].className).toContain('bot');
    expect(rows[0].textContent).toContain('שלום! איך אפשר לעזור?');
  });
});

describe('the rest of the widget knows the hero is engaged', () => {
  // Exit-intent needs the launcher actually visible, so these boot with
  // bubble:'always' — watchInlineVisibility() returns before touching
  // container.style.display for that mode, and showProactiveTeaser() refuses to
  // anchor a teaser to a hidden launcher.
  const ALWAYS = { ...CFG, inline: { ...REPLACE, bubble: 'always' } };
  const exitIntent = () => document.dispatchEvent(
    new MouseEvent('mouseleave', { clientY: 0, bubbles: false }));

  it('fires the proactive teaser when the visitor has NOT engaged', async () => {
    // The presence half. Without it, the absence below is satisfied by a teaser
    // that never fires in this harness for some unrelated reason.
    await bootWidget({ html: HERO, config: ALWAYS, viewportWidth: 1440 });
    exitIntent();
    expect(document.getElementById('ibot-teaser')).not.toBeNull();
  });

  it('does NOT invite them to chat while a conversation is live in the hero', async () => {
    // Before this change, engaging set isOpen = true and canFireProactive()'s
    // `if (isOpen)` suppressed the teaser for the session. isOpen now stays
    // false by design, so without an explicit gate the visitor converses in the
    // hero, scrolls past it, flicks to the top of the window — and a corner
    // teaser invites them to start chatting, above a live conversation.
    await bootWidget({ html: HERO, config: ALWAYS, viewportWidth: 1440 });
    engage();
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    exitIntent();
    expect(document.getElementById('ibot-teaser')).toBeNull();
  });
});

describe('what does not change', () => {
  it('a second live copy of the widget never binds the first one\'s launcher', async () => {
    // renderClosed() used to bind its openFromTrigger via
    // document.getElementById('ibot-trigger'), which reaches ACROSS instances.
    // A stale copy whose chat stream completes after a re-mount repaints its
    // closed state and rebinds the LIVE launcher to itself; clicking then
    // renders a panel into a container that is no longer in the document, and
    // the visitor's click does visibly nothing. This is not hypothetical — it
    // is what made one test in this file fail whenever an unrelated one did.
    const first = await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    engage();
    const chat = controllableChat();
    composer().value = 'שאלה';
    composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // A new copy mounts while that reply is still in flight.
    const second = await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    expect(second.container).not.toBe(first.container);

    // Now the abandoned instance's stream finishes: done -> scheduleRender ->
    // render -> renderClosed, on a container that is no longer in the document.
    chat.push('תשובה');
    chat.end();
    await new Promise((r) => setTimeout(r, 120));

    (document.getElementById('ibot-trigger') as HTMLElement).click();
    // Presence: a panel opened at all…
    expect(document.getElementById('ibot-panel')).not.toBeNull();
    // …and it opened inside the LIVE container, not the abandoned one.
    expect(second.container!.querySelector('#ibot-panel')).not.toBeNull();
    expect(first.container!.querySelector('#ibot-panel')).toBeNull();
  });

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
