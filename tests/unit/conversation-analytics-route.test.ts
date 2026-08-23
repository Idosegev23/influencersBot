import { describe, it, expect } from 'vitest';
import { parseRange } from '@/lib/conversation-analytics/range';

const NOW = new Date('2026-08-23T12:00:00.000Z');

describe('parseRange', () => {
  it('defaults to the last 30 days', () => {
    const r = parseRange(new URLSearchParams(), NOW);
    expect(r.toIso).toBe(NOW.toISOString());
    expect(r.fromIso.slice(0, 10)).toBe('2026-07-24');
  });

  it('honours an explicit days window', () => {
    const r = parseRange(new URLSearchParams('days=7'), NOW);
    expect(r.fromIso.slice(0, 10)).toBe('2026-08-16');
  });

  it('honours explicit from/to dates', () => {
    const r = parseRange(new URLSearchParams('from=2026-08-01&to=2026-08-08'), NOW);
    expect(r.fromIso.slice(0, 10)).toBe('2026-08-01');
    expect(r.toIso.slice(0, 10)).toBe('2026-08-08');
  });

  // The comparison window must match the reported one or every delta lies.
  it('makes the comparison window the same length as the reported one', () => {
    const r = parseRange(new URLSearchParams('from=2026-08-01&to=2026-08-08'), NOW);
    const len = (a: string, b: string) => Date.parse(b) - Date.parse(a);
    expect(len(r.prevFromIso, r.prevToIso)).toBe(len(r.fromIso, r.toIso));
    expect(r.prevToIso).toBe(r.fromIso);
  });

  it('falls back to 30 days for a nonsense window', () => {
    const r = parseRange(new URLSearchParams('days=abc'), NOW);
    expect(r.fromIso.slice(0, 10)).toBe('2026-07-24');
  });

  it('never returns an inverted window', () => {
    const r = parseRange(new URLSearchParams('from=2026-08-08&to=2026-08-01'), NOW);
    expect(Date.parse(r.toIso)).toBeGreaterThan(Date.parse(r.fromIso));
  });

  it('rejects a negative or zero day count', () => {
    expect(parseRange(new URLSearchParams('days=0'), NOW).fromIso.slice(0, 10)).toBe('2026-07-24');
    expect(parseRange(new URLSearchParams('days=-5'), NOW).fromIso.slice(0, 10)).toBe('2026-07-24');
  });
});
