/**
 * Partner API keys and tenant host handling for the Co-Pilot partner API.
 * Keys are shown once at creation; only the SHA-256 hash is stored.
 */
import crypto from 'node:crypto';

export const KEY_PREFIX = 'cpk_';

export function hashPartnerKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generatePartnerKey(): { plaintext: string; hash: string } {
  const plaintext = KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { plaintext, hash: hashPartnerKey(plaintext) };
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  return m[1].startsWith(KEY_PREFIX) ? m[1] : null;
}

export function normalizeHost(raw: string | null): string | null {
  if (!raw) return null;
  const h = raw.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(h)) return null;
  if (h === 'localhost') return h;
  return h.includes('.') ? h : null;
}
