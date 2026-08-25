import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

/**
 * The producer half of the 2026-08-19 blockage.
 *
 * The click collector captured an element's text and truncated it at 80
 * characters. On a checkout form whose 80th character landed inside an emoji,
 * that left an orphaned UTF-16 surrogate — legal JSON, illegal Postgres text.
 * PostgREST rejected the batch it travelled in, the drain put the batch back,
 * and the queue never moved again: 249,007 events backed up and every widget
 * event after 2026-08-21 was dropped on the floor.
 *
 * The ingest route sanitises as well, and that is the fix that protects us
 * today, because this file sits in visitors' browser caches for weeks. This
 * pins the other half: we stop manufacturing the garbage.
 */
/**
 * Unpaired surrogates only. A well-formed emoji IS a surrogate pair, so a
 * naive /[\uD800-\uDFFF]/ flags valid text and would have failed the very
 * case we want to preserve.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Capture what the behaviour queue ships.
 *
 * `sendBeacon` is stubbed to return false on purpose: widget.js then falls
 * through to its `fetch` path, where the body is a plain string rather than a
 * Blob that jsdom cannot read synchronously.
 */
function captureBehaviourBeacons(): any[] {
  const captured: any[] = [];
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => false });

  const inner = global.fetch as any;
  (global.fetch as any) = (url: any, init?: any) => {
    if (String(url).includes('/api/widget/events') && init?.body) {
      try { captured.push(JSON.parse(String(init.body))); } catch { /* not ours */ }
    }
    return inner(url, init);
  };
  return captured;
}

/**
 * The behaviour queue flushes on a 3s timer, not on pagehide. Wait for the
 * condition rather than for a guessed duration.
 */
async function waitForBeacon(captured: any[], timeoutMs = 6000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (captured.length > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no behaviour beacon was sent within the timeout');
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* */ } });

describe('click text truncation', () => {
  it('never emits an orphaned surrogate when the cut lands inside an emoji', async () => {
    // 79 plain characters then an emoji: a naive slice(0, 80) takes the emoji's
    // high half and leaves its low half behind.
    const label = 'x'.repeat(79) + '😀';
    await bootWidget({
      html: `<button id="cta">${label}</button>`,
      config: { analyticsToken: 'test-token', inline: null },
    });

    const captured = captureBehaviourBeacons();
    (document.getElementById('cta') as HTMLElement).click();
    await waitForBeacon(captured);

    const serialised = JSON.stringify(captured);
    // Non-vacuity: an empty capture would satisfy the surrogate assertion for
    // the wrong reason, which is exactly how the original defect shipped green.
    expect(serialised).toContain('xxx');
    expect(serialised).not.toMatch(LONE_SURROGATE);
  }, 15_000);

  it('keeps a whole emoji when it fits inside the limit — content is kept, only made storable', async () => {
    await bootWidget({
      html: '<button id="cta">קנה עכשיו 😀</button>',
      config: { analyticsToken: 'test-token', inline: null },
    });

    const captured = captureBehaviourBeacons();
    (document.getElementById('cta') as HTMLElement).click();
    await waitForBeacon(captured);

    const serialised = JSON.stringify(captured);
    expect(serialised).toContain('קנה עכשיו');
    expect(serialised).toContain('😀');
    expect(serialised).not.toMatch(LONE_SURROGATE);
  }, 15_000);

  it('ships the surrogate-safe helper rather than a bare slice on captured text', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('public/widget.js', 'utf8'));
    expect(src).toContain('function safeSlice');
    // The exact line that caused the incident must no longer exist.
    expect(src).not.toContain("((el.textContent || '') + '').trim().slice(0, 80)");
  });
});
