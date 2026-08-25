/**
 * Boots public/widget.js inside jsdom against a fake host page.
 *
 * widget.js is an IIFE that reads document.currentScript on the first line and
 * returns early without a data-account-id, so it cannot simply be imported. We
 * stand up the globals a browser would provide, define currentScript, then
 * evaluate the file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { vi } from 'vitest';

export interface BootOptions {
  accountId?: string;
  /** Markup for the fake customer page, written into document.body. */
  html?: string;
  /** Body of the /api/widget/config response. Merged over a minimal default. */
  config?: any;
  viewportWidth?: number;
  /** Query string for the fake page, e.g. '?bestie=1'. */
  search?: string;
  /** Pathname for the fake page, e.g. '/products/shoes'. Defaults to '/'. */
  path?: string;
}

export interface BootedWidget {
  container: HTMLElement | null;
  inlineHost: HTMLElement | null;
  reports: Array<{ type: string; message: string }>;
}

const ACCOUNT = '00000000-0000-4000-8000-00000000dead';

/**
 * Every IntersectionObserver the harness handed to widget.js, newest last.
 * Cleared at the start of each boot so `OBSERVERS[OBSERVERS.length - 1]` always
 * refers to the widget instance under test and never to a previous test's.
 */
export const OBSERVERS: any[] = [];

/**
 * jsdom has no IntersectionObserver. `fire(isIntersecting)` lets a test simulate
 * the observed element scrolling in or out of view.
 */
class FakeIntersectionObserver {
  public elements: Element[] = [];
  private cb: any;
  constructor(cb: any) {
    this.cb = cb;
    OBSERVERS.push(this);
  }
  observe(el: Element) {
    this.elements.push(el);
  }
  unobserve(el: Element) {
    this.elements = this.elements.filter((e) => e !== el);
  }
  disconnect() {
    this.elements = [];
  }
  takeRecords() {
    return [];
  }
  fire(isIntersecting: boolean) {
    this.cb(
      this.elements.length
        ? this.elements.map((target) => ({ isIntersecting, target, intersectionRatio: isIntersecting ? 1 : 0 }))
        : [{ isIntersecting, target: null, intersectionRatio: isIntersecting ? 1 : 0 }],
      this,
    );
  }
}

/**
 * Walk up from the working directory to find public/widget.js. Vitest's jsdom
 * environment does not give this module a file: import.meta.url, so it cannot be
 * resolved relative to this file; searching upward keeps it working whether
 * vitest runs from the repo root or a nested package dir.
 */
function findWidgetJs(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'public', 'widget.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('boot-widget harness: could not locate public/widget.js from ' + process.cwd());
}

let widgetSource: string | null = null;

/**
 * Teardown between boots — listeners and timers.
 *
 * Every global listener widget.js installs goes on `window` or `document`
 * (error, unhandledrejection, message, scroll, click, visibilitychange,
 * pagehide, mouseout, mouseleave, keydown, DOMContentLoaded). A test file boots
 * many times into one jsdom window, so without this every previous boot's copy
 * of widget.js stays live and reacts to the current boot's events — three boots
 * turned one dispatched `error` into three diagnostics reports.
 *
 * Timers are the same hazard on a delay. Each boot unconditionally schedules
 * `setTimeout(showBubbleTooltip, 2500)` (widget.js:1262) and, via
 * initCartWatcher, a `setInterval(…, 2000)` (widget.js:3123). Every guard in
 * showBubbleTooltip passes here — `locale.teaser.generic` is non-empty, isOpen
 * is false, and tooltipSeen() reads the localStorage mock from tests/setup.ts,
 * which returns undefined — so it reaches `document.body.appendChild(#ibot-tip)`
 * against whatever page is current 2.5s later. That lands nondeterministically
 * on whether a file's runtime crosses 2.5s past its first boot.
 *
 * NOTE ON SCOPE: the addEventListener patch is unconditional, so a listener a
 * *test* attaches to window/document between boots is also detached at the next
 * boot. That is intentional isolation, not an oversight. Timer recording is
 * narrower — only timers scheduled inside the boot window (see `recordingTimers`)
 * are tracked, deliberately, so the harness never cancels a vitest-internal
 * timer such as a test-timeout scheduled between boots.
 */
type Attached = { target: EventTarget; type: string; fn: any; opts: any };
let attached: Attached[] = [];
let patched = false;

/** Timers scheduled while a boot was in flight, cleared at the next boot. */
let bootTimers: Array<{ id: any; kind: 'timeout' | 'interval' }> = [];
let recordingTimers = false;

/** Captured before patching, so the harness's own ticks are never recorded. */
const rawSetTimeout: typeof window.setTimeout = window.setTimeout.bind(window);

function patchGlobals() {
  if (patched) return;
  patched = true;

  for (const target of [window, document] as EventTarget[]) {
    const original = target.addEventListener.bind(target);
    (target as any).addEventListener = function (type: string, fn: any, options?: any) {
      attached.push({ target, type, fn, opts: options });
      return original(type, fn, options);
    };
  }

  const origSetTimeout = window.setTimeout.bind(window);
  const origSetInterval = window.setInterval.bind(window);
  (window as any).setTimeout = function (fn: any, ms?: any, ...rest: any[]) {
    const id = origSetTimeout(fn, ms, ...rest);
    if (recordingTimers) bootTimers.push({ id, kind: 'timeout' });
    return id;
  };
  (window as any).setInterval = function (fn: any, ms?: any, ...rest: any[]) {
    const id = origSetInterval(fn, ms, ...rest);
    if (recordingTimers) bootTimers.push({ id, kind: 'interval' });
    return id;
  };
}

