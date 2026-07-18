import { describe, it, expect } from 'vitest';
import { analyticsSurface, sanitizeTrackedPath } from '@/lib/analytics/surface';

describe('analyticsSurface', () => {
  it('marks public marketing routes as marketing', () => {
    for (const p of ['/', '/contact', '/privacy', '/terms', '/data-deletion', '/onboarding-guide', '/install', '/demo', '/demo/argania']) {
      expect(analyticsSurface(p)).toBe('marketing');
    }
  });

  it('marks the public account chat as chat', () => {
    expect(analyticsSurface('/chat/argania')).toBe('chat');
    expect(analyticsSurface('/chat')).toBe('chat');
  });

  it('marks every [token] route as none (the leak fix)', () => {
    for (const p of ['/sign/abc123', '/invoice/xyz', '/onboard/tok', '/reply/tok', '/feedback/tok']) {
      expect(analyticsSurface(p)).toBe('none');
    }
  });

  it('marks admin + dashboards as none', () => {
    for (const p of ['/admin', '/admin/dashboard', '/influencer/reutlev/settings', '/agent', '/manage']) {
      expect(analyticsSurface(p)).toBe('none');
    }
  });

  it('ignores trailing slash and query string', () => {
    expect(analyticsSurface('/contact/')).toBe('marketing');
    expect(analyticsSurface('/?utm_source=google')).toBe('marketing');
    expect(analyticsSurface('/sign/abc?x=1')).toBe('none');
  });

  it('defaults unknown routes to none (allowlist, no silent leak)', () => {
    expect(analyticsSurface('/some-new-page')).toBe('none');
    expect(analyticsSurface(null)).toBe('none');
    expect(analyticsSurface(undefined)).toBe('none');
  });
});

describe('sanitizeTrackedPath', () => {
  it('redacts the secret segment on token routes', () => {
    expect(sanitizeTrackedPath('/sign/supersecrettoken')).toBe('/sign/[redacted]');
    expect(sanitizeTrackedPath('/invoice/abc?x=1')).toBe('/invoice/[redacted]');
    expect(sanitizeTrackedPath('/onboard/tok')).toBe('/onboard/[redacted]');
  });

  it('leaves non-token paths untouched (utm preserved)', () => {
    expect(sanitizeTrackedPath('/?utm_source=google')).toBe('/?utm_source=google');
    expect(sanitizeTrackedPath('/chat/argania')).toBe('/chat/argania');
    expect(sanitizeTrackedPath('')).toBe('');
  });
});
