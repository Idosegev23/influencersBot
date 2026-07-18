// Guards the HMAC session-cookie tokens that replaced the forgeable literal
// 'authenticated' value on the admin + influencer session cookies.
process.env.SESSION_COOKIE_SECRET = 'test-secret-for-session-token-unit';

import { describe, it, expect } from 'vitest';
import {
  signSessionToken,
  verifySessionToken,
  ADMIN_SUBJECT,
  influencerSubject,
} from '@/lib/auth/session-token';

describe('session-token', () => {
  it('accepts a freshly signed token for the same subject', () => {
    const t = signSessionToken(ADMIN_SUBJECT);
    expect(verifySessionToken(t, ADMIN_SUBJECT)).toBe(true);
  });

  it('rejects the old forgeable literal value', () => {
    expect(verifySessionToken('authenticated', ADMIN_SUBJECT)).toBe(false);
  });

  it('rejects a token minted for a different subject', () => {
    const t = signSessionToken(influencerSubject('argania'));
    expect(verifySessionToken(t, influencerSubject('reutlev'))).toBe(false);
    expect(verifySessionToken(t, ADMIN_SUBJECT)).toBe(false);
    // ...but works for the exact subject it was minted for
    expect(verifySessionToken(t, influencerSubject('argania'))).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const t = signSessionToken(ADMIN_SUBJECT);
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, sub: ADMIN_SUBJECT, exp: 9999999999 }), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(verifySessionToken(`${forged}.${sig}`, ADMIN_SUBJECT)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const t = signSessionToken(ADMIN_SUBJECT);
    const [payload] = t.split('.');
    expect(verifySessionToken(`${payload}.deadbeef`, ADMIN_SUBJECT)).toBe(false);
  });

  it('rejects an expired token', () => {
    const t = signSessionToken(ADMIN_SUBJECT, -10); // already expired
    expect(verifySessionToken(t, ADMIN_SUBJECT)).toBe(false);
  });

  it('rejects empty / malformed input', () => {
    expect(verifySessionToken(undefined, ADMIN_SUBJECT)).toBe(false);
    expect(verifySessionToken(null, ADMIN_SUBJECT)).toBe(false);
    expect(verifySessionToken('', ADMIN_SUBJECT)).toBe(false);
    expect(verifySessionToken('no-dot-here', ADMIN_SUBJECT)).toBe(false);
    expect(verifySessionToken('.onlysig', ADMIN_SUBJECT)).toBe(false);
  });
});
