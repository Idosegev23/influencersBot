import { describe, it, expect, beforeEach } from 'vitest';
import { bootWidget } from './helpers/boot-widget';

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* */ }
});

const HERO = '<section><div class="content_home-c-hero"><h1>LDRS</h1></div></section>';
const PREVIEW = {
  enabled: 'preview', selector: '.content_home-c-hero', mode: 'into', preset: 'hero', surface: 'bare',
  reserve: { desktop: 0, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 999, ground: 'dark' },
  bubble: 'after-scroll', banner: null,
};

// Analytics events are flushed via navigator.sendBeacon as a Blob (never as a
// plain string), and only once ANALYTICS_TOKEN is set from the config
// response (`data.analyticsToken`) — so every capturing test below must pass
// `analyticsToken` in its config and force a flush itself; widget.js never
// flushes on a live timer inside the harness's few macrotask ticks.
//
// `flushAnalytics()` is wired to `window`'s `pagehide` listener unconditionally
// (public/widget.js:673), which is the most direct way to force a flush from
// outside the IIFE without waiting on the real 3s batch timer.
function captureAnalyticsBeacons(): Blob[] {
  const beacons: Blob[] = [];
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string, body: Blob) => {
      if (String(url).includes('/api/analytics/widget')) beacons.push(body);
      return true;
    },
  });
  return beacons;
}

// jsdom's Blob implements only slice/size/type — no .text() or .arrayBuffer()
// — so FileReader is the only way in this environment to read the body back
// out of the Blob widget.js hands to sendBeacon.
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function flushedEvents(beacons: Blob[]): Promise<Array<{ name: string; payload: any }>> {
  window.dispatchEvent(new Event('pagehide'));
  if (!beacons.length) return [];
  const text = await readBlobText(beacons[beacons.length - 1]);
  const parsed = JSON.parse(text);
  return parsed.events || [];
}

describe('preview mode', () => {
  it('renders nothing inline for an ordinary visitor', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: PREVIEW } });
    expect(w.inlineHost).toBeNull();
    expect(document.getElementById('ibot-trigger')).not.toBeNull();
  });

  it('does not report a missing mount — this is a decision, not a failure', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: PREVIEW } });
    expect(w.reports.map((r) => r.type)).not.toContain('inline_mount_missing');
  });

  it('renders for a visitor who arrived with ?bestie=1', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: PREVIEW }, search: '?bestie=1' });
    expect(w.inlineHost).not.toBeNull();
  });

  it('keeps rendering after navigation, via sessionStorage', async () => {
    await bootWidget({ html: HERO, config: { inline: PREVIEW }, search: '?bestie=1' });
    const w = await bootWidget({ html: HERO, config: { inline: PREVIEW } });   // no query this time
    expect(w.inlineHost).not.toBeNull();
  });

  it('enabled:true needs no query string', async () => {
    const w = await bootWidget({ html: HERO, config: { inline: { ...PREVIEW, enabled: true } } });
    expect(w.inlineHost).not.toBeNull();
  });
});

describe('the analytics surface dimension', () => {
  it("a floating boot's widget_loaded carries surface: 'floating' and no mount_preset", async () => {
    await bootWidget({ html: HERO, config: { analyticsToken: 'test-token' } });
    const beacons = captureAnalyticsBeacons();
    const events = await flushedEvents(beacons);
    const loaded = events.find((e) => e.name === 'widget_loaded');
    expect(loaded).toBeDefined();
    expect(loaded!.payload.surface).toBe('floating');
    expect(loaded!.payload.mount_preset).toBeNull();
    expect(loaded!.payload.preview).toBeUndefined();
  });

  it("an inline boot's widget_loaded still says 'floating' — it fires before the mount is known", async () => {
    // widget_loaded is emitted before mount resolution finishes and long before
    // the 5s late-mount deadline, so an 'inline' claim there would only mean
    // "config carried a mount". mount_preset is kept as the "a mount was
    // configured for this pageview" dimension; the surface claim is not.
    await bootWidget({
      html: HERO,
      config: { analyticsToken: 'test-token', inline: { ...PREVIEW, enabled: true } },
    });
    const beacons = captureAnalyticsBeacons();
    const events = await flushedEvents(beacons);
    const loaded = events.find((e) => e.name === 'widget_loaded');
    expect(loaded).toBeDefined();
    expect(loaded!.payload.surface).toBe('floating');
    expect(loaded!.payload.mount_preset).toBe('hero');
  });

  it('widget_inline_mounted is emitted once the surface is actually in the page', async () => {
    await bootWidget({
      html: HERO,
      config: { analyticsToken: 'test-token', inline: { ...PREVIEW, enabled: true } },
    });
    const beacons = captureAnalyticsBeacons();
    const events = await flushedEvents(beacons);
    const mounted = events.filter((e) => e.name === 'widget_inline_mounted');
    expect(mounted).toHaveLength(1);
    expect(mounted[0].payload.mount_preset).toBe('hero');
    expect(mounted[0].payload.mount_mode).toBe('into');
  });

  it('a configured mount whose selector misses never claims an inline surface', async () => {
    // The exact case that made `surface: 'inline'` on widget_loaded a lie: the
    // account is configured, the selector is gone, and nothing mounted.
    await bootWidget({
      html: '<section><div class="renamed-by-webflow"></div></section>',
      config: { analyticsToken: 'test-token', inline: { ...PREVIEW, enabled: true } },
    });
    const beacons = captureAnalyticsBeacons();
    const events = await flushedEvents(beacons);
    expect(events.find((e) => e.name === 'widget_inline_mounted')).toBeUndefined();
    expect(events.find((e) => e.name === 'widget_loaded')!.payload.surface).toBe('floating');
  });

  it('preview events are marked so they cannot be counted as installs', async () => {
    await bootWidget({
      html: HERO,
      config: { analyticsToken: 'test-token', inline: PREVIEW },
      search: '?bestie=1',
    });
    const beacons = captureAnalyticsBeacons();
    const events = await flushedEvents(beacons);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.payload.preview).toBe(true);
  });

  it('a denied preview visitor (no ?bestie=1) is never marked preview, and never counted inline', async () => {
    await bootWidget({
      html: HERO,
      config: { analyticsToken: 'test-token', inline: PREVIEW },
    });
    const beacons = captureAnalyticsBeacons();
    const events = await flushedEvents(beacons);
    const loaded = events.find((e) => e.name === 'widget_loaded');
    expect(loaded).toBeDefined();
    expect(loaded!.payload.surface).toBe('floating');
    expect(loaded!.payload.preview).toBeUndefined();
  });
});