function detachPreviousBoot() {
  for (const a of attached) {
    try { a.target.removeEventListener(a.type, a.fn, a.opts); } catch { /* */ }
  }
  attached = [];

  for (const t of bootTimers) {
    try { t.kind === 'interval' ? clearInterval(t.id) : clearTimeout(t.id); } catch { /* */ }
  }
  bootTimers = [];
}

export async function bootWidget(opts: BootOptions = {}): Promise<BootedWidget> {
  const accountId = opts.accountId || ACCOUNT;
  const width = opts.viewportWidth ?? 1440;
  const reports: Array<{ type: string; message: string }> = [];

  patchGlobals();
  detachPreviousBoot();
  recordingTimers = true;

  OBSERVERS.length = 0;
  document.head.innerHTML = '';
  document.body.innerHTML = opts.html || '';
  // render()'s mobile scroll lock (widget.js:1948-1956) writes position/top/
  // left/right/width onto body and overflow onto documentElement. Its restore
  // branch is gated on window.__ibotScrollLocked, which the latch reset below
  // deletes — so the restore can never run, and innerHTML clears children, not
  // the element's own inline style. Any test that opens the widget under 640px
  // would otherwise pin the body for every later boot in the file.
  document.body.removeAttribute('style');
  document.documentElement.removeAttribute('style');
  // widget.js sets one-shot latches on window (__ibotVVBound, __ibotScrollBound,
  // …) so its global listeners register once per page. A test file boots many
  // times into the same jsdom window; clearing them keeps each boot equivalent
  // to a first load.
  for (const key of Object.keys(window)) {
    if (key.indexOf('__ibot') === 0) {
      try {
        delete (window as any)[key];
      } catch {
        /* non-configurable is fine — the latch just stays set */
      }
    }
  }

  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

  // jsdom implements neither of these; widget.js calls both unguarded.
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({
        matches: false, media: q, onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      }),
    });
  }
  if (!(window as any).IntersectionObserver) {
    (window as any).IntersectionObserver = FakeIntersectionObserver;
    (globalThis as any).IntersectionObserver = FakeIntersectionObserver;
  }

  // Diagnostics are a POST; capture them instead of asserting on network calls.
  const configBody = {
    language: 'he', enabled: true, theme: {}, modules: {},
    banner: null, invitation: null, socialLinks: [], inline: null,
    ...(opts.config || {}),
  };

  // Set the moment widget.js reads the config response body. This is the only
  // honest "config is on its way into the widget" signal: widget.js renders
  // synchronously at the end of its IIFE, long before the fetch resolves, so a
  // wait keyed on "something rendered" returns a pre-config widget.
  let configConsumed = false;

  (global.fetch as any) = vi.fn((url: string, init?: any) => {
    const u = String(url);
    if (u.includes('/api/widget/diagnostics')) {
      try {
        const body = JSON.parse(init?.body || '{}');
        reports.push({ type: body.type, message: body.message });
      } catch { /* a malformed report is still a report we did not want */ }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    }
    if (u.includes('/api/widget/config')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => { configConsumed = true; return Promise.resolve(configBody); },
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

  // sendBeacon is the diagnostics fast path; route it through the same capture.
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string, body: any) => {
      if (String(url).includes('/api/widget/diagnostics')) {
        try { const b = JSON.parse(body); reports.push({ type: b.type, message: b.message }); } catch { /* */ }
      }
      return true;
    },
  });

  const script = document.createElement('script');
  script.setAttribute('data-account-id', accountId);
  // widget.js reads location.search for the preview gate and location.pathname
  // for the inline mount's path scope.
  window.history.replaceState({}, '', (opts.path || '/') + (opts.search || ''));
  Object.defineProperty(script, 'src', {
    value: 'https://influencers-bot.vercel.app/widget.js',
    configurable: true,
  });
  document.head.appendChild(script);
  Object.defineProperty(document, 'currentScript', { value: script, configurable: true });

  if (widgetSource === null) widgetSource = readFileSync(findWidgetJs(), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(widgetSource)();

  // Let the config fetch's promise chain settle. Condition-based rather than a
  // fixed count of ticks, because the chain's depth is an implementation detail
  // of widget.js that Tasks 5-8 will add to. Two phases:
  //   1. wait until widget.js reads the config body (or gives up and reports);
  //   2. drain macrotasks so the handler that body feeds — locale, theme,
  //      modules, updateContainerPosition, render — has run. A macrotask
  //      flushes the whole microtask queue, so one is enough for a plain
  //      promise chain; three leaves headroom for a chained setTimeout(0).
  // The second disjunct is the config-failure path specifically, not any
  // diagnostic: widget.js's .catch reports `config_load_failed` and then
  // renders defaults, which is a legitimately settled boot. Any other
  // diagnostic type says nothing about whether config arrived.
  await waitFor(
    () => configConsumed || reports.some((r) => r.type === 'config_load_failed'),
    'config never reached widget.js',
  );
  await tick();
  await tick();
  await tick();

  recordingTimers = false;

  return {
    container: document.getElementById('ibot-widget-container'),
    inlineHost: document.querySelector('[data-bestie-inline]'),
    reports,
  };
}

/**
 * One macrotask — flushes the entire pending microtask queue with it. Uses the
 * pre-patch setTimeout so the harness's own ticks are never recorded as boot
 * timers.
 */
function tick(): Promise<void> {
  return new Promise((r) => rawSetTimeout(r, 0));
}

/**
 * Drain macrotasks until `cond` holds. Throws on exhaustion rather than
 * returning: the entire point of this wait is that a pre-config widget poisons
 * downstream assertions silently, so the guard against it must not itself have
 * a silent fallback into that state.
 */
async function waitFor(cond: () => boolean, what: string, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error(`boot-widget: ${what} (gave up after ${tries} macrotask ticks)`);
}
