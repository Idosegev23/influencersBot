import { describe, it, expect } from 'vitest';
import {
  signIdentify, verifyIdentify, signNewsletterToken, verifyNewsletterToken, IDENTIFY_MAX_AGE_MS,
} from '@/lib/copilot/signature';

const S = 'assoc-secret';
const NOW = 1_800_000_000_000;

describe('identify signature', () => {
  const c = { memberId: 'M-1001', email: 'jane@greyhound.com', ts: NOW };
  it('accepts a fresh, correct signature', () => {
    expect(verifyIdentify(S, c, signIdentify(S, c), NOW)).toBe('ok');
  });
  it('accepts a null email signed as empty', () => {
    const n = { ...c, email: null };
    expect(verifyIdentify(S, n, signIdentify(S, n), NOW)).toBe('ok');
  });
  it('rejects a signature for different claims or another secret', () => {
    const sig = signIdentify(S, c);
    expect(verifyIdentify(S, { ...c, email: 'other@x.com' }, sig, NOW)).toBe('bad_signature');
    expect(verifyIdentify(S, { ...c, memberId: 'M-1002' }, sig, NOW)).toBe('bad_signature');
    expect(verifyIdentify('other', c, sig, NOW)).toBe('bad_signature');
  });
  it('rejects stale and far-future timestamps', () => {
    const old = { ...c, ts: NOW - IDENTIFY_MAX_AGE_MS - 1 };
    const fut = { ...c, ts: NOW + IDENTIFY_MAX_AGE_MS + 1 };
    expect(verifyIdentify(S, old, signIdentify(S, old), NOW)).toBe('expired');
    expect(verifyIdentify(S, fut, signIdentify(S, fut), NOW)).toBe('expired');
  });
  it('rejects malformed input', () => {
    expect(verifyIdentify(S, { ...c, memberId: '' }, 'ab', NOW)).toBe('malformed');
    expect(verifyIdentify(S, c, 'not-hex', NOW)).toBe('malformed');
    expect(verifyIdentify(S, { ...c, memberId: 'a|b' }, signIdentify(S, c), NOW)).toBe('malformed');
  });
});

describe('newsletter token', () => {
  const c = { memberId: 'M-7', email: null, expiresAt: NOW + 1000 };
  it('round-trips', () => {
    expect(verifyNewsletterToken(S, signNewsletterToken(S, c), NOW)).toEqual(c);
  });
  it('rejects expired, tampered and foreign tokens', () => {
    const t = signNewsletterToken(S, c);
    expect(verifyNewsletterToken(S, t, NOW + 2000)).toBeNull();
    expect(verifyNewsletterToken('other', t, NOW)).toBeNull();
    const [p, s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ m: 'M-8', e: null, x: NOW + 1000 })).toString('base64url');
    expect(verifyNewsletterToken(S, `${forged}.${s}`, NOW)).toBeNull();
    expect(verifyNewsletterToken(S, p, NOW)).toBeNull();
    expect(verifyNewsletterToken(S, '', NOW)).toBeNull();
  });
});
