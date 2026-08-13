// Spec §1 (2026-08-12-bestie-cs-engine-design.md): identity as a parameter, with a trust level.
// `trust` is the load-bearing field — tools branch on trust, never on channel, so a future
// channel declares its trust level instead of adding a special case. On WhatsApp Meta
// guarantees the sender controls the number; everywhere else a phone is a CLAIM.
export type CsChannel = 'whatsapp' | 'instagram' | 'widget' | 'web_chat';

export type CsIdentity =
  | { channel: 'whatsapp';  waId: string;                       trust: 'channel_verified' }
  | { channel: 'instagram'; igsid: string;     phone?: string;  trust: 'unverified' | 'phone_claimed' }
  | { channel: 'widget';    visitorId: string; phone?: string;  trust: 'unverified' | 'phone_claimed' }
  | { channel: 'web_chat';  sessionId: string; phone?: string;  trust: 'unverified' | 'phone_claimed' };

/** The phone this identity is entitled to search/verify with. Meta-verified on WhatsApp; a CLAIM elsewhere. */
export function identityPhone(id: CsIdentity): string | null {
  if (id.channel === 'whatsapp') return id.waId;
  return id.phone?.trim() || null;
}

/** The (channel, channel_user_id) session key (spec §8). */
export function identityKey(id: CsIdentity): { channel: CsChannel; channelUserId: string } {
  switch (id.channel) {
    case 'whatsapp':  return { channel: 'whatsapp',  channelUserId: id.waId };
    case 'instagram': return { channel: 'instagram', channelUserId: id.igsid };
    case 'widget':    return { channel: 'widget',    channelUserId: id.visitorId };
    case 'web_chat':  return { channel: 'web_chat',  channelUserId: id.sessionId };
  }
}

export function whatsappIdentity(waId: string): CsIdentity {
  return { channel: 'whatsapp', waId, trust: 'channel_verified' };
}

/** support_requests.source per channel (spec §8). */
export function ticketSourceFor(id: CsIdentity): string {
  switch (id.channel) {
    case 'whatsapp':  return 'whatsapp_cs';
    case 'instagram': return 'instagram_cs';
    case 'widget':    return 'widget_cs';
    case 'web_chat':  return 'web_cs';
  }
}

/** Every CS source across channels — thread listings match a person, not a channel (spec §8). */
export const CS_TICKET_SOURCES = ['whatsapp_cs', 'instagram_cs', 'widget_cs', 'web_cs'];

/**
 * Lazy identity (spec §7): apply a claimed phone (just typed, or stored on the session) to a
 * claimed-trust identity. WhatsApp identities pass through untouched — Meta already vouches.
 */
export function withClaimedPhone(id: CsIdentity, phone: string | null | undefined): CsIdentity {
  if (id.channel === 'whatsapp') return id;
  const clean = phone?.trim();
  if (!clean) return id;
  return { ...id, phone: clean, trust: 'phone_claimed' };
}
