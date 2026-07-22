// Best-effort phone verification (spec §8, D4). Reveal-when-absent:
// no phone on the order → allow; phone present → require a normalized match.
import { toWaId } from '@/lib/whatsapp-cloud/client';

export function phoneMatches(orderPhone: string | null | undefined, senderWaId: string): boolean {
  if (!orderPhone || !orderPhone.trim()) return true; // guest checkout / no phone → reveal
  return toWaId(orderPhone) === toWaId(senderWaId);
}
