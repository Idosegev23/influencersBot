import { describe, it, expect } from 'vitest';
import { runHealthCheck } from '@/lib/bestie/dashboard/health';

const now = new Date('2026-07-26T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();
const base = { coupons: [], productCount: 5, instagramConnected: true, openTickets: [], now };

describe('runHealthCheck', () => {
  it('flags an expired coupon that is still active', () => {
    const findings = runHealthCheck({
      ...base,
      coupons: [{ code: 'SUMMER20', end_date: daysAgo(10), is_active: true }],
    });
    expect(findings.some(f => f.kind === 'expired_coupon_active')).toBe(true);
    expect(findings.find(f => f.kind === 'expired_coupon_active')!.detail).toContain('SUMMER20');
  });

  it('does not flag an expired coupon that was already switched off', () => {
    const findings = runHealthCheck({
      ...base,
      coupons: [{ code: 'OLD', end_date: daysAgo(10), is_active: false }],
    });
    expect(findings.some(f => f.kind === 'expired_coupon_active')).toBe(false);
  });

  it('does not flag a coupon with no end date', () => {
    const findings = runHealthCheck({
      ...base,
      coupons: [{ code: 'FOREVER', end_date: null, is_active: true }],
    });
    expect(findings.some(f => f.kind === 'expired_coupon_active')).toBe(false);
  });

  it('flags a disconnected Instagram and an empty catalog', () => {
    const findings = runHealthCheck({ ...base, instagramConnected: false, productCount: 0 });
    const kinds = findings.map(f => f.kind);
    expect(kinds).toContain('instagram_disconnected');
    expect(kinds).toContain('empty_catalog');
  });

  it('flags tickets left waiting more than two days', () => {
    const findings = runHealthCheck({
      ...base,
      openTickets: [{ created_at: daysAgo(3) }, { created_at: daysAgo(4) }, { created_at: daysAgo(1) }],
    });
    const stale = findings.find(f => f.kind === 'stale_tickets');
    expect(stale).toBeDefined();
    expect(stale!.detail).toContain('2'); // two of the three
  });

  it('points every finding at a real screen', () => {
    const findings = runHealthCheck({
      ...base, instagramConnected: false, productCount: 0,
      coupons: [{ code: 'X', end_date: daysAgo(1), is_active: true }],
      openTickets: [{ created_at: daysAgo(5) }],
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.route).toMatch(/^\/influencer\/\[username\]/);
  });

  it('says nothing when the account is healthy', () => {
    expect(runHealthCheck(base)).toEqual([]);
  });
});
