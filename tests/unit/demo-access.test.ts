import { describe, it, expect } from 'vitest';
import { resolveDemoAccess, DEMO_WINDOW_DAYS, buildDemoConfig, extendDemoWindow } from '@/lib/demo/access';

const NOW = new Date('2026-08-19T12:00:00Z');

/** An account whose demo ends `days` from NOW (negative = already past). */
function demoEndingIn(days: number, extra: Record<string, unknown> = {}) {
  const ends = new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
  const starts = new Date(ends.getTime() - DEMO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    config: {
      isDemo: true,
      demo: { starts_at: starts.toISOString(), ends_at: ends.toISOString(), ...extra },
    },
  };
}

describe('resolveDemoAccess — absence means open', () => {
  // This block is the paying-customer guard. If any of it goes red, the feature
  // can lock a live account, which is the one outcome that must never happen.
  it('treats an account with no config as open', () => {
    const access = resolveDemoAccess({}, NOW);
    expect(access.state).toBe('open');
    expect(access.endsAt).toBeNull();
    expect(access.daysLeft).toBeNull();
  });

  it('treats an account with config but no demo object as open', () => {
    const access = resolveDemoAccess({ config: { isDemo: true, theme: {} } }, NOW);
    expect(access.state).toBe('open');
    expect(access.daysLeft).toBeNull();
  });

  it('treats a paying account (no demo, not a demo) as open with no countdown', () => {
    const access = resolveDemoAccess({ config: { isDemo: false } }, NOW);
    expect(access.state).toBe('open');
    expect(access.endsAt).toBeNull();
  });

  it('treats null/undefined account as open rather than throwing', () => {
    expect(resolveDemoAccess(null as any, NOW).state).toBe('open');
    expect(resolveDemoAccess(undefined as any, NOW).state).toBe('open');
  });
});

describe('resolveDemoAccess — the window', () => {
  it('is open early in the week', () => {
    const access = resolveDemoAccess(demoEndingIn(5), NOW);
    expect(access.state).toBe('open');
    expect(access.daysLeft).toBe(5);
  });

  it('is expiring inside the final two days', () => {
    expect(resolveDemoAccess(demoEndingIn(2), NOW).state).toBe('expiring');
    expect(resolveDemoAccess(demoEndingIn(1), NOW).state).toBe('expiring');
  });

  it('is locked exactly at ends_at', () => {
    const access = resolveDemoAccess(demoEndingIn(0), NOW);
    expect(access.state).toBe('locked');
    expect(access.daysLeft).toBe(0);
  });

  it('is locked after ends_at', () => {
    expect(resolveDemoAccess(demoEndingIn(-1), NOW).state).toBe('locked');
    expect(resolveDemoAccess(demoEndingIn(-90), NOW).state).toBe('locked');
  });

  it('rounds part-days up so a demo with 3 hours left still reads as 1 day', () => {
    const access = resolveDemoAccess(demoEndingIn(3 / 24), NOW);
    expect(access.daysLeft).toBe(1);
    expect(access.state).toBe('expiring');
  });
});

