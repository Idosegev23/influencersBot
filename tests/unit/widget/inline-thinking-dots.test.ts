import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

/**
 * The hero waits with dots, not with chatter.
 *
 * `/api/widget/chat` emits a `thinking` event carrying one of four random
 * phrases — "רגע, בודק... 🔍", "שנייה, בודק...", "אחלה, תן לי רגע...",
 * "בודק את זה..." (`src/app/api/widget/chat/route.ts:49`). Both emitters draw
 * from that same list, so there is never anything specific in it: no
 * "searching the catalogue", no "checking stock", just four ways to say
 * "hang on".
 *
 * That is filler in a corner bubble and actively wrong in this hero. Two lines
 * above the indicator sits `מ־2009 · 4,000 קמפיינים · 350 מותגים`; "אחלה, תן
 * לי רגע" is a shop assistant, and it spends exactly the authority the eyebrow
 * just bought. Three dots are language-neutral, register-neutral, read by
 * everyone as "someone is composing", and can never say anything foolish.
 *
 * The floating panel keeps the phrases — seven live customers run it and
 * nobody asked for that to change.
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
  eyebrow: 'מ־2009 · 4,000 קמפיינים · 350 מותגים',
  headline: 'ספרו לנו על המותג.',
  subline: null, valueLine: null, cta: null,
  art: { mode: 'host', image: null, reels: null, from: '#000', to: '#000' },
  starters: { label: null, items: ['אני מותג'] },
};

const REPLACE = {
  enabled: true, selector: '.content_home-c-hero', mode: 'replace', preset: 'hero',
  surface: 'bare', reserve: { desktop: 576, mobile: 460 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll', paths: null, banner: BANNER,
};
const CFG = { inline: REPLACE, placeholder: 'שאלו אותנו הכל' };

/** One of the four real phrases, verbatim from the chat route. */
const CHATTER = 'בודק את זה...';

const OPEN_STREAMS: Array<() => void> = [];

/**
 * A chat response held open, so the turn stays *in flight* and the indicator
 * actually renders. A failed or finished request sets `isLoading` false and
 * there is no indicator to assert on at all — which is how the first version
 * of this test managed to fail for the wrong reason.
 *
 * Unlike the shared helper in `inline-conversation.test.ts`, this one feeds
 * whole NDJSON events, so it can send `thinking` and not only `delta`.
 */
function controllableStream() {
  const previous = global.fetch as any;
  let release: ((ev: unknown | null) => void) | null = null;
  const queue: Array<unknown | null> = [];
  let abandoned = false;

  function next(): Promise<unknown | null> {
    if (abandoned) return new Promise(() => { /* never settles; see afterEach */ });
    if (queue.length) return Promise.resolve(queue.shift()!);
    return new Promise((r) => { release = r; });
  }
  function feed(ev: unknown | null) {
    if (release) { const r = release; release = null; r(ev); }
    else queue.push(ev);
  }

  (global.fetch as any) = (url: string, init?: any) => {
    if (!String(url).includes('/api/widget/chat')) return previous(url, init);
    return Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => next().then((ev) => (ev === null
            ? { done: true, value: undefined }
            : { done: false, value: new TextEncoder().encode(JSON.stringify(ev) + '\n') })),
        }),
      },
    });
  };
  OPEN_STREAMS.push(() => { abandoned = true; release = null; });
  return { send: (ev: unknown) => feed(ev), end: () => feed(null) };
}

function shadow() {
  return (document.querySelector('[data-bestie-inline]') as HTMLElement).shadowRoot!;
}

/** Open the hero conversation and put a turn in flight. */
async function engageAndSend(text: string) {
  (shadow().getElementById('ibot-inline-pill') as HTMLElement).click();
  const input = shadow().getElementById('ibot-inline-input') as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
}

/**
 * Wait for a condition rather than for a guessed number of ticks. The paint
 * runs on requestAnimationFrame, so a fixed tick count races it — which is how
 * the first version of these tests reported "no chatter" while actually
 * feeding the stream nothing at all.
 */
async function until(fn: () => boolean, ms = 2000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('condition never held');
}
/** A short settle for assertions that something did NOT appear. */
async function settle() {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 5));
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });
afterEach(() => { while (OPEN_STREAMS.length) OPEN_STREAMS.pop()!(); });

describe('the hero waits with dots', () => {
  it('shows the typing dots while a reply is in flight', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    controllableStream();
    await engageAndSend('אני מחפש שירות דיגיטל 360');
    await settle();

    // Presence first: an unopened conversation would satisfy every absence
    // below for entirely the wrong reason.
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    expect(shadow().querySelector('.dots')).not.toBeNull();
  });

  it('never renders the server chatter, even when the server sends it', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    const stream = controllableStream();
    await engageAndSend('אני מחפש שירות דיגיטל 360');
    stream.send({ type: 'thinking', text: CHATTER });
    await settle();

    const text = shadow().textContent || '';
    expect(shadow().getElementById('ibot-inline-conv')).not.toBeNull();
    expect(text).not.toContain(CHATTER);
    expect(text).not.toContain('בודק');
    // Still waiting, and still saying so the only way that survives any copy.
    expect(shadow().querySelector('.dots')).not.toBeNull();
  });

  it('gives way to the reply once it starts arriving', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    const stream = controllableStream();
    await engageAndSend('שאלה');
    stream.send({ type: 'thinking', text: CHATTER });
    await settle();
    expect(shadow().querySelector('.dots')).not.toBeNull();

    stream.send({ type: 'delta', text: 'שירות דיגיטל 360 אצלנו מתחיל ב' });
    await until(() => (shadow().textContent || '').indexOf('שירות דיגיטל 360 אצלנו') !== -1);
    expect(shadow().querySelector('.dots')).toBeNull();
  });

  it('the dots are the three-element structure the stylesheet animates', async () => {
    await bootWidget({ html: HERO, config: CFG, viewportWidth: 1440 });
    controllableStream();
    await engageAndSend('שאלה');
    await settle();

    const dots = shadow().querySelector('.dots')!;
    expect(dots).not.toBeNull();
    expect(dots.querySelectorAll('i')).toHaveLength(3);
    expect(shadow().querySelector('style')!.textContent || '').toContain('.dots');
  });

  it('leaves the floating panel free to keep the phrases', async () => {
    // The panel is what seven live customers run; nobody asked for it to change.
    const src = await import('node:fs').then((fs) => fs.readFileSync('public/widget.js', 'utf8'));
    expect(src).toContain('var indicatorContent = thinkingText');
  });
});
