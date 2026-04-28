/**
 * X-Hub-Signature-256 validator for WhatsApp webhooks.
 *
 * Meta signs every webhook POST body with HMAC-SHA256 using the app
 * secret from the Meta dashboard. We MUST verify it before trusting
 * any payload — otherwise anyone can hit our webhook URL and spoof
 * inbound messages.
 *
 * The signature header looks like:  `sha256=<hex>`
 *
 * CRITICAL: verify against the EXACT raw request body bytes — any
 * normalisation (JSON.parse + JSON.stringify) breaks the HMAC.
 */

import crypto from 'node:crypto';

export interface VerifySignatureResult {
  valid: boolean;
  reason?: string;
}

export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret = process.env.WHATSAPP_APP_SECRET
): VerifySignatureResult {
  // Trim defensively — Vercel CLI sometimes persists env values with a
  // trailing newline, which would silently break HMAC parity (every
  // signature would be 'mismatch') without any obvious clue.
  appSecret = (appSecret || '').trim();
  if (!appSecret) {
    return { valid: false, reason: 'WHATSAPP_APP_SECRET not configured' };
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'missing X-Hub-Signature-256 header' };
  }

  const [algo, provided] = signatureHeader.split('=');
  if (algo !== 'sha256' || !provided) {
    return { valid: false, reason: `unsupported signature format: ${signatureHeader}` };
  }

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  // timing-safe compare — buffers must be same length
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length) {
    return { valid: false, reason: 'signature length mismatch' };
  }
  const ok = crypto.timingSafeEqual(a, b);
  return ok ? { valid: true } : { valid: false, reason: 'signature mismatch' };
}