describe('resolveDemoAccess — extension', () => {
  it('a future extended_to overrides a past ends_at', () => {
    const future = new Date(NOW.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();
    const access = resolveDemoAccess(demoEndingIn(-3, { extended_to: future }), NOW);
    expect(access.state).toBe('open');
    expect(access.daysLeft).toBe(4);
    expect(access.endsAt).toBe(future);
  });

  it('a past extended_to does not resurrect an expired demo', () => {
    const past = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(resolveDemoAccess(demoEndingIn(-3, { extended_to: past }), NOW).state).toBe('locked');
  });

  it('an extension shorter than ends_at still wins — the admin meant it', () => {
    const soon = new Date(NOW.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();
    const access = resolveDemoAccess(demoEndingIn(6, { extended_to: soon }), NOW);
    expect(access.state).toBe('expiring');
    expect(access.daysLeft).toBe(1);
  });
});

describe('resolveDemoAccess — malformed data fails open', () => {
  // Failing open costs us a demo that outlives its week. Failing closed puts a
  // sales screen in front of a paying customer. Always fail open.
  for (const bad of ['', 'not-a-date', null, undefined, 0, {}, []]) {
    it(`treats ends_at=${JSON.stringify(bad)} as open`, () => {
      const account = { config: { demo: { starts_at: '2026-08-12T00:00:00Z', ends_at: bad } } };
      const access = resolveDemoAccess(account as any, NOW);
      expect(access.state).toBe('open');
      expect(access.daysLeft).toBeNull();
    });
  }

  it('ignores a malformed extended_to and falls back to ends_at', () => {
    const access = resolveDemoAccess(demoEndingIn(-2, { extended_to: 'garbage' }), NOW);
    expect(access.state).toBe('locked');
  });

  it('treats a non-object demo value as open', () => {
    expect(resolveDemoAccess({ config: { demo: 'yes' } } as any, NOW).state).toBe('open');
  });
});

describe('buildDemoConfig', () => {
  it('opens a 7-day window from the given start', () => {
    const cfg = buildDemoConfig(NOW);
    expect(cfg.starts_at).toBe(NOW.toISOString());
    expect(cfg.ends_at).toBe(new Date('2026-08-26T12:00:00Z').toISOString());
    expect(cfg.locked_at).toBeNull();
    expect(cfg.lead_sent_at).toBeNull();
  });

  it('produces a config that immediately reads as open with a full window', () => {
    const access = resolveDemoAccess({ config: { demo: buildDemoConfig(NOW) } }, NOW);
    expect(access.state).toBe('open');
    expect(access.daysLeft).toBe(DEMO_WINDOW_DAYS);
  });
});

describe('extendDemoWindow', () => {
  it('adds a week on top of a demo that still has days left', () => {
    // 5 days remaining must become 12, not be cut back to 7.
    const demo = demoEndingIn(5).config.demo;
    const out = extendDemoWindow(demo, NOW)!;
    const access = resolveDemoAccess({ config: { demo: out } }, NOW);
    expect(access.daysLeft).toBe(5 + DEMO_WINDOW_DAYS);
  });

  it('gives a week from today when the demo already expired', () => {
    const demo = demoEndingIn(-30).config.demo;
    const out = extendDemoWindow(demo, NOW)!;
    const access = resolveDemoAccess({ config: { demo: out } }, NOW);
    expect(access.state).toBe('open');
    expect(access.daysLeft).toBe(DEMO_WINDOW_DAYS);
  });

  it('clears locked_at so the next lock is announced again', () => {
    const demo = { ...demoEndingIn(-1).config.demo, locked_at: '2026-08-18T00:00:00Z' };
    expect(extendDemoWindow(demo, NOW)!.locked_at).toBeNull();
  });

  it('leaves the original ends_at intact', () => {
    const demo = demoEndingIn(2).config.demo;
    expect(extendDemoWindow(demo, NOW)!.ends_at).toBe(demo.ends_at);
  });

  it('stacks: extending twice adds two weeks', () => {
    const once = extendDemoWindow(demoEndingIn(0).config.demo, NOW)!;
    const twice = extendDemoWindow(once, NOW)!;
    expect(resolveDemoAccess({ config: { demo: twice } }, NOW).daysLeft).toBe(DEMO_WINDOW_DAYS * 2);
  });

  it('returns null for a missing demo rather than inventing a window', () => {
    expect(extendDemoWindow(null, NOW)).toBeNull();
    expect(extendDemoWindow(undefined, NOW)).toBeNull();
  });

  it('extends from today when the stored dates are garbage', () => {
    const out = extendDemoWindow({ ends_at: 'nonsense', extended_to: '' } as any, NOW)!;
    expect(resolveDemoAccess({ config: { demo: out } }, NOW).daysLeft).toBe(DEMO_WINDOW_DAYS);
  });
});
