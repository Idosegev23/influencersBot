import { resolveChannelByPhoneNumberId, type WaChannel } from '@/lib/whatsapp-cloud/channels';

export type InboundClass =
  | { kind: 'bestie';   channel: WaChannel; boundAccountId: null }
  | { kind: 'customer'; channel: WaChannel; boundAccountId: string }
  | { kind: 'unknown';  channel: null;      boundAccountId: null };

/**
 * Spec §6 — the first decision moves from SENDER to NUMBER.
 *
 * Bestie's own number keeps the existing 5-branch routing (Itamar / agents / open
 * tickets / leads / CS). Any other known number is a single-tenant customer channel
 * whose account is bound structurally: no tool on that path exposes an account
 * selector, so cross-tenant leakage is impossible by construction rather than by check.
 *
 * An unknown number resolves to 'unknown' rather than throwing — the webhook must
 * still answer 200 or Meta retries the delivery forever.
 */
export async function classifyInbound(
  phoneNumberId: string,
  bestieAccountId: string | undefined,
): Promise<InboundClass> {
  const channel = await resolveChannelByPhoneNumberId(phoneNumberId);
  if (!channel) return { kind: 'unknown', channel: null, boundAccountId: null };
  // Guard the undefined case explicitly: without it, an unset BESTIE_ACCOUNT_ID would
  // make every channel with a null accountId look like Bestie's.
  if (bestieAccountId && channel.accountId === bestieAccountId) {
    return { kind: 'bestie', channel, boundAccountId: null };
  }
  return { kind: 'customer', channel, boundAccountId: channel.accountId };
}
