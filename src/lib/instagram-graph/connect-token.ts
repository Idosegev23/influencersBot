/**
 * HMAC-signed Instagram connect tokens.
 *
 * `/api/auth/instagram/connect` used to take a raw `?accountId=<uuid>` from
 * anyone. While the app was Development-mode / tester-only that was mostly
 * theoretical. Once `instagram_business_manage_messages` got Advanced Access
 * (App Review, 2026-08-08) any member of the public can complete the OAuth
 * round-trip — so a guessed or leaked accountId lets an attacker attach THEIR
 * Instagram to someone else's account and start receiving that tenant's DMs.
 *
 * The connect route now accepts only a token minted server-side, after the
 * caller proved they are an admin or the influencer who owns the account.
 *
 * Format mirrors widget-token.ts / session-token.ts:
 *   token   = `${b64url(payload)}.${b64url(hmac_sha256(payload))}`
 *   payload = { v: 1, a: accountId, e: expiresAtMs }
 *
 * Secret chain matches session-token.ts on purpose — those fall back to
 * SUPABASE_SECRET_KEY, which is always present in production, so signing can
 * never silently break and strand the connect flow.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** Links get shared with influencers over WhatsApp/email — they need to survive a few days. */
export const CONNECT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const s =
    process.env.SESSION_COOKIE_SECRET ||
    process.env.AGENT_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!s) {
    throw new Error(
      'SESSION_COOKIE_SECRET (or SUPABASE_SECRET_KEY) must be set to sign Instagram connect links',
    );
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signConnectToken(accountId: string, ttlMs: number = CONNECT_TOKEN_TTL_MS): string {
  const payload = b64url(JSON.stringify({ v: 1, a: accountId, e: Date.now() + ttlMs }));
  const sig = createHmac('sha256', getSecret()).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
}

/** Returns the accountId the token was minted for, or null if forged/tampered/expired. */
export function verifyConnectToken(token: string | null | undefined): { accountId: string } | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.', 2);
  if (!payloadB64 || !sigB64) return null;

  const expected = createHmac('sha256', getSecret()).update(payloadB64).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  // Compare lengths first — timingSafeEqual throws on a length mismatch.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: { v?: number; a?: string; e?: number };
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (payload.v !== 1 || !payload.a || !payload.e) return null;
  if ((payload as { p?: string }).p !== undefined) return null; // an OAuth state is not a connect link
  if (Date.now() > payload.e) return null;
  return { accountId: payload.a };
}

// ─── OAuth `state` ──────────────────────────────────────────────────────────
//
// /connect verified the signed connect token, but the accountId then rode to
// /callback inside plain-JSON `state` — which the browser carries and anyone can
// write by hand when starting Instagram OAuth themselves. The callback linked
// whatever accountId that JSON named (and deactivated that account's existing
// connection). The state is now signed the same way, tagged so it can never be
// replayed as a connect link (or vice versa), and short-lived: it only has to
// survive one consent screen.

export const OAUTH_STATE_TTL_MS = 30 * 60 * 1000;
const OAUTH_STATE_PURPOSE = 'ig_oauth_state';

function signPayload(obj: Record<string, unknown>): string {
  const payload = b64url(JSON.stringify(obj));
  return `${payload}.${b64url(createHmac('sha256', getSecret()).update(payload).digest())}`;
}

export function signOAuthState(
  s: { accountId: string; returnTo?: string },
  ttlMs: number = OAUTH_STATE_TTL_MS,
): string {
  return signPayload({ v: 1, p: OAUTH_STATE_PURPOSE, a: s.accountId, r: s.returnTo || '', e: Date.now() + ttlMs });
}

/** The account + returnTo a state was minted for, or null if unsigned/forged/tampered/expired. */
export function verifyOAuthState(
  state: string | null | undefined,
): { accountId: string; returnTo: string } | null {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [payloadB64, sigB64] = state.split('.', 2);
  if (!payloadB64 || !sigB64) return null;

  const expected = createHmac('sha256', getSecret()).update(payloadB64).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: { v?: number; p?: string; a?: string; r?: string; e?: number };
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (payload.v !== 1 || payload.p !== OAUTH_STATE_PURPOSE || !payload.a || !payload.e) return null;
  if (Date.now() > payload.e) return null;
  return { accountId: payload.a, returnTo: typeof payload.r === 'string' ? payload.r : '' };
}
