import { describe, it, expect } from 'vitest';
import { deriveChannelStatus, DEFAULT_THRESHOLDS } from '@/lib/health/status';
import type { ChannelFacts } from '@/lib/health/status';

const facts = (o: Partial<ChannelFacts> = {}): ChannelFacts => ({
  everPinged: true, hoursSinceLastPing: 1, opensLast7d: 10,
  errorsLast24h: 0, loadsLast24h: 100, ...o,
});

describe('deriveChannelStatus', () => {
  it('never_installed when there has never been a ping', () => {
    expect(deriveChannelStatus(facts({ everPinged: false, hoursSinceLastPing: null })))
      .toBe('never_installed');
  });

  it('live when pinged within 24h and otherwise healthy', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 23 }))).toBe('live');
  });

  it('silent after 3 days with no ping', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 73 }))).toBe('silent');
  });

  it('still live at exactly 24h — the boundary is inclusive', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 24 }))).toBe('live');
  });

  it('not yet silent at exactly 72h', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 72 }))).toBe('live');
  });

  it('erroring needs BOTH a raw count and a ratio', () => {
    expect(deriveChannelStatus(facts({ errorsLast24h: 25, loadsLast24h: 100 }))).toBe('erroring');
  });

  it('is not erroring on a high count at low ratio — a busy account would drown in noise', () => {
    expect(deriveChannelStatus(facts({ errorsLast24h: 25, loadsLast24h: 100000 }))).toBe('live');
  });

  it('is not erroring on a high ratio at trivial volume', () => {
    expect(deriveChannelStatus(facts({ errorsLast24h: 1, loadsLast24h: 3 }))).toBe('live');
  });

  it('dormant when running for 7 days with zero opens', () => {
    expect(deriveChannelStatus(facts({ opensLast7d: 0 }))).toBe('dormant');
  });

  it('PRECEDENCE: never_installed beats everything', () => {
    expect(deriveChannelStatus(facts({
      everPinged: false, hoursSinceLastPing: null, opensLast7d: 0,
      errorsLast24h: 999, loadsLast24h: 1000,
    }))).toBe('never_installed');
  });

  it('PRECEDENCE: silent beats erroring', () => {
    expect(deriveChannelStatus(facts({
      hoursSinceLastPing: 100, errorsLast24h: 50, loadsLast24h: 100,
    }))).toBe('silent');
  });

  it('PRECEDENCE: erroring beats dormant — the errors are usually the CAUSE of the dormancy', () => {
    expect(deriveChannelStatus(facts({
      opensLast7d: 0, errorsLast24h: 50, loadsLast24h: 100,
    }))).toBe('erroring');
  });

  it('treats a null hoursSinceLastPing with everPinged=true as silent, not live', () => {
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: null }))).toBe('silent');
  });

  it('honours overridden thresholds', () => {
    // Ruling R3: liveHours is dead (the 24h window lives in the SQL fact
    // producer, not here), so the override list drops it — silentDays: 1
    // alone still forces 'silent' at 30 hours since last ping (30 > 24).
    expect(deriveChannelStatus(facts({ hoursSinceLastPing: 30 }),
      { ...DEFAULT_THRESHOLDS, silentDays: 1 })).toBe('silent');
  });
});
