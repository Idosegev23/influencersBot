import { describe, it, expect } from 'vitest';
import { isCouponValid, applyActiveCouponFilter } from '@/lib/coupons/active-filter';

const NOW = new Date('2026-06-04T12:00:00Z');

describe('isCouponValid', () => {
  it('valid when active and no dates', () => {
    expect(isCouponValid({ is_active: true }, NOW)).toBe(true);
  });
  it('valid when undefined is_active and no dates (upstream already filtered)', () => {
    expect(isCouponValid({}, NOW)).toBe(true);
  });
  it('invalid when is_active is false', () => {
    expect(isCouponValid({ is_active: false }, NOW)).toBe(false);
  });
  it('invalid when end_date is in the past (the LA BEAUTÉ case)', () => {
    expect(isCouponValid({ is_active: true, end_date: '2026-05-14T20:59:59Z' }, NOW)).toBe(false);
  });
  it('invalid when start_date is in the future', () => {
    expect(isCouponValid({ is_active: true, start_date: '2026-07-01T00:00:00Z' }, NOW)).toBe(false);
  });
  it('valid when now is inside the window', () => {
    expect(isCouponValid({ is_active: true, start_date: '2026-04-01T00:00:00Z', end_date: '2026-12-31T00:00:00Z' }, NOW)).toBe(true);
  });
  it('invalid when is_active is explicitly null (matches SQL is_active=true)', () => {
    expect(isCouponValid({ is_active: null }, NOW)).toBe(false);
  });
});

describe('applyActiveCouponFilter', () => {
  it('chains is_active + start_date + end_date predicates with the given now', () => {
    const calls: { method: string; arg: string }[] = [];
    const q: any = {
      eq: (col: string, val: any) => { calls.push({ method: 'eq', arg: `${col}=${val}` }); return q; },
      or: (expr: string) => { calls.push({ method: 'or', arg: expr }); return q; },
    };
    const now = new Date('2026-06-04T12:00:00Z');
    const result = applyActiveCouponFilter(q, now);
    expect(result).toBe(q); // returns the chainable query
    expect(calls).toEqual([
      { method: 'eq', arg: 'is_active=true' },
      { method: 'or', arg: 'start_date.is.null,start_date.lte.2026-06-04T12:00:00.000Z' },
      { method: 'or', arg: 'end_date.is.null,end_date.gte.2026-06-04T12:00:00.000Z' },
    ]);
  });
});
