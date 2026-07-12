import { describe, it, expect } from 'vitest';
import { redactToken, redactDeep, isSafeReturnTo } from '@/lib/meta-review/util';

describe('redactToken', () => {
  it('redacts the token when it is the last query param', () => {
    expect(redactToken('https://graph.instagram.com/v22.0/me?fields=id&access_token=ABC123'))
      .toBe('https://graph.instagram.com/v22.0/me?fields=id&access_token=***REDACTED***');
  });
  it('redacts the token when it is the first query param', () => {
    expect(redactToken('https://x/me?access_token=SECRET&fields=id'))
      .toBe('https://x/me?access_token=***REDACTED***&fields=id');
  });
  it('redacts a token that ends inside a JSON string value (followed by a quote)', () => {
    expect(redactToken('{"next":"https://x/me?access_token=IGQVJSECRET"}'))
      .toBe('{"next":"https://x/me?access_token=***REDACTED***"}');
  });
  it('leaves a URL with no token untouched', () => {
    expect(redactToken('https://x/me?fields=id')).toBe('https://x/me?fields=id');
  });
});

describe('redactDeep', () => {
  it('redacts tokens nested inside paging.next of a parsed response', () => {
    const raw = {
      data: [{ id: '1' }],
      paging: { next: 'https://graph.instagram.com/v22.0/17841/media?access_token=IGQVJREALTOKEN&after=X' },
    };
    const out = redactDeep(raw) as typeof raw;
    expect(out.paging.next).toContain('access_token=***REDACTED***');
    expect(out.paging.next).not.toContain('IGQVJREALTOKEN');
    expect(out.data[0].id).toBe('1'); // non-token data preserved
  });
  it('handles arrays and null/number/boolean without throwing', () => {
    expect(redactDeep([1, null, true, 'access_token=Z'])).toEqual([1, null, true, 'access_token=***REDACTED***']);
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
  it('rejects tab/newline/CR-laced paths (URL parser strips them to //)', () => {
    expect(isSafeReturnTo('/\t/evil.com')).toBe(false);
    expect(isSafeReturnTo('/\n//evil.com')).toBe(false);
    expect(isSafeReturnTo('/\r/evil.com')).toBe(false);
    expect(isSafeReturnTo('/ /evil.com')).toBe(false);
  });
  it('rejects null and empty', () => {
    expect(isSafeReturnTo(null)).toBe(false);
    expect(isSafeReturnTo('')).toBe(false);
  });
});
