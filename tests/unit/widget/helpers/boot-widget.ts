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
 * Listener isolation between boots.
 *
 * Every global listener widget.js installs goes on `window` or `document`
 * (error, unhandledrejection, message, scroll, click, visibilitychange,
 * pagehide, mouseout, mouseleave, keydown, DOMContentLoaded). A test file boots
 * many times into one jsdom window, so without this every previous boot's copy
 * of widget.js stays live and reacts to the current boot's events — three boots
 * turned one dispatched `error` into three diagnostics reports. We record what
 * gets attached and detach it at the start of the next boot.
 */
type Attached = { target: EventTarget; type: string; fn: any; opts: any };
let attached: Attached[] = [];
let listenersPatched = false;

function patchListeners() {
  if (listenersPatched) return;
  listenersPatched = true;
  for (const target of [window, document] as EventTarget[]) {
    const original = target.addEventListener.bind(target);
    (target as any).addEventListener = function (type: string, fn: any, options?: any) {
      attached.push({ target, type, fn, opts: options });
      return original(type, fn, options);
    };
  }
}

function detachPreviousBoot() {
  for (const a of attached) {
    try { a.target.removeEventListener(a.type, a.fn, a.opts); } catch { /* */ }
  }
  attached = [];
}

export async function bootWidget(opts: BootOptions = {}): Promise<BootedWidget> {
  const accountId = opts.accountId || ACCOUNT;
  const width = opts.viewportWidth ?? 1440;
  const reports: Array<{ type: string; message: string }> = [];

  patchListeners();
  detachPreviousBoot();

  OBSERVERS.length = 0;
  document.head.innerHTML = '';
  document.body.innerHTML = opts.html || '';
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
  if (opts.search) {
    // widget.js reads location.search for the preview gate.
    window.history.replaceState({}, '', '/' + opts.search);
  } else {
    window.history.replaceState({}, '', '/');
  }
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
  await waitFor(() => configConsumed || reports.length > 0);
  await tick();
  await tick();
  await tick();

  return {
    container: document.getElementById('ibot-widget-container'),
    inlineHost: document.querySelector('[data-bestie-inline]'),
    reports,
  };
}

/** One macrotask — flushes the entire pending microtask queue with it. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Drain macrotasks until `cond` holds, or give up after `tries` ticks. */
async function waitFor(cond: () => boolean, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await tick();
  }
}
