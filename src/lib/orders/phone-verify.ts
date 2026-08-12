// Best-effort phone verification (spec §8, D4). Reveal-when-absent:
// no phone on the order → allow; phone present → require a normalized match.
import { toWaId } from '@/lib/whatsapp-cloud/client';
import { identityPhone, type CsIdentity } from '@/lib/cs/identity';

export function phoneMatches(orderPhone: string | null | undefined, senderWaId: string): boolean {
  if (!orderPhone || !orderPhone.trim()) return true; // guest checkout / no phone → reveal
  return toWaId(orderPhone) === toWaId(senderWaId);
}

export type OrderAccessVerdict = 'ok' | 'mismatch' | 'identity_required' | 'escalate';

/**
 * Trust-gated order access (spec §2 of the CS-engine design, 2026-08-12). Reveal-when-absent
 * applies ONLY to channel_verified (Meta vouches for the sender). A claimed phone must match a
 * phone the order actually carries; a no-phone order under a claim ESCALATES instead of revealing.
 * This is an access control, not a prompt suggestion — it runs whether or not the model cooperates.
 */
export function verifyOrderAccess(orderPhone: string | null | undefined, identity: CsIdentity): OrderAccessVerdict {
  const phone = identityPhone(identity);
  if (identity.trust === 'channel_verified') {
    return phoneMatches(orderPhone, phone!) ? 'ok' : 'mismatch';
  }
  if (!phone) return 'identity_required';
  if (!orderPhone || !orderPhone.trim()) return 'escalate';
  return phoneMatches(orderPhone, phone) ? 'ok' : 'mismatch';
}
