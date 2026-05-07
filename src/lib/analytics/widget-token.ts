/**
 * HMAC-signed widget tokens. Issued by /api/widget/config and verified by
 * /api/analytics/widget. Scopes a cross-origin analytics ingest call to a
 * specific account so a flood from one domain can't pollute another's data.
 *
 * Format: `${b64url(payload)}.${b64url(hmac_sha256(payload))}`
 *
 * Payload: { a: accountId, e: expiresAtMs }
 *
 * Note: NOT a JWT (no `alg`/`typ` headers). We control both ends so the
 * minimal envelope is fine. Validity is 24h; widget refreshes each load.
 */

import crypto from 'node:crypto';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret =
    process.env.ANALYTICS_WIDGET_SECRET ||
    process.env.IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('ANALYTICS_WIDGET_SECRET not configured');
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

export function signWidgetToken(accountId: string): string {
  const payload = JSON.stringify({ a: accountId, e: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = b64url(payload);
  const sig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export function verifyWidgetToken(token: string): { accountId: string } | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.', 2);
  if (!payloadB64 || !sigB64) return null;

  const expected = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  let payload: { a?: string; e?: number };
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.a || !payload.e || Date.now() > payload.e) return null;
  return { accountId: payload.a };
}
