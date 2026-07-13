import { describe, it, expect } from 'vitest';
import { newOnboardingToken, slugifyAccountName, onboardingLinkFor } from '@/lib/onboarding/tokens';

describe('newOnboardingToken', () => {
  it('is URL-safe and unique across calls', () => {
    const a = newOnboardingToken();
    const b = newOnboardingToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });
});

describe('slugifyAccountName', () => {
  it('lowercases, strips spaces/symbols/accents', () => {
    expect(slugifyAccountName('Nike Israel')).toBe('nike-israel');
    expect(slugifyAccountName('Café  &  Co!!')).toBe('cafe-co');
    expect(slugifyAccountName('שם בעברית')).toBe('account'); // no latin → fallback
  });
  it('falls back to "account" for empty/garbage', () => {
    expect(slugifyAccountName('')).toBe('account');
    expect(slugifyAccountName('   ')).toBe('account');
    expect(slugifyAccountName('***')).toBe('account');
  });
});

describe('onboardingLinkFor', () => {
  it('builds a /onboard/<token> link', () => {
    expect(onboardingLinkFor('abc123')).toMatch(/\/onboard\/abc123$/);
  });
});
