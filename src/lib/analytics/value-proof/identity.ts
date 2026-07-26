/**
 * Identity keys used to join a conversation to an order or cart.
 *
 * Phone normalization is NOT reimplemented here — it delegates to `toWaId`,
 * the normalizer already used by order lookup via `phoneMatches`
 * (`src/lib/orders/phone-verify.ts`). One rule set, one place.
 */
import { toWaId } from '@/lib/whatsapp-cloud/client';

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!/\d/.test(raw)) return null;
  const waId = toWaId(raw);
  return waId ? waId : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}
