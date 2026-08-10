import { describe, it, expect, vi, beforeEach } from 'vitest';

// One in-memory account row the helper reads and writes.
const H = { config: null as any, updated: null as any };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const c: any = {};
      c.select = () => c;
      c.eq = () => c;
      c.maybeSingle = async () => ({ data: H.config ? { id: 'acc-1', config: H.config } : null });
      c.update = (patch: any) => { H.updated = patch; return { eq: async () => ({ data: null }) }; };
      return c;
    },
  },
}));

import { markOnboardingFailed } from '@/lib/onboarding/failure';
import { ACTIVE_ONBOARDING } from '@/lib/onboarding/resolve';

beforeEach(() => { H.config = null; H.updated = null; });

describe('ACTIVE_ONBOARDING', () => {
  // The wizard polls /status, which resolves the token ONLY while the status is in
  // this list. If 'failed' were missing the wizard would 404 instead of showing the
  // error — strictly worse than the stuck screen this fix exists to replace.
  it("includes 'failed' so the wizard can still resolve its token and show the error", () => {
    expect(ACTIVE_ONBOARDING).toContain('failed');
  });
});

describe('markOnboardingFailed', () => {
  it('sets status=failed and records the error while scanning', async () => {
    H.config = { onboarding: { status: 'scanning', token: 't1', jobId: 'j1' }, username: 'x' };

    await markOnboardingFailed('acc-1', 'site-discover: Invalid URL');

    expect(H.updated.config.onboarding.status).toBe('failed');
    expect(H.updated.config.onboarding.error).toBe('site-discover: Invalid URL');
  });

  it('preserves the rest of the config and the other onboarding fields', async () => {
    H.config = { onboarding: { status: 'scanning', token: 't1', jobId: 'j1' }, username: 'x', sources: { instagram: 'ig' } };

    await markOnboardingFailed('acc-1', 'boom');

    expect(H.updated.config.username).toBe('x');
    expect(H.updated.config.sources).toEqual({ instagram: 'ig' });
    expect(H.updated.config.onboarding.token).toBe('t1');
    expect(H.updated.config.onboarding.jobId).toBe('j1');
  });

  // The nightly cron re-scans LIVE accounts through the same failure path. A failed
  // re-scan must never reopen a finished account's onboarding as 'failed'.
  it('does nothing when the account is not mid-onboarding', async () => {
    H.config = { onboarding: { status: 'ready', token: 't1' }, username: 'x' };
    await markOnboardingFailed('acc-1', 'boom');
    expect(H.updated).toBeNull();
  });

  it('does nothing for an account with no onboarding block at all', async () => {
    H.config = { username: 'x' };
    await markOnboardingFailed('acc-1', 'boom');
    expect(H.updated).toBeNull();
  });

  it('does not throw when the account is missing', async () => {
    H.config = null;
    await expect(markOnboardingFailed('nope', 'boom')).resolves.toBeUndefined();
    expect(H.updated).toBeNull();
  });
});
