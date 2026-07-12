import { describe, it, expect } from 'vitest';
import { redactToken, isSafeReturnTo } from '@/lib/meta-review/util';

describe('redactToken', () => {
  it('redacts the token when it is the last query param', () => {
    expect(redactToken('https://graph.instagram.com/v22.0/me?fields=id&access_token=ABC123'))
      .toBe('https://graph.instagram.com/v22.0/me?fields=id&access_token=***REDACTED***');
  });
  it('redacts the token when it is the first query param', () => {
    expect(redactToken('https://x/me?access_token=SECRET&fields=id'))
      .toBe('https://x/me?access_token=***REDACTED***&fields=id');
  });
  it('leaves a URL with no token untouched', () => {
    expect(redactToken('https://x/me?fields=id')).toBe('https://x/me?fields=id');
  });
});

describe('isSafeReturnTo', () => {
  it('accepts a relative admin path with a hash', () => {
    expect(isSafeReturnTo('/admin/influencers/abc#meta-api-console')).toBe(true);
  });
  it('rejects protocol-relative, absolute, and backslash URLs', () => {
    expect(isSafeReturnTo('//evil.com')).toBe(false);
    expect(isSafeReturnTo('https://evil.com')).toBe(false);
    expect(isSafeReturnTo('/\\evil.com')).toBe(false);
  });
  it('rejects null and empty', () => {
    expect(isSafeReturnTo(null)).toBe(false);
    expect(isSafeReturnTo('')).toBe(false);
  });
});
