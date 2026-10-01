/**
 * Signed identity from the association's own site.
 *
 * identify: the association's server signs memberId|email|ts with the
 * association secret; the browser passes it through. We never trust a member
 * id the browser made up.
 *
 * newsletter: a long-lived token in links from member emails, so a member who
 * clicks through arrives identified without logging in.
 */
import crypto from 'node:crypto';

export const IDENTIFY_MAX_AGE_MS = 10 * 60 * 1000;

export interface IdentifyClaims { memberId: string; email: string | null; ts: number }
export interface NewsletterClaims { memberId: string; email: string | null; expiresAt: number }

function hmac(secret: string, msg: string): Buffer {
  return crypto.createHmac('sha256', secret).update(msg).digest();
}

function claimsValid(memberId: string, email: string | null): boolean {
  if (typeof memberId !== 'string') return false;
  if (!memberId || memberId.length > 128 || memberId.includes('|')) return false;
  if (email !== null && typeof email !== 'string') return false;
  if (email !== null && (email.length > 254 || email.includes('|'))) return false;
  return true;
}

function identifyMessage(c: IdentifyClaims): string {
  return `${c.memberId}|${c.email ?? ''}|${c.ts}`;
}

export function signIdentify(secret: string, c: IdentifyClaims): string {
  return hmac(secret, identifyMessage(c)).toString('hex');
}

export function verifyIdentify(
  secret: string, c: IdentifyClaims, signature: string, now: number = Date.now(),
): 'ok' | 'bad_signature' | 'expired' | 'malformed' {
  if (typeof c.ts !== 'number' || !Number.isFinite(c.ts)) return 'malformed';
  if (!claimsValid(c.memberId, c.email)) return 'malformed';
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return 'malformed';
  if (Math.abs(now - c.ts) > IDENTIFY_MAX_AGE_MS) return 'expired';
  const expected = hmac(secret, identifyMessage(c));
  const given = Buffer.from(signature, 'hex');
  return crypto.timingSafeEqual(expected, given) ? 'ok' : 'bad_signature';
}

export function signNewsletterToken(secret: string, c: NewsletterClaims): string {
  const payload = Buffer.from(JSON.stringify({ m: c.memberId, e: c.email, x: c.expiresAt })).toString('base64url');
  return `${payload}.${hmac(secret, payload).toString('base64url')}`;
}

export function verifyNewsletterToken(secret: string, token: string, now: number = Date.now()): NewsletterClaims | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = hmac(secret, payload);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(expected, given)) return null;
  let parsed: { m?: unknown; e?: unknown; x?: unknown };
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  const memberId = typeof parsed.m === 'string' ? parsed.m : '';
  const email = typeof parsed.e === 'string' ? parsed.e : null;
  const expiresAt = typeof parsed.x === 'number' ? parsed.x : 0;
  if (!claimsValid(memberId, email) || expiresAt <= now) return null;
  return { memberId, email, expiresAt };
}
