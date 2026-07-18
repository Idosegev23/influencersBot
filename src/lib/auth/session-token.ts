/**
 * HMAC-signed session-cookie tokens for the admin + influencer dashboards.
 *
 * These cookies used to hold the literal string 'authenticated' — no signature,
 * no subject, no expiry — so anyone could forge one by hand (a single known
 * value) and read every tenant's data through the "authed" API routes. A token
 * now carries a subject + expiry signed with the server secret; a forged,
 * tampered, expired, or wrong-subject cookie fails verification and is rejected.
 *
 *   token  =  <payloadB64url>.<sigB64url>          (mirrors agent-auth.ts)
 *   payload = { v:1, sub:<subject>, exp:<unix-sec> }
 *
 * Secret resolution deliberately falls back to SUPABASE_SECRET_KEY, which is
 * always present in production (the whole app needs it), so signing/verifying
 * can never silently break and lock everyone out. agent-auth.ts already signs
 * with the same chain, so we reuse a secret that is proven-live in prod.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** Default cookie lifetime — matches the existing 7-day admin/influencer maxAge. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSecret(): string {
  const s =
    process.env.SESSION_COOKIE_SECRET ||
    process.env.AGENT_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!s) {
    throw new Error(
      'SESSION_COOKIE_SECRET (or SUPABASE_SECRET_KEY) must be set to sign session cookies',
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payload: string): string {
  return b64urlEncode(createHmac('sha256', getSecret()).update(payload).digest());
}

function verifySig(payload: string, sig: string): boolean {
  const expected = sign(payload);
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

type TokenPayload = { v: 1; sub: string; exp: number };

/** The single subject used by the global admin session cookie. */
export const ADMIN_SUBJECT = 'admin';

/** Subject for a per-username influencer session cookie. */
export function influencerSubject(username: string): string {
  return `influencer:${username}`;
}

/**
 * Create a signed session token bound to `subject`, valid for `ttlSeconds`.
 * Store this as the cookie value in place of the old literal 'authenticated'.
 */
export function signSessionToken(
  subject: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const payload: TokenPayload = {
    v: 1,
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verify a cookie value: signature valid, not expired, and bound to
 * `expectedSubject`. Accepts undefined/null so call sites can pass
 * `cookie?.value` directly. Legacy 'authenticated' strings fail here by design.
 */
export function verifySessionToken(
  token: string | undefined | null,
  expectedSubject: string,
): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!verifySig(payloadB64, sig)) return false;
  try {
    const p = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as TokenPayload;
    if (p.v !== 1) return false;
    if (p.sub !== expectedSubject) return false;
    if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
